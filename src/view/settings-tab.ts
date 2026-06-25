/**
 * MDRazor — 设置面板视图
 *
 * 在 Obsidian 设置中渲染 MDRazor 配置 UI。
 * 純 UI 層，不包含資料定義或業務邏輯。
 */

import { App, ExtraButtonComponent, PluginSettingTab, Setting } from 'obsidian';
import type MDRazorPlugin from '../controller/main';

/**
 * 在 Obsidian 设置中显示的设置面板：设置 → 第三方插件 → MDRazor。
 *
 * 每个 Setting 创建一个开关，读取并写入 `plugin.settings`。
 * 每次 onChange 中调用 `plugin.saveSettings()` 会触发
 * controller/main.ts 中的 syncConfig()，将新值传播到对应模块的
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

		new Setting(hideSection)
			.setName('空格可视化')
			.setDesc('以半透明 · 标记显示空格位置')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showWhitespace)
					.onChange(async (value) => {
						this.plugin.settings.showWhitespace = value;
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
			.setDesc('光标移入列表项时，自动折叠其他同级及旁系列表项，仅展开焦点链（当前项、其祖先、及其子孙）')
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
		const wrapperEl = containerEl.createDiv();

		let extraBtn: ExtraButtonComponent;

		const toggleSection = () => {
			const becameCollapsed = wrapperEl.classList.toggle('mdrazor-collapsed');
			extraBtn.setIcon(becameCollapsed ? 'chevron-right' : 'chevron-down');
		};

		const headingSetting = new Setting(containerEl)
			.setName(name)
			.setHeading()
			.addExtraButton((btn) => {
				extraBtn = btn;
				btn.setIcon(expanded ? 'chevron-down' : 'chevron-right')
					.onClick(toggleSection);
			});

		headingSetting.settingEl.classList.add('mdrazor-section-heading');

		headingSetting.settingEl.addEventListener('click', (e) => {
			if ((e.target as HTMLElement).closest('.clickable-icon')) return;
			toggleSection();
		});

		headingSetting.settingEl.after(wrapperEl);

		if (!expanded) {
			wrapperEl.classList.add('mdrazor-collapsed');
		}

		return wrapperEl;
	}
}
