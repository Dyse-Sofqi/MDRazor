/**
 * MDRazor — 自定义功能区命令创建向导
 *
 * 三步流程：
 *   1. 从 Obsidian 全部命令（原生 + 插件）中选择命令
 *   2. 确认显示名称
 *   3. 从 Lucide 图标库中选择/筛选图标
 */

import { App, ButtonComponent, getIconIds, Modal, requireApiVersion, setIcon, TextComponent } from 'obsidian';
import { tr } from '../i18n';
import type MDRazorPlugin from '../controller/main';
import type { CommandSurface } from '../controller/command-surface/command-surface';

interface CommandOption {
	id: string;
	name: string;
	icon?: string;
}

/** 当运行时无法读取全局 Lucide 图标表时的静态回退列表 */
const FALLBACK_LUCIDE_ICONS = [			"activity",
			"airplay",
			"alarm-check",
			"alarm-clock-off",
			"alarm-clock",
			"alarm-minus",
			"alarm-plus",
			"album",
			"alert-circle",
			"alert-octagon",
			"alert-triangle",
			"align-center-horizontal",
			"align-center-vertical",
			"align-center",
			"align-end-horizontal",
			"align-end-vertical",
			"align-horizontal-distribute-center",
			"align-horizontal-distribute-end",
			"align-horizontal-distribute-start",
			"align-horizontal-justify-center",
			"align-horizontal-justify-end",
			"align-horizontal-justify-start",
			"align-horizontal-space-around",
			"align-horizontal-space-between",
			"align-justify",
			"align-left",
			"align-right",
			"align-start-horizontal",
			"align-start-vertical",
			"align-vertical-distribute-center",
			"align-vertical-distribute-end",
			"align-vertical-distribute-start",
			"align-vertical-justify-center",
			"align-vertical-justify-end",
			"align-vertical-justify-start",
			"align-vertical-space-around",
			"align-vertical-space-between",
			"anchor",
			"aperture",
			"archive",
			"arrow-big-down",
			"arrow-big-left",
			"arrow-big-right",
			"arrow-big-up",
			"arrow-down-circle",
			"arrow-down-left",
			"arrow-down-right",
			"arrow-down",
			"arrow-left-circle",
			"arrow-left-right",
			"arrow-left",
			"arrow-right-circle",
			"arrow-right",
			"arrow-up-circle",
			"arrow-up-left",
			"arrow-up-right",
			"arrow-up",
			"asterisk",
			"at-sign",
			"award",
			"axe",
			"banknote",
			"bar-chart-2",
			"bar-chart",
			"baseline",
			"battery-charging",
			"battery-full",
			"battery-low",
			"battery-medium",
			"battery",
			"beaker",
			"bell-minus",
			"bell-off",
			"bell-plus",
			"bell-ring",
			"bell",
			"bike",
			"binary",
			"bitcoin",
			"bluetooth-connected",
			"bluetooth-off",
			"bluetooth-searching",
			"bluetooth",
			"bold",
			"book-open",
			"book",
			"bookmark-minus",
			"bookmark-plus",
			"bookmark",
			"bot",
			"box-select",
			"box",
			"briefcase",
			"brush",
			"bug",
			"building-2",
			"building",
			"bus",
			"calculator",
			"calendar",
			"camera-off",
			"camera",
			"car",
			"carrot",
			"cast",
			"check-circle-2",
			"check-circle",
			"check-square",
			"check",
			"chevron-down",
			"chevron-first",
			"chevron-last",
			"chevron-left",
			"chevron-right",
			"chevron-up",
			"chevrons-down-up",
			"chevrons-down",
			"chevrons-left",
			"chevrons-right",
			"chevrons-up-down",
			"chevrons-up",
			"chrome",
			"circle-slashed",
			"circle",
			"clipboard-check",
			"clipboard-copy",
			"clipboard-list",
			"clipboard-x",
			"clipboard",
			"clock-1",
			"clock-10",
			"clock-11",
			"clock-12",
			"clock-2",
			"clock-3",
			"clock-4",
			"clock-5",
			"clock-6",
			"clock-7",
			"clock-8",
			"clock-9",
			"lucide-clock",
			"cloud-drizzle",
			"cloud-fog",
			"cloud-hail",
			"cloud-lightning",
			"cloud-moon",
			"cloud-off",
			"cloud-rain-wind",
			"cloud-rain",
			"cloud-snow",
			"cloud-sun",
			"lucide-cloud",
			"cloudy",
			"clover",
			"code-2",
			"code",
			"codepen",
			"codesandbox",
			"coffee",
			"coins",
			"columns",
			"command",
			"compass",
			"contact",
			"contrast",
			"cookie",
			"copy",
			"copyleft",
			"copyright",
			"corner-down-left",
			"corner-down-right",
			"corner-left-down",
			"corner-left-up",
			"corner-right-down",
			"corner-right-up",
			"corner-up-left",
			"corner-up-right",
			"cpu",
			"credit-card",
			"crop",
			"lucide-cross",
			"crosshair",
			"crown",
			"currency",
			"database",
			"delete",
			"dice-1",
			"dice-2",
			"dice-3",
			"dice-4",
			"dice-5",
			"dice-6",
			"disc",
			"divide-circle",
			"divide-square",
			"divide",
			"dollar-sign",
			"download-cloud",
			"download",
			"dribbble",
			"droplet",
			"droplets",
			"drumstick",
			"edit-2",
			"edit-3",
			"edit",
			"egg",
			"equal-not",
			"equal",
			"eraser",
			"euro",
			"expand",
			"external-link",
			"eye-off",
			"eye",
			"facebook",
			"fast-forward",
			"feather",
			"figma",
			"file-check-2",
			"file-check",
			"file-code",
			"file-digit",
			"file-input",
			"file-minus-2",
			"file-minus",
			"file-output",
			"file-plus-2",
			"file-plus",
			"file-search",
			"file-text",
			"file-x-2",
			"file-x",
			"file",
			"files",
			"film",
			"filter",
			"flag-off",
			"flag-triangle-left",
			"flag-triangle-right",
			"flag",
			"flame",
			"flashlight-off",
			"flashlight",
			"flask-conical",
			"flask-round",
			"folder-minus",
			"folder-open",
			"folder-plus",
			"lucide-folder",
			"form-input",
			"forward",
			"frame",
			"framer",
			"frown",
			"function-square",
			"gamepad-2",
			"gamepad",
			"gauge",
			"gavel",
			"gem",
			"ghost",
			"gift",
			"git-branch-plus",
			"git-branch",
			"git-commit",
			"git-fork",
			"git-merge",
			"git-pull-request",
			"github",
			"gitlab",
			"glasses",
			"globe-2",
			"globe",
			"grab",
			"graduation-cap",
			"grid",
			"grip-horizontal",
			"grip-vertical",
			"hammer",
			"hand-metal",
			"hand",
			"hard-drive",
			"hard-hat",
			"hash",
			"haze",
			"headphones",
			"heart",
			"help-circle",
			"hexagon",
			"highlighter",
			"history",
			"home",
			"image-minus",
			"image-off",
			"image-plus",
			"image",
			"import",
			"inbox",
			"indent",
			"indian-rupee",
			"infinity",
			"lucide-info",
			"inspect",
			"instagram",
			"italic",
			"japanese-yen",
			"key",
			"keyboard",
			"landmark",
			"lucide-languages",
			"laptop-2",
			"laptop",
			"lasso-select",
			"lasso",
			"layers",
			"layout-dashboard",
			"layout-grid",
			"layout-list",
			"layout-template",
			"layout",
			"library",
			"life-buoy",
			"lightbulb-off",
			"lightbulb",
			"link-2-off",
			"link-2",
			"lucide-link",
			"linkedin",
			"list-checks",
			"list-minus",
			"list-ordered",
			"list-plus",
			"list-x",
			"list",
			"loader-2",
			"loader",
			"locate-fixed",
			"locate-off",
			"locate",
			"lock",
			"log-in",
			"log-out",
			"mail",
			"map-pin",
			"map",
			"maximize-2",
			"maximize",
			"megaphone",
			"meh",
			"menu",
			"message-circle",
			"message-square",
			"mic-off",
			"mic",
			"minimize-2",
			"minimize",
			"minus-circle",
			"minus-square",
			"minus",
			"monitor-off",
			"monitor-speaker",
			"monitor",
			"moon",
			"more-horizontal",
			"more-vertical",
			"mountain-snow",
			"mountain",
			"mouse-pointer-2",
			"mouse-pointer-click",
			"mouse-pointer",
			"mouse",
			"move-diagonal-2",
			"move-diagonal",
			"move-horizontal",
			"move-vertical",
			"move",
			"music",
			"navigation-2",
			"navigation",
			"network",
			"octagon",
			"option",
			"outdent",
			"package-check",
			"package-minus",
			"package-plus",
			"package-search",
			"package-x",
			"package",
			"palette",
			"palmtree",
			"paperclip",
			"pause-circle",
			"pause-octagon",
			"pause",
			"pen-tool",
			"lucide-pencil",
			"percent",
			"person-standing",
			"phone-call",
			"phone-forwarded",
			"phone-incoming",
			"phone-missed",
			"phone-off",
			"phone-outgoing",
			"phone",
			"pie-chart",
			"piggy-bank",
			"lucide-pin",
			"pipette",
			"plane",
			"play-circle",
			"play",
			"plug-zap",
			"plus-circle",
			"plus-square",
			"plus",
			"pocket",
			"podcast",
			"pointer",
			"pound-sterling",
			"power-off",
			"power",
			"printer",
			"qr-code",
			"quote",
			"radio-receiver",
			"radio",
			"redo",
			"refresh-ccw",
			"refresh-cw",
			"regex",
			"repeat-1",
			"repeat",
			"reply-all",
			"reply",
			"rewind",
			"rocket",
			"rocking-chair",
			"rotate-ccw",
			"rotate-cw",
			"rss",
			"ruler",
			"russian-ruble",
			"save",
			"scale",
			"scan-line",
			"scan",
			"scissors",
			"screen-share-off",
			"screen-share",
			"lucide-search",
			"send",
			"separator-horizontal",
			"separator-vertical",
			"server-crash",
			"server-off",
			"server",
			"settings-2",
			"settings",
			"share-2",
			"share",
			"sheet",
			"shield-alert",
			"shield-check",
			"shield-close",
			"shield-off",
			"shield",
			"shirt",
			"shopping-bag",
			"shopping-cart",
			"shovel",
			"shrink",
			"shuffle",
			"sidebar-close",
			"sidebar-open",
			"sidebar",
			"sigma",
			"signal-high",
			"signal-low",
			"signal-medium",
			"signal-zero",
			"signal",
			"skip-back",
			"skip-forward",
			"skull",
			"slack",
			"slash",
			"sliders",
			"smartphone-charging",
			"smartphone",
			"smile",
			"snowflake",
			"sort-asc",
			"sort-desc",
			"speaker",
			"sprout",
			"square",
			"star-half",
			"lucide-star",
			"stop-circle",
			"stretch-horizontal",
			"stretch-vertical",
			"strikethrough",
			"subscript",
			"sun",
			"sunrise",
			"sunset",
			"superscript",
			"swiss-franc",
			"switch-camera",
			"table",
			"tablet",
			"tag",
			"target",
			"tent",
			"terminal-square",
			"terminal",
			"text-cursor-input",
			"text-cursor",
			"thermometer-snowflake",
			"thermometer-sun",
			"thermometer",
			"thumbs-down",
			"thumbs-up",
			"ticket",
			"timer-off",
			"timer-reset",
			"timer",
			"toggle-left",
			"toggle-right",
			"tornado",
			"trash-2",
			"lucide-trash",
			"trello",
			"trending-down",
			"trending-up",
			"triangle",
			"truck",
			"tv-2",
			"tv",
			"twitch",
			"twitter",
			"type",
			"umbrella",
			"underline",
			"undo",
			"unlink-2",
			"unlink",
			"unlock",
			"upload-cloud",
			"upload",
			"user-check",
			"user-minus",
			"user-plus",
			"user-x",
			"user",
			"users",
			"verified",
			"vibrate",
			"video-off",
			"video",
			"view",
			"voicemail",
			"volume-1",
			"volume-2",
			"volume-x",
			"volume",
			"wallet",
			"wand",
			"watch",
			"waves",
			"webcam",
			"wifi-off",
			"wifi",
			"wind",
			"wrap-text",
			"wrench",
			"x-circle",
			"x-octagon",
			"x-square",
			"x",
			"youtube",
			"zap-off",
			"zap",
			"zoom-in",
			"zoom-out",
			"search-large",
];

