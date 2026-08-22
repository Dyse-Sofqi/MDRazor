/**
 * MDRazor — 设置面板视图
 *
 * 在 Obsidian 设置中渲染 MDRazor 配置 UI。
 * 純 UI 層，不包含資料定義或業務邏輯。
 *
 * 七大功能模块以标签页形式展示：隐藏样式 / 列表增强 / 标签页 /
 * 状态栏 / 左功能区 / 右键菜单 / 懒加载。当前激活标签页在插件生命周期内记忆。
 */

import { App, PluginSettingTab, Setting } from 'obsidian';
import { tr } from '../i18n';
import type { PluginManifest } from 'obsidian';
import type MDRazorPlugin from '../controller/main';
import type { MDRazorSettings } from '../model/settings';
import { SELF_PLUGIN_ID } from '../controller/lazy-load/lazy-load';
import { StartupCheckModal } from '../controller/lazy-load/startup-check';
import { renderRibbonCustomization } from './ribbon-customization';
import { renderCommandSurfaceSettings } from './command-surface-view';

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

	/** 打字机模式开关与子设置项引用（命令一键切换后同步显示） */
	private typewriterToggle?: import('obsidian').ToggleComponent;
	private typewriterOpacitySetting?: Setting;
	private typewriterTopPaddingSetting?: Setting;
	private typewriterDeadZoneJumpSetting?: Setting;

	/** 当前激活的标签页索引（会话内记忆，设置面板重开时保留） */
	private activeTabIndex = 0;

	constructor(app: App, plugin: MDRazorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// 每次重建界面时重置开关引用（旧组件已被 empty() 销毁）
		this.hideToggles = [];
		this.typewriterToggle = undefined;
		this.typewriterOpacitySetting = undefined;
		this.typewriterTopPaddingSetting = undefined;
		this.typewriterDeadZoneJumpSetting = undefined;

		this.createTabbedSection(
			containerEl,
			[
				tr('隐藏样式', 'Hide Formatting'),
				tr('列表增强', 'List Enhancement'),
				tr('标签页', 'Tabs'),
				tr('状态栏', 'Status Bar'),
				tr('左功能区', 'Left Ribbon'),
				tr('右键菜单', 'Context Menu'),
				tr('懒加载', 'Lazy Load'),
			],
			(panel, index) => {
				if (index === 0) this.buildHideSection(panel);
				else if (index === 1) this.buildListSection(panel);
				else if (index === 2) this.buildTabSection(panel);
				else if (index === 3) this.buildStatusSection(panel);
				else if (index === 4) this.buildRibbonSection(panel);
				else if (index === 5) this.buildContextMenuSection(panel);
				else this.buildLazyLoadSection(panel);
			},
		);
	}

	/* ------------------------------------------------------------------ */
	/*  左功能区（清理失联图片等左侧功能区功能）                          */
	/* ------------------------------------------------------------------ */

	private buildRibbonSection(panel: HTMLElement): void {
		new Setting(panel)
			.setName(tr('清理失联图片', 'Clean Orphan Images'))
			.setDesc(
				tr(
					'启用后，左侧功能区显示垃圾桶图标按钮。点击后扫描库中未被任何笔记引用过的图片（JPG/JPEG/PNG/GIF/SVG），将其移入系统回收站',
					'When enabled, a trash icon appears in the left ribbon. Clicking it scans the vault for images (JPG/JPEG/PNG/GIF/SVG) not referenced by any note and moves them to the system trash.',
				),
			)
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
						// 其他功能区图标增删后，重新应用隐藏命令状态
						this.plugin.ribbonManager?.refresh();
					}),
			);

		const ribbonCustomizationEl = panel.createDiv({ cls: 'mdrazor-ribbon-customization' });
		renderRibbonCustomization(ribbonCustomizationEl, this.plugin);
	}

	/* ------------------------------------------------------------------ */
	/*  右键菜单                                                           */
	/* ------------------------------------------------------------------ */

	private buildContextMenuSection(panel: HTMLElement): void {
		new Setting(panel)
			.setName(tr('展开/折叠同级列表或标题', 'Expand/Collapse Sibling Lists or Headings'))
			.setDesc(
				tr(
					'开启后在编辑器右键菜单中添加同名菜单项。点击执行与命令面板命令相同的逻辑：以光标所在列表项/标题的折叠状态为基准，统一折叠或展开光标所在行自身及全文档同层级的列表项或标题（如所有一级标题、所有一级列表项），完成后提示实际折叠/展开的数量。关闭后右键菜单不再显示该项',
					'Adds a menu item of the same name to the editor context menu when enabled. Clicking it runs the same logic as the command palette command: based on the fold state of the list item/heading under the cursor, fold or unfold the current line and all same-level list items or headings across the document (e.g., all H1 headings, all top-level list items), then reports the actual count. Disabling removes the item from the context menu.',
				),
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.contextMenuSiblingFold)
					.onChange(async (value) => {
						this.plugin.settings.contextMenuSiblingFold = value;
						await this.plugin.saveSettings();
					}),
			);

		const contextCmdEl = panel.createDiv({ cls: 'mdrazor-ribbon-customization' });
		renderCommandSurfaceSettings(contextCmdEl, this.plugin, 'contextMenu');
	}

	/* ------------------------------------------------------------------ */
	/*  隐藏样式                                                           */
	/* ------------------------------------------------------------------ */

	private buildHideSection(panel: HTMLElement): void {
		this.addHideToggle(
			panel,
			tr('隐藏加粗符号', 'Hide Bold Symbols'),
			tr('在实时预览中隐藏 ** 加粗标记符号', 'Hide the ** bold markers in Live Preview'),
			'hideBoldFormatting',
		);

		this.addHideToggle(
			panel,
			tr('隐藏斜体符号', 'Hide Italic Symbols'),
			tr('在实时预览中隐藏 * 斜体标记符号', 'Hide the * italic markers in Live Preview'),
			'hideItalicFormatting',
		);

		this.addHideToggle(
			panel,
			tr('隐藏高亮符号', 'Hide Highlight Symbols'),
			tr('在实时预览中隐藏 == 高亮标记符号', 'Hide the == highlight markers in Live Preview'),
			'hideHighlightFormatting',
		);

		this.addHideToggle(
			panel,
			tr('隐藏删除线符号', 'Hide Strikethrough Symbols'),
			tr('在实时预览中隐藏 ~~ 删除线标记符号', 'Hide the ~~ strikethrough markers in Live Preview'),
			'hideStrikethroughFormatting',
		);

		this.addHideToggle(
			panel,
			tr('隐藏行内代码符号', 'Hide Inline Code Symbols'),
			tr('在实时预览中隐藏 ` 行内代码标记符号', 'Hide the ` inline code markers in Live Preview'),
			'hideCodeFormatting',
		);

		this.addHideToggle(
			panel,
			tr('隐藏转义符号', 'Hide Escape Symbols'),
			tr('在实时预览中隐藏 \\ 转义符号', 'Hide the \\ escape sequences in Live Preview'),
			'hideEscapeFormatting',
		);

		this.addHideToggle(
			panel,
			tr('隐藏标题符号', 'Hide Heading Symbols'),
			tr('在实时预览中隐藏 # 标题标记符号', 'Hide the # heading markers in Live Preview'),
			'hideHeadingFormatting',
		);

		this.addHideToggle(
			panel,
			tr('隐藏双链符号', 'Hide Wiki Link Symbols'),
			tr('在实时预览中隐藏 [[ 和 ]] 双链格式标记', 'Hide the [[ and ]] wiki-link markers in Live Preview'),
			'hideWikiLinkFormatting',
		);

		this.addHideToggle(
			panel,
			tr('隐藏 HTML 颜色标签', 'Hide HTML Color Tags'),
			tr(
				'在实时预览中隐藏 <font color="#c00000"> 和 </font> 等 Hex 颜色标签对',
				'Hide Hex color tag pairs such as <font color="#c00000"> and </font> in Live Preview',
			),
			'hideHtmlColorTagFormatting',
		);

		this.addHideToggle(
			panel,
			tr('隐藏 HTML 下划线符号', 'Hide HTML Underline Tags'),
			tr('在实时预览中隐藏 <u> 和 </u> 下划线 HTML 标签对', 'Hide the <u> and </u> underline HTML tag pairs in Live Preview'),
			'hideHtmlUnderlineFormatting',
		);

		this.addHideToggle(
			panel,
			tr('隐藏 HTML 行标签', 'Hide HTML Span Tags'),
			tr(
				'在实时预览中隐藏 <span> 和 </span> HTML 标签对（含 style 等属性）',
				'Hide the <span> and </span> HTML tag pairs (including attributes such as style) in Live Preview',
			),
			'hideHtmlSpanFormatting',
		);

		new Setting(panel)
			.setName(tr('空格可视化', 'Show Whitespace'))
			.setDesc(tr('以半透明 · 标记显示空格位置', 'Display space positions with translucent · markers'))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showWhitespace)
					.onChange(async (value) => {
						this.plugin.settings.showWhitespace = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(panel)
			.setName(tr('符号边界提示', 'Symbol Boundary Hint'))
			.setDesc(
				tr(
					'光标处于格式标识符边界时，在光标下方弹出提示，展示光标与隐藏标识符的位置关系',
					'When the cursor is at the edge of a formatting identifier, a hint pops up below the cursor describing its position relative to the hidden identifier.',
				),
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.symbolBoundaryHint)
					.onChange(async (value) => {
						this.plugin.settings.symbolBoundaryHint = value;
						await this.plugin.saveSettings();
					}),
			);
	}

	/* ------------------------------------------------------------------ */
	/*  列表增强                                                           */
	/* ------------------------------------------------------------------ */

	private buildListSection(panel: HTMLElement): void {
		new Setting(panel)
			.setName(tr('列一体化', 'List Integration'))
			.setDesc(tr('将列表标识符与后方空格视为一个整体，点击时光标只能落在标识符之前或空格之后', 'Treat a list marker and the following space as a single unit; when clicked, the cursor can only land before the marker or after the space.'))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.listIntegration)
					.onChange(async (value) => {
						this.plugin.settings.listIntegration = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(panel)
			.setName(tr('回车软换行', 'Insert Soft Break on Enter'))
			.setDesc(tr('在列表项内按回车时插入软换行（续行缩进）而非创建新列表项', 'Pressing Enter inside a list item inserts a soft line break (continuation indentation) instead of creating a new list item.'))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enterSoftBreak)
					.onChange(async (value) => {
						this.plugin.settings.enterSoftBreak = value;
						await this.plugin.saveSettings();
					}),
			);

		let thresholdToggle: import('obsidian').ToggleComponent;
		let scrollSyncToggle: import('obsidian').ToggleComponent;

		new Setting(panel)
			.setName(tr('选项聚焦', 'Focus List Item'))
			.setDesc(tr('光标移入列表项时，自动折叠其他同级及旁系列表项，仅展开焦点链（当前项、其祖先、及其子孙）', 'When the cursor enters a list item, other sibling and side-branch items are folded automatically so only the focus chain (the current item, its ancestors, and its descendants) stays expanded.'))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.listFocusOption)
					.onChange(async (value) => {
						this.plugin.settings.listFocusOption = value;
						(thresholdToggle.toggleEl as HTMLInputElement).disabled = !value;
						(scrollSyncToggle.toggleEl as HTMLInputElement).disabled = !value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(panel)
			.setName(tr('二级子项最大展开数', 'Max Second-Level Children to Expand'))
			.setDesc(tr('开启后，一级项的第二级子项数量 ≤ 设定值时该一级项展开。仅影响一级项，其后代仍受选项聚焦影响', 'When enabled, a top-level item expands if the number of its second-level children is no more than this value. Only affects top-level items; their descendants still follow Focus List Item.'))
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

		new Setting(panel)
			.setName(tr('滚轴同步', 'Scroll Sync'))
			.setDesc(tr('选项聚焦触发折叠/展开时，自动将光标所在行滚动至视口 25% 处，避免长列表伸缩使光标跑出视图外', 'When Focus List Item triggers a fold/unfold, the cursor line is scrolled to 25% of the viewport so the cursor stays in view while long lists expand or collapse.'))
			.addToggle((toggle) => {
				scrollSyncToggle = toggle;
				toggle
					.setValue(this.plugin.settings.focusScrollSync)
					.onChange(async (value) => {
						this.plugin.settings.focusScrollSync = value;
						await this.plugin.saveSettings();
					});
				(scrollSyncToggle.toggleEl as HTMLInputElement).disabled = !this.plugin.settings.listFocusOption;
			});

		new Setting(panel)
			.setName(tr('↑↓键默认不跳过被折叠的列表/标题项', "Don't Skip Folded Items on Up/Down"))
			.setDesc(
				tr(
					'按下/上键时，若目标行是被折叠的列表项或标题内容，主动展开该折叠块并进入目标行（保持目标列），而非像 codemirror 原生那样整块跳过',
					"When pressing up/down and the target line is inside a folded list item or heading, expand the block and enter the target line (keeping the target column) instead of skipping the whole block like CodeMirror does natively.",
				),
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.arrowKeyEnterFolded)
					.onChange(async (value) => {
						this.plugin.settings.arrowKeyEnterFolded = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(panel)
			.setName(tr('目录聚焦', 'Focus Folder'))
			.setDesc(tr('点击文件列表的文件夹时，仅展开该文件夹及其祖先链，折叠其余无关文件夹（同级、父同级、祖父同级等）', 'When clicking a folder in the file list, expand only that folder and its ancestor chain, folding unrelated folders (siblings, parents\' siblings, etc.).'))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.dirFocusOption)
					.onChange(async (value) => {
						this.plugin.settings.dirFocusOption = value;
						await this.plugin.saveSettings();
					}),
			);

		let directOnlyToggle: import("obsidian").ToggleComponent;

		new Setting(panel)
			.setName(tr("显示目录文件数量", "Show File Count in Folders"))
			.setDesc(tr("统计文件夹内子文件夹和子文件的数量，在文件夹右侧对齐显示", "Count sub-folders and files inside each folder and right-align the total next to the folder name."))
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

		new Setting(panel)
			.setName(tr("仅显示直接子项数量", "Direct Children Only"))
			.setDesc(tr("开启后仅统计文件夹的直接子项（子文件夹 + 文件）；关闭后统计所有后代文件数量（递归统计子文件夹内的文件，不统计文件夹）", "When enabled, counts only a folder's direct children (sub-folders + files); when disabled, counts all descendant files (recursively counting files in sub-folders, not the folders themselves)."))
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

		new Setting(panel)
			.setName(tr('展开/折叠同级列表或标题（命令）', 'Expand/Collapse Sibling Lists or Headings (Command)'))
			.setDesc(
				tr(
					'在命令面板中可触发并绑定快捷键。以光标所在列表项/标题的折叠状态为基准，统一折叠或展开光标所在行自身及全文档同层级的列表项或标题（如所有一级标题、所有一级列表项），完成后提示实际折叠/展开的数量。如需在右键菜单中使用，请在「右键菜单」标签页开启对应开关',
					'Triggerable from the command palette and bindable to hotkeys. Based on the fold state of the list item/heading under the cursor, fold or unfold the current line and all same-level list items or headings across the document (e.g., all H1 headings, all top-level list items), then reports the actual count. To use it from the context menu, enable the matching toggle in the "Context Menu" tab.',
				),
			)
			.addExtraButton((button) => {
				button.setIcon('info').onClick(() => undefined);
				button.extraSettingsEl.title = tr('无需开关，命令常驻可用', 'Always available; no toggle needed');
			});
	}

	/* ------------------------------------------------------------------ */
	/*  标签页                                                             */
	/* ------------------------------------------------------------------ */

	private buildTabSection(panel: HTMLElement): void {
		new Setting(panel)
			.setName(tr('默认新标签页打开', 'Open in New Tab by Default'))
			.setDesc(tr('单击文件目录中的文件时，若标签页已存在则跳转，否则打开新标签页。右键菜单新建文件同样在新标签页中打开', 'When clicking a file in the file explorer, jump to its existing tab if present, otherwise open a new tab. New files created via the context menu also open in a new tab.'))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.tabEnhancerDefaultOpen)
					.onChange(async (value) => {
						this.plugin.settings.tabEnhancerDefaultOpen = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(panel)
			.setName(tr('新标签页打开双链', 'Open Wiki Links in New Tab'))
			.setDesc(tr('在文档内点击双链时，检测目标文档是否已存在标签页，若存在则跳转，不存在则新建标签页', "When clicking a wiki link in a document, jump to the target's existing tab if present, otherwise open it in a new tab."))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.tabEnhancerOpenLink)
					.onChange(async (value) => {
						this.plugin.settings.tabEnhancerOpenLink = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(panel)
			.setName(tr('新标签页打开书签', 'Open Bookmarks in New Tab'))
			.setDesc(tr('点击 Obsidian 书签中的文件时，检测目标文件是否已存在标签页，若存在则跳转，不存在则新建标签页', 'When clicking a file in Obsidian bookmarks, jump to its existing tab if present, otherwise open it in a new tab.'))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.tabEnhancerOpenBookmark)
					.onChange(async (value) => {
						this.plugin.settings.tabEnhancerOpenBookmark = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(panel)
			.setName(tr('垂直标签页', 'Vertical Tabs'))
			.setDesc(tr('在文件列表中为已打开的文件显示关闭按钮，并提供标签页列表切换视图', 'Show a close button for open files in the file explorer and provide a vertical tab-list switch view.'))
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

		new Setting(panel)
			.setName(tr('目录展开关联标签页', 'Expand Folders with Open Tabs'))
			.setDesc(tr('开启后，从垂直标签页视图切换回文件列表时，仅展开包含标签页的文件夹；关闭后，切换时将恢复文件列表原来的展开结构', 'When enabled, switching back from the vertical tab view to the file list expands only folders that contain open tabs; when disabled, the original folder expansion is restored.'))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.tabExpansionAssociatedFolders)
					.onChange(async (value) => {
						this.plugin.settings.tabExpansionAssociatedFolders = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(panel)
			.setName(tr('MD文档光标和滚轴位置持久化', 'Remember Cursor & Scroll Position'))
			.setDesc(
				tr(
					'开启后，自动记录 Markdown 文档的光标与滚动位置（位置变更停止 250ms 后记录最终位置），重新打开文档时还原上次的位置',
					'When enabled, the cursor and scroll position of each Markdown document are recorded automatically (the final position is saved 250 ms after changes stop) and restored when the document is reopened.',
				),
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.positionPersistenceEnabled)
					.onChange(async (value) => {
						this.plugin.settings.positionPersistenceEnabled = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(panel)
			.setName(tr('打字机模式', 'Typewriter Mode'))
			.setDesc(
				tr(
					'开启后，编辑文档时光标所在行保持在页面中部区域（范围居中），死区外（顶部/底部 1/8）的行按下方「死区外的不透明度」淡化显示。命令「开启/关闭打字机模式」可绑定快捷键',
					'Keeps the line under the cursor in the middle area of the page while editing; lines outside the dead zone (top/bottom 1/8) are dimmed per the "Opacity Outside Dead Zone" setting below. The "Toggle Typewriter Mode" command can be bound to a hotkey.',
				),
			)
			.addToggle((toggle) => {
				this.typewriterToggle = toggle;
				toggle
					.setValue(this.plugin.settings.typewriterMode)
					.onChange(async (value) => {
						this.plugin.settings.typewriterMode = value;
						await this.plugin.saveSettings();
						this.syncTypewriterFromSettings();
					});
			});

		this.typewriterOpacitySetting = new Setting(panel)
			.setName(tr('死区外的不透明度', 'Opacity Outside Dead Zone'))
			.setDesc(
				tr(
					'打字机模式下，光标所在中部死区（视口 12.5%~87.5%）之外的行（顶部/底部 1/8）的显示不透明度（0-100）。100 为完全不淡化；死区内与当前行保持明亮。仅模式开启时生效',
					'The display opacity (0–100) for lines outside the middle dead zone (12.5%–87.5% of the viewport) under Typewriter Mode. 100 means no dimming at all; lines inside the dead zone and the current line stay bright. Only applies while the mode is on.',
				),
			)
			.addSlider((slider) =>
				slider
					.setLimits(0, 100, 1)
					.setValue(this.plugin.settings.typewriterOpacity)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.typewriterOpacity = value;
						await this.plugin.saveSettings();
					}),
			);

		this.typewriterTopPaddingSetting = new Setting(panel)
			.setName(tr('允许文档头部留存空白区域', 'Allow Top Padding'))
			.setDesc(
				tr(
					'开启后，在文档开头预留视口高度 1/8 的空白，使光标位于文档第一行时也能滚入页面中部区域（死区上沿，否则第一行受滚动顶部边界钳制）。仅模式开启时生效',
					'When enabled, reserves blank space at the top of the document equal to 1/8 of the viewport height so the cursor on the first line can scroll into the middle dead zone (its upper edge; otherwise the first line is pinned by the scroll top boundary). Only applies while the mode is on.',
				),
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.typewriterTopPadding)
					.onChange(async (value) => {
						this.plugin.settings.typewriterTopPadding = value;
						await this.plugin.saveSettings();
					}),
			);

		this.typewriterDeadZoneJumpSetting = new Setting(panel)
			.setName(tr('死区下沿跳转上沿', 'Jump from Dead-Zone Bottom to Top'))
			.setDesc(
				tr(
					'开启后，光标所在行跨过死区下沿（视口 87.5%）时跳到上沿（视口 12.5%）；关闭时（默认），光标跨过下沿则调整滚回下沿（87.5%）维持视觉位置。上沿（12.5%）的维持行为始终开启。仅模式开启时生效',
					'When enabled, a line crossing the dead zone\'s lower edge (87.5% of the viewport) jumps to the upper edge (12.5%); when disabled (default), crossing the lower edge scrolls back to the lower edge to keep the visual position. The upper-edge (12.5%) keep behavior is always on. Only applies while the mode is on.',
				),
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.typewriterBottomJumpToTop)
					.onChange(async (value) => {
						this.plugin.settings.typewriterBottomJumpToTop = value;
						await this.plugin.saveSettings();
					}),
			);

		this.applyTypewriterChildVisibility();
	}

	/* ------------------------------------------------------------------ */
	/*  状态栏                                                             */
	/* ------------------------------------------------------------------ */

	private buildStatusSection(panel: HTMLElement): void {
		new Setting(panel)
			.setName(tr('工作区切换', 'Workspace Switcher'))
			.setDesc(tr('在右下角状态栏显示工作区切换按钮，点击快速切换工作区', 'Show a workspace switcher button in the status bar at the bottom-right to switch workspaces quickly.'))
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

		new Setting(panel)
			.setName(tr('自动更新工作区布局', 'Auto-Update Workspace Layout'))
			.setDesc(
				tr(
					'切换或加载工作区时，自动保存当前工作区布局。与 Obsidian 原生"加载工作区"功能及本插件工作区切换联动',
					'Automatically save the current layout when switching or loading a workspace. Works together with Obsidian\'s native "Manage workspaces" feature and this plugin\'s workspace switcher.',
				),
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoSaveWorkspaceLayout)
					.onChange(async (value) => {
						this.plugin.settings.autoSaveWorkspaceLayout = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(panel)
			.setName(tr('侧边栏伸缩按钮', 'Sidebar Toggle Button'))
			.setDesc(tr('在状态栏最左侧显示按钮，点击一键折叠/展开左右侧边栏。', 'Show a button at the far left of the status bar to collapse/expand both sidebars with one click.'))
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

		new Setting(panel)
			.setName(tr('隐藏样式启闭按钮', 'Toggle Formatting Hiding Button'))
			.setDesc(tr('在状态栏显示按钮，一键开启/关闭各类格式隐藏样式（不包括空格可视化）', 'Show a status-bar button to enable/disable all formatting-hiding styles at once (excluding space visualization).'))
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

		const statusCmdEl = panel.createDiv({ cls: 'mdrazor-ribbon-customization' });
		renderCommandSurfaceSettings(statusCmdEl, this.plugin, 'statusBar');
	}

	/* ------------------------------------------------------------------ */
	/*  懒加载（移植自 Plugin Manager）                                    */
	/* ------------------------------------------------------------------ */

	private buildLazyLoadSection(panel: HTMLElement): void {
		new Setting(panel)
			.setName(tr('懒加载第三方插件', 'Enable Lazy Loading'))
			.setDesc(
				tr(
					'开启后，下方列出此库中检测到的社区插件，可逐项设置是否懒加载及各插件的启动延迟（秒）。被标记懒加载的插件启动时不会随 Obsidian 立即加载，而是等待设定延迟结束后再加载；各插件延迟的相对大小即构成启动顺序。本插件自身不参与懒加载。关闭本开关或卸载本插件时，所有懒加载插件会自动恢复为常规加载',
					'When enabled, community plugins detected in this vault are listed below so you can set lazy loading and the startup delay (in seconds) per plugin. Plugins marked for lazy loading do not load immediately with Obsidian; they load after their configured delay, and the relative delays form the startup order. This plugin itself never participates in lazy loading. Turning this off or unloading this plugin restores all lazily-loaded plugins to normal loading.',
				),
			)
			.addExtraButton((button) =>
				button
					.setIcon('lucide-timer')
					.setTooltip(tr('立即检查', 'Check now'))
					.onClick(() => {
						new StartupCheckModal(this.app, this.plugin, this.plugin.startupTimings).open();
					}),
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.lazyLoadEnabled)
					.onChange(async (value) => {
						this.plugin.settings.lazyLoadEnabled = value;
						if (value) {
							this.plugin.lazyLoadManager.start();
						} else {
							this.plugin.lazyLoadManager.restore();
						}
						await this.plugin.saveSettings();
						this.renderLazyPluginList(listEl);
					}),
			);

		const listEl = panel.createDiv({ cls: 'mdrazor-lazy-grid' });
		this.renderLazyPluginList(listEl);
	}

	/**
	 * 渲染「懒加载第三方插件」下按名称排序的社区插件懒加载管理列表。
	 * 两栏网格展示，每项：插件名 + 启用开关 + 启动延迟（秒）输入（不展示插件简介）。
	 */
	private renderLazyPluginList(listEl: HTMLElement): void {
		listEl.empty();
		if (!this.plugin.settings.lazyLoadEnabled) return;

		const pmAPI = (this.app as unknown as {
			plugins: { plugins: Record<string, unknown>; manifests: Record<string, PluginManifest> };
		}).plugins;

		// 社区插件判断：核心插件 manifest 不含 version
		const isCommunityManifest = (m: PluginManifest): boolean =>
			typeof (m as PluginManifest & { version?: string }).version === 'string';

		const entries = Object.entries(pmAPI.manifests)
			.filter(([id, manifest]) => id !== SELF_PLUGIN_ID && isCommunityManifest(manifest))
			.sort((a, b) => a[1].name.localeCompare(b[1].name, undefined, { sensitivity: 'base' }));

		// 清理已不存在插件的遗留配置（插件被卸载/改名后残留）
		let pruned = false;
		for (const id of Object.keys(this.plugin.settings.lazyLoadPlugins)) {
			if (id !== SELF_PLUGIN_ID && !pmAPI.manifests[id]) {
				delete this.plugin.settings.lazyLoadPlugins[id];
				pruned = true;
			}
		}
		if (pruned) void this.plugin.saveSettings();

		if (entries.length === 0) {
			new Setting(listEl)
				.setName(tr('未检测到社区插件', 'No Community Plugins Detected'))
				.setDesc(tr('此库当前没有可管理的第三方社区插件', 'There are currently no third-party community plugins to manage in this vault.'));
			return;
		}

		for (const [id, manifest] of entries) {
			let cfg = this.plugin.settings.lazyLoadPlugins[id];
			if (!cfg) {
				cfg = {
					delay: 0,
					enabled: Object.prototype.hasOwnProperty.call(pmAPI.plugins, id),
				};
				this.plugin.settings.lazyLoadPlugins[id] = cfg;
			}

			new Setting(listEl)
				.setName(manifest.name)
				.addText((text) => {
					text.inputEl.type = 'number';
					text.inputEl.min = '0';
					text.inputEl.addClass('mdrazor-lazy-delay-input');
					text.inputEl.title = tr('启动延迟（秒）：0 表示不懒加载', 'Startup delay (seconds): 0 = no lazy loading');
					text.setPlaceholder('0');
					text.setValue(cfg.delay === 0 ? '' : String(cfg.delay / 1000));
					text.onChange((input) => {
						const num = Number(input);
						const seconds = Number.isFinite(num) && num > 0 ? num : 0;
						void this.plugin.lazyLoadManager.setDelay(id, Math.round(seconds * 1000));
					});
				})
				.addToggle((toggle) =>
					toggle
						.setValue(cfg.enabled)
						.onChange((value) => void this.plugin.lazyLoadManager.setEnabled(id, value)),
				);
		}
	}

	/* ------------------------------------------------------------------ */
	/*  共享辅助                                                           */
	/* ------------------------------------------------------------------ */

	/**
	 * 创建标签页容器与面板。
	 *
	 * @param containerEl  父容器
	 * @param labels       各标签页名称（顺序即展示顺序）
	 * @param build        每个面板的内容构建回调（panel, index）
	 */
	private createTabbedSection(
		containerEl: HTMLElement,
		labels: string[],
		build: (panel: HTMLElement, index: number) => void,
	): void {
		const tabsEl = containerEl.createDiv({ cls: 'mdrazor-settings-tabs' });
		const panels: HTMLElement[] = [];
		const buttons: HTMLElement[] = [];

		const activate = (index: number): void => {
			this.activeTabIndex = index;
			buttons.forEach((btn, j) => btn.toggleClass('is-active', j === index));
			panels.forEach((panel, j) => panel.toggleClass('is-active', j === index));
		};

		labels.forEach((label, i) => {
			const panel = containerEl.createDiv({ cls: 'mdrazor-settings-tab-panel' });
			build(panel, i);
			panels.push(panel);

			const btn = tabsEl.createDiv({ cls: 'mdrazor-settings-tab', text: label });
			buttons.push(btn);
			btn.addEventListener('click', () => activate(i));
		});

		activate(this.activeTabIndex);
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
	 * 打字机模式子设置项显隐：仅模式开启时显示「死区外的不透明度」与
	 * 「允许文档头部留存空白区域」。
	 */
	private applyTypewriterChildVisibility(): void {
		const show = this.plugin.settings.typewriterMode;
		for (const setting of [
			this.typewriterOpacitySetting,
			this.typewriterTopPaddingSetting,
			this.typewriterDeadZoneJumpSetting,
		]) {
			if (setting) setting.settingEl.style.display = show ? '' : 'none';
		}
	}

	/**
	 * 从当前设置值刷新打字机模式开关与子设置项显隐。
	 * 由命令「开启/关闭打字机模式」一键切换后调用，使设置界面与设置对象保持一致。
	 */
	syncTypewriterFromSettings(): void {
		this.typewriterToggle?.setValue(this.plugin.settings.typewriterMode);
		this.applyTypewriterChildVisibility();
	}
}
