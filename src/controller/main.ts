/**
 * MDRazor — 插件控制器（Controller）
 *
 * 职责：
 *   1. 通过 Obsidian Plugin API 加载/保存设置
 *   2. 注册设置面板（View）
 *   3. 注册各个功能模块贡献的 CodeMirror 6 扩展
 *
 * 每个功能模块（format-hider.ts、list-enhancer.ts 等）暴露的：
 *   - create*Extension() 工厂函数 → 返回 CM6 Extension（在此注册）
 *   - 模块级配置对象（在此同步）
 *
 * 这种解耦方式意味着功能模块从不导入 Plugin 或处理 Obsidian 生命周期，
 * 它们完全基于 CM6 原生 API 运作。
 */

import { Plugin, type EventRef } from 'obsidian';
import { tr } from '../i18n';
import { EditorView } from '@codemirror/view';
import { MDRazorSettings } from '../model/settings';
import { loadPluginSettings, savePluginSettings } from './settings-storage';
import { MDRazorSettingTab } from '../view/settings-tab';
import { ChangelogModal } from '../view/changelog-modal';
import { formattingConfig, createFormatHiderExtension } from './format-hider/format-hider';
import { createCursorBoundaryHintExtension } from './format-hider/cursor-boundary-hint';
import { spaceConfig, createSpaceVisualizationExtension } from './format-hider/whitespace-visible';
import { listEnhancerConfig, createListEnhancerExtension, applyListFoldOnActiveLineClass, removeListFoldOnActiveLineClass } from './list-enhancer/list-enhancer';
import { registerDirFocus } from './list-enhancer/dir-focus';
import { registerDirFileCount } from './list-enhancer/dir-file-count';
import { registerSiblingFold, registerSiblingFoldContextMenu } from './list-enhancer/sibling-fold';
import {
	registerDeleteEmptyLinesCommand,
	registerDeleteEmptyLinesContextMenu,
} from './list-enhancer/delete-empty-lines';
import { typewriterConfig, createTypewriterExtension, registerTypewriterCommand } from './typewriter/typewriter';
import { registerTabEnhancer } from './tab-enhancer/tab-enhancer';
import { registerLinkOpener } from './tab-enhancer/link-opener';
import { registerBookmarkOpener } from './tab-enhancer/bookmark-opener';
import { registerVerticalTabs } from './tab-enhancer/vertical-tabs';
import { registerPositionPersistence } from './tab-enhancer/position-persistence';
import { registerOrphanImageCleaner } from './orphan-image-cleaner/orphan-image-cleaner';
import { registerRibbonManager } from './ribbon-manager/ribbon-manager';
import type { RibbonManager } from './ribbon-manager/ribbon-manager';
import { registerCommandSurfaceManager } from './command-surface/command-surface';
import type { SurfaceCommandManager } from './command-surface/command-surface';
import { registerStatusBarEnhancer } from './status-bar-enhancer/status-bar-enhancer';
import { registerSidebarToggle } from './status-bar-enhancer/sidebar-toggle';
import { registerFormatToggle } from './status-bar-enhancer/format-toggle';
import { registerLazyLoad, SELF_PLUGIN_ID } from './lazy-load/lazy-load';
import type { LazyLoadControl } from './lazy-load/lazy-load';
import { createStartupTimingRecorder } from './lazy-load/startup-check';
import type { StartupTimingRecorder } from './lazy-load/startup-check';
import { registerMouseLineHighlight, applyMouseLineHighlightClass, removeMouseLineHighlightClass } from './general/mouse-line-highlight';
import { registerCurrentLineHighlight, applyCurrentLineHighlightClass, removeCurrentLineHighlightClass } from './general/current-line-highlight';
import { registerInlineCodeEnhancer } from './general/inline-code-enhancer';
import { registerCalloutEnhancer, refreshTouchEditButtons } from './general/callout-enhancer';
import {
	firstLineIndentConfig,
	createFirstLineIndentExtension,
	registerFirstLineIndent,
	applyFirstLineIndentClass,
	removeFirstLineIndentClass,
} from './general/first-line-indent';
import {
	registerFirstLineIndentReading,
	applyFirstLineIndentReading,
	removeFirstLineIndentReading,
} from './general/first-line-indent-reading';
import { registerFirstLineIndentToggle } from './general/first-line-indent-toggle';
import { registerMeasureGuard } from './general/measure-guard';
import { createClickSyncExtension } from './general/click-sync';

