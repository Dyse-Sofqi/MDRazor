/**
 * MDRazor — 失联图片清理
 *
 * 扫描库中所有 Markdown 笔记，找出未被任何笔记引用过的图片文件
 *（jpg、jpeg、png、gif、svg），将其移入系统回收站。
 */

import { Notice, Plugin, TFile } from 'obsidian';

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'svg']);

/* ------------------------------------------------------------------ */
/*  Ribbon 生命周期管理                                                 */
/* ------------------------------------------------------------------ */

/**
 * 注册失联图片清理功能，返回 ribbon 图标添加/移除控制函数。
 */
export function registerOrphanImageCleaner(
	plugin: Plugin,
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
/* 核心清理逻辑                                                        */
/* ------------------------------------------------------------------ */

/**
 * 扫描库中所有 Markdown 文件，找出未被引用过的图片并移入系统回收站。
 */
async function cleanOrphanImages(plugin: Plugin): Promise<void> {
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

	for (let i = 0; i < markdownFiles.length; i++) {
		const mdFile = markdownFiles[i]!;
		try {
			const content = await plugin.app.vault.read(mdFile);
			extractImageReferences(content, referencedPaths, allFiles);
		} catch {
			// 跳过无法读取的文件
		}

		// 每处理 20 个文件显示一次进度
		if (i % 20 === 0 && totalMd > 50) {
			new Notice(`正在扫描引用… ${i + 1}/${totalMd}`);
		}
	}

	// 步骤 2：找出未被引用的图片
	const orphaned = imageFiles.filter(f => !referencedPaths.has(f.path));

	if (orphaned.length === 0) {
		new Notice('未发现失联图片，所有图片均被引用');
		return;
	}

	// 步骤 3：逐个移入系统回收站，报告具体文件名
	let successCount = 0;
	let failCount = 0;

	for (const file of orphaned) {
		try {
			await plugin.app.vault.trash(file, true);
			successCount++;
			new Notice(`已清理: ${file.path}`);
		} catch {
			failCount++;
			new Notice(`清理失败: ${file.path}`);
		}
	}

	if (failCount > 0) {
		new Notice(`清理完成: ${successCount} 成功, ${failCount} 失败`);
	}
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
