/**
 * MDRazor — 通用：鼠标/滚轮活动时行高亮（Controller）
 *
 * 需求：鼠标移动或滚轮滚动时高亮光标所在行，停止活动后高亮自动取消。
 *
 * 纯 CSS 的 `:hover` 只能感知「鼠标此刻在元素上」，无法区分「活动中」与
 * 「静止」，因此必须由 JS 提供「活动中」状态：
 *   - 监听 window 的 mousemove 与 wheel（均 passive，不阻塞滚动）；
 *   - 首次活动时给 body 挂 `mdrazor-mouse-moving` 类，之后每次事件只
 *     重置空闲计时器（不做任何 DOM 写——已挂类时直接跳过）；
 *   - 最后一次活动后 MOUSE_IDLE_MS（300ms）内无新事件，视为静止，
 *     摘除该类。
 *
 * 滚动跟手性：浏览器在合成器平滑滚动期间不会逐帧重做 `:hover` 的
 * hit-test，滚轮已转但高亮滞后；且滚轮的平滑滚动动画在最后一个 wheel
 * 事件之后仍持续数百毫秒，仅靠 idle 计时器会在内容还在滑动时提前摘掉
 * 活动类（高亮提前消失、光标闪回 I-beam）。因此额外监听文档级 scroll
 * （捕获、passive）：
 *   - 每个滚动帧用 elementFromPoint 找到鼠标正下方的 .cm-line，
 *     给它挂 `mdrazor-line-highlight` 显式标记类（仅行变化时写 DOM），
 *     滚动期间高亮逐帧跟随内容；
 *   - 滚动事件与 mousemove/wheel 共用 markActive：平滑动画期间活动类
 *     不掉、idle 超时按最后一次滚动帧起算。
 * 鼠标物理移动仍走 `:hover`（浏览器原生、零 JS 开销），滚动帧走 JS 行
 * 标记，两者在 styles.css 中并列生效、样式相同，互相无缝衔接。
 *
 * 性能：mousemove/wheel/scroll 高频但每帧仅布尔检查 + 计时器重置
 * （微秒级）；elementFromPoint 仅滚动帧执行；DOM 写只在「静止→活动」
 * 首次事件与行切换时发生。
 */

import { Plugin } from 'obsidian';

/** body 上的「活动中」开关类（鼠标移动/滚轮滚动，styles.css 以此限定高亮规则生效） */
export const MOUSE_MOVING_CLASS = 'mdrazor-mouse-moving';

/** body 上的「功能开启」类：与活动态无关，只要设置开启就常驻。
 *  styles.css 用它把 cursor: default 绑到 :hover（而非活动态）——
 *  这样鼠标在行上静止（含行间缝隙）时光标也不会回到 I-beam。 */
export const FEATURE_ENABLED_CLASS = 'mdrazor-mouse-line-highlight-enabled';

/** .cm-line 上的显式行标记类：滚动帧用 elementFromPoint 定位鼠标下的行后挂载
 *  （styles.css 中与 :hover 规则并列生效，替代滚动期间滞后的 :hover） */
export const HIGHLIGHT_LINE_CLASS = 'mdrazor-line-highlight';

/** 停止活动判定阈值（ms）：最后一次活动后该时长内无新事件即视为静止 */
export const MOUSE_IDLE_MS = 300;

/** 设置读取器（registerMouseLineHighlight 传入；null = 尚未注册） */
let isEnabledRef: (() => boolean) | null = null;

/** 当前是否为「活动中」状态（body 类已挂上） */
let moving = false;

/** 空闲判定计时器（停止活动后移除类） */
let idleTimer: number | undefined;

/** 最近一次指针位置（滚动帧定位鼠标下的行；未记录时回退编辑器中心） */
let lastPointer: { x: number; y: number } | null = null;

/** 当前被显式标记的行元素（行不变时不做 DOM 写） */
let highlightedLine: HTMLElement | null = null;

function stopMoving(): void {
	if (idleTimer !== undefined) {
		window.clearTimeout(idleTimer);
		idleTimer = undefined;
	}
	if (moving) {
		moving = false;
		activeDocument.body.classList.remove(MOUSE_MOVING_CLASS);
	}
	if (highlightedLine !== null) {
		highlightedLine.classList.remove(HIGHLIGHT_LINE_CLASS);
		highlightedLine = null;
	}
}

/** 每次「活动」输入（鼠标移动、滚轮滚动、滚动帧）的状态推进：
 *  设置开关探测 + 初次挂类 + 重置 idle 计时器 */
