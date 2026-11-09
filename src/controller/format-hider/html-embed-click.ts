/**
 * MDRazor — 未激活成对 HTML 标签内联 Widget（cm-html-embed）智能点击定位
 *
 * ── 为什么需要此模块 ──
 *
 * 在 Obsidian 实时预览中，未激活行上的成对 HTML（如 <font color="...">、
 * <u>、<sup>、<span> 等）会被原生渲染为一个带有 .cm-html-embed 类的原子 Widget。
 *
 * 当用户点击这些富文本文字时，Obsidian 原生的 hookClickHandler 会把该 Widget
 * 当作不可编辑的嵌入对象，粗暴调用 selectElement() 将整个 HTML 源码区间
 * 全选高亮（[start, end]），并将光标端点 head 设在 start（即开标签起始的 < 处）。
 * 光标落入标签起点后，立即触发 caret-reveal 将开标签源码强制展开显形，
 * 导致用户点击文字时光标跳入前置标签首个 < 之后（如 <|font），体验极其割裂。
 *
 * 本模块在捕获阶段拦截对已托管成对 HTML embed 的鼠标点击：
 *   1. 阻止原生的 selectElement 全选行为；
 *   2. 通过浏览器的 caretPositionFromPoint / caretRangeFromPoint 精确算出
 *      用户点击的文字在 DOM 中的字符偏移；
 *   3. 结合开标签在文档中的起始位置与长度，直接将光标精准折叠定位到用户点击
 *      的具体字符之间；
 *   4. 避免光标落在开/闭标签内部，使标签在点击后完美保持隐藏状态，实现如同
 *      编辑普通 Markdown 正文般的原生自然体验。
 */

import { EditorView, ViewPlugin } from '@codemirror/view';
import { EditorSelection, type Extension } from '@codemirror/state';
import { formattingConfig } from './format-hider';

/**
 * 拖选跟踪上下文：
 * 当用户在 HTML embed 或行末闭标签后方按下并拖拽鼠标时，
 * 接管 document 级 mousemove 与 mouseup 事件，精确更新选区。
 */
interface HtmlDragState {
	view: EditorView;
	anchorPos: number;
	startX: number;
	startY: number;
	isDragging: boolean;
}

let currentDragState: HtmlDragState | null = null;
let dragListenersBound = false;

function ensureHtmlDragListeners(): void {
	if (dragListenersBound) return;
	dragListenersBound = true;

			window.addEventListener(
				'mousemove',
				(e: MouseEvent) => {
					if (!currentDragState || e.buttons === 0) {
						currentDragState = null;
						return;
					}

					const dx = Math.abs(e.clientX - currentDragState.startX);
					const dy = Math.abs(e.clientY - currentDragState.startY);
					if (!currentDragState.isDragging && (dx > 3 || dy > 3)) {
						currentDragState.isDragging = true;
					}

					if (!currentDragState.isDragging) return;

					const { view, anchorPos } = currentDragState;
					if (!view.dom.isConnected) {
						currentDragState = null;
						return;
					}

					const headPos = resolveDocPosFromPoint(view, e.clientX, e.clientY);
					if (headPos !== null && headPos >= 0 && headPos <= view.state.doc.length) {
						const normalized = normalizeHtmlSelection(view, anchorPos, headPos);
						view.dispatch({
							selection: EditorSelection.range(normalized.anchor, normalized.head),
							scrollIntoView: false,
							userEvent: 'select.pointer',
						});
					}
				},
				true,
			);

			window.addEventListener(
				'click',
				(e: MouseEvent) => {
					if (currentDragState?.isDragging) {
						e.stopPropagation();
						e.preventDefault();
					}
				},
				true,
			);

	window.addEventListener(
		'mouseup',
		() => {
			// 延迟一帧清空，保证在 click 事件中仍能感知拖拽状态以阻止 click 触发 selectElement
			window.requestAnimationFrame(() => {
				currentDragState = null;
			});
		},
		true,
	);
}

function startDragTracking(view: EditorView, anchorPos: number, startX: number, startY: number): void {
	ensureHtmlDragListeners();
	currentDragState = {
		view,
		anchorPos,
		startX,
		startY,
		isDragging: false,
	};
}

