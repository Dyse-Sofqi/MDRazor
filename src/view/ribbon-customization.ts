/**
 * MDRazor — 左功能区设置页：自定义命令 / 隐藏命令
 *
 * 在「清理失联图片」之后渲染两个可折叠的同层级区块。
 * 本次渲染只负责填充传入的 container，调用方可安全地重复清空重绘。
 */

import { ButtonComponent, setIcon } from 'obsidian';
import { tr } from '../i18n';
import type MDRazorPlugin from '../controller/main';
import { openRibbonCommandWizard } from './ribbon-command-wizard';

export function renderRibbonCustomization(container: HTMLElement, plugin: MDRazorPlugin): void {
	container.empty();

	/* ── 自定义命令 ── */
	const customSection = createCollapsibleSection(
		container,
		tr('自定义命令', 'Custom Commands'),
		true,
	);
	const addButton = new ButtonComponent(customSection.header)
		.setButtonText(tr('添加命令', 'Add Command'))
		.setTooltip(tr('添加一个命令到左功能区', 'Add a command to the left ribbon'))
		.onClick(() => {
			openRibbonCommandWizard(plugin, () => {
				renderRibbonCustomization(container, plugin);
			});
		});
	addButton.buttonEl.addClass('mdrazor-collapsible-action');

	renderCustomCommandList(customSection.body, plugin, () => {
		renderRibbonCustomization(container, plugin);
	});

	/* ── 隐藏命令 ── */
	const hiddenSection = createCollapsibleSection(
		container,
		tr('隐藏命令', 'Hidden Commands'),
		true,
	);
	renderHiddenCommandList(hiddenSection.body, plugin, () => {
		renderRibbonCustomization(container, plugin);
	});
}

/**
 * 创建可折叠区块。
 */
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

/**
 * 渲染「自定义命令」列表，支持拖拽排序与删除。
 */
function renderCustomCommandList(
	body: HTMLElement,
	plugin: MDRazorPlugin,
	rerender: () => void,
): void {
	const listEl = body.createDiv({ cls: 'mdrazor-command-list' });
	const commands = plugin.ribbonManager.getCustomCommands();

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

		const deleteBtn = new ButtonComponent(row)
			.setIcon('trash-2')
			.setTooltip(tr('删除该自定义命令', 'Delete this custom command'))
			.onClick(async () => {
				await plugin.ribbonManager.removeCustom(cmd.id);
				rerender();
			});
		deleteBtn.buttonEl.addClass('mdrazor-command-item-delete');

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
			const list = plugin.ribbonManager.getCustomCommands();
			const from = list.findIndex((c) => c.id === draggedId);
			const to = list.findIndex((c) => c.id === cmd.id);
			if (from < 0 || to < 0) return;
			const rect = row.getBoundingClientRect();
			const insertAfter = e.clientY > rect.top + rect.height / 2;
			let target = to;
			if (insertAfter) target = to + 1;
			if (from < target) target -= 1;
			void plugin.ribbonManager.reorderCustom(from, target).then(rerender);
		});
	}
}

/**
 * 渲染「隐藏命令」列表：展示功能区当前所有命令，提供隐藏/显示切换，
 * 并支持拖拽调整任意功能区命令的顺序。
 */
function renderHiddenCommandList(
	body: HTMLElement,
	plugin: MDRazorPlugin,
	rerender: () => void,
): void {
	const listEl = body.createDiv({ cls: 'mdrazor-command-list' });
	const items = plugin.ribbonManager.getRibbonItems();

	if (items.length === 0) {
		listEl.createDiv({
			cls: 'mdrazor-command-empty',
			text: tr('功能区当前没有可管理的命令。', 'There are no ribbon commands to manage right now.'),
		});
		return;
	}

	let dragKey = '';

	for (const item of items) {
		const row = listEl.createDiv({ cls: 'mdrazor-command-item' });
		row.setAttribute('draggable', 'true');

		const iconEl = row.createSpan({ cls: 'mdrazor-command-item-icon' });
		setIcon(iconEl, item.icon || 'command');

		const nameEl = row.createSpan({ cls: 'mdrazor-command-item-name', text: item.name });
		nameEl.title = item.isCustom && item.commandId ? item.commandId : item.key;

		const visibilityBtn = new ButtonComponent(row)
			.setIcon(item.hidden ? 'eye-off' : 'eye')
			.setTooltip(item.hidden ? tr('显示', 'Show') : tr('隐藏', 'Hide'))
			.onClick(async () => {
				await plugin.ribbonManager.setHidden(item.key, !item.hidden);
				rerender();
			});
		visibilityBtn.buttonEl.addClass('mdrazor-command-item-visibility');

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
			void plugin.ribbonManager.reorderRibbonItem(dragged, item.key, after).then(rerender);
		});
	}
}
