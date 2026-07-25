/**
 * MDRazor — 符号边界提示（Controller）
 *
 * 光标处于隐藏格式标识符与文本内容边界时，在光标下方弹出小框展示
 * 光标与隐藏标识符的位置关系。
 *
 * ── 架构 ──
 *
 * 使用 CM6 的 showTooltip 系统：
 *   - ViewPlugin 每帧计算装饰集，当光标位于标记边界时 dispatch
 *     StateEffect 触发 tooltip 显示
 *   - StateField 存储 tooltip 数组，由 showTooltip.compute 提供
 *   - CM6 自动处理 tooltip 的滚动重定位和编辑器销毁清理
 *
 * Tooltip 内容：连续隐藏标记字符，用主题色的 | 标记光标位置。
 */

import {
	ViewPlugin,
	ViewUpdate,
	DecorationSet,
	EditorView,
	Tooltip,
	showTooltip,
} from '@codemirror/view';
import { StateEffect, StateField } from '@codemirror/state';
import { formattingConfig, buildDecorations } from './format-hider';

/* ── Tooltip 状态管理 ── */

/** StateEffect：携带一个 Tooltip 对象或 null（隐藏） */
const setBoundaryHint = StateEffect.define<Tooltip | null>();

/** StateField：当前激活的 tooltip 列表（0 或 1 个） */
const boundaryHintState = StateField.define<readonly Tooltip[]>({
	create: () => [],
	update(tooltips, tr) {
		for (const e of tr.effects) {
			if (e.is(setBoundaryHint)) {
				return e.value ? [e.value] : [];
			}
		}
		return tooltips;
	},
});

/* ── Tooltip 构建 ── */

function buildBoundaryTooltip(
	left: string,
	right: string,
	pos: number,
): Tooltip {
	const dom = document.createElement('div');
	dom.className = 'mdrazor-boundary-hint';

	const leftSpan = document.createElement('span');
	leftSpan.className = 'mdrazor-hint-left';
	leftSpan.textContent = left;

	const cursorSpan = document.createElement('span');
	cursorSpan.className = 'mdrazor-hint-cursor';
	cursorSpan.textContent = '|';

	const rightSpan = document.createElement('span');
	rightSpan.className = 'mdrazor-hint-right';
	rightSpan.textContent = right;

	dom.appendChild(leftSpan);
	dom.appendChild(cursorSpan);
	dom.appendChild(rightSpan);

	return {
		pos,
		above: false,
		strictSide: true,
		create: () => ({ dom }),
	};
}

/* ── 标记查询（与之前相同） ── */

/**
 * 查询光标位置附近的隐藏标记，构建左、右两侧文本。
 *
 * 算法：
 *   1. 从光标 pos 向左右展开，收集相邻 decoration（strictly adjacent）
 *   2. 按 pos 为界分左右两侧
 *   3. 消除每段尾部空白
 *   4. 返回 { left, right } 或 null（无标记边界）
 */
function getHintMarkers(
	view: EditorView,
	decorations: DecorationSet,
	pos: number,
): { left: string; right: string } | null {
	if (!formattingConfig.symbolBoundaryHint) return null;

	// ── 向左右展开：找到光标所在的连续 decoration 块 ──

	let leftBound = pos;
	let rightBound = pos;

	// 向右展开
	while (true) {
		let expanded = false;
		decorations.between(rightBound, rightBound + 1, (from, to) => {
			if (from <= rightBound && to > rightBound) {
				rightBound = Math.max(rightBound, to);
				expanded = true;
			}
		});
		if (!expanded) break;
	}

	// 向左展开
	while (true) {
		let expanded = false;
		decorations.between(leftBound - 1, leftBound, (from, to) => {
			if (from < leftBound && to >= leftBound) {
				leftBound = Math.min(leftBound, from);
				expanded = true;
			}
		});
		if (!expanded) break;
	}

	if (leftBound === pos && rightBound === pos) return null;

	// ── 收集两侧文本片段 ──

	const leftParts: string[] = [];
	const rightParts: string[] = [];
	const seenRanges = new Set<number>();
	let hasAny = false;

	decorations.between(leftBound, rightBound, (from, to) => {
		hasAny = true;

		// 跳同 range 重复 decoration（format-hider 对加粗/斜体等产生 open+close 同范围条目）
		if (seenRanges.has(from) && seenRanges.has(to)) return;
		seenRanges.add(from);
		seenRanges.add(to);

		if (to <= pos) {
			leftParts.push(view.state.doc.sliceString(from, to).replace(/\s+$/, ''));
		} else if (from >= pos) {
			rightParts.push(view.state.doc.sliceString(from, to).replace(/\s+$/, ''));
		} else {
			const lt = view.state.doc.sliceString(from, pos).replace(/\s+$/, '');
			const rt = view.state.doc.sliceString(pos, to).replace(/\s+$/, '');
			if (lt) leftParts.push(lt);
			if (rt) rightParts.push(rt);
		}
	});

	if (!hasAny) return null;

	const left = leftParts.join('');
	const right = rightParts.join('');
	if (!left && !right) return null;

	return { left, right };
}

/* ── 扩展工厂 ── */

/**
 * 创建符号边界提示的 CM6 扩展。
 *
 * 返回包含 StateField 和 ViewPlugin 的扩展数组：
 *   - StateField 管理 tooltip 生命周期
 *   - ViewPlugin 在光标移动时计算标记并 dispatch tooltip 效果
 *
 * CM6 的 showTooltip 系统自动处理：
 *   - 滚动时 tooltip 跟随光标（重定位）
 *   - 编辑器销毁时清理 tooltip DOM
 *   - tooltip 在光标下方定位
 */
export function createCursorBoundaryHintExtension() {
	return [
		boundaryHintState,
		showTooltip.compute([boundaryHintState], (state): Tooltip | null => {
			const arr = state.field(boundaryHintState);
			return arr.length > 0 ? arr[0]! : null;
		}),
		ViewPlugin.fromClass(
			class {
				decorations: DecorationSet;
				private lastPos: number | null = null;
				private lastLeft = '';
				private lastRight = '';

				constructor(view: EditorView) {
					this.decorations = buildDecorations(view);
					this.updateHint(view, view.state.selection.main.head);
				}

				update(update: ViewUpdate) {
					this.decorations = buildDecorations(update.view);
					if (update.selectionSet || update.docChanged) {
						this.updateHint(update.view, update.view.state.selection.main.head);
					}
				}

				private updateHint(view: EditorView, pos: number) {
					if (!formattingConfig.symbolBoundaryHint) {
						this.clearHint(view);
						return;
					}

					const info = getHintMarkers(view, this.decorations, pos);
					if (!info) {
						this.clearHint(view);
						return;
					}

					if (
						pos === this.lastPos &&
						info.left === this.lastLeft &&
						info.right === this.lastRight
					) {
						return;
					}

					this.lastPos = pos;
					this.lastLeft = info.left;
					this.lastRight = info.right;

					// queueMicrotask 避免在 update() 中 dispatch 导致递归
					queueMicrotask(() => {
						view.dispatch({
							effects: setBoundaryHint.of(
								buildBoundaryTooltip(info.left, info.right, pos),
							),
						});
					});
				}

				private clearHint(view: EditorView) {
					if (this.lastPos === null) return;
					this.lastPos = null;
					this.lastLeft = '';
					this.lastRight = '';

					// queueMicrotask 避免在 update() 中 dispatch 导致递归
					queueMicrotask(() => {
						view.dispatch({
							effects: setBoundaryHint.of(null),
						});
					});
				}
			},
		),
	];
}
