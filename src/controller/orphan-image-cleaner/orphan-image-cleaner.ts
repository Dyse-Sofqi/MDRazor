/**
 * MDRazor — 失联图片清理
 *
 * 扫描库中所有可能引用图片的文件，找出未被任何文件引用过的图片
 *（jpg、jpeg、png、gif、svg），将其移入系统回收站。
 *
 * 引用来源包括：
 *   1. Markdown 笔记（.md）——正文语法 + frontmatter 属性
 *   2. Canvas 画布（.canvas）——JSON 文件节点 / 文本节点
 *   3. 其他文本载体（.base / .excalidraw / .html / .txt）——纯文本正则
 *
 * 引用收集遵循「宁可多算，绝不漏算」原则：任何可能命中图片的路径都会计入
 * 引用集合。多算只会让清理更保守（少删几张），漏算则会误删在用图片，
 * 因此所有解析方式取并集，且任何解析失败都退化为宽松匹配。
 */

import { App, ButtonComponent, Modal, Notice, TFile } from 'obsidian';
import { tr } from '../../i18n';
import type MDRazorPlugin from '../main';

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'svg']);

/** 除 .md / .canvas 外，还需按纯文本正则扫描的引用来源扩展名 */
const EXTRA_TEXT_EXTS = new Set(['base', 'excalidraw', 'html', 'htm', 'txt']);

/** 额外文本载体的大小上限（字节），超过则跳过以免拖慢扫描 */
const MAX_EXTRA_TEXT_BYTES = 2_000_000;

/** frontmatter 属性值形如 assets/a.png 时，判定为文件引用 */
const IMAGE_PATH_RE = /\.(?:jpe?g|png|gif|svg)$/i;

/** 外部协议前缀（http:、data:、app: 等），不做链接解析，但仍保留文件名兜底 */
const EXTERNAL_REF_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/* ------------------------------------------------------------------ */
/*  Ribbon 生命周期管理                                                 */
/* ------------------------------------------------------------------ */

/**
 * 注册失联图片清理功能，返回 ribbon 图标添加/移除控制函数。
 */
export function registerOrphanImageCleaner(
	plugin: MDRazorPlugin,
): { addRibbon: () => void; removeRibbon: () => void } {
	let ribbonEl: HTMLElement | null = null;

	const addRibbon = (): void => {
		if (ribbonEl) return;
		ribbonEl = plugin.addRibbonIcon('trash-2', tr('清理失联图片', 'Clean orphan images'), async () => {
			await cleanOrphanImages(plugin);
		});
	};

	const removeRibbon = (): void => {
		if (ribbonEl) {
			ribbonEl.remove();
			ribbonEl = null;
		}
	};

	return { addRibbon, removeRibbon };
}

/* ------------------------------------------------------------------ */
/* 确认删除弹窗                                                        */
/* ------------------------------------------------------------------ */

/**
 * 失联图片确认删除弹窗：列出所有失联图片，默认全部勾选。
 * 白名单中的图片自动保持未勾选并置底；重新勾选可移除白名单状态。
 * 用户点击确认后，未勾选的图片记入白名单，勾选的图片删除。
 */
class OrphanImageConfirmModal extends Modal {
	private files: TFile[];
	private whitelist: ReadonlySet<string>;
	private onConfirm: (selected: TFile[], keptPaths: string[]) => void | Promise<void>;

