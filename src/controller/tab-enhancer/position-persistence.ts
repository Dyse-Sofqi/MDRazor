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
 *   独立缓存文件 .obsidian/plugins/MDRazor/position-cache.json，
 *   与用户设置 data.json 分离；磁盘写入节流 ~1s，插件卸载时 flush。
 */

import { type App, type DataAdapter, MarkdownView, type Plugin, TFile } from 'obsidian';
import { type EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

/** 变更停止后延迟记录的时间（ms） */
const CHANGE_DEBOUNCE_MS = 250;
/** 内存记录 → 磁盘写入的节流间隔（ms） */
const DISK_DEBOUNCE_MS = 1000;
/** 恢复滚动位置的最大重试帧数（长文档布局分帧完成） */
const MAX_SCROLL_RETRY = 8;
/** 缓存文件名（位于插件目录） */
const CACHE_FILE = 'position-cache.json';

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
let cache: PositionCache = {};
let dirty = false;
let diskTimer: number | null = null;

function scheduleDiskWrite(): void {
	dirty = true;
	if (diskTimer !== null) return;
	diskTimer = window.setTimeout(() => {
		diskTimer = null;
		if (!dirty) return;
		dirty = false;
		void flushDisk();
	}, DISK_DEBOUNCE_MS);
}

/** 立即把内存缓存写入磁盘（卸载 / 关闭编辑器时调用，尽力而为） */
function flushNow(): void {
	if (diskTimer !== null) {
		window.clearTimeout(diskTimer);
		diskTimer = null;
	}
	if (!dirty) return;
	dirty = false;
	void flushDisk();
}

async function flushDisk(): Promise<void> {
	if (!adapterRef || !filePathRef) return;
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

/** 载入缓存并清理 vault 中已不存在文件的记录 */
async function loadCache(plugin: Plugin): Promise<void> {
	adapterRef = plugin.app.vault.adapter;
	// manifest.dir = 实际插件文件夹路径（插件目录名可能与 id 不一致，如 id=md-razor / 目录=MDRazor）
	const pluginDir =
		plugin.manifest.dir ?? `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}`;
	filePathRef = `${pluginDir}/${CACHE_FILE}`;
	try {
		if (await adapterRef.exists(filePathRef)) {
			const data = JSON.parse(await adapterRef.read(filePathRef)) as {
				positions?: PositionCache;
			};
			cache = data.positions ?? {};
		} else {
			cache = {};
		}
	} catch {
		cache = {};
	}

	let pruned = false;
	for (const path of Object.keys(cache)) {
		if (!(plugin.app.vault.getAbstractFileByPath(path) instanceof TFile)) {
			delete cache[path];
			pruned = true;
		}
	}
	if (pruned) {
		dirty = true;
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
export function registerPositionPersistence(
	plugin: Plugin,
	enabled: () => boolean,
): void {
	void loadCache(plugin);

	plugin.registerEditorExtension(createPositionPlugin(plugin.app, enabled));

	// 卸载时把内存缓存落盘
	plugin.register(() => flushNow());
}
