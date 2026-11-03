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
import type { Extension } from '@codemirror/state';
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

	const embedEl = target.closest<HTMLElement>('.cm-html-embed');
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
	const clickX = event.clientX;
	const clickY = event.clientY;
	const doc = embedEl.ownerDocument;

	// 确定用户点击的文字节点及节点内偏移
	let textNode: Node | null = null;
	let offset = 0;

	if (doc.caretPositionFromPoint) {
		const cp = doc.caretPositionFromPoint(clickX, clickY);
		if (cp && cp.offsetNode && embedEl.contains(cp.offsetNode)) {
			textNode = cp.offsetNode;
			offset = cp.offset;
		}
	}

	if (!textNode && (doc as unknown as { caretRangeFromPoint?: (x: number, y: number) => Range | null }).caretRangeFromPoint) {
		const cr = (doc as unknown as { caretRangeFromPoint: (x: number, y: number) => Range | null }).caretRangeFromPoint(clickX, clickY);
		if (cr && cr.startContainer && embedEl.contains(cr.startContainer)) {
			textNode = cr.startContainer;
			offset = cr.startOffset;
		}
	}

	// 累加计算该位置在 embed 文本内容中的相对偏移
	let textOffsetInEmbed = 0;
	let found = false;
	const walker = doc.createTreeWalker(embedEl, NodeFilter.SHOW_TEXT);
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		if (n === textNode) {
			const len = n.nodeValue ? n.nodeValue.length : 0;
			textOffsetInEmbed += Math.max(0, Math.min(offset, len));
			found = true;
			break;
		}
		textOffsetInEmbed += n.nodeValue ? n.nodeValue.length : 0;
	}

	// 若未精准命中特定文本节点，回退为文本中心点或行首
	if (!found) {
		textOffsetInEmbed = 0;
	}

	const targetPos = widgetStart + openTagLen + textOffsetInEmbed;
	if (targetPos < 0 || targetPos > view.state.doc.length) {
		return false;
	}

	// 阻止原生 selectElement 捕获该事件并全选
	event.stopPropagation();

	view.dispatch({
		selection: { anchor: targetPos, head: targetPos },
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
