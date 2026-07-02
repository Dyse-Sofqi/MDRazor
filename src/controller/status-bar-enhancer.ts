/**
 * MDRazor — 状态栏增强：工作区快速切换
 */

import { Plugin, type App } from 'obsidian';

interface WorkspacesPluginInstance {
	workspaces: Record<string, unknown>;
	loadWorkspace(name: string): Promise<void>;
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
): { addButton: () => void; removeButton: () => void } {
	let statusBarEl: HTMLElement | null = null;
	let menuEl: HTMLElement | null = null;
	let currentWorkspaceName: string | null = null;
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

		const svgNS = 'http://www.w3.org/2000/svg';
		const svg = doc.createElementNS(svgNS, 'svg');
		svg.setAttribute('width', '14');
		svg.setAttribute('height', '14');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('fill', 'none');
		svg.setAttribute('stroke', 'currentColor');
		svg.setAttribute('stroke-width', '2');
		svg.setAttribute('stroke-linecap', 'round');
		svg.setAttribute('stroke-linejoin', 'round');
		svg.innerHTML = '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>';
		statusBarEl.appendChild(svg);

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
		}
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