/**
 * 主插件类。
 *
 * `settings` 属性持有用户偏好的权威副本。
 * 每次加载或保存后，`syncConfig()` 将值传播到每个功能模块的模块级配置对象，
 * 使（无状态的）CM6 扩展始终能读取到最新值，无需持有对此类的引用。
 */
export default class MDRazorPlugin extends Plugin {
	settings!: MDRazorSettings;

	/** Ribbon 图标控制：用于在设置开关变化时添加/移除 */
	orphanImageRibbon!: { addRibbon: () => void; removeRibbon: () => void };

	/** 左功能区自定义命令 / 隐藏命令管理 */
	ribbonManager!: RibbonManager;

	/** 状态栏自定义命令 / 隐藏命令管理 */
	statusBarCommandManager!: SurfaceCommandManager;

	/** 右键菜单自定义命令 / 隐藏命令管理 */
	contextMenuCommandManager!: SurfaceCommandManager;

	/** 状态栏控制 */
	statusBarEnhancer!: { addButton: () => void; removeButton: () => void };

	/** 侧边栏伸缩控制 */
	sidebarToggle!: { addButton: () => void; removeButton: () => void };

	/** 格式隐藏启闭控制 */
	formatToggle!: { addButton: () => void; removeButton: () => void; refreshIcon: () => void };

	/** 设置面板（用于按钮切换后同步设置开关显示） */
	settingTab?: MDRazorSettingTab;

	/** 目录文件计数强制刷新 */
	dirFileCountRefresher!: { forceRefresh: () => void };

	/** 垂直标签页管理（命令调用） */
	verticalTabsManager!: { toggleView: () => void; refreshUI: () => void };

	/** 懒加载管理（controller/lazy-load/，设置标签页与生命周期调用） */
	lazyLoadManager!: LazyLoadControl;

	/** 启动耗时记录器（「立即检查」弹窗数据来源，onload 即启动采样） */
	startupTimings!: StartupTimingRecorder;

