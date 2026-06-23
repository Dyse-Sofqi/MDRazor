import { App, PluginSettingTab, Setting } from 'obsidian';
import MDRazorPlugin from './main';

export interface MDRazorSettings {
	hideBoldFormatting: boolean;
	hideItalicFormatting: boolean;
	hideHighlightFormatting: boolean;
	hideStrikethroughFormatting: boolean;
	hideCodeFormatting: boolean;
	listIntegration: boolean;
	enhancedListMarkers: boolean;
	listFocusOption: boolean;
}

export const DEFAULT_SETTINGS: MDRazorSettings = {
	hideBoldFormatting: false,
	hideItalicFormatting: false,
	hideHighlightFormatting: false,
	hideStrikethroughFormatting: false,
	hideCodeFormatting: false,
	listIntegration: false,
	enhancedListMarkers: false,
	listFocusOption: false,
};

export class MDRazorSettingTab extends PluginSettingTab {
	plugin: MDRazorPlugin;

	constructor(app: App, plugin: MDRazorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('隐藏样式')
			.setHeading();

		new Setting(containerEl)
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

		new Setting(containerEl)
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

		new Setting(containerEl)
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

		new Setting(containerEl)
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

		new Setting(containerEl)
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

		new Setting(containerEl)
			.setName('列表增强')
			.setHeading();

		new Setting(containerEl)
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

		new Setting(containerEl)
			.setName('增强列符')
			.setDesc('增强列表标识符的视觉呈现（待实现）')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enhancedListMarkers)
					.onChange(async (value) => {
						this.plugin.settings.enhancedListMarkers = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
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
}