	constructor(
		app: App,
		files: TFile[],
		whitelist: ReadonlySet<string>,
		onConfirm: (selected: TFile[], keptPaths: string[]) => void | Promise<void>,
	) {
		super(app);
		this.files = files;
		this.whitelist = whitelist;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', {
			text: tr(`发现 ${this.files.length} 张失联图片`, `Found ${this.files.length} orphan images`),
		});
		contentEl.createEl('p', {
			text: tr(
				'以下图片未被任何笔记或画布引用，默认全部勾选。未勾选的图片将加入白名单保留，并在下次弹框中置底显示。删除方式遵循「设置 → 文件与链接 → 删除文件」的偏好（系统回收站 / 库内 .trash / 永久删除）。',
				'These images are not referenced by any note or canvas and are checked by default. Unchecked images are added to the whitelist and kept; they appear at the bottom of the next dialog. Deletion follows your "Settings → Files and links → Deleted files" preference (system trash / vault .trash / permanent).',
			),
			cls: 'mod-desc',
		});

		// 白名单图片置底于列表底部
		const sorted = [...this.files].sort(
			(a, b) => Number(this.whitelist.has(a.path)) - Number(this.whitelist.has(b.path)),
		);

		// 四列表格：勾选 | 文件路径 | 状态 | 缩略图（超出部分可滚动）
		const listEl = contentEl.createDiv({ cls: 'mdrazor-orphan-table-wrap' });

		const table = listEl.createEl('table', { cls: 'mdrazor-orphan-table' });

		const headRow = table.createEl('thead').createEl('tr');

		// 第 1 列列首：全选 / 取消全选 勾选框
		const thCheck = headRow.createEl('th', { cls: 'mdrazor-orphan-col-check' });
		const allCb = thCheck.createEl('input', { type: 'checkbox', title: tr('全选 / 取消全选', 'Select all / select none') });

		headRow.createEl('th', { text: tr('文件路径', 'Path') });

		headRow.createEl('th', { text: tr('状态', 'Status'), cls: 'mdrazor-orphan-col-status' });

		headRow.createEl('th', { text: tr('缩略图', 'Thumbnail'), cls: 'mdrazor-orphan-col-thumb' });

		const tbody = table.createEl('tbody');
		const rows: Array<{ cb: HTMLInputElement; file: TFile }> = [];
		for (const file of sorted) {
			const isWhitelisted = this.whitelist.has(file.path);

			const tableRow = tbody.createEl('tr');
			if (isWhitelisted) tableRow.addClass('mdrazor-orphan-whitelisted');

			const tdCheck = tableRow.createEl('td', { cls: 'mdrazor-orphan-col-check' });
			const cb = tdCheck.createEl('input', { type: 'checkbox' });
			cb.checked = !isWhitelisted; // 白名单默认不勾选
			rows.push({ cb, file });

			tableRow.createEl('td', { text: file.path });

			const tdStatus = tableRow.createEl('td');
			if (isWhitelisted) {
				tdStatus.createSpan({ text: tr('白名单', 'Whitelisted'), cls: 'mdrazor-orphan-whitelist-badge' });
			}

			const tdImg = tableRow.createEl('td');
			const img = tdImg.createEl('img', { cls: 'mdrazor-orphan-thumb' });
			img.alt = file.name;
			img.setAttribute('src', this.app.vault.getResourcePath(file));

			// 点击行任意处切换勾选状态（勾选框自身不重复触发）
			tableRow.addEventListener('click', (e) => {
				if ((e.target as HTMLElement).closest('input')) return;
				cb.checked = !cb.checked;
				updateConfirmText();
			});
		}

		let confirmBtn: ButtonComponent;

		const updateConfirmText = (): void => {
			const count = rows.filter((r) => r.cb.checked).length;
			const total = rows.length;
			confirmBtn.setButtonText(tr(`确认删除 (${count})`, `Delete (${count})`));
			// setDisabled 需 Obsidian v1.2.3+，minAppVersion 1.0.0 兼容：直接操作 buttonEl
			confirmBtn.buttonEl.disabled = count === 0;
			// 列首勾选框与各行状态同步（含半选状态）
			allCb.checked = count === total;
			allCb.indeterminate = count > 0 && count < total;
		};

		// 列首勾选框 = 全选 / 取消全选
		allCb.addEventListener('change', () => {
			for (const r of rows) r.cb.checked = allCb.checked;
			updateConfirmText();
		});

		const btnRow = contentEl.createDiv({ cls: 'modal-button-container' });

		confirmBtn = new ButtonComponent(btnRow)
			.setButtonText(tr('确认删除', 'Delete'))
			.setCta()
			.onClick(() => {
				const selected = rows.filter((r) => r.cb.checked).map((r) => r.file);
				const keptPaths = rows.filter((r) => !r.cb.checked).map((r) => r.file.path);
				this.close();
				void this.onConfirm(selected, keptPaths);
			});
		updateConfirmText();

		// 勾选变化时同步按钮计数与列首勾选框状态
		for (const r of rows) {
			r.cb.addEventListener('change', updateConfirmText);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/* ------------------------------------------------------------------ */
/* 核心清理逻辑                                                        */
/* ------------------------------------------------------------------ */

/**
 * 扫描库中所有引用来源文件，找出未被引用过的图片并移入系统回收站。
 */
async function cleanOrphanImages(plugin: MDRazorPlugin): Promise<void> {
	const app = plugin.app;
	const allFiles = app.vault.getFiles();
	const imageFiles = allFiles.filter(f => IMAGE_EXTS.has(f.extension.toLowerCase()));

	if (imageFiles.length === 0) {
		new Notice(tr('库中未找到图片文件', 'No image files found in this vault'));
		return;
	}

	// 引用来源：Markdown 笔记、Canvas 画布，以及其他可能的文本载体
	const sourceFiles = allFiles.filter(f => {
		const ext = f.extension.toLowerCase();
		return ext === 'md' || ext === 'canvas' || EXTRA_TEXT_EXTS.has(ext);
	});

	// 步骤 1：扫描所有引用来源，提取被引用的图片路径集合
	const referencedPaths = new Set<string>();
	const totalSources = sourceFiles.length;

	// 单个常驻进度提示：仅更新内容，不连续弹出新提示
	const progressNotice = totalSources > 50
		? new Notice(tr('正在扫描引用…', 'Scanning references…'), 0)
		: null;

	for (let i = 0; i < sourceFiles.length; i++) {
		const file = sourceFiles[i]!;
		const ext = file.extension.toLowerCase();

		// 超大文本载体跳过（.md / .canvas 始终读取），避免长时间阻塞
		const tooLarge = EXTRA_TEXT_EXTS.has(ext) && file.stat.size > MAX_EXTRA_TEXT_BYTES;
		if (!tooLarge) {
			try {
				const content = await app.vault.read(file);
				if (ext === 'canvas') {
					extractCanvasReferences(content, referencedPaths, allFiles, app, file.path);
				} else if (ext === 'md') {
					extractImageReferences(content, referencedPaths, allFiles, app, file.path);
					extractFrontmatterReferences(app, file, referencedPaths, allFiles);
				} else {
					// .base / .excalidraw / .html / .txt：无固定语法，语法正则 + 路径兜底
					extractImageReferences(content, referencedPaths, allFiles, app, file.path);
					extractPatternMatches(content, TEXT_PATH_REF_PATTERNS, referencedPaths, allFiles, app, file.path);
				}
			} catch {
				// 单个文件读取 / 解析失败不影响整体扫描
			}
		}

		// 每处理 20 个文件刷新一次进度内容
		if (progressNotice && i % 20 === 0) {
			progressNotice.setMessage(`${tr('正在扫描引用…', 'Scanning references…')} ${i + 1}/${totalSources}`);
		}
	}

	if (progressNotice) progressNotice.hide();

	// 步骤 2：找出未被引用的图片
	const orphaned = imageFiles.filter(f => !referencedPaths.has(f.path));

	if (orphaned.length === 0) {
		new Notice(tr('未发现失联图片，所有图片均被引用', 'No orphan images found; all images are referenced'));
		return;
	}

	// 步骤 3：弹出多选确认框（默认全选），由用户确认后再删除
	new OrphanImageConfirmModal(
		plugin.app,
		orphaned,
		new Set(plugin.settings.orphanImageWhitelist ?? []),
		async (selected, keptPaths) => {
			// 未勾选图片记入白名单：下次弹框默认不勾选并置底；重新勾选即移除白名单
			plugin.settings.orphanImageWhitelist = keptPaths;
			await plugin.saveSettings();

			let successCount = 0;
			let failCount = 0;

			for (const file of selected) {
				try {
					// 删除前复查文件是否仍在库中，避免弹窗期间已被移走
					if (!app.vault.getAbstractFileByPath(file.path)) continue;
					// 用 FileManager.trashFile() 而非 vault.trash()：前者遵循用户在
					// 「设置 → 文件与链接 → 删除文件」里选定的方式（系统回收站 / 库内
					// .trash / 永久删除）。审核规范 obsidianmd/prefer-file-manager-trash-file
					// 要求走官方入口，且该规则禁止被 eslint-disable 屏蔽；
					// 为补偿「用户可能选了永久删除」，弹框说明里已注明删除方式来源。
					await app.fileManager.trashFile(file);
					successCount++;
				} catch {
					failCount++;
				}
			}

			new Notice(
				tr(
					`清理完成: 已删除 ${successCount} 个失联图片${failCount > 0 ? `, ${failCount} 个失败` : ''}`,
					`Cleanup complete: deleted ${successCount} orphan image(s)${failCount > 0 ? `, ${failCount} failed` : ''}`,
				),
			);
		},
	).open();
}

/* ------------------------------------------------------------------ */
/* 引用提取                                                            */
/* ------------------------------------------------------------------ */

const IMG_REF_PATTERNS = [
	// Obsidian wiki embed: ![[path/to/image.png]] 或 ![[image.png|alt]]
	/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g,
	// Markdown image: ![alt](path/to/image.png)
	/!\[[^\]]*\]\(([^)]+)\)/g,
	// HTML img tag: <img src="path/to/image.png" ...>
	/<img[^>]+src\s*=\s*["']([^"']+)["']/gi,
	// Wiki link without !: [[path/to/image.png]] or [[image.png|alt]]
	/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g,
];

