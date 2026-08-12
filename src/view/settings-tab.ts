/**
 * MDRazor — 设置面板视图
 *
 * 在 Obsidian 设置中渲染 MDRazor 配置 UI。
 * 純 UI 層，不包含資料定義或業務邏輯。
 */

import { App, ExtraButtonComponent, PluginSettingTab, Setting } from 'obsidian';
import type MDRazorPlugin from '../controller/main';
import type { MDRazorSettings } from '../model/settings';

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

	/** 隐藏样式开关组件引用（受状态栏"隐藏样式启闭按钮"管辖的开关） */
	private hideToggles: Array<{ key: keyof MDRazorSettings; toggle: import('obsidian').ToggleComponent }> = [];

	constructor(app: App, plugin: MDRazorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// 每次重建界面时重置开关引用（旧组件已被 empty() 销毁）
		this.hideToggles = [];

		// ═══════════════════════════════════════════
		// 失联图片清理 配置区
		// ═══════════════════════════════════════════

		new Setting(containerEl)
			.setName('清理失联图片')
			.setDesc('启用后，左侧功能区显示垃圾桶图标按钮。点击后扫描库中未被任何笔记引用过的图片（JPG/JPEG/PNG/GIF/SVG），将其移入系统回收站')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.orphanImageCleanerEnabled)
					.onChange(async (value) => {
						this.plugin.settings.orphanImageCleanerEnabled = value;
						if (value) {
							this.plugin.orphanImageRibbon?.addRibbon();
						} else {
							this.plugin.orphanImageRibbon?.removeRibbon();
						}
						await this.plugin.saveSettings();
					}),
			);

		// ═══════════════════════════════════════════
		// 隐藏样式 配置区
		// ═══════════════════════════════════════════

		const hideSection = this.createCollapsibleSection(containerEl, '隐藏样式', true);

		this.addHideToggle(hideSection, '隐藏加粗符号', '在实时预览中隐藏 ** 加粗标记符号', 'hideBoldFormatting');

		this.addHideToggle(hideSection, '隐藏斜体符号', '在实时预览中隐藏 * 斜体标记符号', 'hideItalicFormatting');

		this.addHideToggle(hideSection, '隐藏高亮符号', '在实时预览中隐藏 == 高亮标记符号', 'hideHighlightFormatting');

		this.addHideToggle(hideSection, '隐藏删除线符号', '在实时预览中隐藏 ~~ 删除线标记符号', 'hideStrikethroughFormatting');

		this.addHideToggle(hideSection, '隐藏行内代码符号', '在实时预览中隐藏 ` 行内代码标记符号', 'hideCodeFormatting');

		this.addHideToggle(hideSection, '隐藏转义符号', '在实时预览中隐藏 \\ 转义符号', 'hideEscapeFormatting');

		this.addHideToggle(hideSection, '隐藏标题符号', '在实时预览中隐藏 # 标题标记符号', 'hideHeadingFormatting');

		this.addHideToggle(hideSection, '隐藏双链符号', '在实时预览中隐藏 [[ 和 ]] 双链格式标记', 'hideWikiLinkFormatting');

		this.addHideToggle(hideSection, '隐藏 HTML 颜色标签', '在实时预览中隐藏 <font color="#c00000"> 和 </font> 等 Hex 颜色标签对', 'hideHtmlColorTagFormatting');

		this.addHideToggle(hideSection, '隐藏 HTML 下划线符号', '在实时预览中隐藏 <u> 和 </u> 下划线 HTML 标签对', 'hideHtmlUnderlineFormatting');

		this.addHideToggle(hideSection, '隐藏 HTML 行标签', '在实时预览中隐藏 <span> 和 </span> HTML 标签对（含 style 等属性）', 'hideHtmlSpanFormatting');

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

		new Setting(hideSection)
			.setName('符号边界提示')
			.setDesc('光标处于格式标识符边界时，在光标下方弹出提示，展示光标与隐藏标识符的位置关系')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.symbolBoundaryHint)
					.onChange(async (value) => {
						this.plugin.settings.symbolBoundaryHint = value;
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

		let thresholdToggle: import('obsidian').ToggleComponent;

		new Setting(listSection)
			.setName('选项聚焦')
			.setDesc('光标移入列表项时，自动折叠其他同级及旁系列表项，仅展开焦点链（当前项、其祖先、及其子孙）')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.listFocusOption)
					.onChange(async (value) => {
						this.plugin.settings.listFocusOption = value;
						(thresholdToggle.toggleEl as HTMLInputElement).disabled = !value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(listSection)
			.setName('二级子项最大展开数')
			.setDesc('开启后，一级项的第二级子项数量 ≤ 设定值时该一级项展开。仅影响一级项，其后代仍受选项聚焦影响')
			.addSlider((slider) =>
				slider
					.setLimits(1, 9, 1)
					.setValue(this.plugin.settings.listFocusSecondThreshold)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.listFocusSecondThreshold = value;
						await this.plugin.saveSettings();
					}),
			)
			.addToggle((toggle) => {
				thresholdToggle = toggle;
				toggle
					.setValue(this.plugin.settings.listFocusSecondThresholdEnabled)
					.onChange(async (value) => {
						this.plugin.settings.listFocusSecondThresholdEnabled = value;
						await this.plugin.saveSettings();
					});
				(thresholdToggle.toggleEl as HTMLInputElement).disabled = !this.plugin.settings.listFocusOption;
			});

		new Setting(listSection)
			.setName('目录聚焦')
			.setDesc('点击文件列表的文件夹时，仅展开该文件夹及其祖先链，折叠其余无关文件夹（同级、父同级、祖父同级等）')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.dirFocusOption)
					.onChange(async (value) => {
						this.plugin.settings.dirFocusOption = value;
						await this.plugin.saveSettings();
					}),
			);

		let directOnlyToggle: import("obsidian").ToggleComponent;

		new Setting(listSection)
			.setName("显示目录文件数量")
			.setDesc("统计文件夹内子文件夹和子文件的数量，在文件夹右侧对齐显示")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showDirFileCount)
					.onChange(async (value) => {
						this.plugin.settings.showDirFileCount = value;
						(directOnlyToggle.toggleEl as HTMLInputElement).disabled = !value;
						await this.plugin.saveSettings();
						this.plugin.dirFileCountRefresher.forceRefresh();
					}),
			);

		new Setting(listSection)
			.setName("仅显示直接子项数量")
			.setDesc("开启后仅统计文件夹的直接子项（子文件夹 + 文件）；关闭后统计所有后代文件数量（递归统计子文件夹内的文件，不统计文件夹）")
			.addToggle((toggle) => {
				directOnlyToggle = toggle;
				toggle
					.setValue(this.plugin.settings.dirFileCountDirectOnly)
					.onChange(async (value) => {
						this.plugin.settings.dirFileCountDirectOnly = value;
						await this.plugin.saveSettings();
						this.plugin.dirFileCountRefresher.forceRefresh();
					});
				(directOnlyToggle.toggleEl as HTMLInputElement).disabled =
					!this.plugin.settings.showDirFileCount;
			});

		// ═══════════════════════════════════════════
		// 标签页增强 配置区
		// ═══════════════════════════════════════════

		const tabSection = this.createCollapsibleSection(containerEl, '标签页增强', true);

		new Setting(tabSection)
			.setName('默认新标签页打开')
			.setDesc('单击文件目录中的文件时，若标签页已存在则跳转，否则打开新标签页。右键菜单新建文件同样在新标签页中打开')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.tabEnhancerDefaultOpen)
					.onChange(async (value) => {
						this.plugin.settings.tabEnhancerDefaultOpen = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(tabSection)
			.setName('新标签页打开双链')
			.setDesc('在文档内点击双链时，检测目标文档是否已存在标签页，若存在则跳转，不存在则新建标签页')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.tabEnhancerOpenLink)
					.onChange(async (value) => {
						this.plugin.settings.tabEnhancerOpenLink = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(tabSection)
			.setName('新标签页打开书签')
			.setDesc('点击 Obsidian 书签中的文件时，检测目标文件是否已存在标签页，若存在则跳转，不存在则新建标签页')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.tabEnhancerOpenBookmark)
					.onChange(async (value) => {
						this.plugin.settings.tabEnhancerOpenBookmark = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(tabSection)
			.setName('垂直标签页')
			.setDesc('在文件列表中为已打开的文件显示关闭按钮，并提供标签页列表切换视图')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.verticalTabsEnabled)
					.onChange(async (value) => {
						this.plugin.settings.verticalTabsEnabled = value;
						this.plugin.verticalTabsManager?.refreshUI();
						if (!value) {
							this.plugin.verticalTabsManager?.toggleView();
						}
						await this.plugin.saveSettings();
					}),
			);

		new Setting(tabSection)
			.setName('目录展开关联标签页')
			.setDesc('开启后，从垂直标签页视图切换回文件列表时，仅展开包含标签页的文件夹；关闭后，切换时将恢复文件列表原来的展开结构')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.tabExpansionAssociatedFolders)
					.onChange(async (value) => {
						this.plugin.settings.tabExpansionAssociatedFolders = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(tabSection)
			.setName('Md文档光标和滚轴位置持久化')
			.setDesc('开启后，自动记录 Markdown 文档的光标与滚动位置（位置变更停止 250ms 后记录最终位置），重新打开文档时还原上次的位置')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.positionPersistenceEnabled)
					.onChange(async (value) => {
						this.plugin.settings.positionPersistenceEnabled = value;
						await this.plugin.saveSettings();
					}),
			);

		// ═══════════════════════════════════════════
		// 状态栏增强 配置区
		// ═══════════════════════════════════════════

		const statusSection = this.createCollapsibleSection(containerEl, '状态栏增强', true);

		new Setting(statusSection)
			.setName('工作区切换')
			.setDesc('在右下角状态栏显示工作区切换按钮，点击快速切换工作区')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.statusBarEnhancement)
					.onChange(async (value) => {
						this.plugin.settings.statusBarEnhancement = value;
						if (value) {
							this.plugin.statusBarEnhancer?.addButton();
						} else {
							this.plugin.statusBarEnhancer?.removeButton();
						}
						await this.plugin.saveSettings();
					}),
			);

		new Setting(statusSection)
			.setName('自动更新工作区布局')
			.setDesc('切换或加载工作区时，自动保存当前工作区布局。与 Obsidian 原生"加载工作区"功能及本插件工作区切换联动')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoSaveWorkspaceLayout)
					.onChange(async (value) => {
						this.plugin.settings.autoSaveWorkspaceLayout = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(statusSection)
			.setName('侧边栏伸缩按钮')
			.setDesc('在状态栏最左侧显示按钮，点击一键折叠/展开左右侧边栏。')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.sidebarToggleEnabled)
					.onChange(async (value) => {
						this.plugin.settings.sidebarToggleEnabled = value;
						if (value) {
							this.plugin.sidebarToggle?.addButton();
						} else {
							this.plugin.sidebarToggle?.removeButton();
						}
						await this.plugin.saveSettings();
					}),
			);

		new Setting(statusSection)
			.setName('隐藏样式启闭按钮')
			.setDesc('在状态栏显示按钮，一键开启/关闭各类格式隐藏样式（不包括空格可视化）')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.formatToggleEnabled)
					.onChange(async (value) => {
						this.plugin.settings.formatToggleEnabled = value;
						if (value) {
							this.plugin.formatToggle?.addButton();
						} else {
							this.plugin.formatToggle?.removeButton();
						}
						await this.plugin.saveSettings();
					}),
			);
	}

	/**
	 * 创建受状态栏"隐藏样式启闭按钮"管辖的隐藏样式开关。
	 *
	 * 与按钮双向同步：
	 *   - 开关变化 → 刷新按钮图标（refreshIcon）
	 *   - 按钮一键切换 → 经 syncHideTogglesFromSettings() 反向刷新这些开关显示
	 *
	 * @param hideSection  隐藏样式配置区容器
	 * @param name         开关名称
	 * @param desc         开关描述
	 * @param key          对应的设置键（必须为 boolean 字段）
	 */
	private addHideToggle(
		hideSection: HTMLElement,
		name: string,
		desc: string,
		key: keyof MDRazorSettings,
	): void {
		new Setting(hideSection)
			.setName(name)
			.setDesc(desc)
			.addToggle((toggle) => {
				this.hideToggles.push({ key, toggle });
				toggle
					.setValue(this.plugin.settings[key] as boolean)
					.onChange(async (value) => {
						(this.plugin.settings as unknown as Record<string, boolean>)[key] = value;
						await this.plugin.saveSettings();
						// 单项开关变化 → 同步状态栏一键按钮图标
						this.plugin.formatToggle?.refreshIcon();
					});
			});
	}

	/**
	 * 从当前设置值刷新受一键按钮管辖的隐藏样式开关显示。
	 *
	 * 由按钮/命令一键切换全部隐藏样式后调用，使设置界面的开关
	 * 与按钮（settings 对象）实际状态保持一致。
	 */
	syncHideTogglesFromSettings(): void {
		for (const { key, toggle } of this.hideToggles) {
			toggle.setValue(this.plugin.settings[key] as boolean);
		}
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
