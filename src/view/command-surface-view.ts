/**
 * MDRazor — 状态栏 / 右键菜单共用的「自定义命令 / 隐藏命令」设置界面
 */

import { ButtonComponent, setIcon } from 'obsidian';
import { tr } from '../i18n';
import type MDRazorPlugin from '../controller/main';
import type { CommandSurface, SurfaceCommandManager } from '../controller/command-surface/command-surface';
import { openRibbonCommandWizard } from './ribbon-command-wizard';

export function renderCommandSurfaceSettings(
	container: HTMLElement,
	plugin: MDRazorPlugin,
	surface: CommandSurface,
): void {
	container.empty();

	const manager = getManager(plugin, surface);

	const customSection = createCollapsibleSection(
		container,
		tr('自定义命令', 'Custom Commands'),
		true,
	);
	new ButtonComponent(customSection.header)
		.setButtonText(tr('添加命令', 'Add Command'))
		.setTooltip(tr('添加一个命令', 'Add a command'))
		.onClick(() => {
			openRibbonCommandWizard(plugin, () => {
				renderCommandSurfaceSettings(container, plugin, surface);
			}, surface);
		}).buttonEl.addClass('mdrazor-collapsible-action');

	renderCustomList(customSection.body, manager, () => {
		renderCommandSurfaceSettings(container, plugin, surface);
	});

	const hiddenSection = createCollapsibleSection(
		container,
		tr('隐藏命令', 'Hidden Commands'),
		true,
	);
	renderHiddenList(hiddenSection.body, manager, () => {
		renderCommandSurfaceSettings(container, plugin, surface);
	});
}

function getManager(plugin: MDRazorPlugin, surface: CommandSurface): SurfaceCommandManager {
	return surface === 'statusBar' ? plugin.statusBarCommandManager : plugin.contextMenuCommandManager;
}

function createCollapsibleSection(
	parent: HTMLElement,
	title: string,
	open: boolean,
): { header: HTMLElement; body: HTMLElement } {
	const section = parent.createDiv({ cls: 'mdrazor-collapsible-section' });
	const header = section.createDiv({ cls: 'mdrazor-collapsible-header' });
	const titleWrap = header.createDiv({ cls: 'mdrazor-collapsible-title' });
	const chevron = titleWrap.createSpan({ cls: 'mdrazor-collapsible-chevron' });
	setIcon(chevron, open ? 'chevron-down' : 'chevron-right');
	titleWrap.createSpan({ cls: 'mdrazor-collapsible-heading', text: title });
	const body = section.createDiv({ cls: 'mdrazor-collapsible-body' });
	body.toggle(open);

	header.addEventListener('click', (e) => {
		if ((e.target as HTMLElement).closest('button')) return;
		const isOpen = body.isShown();
		body.toggle(!isOpen);
		setIcon(chevron, isOpen ? 'chevron-right' : 'chevron-down');
	});

	return { header, body };
}

function renderCustomList(
	body: HTMLElement,
	manager: SurfaceCommandManager,
	rerender: () => void,
): void {
	const listEl = body.createDiv({ cls: 'mdrazor-command-list' });
	const commands = manager.getCustomCommands();

	if (commands.length === 0) {
		listEl.createDiv({
			cls: 'mdrazor-command-empty',
			text: tr('暂无自定义命令，点击右上角「添加命令」开始。', 'No custom commands yet. Click "Add Command" to add one.'),
		});
		return;
	}

	let dragId = '';
	for (const cmd of commands) {
		const row = listEl.createDiv({ cls: 'mdrazor-command-item' });
		row.setAttribute('draggable', 'true');
		const iconEl = row.createSpan({ cls: 'mdrazor-command-item-icon' });
		setIcon(iconEl, cmd.icon || 'command');
		const nameEl = row.createSpan({ cls: 'mdrazor-command-item-name', text: cmd.name });
		nameEl.title = cmd.commandId;
		new ButtonComponent(row)
			.setIcon('trash-2')
			.setTooltip(tr('删除该自定义命令', 'Delete this custom command'))
			.onClick(async () => {
				await manager.removeCustom(cmd.id);
				rerender();
			}).buttonEl.addClass('mdrazor-command-item-delete');

		row.addEventListener('dragstart', (e) => {
			dragId = cmd.id;
			e.dataTransfer?.setData('text/plain', cmd.id);
			if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
			row.addClass('is-dragging');
		});
		row.addEventListener('dragend', () => {
			row.removeClass('is-dragging');
			dragId = '';
		});
		row.addEventListener('dragover', (e) => {
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		});
		row.addEventListener('drop', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const draggedId = dragId || e.dataTransfer?.getData('text/plain') || '';
			if (!draggedId || draggedId === cmd.id) return;
			const list = manager.getCustomCommands();
			const from = list.findIndex((c) => c.id === draggedId);
			const to = list.findIndex((c) => c.id === cmd.id);
			if (from < 0 || to < 0) return;
			const rect = row.getBoundingClientRect();
			const insertAfter = e.clientY > rect.top + rect.height / 2;
			let target = to;
			if (insertAfter) target = to + 1;
			if (from < target) target -= 1;
			void manager.reorderCustom(from, target).then(rerender);
		});
	}
}

