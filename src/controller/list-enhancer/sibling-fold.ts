/**
 * MDRazor — 展开/折叠同级列表或标题（Controller，列表增强 + 右键菜单模块）
 *
 * 功能入口：
 *   - 命令「展开/折叠同级列表或标题」（可在命令面板触发或绑定快捷键）
 *   - 右键菜单项「展开/折叠同级列表或标题」（右键菜单模块开关控制）
 *
 * 逻辑：
 *   1. 检测光标所在行是否为列表项或标题，并解析其层级
 *      （标题层级 = # 数量；列表层级 = 行首缩进列数）
 *   2. 以该行当前的折叠状态为基准：已折叠 → 目标全部展开；未折叠 → 目标全部折叠
 *   3. 将光标所在行自身 + 全文档所有同层级列表项 / 标题统一切换到目标状态
 *   4. 完成后弹出 Notice，提示实际折叠 / 展开了多少个同级标题或列表
 *
 * 折叠语义复用 Obsidian 的 CM6 折叠服务（标题折叠 + 列表缩进折叠），
 * 与 fold-navigation.ts 共享同一套 foldedRanges / foldEffect 机制。
 */

import { type Editor, MarkdownView, Notice, type Plugin } from 'obsidian';
import { tr } from '../../i18n';
import { type EditorState, type StateEffect } from '@codemirror/state';
import { type EditorView } from '@codemirror/view';
import { foldEffect, foldable, foldedRanges, unfoldEffect } from '@codemirror/language';

/** 折叠区间（即 CM6 的 DocRange） */
interface FoldRange {
	from: number;
	to: number;
}

/** 行类型：标题 / 列表 */
type LineKind = 'heading' | 'list';

/** 行类型 + 层级 */
interface KindLevel {
	kind: LineKind;
	level: number;
}

/** 折叠执行结果（供 Notice 提示文案使用） */
export interface SiblingFoldResult {
	kind: LineKind;
	/** 目标折叠状态：true = 折叠，false = 展开 */
	folded: boolean;
	/** 实际变更的同级数量 */
	count: number;
}

/** ATX 标题：1-6 个 # 后跟空格 */
const HEADING_RE = /^(#{1,6})\s/;
/** 列表项：无序 - * + 或有序 1. 1) 后跟空格（含任务列表 - [ ]） */
const LIST_RE = /^([-*+]|\d+[.)])\s/;

/**
 * 检测行文本是否为列表项或标题，并返回其层级。
 * 标题层级 = # 数量；列表层级 = 行首缩进列数（tab 按编辑器 tabSize 计）。
 */
function detectKindLevel(text: string, tabSize: number): KindLevel | null {
	const trimmed = text.trimStart();

	const heading = trimmed.match(HEADING_RE);
	const headingLevel = heading?.[1];
	if (headingLevel !== undefined) return { kind: 'heading', level: headingLevel.length };

	const list = trimmed.match(LIST_RE);
	if (list) return { kind: 'list', level: indentColumns(text, tabSize) };

	return null;
}

/** 计算行首缩进列数 */
function indentColumns(text: string, tabSize: number): number {
	const leading = /^[ \t]*/.exec(text)?.[0] ?? '';
	let cols = 0;
	for (const ch of leading) cols += ch === '\t' ? tabSize : 1;
	return cols;
}

/** 当前所有折叠范围 */
function getFoldedRanges(state: EditorState): FoldRange[] {
	const ranges: FoldRange[] = [];
	foldedRanges(state).between(0, state.doc.length, (from, to) => {
		ranges.push({ from, to });
	});
	return ranges;
}

/**
 * 该行是否为折叠锚点行（折叠从其行内 / 行末开始）。
 * 列表项折叠锚点落在该项文本行内，标题折叠锚点落在行末；
 * 个别实现把行尾换行一并隐藏，锚点会落在下一行行首（line.to + 1）。
 */
function isLineFolded(ranges: readonly FoldRange[], line: { from: number; to: number }): boolean {
	return ranges.some((r) => r.from >= line.from && r.from <= line.to + 1);
}

/** 该行是否整体位于某个已折叠区间内（被折叠的祖先隐藏，当前不可见） */
function isLineHiddenByFold(
	ranges: readonly FoldRange[],
	line: { from: number; to: number },
): boolean {
	return ranges.some((r) => r.from <= line.from && r.to >= line.to);
}

/** 锚点落在该行内的已折叠区间（用于展开） */
function getLineFoldRange(
	ranges: readonly FoldRange[],
	line: { from: number; to: number },
): FoldRange | null {
	return ranges.find((r) => r.from >= line.from && r.from <= line.to + 1) ?? null;
}

