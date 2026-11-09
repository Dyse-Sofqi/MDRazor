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
	TooltipView,
	Direction,
	showTooltip,
	Rect,
} from '@codemirror/view';
import { StateEffect, StateField } from '@codemirror/state';
import { formattingConfig, buildDecorations } from './format-hider';
import { spaceConfig } from './whitespace-visible';

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

/**
 * 量出弹框内 `|` 相对弹框左边缘的水平偏移，使 `|` 与光标对齐。
 *
 * CM6 把弹框左边缘定位在 `光标 x + offset.x`（tooltipSpace 是整个视口，
 * 左侧为 0，故负偏移不会被裁剪）。设 `|` 字形中心距弹框左边缘为 d，
 * 取 offset.x = -d，`|` 即落在光标的屏幕 x 上。这样光标在隐藏标记内左右
 * 移动时，`|` 始终压住光标不动，只有弹框随标记文本长短伸缩。
 *
 * 在 mount() 中调用：此时弹框已插入文档、布局可量。量的是框内相对量
 * （`|` 中心 − 弹框左边缘），与弹框此刻所处屏幕位置无关。
 *
 * 仅 LTR 下计算：RTL 的定位公式是镜像的（以右边缘对齐锚点），负偏移会
 * 推向反方向，故留 0 保持原有行为。
 */
function barAlignOffset(
	view: EditorView,
	dom: HTMLElement,
	bar: HTMLElement,
): number {
	if (view.textDirection !== Direction.LTR) return 0;
	const box = dom.getBoundingClientRect();
	const rect = bar.getBoundingClientRect();
	return -(rect.left + rect.width / 2 - box.left);
}

/**
 * 针对未激活行渲染为 cm-html-embed widget 的成对 HTML 标签，
 * 当其内容较长发生自动折行（Line Wrapping）时，CodeMirror 6 内部因原子 Widget
 * 机制会将整段文本映射在第一行末尾（coordsAtPos 返回第一行最右端坐标），
 * 导致光标处于闭标签附近时，提示弹框被错误定位到上一行末尾。
 *
 * 本函数通过遍历 DOM 树中当前可见的 cm-html-embed，若目标位置处于该 HTML 的
 * 内容区间或闭标签处，直接读取 DOM 内真实文本字符的几何包围盒，
 * 确保在折行多行场景下能 100% 精准定位到文字真实的末尾（如折行后的第二行“。”右侧）。
 */
function resolveHtmlEmbedCoords(view: EditorView, targetPos: number): Rect | null {
	const embeds = Array.from(view.contentDOM.querySelectorAll<HTMLElement>('.cm-html-embed'));
	for (const embed of embeds) {
		if (embed.classList.contains('cm-embed-block')) continue;
		const start = view.posAtDOM(embed, 0);
		if (start < 0) continue;
		const docStr = view.state.doc.sliceString(start);
		const openMatch = docStr.match(/^<([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^>]*)?>/);
		if (!openMatch) continue;
		const tagName = openMatch[1]!;
		const openLen = openMatch[0].length;
		const closeRe = new RegExp('</' + tagName + '\\s*>', 'i');
		const closeMatch = docStr.match(closeRe);
		if (!closeMatch || closeMatch.index === undefined) continue;

		const contentStart = start + openLen;
		const embedEnd = start + closeMatch.index + closeMatch[0].length;

		if (targetPos >= contentStart && targetPos <= embedEnd) {
			const walker = embed.ownerDocument.createTreeWalker(embed, NodeFilter.SHOW_TEXT);
			const textNodes: Node[] = [];
			for (let n = walker.nextNode(); n; n = walker.nextNode()) textNodes.push(n);

			let currentOffset = contentStart;
			for (const tn of textNodes) {
				const val = tn.nodeValue || '';
				const nodeEnd = currentOffset + val.length;
				if (targetPos >= currentOffset && targetPos <= nodeEnd) {
					const charIdx = targetPos - currentOffset;
					const r = embed.ownerDocument.createRange();
					if (charIdx === 0) {
						r.setStart(tn, 0);
						r.setEnd(tn, Math.min(1, val.length));
						const b = r.getBoundingClientRect();
						return { left: b.left, right: b.left, top: b.top, bottom: b.bottom };
					} else {
						r.setStart(tn, charIdx - 1);
						r.setEnd(tn, charIdx);
						const b = r.getBoundingClientRect();
						return { left: b.right, right: b.right, top: b.top, bottom: b.bottom };
					}
				}
				currentOffset = nodeEnd;
			}

			// 落在闭标签内部或末尾 (contentEnd < targetPos <= embedEnd)
			if (textNodes.length > 0) {
				const lastNode = textNodes[textNodes.length - 1]!;
				const val = lastNode.nodeValue || '';
				if (val.length > 0) {
					const r = embed.ownerDocument.createRange();
					r.setStart(lastNode, val.length - 1);
					r.setEnd(lastNode, val.length);
					const b = r.getBoundingClientRect();
					return { left: b.right, right: b.right, top: b.top, bottom: b.bottom };
				}
			}
		}
	}
	return null;
}