	async onload() {
		await this.loadSettings();

		// 启动耗时记录器：测量本插件触发加载的插件的真实加载耗时（「立即检查」用）
		this.startupTimings = createStartupTimingRecorder(this);

		// 懒加载：注册控制器并按「启用懒加载」开关调度延迟加载；
		// 每次触发插件加载（含 flip 重载）时建立计时并返回测量 Promise，
		// 全局加载队列 await 它实现窗口串行（loadingPluginId 单槽位互斥）；
		// 检测到接管中的插件被外部停用/重新启用时，仅翻转其休眠标记并
		// 刷新设置界面（2.5.4 起配置保留，不再删除）
		this.lazyLoadManager = registerLazyLoad(
			this,
			(pluginId) => this.startupTimings.trackLoad(pluginId),
			() => {
				this.settingTab?.refreshLazyList();
			},
		);
		if (this.settings.lazyLoadEnabled) {
			this.lazyLoadManager.start();
		}

		// 注册左功能区自定义命令与隐藏命令管理，并恢复已保存的自定义 ribbon 图标
		this.ribbonManager = registerRibbonManager(this);
		this.ribbonManager.refresh();

		// 注册状态栏 / 右键菜单共用命令管理
		this.statusBarCommandManager = registerCommandSurfaceManager(this, 'statusBar');
		this.contextMenuCommandManager = registerCommandSurfaceManager(this, 'contextMenu');

		// 注册设置面板（Obsidian PluginSettingTab）
		this.settingTab = new MDRazorSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		// 注册失联图片清理功能（获得 ribbon 控制句柄）
		this.orphanImageRibbon = registerOrphanImageCleaner(this);

		// 注册状态栏
		this.statusBarEnhancer = registerStatusBarEnhancer(this, () => this.settings.autoSaveWorkspaceLayout);

		// 注册侧边栏伸缩（注册 Obsidian 命令 + 状态栏按钮控制）
		this.sidebarToggle = registerSidebarToggle(this);

		// 注册格式隐藏启闭（注册 Obsidian 命令 + 状态栏按钮控制）
		this.formatToggle = registerFormatToggle(this, this.settings, async () => {
			await this.saveSettings();
			// 按钮/命令一键切换后，同步设置面板中隐藏样式开关的显示状态
			this.settingTab?.syncHideTogglesFromSettings();
		});

		// 注册通用功能：鼠标移动时行高亮（body 开关类驱动，设置读取器即时探测）
		registerMouseLineHighlight(this, () => this.settings.mouseMoveLineHighlight);

		// 注册通用功能：当前行高亮（.cm-active 光标行，body 常驻开关类驱动）
		registerCurrentLineHighlight(this, () => this.settings.currentLineHighlight);

		// 注册通用功能：行内代码增强（单击行内代码 → 全选内容并复制，点击时即时探测开关）
		registerInlineCodeEnhancer(this, () => this.settings.inlineCodeEnhancer);

		// 注册通用功能：Callout 增强（实时预览下单击 callout 不退回纯文本；
		// 「编辑这个区块」按钮在保留官方外观的前提下就地编辑纯文本；粘贴多行自动补 `>`；
		// 触屏设备常驻编辑按钮）
		registerCalloutEnhancer(
			this,
			() => this.settings.calloutEnhancer,
			() => this.settings.calloutTouchEditButton,
		);

		// 注册通用功能：首行缩进（正文段落首行缩进，body 开关类 + CM6 行装饰）
		registerFirstLineIndent(
			this,
			() => this.settings.firstLineIndentEnabled,
			() => this.settings.firstLineIndentSize,
		);

		// 注册通用功能：首行缩进的阅读视图逐行缩进（非严格换行下单回车是 <p> 内的
		// <br>，拿不到 text-indent，只能由 DOM 后处理补占位元素；见该模块注释）
		registerFirstLineIndentReading(this, () => this.settings.firstLineIndentEnabled);

		// 注册「开启/关闭首行缩进」命令 + 编辑器右键菜单项（切换设置开关，
		// 与设置面板开关双向同步；菜单项显示由「右键菜单」模块的开关控制）
		registerFirstLineIndentToggle(
			this,
			this.settings,
			async () => {
				await this.saveSettings();
				this.settingTab?.syncFirstLineIndentFromSettings();
			},
			() => this.settings.contextMenuFirstLineIndent,
		);

		// 注册编辑器测量守护（始终开启）：样式注入/晚到字体触发重排时
		// 强制 requestMeasure 刷新 CM6 行高表，根治「点击行上半部落到上一行」
		registerMeasureGuard(this);

		// 注册点击同步（始终开启，无设置开关）：陈旧行高表导致点击行偏移
		// （点上一行下半部光标不动）时，用真实 DOM 映射（posAtDOM）对
		// 点击后的选区做几何无关的兜底纠正；高度表准确时零干预
		this.registerEditorExtension(createClickSyncExtension());

		// 注册每个功能模块的 CodeMirror 6 扩展
		// 每个工厂返回一个 Prec.high 扩展，确保我们的装饰优先级高于 Obsidian 内置渲染
		this.registerEditorExtension(createFormatHiderExtension());
		this.registerEditorExtension(createSpaceVisualizationExtension());
		this.registerEditorExtension(createCursorBoundaryHintExtension());
		this.registerEditorExtension(createListEnhancerExtension());
		// 注册打字机模式（光标行居中 + 非当前行淡化）
		this.registerEditorExtension(createTypewriterExtension());
		// 注册首行缩进（正文段落首行缩进，仅实时预览；阅读视图走 styles.css）
		this.registerEditorExtension(createFirstLineIndentExtension());
		// 注册目录聚焦（非 CM6 扩展 — 直接操作文件列表 DOM）
		registerDirFocus(this, () => this.settings.dirFocusOption);

		// 注册展开/折叠同级列表或标题命令（可在命令面板触发或绑定快捷键）
		registerSiblingFold(this);

		// 注册展开/折叠同级列表或标题右键菜单项（右键菜单模块开关控制）
		registerSiblingFoldContextMenu(this, () => this.settings.contextMenuSiblingFold);

		// 注册批量删除空行命令（随插件注册，右键菜单模块开关只控制菜单项显示）
		registerDeleteEmptyLinesCommand(this);

		// 注册批量删除空行右键菜单项（右键菜单模块开关控制）
		registerDeleteEmptyLinesContextMenu(this, () => this.settings.contextMenuDeleteEmptyLines);

		// 注册开启/关闭打字机模式命令（可绑定快捷键，与设置开关双向同步）
		registerTypewriterCommand(this, this.settings, async () => {
			await this.saveSettings();
			this.settingTab?.syncTypewriterFromSettings();
		});

		// 注册目录文件数量显示
		this.dirFileCountRefresher = registerDirFileCount(
			this,
			() => this.settings.showDirFileCount,
			() => this.settings.dirFileCountDirectOnly,
		);

		// 注册标签页（文件列表点击 → 已有标签页则跳转）
		registerTabEnhancer(this, () => this.settings.tabEnhancerDefaultOpen);
		// 注册链接打开增强（文档内双链 → 已有标签页则跳转）
		registerLinkOpener(this, () => this.settings.tabEnhancerOpenLink);
		// 注册书签打开增强（书签文件 → 已有标签页则跳转）
		registerBookmarkOpener(this, () => this.settings.tabEnhancerOpenBookmark);
		// 注册垂直标签页（文件列表关闭按钮 + 标签页列表视图）
		this.verticalTabsManager = registerVerticalTabs(
			this,
			() => this.settings.verticalTabsEnabled,
			() => this.settings.verticalTabsToggleButtonEnabled,
			() => this.settings.verticalTabsViewActive,
			(active: boolean) => {
				this.settings.verticalTabsViewActive = active;
				void this.saveSettings();
			},
			() => this.settings.tabExpansionAssociatedFolders,
		);
		// 注册 MD 文档光标和滚轴位置持久化（先载入缓存再注册，避免重启后缓存被清空）
		await registerPositionPersistence(this, () => this.settings.positionPersistenceEnabled);

		// 布局变化（新开 popout / 悬浮编辑器窗口、切换工作区）后，把运行态
		// （body 开关类 / CSS 变量）补挂到新窗口的 document —— 否则那些窗口里
		// 的编辑器拿不到样式，用户看到的就是「开关改了不生效」。幂等且开销极低。
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.applyRuntimeClasses();
			}),
		);

		// 「严格换行」设置变化会改变段落边界（单回车算不算新段落），首行缩进的
		// 行装饰需要重算 —— 否则要等下一次编辑才刷新。Vault 的 config-changed
		// 事件未进 typings，故经类型收窄订阅（setConfig 与配置文件外部改动都会触发）。
		this.registerEvent(
			(
				this.app.vault as unknown as {
					on(name: string, cb: (...args: unknown[]) => void): EventRef;
				}
			).on('config-changed', (...args: unknown[]) => {
				if (args[0] === 'strictLineBreaks') {
					this.repaintAllEditors();
					// 阅读视图侧同样要重算：严格换行时 <br> 只可能来自显式硬换行
					// （同一段落，不缩进），占位元素要摘掉
					applyFirstLineIndentReading();
				}
			}),
		);

		// 注册切换标签页视图命令（verticalTabsEnabled 开启时可绑定快捷键）
		this.addCommand({
			id: 'toggle-vertical-tabs-view',
			name: tr('切换标签页视图', 'Toggle Vertical Tabs View'),
			icon: 'arrow-left-right',
			checkCallback: (checking: boolean) => {
				if (!this.settings.verticalTabsEnabled) return false;
				if (!checking) {
					this.verticalTabsManager.toggleView();
				}
				return true;
			},
		});

		// 如果设置已启用，添加 ribbon 图标
		if (this.settings.orphanImageCleanerEnabled) {
			this.orphanImageRibbon.addRibbon();
		}
		// 初始 ribbon 图标就绪后，再次应用隐藏/排序状态
		this.ribbonManager.refresh();

		// 如果设置已启用，添加状态栏按钮
		if (this.settings.statusBarEnhancement) {
			this.statusBarEnhancer.addButton();
		}
		// 如果设置已启用，添加侧边栏伸缩按钮
		if (this.settings.sidebarToggleEnabled) {
			this.sidebarToggle.addButton();
		}
		// 如果设置已启用，添加格式隐藏启闭按钮
		if (this.settings.formatToggleEnabled) {
			this.formatToggle.addButton();
		}

		// 插件更新到新版本后首次启动时弹出本次更新的更新日志
		await this.maybeShowChangelog();
	}

	onunload() {
		// 本插件被用户禁用（而非应用关闭）时，把所有懒加载插件恢复为常规加载，
		// 避免用户离开 Plugin Manager 类功能后被锁死在「持久化禁用」状态。
		const enabledPlugins = (this.app as unknown as {
			plugins?: { enabledPlugins?: Set<string> };
		}).plugins?.enabledPlugins;
		if (
			this.settings.lazyLoadEnabled &&
			enabledPlugins &&
			!enabledPlugins.has(SELF_PLUGIN_ID)
		) {
			this.lazyLoadManager?.restore();
		}
		// 清理 ribbon 图标（其他清理由 Obsidian 自动完成）
		this.orphanImageRibbon?.removeRibbon();
		// 移除「光标所在列表行也可折叠」的 body 开关类（JS 添加，需手动清理）
		removeListFoldOnActiveLineClass(this.app);
		// 移除「鼠标移动时行高亮」的 body 开关类并取消空闲计时器（JS 添加，需手动清理）
		removeMouseLineHighlightClass(this.app);
		// 移除「当前行高亮」的 body 开关类（JS 添加，需手动清理）
		removeCurrentLineHighlightClass(this.app);
		// 移除「首行缩进」的 body 开关类与缩进变量（JS 添加，需手动清理）
		removeFirstLineIndentClass(this.app);
		// 移除「首行缩进」在阅读视图里补的占位元素并断开观察器（JS 添加，需手动清理）
		removeFirstLineIndentReading();
	}

	/**
	 * 从磁盘加载设置（.obsidian/md-razor-settings.json，旧位置 data.json
	 * 自动迁移），与默认值合并，然后同步到功能模块
	 */
	async loadSettings() {
		this.settings = await loadPluginSettings(this);
		this.syncConfig();
	}

	/**
	 * 将当前设置持久化到磁盘（.obsidian/md-razor-settings.json，延迟同步插件目录镜像），
	 * 然后同步到功能模块，使 CM6 扩展立即生效（无需重新加载插件）。
	 *
	 * options.forceMirror：跳过镜像节流立即写镜像。「清理本地持久化数据」等
	 * 重置场景必须使用，防止旧设置残留在镜像中被下次加载补洞复活。
	 */
	async saveSettings(options?: { forceMirror?: boolean }) {
		await savePluginSettings(this, this.settings, options);
		// 落盘之后的「生效」链路必须逐段隔离：任一模块抛错都不能掐断后面几步
		// ——否则表现为「设置已保存，但插件没反应，重启才生效」，且没有任何报错。
		this.syncConfig();
		this.repaintAllEditors();
		try {
			this.dirFileCountRefresher?.forceRefresh();
		} catch (e) {
			console.error('[MDRazor] 目录文件计数刷新失败', e);
		}
	}

	/**
	 * 重新应用「挂在 DOM 上的运行态」：各 body 开关类与 CSS 变量。
	 *
	 * 幂等、零副作用，可安全地重复调用。调用时机：
	 *   - onload / saveSettings（设置变化后即时生效）
	 *   - workspace layout-change（新开 popout / 悬浮编辑器窗口时补挂，
	 *     否则那些窗口里的编辑器拿不到样式，看起来「开关没生效」）
	 *   - 设置面板 display()（打开面板即自愈）
	 *
	 * 用 try/catch 逐项隔离：某个模块抛错不应连累其余模块。
	 */
	applyRuntimeClasses(): void {
		const steps: Array<[string, () => void]> = [
			['光标行列表符号折叠', () => applyListFoldOnActiveLineClass(this.app)],
			['鼠标移动时行高亮', () => applyMouseLineHighlightClass(this.app)],
			['当前行高亮', () => applyCurrentLineHighlightClass(this.app)],
			['首行缩进', () => applyFirstLineIndentClass(this.app)],
			// 阅读视图的逐行缩进是 DOM 后处理（非严格换行下 <br> 拿不到 text-indent）：
			// 同一处统一调用，保证开关 / 宽度 / 严格换行变化后即时补或摘占位元素
			['首行缩进（阅读视图）', () => applyFirstLineIndentReading()],
		];
		for (const [name, run] of steps) {
			try {
				run();
			} catch (e) {
				console.error(`[MDRazor] 应用「${name}」运行态失败`, e);
			}
		}
	}

	/**
	 * 强制所有打开的编辑器刷新装饰。
	 *
	 * 发送空事务到每个 CM6 EditorView，触发 ViewPlugin.update()，
	 * 使其从共享配置对象重新读取并重建装饰集合。
	 * 这样设置开关可即时生效，无需重启 Obsidian。
	 *
	 * 注意两点：
	 *   - 不用 `instanceof MarkdownView` 判定：popout / 悬浮窗口的视图来自
	 *     另一个 realm，跨 realm 的 instanceof 会失败（Obsidian 因此提供了
	 *     `Node.instanceOf`）。这里改用鸭子判定：有 CM6 EditorView 就派发。
	 *   - 单个编辑器抛错（例如恰好处于一次更新中）必须隔离，否则循环中断，
	 *     后面的编辑器全都拿不到新设置。
	 */
	private repaintAllEditors() {
		this.app.workspace.iterateAllLeaves((leaf) => {
			const cm6 = (leaf.view as unknown as { editor?: { cm?: EditorView } }).editor?.cm;
			if (!cm6 || typeof cm6.dispatch !== 'function') return;
			try {
				cm6.dispatch({});
			} catch (e) {
				console.error('[MDRazor] 重绘编辑器失败（已跳过该编辑器）', e);
			}
		});
	}

	/**
	 * 插件更新到新版本后首次启动时弹出更新日志。
	 *
	 * 以 `manifest.version` 与持久化的 `lastSeenVersion` 比较：
	 * 版本不同说明用户刚更新了插件，弹出本次更新的 CHANGELOG 摘要。
	 * **必须先落盘成功再弹窗**——弹窗一旦出现，用户可能
	 * 立即重载插件/重启 Obsidian，未等待的异步写入会被丢掉，导致
	 * lastSeenVersion 永远停留在旧值、每次加载都弹窗。
	 * 直写存储而非 `saveSettings()`：后者会触发 repaintAllEditors
	 * 与目录计数强制刷新，onload 阶段不必要。
	 */
	private async maybeShowChangelog() {
		const currentVersion = this.manifest.version;
		if (this.settings.lastSeenVersion === currentVersion) return;
		this.settings.lastSeenVersion = currentVersion;
		try {
			await savePluginSettings(this, this.settings);
		} catch (e) {
			// 落盘失败不阻断弹窗（本次仍展示，下次加载再补记）
			console.error('MDRazor: 保存已读更新日志版本失败', e);
		}
		new ChangelogModal(this.app, this).open();
	}

	/**
	 * 将设置传播到每个功能模块的可变配置对象。
	 *
	 * 为什么使用模块级配置？CM6 ViewPlugin 实例生命周期很长，
	 * 且与 Obsidian 插件生命周期解耦。通过写入 ViewPlugin 在每个
	 * update() 时读取的普通可变对象，我们避免了设置变更时需要
	 * 重建或重新注册扩展。
	 */
	private syncConfig() {
		Object.assign(formattingConfig, this.settings);
		Object.assign(spaceConfig, this.settings);
		Object.assign(listEnhancerConfig, this.settings);
		// 首行缩进的开关还要同步给 CM6 扩展（它在 update() 里读这个配置对象）
		firstLineIndentConfig.enabled = this.settings.firstLineIndentEnabled;
		// 「挂在 DOM 上的运行态」（body 开关类 / CSS 变量）：统一走
		// applyRuntimeClasses（幂等 + 逐项异常隔离 + 覆盖所有窗口的 document）
		this.applyRuntimeClasses();
		// Callout 触屏编辑按钮：开关翻转不会触发 DOM 变化（MutationObserver
		// 只看新增节点），需显式全量补/摘
		try {
			refreshTouchEditButtons();
		} catch (e) {
			console.error('[MDRazor] 同步 Callout 触屏编辑按钮失败', e);
		}
		Object.assign(typewriterConfig, {
			mode: this.settings.typewriterMode,
			opacity: this.settings.typewriterOpacity,
			topPadding: this.settings.typewriterTopPadding,
			bottomJumpToTop: this.settings.typewriterBottomJumpToTop,
		});
	}
}
