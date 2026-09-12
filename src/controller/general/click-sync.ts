/**
 * MDRazor — 点击同步（Click Sync）——点击/拖拽落到错误行的自愈（Controller）
 *
 * 两个独立根因（同一症状家族：点行下半部 → 光标/选区落到下一行）：
 *
 * 根因 A（Chrome caret 吸附 + CM6 检测链被行首元素节点打断，与高度表无关）：
 *   Chrome 的 caretPositionFromPoint 在「行盒下半部」（文本行下方空白区）
 *   把位置吸附到下一行起点（CM6 注释 "Chrome will move positions between
 *   lines to the start of the next line"）。CM6 的 isSuspiciousChromeCaretResult
 *   本应拒绝该结果 —— 但检测要求 offset==0 的节点沿 firstChild 链一路传到
 *   .cm-line；行首有元素节点（Obsidian 列表 .list-bullet、MDRazor 格式隐藏
 *   的 HTML 标签 mark 装饰等）即链断 → 错误结果被接受 → 点击 anchor 落
 *   下一行。拖拽期间 MouseSelection 每次 mousemove（≥10px）都重走同一被骗
 *   的 posAtCoords 重建选区 → 整个选区落向下一行。2.5.9 的微任务自愈只救
 *   点击；拖拽时第一个移动即被原生派发覆盖。**重测高度表无效** —— 高度表
 *   本来就是新的。
 *
 * 根因 B（行高度表陈旧，2.5.7 家族）：外部样式/主题/晚到字体未经重测的
 *   重排使 posAtCoords 选块错行（见 measure-guard.ts）。
 *
 * 修复（A/B 双管齐下，均严格自门控 —— 原生结果正确时零干预）：
 *   - A：mousedown 微任务记录 DOM 真值锚点（healedPosAt）；拖拽期间
 *     document mousemove 微任务逐帧比对选区行 vs DOM 行，不一致即用真值
 *     重建选区（同一事件任务内完成，渲染前生效；结果与 CM6 原生拖拽语义
 *     一致：非 extend 选区按 from/to 升序）。
 *   - B：mousedown 时以与高度表无关的 posAtDOM 对照 posAtCoords 结果，
 *     不一致 → 在插件 handler 内（先于原生 mousedown handler）调用内部
 *     view.measure() 同步刷新高度表，点击与拖拽全程走新表。
 *   - 点击自愈（healSelection）保留：单次点击（无拖拽）的微任务纠正。
 *   - mouseup 最终纠错（2.6.0 补）：原生 MouseSelection 在 mouseup 时
 *     若其 dragging == null（按下时已存在非空选区，CM6 即以 DOM selection
 *     是否为空判断）会用最后一次 mousemove 的坐标重算并重发选区，覆盖
 *     逐帧纠错的结果。点击同步挂载的 document mouseup 监听器在原生 up()
 *     之后、同一事件内再跑一次 dragCorrection，使最终可见选区与 DOM 真值
 *     一致；仅当本次拖拽确已发生过纠错（correctedOnce）时才运行，内容
 *     拖拽（HTML5 dnd，期间无 mousemove 纠错）零干预。
 *
 * 时序关键：挂在 mousedown 而非 pointerdown —— pointerdown 先于 mousedown
 * 触发，而微任务在两次事件任务之间执行；mousedown 的微任务则在 CM6 原生
 * mousedown handler（handlers.mousedown → MouseSelection.start，同步派发
 * 点击选择）之后运行，读到的选区才是最终状态。
 *
 * 触发条件严格：
 *   - 仅左键单击（button=0, detail=1），修饰键（Shift/Ctrl/Meta/Alt）
 *     与双击选中交给原生行为；
 *   - 跳过折叠指示器/折叠切换（点击只 toggle 折叠、不搬光标）与嵌套
 *     编辑器（嵌入块的 .cm-line 属于子内容，closest 到子的 .cm-content）。
 */

import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

/** 连续快速点击保护：仅纠正最后按下的一次（避免旧微任务覆盖新点击） */
let pointerSeq = 0;

/**
 * 拖拽上下文：一次 mousedown → mouseup 内的 DOM 真值跟踪。
 * startPos = mousedown 时的 DOM 真值位置（healedPosAt），拖拽期间原生
 * 选区与它不一致时以它为锚纠正。
 */
