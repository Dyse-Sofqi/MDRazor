/**
 * MDRazor — Tab Enhancer
 *
 * Intercept file clicks in file explorer. If tab for that file already exists,
 * switch to it. Otherwise let Obsidian open normally.
 *
 * Ctrl/Meta+click bypasses enhancer → native Obsidian behavior (open in new tab).
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
	const { app } = plugin;

	let containerEl: HTMLElement | null = null;
	let handler: ((e: MouseEvent) => void) | null = null;

	/* ---- locate file-explorer container ---- */

	const findContainer = (): boolean => {
		const leaves = app.workspace.getLeavesOfType('file-explorer');
		if (!leaves.length) return false;
		const leaf = leaves[0];
		if (!leaf) return false;
		containerEl = leaf.view.containerEl;
		return true;
	};

	/* ---- attach / detach handler ---- */

	const attach = (): void => {
		if (!containerEl) return;
		if (handler) containerEl.removeEventListener('click', handler, true);

		handler = (e: MouseEvent) => {
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
				const view = leaf.view as { file?: { path: string } };
				if (view?.file?.path === path) {
					existingLeaf = leaf;
				}
			});

			if (existingLeaf) {
				e.stopPropagation();
				e.stopImmediatePropagation();
				app.workspace.setActiveLeaf(existingLeaf, { focus: true });
			} else {
				// No existing tab — explicitly open file
				e.stopPropagation();
				e.stopImmediatePropagation();
				const leaf = app.workspace.getLeaf(true);
				if (leaf) void leaf.openFile(abstractFile);
			}
		};

		containerEl.addEventListener('click', handler, true);
	};

	const detach = (): void => {
		if (containerEl && handler) {
			containerEl.removeEventListener('click', handler, true);
		}
		handler = null;
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
