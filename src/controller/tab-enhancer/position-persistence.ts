/**
 * MDRazor — MD 文档光标和滚轴位置持久化
 *
 * 记录每个 Markdown 文档的光标位置与滚动位置；重新打开文档时还原。
 *
 * ── 追踪 ──
 *   - 光标：CM6 ViewPlugin 在 selectionSet / docChanged 时读取主选区
 *   - 滚动：view.scrollDOM 的 scroll 事件
 *   - 变更防抖 250ms（trailing）：连续变更刷新计时，变更停止后一次性写入最终位置
 *   - 编辑器销毁时若有未落盘变更立即保存（切标签 / 关页不丢末位）
 *
 * ── 恢复 ──
 *   不依赖 ViewPlugin 构造时机（构造时 DOM 可能未挂载、叶子复用时不重建），
 *   在 update() 检测到整档内容加载（首次打开 / 切换文件）时恢复：
 *   从 [data-path] 解析文件路径，命中记录则还原光标 + 滚动位置，
 *   再以还原后的位置为基础继续监测新变动。
 *
 * ── 持久化 ──
 *   独立缓存文件 .obsidian/md-razor-position-cache.json（与用户设置 data.json 分离），
 *   位于 .obsidian 配置目录而非插件目录：卸载重装插件后记录仍保留，不随插件目录删除。
 *   磁盘写入节流 ~1s，插件卸载时 flush。
 *   镜像兑底（插件目录 md-razor-position-cache.mirror.json）：
 *   .obsidian 配置目录下的缓存文件可能被同步 / 备份 / 清理工具触碰
 *   （删除、损坏、截断），因此在插件目录保留延迟快照（首次 10 分钟、
 *   之后≥10 分钟一次；卸载 / 清理时立即同步）：
 *   - 主缓存存在且合法 → 镜像不参与（不补洞：缺失键大多来自合法清理，
 *     回填会让已删记录复活）；
 *   - 主缓存缺失 / 损坏 → 镜像整体恢复，载入完成后回写主文件自愈；
 *   - 镜像读取失败一律按「无镜像」处理，绝不影响正常加载。
 *   旧版本缓存在插件目录（.obsidian/plugins/MDRazor/position-cache.json）：
 *   新位置不存在时回退读取旧位置并自动迁移（写入新文件成功即切换，
 *   旧文件保留不再读取；迁移失败则继续使用旧文件，下次加载再试迁移）。
 *   文件夹重命名时同步改写缓存中的路径前缀，旧路径记录不丢失。
 */