/** 检查特定标签名是否当前启用了隐藏 */
function isTagTypeHidden(tagName: string): boolean {
	const tag = tagName.toLowerCase();
	if (tag === 'font') return formattingConfig.hideHtmlColorTagFormatting;
	if (tag === 'u') return formattingConfig.hideHtmlUnderlineFormatting;
	if (tag === 'span') return formattingConfig.hideHtmlSpanFormatting;
	return formattingConfig.hideOtherHtmlTagFormatting;
}

/**
 * 规范化选区，处理 HTML 成对标签的对称边界与纯文字边界吸附：
 * 1. 若选区完整覆盖了某成对 HTML 的可见文字区间，自动向外扩展成对包含完整开闭标签；
 * 2. 若选区仅在成对 HTML 内部选择部分文字，保留在纯文字区间内，不产生单边标签破坏；
 * 3. 严格尊重用户的真实拖拽方向（保持 anchor 与 head 的正反向关系）。
 */
export function normalizeHtmlSelection(
	view: EditorView,
	anchor: number,
	head: number,
): { anchor: number; head: number } {
	if (anchor === head) return { anchor, head };

	const docText = view.state.doc.toString();
	const forward = anchor <= head;
	let from = Math.min(anchor, head);
	let to = Math.max(anchor, head);

	// 扫描视口或当前行内的所有成对 HTML 标签
	const lineFrom = view.state.doc.lineAt(from);
	const lineTo = view.state.doc.lineAt(to);
	const scanStart = lineFrom.from;
	const scanEnd = lineTo.to;
	const scanSlice = docText.slice(scanStart, scanEnd);

	const openTagRe = /<([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^>]*)?>/g;
	let match: RegExpExecArray | null;
	while ((match = openTagRe.exec(scanSlice)) !== null) {
		const tagStart = scanStart + match.index;
		const tagName = match[1]!;
		if (!isTagTypeHidden(tagName)) continue;

		const openTagLen = match[0].length;
		const rest = docText.slice(tagStart);
		const closeMatch = rest.match(new RegExp('</' + tagName + '\\s*>', 'i'));
		if (!closeMatch || closeMatch.index === undefined) continue;

		const textStart = tagStart + openTagLen;
		const textEnd = tagStart + closeMatch.index;
		const tagEnd = textEnd + closeMatch[0].length;

		// 选区与该 HTML 块有交集
		if (to > tagStart && from < tagEnd) {
			// 情况 1：选区完整覆盖或超出了该 HTML 块的所有正文文本
			// 只要选区起点到达了 textStart 且终点到达了 textEnd，自动成对包裹两端标签
			const coversEntireText = from <= textStart && to >= textEnd;
			if (coversEntireText) {
				if (from > tagStart) from = tagStart;
				if (to < tagEnd) to = tagEnd;
			} else if (from >= textStart && to <= textEnd) {
				// 情况 2：选区完全位于该 HTML 块的内部文字区间（纯文字划词选择）
				// 保持原样，不向外扩展标签
			} else if (from < textStart && to < textEnd && to > tagStart) {
				// 情况 3：从外部划入，但终点停在内部文字中间
				// 若从左往右划，起点在外部（< tagStart），终点在文字中间，保证开标签完整包入
				if (from > tagStart) from = tagStart;
			} else if (from > textStart && from < tagEnd && to > tagEnd) {
				// 情况 4：从内部文字划出到外部，保证闭标签完整包入
				if (to < tagEnd) to = tagEnd;
			}
		}
	}

	return {
		anchor: forward ? from : to,
		head: forward ? to : from,
	};
}

/**
 * 将屏幕坐标 (clientX, clientY) 解析为文档位置。
 * 能够正确处理包含 .cm-html-embed 的内联区域及折行末尾。
 */
