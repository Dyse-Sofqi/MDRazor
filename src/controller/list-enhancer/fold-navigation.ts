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
 * 仅处理列表项 / 标题折叠，普通代码块折叠保持 CM6 原生跳过行为。
 */

import { EditorSelection, type EditorState } from '@codemirror/state';
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
