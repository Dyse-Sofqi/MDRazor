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

/** 检查特定标签名是否当前启用了隐藏 */
function isTagTypeHidden(tagName: string): boolean {
	const tag = tagName.toLowerCase();
	if (tag === 'font') return formattingConfig.hideHtmlColorTagFormatting;
	if (tag === 'u') return formattingConfig.hideHtmlUnderlineFormatting;
	if (tag === 'span') return formattingConfig.hideHtmlSpanFormatting;
	return formattingConfig.hideOtherHtmlTagFormatting;
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
						let rightmostX = lineRect.left;
						for (const child of Array.from(lineEl.childNodes)) {
							if (child.nodeType === Node.ELEMENT_NODE) {
								const el = child as HTMLElement;
								if (el.classList.contains('mdrazor-html-tag-hidden')) continue;
								const r = el.getBoundingClientRect();
								if (r.width > 0 && r.height > 0) {
									rightmostX = Math.max(rightmostX, r.right);
								}
							} else if (child.nodeType === Node.TEXT_NODE) {
								const range = lineEl.ownerDocument.createRange();
								range.selectNodeContents(child);
								for (const r of Array.from(range.getClientRects())) {
									rightmostX = Math.max(rightmostX, r.right);
								}
							}
						}

						if (
							clickY >= lineRect.top - 4 &&
							clickY <= lineRect.bottom + 4 &&
							clickX >= rightmostX - 5
						) {
							const targetPos = line.to;
							event.stopPropagation();
							event.preventDefault();
							view.dispatch({
								selection: EditorSelection.cursor(targetPos, 1),
								scrollIntoView: false,
								userEvent: 'select.pointer',
							});
							view.focus();
							return true;
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

	const openTagLen = openTagMatch[0].length;
	const doc = embedEl.ownerDocument;

	// 收集 embed 内所有文本节点与逐字符的几何包围盒
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

	// 计算该成对 HTML 在文档中的对应闭标签
	const closeTagRe = new RegExp('</' + tagName + '\\s*>', 'i');
	const docRest = docText.slice(widgetStart);
	const closeTagMatch = docRest.match(closeTagRe);

	let targetPos: number;
	let textOffsetInEmbed = 0;
	let isAtEnd = false;

	if (charMetrics.length === 0) {
		targetPos = widgetStart + openTagLen;
	} else {
		// 优先筛选出与点击垂直坐标同行的字符（支持跨行/折行的内联 HTML）
		const rowMetrics = charMetrics.filter(
			(m) => clickY >= m.top - 3 && clickY <= m.bottom + 3,
		);
		const activeMetrics = rowMetrics.length > 0 ? rowMetrics : charMetrics;
		const lastMetric = activeMetrics[activeMetrics.length - 1]!;
		const firstMetric = activeMetrics[0]!;

		if (clickX >= lastMetric.midX) {
			// 若处于整段 embed 的最末字符之后，吸附至闭标签之后
			if (lastMetric.offsetInEmbed === charMetrics.length - 1) {
				isAtEnd = true;
			} else {
				textOffsetInEmbed = lastMetric.offsetInEmbed + 1;
			}
		} else if (clickX <= firstMetric.midX) {
			textOffsetInEmbed = firstMetric.offsetInEmbed;
		} else {
			for (let i = 0; i < activeMetrics.length; i++) {
				const m = activeMetrics[i]!;
				if (clickX >= m.left && clickX <= m.right) {
					textOffsetInEmbed = clickX >= m.midX ? m.offsetInEmbed + 1 : m.offsetInEmbed;
					break;
				} else if (
					i < activeMetrics.length - 1 &&
					clickX > m.right &&
					clickX < activeMetrics[i + 1]!.left
				) {
					textOffsetInEmbed = m.offsetInEmbed + 1;
					break;
				}
			}
		}
	}

	if (isAtEnd && closeTagMatch && closeTagMatch.index !== undefined) {
		targetPos = widgetStart + closeTagMatch.index + closeTagMatch[0].length;
	} else {
		targetPos = widgetStart + openTagLen + textOffsetInEmbed;
	}

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

	return true;
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