function resolveDocPosFromPoint(view: EditorView, clientX: number, clientY: number): number | null {
	const doc = view.dom.ownerDocument;
	const target = doc.elementFromPoint(clientX, clientY) as HTMLElement | null;
	if (!target || !view.contentDOM.contains(target)) {
		return null;
	}

	// 1. 若命中某 .cm-html-embed
	const embed = target.closest<HTMLElement>('.cm-html-embed');
	if (embed && !embed.classList.contains('cm-embed-block')) {
		return calculatePosInEmbed(view, embed, clientX, clientY);
	}

	// 2. 检查是否在 cm-line 范围
	const lineEl = target.closest<HTMLElement>('.cm-line');
	if (lineEl && lineEl.closest('.cm-content') === view.contentDOM) {
		const lineStart = view.posAtDOM(lineEl, 0);
		if (lineStart >= 0 && lineStart < view.state.doc.length) {
			const line = view.state.doc.lineAt(lineStart);

			// 检查该行末尾是否有成对 HTML 标签
			const closeMatch = line.text.match(/<\/[a-zA-Z][a-zA-Z0-9-]*\s*>$/);
			if (closeMatch && closeMatch.index !== undefined) {
				// 查找最后一个可见内容节点
				const isHiddenTagNode = (node: Node): boolean => {
					if (node.nodeType !== Node.ELEMENT_NODE) return false;
					const el = node as HTMLElement;
					return (
						el.classList.contains('mdrazor-html-tag-hidden') ||
						el.querySelector('.mdrazor-html-tag-hidden') !== null
					);
				};
				const children = Array.from(lineEl.childNodes);
				let lastVisibleChild: Node | null = null;
				for (let i = children.length - 1; i >= 0; i--) {
					const c = children[i]!;
					if (isHiddenTagNode(c)) continue;
					if (c.nodeType === Node.ELEMENT_NODE) {
						const el = c as HTMLElement;
						const r = el.getBoundingClientRect();
						if (r.width > 0 && r.height > 0) {
							lastVisibleChild = c;
							break;
						}
					} else if (c.nodeType === Node.TEXT_NODE) {
						if (c.nodeValue && c.nodeValue.length > 0) {
							lastVisibleChild = c;
							break;
						}
					}
				}

				if (lastVisibleChild) {
					const range = lineEl.ownerDocument.createRange();
					range.selectNodeContents(lastVisibleChild);
					const rects = Array.from(range.getClientRects());
					if (rects.length > 0) {
						const lastRect = rects[rects.length - 1]!;
						if (
							(clientY >= lastRect.top - 4 &&
								clientY <= lastRect.bottom + 4 &&
								clientX >= lastRect.right - 2) ||
							clientY > lastRect.bottom + 4
						) {
							return line.to;
						}
					}
				}
			}
		}
	}

	// 3. 原生退化方案
	return view.posAtCoords({ x: clientX, y: clientY }, false);
}

/**
 * 计算 (clientX, clientY) 在特定 .cm-html-embed 内的精确文档位置
 */