function getLucideIconIds(): string[] {
	// Obsidian 1.7.3+ 提供官方 getIconIds()，直接读取当前版本内置的全部图标
	if (requireApiVersion('1.7.3')) {
		try {
			const ids = getIconIds();
			if (ids.length > 0) return [...ids].sort();
		} catch {
			// 回退到下面的兼容方式
		}
	}

	const win = window as unknown as {
		Lucide?: { icons?: Record<string, unknown> };
		lucide?: { icons?: Record<string, unknown> };
	};
	const fromGlobal = win.Lucide?.icons ?? win.lucide?.icons;
	if (fromGlobal && typeof fromGlobal === 'object') {
		const ids = Object.keys(fromGlobal);
		if (ids.length > 0) return ids.sort();
	}

	return FALLBACK_LUCIDE_ICONS.sort();
}

export function openRibbonCommandWizard(
	plugin: MDRazorPlugin,
	onAdded?: () => void,
	target: CommandSurface | 'ribbon' = 'ribbon',
): void {
	new RibbonCommandWizardModal(plugin.app, plugin, onAdded, target).open();
}

class RibbonCommandWizardModal extends Modal {
	private plugin: MDRazorPlugin;
	private onAdded?: () => void;
	private target: CommandSurface | 'ribbon';
	private step: 'command' | 'name' | 'icon' = 'command';
	private selected?: CommandOption;
	private nameValue = '';
	private iconQuery = '';
	private commandQuery = '';