interface DragContext {
	view: EditorView;
	doc: Document;
	startPos: number;
	x: number;
	y: number;
	seq: number;
	/** 本次拖拽中是否发生过至少一次纠错（mouseup 最终纠错的开关） */
	correctedOnce: boolean;
}

let activeDrag: DragContext | null = null;
let dragDoc: Document | null = null;

/** 文档级监听（每个 document 只挂一次；鼠标抬起/取消即停用） */
function ensureDragListeners(ctx: DragContext): void {
	if (dragDoc === ctx.doc) {
		return;
	}
	dragDoc = ctx.doc;
	ctx.doc.addEventListener('mousemove', (e: MouseEvent) => {
		const drag = activeDrag;
		if (!drag || drag.doc !== ctx.doc || e.buttons === 0) {
			return;
		}
		drag.x = e.clientX;
		drag.y = e.clientY;
		// 微任务：晚于本事件所有 handler（含 MouseSelection.move 的选区派发）
		queueMicrotask(() => dragCorrection(drag));
	});
	ctx.doc.addEventListener('mouseup', () => {
		const drag = activeDrag;
		if (drag && drag.doc === ctx.doc && drag.correctedOnce) {
			// 原生 MouseSelection 在 mouseup 时可能用最后一次 mousemove 的
			// 坐标重算并重发选区（其 dragging == null 时，即按下时已存在
			// 非空选区），覆盖上一帧的纠错结果 —— 最终选区又落回错误行。
			// 本监听器挂在原生 up() 之后，同一事件内再跑一次最终纠错，
			// 保证可见结果与 DOM 真值一致；原生结果正确时零干预。
			dragCorrection(drag);
		}
		activeDrag = null; // 拖拽结束 —— 后续 move 无 DOM 真值对照，交给原生
	});
	ctx.doc.addEventListener('pointercancel', () => {
		activeDrag = null;
	});
}

/**
 * 拖拽一致性纠正：原生选区（anchor/head 行）与 DOM 真值（锚点行 / 当前
 * 鼠标行）不一致时，用真值重建选区。行数一致即原生正确 —— 零干预。
 * 纠正结果与 CM6 原生拖拽一致：非 extend 选区按 from/to 升序排列。
 */
function dragCorrection(ctx: DragContext): void {
	if (activeDrag !== ctx || ctx.seq !== pointerSeq) {
		return; // 已被新的点击/抬起取代
	}
	const { view } = ctx;
	if (!view.dom.isConnected) {
		activeDrag = null;
		return;
	}
	const doc = view.dom.ownerDocument;
	const target = doc.elementFromPoint(ctx.x, ctx.y) as HTMLElement | null;
	if (!target || typeof target.closest !== 'function') {
		return; // 鼠标已离开编辑器 —— 原生行为（边界滚动等）交给 CM6
	}
	const lineEl = target.closest<HTMLElement>('.cm-line');
	if (!lineEl || lineEl.closest('.cm-content') !== view.contentDOM) {
		return;
	}
	const cur = healedPosAt(view, lineEl, ctx.x, ctx.y);
	const sel = view.state.selection.main;
	const state = view.state;
	const anchorLine = state.doc.lineAt(sel.anchor).number;
	const headLine = state.doc.lineAt(sel.head).number;
	const startLine = state.doc.lineAt(ctx.startPos).number;
	const curLine = state.doc.lineAt(cur).number;
	if (anchorLine === startLine && headLine === curLine) {
		return; // 原生结果正确（含拖拽方向与列），零干预
	}
	const from = Math.min(ctx.startPos, cur);
	const to = Math.max(ctx.startPos, cur);
	view.dispatch({
		selection: { anchor: from, head: to },
		scrollIntoView: false,
		userEvent: 'select.pointer',
	});
	ctx.correctedOnce = true;
}

/**
 * 创建「点击同步」扩展（始终开启，无设置开关；由 controller/main.ts 注册）。
 * domEventHandlers 挂在 .cm-content 上并随视图生命周期自动清理。
 */
export function createClickSyncExtension(): Extension {
	return EditorView.domEventHandlers({
		mousedown: (event, view) => {
			handleMouseDown(event as MouseEvent, view);
			return false; // 不拦截，原生点击行为完整保留
		},
	});
}