import {
	type App,
	type DataAdapter,
	MarkdownView,
	type Plugin,
	TFile,
	TFolder,
} from 'obsidian';
import { type EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

/** 变更停止后延迟记录的时间（ms） */
const CHANGE_DEBOUNCE_MS = 250;
/** 内存记录 → 磁盘写入的节流间隔（ms） */
const DISK_DEBOUNCE_MS = 1000;
/** 恢复滚动位置的最大重试帧数（长文档布局分帧完成） */
const MAX_SCROLL_RETRY = 8;
/** 旧版本缓存文件名（位于插件目录，仅用于迁移） */
const CACHE_FILE = 'position-cache.json';
/** 缓存文件名（位于 .obsidian 配置目录；带插件命名空间避免与其他插件冲突） */
const VAULT_CACHE_FILE = 'md-razor-position-cache.json';
/** 镜像文件名（位于插件目录，主缓存丢失/损坏时的恢复兑底） */
const MIRROR_FILE = 'md-razor-position-cache.mirror.json';
/** 载入后首次写镜像的延迟（ms）：镜像允许略旧，避免每次落盘都双写 */
const MIRROR_DELAY_MS = 10 * 60 * 1000;
/** 之后每次写镜像的最小间隔（ms）：10 分钟 */
const MIRROR_MIN_INTERVAL_MS = 10 * 60 * 1000;

/** 光标位置，line 0 基（与 Obsidian EditorPosition 一致） */
interface CursorPos {
	line: number;
	ch: number;
}

interface PositionRecord {
	cursor: CursorPos;
	scrollTop: number;
	scrollLeft: number;
	updated: number;
}

type PositionCache = Record<string, PositionRecord>;

/* ------------------------------------------------------------------ */
/*  磁盘缓存（模块级单例）                                              */
/* ------------------------------------------------------------------ */

let adapterRef: DataAdapter | null = null;
let filePathRef = '';
let mirrorPathRef = '';
let cache: PositionCache = {};
let dirty = false;
let diskTimer: number | null = null;
let mirrorTimer: number | null = null;
/** 上次写镜像时间（节流用） */
let lastMirrorAt = 0;
/** 磁盘缓存是否已从磁盘载入；载入完成前禁止落盘，避免异步载入与
 *  编辑器追踪并发时把真实缓存覆盖成部分/空数据（重启后缓存被清空的根因） */
let loaded = false;

/** 立即写镜像快照（尽力而为，失败仅记日志） */
async function flushMirrorNow(): Promise<void> {
	if (!adapterRef || !mirrorPathRef || !loaded) return;
	try {
		await adapterRef.write(mirrorPathRef, JSON.stringify(cache, null, 2));
		lastMirrorAt = Date.now();
	} catch (err) {
		console.error('[MDRazor] 位置缓存镜像写入失败（不影响主文件）', err);
	}
}

/** 节流调度镜像快照：有 pending 则不重复调度；首次写镜像延迟 MIRROR_DELAY_MS，
 *  避免启动阶段额外 IO，也让镜像保持「略旧于主文件」的快照语义 */
function scheduleMirrorWrite(): void {
	if (!loaded || !mirrorPathRef) return;
	if (mirrorTimer !== null) return;
	const wait =
		lastMirrorAt === 0
			? MIRROR_DELAY_MS
			: Math.max(0, MIRROR_MIN_INTERVAL_MS - (Date.now() - lastMirrorAt));
	mirrorTimer = window.setTimeout(() => {
		mirrorTimer = null;
		void flushMirrorNow();
	}, wait);
}

function scheduleDiskWrite(): void {
	dirty = true;
	// 载入完成前只标记脏，不调度落盘：此时 flushDisk 若写入会用未合并的
	// 部分数据覆盖磁盘上完整的 position-cache.json。载入完成后会补一次 flush。
	if (!loaded) return;
	if (diskTimer !== null) return;
	diskTimer = window.setTimeout(() => {
		diskTimer = null;
		if (!dirty) return;
		dirty = false;
		void flushDisk();
	}, DISK_DEBOUNCE_MS);
}

/** 立即把内存缓存写入磁盘，并同步一次镜像快照（卸载 / 关闭编辑器时调用，尽力而为） */
function flushNow(): void {
	if (diskTimer !== null) {
		window.clearTimeout(diskTimer);
		diskTimer = null;
	}
	if (mirrorTimer !== null) {
		window.clearTimeout(mirrorTimer);
		mirrorTimer = null;
	}
	if (dirty) {
		dirty = false;
		void flushDisk();
	}
	// 卸载边界补一次镜像快照，缩小镜像滞后窗口
	void flushMirrorNow();
}

/**
 * 清空位置缓存（「清理本地数据」弹窗用）。
 *
 * 清空内存记录并取消待落盘标记，然后主动写一次空缓存到当前目标文件，
 * 防止残存的脏标记 / 下次 flush 把旧记录写回；同时保证新位置文件存在，
 * 下次加载不会回退到旧位置把已清理的数据迁移回来。
 * 镜像同步覆盖：镜像里也可能残留旧记录，立即覆盖防止恢复路径复活。
 */
export function resetPositionCache(): void {
	cache = {};
	dirty = false;
	if (diskTimer !== null) {
		window.clearTimeout(diskTimer);
		diskTimer = null;
	}
	void flushDisk();
	// 同步覆盖镜像：清空后镜像里也可能残留旧记录，立即覆盖防止恢复路径复活
	if (mirrorTimer !== null) {
		window.clearTimeout(mirrorTimer);
		mirrorTimer = null;
	}
	void flushMirrorNow();
}

async function flushDisk(): Promise<void> {
	if (!adapterRef || !filePathRef || !loaded) return;
	try {
		await adapterRef.write(filePathRef, JSON.stringify(cache, null, 2));
	} catch (err) {
		console.error('[MDRazor] 位置缓存写入失败', err);
	}
}

function setRecord(path: string, rec: PositionRecord): void {
	cache[path] = rec;
	scheduleDiskWrite();
}

/** 文件夹重命名：把缓存中以旧路径为前缀的键改写为新路径（含所有后代文件） */
function rewriteFolderPrefix(oldPath: string, newPath: string): void {
	if (oldPath === newPath) return;
	const prefix = oldPath + '/';
	let changed = false;
	for (const key of Object.keys(cache)) {
		if (key.startsWith(prefix)) {
			const rec = cache[key];
			if (!rec) continue;
			// prefix 含末尾 '/'，slice 掉的 rest 不含 '/'，拼回时需补回
			const newKey = newPath + '/' + key.slice(prefix.length);
			cache[newKey] = rec;
			delete cache[key];
			changed = true;
		}
	}
	if (changed) {
		scheduleDiskWrite();
	}
}

/** 载入缓存并清理 vault 中已不存在文件的记录 */
async function loadCache(plugin: Plugin): Promise<void> {
	adapterRef = plugin.app.vault.adapter;
	// manifest.dir = 实际插件文件夹路径（插件目录名可能与 id 不一致，如 id=md-razor / 目录=MDRazor）
	const pluginDir =
		plugin.manifest.dir ?? `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}`;
	const pluginFile = `${pluginDir}/${CACHE_FILE}`;
	const vaultFile = `${plugin.app.vault.configDir}/${VAULT_CACHE_FILE}`;
	mirrorPathRef = `${pluginDir}/${MIRROR_FILE}`;

	// 优先沿用 .obsidian 下缓存（卸载重装插件后记录仍保留）；
	// 新位置不存在时才回退读取插件目录的旧缓存，载入后迁移过去。
	let diskCache: PositionCache = {};
	let fromVault = false;
	let readFromPlugin = false;
	let mainBroken = false;
	try {
		let raw: unknown = null;
		if (await adapterRef.exists(vaultFile)) {
			fromVault = true;
			raw = JSON.parse(await adapterRef.read(vaultFile)) as unknown;
		} else if (await adapterRef.exists(pluginFile)) {
			readFromPlugin = true;
			raw = JSON.parse(await adapterRef.read(pluginFile)) as unknown;
		}
		// 标量 JSON（null / 数字 / 字符串）此前会以 raw 原样逃过 catch，把 null
		// 写入模块级缓存，后续 Object.keys(cache) 抛 TypeError 使 onload 失败
		//（用户报告的「重启后插件加载失败」）。此处统一按空缓存处理；
		// 文件存在但内容不可用时同时标记损坏，让下方镜像恢复介入。
		if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
			diskCache = {};
			if (fromVault || readFromPlugin) mainBroken = true;
		} else if ('positions' in raw) {
			// 兼容两种落盘格式：早期 {positions:{}} 包裹，以及当前平铺 {path: record}
			diskCache = (raw as { positions?: PositionCache }).positions ?? {};
		} else {
			diskCache = raw as PositionCache;
		}
	} catch {
		diskCache = {};
		mainBroken = true;
	}

	// 镜像兑底（仅恢复，不补洞）：主缓存缺失（被同步/清理工具删除）或损坏
	// （截断 / 非法 JSON）时，从插件目录镜像整体恢复；主文件存在且合法
	// （哪怕为空）时绝不从镜像回填——位置缓存的“缺失键”大多来自合法的
	// 清理/修剪，回填会让已删记录复活（与「清理本地数据」语义冲突）。
	if (!fromVault || mainBroken) {
		try {
			if (await adapterRef.exists(mirrorPathRef)) {
				const parsed = JSON.parse(await adapterRef.read(mirrorPathRef)) as unknown;
				if (
					parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) &&
					Object.keys(parsed).length > 0
				) {
					diskCache = parsed as PositionCache;
					console.warn('[MDRazor] 主位置缓存缺失或损坏，已从镜像恢复', vaultFile);
				}
			}
		} catch (err) {
			console.error('[MDRazor] 位置缓存镜像读取失败，按无镜像处理', err);
		}
	}

	// 合并 async 载入期间（adapter.read 完成前）编辑器已追踪写入的新记录，
	// 避免整体替换缓存对象时把这些窗口期记录丢弃。
	for (const key of Object.keys(cache)) {
		const rec = cache[key];
		if (rec) diskCache[key] = rec;
	}
	cache = diskCache;
	loaded = true;

	// 清理 vault 中已不存在文件的记录（记录为当前打开文件时不会被误删）。
	// 仅当 vault 文件索引已就绪时才清理：启动早期（onload 期间）索引尚未填充时
	// getAbstractFileByPath 会全部返回 null，此时清理会把全部记录误删、再落盘成
	// 空文件（这是「重启后缓存被清空」的另一潜在根因）。索引未就绪时跳过清理，
	// 保留旧记录，待下一次正常落盘（用户编辑触发 flush）时再一并净化。
	let pruned = false;
	try {
		const vaultReady = plugin.app.vault.getFiles().length > 0;
		if (vaultReady) {
			for (const path of Object.keys(cache)) {
				if (!(plugin.app.vault.getAbstractFileByPath(path) instanceof TFile)) {
					delete cache[path];
					pruned = true;
				}
			}
		}
	} catch (err) {
		console.error('[MDRazor] 位置缓存清理失败，跳过本次清理', err);
	}

	// 迁移旧缓存到 .obsidian：写入新文件成功即切换（单真相源由「新位置存在时
	// 优先」保证，旧文件保留在插件目录、之后不再被读取，卸载插件时一并删除；
	// 不主动删除旧文件，避免删除失败导致本次会话回退到插件目录）。
	// 写失败则继续用插件目录文件（当前会话照常读写），下次加载再试迁移。
	if (fromVault && !mainBroken) {
		filePathRef = vaultFile;
	} else if (readFromPlugin) {
		try {
			await adapterRef.write(vaultFile, JSON.stringify(cache, null, 2));
			filePathRef = vaultFile;
		} catch (err) {
			console.error('[MDRazor] 位置缓存迁移失败，继续使用插件目录缓存', err);
			filePathRef = pluginFile;
		}
	} else {
		filePathRef = vaultFile;
	}

	// 载入完成：补写窗口期累积的脏标记（此时 flushDisk 已允许落盘），
	// 并调度首次镜像快照（内部有延迟与节流）
	if (pruned || dirty) {
		scheduleDiskWrite();
	}
	scheduleMirrorWrite();

	// 主缓存缺失/损坏时的自愈：载入已完成（合并+清理后）才回写主文件，
	// 避免把载入窗口期的部分数据当作最终状态写入（覆盖竞态，2.4.6 同类问题）；
	// 写失败时主文件仍处于缺失/损坏态，后续每次落盘都会继续自愈。
	if (!fromVault || mainBroken) {
		void flushDisk();
	}
}