/**
 * 以光标所在行列表项 / 标题为基准，统一切换全文档同层级列表项 / 标题的折叠状态：
 *   当前行已折叠 → 全部展开；当前行未折叠 → 全部折叠。
 *
 * 跳过的行：
 *   - 被折叠祖先隐藏的行（不可见，折叠状态无从谈起）
 *   - 已处于目标状态的行
 *   - 不可折叠的行（无后续内容，foldable 返回 null）
 *
 * @returns 执行结果；光标所在行不是列表或标题时返回 null。
 */
export function toggleSiblingFolds(view: EditorView): SiblingFoldResult | null {
	const state = view.state;
	const head = state.selection.main.head;
	const cursorLine = state.doc.lineAt(head);

	const base = detectKindLevel(cursorLine.text, state.tabSize);
	if (!base) return null;

	// 基准 = 当前行的折叠状态；目标 = 相反状态（折叠 ↔ 展开）
	const ranges = getFoldedRanges(state);
	const targetFolded = !isLineFolded(ranges, cursorLine);

	const effects: StateEffect<FoldRange>[] = [];
	let count = 0;

	for (let n = 1; n <= state.doc.lines; n++) {
		const line = state.doc.line(n);

		const kindLevel = detectKindLevel(line.text, state.tabSize);
		if (!kindLevel || kindLevel.kind !== base.kind || kindLevel.level !== base.level) continue;
		if (isLineHiddenByFold(ranges, line)) continue;

		const folded = isLineFolded(ranges, line);
		if (folded === targetFolded) continue;

		if (targetFolded) {
			const range = foldable(state, line.from, line.to);
			if (!range) continue; // 无后续内容，不可折叠
			effects.push(foldEffect.of(range));
		} else {
			const range = getLineFoldRange(ranges, line);
			if (!range) continue;
			effects.push(unfoldEffect.of(range));
		}
		count++;
	}

	if (count > 0) {
		view.dispatch({ effects });
	}

	return { kind: base.kind, folded: targetFolded, count };
}

/**
 * 从 Obsidian Editor 取出其底层的 CM6 EditorView。
 */
function getCm6(editor: Editor): EditorView | null {
	return (editor as unknown as { cm?: EditorView }).cm ?? null;
}

/**
 * 执行「展开/折叠同级列表或标题」并弹出结果提示。
 * 命令面板与右键菜单共用此入口。
 */
export function executeSiblingFold(editor: Editor): void {
	const cm6 = getCm6(editor);
	if (!cm6) return;

	const result = toggleSiblingFolds(cm6);
	if (!result) {
		new Notice(tr('光标所在行不是列表或标题，无法展开/折叠同级内容', 'The cursor is not on a list item or heading; nothing can be expanded or collapsed.'));
		return;
	}

	const label = result.kind === 'heading' ? tr('标题', 'heading') : tr('列表', 'list');
	if (result.count === 0) {
		new Notice(
			result.folded
				? tr(`没有可折叠的同级${label}`, `No sibling ${label}s to collapse`)
				: tr(`没有可展开的同级${label}`, `No sibling ${label}s to expand`),
		);
	} else {
		new Notice(
			tr(
				`${result.folded ? '已折叠' : '已展开'} ${result.count} 个同级${label}`,
				`${result.folded ? 'Collapsed' : 'Expanded'} ${result.count} sibling ${label}s`,
			),
		);
	}
}

/**
 * 注册「展开/折叠同级列表或标题」命令（列表增强模块）。
 * 可在命令面板中触发，或在「设置 → 快捷键」中绑定快捷键。
 */
export function registerSiblingFold(plugin: Plugin): void {
	plugin.addCommand({
		id: 'mdrazor-toggle-sibling-folds',
		name: tr('展开/折叠同级列表或标题', 'Expand/Collapse Sibling Lists or Headings'),
		icon: 'list-collapse',
		checkCallback: (checking: boolean) => {
			const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) return false;

			if (!checking) {
				executeSiblingFold(view.editor);
			}
			return true;
		},
	});
}

/**
 * 注册「展开/折叠同级列表或标题」右键菜单项（右键菜单模块）。
 *
 * 开启时在 Markdown 编辑器右键菜单中添加同名菜单项，点击执行与命令
 * 相同的逻辑（以光标所在列表项/标题的折叠状态为基准，统一切换全文档
 * 同层级列表项/标题的折叠状态，并弹出结果提示）。
 * 菜单项在弹出时实时读取开关状态，切换无需重载插件。
 */
export function registerSiblingFoldContextMenu(plugin: Plugin, enabled: () => boolean): void {
	plugin.registerEvent(
		plugin.app.workspace.on('editor-menu', (menu, editor) => {
			if (!enabled()) return;
			menu.addItem((item) =>
				item
					.setTitle('展开/折叠同级列表或标题')
					.setIcon('list-collapse')
					.onClick(() => executeSiblingFold(editor)),
			);
		}),
	);
}