function handleMouseDown(event: MouseEvent, view: EditorView): void {
	// 仅纯左键单击；双击（word 选中）/修饰键（范围选择、链接打开等）放行
	if (
		event.button !== 0 ||
		event.detail > 1 ||
		event.shiftKey ||
		event.ctrlKey ||
		event.metaKey ||
		event.altKey
	) {
		return;
	}
	const target = event.target as HTMLElement | null;
	if (
		!target ||
		typeof target.closest !== 'function' ||
		!view.contentDOM.contains(target)
	) {
		return;
	}
	// 折叠指示器/折叠切换：原生点击是「toggle 折叠」，不搬光标
	if (target.closest('.collapse-indicator, .list-collapse-indicator, .cm-foldToggle')) {
		return;
	}
	const lineEl = target.closest<HTMLElement>('.cm-line');
	if (!lineEl) {
		return; // gutter/空白/widget-only 点击不治
	}
	// 嵌套编辑器（嵌入块内嵌 CM6）的 .cm-line 属于子 .cm-content —— 跳过，
	// 避免把子视图坐标误当本视图文档坐标
	if (lineEl.closest('.cm-content') !== view.contentDOM) {
		return;
	}

	// 陈旧检测（本版核心）：原生点击选择与拖拽扩展（MouseSelection）全程由
	// 行高度表驱动（queryPos = posAtCoords(precise=false) —— elementAtHeight
	// 按高度表选块）。高度表陈旧时，点击行下半部会被映射到下一行：点击放错
	// 行；按住拖拽则整段选中下一行。用与高度表无关的真实 DOM 行起点
	// （posAtDOM）对照高度表结果，不一致 = 高度表陈旧 → 同步重测（插件
	// handler 先于原生 mousedown handler 运行：computeHandlers 插件在前、
	// 全局最后；measure() 同步完成，原生 handler 读到的已是新表）。
	const realLine = view.state.doc.lineAt(view.posAtDOM(lineEl, 0)).number;
	const mapLine = view.state.doc
		.lineAt(view.posAtCoords({ x: event.clientX, y: event.clientY }, false) ?? 0)
		.number;
	if (mapLine !== realLine) {
		syncHeightMap(view);
	}

	const seq = ++pointerSeq;
	const clickX = event.clientX;
	const clickY = event.clientY;
	// 微任务：CM6 原生 mousedown handler（handlers.mousedown）在本次事件
	// 派发内同步执行完毕（含点击选择派发），此刻读到的 selection 才是最终
	// 状态（handler 顺序无关紧要）
	queueMicrotask(() => {
		if (seq !== pointerSeq) {
			return; // 更新的点击已到达，放弃本轮
		}
		try {
			healSelection(view, lineEl, clickX, clickY);
			// 拖拽跟踪：原生拖拽（MouseSelection，≥10px 后每次 mousemove
			// 重建选区）全程走 posAtCoords —— 行首非文本节点（Obsidian 列表
			// 圆点、MDRazor 格式隐藏标记等）会打断 CM6 的 Chrome caret 可疑
			// 结果检测链，使「点击行下半部」被映射到下一行，点击自愈在第一个
			// 拖拽移动时即被原生派发覆盖。这里保存 DOM 真值锚点，拖拽期间在
			// 微任务里逐帧比对、不一致即纠正（同一事件任务内完成、渲染前）。
			if (view.dom.isConnected) {
				activeDrag = {
					view,
					doc: view.contentDOM.ownerDocument,
					startPos: healedPosAt(view, lineEl, clickX, clickY),
					x: clickX,
					y: clickY,
					seq,
					correctedOnce: false,
				};
				ensureDragListeners(activeDrag);
			}
		} catch {
			// 视图失效/跨文档等异常：放弃本轮纠正，不扩散
		}
	});
}

/**
 * 自愈：光标不在被点击的行时，用真实 DOM 映射的结果纠正选区。
 * 全程不依赖行高度表 —— 高度表陈旧与否都不影响正确性。
 */
function healSelection(view: EditorView, lineEl: HTMLElement, clickX: number, clickY: number): void {
	const sel = view.state.selection.main;
	if (sel.anchor !== sel.head) {
		return; // 拖选/范围选择进行中，不干预
	}
	// 被点击行的起点：posFromDOM（真实 DOM 树，与高度表无关；offset 0 = 行首）
	const lineStart = view.posAtDOM(lineEl, 0);
	const line = view.state.doc.lineAt(lineStart);
	if (view.state.doc.lineAt(sel.head).number === line.number) {
		return; // 高度表结果正确 —— 无需干预
	}
	const pos = healedPosAt(view, lineEl, clickX, clickY);
	view.dispatch({ selection: { anchor: pos, head: pos }, scrollIntoView: false });
}