/**
 * Canvas JSON 解析失败（文件被外部工具改坏等）时的兜底正则：
 * 直接按文本抓取 JSON 里的路径字段与图片扩展名字符串，宁可多算引用。
 */
const CANVAS_RAW_REF_PATTERNS = [
	// "file": "assets/a.png"
	/"file"\s*:\s*"([^"]+)"/g,
	// 任意以图片扩展名结尾的字符串值: "assets/a.png"
	/"([^"]*\.(?:jpe?g|png|gif|svg))"/gi,
];

/**
 * 无固定链接语法的文本载体（.base / .excalidraw / .html / .txt）的兜底正则：
 * 抓取任意位置出现的图片路径，宁可多算引用。
 */
const TEXT_PATH_REF_PATTERNS = [
	// 以图片扩展名结尾的路径片段: path: assets/a.png / src="a.png"
	/([^\s"'()<>[\]]+\.(?:jpe?g|png|gif|svg))/gi,
];

/**
 * 从文本中提取所有可能的图片引用路径，加入到 referencedPaths 集合。
 *
 * @param content     文本内容（Markdown 正文 / Canvas 文本节点 / 任意文本）
 * @param referenced  Set 收集结果（vault 绝对路径）
 * @param allFiles    库中所有文件的列表（用于将文件名解析为路径）
 * @param app         Obsidian App（用于调用官方链接解析）
 * @param sourcePath  引用所在文件的路径（相对链接以此为基准解析）
 */
function extractImageReferences(
	content: string,
	referenced: Set<string>,
	allFiles: TFile[],
	app: App,
	sourcePath: string,
): void {
	extractPatternMatches(content, IMG_REF_PATTERNS, referenced, allFiles, app, sourcePath);
}

/**
 * 用一组正则逐个提取捕获组，作为引用候选交给 resolveReference 解析。
 * 正则均为模块级 g 标志常量，每次使用前复位 lastIndex。
 */
function extractPatternMatches(
	content: string,
	patterns: readonly RegExp[],
	referenced: Set<string>,
	allFiles: TFile[],
	app: App,
	sourcePath: string,
): void {
	for (const pattern of patterns) {
		// 正则带 g 标志且为模块级常量，显式复位 lastIndex 以免跨文件残留
		pattern.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(content)) !== null) {
			const captured = match[1];
			if (captured) resolveReference(captured, referenced, allFiles, app, sourcePath);
			// 防御零宽匹配导致的死循环
			if (match.index === pattern.lastIndex) pattern.lastIndex++;
		}
	}
}

