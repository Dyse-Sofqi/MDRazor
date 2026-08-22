/**
 * MDRazor — 左功能区命令管理
 *
 * 负责：
 *   - 将用户在设置中添加的自定义命令渲染为左侧功能区图标
 *   - 同步设置页拖拽排序与功能区拖拽排序
 *   - 管理功能区命令（自定义 / 插件注册 / Obsidian 原生）的显示与隐藏
 */

import { Notice } from 'obsidian';
import { tr } from '../../i18n';
import type MDRazorPlugin from '../main';
import type { CustomRibbonCommand } from '../../model/settings';

/** 标记自定义命令 ribbon 元素的属性名 */
const CUSTOM_ATTR = 'data-mdrazor-custom-id';

export interface RibbonItemInfo {
	/** 用于隐藏状态持久化的稳定 key */
	key: string;
	name: string;
	icon: string;
	hidden: boolean;
	isCustom: boolean;
	customId?: string;
	commandId?: string;
	el?: HTMLElement;
}

export interface RibbonManager {
	/** 完全重建自定义 ribbon 图标并按当前设置应用隐藏/顺序 */
	refresh(): void;
	/** 按功能区当前顺序返回所有指令条目（隐藏项也包含） */
	getRibbonItems(): RibbonItemInfo[];
	addCustom(entry: Omit<CustomRibbonCommand, 'id'>): Promise<void>;
	removeCustom(id: string): Promise<void>;
	reorderCustom(from: number, to: number): Promise<void>;
	/** 在「隐藏命令」列表中拖拽调整任意功能区命令的顺序（含自定义/插件/原生） */
	reorderRibbonItem(draggedKey: string, targetKey: string, after: boolean): Promise<void>;
	setHidden(key: string, hidden: boolean): Promise<void>;
	getCustomCommands(): CustomRibbonCommand[];
	/** 获取当前 Obsidian 已注册的全部命令（含原生与插件命令） */
	getCommands(): Array<{ id: string; name: string; icon?: string }>;
}

/** 内部命令管理器结构（Obsidian 未公开，但社区插件广泛使用） */
interface CommandsInternal {
	commands?: Record<string, { id: string; name: string; icon?: string }>;
	executeCommandById?: (id: string) => unknown;
}

/** Obsidian workspace.leftRibbon.items 中的单个条目结构 */
interface LeftRibbonItemInternal {
	icon: string;
	title: string;
	buttonEl: HTMLElement;
}

interface LeftRibbonInternal {
	items: LeftRibbonItemInternal[];
}

