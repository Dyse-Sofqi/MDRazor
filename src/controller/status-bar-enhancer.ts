/**
 * MDRazor — 状态栏增强：工作区快速切换
 */

import { Plugin } from 'obsidian';

interface WorkspacesPluginInstance {
	workspaces: Record<string, unknown>;
	loadWorkspace(name: string): Promise<void>;
}

export function registerStatusBarEnhancer(
	plugin: Plugin,
): { addButton: () => void; removeButton: () => void } {
	let statusBarEl: HTMLElement | null = null;
	let menuEl: HTMLElement | null = null;
	let currentWorkspaceName: string | null = null;

	const getWorkspacesPlugin = (): WorkspacesPluginInstance | null => {
		const internalPlugins = (plugin.app as any).internalPlugins;
		const workspacesPlugin = internalPlugins?.getPluginById('workspaces');
		if (!workspacesPlugin?.enabled) return null;
		return workspacesPlugin.instance as WorkspacesPluginInstance;
	};

	const updateButtonText = (): void => {
		if (!statusBarEl) return;
		const nameSpan = statusBarEl.querySelector('.mdrazror-workspace-name');
		if (nameSpan) {
			nameSpan.textContent = currentWorkspaceName || '';
		}
	};

	const switchWorkspace = async (name: string): Promise<void> => {
		const wp = getWorkspacesPlugin();
		if (!wp) return;
		try {
			await wp.loadWorkspace(name);
			currentWorkspaceName = name;
			updateButtonText();
		} catch (e) {
			console.error('MDRazor: failed to switch workspace', e);
		}
	};

	const findCurrentWorkspace = (wp: WorkspacesPluginInstance): string | null => {
		if (currentWorkspaceName && currentWorkspaceName in (wp.workspaces || {})) {
			return currentWorkspaceName;
		}
		const names = Object.keys(wp.workspaces || {});
		return names.length > 0 ? names[0]! : null;
	};

	const showMenu = (names: string[], currentName: string | null): void => {
		removeMenu();
		if (!statusBarEl) return;

		menuEl = document.createElement('div');
		menuEl.addClass('mdrazor-workspace-menu');
		menuEl.style.cssText =
			'position:fixed;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.15);z-index:9999;min-width:160px;padding:4px 0;';

		const rect = statusBarEl.getBoundingClientRect();
		menuEl.style.bottom = `${window.innerHeight - rect.top + 4}px`;
		menuEl.style.left = `${Math.max(4, rect.left)}px`;

		for (const name of names) {
			const item = document.createElement('div');
			item.textContent = name;
			item.style.cssText =
				'padding:6px 16px;cursor:pointer;font-size:13px;white-space:nowrap;';
			if (name === currentName) {
				item.style.fontWeight = '700';
				item.style.color = 'var(--text-accent)';
			}
			item.addEventListener('mouseenter', () => {
				item.style.background = 'var(--background-modifier-hover)';
			});
			item.addEventListener('mouseleave', () => {
				item.style.background = 'transparent';
			});
			item.addEventListener('click', async (e) => {
				e.stopPropagation();
				removeMenu();
				if (name !== currentName) {
					await switchWorkspace(name);
				}
			});
			menuEl.appendChild(item);
		}

		document.body.appendChild(menuEl);

		const closeOnOutsideClick = (e: MouseEvent) => {
			if (menuEl && !menuEl.contains(e.target as Node) && e.target !== statusBarEl) {
				removeMenu();
				document.removeEventListener('click', closeOnOutsideClick, true);
			}
		};
		setTimeout(() => {
			document.addEventListener('click', closeOnOutsideClick, true);
		}, 0);

		const closeOnEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				removeMenu();
				document.removeEventListener('keydown', closeOnEscape, true);
			}
		};
		document.addEventListener('keydown', closeOnEscape, true);
	};

	const removeMenu = (): void => {
		if (menuEl) {
			menuEl.remove();
			menuEl = null;
		}
	};

	const handleClick = async (): Promise<void> => {
		const wp = getWorkspacesPlugin();
		if (!wp) return;

		const names = Object.keys(wp.workspaces || {});
		if (names.length <= 1) return;

		const currentName = findCurrentWorkspace(wp);

		if (names.length === 2) {
			const target = names.find((n) => n !== currentName);
			if (target) await switchWorkspace(target);
			return;
		}

		showMenu(names, currentName);
	};

	const addButton = (): void => {
		if (statusBarEl) return;

		statusBarEl = plugin.addStatusBarItem();
		statusBarEl.addClass('mdrazor-statusbar-workspace');
		statusBarEl.style.cssText =
			'cursor:pointer;display:flex;align-items:center;gap:4px;';
		statusBarEl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg><span class="mdrazror-workspace-name"></span>';
		statusBarEl.addEventListener('click', handleClick);

		plugin.registerEvent(
			plugin.app.workspace.on('resize', () => {
				updateButtonText();
			}),
		);

		updateButtonText();
	};

	const removeButton = (): void => {
		removeMenu();
		if (statusBarEl) {
			statusBarEl.remove();
			statusBarEl = null;
		}
	};

	return { addButton, removeButton };
}
