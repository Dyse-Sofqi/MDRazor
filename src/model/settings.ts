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
	// ── 通用 (controller/general/) ──
	/** 鼠标移动时行高亮：鼠标移动时高亮所在行，停止移动后高亮自动取消 */
	mouseMoveLineHighlight: boolean;
	/** 当前行高亮：高亮编辑光标所在行（.cm-active，跟随光标与鼠标无关）。
	 *  默认关闭——与 Custom.css 的 activeline-highlight 效果相同，避免
	 *  两边同时开启叠加；不启用该 snippet 时也能独立保持 */
	currentLineHighlight: boolean;

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
	/** 勾选框一体化：将任务项标记 `- [ ]` 视为一个整体原子单元——光标不驻留
	 * 其内（点击/Home/方向键落入即推到 `]` 之后），Backspace/Delete 整体删除
	 * 该标记；与列表标记（`- `）合并为一个区间，复刻列一体化的处理 */
	checkboxIntegration: boolean;
	/** 光标所在列表行也可折叠：悬停列表符号显示折叠箭头，点击列表符号折叠/展开该列表
	 * （Obsidian 原生仅在非活动行开放——活动行上折叠指示器被压缩为 0 尺寸） */
	listFoldOnActiveLine: boolean;
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
	/** 在文件列表工具栏显示「切换标签页视图」按钮（垂直标签页开启时生效） */
	verticalTabsToggleButtonEnabled: boolean;
	tabExpansionAssociatedFolders: boolean;
	positionPersistenceEnabled: boolean;

	// ── 状态栏 (controller/status-bar-enhancer/) ──
	statusBarEnhancement: boolean;
	autoSaveWorkspaceLayout: boolean;
	sidebarToggleEnabled: boolean;
	formatToggleEnabled: boolean;

	// ── 右键菜单 (controller/list-enhancer/) ──
	/** 在编辑器右键菜单中显示「展开/折叠同级列表或标题」菜单项 */
	contextMenuSiblingFold: boolean;
	/** 在编辑器右键菜单中显示「批量删除空行」菜单项（命令始终注册，不受此开关影响） */
	contextMenuDeleteEmptyLines: boolean;

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
 *
 * active 标记配置是否处于「接管」状态：
 *   - active !== false（缺省即接管）：MDRazor 正常管理——插件被本模块
 *     持久化禁用、按延迟补载；调度 / flip / restore 均只处理此类条目；
 *   - active === false：休眠——用户已在「第三方插件设置」中停用该插件
 *     （或对未启用插件设置延迟），配置与延迟值保留，但本模块不调度、
 *     不补载、不参与 flip / restore；用户重新启用插件后自动恢复接管，
 *     延迟值无需重新设置。
 * 注意：被管理插件的持久化开关状态恒为「停用」（本模块
 * disablePluginAndSave 的结果），与用户主动停用无法用 enabledPlugins
 * 区分，必须用本标记；判定与恢复由懒加载控制器的轮询完成。
 */
export interface LazyLoadPluginConfig {
	/** 启动延迟（毫秒）。0 = 不懒加载，随 Obsidian 正常加载 */
	delay: number;
	/** 是否处于接管状态；缺省 true。false = 休眠（保留配置，待插件重新启用后自动恢复） */
	active?: boolean;
}

export const DEFAULT_SETTINGS: MDRazorSettings = {
	mouseMoveLineHighlight: true,
	// 默认关闭（显式例外）：与 Custom.css「当前行高亮」为同一效果，避免叠加
	currentLineHighlight: false,

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
	checkboxIntegration: true,
	listFoldOnActiveLine: true,
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
	verticalTabsToggleButtonEnabled: true,
	tabExpansionAssociatedFolders: true,
	positionPersistenceEnabled: true,

	statusBarEnhancement: true,
	autoSaveWorkspaceLayout: true,
	sidebarToggleEnabled: true,
	formatToggleEnabled: false,

	contextMenuSiblingFold: true,
	contextMenuDeleteEmptyLines: true,

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