	constructor(app: App, plugin: MDRazorPlugin, onAdded?: () => void, target: CommandSurface | 'ribbon' = 'ribbon') {
		super(app);
		this.plugin = plugin;
		this.onAdded = onAdded;
		this.target = target;
	}

	onOpen(): void {
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		this.contentEl.empty();
		if (this.step === 'command') this.renderCommandStep();
		else if (this.step === 'name') this.renderNameStep();
		else this.renderIconStep();
	}

	private renderCommandStep(): void {
		const isStatus = this.target === 'statusBar';
		const isContext = this.target === 'contextMenu';
		const title = isStatus
			? tr('选择要添加到状态栏的命令', 'Choose a command to add to the status bar')
			: isContext
				? tr('选择要添加到右键菜单的命令', 'Choose a command to add to the context menu')
				: tr('选择要添加到功能区的命令', 'Choose a command to add to the left ribbon');
		this.contentEl.createEl('h3', { text: title });
		this.contentEl.createEl('p', {
			text: tr(
				'列出 Obsidian 原生命令与所有已启用插件注册的命令。选择后进入下一步。',
				'Lists native Obsidian commands and commands registered by enabled plugins. Select one to continue.',
			),
			cls: 'mod-desc',
		});

		const search = this.contentEl.createDiv({ cls: 'mdrazor-wizard-search' });
		new TextComponent(search)
			.setPlaceholder(tr('搜索命令…', 'Search commands…'))
			.setValue(this.commandQuery)
			.onChange((value) => {
				this.commandQuery = value;
				this.renderCommandList(listEl);
			});

		const listEl = this.contentEl.createDiv({ cls: 'mdrazor-command-picker-list' });
		this.renderCommandList(listEl);
	}

