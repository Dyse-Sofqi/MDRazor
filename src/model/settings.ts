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
	// ── 懒加载 (controller/lazy-load/) ──
	/** 懒加载总开关：关闭时全部插件按 Obsidian 默认方式（自然顺序）加载 */
	lazyLoadEnabled: boolean;
	/** 各插件的懒加载配置（键 = 插件 id，仅社区插件，不含 MDRazor 自身） */
	lazyLoadPlugins: Record<string, LazyLoadPluginConfig>;
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
	/** 滚轴同步：选项聚焦折叠/展开后，光标所在行滚动至视口 25% 处 */
	focusScrollSync: boolean;
	/** 上下键默认不跳过被折叠的列表/标题项：↓/↑ 遇到折叠块时主动展开并进入 */
	arrowKeyEnterFolded: boolean;
	dirFocusOption: boolean;
	showDirFileCount: boolean;
	dirFileCountDirectOnly: boolean;

	// ── 空格可视化 (controller/format-hider/whitespace-visible.ts) ──
	showWhitespace: boolean;

	// ── 标签页 (controller/tab-enhancer/) ──
	tabEnhancerDefaultOpen: boolean;
	tabEnhancerOpenLink: boolean;
	tabEnhancerOpenBookmark: boolean;
	verticalTabsEnabled: boolean;
	verticalTabsViewActive: boolean;
	tabExpansionAssociatedFolders: boolean;
	positionPersistenceEnabled: boolean;

	// ── 状态栏 (controller/status-bar-enhancer/) ──
	statusBarEnhancement: boolean;
	autoSaveWorkspaceLayout: boolean;
	sidebarToggleEnabled: boolean;
	formatToggleEnabled: boolean;

	// ── 右键菜单 (controller/list-enhancer/sibling-fold.ts) ──
	/** 在编辑器右键菜单中显示「展开/折叠同级列表或标题」菜单项 */
	contextMenuSiblingFold: boolean;

	// ── 打字机模式 (controller/typewriter/) ──
	/** 打字机模式：编辑时光标行保持在页面中部区域（范围居中），死区外行淡化 */
	typewriterMode: boolean;
	/** 死区外的不透明度（0-100，100 = 完全不淡化；死区 = 视口中部 12.5%~87.5%） */
	typewriterOpacity: number;
	/** 允许文档头部留存空白区域：开启后顶部预留空间，使光标在第一行也能滚动到页面中央 */
	typewriterTopPadding: boolean;
	/** 死区下沿跳转上沿：光标行跨过死区下沿（87.5%）时跳到上沿（12.5%）；关闭时滚回下沿维持视觉位置 */
	typewriterBottomJumpToTop: boolean;

	// ── 更新日志弹窗 (view/changelog-modal.ts) ──
	/** 上次展示过更新日志的插件版本（内部状态，随 data.json 持久化，非用户设置项） */
	lastSeenVersion: string;

	// ── 左功能区自定义命令 / 隐藏命令 (controller/ribbon-manager/) ──
	/** 自定义功能区命令列表（数组顺序即功能区顺序） */
	customRibbonCommands: CustomRibbonCommand[];
	/** 功能区中各命令的隐藏状态，key 见 ribbon-manager 的 key 规则 */
	hiddenRibbonCommands: Record<string, boolean>;
	/** 功能区内所有命令的展示顺序（key 列表；自定义键为 custom:<id>，其他为 ribbon:<icon>:<name>） */
	ribbonCommandOrder: string[];

	// ── 状态栏自定义命令 / 隐藏命令 ──
	customStatusBarCommands: CustomRibbonCommand[];
	hiddenStatusBarCommands: Record<string, boolean>;
	statusBarCommandOrder: string[];

	// ── 右键菜单自定义命令 / 隐藏命令 ──
	customContextMenuCommands: CustomRibbonCommand[];
	hiddenContextMenuCommands: Record<string, boolean>;
	contextMenuCommandOrder: string[];
}

/**
 * 左功能区自定义命令条目。
 */
export interface CustomRibbonCommand {
	/** 本插件内唯一条目 ID（仅用于设置项管理） */
	id: string;
	/** Obsidian 内部完整命令 ID（含插件前缀） */
	commandId: string;
	/** 在功能区/设置中显示的名称 */
	name: string;
	/** lucide 图标名 */
	icon: string;
}

/**
 * 单个插件的懒加载配置。
 */
export interface LazyLoadPluginConfig {
	/** 启动延迟（毫秒）。0 = 不懒加载，随 Obsidian 正常加载 */
	delay: number;
	/** 用户期望该插件处于启用状态 */
	enabled: boolean;
}

export const DEFAULT_SETTINGS: MDRazorSettings = {
	lazyLoadEnabled: false,
	lazyLoadPlugins: {},

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
	focusScrollSync: true,
	arrowKeyEnterFolded: true,
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

	contextMenuSiblingFold: true,

	typewriterMode: false,
	typewriterOpacity: 50,
	typewriterTopPadding: true,
	typewriterBottomJumpToTop: false,


	customRibbonCommands: [],
	hiddenRibbonCommands: {},
	ribbonCommandOrder: [],

	customStatusBarCommands: [],
	hiddenStatusBarCommands: {},
	statusBarCommandOrder: [],
	customContextMenuCommands: [],
	hiddenContextMenuCommands: {},
	contextMenuCommandOrder: [],

	lastSeenVersion: '',
};