function genId(): string {
	return `cmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function registerRibbonManager(plugin: MDRazorPlugin): RibbonManager {
	const customEls = new Map<string, HTMLElement>();

	const getLeftRibbonItems = (): LeftRibbonItemInternal[] => {
		const leftRibbon = (plugin.app.workspace as unknown as {
			leftRibbon?: LeftRibbonInternal;
		}).leftRibbon;
		return leftRibbon?.items ?? [];
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
			console.error('MDRazor: failed to execute ribbon command', commandId, e);
			new Notice(tr('执行命令失败', 'Failed to execute command'));
		}
	};

	const isHidden = (key: string): boolean =>
		Boolean(plugin.settings.hiddenRibbonCommands?.[key]);

	const customKey = (id: string): string => `custom:${id}`;

	const getMetaFromEl = (el: HTMLElement | undefined): { name: string; icon: string } => {
		const name =
			el?.getAttribute('aria-label') ||
			el?.getAttribute('title') ||
			el?.getAttribute('data-tooltip') ||
			el?.textContent?.trim() ||
			tr('未命名命令', 'Unnamed command');
		const svg = el?.querySelector('svg');
		const svgClass = svg?.getAttribute('class') ?? '';
		const lucideMatch = svgClass.match(/lucide-([a-z0-9-]+)/);
		const icon =
			el?.getAttribute('data-icon') ||
			svg?.getAttribute('data-lucide') ||
			lucideMatch?.[1] ||
			'command';
		return { name, icon };
	};

	const nonCustomKey = (name: string, icon: string): string =>
		`ribbon:${icon}:${name}`;

	const getItemKey = (item: LeftRibbonItemInternal): string => {
		const customId = item.buttonEl?.getAttribute(CUSTOM_ATTR) ?? null;
		if (customId && plugin.settings.customRibbonCommands.some((c) => c.id === customId)) {
			return customKey(customId);
		}
		const meta = getMetaFromEl(item.buttonEl);
		const name = item.title || meta.name;
		const icon = item.icon || meta.icon || 'command';
		return nonCustomKey(name, icon);
	};

	/** 移除所有由本插件创建的自定义 ribbon 条目（DOM + leftRibbon.items 数组） */
	const removeAllCustomRibbonItems = (): void => {
		const items = getLeftRibbonItems();
		for (let i = items.length - 1; i >= 0; i--) {
			const item = items[i]!;
			const customId = item.buttonEl?.getAttribute(CUSTOM_ATTR) ?? null;
			if (!customId) continue;
			item.buttonEl?.remove();
			items.splice(i, 1);
		}
	};

	const applyNonCustomVisibility = (): void => {
		for (const item of getLeftRibbonItems()) {
			if (!item.buttonEl) continue;
			if (item.buttonEl.getAttribute(CUSTOM_ATTR)) continue;
			const meta = getMetaFromEl(item.buttonEl);
			const name = item.title || meta.name;
			const icon = item.icon || meta.icon || 'command';
			const key = nonCustomKey(name, icon);
			item.buttonEl.style.display = isHidden(key) ? 'none' : '';
		}
	};

	/** 按 ribbonCommandOrder 重排全部功能区条目（数组 + DOM） */
	const applyRibbonOrder = (): void => {
		const items = getLeftRibbonItems();
		if (items.length === 0) return;

		const itemsByKey = new Map<string, LeftRibbonItemInternal>();
		for (const item of items) {
			const key = getItemKey(item);
			if (!itemsByKey.has(key)) itemsByKey.set(key, item);
		}

		const orderedKeys = plugin.settings.ribbonCommandOrder ?? [];
		const reordered: LeftRibbonItemInternal[] = [];
		const used = new Set<LeftRibbonItemInternal>();
		for (const key of orderedKeys) {
			const item = itemsByKey.get(key);
			if (item && !used.has(item)) {
				reordered.push(item);
				used.add(item);
			}
		}
		// 未记录的新条目（如新插件动态添加）保持在末尾
		for (const item of items) {
			if (!used.has(item)) reordered.push(item);
		}

		items.length = 0;
		items.push(...reordered);

		const container = reordered.find((item) => item.buttonEl?.parentElement)?.buttonEl?.parentElement ?? null;
		if (container) {
			for (const item of reordered) {
				if (item.buttonEl) container.appendChild(item.buttonEl);
			}
		}
	};

	/**
	 * 自定义命令数组变化后，把 ribbonCommandOrder 中的 custom:* 键同步为新顺序，
	 * 非自定义命令的相对位置保持不变。
	 */
	const syncOrderWithCustomArray = (): void => {
		const currentOrder = [...(plugin.settings.ribbonCommandOrder ?? [])];
		const base = currentOrder.length > 0 ? currentOrder : getRibbonItems().map((i) => i.key);
		const customKeysInBase = base.filter((key) => key.startsWith('custom:'));
		const desiredCustomKeys = plugin.settings.customRibbonCommands.map((c) => customKey(c.id));
		const customSet = new Set(customKeysInBase);

		const result: string[] = [];
		let desiredIndex = 0;
		for (const key of base) {
			if (customSet.has(key)) {
				const next = desiredCustomKeys[desiredIndex];
				if (next) {
					result.push(next);
					desiredIndex++;
				}
			} else {
				result.push(key);
			}
		}
		for (const key of desiredCustomKeys) {
			if (!result.includes(key)) result.push(key);
		}
		plugin.settings.ribbonCommandOrder = result;
	};

	const makeRibbonDraggable = (el: HTMLElement, customId: string): void => {
		el.setAttribute('draggable', 'true');
		el.addEventListener('dragstart', (e) => {
			e.dataTransfer?.setData('text/plain', customId);
			if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
		});
		el.addEventListener('dragover', (e) => {
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		});
		el.addEventListener('drop', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const draggedId = e.dataTransfer?.getData('text/plain') ?? '';
			if (!draggedId || draggedId === customId) return;
			void reorderCustomByRibbonDrop(draggedId, customId, e.clientY);
		});
	};

	const reorderCustomByRibbonDrop = async (
		draggedId: string,
		targetId: string,
		clientY: number,
	): Promise<void> => {
		const list = [...plugin.settings.customRibbonCommands];
		const from = list.findIndex((c) => c.id === draggedId);
		const to = list.findIndex((c) => c.id === targetId);
		if (from < 0 || to < 0) return;
		const targetEl = customEls.get(targetId);
		let insertIndex = to;
		if (targetEl) {
			const rect = targetEl.getBoundingClientRect();
			if (clientY > rect.top + rect.height / 2) insertIndex = to + 1;
		}
		const [moved] = list.splice(from, 1);
		if (!moved) return;
		const adjusted = from < insertIndex ? insertIndex - 1 : insertIndex;
		list.splice(adjusted, 0, moved);
		plugin.settings.customRibbonCommands = list;
		syncOrderWithCustomArray();
		await plugin.saveSettings();
		refresh();
	};

	const refresh = (): void => {
		removeAllCustomRibbonItems();
		customEls.clear();

		for (const cmd of plugin.settings.customRibbonCommands) {
			const key = customKey(cmd.id);
			if (isHidden(key)) continue;
			const el = plugin.addRibbonIcon(cmd.icon, cmd.name, () => {
				void executeCommand(cmd.commandId);
			});
			el.setAttribute(CUSTOM_ATTR, cmd.id);
			el.setAttribute('aria-label', cmd.name);
			el.setAttribute('title', cmd.name);
			customEls.set(cmd.id, el);
			makeRibbonDraggable(el, cmd.id);
		}

		applyRibbonOrder();
		applyNonCustomVisibility();
	};

	const getRibbonItems = (): RibbonItemInfo[] => {
		const result: RibbonItemInfo[] = [];
		const customById = new Map(plugin.settings.customRibbonCommands.map((c) => [c.id, c]));
		const seenCustom = new Set<string>();

		for (const item of getLeftRibbonItems()) {
			const customId = item.buttonEl?.getAttribute(CUSTOM_ATTR) ?? null;
			if (customId && customById.has(customId)) {
				const cmd = customById.get(customId)!;
				const key = customKey(cmd.id);
				seenCustom.add(cmd.id);
				result.push({
					key,
					name: cmd.name,
					icon: cmd.icon,
					hidden: isHidden(key),
					isCustom: true,
					customId: cmd.id,
					commandId: cmd.commandId,
					el: item.buttonEl,
				});
				continue;
			}

			const meta = getMetaFromEl(item.buttonEl);
			const name = item.title || meta.name;
			const icon = item.icon || meta.icon || 'command';
			const key = nonCustomKey(name, icon);
			result.push({
				key,
				name,
				icon,
				hidden: isHidden(key),
				isCustom: false,
				el: item.buttonEl,
			});
		}

		// 隐藏的自定义命令不在 leftRibbon.items / DOM 中，仍需展示在“隐藏命令”列表
		const hiddenInfos: RibbonItemInfo[] = [];
		for (const cmd of plugin.settings.customRibbonCommands) {
			if (seenCustom.has(cmd.id)) continue;
			const key = customKey(cmd.id);
			hiddenInfos.push({
				key,
				name: cmd.name,
				icon: cmd.icon,
				hidden: isHidden(key),
				isCustom: true,
				customId: cmd.id,
				commandId: cmd.commandId,
			});
		}

		// 若有保存的全量顺序，则按该顺序插入隐藏自定义命令，保持列表与功能区顺序一致
		const savedOrder = plugin.settings.ribbonCommandOrder;
		if (savedOrder && savedOrder.length > 0) {
			const byKey = new Map<string, RibbonItemInfo>();
			for (const info of result) byKey.set(info.key, info);
			for (const info of hiddenInfos) byKey.set(info.key, info);

			const ordered: RibbonItemInfo[] = [];
			const used = new Set<RibbonItemInfo>();
			for (const key of savedOrder) {
				const info = byKey.get(key);
				if (info && !used.has(info)) {
					ordered.push(info);
					used.add(info);
				}
			}
			for (const info of result) if (!used.has(info)) ordered.push(info);
			for (const info of hiddenInfos) if (!used.has(info)) ordered.push(info);
			return ordered;
		}

		for (const info of hiddenInfos) result.push(info);
		return result;
	};

	const addCustom = async (entry: Omit<CustomRibbonCommand, 'id'>): Promise<void> => {
		const cmd: CustomRibbonCommand = { ...entry, id: genId() };
		plugin.settings.customRibbonCommands = [...plugin.settings.customRibbonCommands, cmd];
		syncOrderWithCustomArray();
		await plugin.saveSettings();
		refresh();
	};

	const removeCustom = async (id: string): Promise<void> => {
		plugin.settings.customRibbonCommands = plugin.settings.customRibbonCommands.filter((c) => c.id !== id);
		delete plugin.settings.hiddenRibbonCommands[customKey(id)];
		syncOrderWithCustomArray();
		await plugin.saveSettings();
		refresh();
	};

	const reorderCustom = async (from: number, to: number): Promise<void> => {
		const list = [...plugin.settings.customRibbonCommands];
		const [moved] = list.splice(from, 1);
		if (!moved) return;
		list.splice(to, 0, moved);
		plugin.settings.customRibbonCommands = list;
		syncOrderWithCustomArray();
		await plugin.saveSettings();
		refresh();
	};

	const setHidden = async (key: string, hidden: boolean): Promise<void> => {
		if (hidden) {
			plugin.settings.hiddenRibbonCommands = {
				...plugin.settings.hiddenRibbonCommands,
				[key]: true,
			};
		} else {
			const next = { ...plugin.settings.hiddenRibbonCommands };
			delete next[key];
			plugin.settings.hiddenRibbonCommands = next;
		}
		await plugin.saveSettings();
		refresh();
	};

	const reorderRibbonItem = async (
		draggedKey: string,
		targetKey: string,
		after: boolean,
	): Promise<void> => {
		if (draggedKey === targetKey) return;
		const list = getRibbonItems();
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

		plugin.settings.ribbonCommandOrder = next.map((item) => item.key);

		// 同步自定义命令数组顺序，保证“自定义命令”列表与隐藏命令列表一致
		const customOrder = next
			.filter((item) => item.isCustom && item.customId)
			.map((item) => item.customId!);
		const customById = new Map(plugin.settings.customRibbonCommands.map((c) => [c.id, c]));
		const customSorted: CustomRibbonCommand[] = [];
		for (const id of customOrder) {
			const cmd = customById.get(id);
			if (cmd) customSorted.push(cmd);
		}
		for (const cmd of plugin.settings.customRibbonCommands) {
			if (!customOrder.includes(cmd.id)) customSorted.push(cmd);
		}
		plugin.settings.customRibbonCommands = customSorted;

		await plugin.saveSettings();
		refresh();
	};

	/** 获取左侧功能区 DOM 容器（优先从真实 ribbon item 的父节点推断） */
	const getRibbonDomContainer = (): HTMLElement | null => {
		for (const item of getLeftRibbonItems()) {
			if (item.buttonEl?.parentElement) return item.buttonEl.parentElement;
		}
		for (const el of customEls.values()) {
			if (el.parentElement) return el.parentElement;
		}
		return plugin.app.workspace.containerEl.querySelector<HTMLElement>(
			'.workspace-ribbon.side-dock-ribbon.mod-left, .workspace-ribbon.mod-left, .workspace-ribbon, .workspace-ribbon-left',
		);
	};

	/** 监听左侧功能区 DOM 变化，重新应用隐藏状态（覆盖重启后补载图标与手动拖拽重排） */
	let ribbonObserver: MutationObserver | null = null;
	let ribbonObserverCleanupRegistered = false;
	const startRibbonObserver = (): void => {
		const container = getRibbonDomContainer();
		if (!container) return;
		if (ribbonObserver) {
			ribbonObserver.disconnect();
			ribbonObserver = null;
		}
		ribbonObserver = new MutationObserver(() => {
			// 延迟到 DOM 变更后的下一轮，确保 leftRibbon.items 已完成同步
			window.setTimeout(() => applyNonCustomVisibility(), 0);
		});
		ribbonObserver.observe(container, { childList: true, subtree: true });
		if (!ribbonObserverCleanupRegistered) {
			ribbonObserverCleanupRegistered = true;
			plugin.register(() => {
				ribbonObserver?.disconnect();
				ribbonObserver = null;
			});
		}
	};

	// 工作区布局变化（其他插件动态增删 ribbon 图标等）时重新应用顺序与隐藏状态
	plugin.registerEvent(
		plugin.app.workspace.on('layout-change', () => {
			applyRibbonOrder();
			applyNonCustomVisibility();
			startRibbonObserver();
		}),
	);

	// 等 Obsidian 初始功能区图标全部就绪后再同步一次，避免启动阶段遗漏
	plugin.app.workspace.onLayoutReady(() => {
		refresh();
		startRibbonObserver();
	});

	// 启动 1 秒后再兜底同步一次，覆盖个别插件延迟注册功能区图标的情况
	const fallbackTimer = window.setTimeout(() => {
		refresh();
		startRibbonObserver();
	}, 1000);
	plugin.register(() => window.clearTimeout(fallbackTimer));

	return {
		refresh,
		getRibbonItems,
		addCustom,
		removeCustom,
		reorderCustom,
		reorderRibbonItem,
		setHidden,
		getCustomCommands: () => plugin.settings.customRibbonCommands,
		getCommands,
	};
}