/**
 * 将一个引用字符串解析为库内文件路径，加入 referencedPaths。
 *
 * 依次尝试：官方链接解析 → 库内绝对路径 → 宽松后缀匹配 → 同名文件兜底。
 * 各方式取并集而非短路返回，宁可多算引用，避免误删在用图片。
 */
function resolveReference(
	rawRef: string,
	referenced: Set<string>,
	allFiles: TFile[],
	app: App,
	sourcePath: string,
): void {
	// 去掉查询参数和锚点: path.png?w=100 → path.png；并还原 JSON 转义斜杠
	const ref = ((rawRef.split('?')[0] ?? '').split('#')[0] ?? '').trim().replace(/\\\//g, '/');
	if (!ref) return;

	// 外部链接（http:、data: 等）不做链接解析，但仍保留下面的文件名兜底
	const isExternal = EXTERNAL_REF_RE.test(ref);

	// 方式一：Obsidian 官方链接解析，正确处理相对路径、子目录与同名文件优先级
	if (!isExternal) {
		try {
			const dest = app.metadataCache.getFirstLinkpathDest(ref, sourcePath);
			if (dest) referenced.add(dest.path);
		} catch {
			// 忽略：继续走下面的宽松匹配
		}
	}

	// 方式二：以 / 开头的库内绝对路径
	if (ref.startsWith('/')) referenced.add(ref.slice(1));

	// 方式三：宽松匹配（宁可多算）
	if (ref.includes('/')) {
		const exact = allFiles.find(f => f.path === ref);
		if (exact) referenced.add(exact.path);

		const normalized = ref.replace(/^\.\//, '');
		for (const f of allFiles) {
			if (f.path.endsWith(normalized)) referenced.add(f.path);
		}
	}

	// 方式四：纯文件名，匹配所有同名文件
	const bareName = ref.split('/').pop() ?? ref;
	for (const f of allFiles) {
		if (f.name === bareName) referenced.add(f.path);
	}
}

/* ------------------------------------------------------------------ */
/* Canvas 引用提取                                                     */
/* ------------------------------------------------------------------ */

/** Canvas 节点（只声明用得到的字段，其余一律忽略） */
interface CanvasNode {
	type?: unknown;
	file?: unknown;
	text?: unknown;
}

interface CanvasDocument {
	nodes?: unknown;
}

/**
 * 从 .canvas 文件中提取图片引用。
 *
 * Canvas 为 JSON 结构，图片引用主要有两种形式：
 *   - 文件节点：{ "type": "file", "file": "assets/a.png" }
 *   - 文本节点：{ "type": "text", "text": "![[a.png]]" }
 * 链接节点（{ "type": "link", "url": "https://…" }）指向外部地址，与库内图片无关。
 *
 * JSON 解析失败或结构异常时退化为纯文本正则，宁可多算引用。
 */
function extractCanvasReferences(
	content: string,
	referenced: Set<string>,
	allFiles: TFile[],
	app: App,
	sourcePath: string,
): void {
	let canvasDoc: CanvasDocument | null = null;
	try {
		canvasDoc = JSON.parse(content) as CanvasDocument;
	} catch {
		canvasDoc = null;
	}

	const nodes = canvasDoc?.nodes;
	if (!Array.isArray(nodes)) {
		// JSON 解析失败或结构异常：退化为纯文本提取 + JSON 路径字段兜底，宁可多算引用
		extractImageReferences(content, referenced, allFiles, app, sourcePath);
		extractPatternMatches(content, CANVAS_RAW_REF_PATTERNS, referenced, allFiles, app, sourcePath);
		return;
	}

	for (const rawNode of nodes) {
		if (!rawNode || typeof rawNode !== 'object') continue;
		const node = rawNode as CanvasNode;

		// 文件节点：可能是图片，也可能是笔记（笔记路径加入集合无害）
		if (node.type === 'file' && typeof node.file === 'string') {
			resolveReference(node.file, referenced, allFiles, app, sourcePath);
			continue;
		}

		// 文本节点：内部可能内嵌 ![[a.png]] / ![](a.png)
		if (node.type === 'text' && typeof node.text === 'string') {
			extractImageReferences(node.text, referenced, allFiles, app, sourcePath);
		}
	}
}

/* ------------------------------------------------------------------ */
/* frontmatter 引用提取                                                */
/* ------------------------------------------------------------------ */

/**
 * 从 Markdown 笔记的 frontmatter 属性中提取图片引用。
 *
 * 覆盖两种写法：
 *   - 链接写法：cover: "[[a.png]]" / cover: "![[a.png]]"
 *   - 裸路径写法：cover: "assets/a.png"
 * 递归遍历字符串、数组与嵌套对象，兼容 Obsidian 属性面板的结构化数据。
 */
function extractFrontmatterReferences(
	app: App,
	file: TFile,
	referenced: Set<string>,
	allFiles: TFile[],
): void {
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
	if (!frontmatter) return;

	const visit = (value: unknown): void => {
		if (typeof value === 'string') {
			const trimmed = value.trim();
			if (!trimmed) return;
			// 链接写法：交给通用引用提取处理
			if (trimmed.includes('[[') || trimmed.includes('](')) {
				extractImageReferences(trimmed, referenced, allFiles, app, file.path);
			}
			// 裸路径写法：以图片扩展名结尾才当作文件引用
			if (IMAGE_PATH_RE.test(trimmed)) {
				resolveReference(trimmed, referenced, allFiles, app, file.path);
			}
			return;
		}
		if (Array.isArray(value)) {
			for (const item of value) visit(item);
			return;
		}
		if (value && typeof value === 'object') {
			for (const item of Object.values(value)) visit(item);
		}
	};

	visit(frontmatter);
}
