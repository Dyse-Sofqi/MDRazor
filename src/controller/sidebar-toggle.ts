/**
 * MDRazor — 侧边栏伸缩：一键折叠/展开左右侧边栏
 *
 * 智能逻辑：
 *   - 任一側边栏展开 → 折叠两侧
 *   - 两侧均已折叠 → 展开两侧
 *
 * 注册 Obsidian 命令（可分配快捷键）并返回状态栏按钮生命周期。
 */

import { Plugin, setIcon } from 'obsidian';

export function registerSidebarToggle(
	plugin: Plugin,
): { addButton: () => void; removeButton: () => void } {
	let statusBarEl: HTMLElement | null = null;

	const toggleSidebars = (): void => {
		const ws = plugin.app.workspace as unknown as {
			leftSplit: { collapsed: boolean; collapse(): void; expand(): void };
			rightSplit: { collapsed: boolean; collapse(): void; expand(): void };
		};

		const leftCollapsed = ws.leftSplit?.collapsed ?? true;
		const rightCollapsed = ws.rightSplit?.collapsed ?? true;

		if (!leftCollapsed || !rightCollapsed) {
			// 任一展开 → 全折叠
			if (!leftCollapsed) ws.leftSplit.collapse();
			if (!rightCollapsed) ws.rightSplit.collapse();
		} else {
			// 全折叠 → 全展开
			ws.leftSplit.expand();
			ws.rightSplit.expand();
		}
	};

	const addButton = (): void => {
		if (statusBarEl) return;

		statusBarEl = plugin.addStatusBarItem();
		statusBarEl.addClass('mdrazor-statusbar-sidebar-toggle');

		// 移到状态栏最左端
		const statusBarContainer = statusBarEl.parentElement;
		if (statusBarContainer && statusBarContainer.firstChild) {
			statusBarContainer.insertBefore(statusBarEl, statusBarContainer.firstChild);
		}

		setIcon(statusBarEl, 'columns-3');
		statusBarEl.createSpan({ text: '侧栏' });

		statusBarEl.addEventListener('click', toggleSidebars);
	};

	const removeButton = (): void => {
		if (statusBarEl) {
			statusBarEl.remove();
			statusBarEl = null;
		}
	};

	// 注册 Obsidian 命令，可在快捷键设置中绑定
	plugin.addCommand({
		id: 'mdrazor-toggle-sidebars',
		name: '切换侧边栏：折叠/展开左右侧边栏',
		icon: 'panel-left',
		callback: toggleSidebars,
	});

	return { addButton, removeButton };
}
