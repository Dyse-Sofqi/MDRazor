/**
 * MDRazor — 设置数据模型
 *
 * 定义所有用户可配置的设置项结构及默认值。
 * 纯数据层，不包含 UI 渲染或业务逻辑。
 */

/**
 * 所有用户可配置的设置项。
 *
 * 字段按功能模块分组（前缀注释标明归属）。
 * 所有值默认开启（true），插件安装后立即可用所有功能。
 * 后续新增功能开关也应默认 true，保持一致的首次体验。
 */
export interface MDRazorSettings {
	// ── 隐藏样式 (format-hider.ts) ──
	hideBoldFormatting: boolean;
	hideItalicFormatting: boolean;
	hideHighlightFormatting: boolean;
	hideStrikethroughFormatting: boolean;
	hideCodeFormatting: boolean;
	hideEscapeFormatting: boolean;
	hideHeadingFormatting: boolean;

	// ── 列表增强 (list-enhancer.ts) ──
	listIntegration: boolean;
	enterSoftBreak: boolean;
	listFocusOption: boolean;
	dirFocusOption: boolean;

	// ── 空格可视化 (whitespace-visible.ts) ──
	showWhitespace: boolean;
}

export const DEFAULT_SETTINGS: MDRazorSettings = {
	hideBoldFormatting: true,
	hideItalicFormatting: true,
	hideHighlightFormatting: true,
	hideStrikethroughFormatting: true,
	hideCodeFormatting: true,
	hideEscapeFormatting: true,
	hideHeadingFormatting: true,
	listIntegration: true,
	enterSoftBreak: true,
	listFocusOption: true,
	dirFocusOption: true,
	showWhitespace: false,
};