function calculatePosInEmbed(view: EditorView, embedEl: HTMLElement, clientX: number, clientY: number): number {
	const widgetStart = view.posAtDOM(embedEl, 0);
	const docText = view.state.doc.toString();
	if (widgetStart < 0 || widgetStart >= docText.length) {
		return widgetStart;
	}

	const openTagMatch = docText.slice(widgetStart).match(/^<([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^>]*)?>/);
	if (!openTagMatch) return widgetStart;

	const tagName = openTagMatch[1]!;
	const openTagLen = openTagMatch[0].length;
	const doc = embedEl.ownerDocument;

	const walker = doc.createTreeWalker(embedEl, NodeFilter.SHOW_TEXT);
	const textNodes: Node[] = [];
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		textNodes.push(n);
	}

	interface CharMetric {
		char: string;
		offsetInEmbed: number;
		left: number;
		right: number;
		midX: number;
		top: number;
		bottom: number;
	}

	const charMetrics: CharMetric[] = [];
	let cumulativeOffset = 0;
	for (const tn of textNodes) {
		const val = tn.nodeValue || '';
		for (let i = 0; i < val.length; i++) {
			const r = doc.createRange();
			r.setStart(tn, i);
			r.setEnd(tn, i + 1);
			const box = r.getBoundingClientRect();
			charMetrics.push({
				char: val[i]!,
				offsetInEmbed: cumulativeOffset + i,
				left: box.left,
				right: box.right,
				midX: (box.left + box.right) / 2,
				top: box.top,
				bottom: box.bottom,
			});
		}
		cumulativeOffset += val.length;
	}

	const closeTagRe = new RegExp('</' + tagName + '\\s*>', 'i');
	const docRest = docText.slice(widgetStart);
	const closeTagMatch = docRest.match(closeTagRe);

	if (charMetrics.length === 0) {
		return widgetStart + openTagLen;
	}

	const rowMetrics = charMetrics.filter((m) => clientY >= m.top - 3 && clientY <= m.bottom + 3);
	const activeMetrics = rowMetrics.length > 0 ? rowMetrics : charMetrics;
	const lastMetric = activeMetrics[activeMetrics.length - 1]!;
	const firstMetric = activeMetrics[0]!;

	if (clientX >= lastMetric.midX) {
		if (lastMetric.offsetInEmbed === charMetrics.length - 1 && closeTagMatch && closeTagMatch.index !== undefined) {
			return widgetStart + closeTagMatch.index + closeTagMatch[0].length;
		}
		return widgetStart + openTagLen + lastMetric.offsetInEmbed + 1;
	} else if (clientX <= firstMetric.midX) {
		if (firstMetric.offsetInEmbed === 0) {
			return widgetStart;
		}
		return widgetStart + openTagLen + firstMetric.offsetInEmbed;
	} else {
		for (let i = 0; i < activeMetrics.length; i++) {
			const m = activeMetrics[i]!;
			if (clientX >= m.left && clientX <= m.right) {
				return widgetStart + openTagLen + (clientX >= m.midX ? m.offsetInEmbed + 1 : m.offsetInEmbed);
			} else if (i < activeMetrics.length - 1 && clientX > m.right && clientX < activeMetrics[i + 1]!.left) {
				return widgetStart + openTagLen + m.offsetInEmbed + 1;
			}
		}
	}

	return widgetStart + openTagLen;
}

/**
 * 处理对 .cm-html-embed 的 mousedown 事件。
 * 成功接管定位返回 true（阻止后续原生行为），否则返回 false 放行。
 */
