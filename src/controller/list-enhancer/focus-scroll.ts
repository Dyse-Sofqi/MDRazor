/**
 * MDRazor — 选项聚焦「滚动策略」纯函数层
 *
 * 把「滚轴固定 / 滚轴同步」的选择与「固定位置」的光标视口偏移计算，从
 * CM6 逻辑（focus-options.ts）里拆出来：不依赖 EditorView / DOM，便于离线
 * 回归（scripts/verify-focus-scroll.mjs）。
 *
 * 两条不变式：
 *   1. 「滚轴固定」与「滚轴同步」互斥；两者同时为真时以「滚轴固定」为准
 *      （旧版本升级、手工编辑设置文件都可能留下同时为真的状态）。
 *   2. 固定位置时偏移必须夹取到视口内 —— 光标绝不落出视口外。
 */

/** 选项聚焦触发折叠/展开后的滚动策略 */
export type FocusScrollMode = 'pin' | 'sync' | 'none';

/**
 * 由设置解析滚动策略。
 *
 * 「滚轴固定」优先：即便数据层两者同时为真，也只采用固定、不叠加同步。
 *
 * @param config 只需读两个开关（传 listEnhancerConfig 即可）
 */
export function resolveFocusScrollMode(config: {
	focusScrollPin: boolean;
	focusScrollSync: boolean;
}): FocusScrollMode {
	if (config.focusScrollPin) return 'pin';
	if (config.focusScrollSync) return 'sync';
	return 'none';
}

/**
 * 计算「滚轴固定」所需的 yMargin —— 光标行当前在滚动视口内的上边距。
 *
 * 作为 `EditorView.scrollIntoView(pos, { y: 'start', yMargin })` 的参数：
 * 折叠/展开后光标会回到同一屏幕位置，这就是「固定」；折叠/展开于是围绕
 * 光标所在行进行，页面不大幅跳跃。
 *
 * 结果夹取到 [0, viewportHeight - lineHeight]：
 *   - 光标原本在视口上方（键盘移动后视口尚未跟上等）→ 0（贴顶）；
 *   - 光标原本在视口下方 → viewportHeight - lineHeight（贴底，整行仍可见）。
 * 两条边界都保证光标不落出视口外。
 *
 * @param cursorTop      光标行上边（视口 client 坐标）
 * @param cursorBottom   光标行下边（视口 client 坐标）
 * @param scrollTop      滚动容器自身的上边（视口 client 坐标）
 * @param viewportHeight 滚动容器可视高度
 */
export function computePinMargin(
	cursorTop: number,
	cursorBottom: number,
	scrollTop: number,
	viewportHeight: number,
): number {
	const lineHeight = Math.max(0, cursorBottom - cursorTop);
	const maxOffset = Math.max(0, viewportHeight - lineHeight);
	const offset = cursorTop - scrollTop;
	if (offset < 0) return 0;
	if (offset > maxOffset) return maxOffset;
	return offset;
}
