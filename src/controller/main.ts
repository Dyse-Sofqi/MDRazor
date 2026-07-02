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
import { formattingConfig, createFormatHiderExtension } from './format-hider';
import { spaceConfig, createSpaceVisualizationExtension } from './whitespace-visible';
import { listEnhancerConfig, createListEnhancerExtension } from './list-enhancer';
import { registerDirFocus } from './dir-focus';
import { registerDirFileCount } from './dir-file-count';
import { registerTabEnhancer } from './tab-enhancer';
import { registerVerticalTabs } from './vertical-tabs';
import { registerOrphanImageCleaner } from './orphan-image-cleaner';
import { registerStatusBarEnhancer } from './status-bar-enhancer';

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

	/** 状态栏增强控制 */
	statusBarEnhancer!: { addButton: () => void; removeButton: () => void };

	async onload() {
		await this.loadSettings();

		// 注册设置面板（Obsidian PluginSettingTab）
		this.addSettingTab(new MDRazorSettingTab(this.app, this));

		// 注册失联图片清理功能（获得 ribbon 控制句柄）
		this.orphanImageRibbon = registerOrphanImageCleaner(this);

		// 注册状态栏增强
		this.statusBarEnhancer = registerStatusBarEnhancer(this);

		// 注册每个功能模块的 CodeMirror 6 扩展
		// 每个工厂返回一个 Prec.high 扩展，确保我们的装饰优先级高于 Obsidian 内置渲染
		this.registerEditorExtension(createFormatHiderExtension());
		this.registerEditorExtension(createSpaceVisualizationExtension());
		this.registerEditorExtension(createListEnhancerExtension());
		// 注册目录聚焦（非 CM6 扩展 — 直接操作文件列表 DOM）
		registerDirFocus(this, () => this.settings.dirFocusOption);

		// 注册目录文件数量显示
		registerDirFileCount(this, () => this.settings.showDirFileCount);

		// 注册标签页增强（文件列表点击 → 已有标签页则跳转）
		registerTabEnhancer(this, () => this.settings.tabEnhancerDefaultOpen);
		// 注册垂直标签页（文件列表关闭按钮 + 标签页列表视图）
		registerVerticalTabs(
			this,
			() => this.settings.verticalTabsEnabled,
			() => this.settings.verticalTabsViewActive,
			(active: boolean) => {
				this.settings.verticalTabsViewActive = active;
				void this.saveSettings();
			},
		);
		// 如果设置已启用，添加 ribbon 图标
		if (this.settings.orphanImageCleanerEnabled) {
			this.orphanImageRibbon.addRibbon();
		}
		// 如果设置已启用，添加状态栏按钮
		if (this.settings.statusBarEnhancement) {
			this.statusBarEnhancer.addButton();
		}
	}

	onunload() {
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
	}
}
