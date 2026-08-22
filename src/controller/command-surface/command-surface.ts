/**
 * MDRazor — 状态栏 / 右键菜单共用命令管理
 *
 * 复用左功能区「自定义命令 + 隐藏命令」的交互模式：
 *   - 状态栏：可添加自定义状态栏按钮，可隐藏/排序现状栏条目
 *   - 右键菜单：可添加自定义编辑器右键菜单项，可隐藏/排序自定义菜单项
 */

import { Menu, MenuItem, Notice, setIcon } from 'obsidian';
import { tr } from '../../i18n';
import type MDRazorPlugin from '../main';
import type { CustomRibbonCommand } from '../../model/settings';

export type CommandSurface = 'statusBar' | 'contextMenu';

export interface SurfaceItemInfo {
	key: string;
	name: string;
	icon: string;
	hidden: boolean;
	isCustom: boolean;
	customId?: string;
	commandId?: string;
	section?: string;
	el?: HTMLElement;
}

export interface SurfaceCommandManager {
	refresh(): void;
	getItems(): SurfaceItemInfo[];
	addCustom(entry: Omit<CustomRibbonCommand, 'id'>): Promise<void>;
	removeCustom(id: string): Promise<void>;
	reorderCustom(from: number, to: number): Promise<void>;
	reorderSurfaceItem(draggedKey: string, targetKey: string, after: boolean): Promise<void>;
	setHidden(key: string, hidden: boolean): Promise<void>;
	getCustomCommands(): CustomRibbonCommand[];
	getCommands(): Array<{ id: string; name: string; icon?: string }>;
}

interface CommandsInternal {
	commands?: Record<string, { id: string; name: string; icon?: string }>;
	executeCommandById?: (id: string) => unknown;
}

const SIBLING_FOLD_KEY = 'context:mdrazor-sibling-fold';

