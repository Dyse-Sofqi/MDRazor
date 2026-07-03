/**
 * MDRazor — Directory Focus
 *
 * Click folder name in file explorer: expand entire descendant tree plus
 * ancestor chain, collapse all siblings/parent-siblings/grandparent-siblings.
 *
 * Uses capture-phase click intercept on the file-explorer container to block
 * Obsidian's native React handler, then batch-applies collapse states via
 * each FileItem's setCollapsed() method.
 */

import { type App, TFolder, type Plugin, type TFile } from 'obsidian';

/* ------------------------------------------------------------------ */
/*  Internal type helpers (file-explorer API not in public types)       */
/* ------------------------------------------------------------------ */

/** Minimal shape of a single file-item in the file-explorer view. */
interface FileExplorerItem {
	file: TFolder | TFile;
	setCollapsed(collapsed: boolean): void;
}

/** Minimal shape of the file-explorer view's internal API surface. */
interface FileExplorerView {
	fileItems: Map<string, FileExplorerItem> | Record<string, FileExplorerItem>;
	requestUpdate?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Core algorithm                                                     */
/* ------------------------------------------------------------------ */

export interface CollapseState {
	[path: string]: boolean; // true = collapsed, false = expanded
}

/** Build ancestor chain from folder up to root (exclusive). */
function getAncestors(folder: TFolder): TFolder[] {
	const chain: TFolder[] = [];
	let p = folder.parent;
	while (p && !p.isRoot()) {
		chain.unshift(p);
		p = p.parent;
	}
	return chain;
}


/**
 * Get all visible folder paths from the file-explorer view's fileItems.
 * Checks each FileItem's .file property directly instead of using
 * vault.getFolderByPath() (which requires Obsidian v1.5.7+).
 */
function getAllFolderPaths(view: FileExplorerView): string[] {
	const items = view.fileItems;
	if (items instanceof Map) {
		return Array.from(items.keys()).filter((path: string) => {
			const item = items.get(path);
			return item?.file instanceof TFolder;
		});
	}
	// Fallback: record-like object (older Obsidian versions)
	return Object.keys(items).filter((path: string) => {
		const item = items[path];
		return item?.file instanceof TFolder;
	});
}

/**
 * Compute target collapse states for ALL folders.
 *
 * keepExpanded = ancestors + clicked
 * Inside keepExpanded → expanded (false)
 * Outside keepExpanded → collapsed (true)
 * Clicked folder → always expanded (false)
 */
export function computeCollapseStates(
	clicked: TFolder,
	allPaths: string[],
): CollapseState {
	const ancestors = getAncestors(clicked);

	const keepExpanded = new Set<string>();
	for (const f of ancestors) keepExpanded.add(f.path);
	keepExpanded.add(clicked.path);

	const states: CollapseState = {};
	for (const path of allPaths) {
		states[path] = path === clicked.path ? false : !keepExpanded.has(path);
	}
	return states;
}

/* ------------------------------------------------------------------ */
/*  State application via RAF-batched FileItem.setCollapsed()          */
/* ------------------------------------------------------------------ */

let currentBatchId = 0;

/**
 * Apply collapse states via each FileItem's setCollapsed() method,
 * batched across RAF frames (10 per frame) to avoid blocking the main thread.
 *
 * - batchId counter cancels stale batches on rapid clicks
 * - Saves & restores scrollTop to prevent scrollbar jump
 */
export function applyStates(
	view: FileExplorerView,
	states: CollapseState,
	containerEl?: HTMLElement,
): void {
	const batchId = ++currentBatchId;
	const entries = Object.entries(states);
	if (entries.length === 0) return;

	const items = view.fileItems;
	const savedScrollTop = containerEl?.scrollTop ?? 0;

	let i = 0;
	function batch(): void {
		if (batchId !== currentBatchId) return; // stale — discard
		const chunk = entries.slice(i, i + 10);
		for (const [path, collapsed] of chunk) {
			// setCollapsed lives on the FileItem, not on the view
			const item = items instanceof Map ? items.get(path) : items[path];
			if (item?.setCollapsed) {
				try {
					item.setCollapsed(collapsed);
				} catch { /* skip unsupported items */ }
			}
		}
		i += 10;
		if (i >= entries.length) {
			if (containerEl) containerEl.scrollTop = savedScrollTop;
			return;
		}
		window.requestAnimationFrame(batch);
	}
	window.requestAnimationFrame(batch);
}

/* ------------------------------------------------------------------ */
/*  Full focus processing pipeline                                     */
/* ------------------------------------------------------------------ */

/**
 * Execute directory focus for a clicked folder.
 *
 * 1. Get all folder paths from fileItems
 * 2. Compute target collapse states
 * 3. Apply states in RAF batches (with scroll preservation)
 *
 * @param view  File-explorer view (from workspace leaf)
 */
export function processFocus(
	view: FileExplorerView,
	clicked: TFolder,
	containerEl?: HTMLElement,
): void {
	const allPaths = getAllFolderPaths(view);
	if (allPaths.length === 0) return;

	const states = computeCollapseStates(clicked, allPaths);
	applyStates(view, states, containerEl);
}

/* ------------------------------------------------------------------ */
/*  Lifecycle: capture-phase click handler on file-explorer DOM        */
/* ------------------------------------------------------------------ */

/** Return true if the click target is inside the collapse chevron. */
function isChevronClick(e: MouseEvent): boolean {
	const target = e.target as HTMLElement;
	// Obsidian v1.6+ uses .tree-item-icon.collapse-icon (replaced .nav-folder-collapse-indicator)
	return !!target.closest('.tree-item-icon.collapse-icon');
}

/** Bound handler ref (for cleanup on layout-change). */
let currentHandler: ((e: MouseEvent) => void) | null = null;

/** The current containerEl (for scrollTop access in processFocus). */
let currentContainerEl: HTMLElement | null = null;

/**
 * Tracks the currently focused folder path for
 * first-click-focus, second-click-toggle behavior.
 */
let focusedFolderPath: string | null = null;

/**
 * Attach a capture-phase click handler to the file-explorer container.
 * Previously attached handler (if any) is removed first to prevent leaks.
 */
export function attachHandler(
	containerEl: HTMLElement,
	app: App,
	enabled: () => boolean,
	view: FileExplorerView,
): void {
	if (currentHandler) {
		containerEl.removeEventListener('click', currentHandler, true);
	}

	currentContainerEl = containerEl;

	currentHandler = (e: MouseEvent) => {
		if (!enabled()) return;

		const el = (e.target as HTMLElement).closest('.nav-folder-title');

		// ── Blank area click → collapse all top-level folders ──
		if (!el) {
			if (!isChevronClick(e)
				&& !(e.target as HTMLElement).closest('.nav-file-title, .mdr-vertical-tab-close, .nav-buttons-container')) {
				focusedFolderPath = null;
				const items = view.fileItems;
				const paths = items instanceof Map
					? Array.from(items.keys())
					: Object.keys(items);
				const toCollapse: Array<{ setCollapsed(c: boolean): void }> = [];
				for (const path of paths) {
					const item = items instanceof Map ? items.get(path) : items[path];
					if (item?.file instanceof TFolder && item.file.parent?.isRoot()) {
						toCollapse.push(item);
					}
				}
				window.requestAnimationFrame(() => {
					for (const item of toCollapse) {
						try { item.setCollapsed(true); } catch { /* skip */ }
					}
				});
				e.stopPropagation();
				e.stopImmediatePropagation();
			}
			return;
		}

		if (isChevronClick(e)) return;

		// Walk ancestor chain to find data-path attribute
		// (Obsidian may place it on .nav-folder or .tree-item depending on version)
		let path: string | null = null;
		let node: Element | null = el;
		while (node) {
			path = node.getAttribute('data-path');
			if (path) break;
			node = node.parentElement;
		}
		if (!path) return;

		// Folder lookup: prefer fileItems (version-agnostic), fallback to vault API
		const items = view.fileItems;
		const item = items instanceof Map ? items.get(path) : items[path];
		const folder = item?.file ?? app.vault.getAbstractFileByPath(path);
		if (!(folder instanceof TFolder)) return;

		// Stop propagation only AFTER confirming we can handle this click
		e.stopPropagation();
		e.stopImmediatePropagation();

		// ── First-click focuses, second-click toggles collapse ──
		if (path === focusedFolderPath) {
			// Same folder: just toggle its own collapse state; keep focus
			const navFolderEl = el.closest('.nav-folder');
			const isCollapsed = navFolderEl?.classList.contains('is-collapsed') ?? false;
			window.requestAnimationFrame(() => item?.setCollapsed(!isCollapsed));
		} else {
			// Different folder (or first ever click): run full focus
			focusedFolderPath = path;
			window.requestAnimationFrame(() =>
				processFocus(view, folder, currentContainerEl ?? undefined),
			);
		}
	};

	containerEl.addEventListener('click', currentHandler, true);
}

/** Remove the currently attached handler (if any). */
export function detachHandler(containerEl: HTMLElement): void {
	if (currentHandler) {
		containerEl.removeEventListener('click', currentHandler, true);
		currentHandler = null;
		currentContainerEl = null;
		focusedFolderPath = null;
	}
}

/* ------------------------------------------------------------------ */
/*  Public entry point                                                 */
/* ------------------------------------------------------------------ */

/**
 * Set up directory focus feature.
 *
 * - Finds file-explorer leaf on layout-ready
 * - Retries x3 with 500ms delay if leaf not found (security mode / deferred load)
 * - On retry exhaustion, sets handler refs to null (cleanup)
 * - Attaches capture-phase click handler
 * - Re-attaches on layout-change (sidebar recreate)
 * - Plugin.registerEvent() ensures cleanup on unload
 */
export function registerDirFocus(plugin: Plugin, enabled: () => boolean): void {
	if (!enabled()) return;
	const { app } = plugin;
	let containerEl: HTMLElement | null = null;

	const findAndAttach = (): boolean => {
		const leaves = app.workspace.getLeavesOfType('file-explorer');
		if (!leaves.length) return false;

		const leaf = leaves[0];
		if (!leaf) return false;
		containerEl = leaf.view.containerEl;
		attachHandler(containerEl, app, enabled, leaf.view as unknown as FileExplorerView);
		return true;
	};

	app.workspace.onLayoutReady(() => {
		const found = findAndAttach();

		if (!found) {
			let retries = 0;
			const interval = window.setInterval(() => {
				if (containerEl) { window.clearInterval(interval); return; }
				if (retries++ >= 3) {
					window.clearInterval(interval);
					currentHandler = null;
					currentContainerEl = null;
					return;
				}
				if (findAndAttach()) window.clearInterval(interval);
			}, 500);
		}
	});

	plugin.registerEvent(
		app.workspace.on('layout-change', () => {
			if (containerEl) detachHandler(containerEl);
			containerEl = null;
			findAndAttach();
		}),
	);
}
