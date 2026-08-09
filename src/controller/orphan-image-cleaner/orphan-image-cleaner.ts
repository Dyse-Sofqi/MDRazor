/**
 * MDRazor — 失联图片清理
 *
 * 扫描库中所有 Markdown 笔记，找出未被任何笔记引用过的图片文件
 *（jpg、jpeg、png、gif、svg），将其移入系统回收站。
 */

import { App, ButtonComponent, Modal, Notice, TFile } from 'obsidian';
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
		ribbonEl = plugin.addRibbonIcon('trash-2', '清理失联图片', async () => {
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
	private onConfirm: (selected: TFile[], keptPaths: string[]) => void;

	constructor(
		app: App,
		files: TFile[],
		whitelist: ReadonlySet<string>,
		onConfirm: (selected: TFile[], keptPaths: string[]) => void,
	) {
		super(app);
		this.files = files;
		this.whitelist = whitelist;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: `发现 ${this.files.length} 张失联图片` });
		contentEl.createEl('p', {
			text: '以下图片未被任何笔记引用，默认全部勾选。未勾选的图片将加入白名单保留，并在下次弹框中置底显示。',
			cls: 'mod-desc',
		});

		// 白名单图片置底于列表底部
		const sorted = [...this.files].sort(
			(a, b) => Number(this.whitelist.has(a.path)) - Number(this.whitelist.has(b.path)),
		);

		// 四列表格：勾选 | 文件路径 | 状态 | 缩略图（超出部分可滚动）
		const listEl = contentEl.createDiv({ cls: 'mdrazor-orphan-table-wrap' });
		listEl.style.maxHeight = '320px';
		listEl.style.overflowY = 'auto';
		listEl.style.border = '1px solid var(--background-modifier-border)';
		listEl.style.borderRadius = '6px';
		listEl.style.margin = '8px 0';

		const table = listEl.createEl('table');
		table.style.width = '100%';
		table.style.borderCollapse = 'collapse';
		table.style.fontSize = 'var(--font-ui-small)';

		const headRow = table.createEl('thead').createEl('tr');
		headRow.style.background = 'var(--background-secondary)';

		// 第 1 列列首：全选 / 取消全选 勾选框
		const thCheck = headRow.createEl('th');
		thCheck.style.padding = '4px 8px';
		thCheck.style.textAlign = 'center';
		thCheck.style.width = '36px';
		const allCb = thCheck.createEl('input', { type: 'checkbox', title: '全选 / 取消全选' });

		const thPath = headRow.createEl('th', { text: '文件路径' });
		thPath.style.padding = '4px 8px';
		thPath.style.textAlign = 'left';

		const thStatus = headRow.createEl('th', { text: '状态' });
		thStatus.style.padding = '4px 8px';
		thStatus.style.textAlign = 'left';
		thStatus.style.width = '80px';

		const thImg = headRow.createEl('th', { text: '缩略图' });
		thImg.style.padding = '4px 8px';
		thImg.style.textAlign = 'left';
		thImg.style.width = '64px';

		const tbody = table.createEl('tbody');
		const rows: Array<{ cb: HTMLInputElement; file: TFile }> = [];
		for (const file of sorted) {
			const isWhitelisted = this.whitelist.has(file.path);

			const tr = tbody.createEl('tr');
			tr.style.cursor = 'pointer';
			if (isWhitelisted) tr.style.opacity = '0.7';

			const tdCheck = tr.createEl('td');
			tdCheck.style.padding = '2px 8px';
			tdCheck.style.textAlign = 'center';
			const cb = tdCheck.createEl('input', { type: 'checkbox' });
			cb.checked = !isWhitelisted; // 白名单默认不勾选
			rows.push({ cb, file });

			const tdPath = tr.createEl('td', { text: file.path });
			tdPath.style.padding = '2px 8px';

			const tdStatus = tr.createEl('td');
			tdStatus.style.padding = '2px 8px';
			if (isWhitelisted) {
				const badge = tdStatus.createSpan({ text: '白名单' });
				badge.style.fontSize = '0.85em';
				badge.style.color = 'var(--text-muted)';
			}

			const tdImg = tr.createEl('td');
			tdImg.style.padding = '2px 8px';
			const img = tdImg.createEl('img');
			img.style.height = '28px'; // 缩略图高度适应列表行高
			img.style.width = 'auto';
			img.style.objectFit = 'contain';
			img.style.display = 'block';
			img.alt = file.name;
			img.setAttribute('src', this.app.vault.getResourcePath(file));

			// 点击行任意处切换勾选状态（勾选框自身不重复触发）
			tr.addEventListener('click', (e) => {
				if ((e.target as HTMLElement).closest('input')) return;
				cb.checked = !cb.checked;
				updateConfirmText();
			});
		}

		let confirmBtn: ButtonComponent;

		const updateConfirmText = (): void => {
			const count = rows.filter((r) => r.cb.checked).length;
			const total = rows.length;
			confirmBtn.setButtonText(`确认删除 (${count})`).setDisabled(count === 0);
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
			.setButtonText('确认删除')
			.setCta()
			.onClick(() => {
				const selected = rows.filter((r) => r.cb.checked).map((r) => r.file);
				const keptPaths = rows.filter((r) => !r.cb.checked).map((r) => r.file.path);
				this.close();
				this.onConfirm(selected, keptPaths);
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
		new Notice('库中未找到图片文件');
		return;
	}

	// 步骤 1：扫描所有 Markdown 文件，提取被引用的图片路径集合
	const referencedPaths = new Set<string>();
	const totalMd = markdownFiles.length;

	// 单个常驻进度提示：仅更新内容，不连续弹出新提示
	const progressNotice = totalMd > 50 ? new Notice('正在扫描引用…', 0) : null;

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
			progressNotice.setMessage(`正在扫描引用… ${i + 1}/${totalMd}`);
		}
	}

	if (progressNotice) progressNotice.hide();

	// 步骤 2：找出未被引用的图片
	const orphaned = imageFiles.filter(f => !referencedPaths.has(f.path));

	if (orphaned.length === 0) {
		new Notice('未发现失联图片，所有图片均被引用');
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

			new Notice(`清理完成: 已删除 ${successCount} 个失联图片${failCount > 0 ? `, ${failCount} 个失败` : ''}`);
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