/**
 * 点击点的「DOM 真值」位置（本扩展统一的真值来源）：
 *   1. 浏览器原生 caret（caretPositionFromPoint/caretRangeFromPoint）经
 *      posAtDOM 映射到文档坐标（localPosFromDOM 感知替换装饰，精确到列）；
 *   2. 退化：点击行下半部时 Chrome 会把 caret 给到下一行起点（CM6 的
 *      suspicious 启发式拒绝的正是这类结果）—— 用该行文本中心线重试；
 *   3. 仍越界 → 行首兜底。
 * 永不返回 null。
 */
function healedPosAt(view: EditorView, lineEl: HTMLElement, x: number, y: number): number {
	const lineStart = view.posAtDOM(lineEl, 0);
	const line = view.state.doc.lineAt(lineStart);
	let pos = caretPosAt(view, x, y);
	if (pos === null || pos < line.from || pos > line.to) {
		const textY = lineTextMidY(lineEl);
		if (textY !== null) {
			pos = caretPosAt(view, x, textY);
		}
	}
	if (pos === null || pos < line.from || pos > line.to) {
		pos = line.from; // 兜底：行首
	}
	return pos;
}

/** 取 (x, y) 处的浏览器 caret 并映射为文档坐标；无结果/节点非法返回 null */
function caretPosAt(view: EditorView, x: number, y: number): number | null {
	const doc = view.dom.ownerDocument;
	try {
		if (doc.caretPositionFromPoint) {
			const cp = doc.caretPositionFromPoint(x, y);
			if (cp && cp.offsetNode && view.contentDOM.contains(cp.offsetNode)) {
				return view.posAtDOM(cp.offsetNode, clampOffset(cp.offsetNode, cp.offset));
			}
		}
		if (doc.caretRangeFromPoint) {
			const range = doc.caretRangeFromPoint(x, y);
			if (range && range.startContainer && view.contentDOM.contains(range.startContainer)) {
				return view.posAtDOM(range.startContainer, clampOffset(range.startContainer, range.startOffset));
			}
		}
	} catch {
		return null;
	}
	return null;
}

/** 裁剪浏览器可能越界的 caret offset（元素 = 子节点数，文本 = 字符数） */
function clampOffset(node: Node, offset: number): number {
	if (node.nodeType === 1) {
		return Math.max(0, Math.min(offset, (node as Element).childNodes.length));
	}
	if (node.nodeType === 3) {
		return Math.max(0, Math.min(offset, (node as Text).data.length));
	}
	return offset;
}

/** 行内首个非空文本节点的垂直中心 y（视图坐标）；空行/纯 widget 行返回 null */
function lineTextMidY(lineEl: HTMLElement): number | null {
	const doc = lineEl.ownerDocument;
	const walker = doc.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (!node.nodeValue) {
			continue;
		}
		const range = doc.createRange();
		range.selectNodeContents(node);
		const rect = range.getBoundingClientRect();
		if (rect.height > 0 && rect.width > 0) {
			return rect.top + rect.height / 2;
		}
	}
	return null;
}

/**
 * 同步刷新行高度表：调用 CM6 内部 measure() —— 请求测量回调的同步变体，
 * 内部的测量循环（viewState.measure → docView.measure）直接用当前真实 DOM
 * 几何重建行高度表，一次调用内完成、无 rAF 等待。@internal、非公开 API：
 * 类型上与运行时均已存在（EditorView 原型方法，自 CM6 6.0 起稳定），
 * Obsidian 固定解析版本，实测可用；仍以 typeof 守卫 + try/catch 兜底，
 * 失败时静默走微任务自愈（点击仍被纠正，仅拖拽不可自愈）。
 *
 * 调用时机：handleMouseDown 内、原生 mousedown handler 之前 —— 此时
 * updateState 为 Idle（非更新中），measure() 不会抛「更新进行中」。
 */
function syncHeightMap(view: EditorView): void {
	const internal = view as EditorView & { measure?: () => void };
	if (typeof internal.measure !== 'function') {
		return;
	}
	try {
		internal.measure();
	} catch {
		// 测量失败不致命 —— 微任务自愈仍有机会纠正
	}
}