function markActive(): void {
	if (!isEnabledRef?.()) {
		// 设置关闭时确保类被摘除（切换瞬间可能残留）
		stopMoving();
		return;
	}
	if (!moving) {
		moving = true;
		activeDocument.body.classList.add(MOUSE_MOVING_CLASS);
	}
	if (idleTimer !== undefined) window.clearTimeout(idleTimer);
	idleTimer = window.setTimeout(() => {
		idleTimer = undefined;
		stopMoving();
	}, MOUSE_IDLE_MS);
}

/** 编辑器可视区中心点（回退定位用；无编辑器时返回 null） */
function editorCenter(): { x: number; y: number } | null {
	const scroller = activeDocument.querySelector<HTMLElement>('.markdown-source-view .cm-scroller')
		?? activeDocument.querySelector<HTMLElement>('.cm-editor');
	if (scroller === null) return null;
	const rect = scroller.getBoundingClientRect();
	if (rect.width <= 0 || rect.height <= 0) return null;
	return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** 坐标处的行元素（.cm-line 或 CodeMirror-linebackground）；非行元素返回 null */
function locateLineAt(point: { x: number; y: number }): HTMLElement | null {
	const hit = activeDocument.elementFromPoint(point.x, point.y);
	return hit?.closest<HTMLElement>('.cm-line, .CodeMirror-linebackground') ?? null;
}

/** 定位鼠标正下方的行：优先指针坐标；指针不在行上（如滚动条拖拽）或未
 *  记录过时回退编辑器中心的行，保证滚动高亮不中断 */
function findLineUnderPointer(): HTMLElement | null {
	if (lastPointer !== null) {
		const line = locateLineAt(lastPointer);
		if (line !== null) return line;
	}
	const center = editorCenter();
	return center === null ? null : locateLineAt(center);
}

/** 滚动帧刷新：定位鼠标下的行并与当前标记比较，变化才写 DOM */
function refreshHighlightedLine(): void {
	const line = findLineUnderPointer();
	if (line === highlightedLine) return;
	if (highlightedLine !== null) highlightedLine.classList.remove(HIGHLIGHT_LINE_CLASS);
	highlightedLine = line;
	highlightedLine?.classList.add(HIGHLIGHT_LINE_CLASS);
}

function onMouseMove(event: MouseEvent): void {
	lastPointer = { x: event.clientX, y: event.clientY };
	markActive();
}

function onWheel(event: WheelEvent): void {
	if (event.clientX !== 0 || event.clientY !== 0) {
		lastPointer = { x: event.clientX, y: event.clientY };
	}
	markActive();
}

/** 文档级滚动（捕获）：内容每移动一帧就刷新行标记 + 维持活动态。
 *  scroll 事件不冒泡，必须捕获监听；passive 不阻塞滚动。 */
function onScroll(): void {
	markActive();
	refreshHighlightedLine();
}

/**
 * 注册活动监听（onload 调用）：mousemove（鼠标移动）、wheel（滚轮滚动）
 * 与文档级 scroll（滚动内容跟随）。
 *
 * @param plugin    Plugin 实例（registerDomEvent 保证卸载时自动移除监听）
 * @param isEnabled 设置读取器：每次事件即时探测，设置切换无需重注册
 */
export function registerMouseLineHighlight(plugin: Plugin, isEnabled: () => boolean): void {
	isEnabledRef = isEnabled;
	plugin.registerDomEvent(window, 'mousemove', onMouseMove, { passive: true });
	plugin.registerDomEvent(window, 'wheel', onWheel, { passive: true });
	plugin.registerDomEvent(activeDocument, 'scroll', onScroll, { capture: true, passive: true });
	// 功能开启类随设置同步（默认开启：插件加载后即常驻）
	if (isEnabled()) activeDocument.body.classList.add(FEATURE_ENABLED_CLASS);
	else stopMoving();
}

/**
 * 设置变化后同步状态（saveSettings → syncConfig 调用）：
 * 开启时挂「功能开启」类（光标默认箭头，含静止悬停）；关闭时摘除
 * 「功能开启」类 + 摘除「移动中」类并取消计时器，恢复原生光标。
 */
export function applyMouseLineHighlightClass(): void {
	if (isEnabledRef?.()) {
		activeDocument.body.classList.add(FEATURE_ENABLED_CLASS);
	} else {
		activeDocument.body.classList.remove(FEATURE_ENABLED_CLASS);
		stopMoving();
	}
}

/** 插件卸载时清理（body 类与行标记类是由 JS 添加的，需手动摘除） */
export function removeMouseLineHighlightClass(): void {
	activeDocument.body.classList.remove(FEATURE_ENABLED_CLASS);
	stopMoving();
}
