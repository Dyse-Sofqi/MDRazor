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
	// ── 失联图片清理 (controller/orphan-image-cleaner/) ──
	orphanImageCleanerEnabled: boolean;
	/** 清理弹框中用户选择保留（白名单）的失联图片路径，下次弹框默认不勾选并置底 */
	orphanImageWhitelist: string[];

	// ── 隐藏样式 (controller/format-hider/) ──
	hideBoldFormatting: boolean;
	hideItalicFormatting: boolean;
	hideHighlightFormatting: boolean;
	hideStrikethroughFormatting: boolean;
	hideCodeFormatting: boolean;
	hideEscapeFormatting: boolean;
	hideHeadingFormatting: boolean;
	hideWikiLinkFormatting: boolean;
	hideHtmlColorTagFormatting: boolean;

	// ── 隐藏 HTML 下划线符号 ──
	hideHtmlUnderlineFormatting: boolean;

	// ── 隐藏 HTML 行标签（span）──
	hideHtmlSpanFormatting: boolean;

	// ── 光标边界提示 ──
	symbolBoundaryHint: boolean;

	// ── 列表增强 (controller/list-enhancer/) ──
	listIntegration: boolean;
	enterSoftBreak: boolean;
	listFocusOption: boolean;
	listFocusSecondThreshold: number;
	listFocusSecondThresholdEnabled: boolean;
	dirFocusOption: boolean;
	showDirFileCount: boolean;
	dirFileCountDirectOnly: boolean;

	// ── 空格可视化 (controller/format-hider/whitespace-visible.ts) ──
	showWhitespace: boolean;

	// ── 标签页增强 (controller/tab-enhancer/) ──
	tabEnhancerDefaultOpen: boolean;
	tabEnhancerOpenLink: boolean;
	tabEnhancerOpenBookmark: boolean;
	verticalTabsEnabled: boolean;
	verticalTabsViewActive: boolean;
	tabExpansionAssociatedFolders: boolean;
	positionPersistenceEnabled: boolean;

	// ── 状态栏增强 (controller/status-bar-enhancer/) ──
	statusBarEnhancement: boolean;
	autoSaveWorkspaceLayout: boolean;
	sidebarToggleEnabled: boolean;
	formatToggleEnabled: boolean;
}

export const DEFAULT_SETTINGS: MDRazorSettings = {
	orphanImageCleanerEnabled: false,
	orphanImageWhitelist: [],
	hideBoldFormatting: true,
	hideItalicFormatting: true,
	hideHighlightFormatting: true,
	hideStrikethroughFormatting: true,
	hideCodeFormatting: true,
	hideEscapeFormatting: true,
	hideHeadingFormatting: true,
	hideWikiLinkFormatting: true,
	hideHtmlColorTagFormatting: true,
	hideHtmlUnderlineFormatting: true,
	hideHtmlSpanFormatting: true,
	symbolBoundaryHint: true,
	listIntegration: true,
	enterSoftBreak: true,
	listFocusOption: true,
	listFocusSecondThreshold: 3,
	listFocusSecondThresholdEnabled: false,
	dirFocusOption: true,
	showDirFileCount: true,
	dirFileCountDirectOnly: true,
	showWhitespace: false,
	tabEnhancerDefaultOpen: true,
	tabEnhancerOpenLink: true,
	tabEnhancerOpenBookmark: true,
	verticalTabsEnabled: true,
	verticalTabsViewActive: false,
	tabExpansionAssociatedFolders: true,
	positionPersistenceEnabled: true,

	statusBarEnhancement: true,
	autoSaveWorkspaceLayout: true,
	sidebarToggleEnabled: true,
	formatToggleEnabled: false,
};