/* ------------------------------------------------------------------ */
/*  CM6 ViewPlugin：追踪 + 恢复                                        */
/* ------------------------------------------------------------------ */

/**
 * 解析编辑器所属 Markdown 文件的路径。
 *
 * 不依赖 DOM data-path 属性（跨 Obsidian 版本归属不稳定），
 * 改为按叶子视图定位：找到包含此编辑器 DOM 的 markdown 叶子，
 * 取该视图的 file.path。
 */
function resolvePath(app: App, view: EditorView): string | null {
	try {
		for (const leaf of app.workspace.getLeavesOfType('markdown')) {
			const mdView = leaf.view;
			// 叶子视图切换 / 卸载期间 view 可能为 null 或 DOM 未就绪
			if (!(mdView instanceof MarkdownView)) continue;
			const inContent = mdView.contentEl?.contains(view.dom) ?? false;
			const inContainer = mdView.containerEl?.contains(view.dom) ?? false;
			if (inContent || inContainer) {
				return mdView.file?.path ?? null;
			}
		}
	} catch {
		// 视图切换期间 DOM 可能不完整，本次跳过
	}
	return null;
}

/** 判断本次 docChanged 是否为整档内容加载（区别于普通编辑） */
function isFullDocReplace(update: ViewUpdate): boolean {
	const oldLen = update.startState.doc.length;
	if (oldLen === 0) return true; // 空文档首次加载
	let from = oldLen;
	let to = -1;
	update.changes.iterChanges((fromA, toA) => {
		if (fromA < from) from = fromA;
		if (toA > to) to = toA;
	});
	return from === 0 && to === oldLen;
}

