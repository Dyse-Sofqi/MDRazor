/**
 * MDRazor — 设置接口与 UI
 *
 * 本模块承担两个职责：
 *   1. 定义所有插件设置的数据结构和默认值
 *   2. 在 Obsidian 设置面板中渲染配置 UI
 *
 * 设置接口随着新增功能模块而扩展 ——
 * 每个模块应在此处添加自己的字段、提供默认值，
 * 并在 MDRazorSettingTab 中渲染其配置区域。
 *
 * 开关变更链路：toggle.onChange → plugin.saveSettings()
 * → main.ts:saveSettings → syncConfig() → 功能模块配置。
 */

import { App, ExtraButtonComponent, PluginSettingTab, Setting } from 'obsidian';
import MDRazorPlugin from './main';

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

	// ── 列表增强 (list-enhancer.ts) ──
	listIntegration: boolean;
	enterSoftBreak: boolean;
	listFocusOption: boolean;
}

export const DEFAULT_SETTINGS: MDRazorSettings = {
	hideBoldFormatting: true,
	hideItalicFormatting: true,
	hideHighlightFormatting: true,
	hideStrikethroughFormatting: true,
	hideCodeFormatting: true,
	listIntegration: true,
	enterSoftBreak: true,
	listFocusOption: true,
};

/**
 * 在 Obsidian 设置中显示的设置面板：设置 → 第三方插件 → MDRazor。
 *
 * 每个 Setting 创建一个开关，读取并写入 `plugin.settings`。
 * 每次 onChange 中调用 `plugin.saveSettings()` 会触发
 * main.ts 中的 syncConfig()，将新值传播到对应模块的
 * 模块级配置，供 CM6 扩展在下一次 update() 时读取。
 */
export class MDRazorSettingTab extends PluginSettingTab {
	plugin: MDRazorPlugin;

	constructor(app: App, plugin: MDRazorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ═══════════════════════════════════════════
		// 隐藏样式 配置区
		// ═══════════════════════════════════════════

		const hideSection = this.createCollapsibleSection(containerEl, '隐藏样式', true);

		new Setting(hideSection)
			.setName('隐藏加粗符号')
			.setDesc('在实时预览中隐藏 ** 加粗标记符号')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.hideBoldFormatting)
					.onChange(async (value) => {
						this.plugin.settings.hideBoldFormatting = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(hideSection)
			.setName('隐藏斜体符号')
			.setDesc('在实时预览中隐藏 * 斜体标记符号')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.hideItalicFormatting)
					.onChange(async (value) => {
						this.plugin.settings.hideItalicFormatting = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(hideSection)
			.setName('隐藏高亮符号')
			.setDesc('在实时预览中隐藏 == 高亮标记符号')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.hideHighlightFormatting)
					.onChange(async (value) => {
						this.plugin.settings.hideHighlightFormatting = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(hideSection)
			.setName('隐藏删除线符号')
			.setDesc('在实时预览中隐藏 ~~ 删除线标记符号')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.hideStrikethroughFormatting)
					.onChange(async (value) => {
						this.plugin.settings.hideStrikethroughFormatting = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(hideSection)
			.setName('隐藏行内代码符号')
			.setDesc('在实时预览中隐藏 ` 行内代码标记符号')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.hideCodeFormatting)
					.onChange(async (value) => {
						this.plugin.settings.hideCodeFormatting = value;
						await this.plugin.saveSettings();
					}),
			);

		// ═══════════════════════════════════════════
		// 列表增强 配置区
		// ═══════════════════════════════════════════

		const listSection = this.createCollapsibleSection(containerEl, '列表增强', true);

		new Setting(listSection)
			.setName('列一体化')
			.setDesc('将列表标识符与后方空格视为一个整体，点击时光标只能落在标识符之前或空格之后')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.listIntegration)
					.onChange(async (value) => {
						this.plugin.settings.listIntegration = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(listSection)
			.setName('回车软换行')
			.setDesc('在列表项内按回车时插入软换行（续行缩进）而非创建新列表项')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enterSoftBreak)
					.onChange(async (value) => {
						this.plugin.settings.enterSoftBreak = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(listSection)
			.setName('聚焦选项')
			.setDesc('列表项聚焦时的交互优化（待实现）')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.listFocusOption)
					.onChange(async (value) => {
						this.plugin.settings.listFocusOption = value;
						await this.plugin.saveSettings();
					}),
			);
	}

	/**
	 * 创建一个可折叠的设置区域。
	 *
	 * @param containerEl  父容器
	 * @param name         区域标题
	 * @param expanded     是否默认展开（true = 展开）
	 * @returns            子设置项应添加到的容器元素
	 */
	private createCollapsibleSection(
		containerEl: HTMLElement,
		name: string,
		expanded: boolean,
	): HTMLElement {
		// 先创建子容器（稍后移动到标题下方）
		const wrapperEl = containerEl.createDiv();

		let extraBtn: ExtraButtonComponent;

		// 折叠切换逻辑（抽取为单独函数，供按钮和整行点击共用）
		const toggleSection = () => {
			const becameCollapsed = wrapperEl.classList.toggle('mdrazor-collapsed');
			extraBtn.setIcon(becameCollapsed ? 'chevron-right' : 'chevron-down');
		};

		// 标题栏（带折叠切换按钮）
		const headingSetting = new Setting(containerEl)
			.setName(name)
			.setHeading()
			.addExtraButton((btn) => {
				extraBtn = btn;
				btn.setIcon(expanded ? 'chevron-down' : 'chevron-right')
					.onClick(toggleSection);
			});

		// 标记为可折叠区域标题（配合 styles.css 中的光标样式）
		headingSetting.settingEl.classList.add('mdrazor-section-heading');

		// 点击整个标题区域亦可切换折叠（按钮本身由 .onClick 处理，避免重复触发）
		headingSetting.settingEl.addEventListener('click', (e) => {
			if ((e.target as HTMLElement).closest('.clickable-icon')) return;
			toggleSection();
		});

		// 将子容器移到标题下方（DOM 顺序：标题 → 子容器）
		headingSetting.settingEl.after(wrapperEl);

		// 若默认折叠，隐藏子容器
		if (!expanded) {
			wrapperEl.classList.add('mdrazor-collapsed');
		}

		return wrapperEl;
	}
}
