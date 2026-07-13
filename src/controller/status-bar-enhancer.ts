/**
 * MDRazor — 状态栏增强：工作区快速切换
 */

import { Plugin, type App, setIcon } from 'obsidian';

interface WorkspacesPluginInstance {
	workspaces: Record<string, unknown>;
	loadWorkspace(name: string): Promise<void>;
	saveWorkspace(name: string): Promise<void>;
}

interface AppInternalPlugins {
	getPluginById(id: string): { enabled: boolean; instance: WorkspacesPluginInstance } | null;
}

function getWorkspacesPlugin(app: App): WorkspacesPluginInstance | null {
	const internalPlugins = (app as unknown as { internalPlugins: AppInternalPlugins }).internalPlugins;
	const workspacesPlugin = internalPlugins?.getPluginById('workspaces');
	if (!workspacesPlugin?.enabled) return null;
	return workspacesPlugin.instance;
}

export function registerStatusBarEnhancer(
	plugin: Plugin,
	autoSaveEnabled: () => boolean,
): { addButton: () => void; removeButton: () => void } {
	let statusBarEl: HTMLElement | null = null;
	let menuEl: HTMLElement | null = null;
	let currentWorkspaceName: string | null = null;
	let nativeLoadWorkspace: ((name: string) => Promise<void>) | null = null;
	const doc = plugin.app.workspace.containerEl.ownerDocument;

	const updateButtonText = (): void => {
		if (!statusBarEl) return;
		const nameSpan = statusBarEl.querySelector('.mdrazror-workspace-name');
		if (nameSpan) {
			nameSpan.textContent = currentWorkspaceName || '';
		}
	};

	const switchWorkspace = async (name: string): Promise<void> => {
		const wp = getWorkspacesPlugin(plugin.app);
		if (!wp) return;
		try {
			// 自动保存：切换前先保存当前工作区布局
			if (autoSaveEnabled() && currentWorkspaceName) {
				try {
					await saveCurrentWorkspace(wp, currentWorkspaceName);
				} catch (e) {
					console.error('MDRazor: failed to auto-save workspace', currentWorkspaceName, e);
				}
			}
			await wp.loadWorkspace(name);
			currentWorkspaceName = name;
			updateButtonText();
		} catch (e) {
			console.error('MDRazor: failed to switch workspace', e);
		}
	};

	const saveCurrentWorkspace = async (
		wp: WorkspacesPluginInstance,
		name: string,
	): Promise<void> => {
		if (wp.saveWorkspace) {
			await wp.saveWorkspace(name);
		}
	};

	const findCurrentWorkspace = (wp: WorkspacesPluginInstance): string | null => {
		if (currentWorkspaceName && currentWorkspaceName in (wp.workspaces || {})) {
			return currentWorkspaceName;
		}
		// Try reading workspace plugin's internal active workspace first
		const activeWorkspace = (wp as unknown as { activeWorkspace?: string }).activeWorkspace;
		if (activeWorkspace && activeWorkspace in (wp.workspaces || {})) {
			return activeWorkspace;
		}
		const names = Object.keys(wp.workspaces || {});
		return names.length > 0 ? names[0]! : null;
	};

	const showMenu = (names: string[], currentName: string | null): void => {
		removeMenu();
		if (!statusBarEl) return;

		menuEl = doc.createElement('div');
		menuEl.addClass('mdrazor-workspace-menu');

		const rect = statusBarEl.getBoundingClientRect();
		menuEl.style.bottom = `${window.innerHeight - rect.top + 4}px`;
		menuEl.style.left = `${Math.max(4, rect.left)}px`;

		for (const name of names) {
			const item = doc.createElement('div');
			item.addClass('mdrazor-workspace-menu-item');
			item.textContent = name;
			if (name === currentName) {
				item.classList.add('is-active');
			}
			item.addEventListener('click', (e) => {
				e.stopPropagation();
				removeMenu();
				if (name !== currentName) {
					switchWorkspace(name).catch(console.error);
				}
			});
			menuEl.appendChild(item);
		}

		doc.body.appendChild(menuEl);

		const closeOnOutsideClick = (e: MouseEvent) => {
			if (menuEl && !menuEl.contains(e.target as Node) && e.target !== statusBarEl) {
				removeMenu();
				doc.removeEventListener('click', closeOnOutsideClick, true);
			}
		};
		window.setTimeout(() => {
			doc.addEventListener('click', closeOnOutsideClick, true);
		}, 0);

		const closeOnEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				removeMenu();
				doc.removeEventListener('keydown', closeOnEscape, true);
			}
		};
		doc.addEventListener('keydown', closeOnEscape, true);
	};

	const removeMenu = (): void => {
		if (menuEl) {
			menuEl.remove();
			menuEl = null;
		}
	};

	const handleClick = (): void => {
		const wp = getWorkspacesPlugin(plugin.app);
		if (!wp) return;

		const names = Object.keys(wp.workspaces || {});
		if (names.length <= 1) return;

		const currentName = findCurrentWorkspace(wp);

		if (names.length === 2) {
			const target = names.find((n) => n !== currentName);
			if (target) {
				switchWorkspace(target).catch(console.error);
			}
			return;
		}

		showMenu(names, currentName);
	};

	const addButton = (): void => {
		if (statusBarEl) return;

		statusBarEl = plugin.addStatusBarItem();
		statusBarEl.addClass('mdrazor-statusbar-workspace');

		setIcon(statusBarEl, 'panels-top-left');

		const nameSpan = doc.createElement('span');
		nameSpan.className = 'mdrazror-workspace-name';
		statusBarEl.appendChild(nameSpan);

		statusBarEl.addEventListener('click', handleClick);

		plugin.registerEvent(
			plugin.app.workspace.on('resize', () => {
				updateButtonText();
			}),
		);

		// Init workspace name on load
		const wp = getWorkspacesPlugin(plugin.app);
		if (wp) {
			currentWorkspaceName = findCurrentWorkspace(wp);
			// Monkey-patch: 拦截原生 loadWorkspace，切换前自动保存当前布局
			if (autoSaveEnabled()) {
				nativeLoadWorkspace = wp.loadWorkspace.bind(wp);
				wp.loadWorkspace = async (name: string) => {
					if (currentWorkspaceName && currentWorkspaceName !== name) {
						if (wp.saveWorkspace) {
							try {
								await wp.saveWorkspace(currentWorkspaceName);
							} catch (e) {
								console.error('MDRazor: failed to auto-save workspace before native load', currentWorkspaceName, e);
							}
						}
					}
					await nativeLoadWorkspace!(name);
					currentWorkspaceName = name;
					updateButtonText();
				};
			}
		}
		updateButtonText();
	};

	const removeButton = (): void => {
		removeMenu();
		// 恢复原生 loadWorkspace
		const wp = getWorkspacesPlugin(plugin.app);
		if (wp && nativeLoadWorkspace) {
			wp.loadWorkspace = nativeLoadWorkspace;
			nativeLoadWorkspace = null;
		}
		if (statusBarEl) {
			statusBarEl.remove();
			statusBarEl = null;
		}
	};

	return { addButton, removeButton };
}