/**
 * 创建位置持久化的 CM6 ViewPlugin。
 * 每个编辑器一个实例：整档加载时恢复，之后追踪光标/滚动变更并防抖落盘。
 */
function createPositionPlugin(app: App, enabled: () => boolean) {
	return ViewPlugin.fromClass(
		class {
			private timer: number | null = null;
			/** 最近一次已尝试恢复的文件路径，路径变化 / 整档加载时重新恢复 */
			private lastRestoredPath: string | null = null;
			private win: Window;

			constructor(private view: EditorView) {
				this.win = view.dom.ownerDocument.defaultView ?? window;
				view.scrollDOM.addEventListener('scroll', this.onScroll, {
					passive: true,
				});
				// Obsidian 常把文档内容直接写进初始 state（无 docChanged 事务），
				// 此时 update() 的整档加载检测不触发。构造后等 DOM 挂载完成
				// （此前后缀 view-content 才可解析路径）补一次恢复。
				// 叶子复用切换文件（不重建实例）仍由 update() 兜底。
				this.win.requestAnimationFrame(() => this.onDocumentLoaded());
			}

			update(update: ViewUpdate) {
				if (update.docChanged) {
					this.onDocumentLoaded(update);
				}
				if (update.selectionSet || update.docChanged) {
					this.scheduleSave();
				}
			}

			destroy() {
				this.view.scrollDOM.removeEventListener('scroll', this.onScroll);
				if (this.timer !== null) {
					this.win.clearTimeout(this.timer);
					this.timer = null;
				}
				// 关闭前落盘最终位置，不等防抖计时
				this.saveNow();
			}

			/** trailing 防抖：连续变更刷新计时，停止 250ms 后记录一次 */
			private scheduleSave(): void {
				if (!enabled()) return;
				if (this.timer !== null) this.win.clearTimeout(this.timer);
				this.timer = this.win.setTimeout(() => {
					this.timer = null;
					this.saveNow();
				}, CHANGE_DEBOUNCE_MS);
			}

			private onScroll = (): void => {
				this.scheduleSave();
			};

			private saveNow(): void {
				if (!enabled()) return;
				// 每次现取路径：同一实例可能因叶子复用而切换文件
				const path = resolvePath(app, this.view);
				if (!path) return;
				const head = this.view.state.selection.main.head;
				const lineInfo = this.view.state.doc.lineAt(head);
				const scrollDOM = this.view.scrollDOM;
				setRecord(path, {
					cursor: {
						line: lineInfo.number - 1,
						ch: head - lineInfo.from,
					},
					scrollTop: scrollDOM.scrollTop,
					scrollLeft: scrollDOM.scrollLeft,
					updated: Date.now(),
				});
			}

			/** 整档内容加载（首次打开 / 切换文件 / 重载）后恢复位置 */
			private onDocumentLoaded(update?: ViewUpdate): void {
				if (!enabled()) return;
				const path = resolvePath(app, this.view);
				if (!path) return;
				// 无 update（构造后首帧）视为整档加载，直接尝试恢复
				const fullReplace = update ? isFullDocReplace(update) : true;
				// 路径已处理过且非整档加载（如普通编辑）→ 跳过
				if (path === this.lastRestoredPath && !fullReplace) {
					return;
				}
				this.lastRestoredPath = path;
				this.restorePosition(path);
			}

			private restorePosition(path: string): void {
				const rec = cache[path];
				if (!rec) return;

				// 光标 clamp 到文档范围；仅定位不滚动到光标
				const doc = this.view.state.doc;
				const targetLine = Math.max(0, Math.min(rec.cursor.line, doc.lines - 1));
				const lineInfo = doc.line(targetLine + 1);
				const targetCh = Math.max(0, Math.min(rec.cursor.ch, lineInfo.length));
				this.view.dispatch({
					selection: { anchor: lineInfo.from + targetCh },
				});

				// 内容布局稳定后恢复滚动位置（直接设 scrollDOM，避免触发光标滚动）。
				// 长文档测量可能分帧完成，校验未到位则下一帧重试。
				this.applyScrollRetry(rec, 0);
			}

			private applyScrollRetry(rec: PositionRecord, attempt: number): void {
				if (attempt > MAX_SCROLL_RETRY) return;
				const scrollDOM = this.view.scrollDOM;
				if (rec.scrollTop > 0) scrollDOM.scrollTop = rec.scrollTop;
				if (rec.scrollLeft > 0) scrollDOM.scrollLeft = rec.scrollLeft;
				this.win.requestAnimationFrame(() => {
					const settled =
						Math.abs(scrollDOM.scrollTop - rec.scrollTop) < 2 &&
						Math.abs(scrollDOM.scrollLeft - rec.scrollLeft) < 2;
					if (!settled) this.applyScrollRetry(rec, attempt + 1);
				});
			}
		},
	);
}

/* ------------------------------------------------------------------ */
/*  生命周期                                                            */
/* ------------------------------------------------------------------ */

/**
 * 注册位置持久化功能。
 *
 * 扩展无条件注册（与 registerTabEnhancer 相同模式），事件时读取
 * enabled() 决定是否记录/恢复，设置开关可即时生效。
 */
export async function registerPositionPersistence(
	plugin: Plugin,
	enabled: () => boolean,
): Promise<void> {
	// 先完成磁盘缓存载入再注册编辑器扩展，保证：
	//  1) ViewPlugin 构造后即可读到完整缓存 → 恢复位置不被跳过；
	//  2) 扩展创建的追踪写入不会与异步载入并发，从根上消除覆盖清空缓存的竞态。
	await loadCache(plugin);

	plugin.registerEditorExtension(createPositionPlugin(plugin.app, enabled));

	// 文件夹重命名：同步改写缓存中的路径前缀，避免记录随旧路径失效
	plugin.registerEvent(
		plugin.app.vault.on('rename', (file, oldPath) => {
			if (file instanceof TFolder) {
				rewriteFolderPrefix(oldPath, file.path);
			}
		}),
	);

	// 卸载时把内存缓存落盘
	plugin.register(() => flushNow());
}
