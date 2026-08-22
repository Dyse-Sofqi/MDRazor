/**
 * MDRazor — 失联图片清理
 *
 * 扫描库中所有 Markdown 笔记，找出未被任何笔记引用过的图片文件
 *（jpg、jpeg、png、gif、svg），将其移入系统回收站。
 */

import { App, ButtonComponent, Modal, Notice, TFile } from 'obsidian';
import { tr } from '../../i18n';
import type MDRazorPlugin from '../main';

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'svg']);

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
				'以下图片未被任何笔记引用，默认全部勾选。未勾选的图片将加入白名单保留，并在下次弹框中置底显示。',
				'These images are not referenced by any note and are checked by default. Unchecked images are added to the whitelist and kept; they appear at the bottom of the next dialog.',
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
 * 扫描库中所有 Markdown 文件，找出未被引用过的图片并移入系统回收站。
 */
async function cleanOrphanImages(plugin: MDRazorPlugin): Promise<void> {
	const allFiles = plugin.app.vault.getFiles();
	const imageFiles = allFiles.filter(f => IMAGE_EXTS.has(f.extension.toLowerCase()));
	const markdownFiles = allFiles.filter(f => f.extension === 'md');

	if (imageFiles.length === 0) {
		new Notice(tr('库中未找到图片文件', 'No image files found in this vault'));
		return;
	}

	// 步骤 1：扫描所有 Markdown 文件，提取被引用的图片路径集合
	const referencedPaths = new Set<string>();
	const totalMd = markdownFiles.length;

	// 单个常驻进度提示：仅更新内容，不连续弹出新提示
	const progressNotice = totalMd > 50 ? new Notice(tr('正在扫描引用…', 'Scanning references…'), 0) : null;

	for (let i = 0; i < markdownFiles.length; i++) {
		const mdFile = markdownFiles[i]!;
		try {
			const content = await plugin.app.vault.read(mdFile);
			extractImageReferences(content, referencedPaths, allFiles);
		} catch {
			// 跳过无法读取的文件
		}

		// 每处理 20 个文件刷新一次进度内容
		if (progressNotice && i % 20 === 0) {
			progressNotice.setMessage(`${tr('正在扫描引用…', 'Scanning references…')} ${i + 1}/${totalMd}`);
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
					await plugin.app.vault.trash(file, true);
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
 * 从文本中提取所有可能的图片引用路径，加入到 referencedPaths 集合。
 * 同时也检查路径是否以 ./ 或 ../ 开头，并解析为 vault 绝对路径。
 *
 * @param content       Markdown 文本内容
 * @param referenced    Set 收集结果（vault 绝对路径）
 * @param allFiles      库中所有文件的列表（用于将文件名解析为路径）
 */
function extractImageReferences(
	content: string,
	referenced: Set<string>,
	allFiles: TFile[],
): void {
	// 第一遍：直接匹配语法结构
	const rawMatches: string[] = [];

	for (const pattern of IMG_REF_PATTERNS) {
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(content)) !== null) {
			const captured = match[1];
			if (captured) rawMatches.push(captured.trim());
		}
	}

	// 处理每个匹配到的引用
	for (const ref of rawMatches) {
		// 去掉查询参数和锚点: path.png?w=100 → path.png
		const cleanRef = ((ref.split('?')[0] ?? '').split('#')[0] ?? '').trim();
		if (!cleanRef) continue;

		// 如果是 vault 绝对路径（以 / 开头），直接添加
		if (cleanRef.startsWith('/')) {
			referenced.add(cleanRef.slice(1));
			continue;
		}

		// 如果是相对路径（包含 /），尝试精确匹配
		if (cleanRef.includes('/')) {
			// 尝试精确全路径匹配
			const exact = allFiles.find(f => f.path === cleanRef);
			if (exact) {
				referenced.add(exact.path);
				continue;
			}
			// 尝试去掉 ./ 前缀后匹配
			const normalized = cleanRef.replace(/^\.\//, '');
			const bySuffix = allFiles.find(f => f.path.endsWith(normalized));
			if (bySuffix) {
				referenced.add(bySuffix.path);
				continue;
			}
		}

		// 纯文件名：匹配所有同名的图片
		const bareName = cleanRef.split('/').pop() ?? cleanRef;
		const matches = allFiles.filter(f => f.name === bareName);
		for (const m of matches) {
			referenced.add(m.path);
		}
	}
}
