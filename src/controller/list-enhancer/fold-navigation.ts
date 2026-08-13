/**
 * MDRazor — 上下键进入折叠块导航模块（Controller）
 *
 * CodeMirror 6 折叠语义：垂直光标移动走 posAtCoords，永不进入折叠
 * （replaced）范围，折叠块被当作单个单位跳过。列表/标题折叠后，↓/↑
 * 会直接越过整个折叠块，光标进不到折叠项自身行。
 *
 * 本模块在 capture 阶段拦截 ArrowDown/ArrowUp（与 enter-soft-break 同模式）：
 * 当目标行是折叠锚点行（折叠从该行行末开始）或位于折叠隐藏内容内时，
 * 主动展开该折叠块并把光标放到目标行（保持目标列），替代 CM6 的整块跳过。
 *
 * 上键同级回跳规则（任意层级）：按 ↑ 时若光标所在行是列表项，且上一行
 * 所属列表项的层级比当前更低（更深——如上一行或其续行位于前一同级项子树
 * 末尾的更深层），则光标直接跳转到上一个与当前层级相同的列表项所在行
 * （目标行被折叠挡住时同样展开进入），而非落入上一行所属的更深子树。
 *
 * 仅处理列表项 / 标题折叠，普通代码块折叠保持 CM6 原生跳过行为。
 */

import { EditorSelection, type EditorState, type Line, type SelectionRange } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { foldedRanges, unfoldEffect } from '@codemirror/language';
import { listEnhancerConfig } from '../../model/shared';

interface FoldRange {
	from: number;
	to: number;
}

/** 当前所有折叠范围（列表折叠 + Obsidian 原生标题折叠等） */
function getFoldedRanges(state: EditorState): FoldRange[] {
	const ranges: FoldRange[] = [];
	foldedRanges(state).between(0, state.doc.length, (from, to) => {
		ranges.push({ from, to });
	});
	return ranges;
}

/** 行文本是否为列表项或标题（折叠资格判定） */
function isListOrHeadingLine(text: string): boolean {
	const t = text.trimStart();
	return (
		/^#{1,6}\s/.test(t) ||
		/^[-*+]\s/.test(t) ||
		/^\d+[.)]\s/.test(t)
	);
}

/**
 * 行是否为列表项，并返回其缩进层级（行首缩进列数）；非列表项返回 null。
 * tab 按 tabSize 停靠展开，与选项聚焦的缩进计算一致。
 */
function getListItemLevel(text: string, tabSize: number): number | null {
	const trimmed = text.trimStart();
	if (!/^[-*+]\s/.test(trimmed) && !/^\d+[.)]\s/.test(trimmed)) return null;
	let cols = 0;
	for (const ch of text) {
		if (ch === '\t') cols += tabSize - (cols % tabSize);
		else if (ch === ' ') cols += 1;
		else break;
	}
	return cols;
}

/**
 * 上键同级回跳规则（适用于任意层级）：光标所在行是列表项，且其上一行
 * "所属列表项"的层级比当前更低（更深）时——典型场景是光标位于某个列表项、
 * 而上一行（或其所属的续行）位于前一个同级项子树末尾的更深层——将光标
 * 直接移动到上一个与当前层级相同的列表项所在行，而非落入上一行所属的
 * 更深子树。
 *
 * 层级以行首缩进列数衡量，任意深度均生效（二级遇三/四级及以上 → 跳上一
 * 个二级；三级遇四级及以上 → 跳上一个三级……）。向后扫描跳过续行，仅在
 * 空行/标题/水平线/无缩进段落等列表块边界处停止，不跨列表块跳转。目标行
 * 被折叠挡住时自动展开进入（与模块既有行为一致）。未找到同级项时返回
 * false，交还原生行为。
 */
function trySameLevelUpJump(
	view: EditorView,
	state: EditorState,
	sel: SelectionRange,
	currentLine: Line,
	targetNum: number,
): boolean {
	const currentLevel = getListItemLevel(currentLine.text, state.tabSize);
	if (currentLevel === null) return false;

	// 上一行所属列表项的层级（续行归属其上级列表项）
	const ownerLine = findOwnerItemLine(state, targetNum);
	if (!ownerLine) return false;
	const ownerLevel = getListItemLevel(ownerLine.text, state.tabSize);
	// 仅当所属项更深（层级更低）时触发；更浅或同级交还原生行为
	if (ownerLevel === null || ownerLevel <= currentLevel) return false;

	// 自上一行起向上扫描列表项，找第一个与当前层级相同的列表项
	let jumpLine: Line | null = null;
	for (let n = targetNum; n >= 1; n--) {
		const line = state.doc.line(n);
		const level = getListItemLevel(line.text, state.tabSize);
		if (level === null) {
			// 非列表行：块边界（空行/标题/水平线/无缩进段落）→ 停止；续行 → 跳过
			if (isListBlockBoundary(line.text)) break;
			continue;
		}
		if (level === currentLevel) {
			jumpLine = line;
			break;
		}
	}
	if (!jumpLine) return false;

	// 目标列：沿用 goalColumn，无则取当前行内字符偏移（与模块既有行为一致）
	const col = sel.goalColumn ?? (sel.head - currentLine.from);
	const targetPos = Math.min(jumpLine.to, jumpLine.from + col);

	// 目标行被折叠挡住 → 展开后进入
	const blocking = findBlockingFold(
		state,
		getFoldedRanges(state),
		jumpLine.from,
		jumpLine.to,
	);
	view.dispatch({
		effects: blocking ? [unfoldEffect.of(blocking)] : [],
		selection: EditorSelection.cursor(targetPos, 0, 0, col),
		scrollIntoView: true,
	});
	return true;
}