function buildBoundaryTooltip(
	left: string,
	right: string,
	pos: number,
): Tooltip {
	// 用 Obsidian DOM 助手而非 createElement（审核取向 obsidianmd/prefer-create-el）：
	// 顶层弹框是游离节点（由 CM6 挂载到编辑器 DOM 上），用独立导出的 createDiv()；
	// 三个 span 直接建在 dom 上（createSpan 自带挂载，无需再 appendChild）。
	const dom = createDiv({ cls: 'mdrazor-boundary-hint' });

	// 弹框展示被隐藏的标记原文。仅当空格可视化开启时才用 `·` 替代空格，
	// 与编辑器内的空格展示保持一致；关闭时保留原文空格。
	const display = (text: string): string =>
		spaceConfig.showWhitespace ? text.replace(/ /g, '·') : text;

	// 三个 span 直接建在 dom 上（createSpan 自带挂载，无需再 appendChild）。
	// 留 `|` 的引用：mount 时要量它相对弹框左边缘的位置。
	dom.createSpan({ cls: 'mdrazor-hint-left', text: display(left) });
	const bar = dom.createSpan({ cls: 'mdrazor-hint-cursor', text: '|' });
	dom.createSpan({ cls: 'mdrazor-hint-right', text: display(right) });

	return {
		pos,
		above: false,
		strictSide: true,
		// create 每次都是新闭包：TooltipViewManager 以 create 的函数标识判断
		// 能否复用 tooltipView，新闭包即触发重建，重建就会重新 mount 量一次偏移
		create: (view: EditorView): TooltipView => {
			const tooltipView: TooltipView = {
				dom,
				offset: { x: 0, y: 0 },
				getCoords: (targetPos: number): Rect => {
					const embedCoords = resolveHtmlEmbedCoords(view, targetPos);
					if (embedCoords) return embedCoords;

					const direct =
						view.coordsAtPos(targetPos) ||
						view.coordsAtPos(targetPos, -1) ||
						view.coordsAtPos(targetPos, 1);
					if (direct) return direct;

					// 当 targetPos 落在 display: none 的 HTML 标签内或其末尾时（如 </font> 的起点 766 到末尾 773），
					// view.coordsAtPos(targetPos) 返回 null。
					// 必须【严格限制在同一行】内搜索有效坐标！
					// 若向前越界跨到了下一行（如 targetPos + 1 = 774 跨入下一行开头），
					// 会导致原本位于当前行末尾的弹框被错误定位到下一行首个字符（左下角），甚至溢出左边屏幕。
					const line = view.state.doc.lineAt(targetPos);

					// 1. 优先在当前行内向前（向左）搜索最近的有效坐标（如 766 处“。”的坐标）
					for (let d = 1; d <= 30; d++) {
						if (targetPos - d >= line.from) {
							const prev =
								view.coordsAtPos(targetPos - d, -1) ||
								view.coordsAtPos(targetPos - d, 1);
							if (prev) return prev;
						}
					}

					// 2. 其次在当前行内向后（向右）搜索最近的有效坐标
					for (let d = 1; d <= 30; d++) {
						if (targetPos + d <= line.to) {
							const next =
								view.coordsAtPos(targetPos + d, 1) ||
								view.coordsAtPos(targetPos + d, -1);
							if (next) return next;
						}
					}
					return { left: 0, right: 0, top: -10000, bottom: -10000 };
				},
				mount: (editorView) => {
					tooltipView.offset = {
						x: barAlignOffset(editorView, dom, bar),
						y: 0,
					};
				},
			};
			return tooltipView;
		},
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

	// 连续块内可能存在重叠/相邻的装饰（如 `***` = 加粗 `**` 与斜体 `*`
	// 同起点或相邻）。若逐条装饰切片再拼接，重叠部分会被重复计入，
	// 导致弹框多显示字符（`***` 变成 `****`）。
	// 改为对整个连续块一次性切片 —— 弹框显示的字符即文档中真实的隐藏标记。
	const blockText = view.state.doc.sliceString(leftBound, rightBound);
	const offset = pos - leftBound;
	// 左侧片段不裁剪尾随空格：光标右边的空格在左侧是尾字符，裁剪会让
	// 它消失。右侧片段才裁剪 —— 那是块末尾（标题 `# ` 等场景）。
	const left = blockText.slice(0, offset);
	const right = blockText.slice(offset).replace(/\s+$/, '');
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
				private lastWhitespace = spaceConfig.showWhitespace;
				private lastHintEnabled = formattingConfig.symbolBoundaryHint;

				constructor(view: EditorView) {
					this.decorations = buildDecorations(view);
					this.updateHint(view, view.state.selection.main.head);
				}

				update(update: ViewUpdate) {
					this.decorations = buildDecorations(update.view);
					// 「符号边界提示」开关翻转时必须也走一次 updateHint：设置面板改开关
					// 只会派发**空事务**（无 selectionSet / docChanged），否则关掉开关后
					// 已显示的弹框会一直留到下次光标移动。
					const hintChanged = formattingConfig.symbolBoundaryHint !== this.lastHintEnabled;
					this.lastHintEnabled = formattingConfig.symbolBoundaryHint;
					if (
						update.selectionSet ||
						update.docChanged ||
						update.geometryChanged ||
						hintChanged
					) {
						// 清掉位置缓存，让 updateHint 内部的「位置/左右文本未变」早退失效
						if (hintChanged) this.lastPos = null;
						this.updateHint(
							update.view,
							update.view.state.selection.main.head,
							update.geometryChanged,
						);
					}
				}

				private updateHint(
					view: EditorView,
					pos: number,
					geometryChanged = false,
				) {
					if (!formattingConfig.symbolBoundaryHint) {
						this.clearHint(view);
						return;
					}

					const info = getHintMarkers(view, this.decorations, pos);
					if (!info) {
						this.clearHint(view);
						return;
					}

					// 空格可视化开关翻转时强制重建弹框：否则左/右文本未变，
					// 早退会让已显示的弹框保留旧 `·`/空格 渲染。
					const wsChanged =
						this.lastWhitespace !== spaceConfig.showWhitespace;
					this.lastWhitespace = spaceConfig.showWhitespace;

					// 几何变化（缩放、字体、面板尺寸）同样强制重建：对齐偏移是
					// mount 时按字号量出来的，字号变了旧偏移就失准。滚动不置
					// geometryChanged（见 CM6 UpdateFlag.Geometry），故不会每帧重建。
					if (
						pos === this.lastPos &&
						info.left === this.lastLeft &&
						info.right === this.lastRight &&
						!wsChanged &&
						!geometryChanged
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
						// Tooltip DOM 插入后立即调度一次测量，确保 CM6 tooltipPlugin
						// 准确定位，避免首帧留在 Outside (-10000px)
						view.requestMeasure();
						window.requestAnimationFrame(() => {
							view.requestMeasure();
						});
					});
				}

				private clearHint(view: EditorView) {
					if (this.lastPos === null) return;
					this.lastPos = null;
					this.lastLeft = '';
					this.lastRight = '';
					this.lastWhitespace = spaceConfig.showWhitespace;

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