function genId(): string {
	return `cmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function registerCommandSurfaceManager(
	plugin: MDRazorPlugin,
	surface: CommandSurface,
): SurfaceCommandManager {
	const customEls = new Map<string, HTMLElement>();
	const knownContextMenuItems: Array<{ key: string; name: string; icon: string; section?: string }> = [];

	const isStatusBar = surface === 'statusBar';
	const customSettingKey = isStatusBar ? 'customStatusBarCommands' : 'customContextMenuCommands';
	const hiddenSettingKey = isStatusBar ? 'hiddenStatusBarCommands' : 'hiddenContextMenuCommands';
	const orderSettingKey = isStatusBar ? 'statusBarCommandOrder' : 'contextMenuCommandOrder';

	const getCustomCommands = (): CustomRibbonCommand[] =>
		plugin.settings[customSettingKey] ?? [];
	const getHiddenMap = (): Record<string, boolean> =>
		plugin.settings[hiddenSettingKey] ?? {};
	const getOrder = (): string[] =>
		plugin.settings[orderSettingKey] ?? [];

	const setCustomCommands = (list: CustomRibbonCommand[]): void => {
		plugin.settings[customSettingKey] = list;
	};
	const setHiddenMap = (map: Record<string, boolean>): void => {
		plugin.settings[hiddenSettingKey] = map;
	};
	const setOrder = (order: string[]): void => {
		plugin.settings[orderSettingKey] = order;
	};

	const customKey = (id: string): string => `custom:${surface}:${id}`;
	const isHidden = (key: string): boolean => Boolean(getHiddenMap()[key]);

	const extractContextMenuItem = (item: unknown): { key: string; name: string; icon: string; section?: string } | null => {
		const menuItem = item as {
			dom?: HTMLElement;
			title?: string;
			icon?: string;
			section?: string;
		};
		if (!menuItem?.dom) return null;
		if (menuItem.dom.hasClass('mdrazor-context-command')) return null;
		const name =
			menuItem.title ||
			menuItem.dom.querySelector('.menu-item-title')?.textContent?.trim() ||
			menuItem.dom.textContent?.trim() ||
			'';
		if (!name) return null;
		const svg = menuItem.dom.querySelector('svg');
		const svgClass = svg?.getAttribute('class') ?? '';
		const lucideMatch = svgClass.match(/lucide-([a-z0-9-]+)/);
		const icon = menuItem.icon || svg?.getAttribute('data-lucide') || lucideMatch?.[1] || 'command';
		const section = menuItem.section || menuItem.dom.getAttribute('data-section') || undefined;
		return { key: `context:${icon}:${name}`, name, icon, section };
	};

	const recordContextMenuItem = (item: unknown): void => {
		const meta = extractContextMenuItem(item);
		if (!meta) return;
		if (!knownContextMenuItems.some((entry) => entry.key === meta.key)) {
			knownContextMenuItems.push(meta);
		}
		if (isHidden(meta.key)) {
			const dom = (item as { dom?: HTMLElement }).dom;
			if (dom) dom.setCssProps({ display: 'none' });
		}
	};


	const getCommands = (): Array<{ id: string; name: string; icon?: string }> => {
		const commands = (plugin.app as unknown as { commands?: CommandsInternal }).commands;
		if (!commands?.commands) return [];
		return Object.values(commands.commands)
			.filter((c): c is { id: string; name: string; icon?: string } => Boolean(c?.id && c?.name))
			.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
	};

	const executeCommand = async (commandId: string): Promise<void> => {
		const commands = (plugin.app as unknown as { commands?: CommandsInternal }).commands;
		if (!commands?.executeCommandById) {
			new Notice(tr('无法执行命令：当前 Obsidian 版本不支持', 'Unable to execute command in this Obsidian version'));
			return;
		}
		try {
			await commands.executeCommandById(commandId);
		} catch (e) {
			console.error('MDRazor: failed to execute command', commandId, e);
			new Notice(tr('执行命令失败', 'Failed to execute command'));
		}
	};

	/* ---------------- 状态栏专用 ---------------- */

	const getStatusBarContainer = (): HTMLElement | null => {
		const statusBar = (plugin.app as unknown as {
			statusBar?: { containerEl?: HTMLElement };
		}).statusBar;
		if (statusBar?.containerEl) return statusBar.containerEl;
		for (const el of customEls.values()) {
			if (el.parentElement) return el.parentElement;
		}
		return plugin.app.workspace.containerEl.querySelector<HTMLElement>('.status-bar');
	};

	const getStatusBarItemEls = (): HTMLElement[] => {
		const container = getStatusBarContainer();
		if (!container) return [];
		return Array.from(container.querySelectorAll('.status-bar-item'));
	};

	const getStatusItemMeta = (el: HTMLElement): { name: string; icon: string } => {
		const name =
			el.getAttribute('aria-label') ||
			el.getAttribute('title') ||
			el.textContent?.trim() ||
			tr('未命名状态栏项', 'Unnamed status bar item');
		const svg = el.querySelector('svg');
		const svgClass = svg?.getAttribute('class') ?? '';
		const lucideMatch = svgClass.match(/lucide-([a-z0-9-]+)/);
		const icon = svg?.getAttribute('data-lucide') || lucideMatch?.[1] || 'circle';
		return { name, icon };
	};

	const getStatusBarElementKey = (el: HTMLElement): string => {
		const customId = el.getAttribute('data-mdrazor-status-id');
		if (customId) return customKey(customId);
		const meta = getStatusItemMeta(el);
		return `status:${meta.icon}:${meta.name}`;
	};

	const removeAllCustomStatusItems = (): void => {
		for (const el of customEls.values()) el.remove();
		customEls.clear();
	};

	const applyStatusBarOrder = (): void => {
		const items = getStatusBarItemEls();
		if (items.length === 0) return;
		const byKey = new Map<string, HTMLElement>();
		for (const el of items) {
			const key = getStatusBarElementKey(el);
			if (!byKey.has(key)) byKey.set(key, el);
		}
		const order = getOrder();
		const reordered: HTMLElement[] = [];
		const used = new Set<HTMLElement>();
		for (const key of order) {
			const el = byKey.get(key);
			if (el && !used.has(el)) {
				reordered.push(el);
				used.add(el);
			}
		}
		for (const el of items) if (!used.has(el)) reordered.push(el);
		const container = getStatusBarContainer();
		if (!container) return;
		for (const el of reordered) container.appendChild(el);
	};

	const applyStatusBarVisibility = (): void => {
		for (const el of getStatusBarItemEls()) {
			const key = getStatusBarElementKey(el);
			el.style.display = isHidden(key) ? 'none' : '';
		}
	};

	const refreshStatusBar = (): void => {
		removeAllCustomStatusItems();
		for (const cmd of getCustomCommands()) {
			if (isHidden(customKey(cmd.id))) continue;
			const el = plugin.addStatusBarItem();
			el.addClass('status-bar-item');
			el.addClass('mdrazor-statusbar-command');
			el.setAttribute('data-mdrazor-status-id', cmd.id);
			const iconSpan = el.createSpan({ cls: 'mdrazor-statusbar-command-icon' });
			setIcon(iconSpan, cmd.icon || 'command');
			el.createSpan({ cls: 'mdrazor-statusbar-command-name', text: cmd.name });
			el.addEventListener('click', () => void executeCommand(cmd.commandId));
			customEls.set(cmd.id, el);
		}
		applyStatusBarOrder();
		applyStatusBarVisibility();
	};

	const getStatusBarItems = (): SurfaceItemInfo[] => {
		const result: SurfaceItemInfo[] = [];
		const customById = new Map(getCustomCommands().map((c) => [c.id, c]));
		const seen = new Set<string>();
		for (const el of getStatusBarItemEls()) {
			const customId = el.getAttribute('data-mdrazor-status-id');
			if (customId && customById.has(customId)) {
				const cmd = customById.get(customId)!;
				const key = customKey(cmd.id);
				seen.add(cmd.id);
				result.push({ key, name: cmd.name, icon: cmd.icon, hidden: isHidden(key), isCustom: true, customId: cmd.id, commandId: cmd.commandId, el });
				continue;
			}
			const meta = getStatusItemMeta(el);
			const key = getStatusBarElementKey(el);
			result.push({ key, name: meta.name, icon: meta.icon, hidden: isHidden(key), isCustom: false, el });
		}
		// 隐藏的自定义状态栏按钮不在 DOM 中
		for (const cmd of getCustomCommands()) {
			if (seen.has(cmd.id)) continue;
			const key = customKey(cmd.id);
			result.push({ key, name: cmd.name, icon: cmd.icon, hidden: isHidden(key), isCustom: true, customId: cmd.id, commandId: cmd.commandId });
		}
		const order = getOrder();
		if (order.length > 0) {
			const byKey = new Map<string, SurfaceItemInfo>();
			for (const item of result) byKey.set(item.key, item);
			const ordered: SurfaceItemInfo[] = [];
			const used = new Set<SurfaceItemInfo>();
			for (const key of order) {
				const item = byKey.get(key);
				if (item && !used.has(item)) {
					ordered.push(item);
					used.add(item);
				}
			}
			for (const item of result) if (!used.has(item)) ordered.push(item);
			return ordered;
		}
		return result;
	};

	/* ---------------- 右键菜单专用 ---------------- */

	const getContextMenuItems = (): SurfaceItemInfo[] => {
		const list: SurfaceItemInfo[] = [];
		for (const cmd of getCustomCommands()) {
			const key = customKey(cmd.id);
			list.push({ key, name: cmd.name, icon: cmd.icon, hidden: isHidden(key), isCustom: true, customId: cmd.id, commandId: cmd.commandId });
		}
		const siblingFoldTitle = tr('展开/折叠同级列表或标题', 'Expand/Collapse Sibling Lists or Headings');
		for (const known of knownContextMenuItems) {
			// 内置「展开/折叠同级列表或标题」已由显式条目展示，避免重复统计
			if (known.name === siblingFoldTitle) continue;
			list.push({
				key: known.key,
				name: known.name,
				icon: known.icon,
				hidden: isHidden(known.key),
				isCustom: false,
				section: known.section,
			});
		}
		list.push({
			key: SIBLING_FOLD_KEY,
			name: tr('展开/折叠同级列表或标题', 'Expand/Collapse Sibling Lists or Headings'),
			icon: 'list-collapse',
			hidden: !plugin.settings.contextMenuSiblingFold || isHidden(SIBLING_FOLD_KEY),
			isCustom: false,
		});
		const order = getOrder();
		if (order.length > 0) {
			const byKey = new Map<string, SurfaceItemInfo>();
			for (const item of list) byKey.set(item.key, item);
			const ordered: SurfaceItemInfo[] = [];
			const used = new Set<SurfaceItemInfo>();
			for (const key of order) {
				const item = byKey.get(key);
				if (item && !used.has(item)) {
					ordered.push(item);
					used.add(item);
				}
			}
			for (const item of list) if (!used.has(item)) ordered.push(item);
			return ordered;
		}
		return list;
	};

	const refreshContextMenu = (): void => {
		// 右键菜单项在每次弹出时实时读取，无需常驻 DOM
	};

	/* ---------------- 通用逻辑 ---------------- */

	const syncOrderWithCustomArray = (): void => {
		const currentOrder = [...getOrder()];
		const base = currentOrder.length > 0 ? currentOrder : getSurfaceItems().map((i) => i.key);
		const customKeys = base.filter((key) => key.startsWith(`custom:${surface}:`));
		const desired = getCustomCommands().map((c) => customKey(c.id));
		const customSet = new Set(customKeys);
		const result: string[] = [];
		let idx = 0;
		for (const key of base) {
			if (customSet.has(key)) {
				const next = desired[idx];
				if (next) {
					result.push(next);
					idx++;
				}
			} else {
				result.push(key);
			}
		}
		for (const key of desired) if (!result.includes(key)) result.push(key);
		setOrder(result);
	};

	const getSurfaceItems = (): SurfaceItemInfo[] =>
		isStatusBar ? getStatusBarItems() : getContextMenuItems();

	const refresh = (): void => {
		if (isStatusBar) refreshStatusBar();
		else refreshContextMenu();
	};

	const addCustom = async (entry: Omit<CustomRibbonCommand, 'id'>): Promise<void> => {
		const cmd: CustomRibbonCommand = { ...entry, id: genId() };
		setCustomCommands([...getCustomCommands(), cmd]);
		syncOrderWithCustomArray();
		await plugin.saveSettings();
		refresh();
	};

	const removeCustom = async (id: string): Promise<void> => {
		setCustomCommands(getCustomCommands().filter((c) => c.id !== id));
		const map = { ...getHiddenMap() };
		delete map[customKey(id)];
		setHiddenMap(map);
		syncOrderWithCustomArray();
		await plugin.saveSettings();
		refresh();
	};

	const reorderCustom = async (from: number, to: number): Promise<void> => {
		const list = [...getCustomCommands()];
		const [moved] = list.splice(from, 1);
		if (!moved) return;
		list.splice(to, 0, moved);
		setCustomCommands(list);
		syncOrderWithCustomArray();
		await plugin.saveSettings();
		refresh();
	};

	const reorderSurfaceItem = async (
		draggedKey: string,
		targetKey: string,
		after: boolean,
	): Promise<void> => {
		if (draggedKey === targetKey) return;
		const list = getSurfaceItems();
		const from = list.findIndex((item) => item.key === draggedKey);
		const to = list.findIndex((item) => item.key === targetKey);
		if (from < 0 || to < 0) return;
		const next = [...list];
		const [moved] = next.splice(from, 1);
		if (!moved) return;
		let insertIndex = to;
		if (after) insertIndex = to + 1;
		if (from < insertIndex) insertIndex -= 1;
		next.splice(insertIndex, 0, moved);
		setOrder(next.map((item) => item.key));

		const customOrder = next
			.filter((item) => item.isCustom && item.customId)
			.map((item) => item.customId!);
		const byId = new Map(getCustomCommands().map((c) => [c.id, c]));
		const sorted: CustomRibbonCommand[] = [];
		for (const id of customOrder) {
			const cmd = byId.get(id);
			if (cmd) sorted.push(cmd);
		}
		for (const cmd of getCustomCommands()) {
			if (!customOrder.includes(cmd.id)) sorted.push(cmd);
		}
		setCustomCommands(sorted);

		// 内置右键菜单项隐藏状态与现有设置联动
		if (isStatusBar === false && (draggedKey === SIBLING_FOLD_KEY || targetKey === SIBLING_FOLD_KEY)) {
			// 顺序调整不改变隐藏状态
		}
		await plugin.saveSettings();
		refresh();
	};

	const setHidden = async (key: string, hidden: boolean): Promise<void> => {
		const map = { ...getHiddenMap() };
		if (hidden) map[key] = true;
		else delete map[key];
		setHiddenMap(map);

		// 内置「展开/折叠同级列表或标题」与现有右键菜单开关联动
		if (key === SIBLING_FOLD_KEY) {
			plugin.settings.contextMenuSiblingFold = !hidden;
		}
		await plugin.saveSettings();
		refresh();
	};

	/* ---------------- 注册 ---------------- */

	if (isStatusBar) {
		let observer: MutationObserver | null = null;
		let cleanupRegistered = false;
		const startObserver = (): void => {
			const container = getStatusBarContainer();
			if (!container) return;
			if (observer) observer.disconnect();
			observer = new MutationObserver(() => {
				window.setTimeout(() => applyStatusBarVisibility(), 0);
			});
			observer.observe(container, { childList: true, subtree: true });
			if (!cleanupRegistered) {
				cleanupRegistered = true;
				plugin.register(() => {
					observer?.disconnect();
					observer = null;
				});
			}
		};
		plugin.app.workspace.onLayoutReady(() => {
			refreshStatusBar();
			startObserver();
		});
		const fallbackTimer = window.setTimeout(() => {
			refreshStatusBar();
			startObserver();
		}, 1000);
		plugin.register(() => window.clearTimeout(fallbackTimer));
	} else {
		// 全局包装 Menu.addItem，记录 Obsidian 原生/插件注册的右键菜单项，
		// 并在弹出时对已隐藏的菜单项进行隐藏。
		// eslint-disable-next-line @typescript-eslint/unbound-method -- 需要保存 Menu 原型原始 addItem 方法以便包装后恢复
		const originalAddItem = Menu.prototype.addItem;
		Menu.prototype.addItem = function (this: Menu, cb: (item: MenuItem) => unknown) {
			return originalAddItem.call(this, (item: MenuItem) => {
				const ret = cb(item);
				recordContextMenuItem(item);
				return ret;
			});
		} as typeof Menu.prototype.addItem;
		plugin.register(() => {
			Menu.prototype.addItem = originalAddItem;
		});

		plugin.registerEvent(
			plugin.app.workspace.on('editor-menu', (menu) => {
				for (const cmd of getCustomCommands()) {
					if (isHidden(customKey(cmd.id))) continue;
					menu.addItem((item) => {
						const dom = (item as { dom?: HTMLElement }).dom;
						dom?.addClass('mdrazor-context-command');
						item
							.setTitle(cmd.name)
							.setIcon(cmd.icon || 'command')
							.onClick(() => void executeCommand(cmd.commandId));
					});
				}
			}),
		);
	}

	refresh();

	return {
		refresh,
		getItems: getSurfaceItems,
		addCustom,
		removeCustom,
		reorderCustom,
		reorderSurfaceItem,
		setHidden,
		getCustomCommands,
		getCommands,
	};
}