/**
 * 从 lineNumber 行起向上解析"所属列表项"：
 * - 行本身是列表项 → 返回该行；
 * - 行是续行/内容行 → 向上跳过，返回最近的列表项行；
 * - 遇到空行、标题、水平线或无缩进段落等块边界 → 返回 null（无所属项）。
 */
function findOwnerItemLine(state: EditorState, lineNumber: number): Line | null {
	for (let n = lineNumber; n >= 1; n--) {
		const line = state.doc.line(n);
		if (getListItemLevel(line.text, state.tabSize) !== null) return line;
		if (isListBlockBoundary(line.text)) return null;
	}
	return null;
}

/**
 * 行是否为列表块边界：空行、标题、水平线、无缩进的非列表行（段落）。
 * 注意：列表项行（含无缩进的一级项）不属于边界，调用方需先判断列表项。
 */
function isListBlockBoundary(lineText: string): boolean {
	const t = lineText.trimStart();
	if (t === '') return true; // 空行
	if (/^#{1,6}\s/.test(t) || /^[-*_]{3,}\s*$/.test(t)) return true; // 标题 / 水平线
	if (t === lineText) return true; // 无缩进的非列表行 → 段落边界
	return false;
}

/**
 * 该折叠是否为列表/标题折叠：
 * 折叠起点所在行（或其上一行，兼容起点落在行末/内容首的差异）是列表项或标题行。
 */
function isListOrHeadingFold(state: EditorState, r: FoldRange): boolean {
	const line = state.doc.lineAt(Math.max(0, r.from));
	if (isListOrHeadingLine(line.text)) return true;
	if (line.number > 1) {
		const prev = state.doc.line(line.number - 1);
		if (isListOrHeadingLine(prev.text)) return true;
	}
	return false;
}

/**
 * 目标行是否被某个折叠挡住：
 *   - 折叠锚点落在目标行内（widget 在行末，列表项折叠）
 *   - 目标行整体位于折叠隐藏内容内（标题折叠正文 / 折叠块内部）
 */
function findBlockingFold(
	state: EditorState,
	ranges: FoldRange[],
	targetFrom: number,
	targetTo: number,
): FoldRange | null {
	for (const r of ranges) {
		if (!isListOrHeadingFold(state, r)) continue;
		if (r.from >= targetFrom && r.from <= targetTo) return r;
		if (targetFrom >= r.from && targetFrom < r.to) return r;
	}
	return null;
}

/**
 * 处理一次 ↓(dir=1) / ↑(dir=-1)。
 * 目标行被列表/标题折叠挡住时：展开折叠 + 光标落到目标行（保持目标列）。
 * 否则返回 false，交还原生行为。
 */
function handleArrow(view: EditorView, dir: 1 | -1): boolean {
	if (!listEnhancerConfig.arrowKeyEnterFolded) return false;

	const state = view.state;
	const sel = state.selection.main;
	if (sel.anchor !== sel.head) return false; // 有选区 → 不拦截

	const line = state.doc.lineAt(sel.head);
	const targetNum = line.number + dir;
	if (targetNum < 1 || targetNum > state.doc.lines) return false;

	// 上键同级回跳：上一行所属列表项层级比当前低 → 跳到上一个同级列表项
	if (dir === -1 && trySameLevelUpJump(view, state, sel, line, targetNum)) {
		return true;
	}

	const targetLine = state.doc.line(targetNum);
	const blocking = findBlockingFold(
		state,
		getFoldedRanges(state),
		targetLine.from,
		targetLine.to,
	);
	if (!blocking) return false;

	// 目标列：沿用 goalColumn（CM6 记忆的目标列），无则取当前行内字符偏移
	const col = sel.goalColumn ?? (sel.head - line.from);
	const targetPos = Math.min(targetLine.to, targetLine.from + col);

	view.dispatch({
		effects: unfoldEffect.of(blocking),
		selection: EditorSelection.cursor(targetPos, dir === 1 ? 1 : 0, 0, col),
		scrollIntoView: true,
	});
	return true;
}

/**
 * ViewPlugin — 在 capture 阶段拦截 ArrowDown/ArrowUp。
 * 处理成功（返回 true）时阻断原生处理器，避免 CM6 整块跳过。
 */
const arrowCapturePlugin = ViewPlugin.fromClass(
	class {
		private readonly view: EditorView;
		private readonly handler: (event: KeyboardEvent) => void;

		constructor(view: EditorView) {
			this.view = view;

			this.handler = (event: KeyboardEvent) => {
				if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
				// 修饰键组合保留原生行为（Shift 扩展选区、Alt 移动行等）
				if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;

				const dir = event.key === 'ArrowDown' ? 1 : -1;
				if (handleArrow(view, dir)) {
					event.preventDefault();
					event.stopImmediatePropagation();
				}
			};

			view.dom.addEventListener('keydown', this.handler, { capture: true });
		}

		destroy() {
			this.view.dom.removeEventListener('keydown', this.handler, { capture: true });
		}
	},
);

/**
 * 创建上下键进入折叠块 CM6 扩展。
 */
export function createFoldNavigationExtension() {
	return [arrowCapturePlugin];
}