function handleEmbedMouseDown(event: MouseEvent, view: EditorView): boolean {
	if (
		event.button !== 0 ||
		event.shiftKey ||
		event.ctrlKey ||
		event.metaKey ||
		event.altKey
	) {
		return false;
	}

	const target = event.target as HTMLElement | null;
	if (!target || typeof target.closest !== 'function') {
		return false;
	}

	const clickX = event.clientX;
	const clickY = event.clientY;

	// 优先直接匹配点击在 embed 内部的元素
	let embedEl = target.closest<HTMLElement>('.cm-html-embed');

	// 若点击在 cm-line 边缘空白处（如行末折行后句号右侧，或者同一行的空白处），
	// event.target 可能是 .cm-line，需分别处理未激活状态（cm-html-embed）与激活状态（展开DOM但标签隐藏）。
	if (!embedEl) {
		const lineEl = target.closest<HTMLElement>('.cm-line');
		if (lineEl && view.contentDOM.contains(lineEl)) {
			const lineEmbeds = Array.from(lineEl.querySelectorAll<HTMLElement>('.cm-html-embed'));
			for (const candidate of lineEmbeds) {
				if (candidate.classList.contains('cm-embed-block')) continue;
				// 检查 candidate 是否是该行末尾的内联 HTML
				const nextSibling = candidate.nextElementSibling;
				const isAtLineEnd =
					!nextSibling ||
					(nextSibling.classList.contains('cm-widgetBuffer') && !nextSibling.nextElementSibling);
				if (isAtLineEnd) {
					const range = candidate.ownerDocument.createRange();
					range.selectNode(candidate);
					const rects = Array.from(range.getClientRects());
					if (rects.length > 0) {
						const lastRect = rects[rects.length - 1]!;
						// 如果点击在最后一行片段的右侧空白处（垂直方向在该行范围内，水平方向在右边）
						if (
							clickY >= lastRect.top - 4 &&
							clickY <= lastRect.bottom + 4 &&
							clickX >= lastRect.left
						) {
							embedEl = candidate;
							break;
						}
					}
				}
			}

			// 若不是未激活的 embed，检查当前激活行末尾是否有隐藏的 HTML 闭标签
			// 场景：光标此前停留在 |</xxx>（在闭标签前面），行处于激活态；
			// 用户点击该行后方空白处时，由于闭标签有 display: none 且末尾缺少承载节点，
			// 浏览器原生机制无法跳过隐藏节点，导致光标死锁在 |</xxx> 无法移动到 </xxx>|。
			// 此时由本模块主动接管，将光标定位至行末闭标签之后（</xxx>|）。
			if (!embedEl) {
				const lineStart = view.posAtDOM(lineEl, 0);
				if (lineStart >= 0 && lineStart < view.state.doc.length) {
					const line = view.state.doc.lineAt(lineStart);
					const lineText = line.text;
					const closeMatch = lineText.match(/<\/[a-zA-Z][a-zA-Z0-9-]*\s*>$/);
					if (closeMatch && closeMatch.index !== undefined) {
						const lineRect = lineEl.getBoundingClientRect();

						// 辅助函数：判断节点是否属于隐藏的 HTML 标签标记
						const isHiddenTagNode = (node: Node): boolean => {
							if (node.nodeType !== Node.ELEMENT_NODE) return false;
							const el = node as HTMLElement;
							return (
								el.classList.contains('mdrazor-html-tag-hidden') ||
								el.querySelector('.mdrazor-html-tag-hidden') !== null
							);
						};

						// 从后往前查找行内最后一个可见的内容节点（跳过末尾所有隐藏的 HTML 标签）
						let lastVisibleChild: Node | null = null;
						const children = Array.from(lineEl.childNodes);
						for (let i = children.length - 1; i >= 0; i--) {
							const c = children[i]!;
							if (isHiddenTagNode(c)) continue;
							if (c.nodeType === Node.ELEMENT_NODE) {
								const el = c as HTMLElement;
								const r = el.getBoundingClientRect();
								if (r.width > 0 && r.height > 0) {
									lastVisibleChild = c;
									break;
								}
							} else if (c.nodeType === Node.TEXT_NODE) {
								if (c.nodeValue && c.nodeValue.length > 0) {
									lastVisibleChild = c;
									break;
								}
							}
						}

						let lastRect: DOMRect | null = null;
						if (lastVisibleChild) {
							const range = lineEl.ownerDocument.createRange();
							range.selectNodeContents(lastVisibleChild);
							const rects = Array.from(range.getClientRects());
							if (rects.length > 0) {
								lastRect = rects[rects.length - 1]!;
							}
						}

						const isClickPastLastContent =
							lastRect !== null &&
							((clickY >= lastRect.top - 4 &&
								clickY <= lastRect.bottom + 4 &&
								clickX >= lastRect.right - 2) ||
								clickY > lastRect.bottom + 4);

						if (
							clickY >= lineRect.top - 4 &&
							clickY <= lineRect.bottom + 4 &&
							isClickPastLastContent
						) {
							const targetPos = line.to;
							event.stopPropagation();
							view.dispatch({
								selection: EditorSelection.cursor(targetPos, 1),
								scrollIntoView: false,
								userEvent: 'select.pointer',
							});
							view.focus();
							startDragTracking(view, targetPos, clickX, clickY);
							return false;
						}
					}
				}
			}
		}
	}

	if (!embedEl || !view.contentDOM.contains(embedEl)) {
		return false;
	}

	// 块级 embed（如 <div> 表格容器、代码块等）保持原生行为
	if (embedEl.classList.contains('cm-embed-block')) {
		return false;
	}

	const widgetStart = view.posAtDOM(embedEl, 0);
	const docText = view.state.doc.toString();
	if (widgetStart < 0 || widgetStart >= docText.length) {
		return false;
	}

	// 探测该 embed 起始处的开标签
	const openTagMatch = docText.slice(widgetStart).match(/^<([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^>]*)?>/);
	if (!openTagMatch) {
		return false;
	}

	const tagName = openTagMatch[1]!;
	if (!isTagTypeHidden(tagName)) {
		return false; // 当前未开启该标签隐藏，放行给 Obsidian 原生处理
	}

	// 计算该成对 HTML 在文档中的对应闭标签
	const closeTagRe = new RegExp('</' + tagName + '\\s*>', 'i');
	const docRest = docText.slice(widgetStart);
	const closeTagMatch = docRest.match(closeTagRe);

	const targetPos = calculatePosInEmbed(view, embedEl, clickX, clickY);
	const isAtEnd = !!(closeTagMatch && closeTagMatch.index !== undefined && targetPos === widgetStart + closeTagMatch.index + closeTagMatch[0].length);

	if (targetPos < 0 || targetPos > view.state.doc.length) {
		return false;
	}

	// 阻止原生 selectElement 捕获该事件并全选
	event.stopPropagation();

	view.dispatch({
		selection: EditorSelection.cursor(targetPos, isAtEnd ? 1 : 0),
		scrollIntoView: false,
		userEvent: 'select.pointer',
	});
	view.focus();

	startDragTracking(view, targetPos, clickX, clickY);
	return false;
}