function renderHiddenList(
	body: HTMLElement,
	manager: SurfaceCommandManager,
	rerender: () => void,
): void {
	const items = manager.getItems();

	if (items.length === 0) {
		body.createDiv({
			cls: 'mdrazor-command-empty',
			text: tr('当前没有可管理的命令。', 'There are no commands to manage right now.'),
		});
		return;
	}

	let dragKey = '';

	const renderRow = (listEl: HTMLElement, item: { key: string; name: string; icon: string; hidden: boolean }): void => {
		const row = listEl.createDiv({ cls: 'mdrazor-command-item' });
		row.setAttribute('draggable', 'true');
		const iconEl = row.createSpan({ cls: 'mdrazor-command-item-icon' });
		setIcon(iconEl, item.icon || 'command');
		const nameEl = row.createSpan({ cls: 'mdrazor-command-item-name', text: item.name });
		nameEl.title = item.key;
		new ButtonComponent(row)
			.setIcon(item.hidden ? 'eye-off' : 'eye')
			.setTooltip(item.hidden ? tr('显示', 'Show') : tr('隐藏', 'Hide'))
			.onClick(async () => {
				await manager.setHidden(item.key, !item.hidden);
				rerender();
			}).buttonEl.addClass('mdrazor-command-item-visibility');

		row.addEventListener('dragstart', (e) => {
			dragKey = item.key;
			e.dataTransfer?.setData('text/plain', item.key);
			if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
			row.addClass('is-dragging');
		});
		row.addEventListener('dragend', () => {
			row.removeClass('is-dragging');
			dragKey = '';
		});
		row.addEventListener('dragover', (e) => {
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		});
		row.addEventListener('drop', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const dragged = dragKey || e.dataTransfer?.getData('text/plain') || '';
			if (!dragged || dragged === item.key) return;
			const rect = row.getBoundingClientRect();
			const after = e.clientY > rect.top + rect.height / 2;
			void manager.reorderSurfaceItem(dragged, item.key, after).then(rerender);
		});
	};

	// 只有存在 section 层级信息时才分组；否则维持平铺列表
	if (!items.some((item) => item.section)) {
		const listEl = body.createDiv({ cls: 'mdrazor-command-list' });
		for (const item of items) renderRow(listEl, item);
		return;
	}

	const groups = new Map<string, typeof items>();
	for (const item of items) {
		const section = item.section ?? '';
		if (!groups.has(section)) groups.set(section, []);
		groups.get(section)!.push(item);
	}

	for (const [section, groupItems] of groups) {
		const groupEl = body.createDiv({ cls: 'mdrazor-command-group' });
		const header = groupEl.createDiv({ cls: 'mdrazor-command-group-header' });
		const chevron = header.createSpan({ cls: 'mdrazor-collapsible-chevron' });
		setIcon(chevron, 'chevron-down');
		header.createSpan({
			cls: 'mdrazor-command-group-title',
			text: section || tr('其他', 'Other'),
		});
		const groupBody = groupEl.createDiv({ cls: 'mdrazor-command-group-body' });
		const groupList = groupBody.createDiv({ cls: 'mdrazor-command-list' });
		for (const item of groupItems) renderRow(groupList, item);

		header.addEventListener('click', (e) => {
			if ((e.target as HTMLElement).closest('button')) return;
			const isOpen = groupBody.isShown();
			groupBody.toggle(!isOpen);
			setIcon(chevron, isOpen ? 'chevron-right' : 'chevron-down');
		});
	}
}
