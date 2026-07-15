/**
 * MDRazor — Tab Enhancer
 *
 * Intercept file clicks in file explorer. If tab for that file already exists,
 * switch to it. Otherwise open in a new tab.
 *
 * Ctrl/Meta+click bypasses enhancer → native Obsidian behavior (open in new tab).
 *
 * Also intercepts right-click → new file (context menu create): opens
 * newly created file in a new tab instead of default current-tab behavior.
 */

import { type Plugin, TFile, type WorkspaceLeaf } from 'obsidian';

/* ------------------------------------------------------------------ */
/*  Lifecycle                                                          */
/* ------------------------------------------------------------------ */

/**
 * Register tab-enhancer feature.
 *
 * - Finds file-explorer leaf on layout-ready (with retry)
 * - Re-attaches on layout-change (sidebar recreate)
 * - Removes handler on plugin unload
 */
export function registerTabEnhancer(
	plugin: Plugin,
	enabled: () => boolean,
): void {
	if (!enabled()) return;
	const { app } = plugin;

	let containerEl: HTMLElement | null = null;
	let clickHandler: ((e: MouseEvent) => void) | null = null;
	let contextMenuHandler: ((e: MouseEvent) => void) | null = null;

	/** True when a contextmenu event was just fired on the file-explorer.
	 *  Consumed by vault.create to decide whether to open in a new tab. */
	let contextMenuJustUsed = false;

	/* ---- locate file-explorer container ---- */

	const findContainer = (): boolean => {
		const leaves = app.workspace.getLeavesOfType('file-explorer');
		if (!leaves.length) return false;
		const leaf = leaves[0];
		if (!leaf) return false;
		containerEl = leaf.view.containerEl;
		return true;
	};

	/* ---- vault.create → new tab for context-menu-created files ---- */

	plugin.registerEvent(
		app.vault.on('create', (file) => {
			if (!enabled()) return;
			if (!contextMenuJustUsed) return;
			contextMenuJustUsed = false;
			if (!(file instanceof TFile)) return;

			// Open in new tab. File is still in rename mode, but Obsidian
			// will switch to our leaf when rename completes.
			const leaf = app.workspace.getLeaf(true);
			if (leaf) void leaf.openFile(file);
		}),
	);

	/* ---- attach / detach handlers ---- */

	const attach = (): void => {
		if (!containerEl) return;

		// Remove old handlers if re-attaching
		if (clickHandler) containerEl.removeEventListener('click', clickHandler, true);
		if (contextMenuHandler) containerEl.removeEventListener('contextmenu', contextMenuHandler, true);

		contextMenuHandler = () => {
			contextMenuJustUsed = true;
			// Reset if no vault.create fires within 1s (user dismissed menu)
			window.setTimeout(() => {
				contextMenuJustUsed = false;
			}, 1000);
		};
		containerEl.addEventListener('contextmenu', contextMenuHandler, true);

		clickHandler = (e: MouseEvent) => {
			if (!enabled()) return;

			// Skip clicks on vertical-tabs close button
			if ((e.target as HTMLElement).closest('.mdr-vertical-tab-close')) return;

			// Ctrl/Meta+click → restore native Obsidian behavior (open in new tab)
			if (e.ctrlKey || e.metaKey) return;

			const el = (e.target as HTMLElement).closest('.nav-file-title');
			if (!el) return;

			// Walk ancestor chain to find data-path
			let path: string | null = null;
			let node: Element | null = el;
			while (node) {
				path = node.getAttribute('data-path');
				if (path) break;
				node = node.parentElement;
			}
			if (!path) return;

			const abstractFile = app.vault.getAbstractFileByPath(path);
			if (!(abstractFile instanceof TFile)) return;

			// Check if file is already open in any leaf
			let existingLeaf: WorkspaceLeaf | null = null;
			app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
				// Leaf with loaded view
				const file = (leaf.view as { file?: TFile })?.file;
				if (file instanceof TFile && file.path === path) {
					existingLeaf = leaf;
					return;
				}
				// Unloaded leaf — match via view state
				try {
					const vs = leaf.getViewState?.();
					if (vs?.state?.file === path) {
						existingLeaf = leaf;
					}
				} catch { /* leaf not ready */ }
			});

			if (existingLeaf) {
				e.stopPropagation();
				e.stopImmediatePropagation();
				app.workspace.setActiveLeaf(existingLeaf, { focus: true });
			} else {
				// No existing tab — open in new tab
				e.stopPropagation();
				e.stopImmediatePropagation();
				const leaf = app.workspace.getLeaf(true);
				if (leaf) void leaf.openFile(abstractFile);
			}
		};

		containerEl.addEventListener('click', clickHandler, true);
	};

	const detach = (): void => {
		if (containerEl) {
			if (clickHandler) containerEl.removeEventListener('click', clickHandler, true);
			if (contextMenuHandler) containerEl.removeEventListener('contextmenu', contextMenuHandler, true);
		}
		clickHandler = null;
		contextMenuHandler = null;
	};

	/* ---- initial setup (layout-ready with retry) ---- */

	app.workspace.onLayoutReady(() => {
		if (!findContainer()) {
			let retries = 0;
			const interval = window.setInterval(() => {
				if (containerEl) {
					window.clearInterval(interval);
					return;
				}
				if (retries++ >= 3) {
					window.clearInterval(interval);
					return;
				}
				if (findContainer()) {
					window.clearInterval(interval);
					attach();
				}
			}, 500);
			return;
		}
		attach();
	});

	/* ---- re-attach on layout-change ---- */

	plugin.registerEvent(
		app.workspace.on('layout-change', () => {
			detach();
			containerEl = null;
			if (findContainer()) attach();
		}),
	);

	/* ---- cleanup on unload ---- */

	plugin.register(() => detach());
}