	private renderCommandList(listEl: HTMLElement): void {
		listEl.empty();
		const query = this.commandQuery.trim().toLowerCase();
		const commands = this.plugin.ribbonManager
			.getCommands()
			.filter((c) => !query || c.name.toLowerCase().includes(query) || c.id.toLowerCase().includes(query));

		if (commands.length === 0) {
			listEl.createDiv({ cls: 'mdrazor-command-picker-empty', text: tr('未找到匹配命令', 'No matching commands') });
			return;
		}

		for (const cmd of commands) {
			const row = listEl.createDiv({ cls: 'mdrazor-command-picker-item' });
			const iconEl = row.createSpan({ cls: 'mdrazor-command-picker-icon' });
			setIcon(iconEl, cmd.icon && cmd.icon.length > 0 ? cmd.icon : 'command');
			row.createSpan({ cls: 'mdrazor-command-picker-name', text: cmd.name });
			row.createSpan({ cls: 'mdrazor-command-picker-id', text: cmd.id });
			row.addEventListener('click', () => {
				this.selected = cmd;
				this.step = 'name';
				this.nameValue = cmd.name;
				this.render();
			});
		}
	}

	private renderNameStep(): void {
		const cmd = this.selected;
		if (!cmd) return;

		const isStatus = this.target === 'statusBar';
		const isContext = this.target === 'contextMenu';
		const nameHint = isStatus
			? tr('请输入在状态栏中显示的名称。', 'Enter the name shown in the status bar.')
			: isContext
				? tr('请输入在右键菜单中显示的名称。', 'Enter the name shown in the context menu.')
				: tr('请输入在功能区中显示的名称。', 'Enter the name shown in the left ribbon.');
		this.contentEl.createEl('h3', { text: tr('命名自定义命令', 'Name the custom command') });
		this.contentEl.createEl('p', {
			text: nameHint,
			cls: 'mod-desc',
		});

		const inputWrap = this.contentEl.createDiv({ cls: 'mdrazor-wizard-name-input' });
		const input = new TextComponent(inputWrap)
			.setPlaceholder(cmd.name)
			.setValue(this.nameValue);

		const btnRow = this.contentEl.createDiv({ cls: 'modal-button-container' });
		new ButtonComponent(btnRow)
			.setButtonText(tr('返回', 'Back'))
			.setClass('mod-ghost')
			.onClick(() => {
				this.step = 'command';
				this.render();
			});
		new ButtonComponent(btnRow)
			.setButtonText(tr('下一步', 'Next'))
			.setCta()
			.onClick(() => {
				const name = input.getValue().trim() || cmd.name;
				this.nameValue = name;
				this.step = 'icon';
				this.iconQuery = '';
				this.render();
			});
	}

