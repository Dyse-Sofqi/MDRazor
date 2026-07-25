/**
 * MDRazor — 符号边界提示（Controller）
 *
 * 光标处于隐藏格式标识符与文本内容边界时，在光标下方弹出小框展示
 * 光标与隐藏标识符的位置关系。
 *
 * ── 架构 ──
 *
 * 独立 ViewPlugin，每帧从 format-hider 模块读取 decoration set，
 * 通过 `.between()` 查询光标附近的标记，若处于边界则在光标下方
 * 显示浮动 tooltip。
 *
 * Tooltip 内容：连续隐藏标记字符，用主题色的 | 标记光标位置。
 */

import {
	ViewPlugin,
	ViewUpdate,
	DecorationSet,
	EditorView,
} from '@codemirror/view';
import { formattingConfig, buildDecorations } from './format-hider';

/**
 * 查询光标位置附近的隐藏标记，构建左、右两侧文本。
 *
 * 算法：
 *   1. 从光标 pos 向左右展开，收集相邻 decoration（strictly adjacent）
 *   2. 按 pos 为界分左右两侧
 *   3. 消除每段尾部空白
 *   4. 返回 { left, right } 或 null（无标记边界）
 *
 * @returns 左右文本片段，null 表示光标不在标记边界
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

	// 向右展开：查找从 rightBound 开始的 decoration
	while (true) {
		let expanded = false;
		decorations.between(rightBound, rightBound + 1, (from, to) => {
			if (from === rightBound && from < to) {
				rightBound = to;
				expanded = true;
			}
		});
		if (!expanded) break;
	}

	// 向左展开：查找在 leftBound 结束的 decoration
	while (true) {
		let expanded = false;
		decorations.between(leftBound - 1, leftBound, (from, to) => {
			if (to === leftBound && from < to) {
				leftBound = from;
				expanded = true;
			}
		});
		if (!expanded) break;
	}

	// 无相邻 decoration → 不在边界
	if (leftBound === pos && rightBound === pos) return null;

	// ── 收集两侧文本片段 ──

	const leftParts: string[] = [];
	const rightParts: string[] = [];
	let hasAny = false;

	decorations.between(leftBound, rightBound, (from, to) => {
		hasAny = true;
		if (to <= pos) {
			// decoration 完全在光标左侧
			leftParts.push(view.state.doc.sliceString(from, to).replace(/\s+$/, ''));
		} else if (from >= pos) {
			// decoration 完全在光标右侧
			rightParts.push(view.state.doc.sliceString(from, to).replace(/\s+$/, ''));
		} else {
			// decoration 包含光标位置 → 切开
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

/**
 * 创建符号边界提示的 CM6 扩展。
 *
 * 使用 ViewPlugin 管理一个 position: fixed 的浮动 DOM 元素，
 * 在光标移动到隐藏标记边界时显示提示。
 */
export function createCursorBoundaryHintExtension() {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			hintEl: HTMLElement | null = null;
			markerInfo: { left: string; right: string; pos: number } | null = null;

			constructor(view: EditorView) {
				this.decorations = buildDecorations(view);
				this.updateHint(view, view.state.selection.main.head);
			}

			update(update: ViewUpdate) {
				this.decorations = buildDecorations(update.view);
				if (update.selectionSet || update.docChanged) {
					this.updateHint(update.view, update.view.state.selection.main.head);
				} else if (update.viewportChanged || update.geometryChanged) {
					this.reposition(update.view);
				}
			}

			destroy() {
				if (this.hintEl) {
					this.hintEl.remove();
					this.hintEl = null;
				}
			}

			private updateHint(view: EditorView, pos: number) {
				if (!formattingConfig.symbolBoundaryHint) {
					this.hideHint();
					return;
				}

				const info = getHintMarkers(view, this.decorations, pos);
				if (!info) {
					this.hideHint();
					return;
				}

				this.markerInfo = { ...info, pos };
				this.showHint(view, pos);
			}

			private showHint(view: EditorView, pos: number) {
				if (!this.hintEl) {
					this.hintEl = document.createElement('div');
					this.hintEl.className = 'mdrazor-boundary-hint';

					const leftSpan = document.createElement('span');
					leftSpan.className = 'mdrazor-hint-left';
					const cursorSpan = document.createElement('span');
					cursorSpan.className = 'mdrazor-hint-cursor';
					cursorSpan.textContent = '|';
					const rightSpan = document.createElement('span');
					rightSpan.className = 'mdrazor-hint-right';

					this.hintEl.appendChild(leftSpan);
					this.hintEl.appendChild(cursorSpan);
					this.hintEl.appendChild(rightSpan);
					document.body.appendChild(this.hintEl);
				}

				// 更新内容
				const leftSpan = this.hintEl.children[0] as HTMLElement;
				const rightSpan = this.hintEl.children[2] as HTMLElement;
				leftSpan.textContent = this.markerInfo!.left;
				rightSpan.textContent = this.markerInfo!.right;

				// 定位
				const coords = view.coordsAtPos(pos);
				if (coords) {
					this.hintEl.style.left = coords.left + 'px';
					this.hintEl.style.top = coords.bottom + 2 + 'px';
				}

				this.hintEl.style.display = '';
			}

			private hideHint() {
				this.markerInfo = null;
				if (this.hintEl) {
					this.hintEl.style.display = 'none';
				}
			}

			private reposition(view: EditorView) {
				if (this.markerInfo && this.hintEl && this.hintEl.style.display !== 'none') {
					const coords = view.coordsAtPos(this.markerInfo.pos);
					if (coords) {
						this.hintEl.style.left = coords.left + 'px';
						this.hintEl.style.top = coords.bottom + 2 + 'px';
					} else {
						this.hideHint();
					}
				}
			}
		},
	);
}