/**
 * 创建 HTML embed 智能点击定位扩展。
 *
 * 注意：Obsidian 原生的 hookClickHandler 在捕获阶段监听 mousedown，
 * 且可能早于 CodeMirror 自身常规事件处理。使用 ViewPlugin 在捕获阶段
 * （capture: true）挂载到 contentDOM 上，确保抢在 Obsidian 原生
 * selectElement 之前拦截并完成精准文字定位。
 */
export function createHtmlEmbedClickExtension(): Extension {
	return ViewPlugin.fromClass(
		class {
			private readonly mousedownListener = (event: MouseEvent) => {
				if (handleEmbedMouseDown(event, this.view)) {
					event.preventDefault();
				}
			};

			private readonly clickListener = (event: MouseEvent) => {
				const target = event.target as HTMLElement | null;
				if (target && typeof target.closest === 'function' && target.closest('.cm-html-embed')) {
					event.stopPropagation();
					event.preventDefault();
				}
			};

			constructor(private readonly view: EditorView) {
				// 在捕获阶段监听 mousedown 精准定位光标
				this.view.contentDOM.addEventListener('mousedown', this.mousedownListener, true);
				// 在捕获阶段拦截 click，阻止 Obsidian hookClickHandler.selectElement 触发全选
				this.view.contentDOM.addEventListener('click', this.clickListener, true);
			}

			destroy() {
				this.view.contentDOM.removeEventListener('mousedown', this.mousedownListener, true);
				this.view.contentDOM.removeEventListener('click', this.clickListener, true);
			}
		},
	);
}

/**
 * 拦截在隐藏闭标签末尾（</tag>|）的文本输入。
 *
 * 当光标停留在隐藏闭标签右侧末尾时，因为闭标签具有 display: none 样式，
 * Chromium 的原生 Selection 常常会将插入点规范化到闭标签前面。
 * 此时若发生 DOM 输入或输入法 composition，浏览器会错误地将字符插在闭标签前面。
 *
 * 通过 CM6 的 inputHandler，在输入派发前检测当前光标位置是否恰好位于隐藏闭标签末尾：
 * 若是，且输入的改变区间被误算到了闭标签前面，直接将其重定向并插入到闭标签之后，
 * 确保键入的文字始终忠实地追加在整个 HTML 标签之后。
 */
export function createClosingTagInputExtension(): Extension {
	return EditorView.inputHandler.of((view, from, to, text) => {
		const mainSel = view.state.selection.main;
		if (!mainSel.empty) return false;

		// 如果状态光标停在 pos 处，但输入的 from 被误定在前方的闭标签起始处或内部
		const head = mainSel.head;
		if (from < head && head <= view.state.doc.length) {
			const slice = view.state.doc.sliceString(from, head);
			// 检查 [from, head) 是否正好是一个成对 HTML 闭标签（如 </font>、</span> 等）
			if (/^<\/[a-zA-Z][a-zA-Z0-9-]*\s*>$/.test(slice)) {
				view.dispatch({
					changes: { from: head, to: head, insert: text },
					selection: EditorSelection.cursor(head + text.length, 1),
					userEvent: 'input.type',
				});
				return true;
			}
		}
		return false;
	});
}