	private renderIconStep(): void {
		const cmd = this.selected;
		if (!cmd) return;

		this.contentEl.createEl('h3', {
			text: tr('为「%s」选择图标', 'Choose an icon for "%s"').replace('%s', this.nameValue || cmd.name),
		});
		this.contentEl.createEl('p', {
			text: tr('列出 Obsidian 内置的 Lucide 图标，可在输入框中筛选。', 'Shows Obsidian\'s built-in Lucide icons; type to filter.'),
			cls: 'mod-desc',
		});

		const search = this.contentEl.createDiv({ cls: 'mdrazor-wizard-search' });
		new TextComponent(search)
			.setPlaceholder(tr('筛选图标…', 'Filter icons…'))
			.setValue(this.iconQuery)
			.onChange((value) => {
				this.iconQuery = value;
				this.renderIconList(listEl);
			});

		const listEl = this.contentEl.createDiv({ cls: 'mdrazor-icon-picker-list' });
		this.renderIconList(listEl);
	}

	private renderIconList(listEl: HTMLElement): void {
		listEl.empty();
		const query = this.iconQuery.trim().toLowerCase();
		const icons = getLucideIconIds().filter((name) => !query || name.includes(query));

		if (icons.length === 0) {
			listEl.createDiv({ cls: 'mdrazor-command-picker-empty', text: tr('未找到匹配图标', 'No matching icons') });
			return;
		}

		for (const icon of icons) {
			const row = listEl.createDiv({ cls: 'mdrazor-icon-picker-item' });
			const iconEl = row.createSpan({ cls: 'mdrazor-icon-picker-icon' });
			setIcon(iconEl, icon);
			row.createSpan({ cls: 'mdrazor-icon-picker-name', text: icon });
			row.addEventListener('click', () => {
				void this.finish(icon);
			});
		}
	}

	private async finish(icon: string): Promise<void> {
		const cmd = this.selected;
		if (!cmd) return;
		this.close();
		const entry = {
			commandId: cmd.id,
			name: this.nameValue || cmd.name,
			icon,
		};
		if (this.target === 'statusBar') {
			await this.plugin.statusBarCommandManager.addCustom(entry);
		} else if (this.target === 'contextMenu') {
			await this.plugin.contextMenuCommandManager.addCustom(entry);
		} else {
			await this.plugin.ribbonManager.addCustom(entry);
		}
		this.onAdded?.();
	}
}
