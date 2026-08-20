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

import { MarkdownView, Plugin } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { DEFAULT_SETTINGS, MDRazorSettings } from '../model/settings';
import { MDRazorSettingTab } from '../view/settings-tab';
import { ChangelogModal } from '../view/changelog-modal';
import { formattingConfig, createFormatHiderExtension } from './format-hider/format-hider';
import { createCursorBoundaryHintExtension } from './format-hider/cursor-boundary-hint';
import { spaceConfig, createSpaceVisualizationExtension } from './format-hider/whitespace-visible';
import { listEnhancerConfig, createListEnhancerExtension } from './list-enhancer/list-enhancer';
import { registerDirFocus } from './list-enhancer/dir-focus';
import { registerDirFileCount } from './list-enhancer/dir-file-count';
import { registerSiblingFold, registerSiblingFoldContextMenu } from './list-enhancer/sibling-fold';
import { typewriterConfig, createTypewriterExtension, registerTypewriterCommand } from './typewriter/typewriter';
import { registerTabEnhancer } from './tab-enhancer/tab-enhancer';
import { registerLinkOpener } from './tab-enhancer/link-opener';
import { registerBookmarkOpener } from './tab-enhancer/bookmark-opener';
import { registerVerticalTabs } from './tab-enhancer/vertical-tabs';
import { registerPositionPersistence } from './tab-enhancer/position-persistence';
import { registerOrphanImageCleaner } from './orphan-image-cleaner/orphan-image-cleaner';
import { registerStatusBarEnhancer } from './status-bar-enhancer/status-bar-enhancer';
import { registerSidebarToggle } from './status-bar-enhancer/sidebar-toggle';
import { registerFormatToggle } from './status-bar-enhancer/format-toggle';
import { registerLazyLoad, SELF_PLUGIN_ID } from './lazy-load/lazy-load';
import type { LazyLoadControl } from './lazy-load/lazy-load';

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

	async onload() {
		await this.loadSettings();

		// 懒加载：注册控制器并按「启用懒加载」开关调度延迟加载
		this.lazyLoadManager = registerLazyLoad(this);
		if (this.settings.lazyLoadEnabled) {
			this.lazyLoadManager.start();
		}

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

		// 注册每个功能模块的 CodeMirror 6 扩展
		// 每个工厂返回一个 Prec.high 扩展，确保我们的装饰优先级高于 Obsidian 内置渲染
		this.registerEditorExtension(createFormatHiderExtension());
		this.registerEditorExtension(createSpaceVisualizationExtension());
		this.registerEditorExtension(createCursorBoundaryHintExtension());
		this.registerEditorExtension(createListEnhancerExtension());
		// 注册打字机模式（光标行居中 + 非当前行淡化）
		this.registerEditorExtension(createTypewriterExtension());
		// 注册目录聚焦（非 CM6 扩展 — 直接操作文件列表 DOM）
		registerDirFocus(this, () => this.settings.dirFocusOption);

		// 注册展开/折叠同级列表或标题命令（可在命令面板触发或绑定快捷键）
		registerSiblingFold(this);

		// 注册展开/折叠同级列表或标题右键菜单项（右键菜单模块开关控制）
		registerSiblingFoldContextMenu(this, () => this.settings.contextMenuSiblingFold);

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
			() => this.settings.verticalTabsViewActive,
			(active: boolean) => {
				this.settings.verticalTabsViewActive = active;
				void this.saveSettings();
			},
			() => this.settings.tabExpansionAssociatedFolders,
		);
		// 注册 MD 文档光标和滚轴位置持久化（先载入缓存再注册，避免重启后缓存被清空）
		await registerPositionPersistence(this, () => this.settings.positionPersistenceEnabled);

		// 注册切换标签页视图命令（verticalTabsEnabled 开启时可绑定快捷键）
		this.addCommand({
			id: 'toggle-vertical-tabs-view',
			name: '切换标签页视图',
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
	}

	/**
	 * 从磁盘加载设置，与默认值合并，然后同步到功能模块
	 */
	async loadSettings() {
		const rawData = (await this.loadData()) as Record<string, unknown> | null;
		if (rawData) {
			// Migration: enhancedListMarkers → enterSoftBreak
			if ('enhancedListMarkers' in rawData && !('enterSoftBreak' in rawData)) {
				rawData.enterSoftBreak = rawData.enhancedListMarkers;
			}
		}
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			rawData as Partial<MDRazorSettings>,
		);
		this.syncConfig();
	}

	/**
	 * 将当前设置持久化到磁盘，然后同步到功能模块，
	 * 使 CM6 扩展立即生效（无需重新加载插件）
	 */
	async saveSettings() {
		await this.saveData(this.settings);
		this.syncConfig();
		this.repaintAllEditors();
		this.dirFileCountRefresher.forceRefresh();
	}

	/**
	 * 强制所有打开的编辑器刷新装饰。
	 *
	 * 发送空事务到每个 CM6 EditorView，触发 ViewPlugin.update()，
	 * 使其从共享配置对象重新读取并重建装饰集合。
	 * 这样设置开关可即时生效，无需重启 Obsidian。
	 */
	private repaintAllEditors() {
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view instanceof MarkdownView) {
				const cm6 = (leaf.view.editor as unknown as { cm: EditorView }).cm;
				if (cm6) cm6.dispatch({});
			}
		});
	}

	/**
	 * 插件更新到新版本后首次启动时弹出更新日志。
	 *
	 * 以 `manifest.version` 与持久化的 `lastSeenVersion` 比较：
	 * 版本不同说明用户刚更新了插件，弹出本次更新的 CHANGELOG 摘要。
	 * **必须先 `await saveData` 落盘成功再弹窗**——弹窗一旦出现，用户可能
	 * 立即重载插件/重启 Obsidian，未等待的异步写入会被丢掉，导致
	 * lastSeenVersion 永远停留在旧值、每次加载都弹窗。
	 * 直写 `saveData` 而非 `saveSettings()`：后者会触发 repaintAllEditors
	 * 与目录计数强制刷新，onload 阶段不必要。
	 */
	private async maybeShowChangelog() {
		const currentVersion = this.manifest.version;
		if (this.settings.lastSeenVersion === currentVersion) return;
		this.settings.lastSeenVersion = currentVersion;
		try {
			await this.saveData(this.settings);
		} catch (e) {
			// 落盘失败不阻断弹窗（本次仍展示，下次加载再补记）
			console.error('MDRazor: 保存已读更新日志版本失败', e);
		}
		new ChangelogModal(this.app).open();
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
		Object.assign(typewriterConfig, {
			mode: this.settings.typewriterMode,
			opacity: this.settings.typewriterOpacity,
			topPadding: this.settings.typewriterTopPadding,
			bottomJumpToTop: this.settings.typewriterBottomJumpToTop,
		});
	}
}
