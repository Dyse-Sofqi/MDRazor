/**
 * MDRazor — Open-in-Tab re-router (shared by file-explorer + bookmarks)
 *
 * Obsidian's native open paths (file-explorer click, bookmark click, ...) end in
 * either WorkspaceLeaf.openFile() or Workspace.openLinkText(). This module
 * patches both once, and lets feature handlers declare that the NEXT such call
 * should be redirected to the enhancer target (existing tab, else new tab).
 *
 * Why redirect instead of blocking the native click? Blocking the native click
 * also blocks Obsidian's selection/anchor bookkeeping (file-explorer shift+click
 * multi-select, bookmark view highlight). Letting the native handler run keeps
 * that intact; we only re-route where the file actually opens.
 *
 * Handlers:
 *   - requestOpenInTab(path)    — redirect only when target matches `path`
 *   - requestOpenAnyInTab()     — redirect the next open regardless of target
 */

import {
	type OpenViewState,
	type PaneType,
	type Plugin,
	TFile,
	Workspace,
	WorkspaceLeaf,
} from 'obsidian';

/** Window in ms during which a pending request is honored. */
const WINDOW_MS = 500;

let pluginRef: Plugin | null = null;

let pendingPath: { path: string; ts: number } | null = null;
let pendingAny: number | null = null;

function isPathPending(filePath: string): boolean {
	return (
		pendingPath !== null &&
		pendingPath.path === filePath &&
		Date.now() - pendingPath.ts < WINDOW_MS
	);
}
function isAnyPending(): boolean {
	return pendingAny !== null && Date.now() - pendingAny < WINDOW_MS;
}
function clearPathPending(filePath: string): void {
	if (pendingPath?.path === filePath) pendingPath = null;
}
function clearAnyPending(): void {
	pendingAny = null;
}

/** Existing tab → focus it; else open in a new tab. */
function openInEnhancerMode(file: TFile, openState?: OpenViewState): Promise<void> {
	const app = pluginRef!.app;

	let existingLeaf: WorkspaceLeaf | null = null;
	app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
		if (existingLeaf) return;
		const f = (leaf.view as { file?: TFile })?.file;
		if (f instanceof TFile && f.path === file.path) {
			existingLeaf = leaf;
			return;
		}
		try {
			const vs = leaf.getViewState?.();
			if (vs?.state?.file === file.path) existingLeaf = leaf;
		} catch { /* leaf not ready */ }
	});

	if (existingLeaf) {
		app.workspace.setActiveLeaf(existingLeaf, { focus: true });
		return Promise.resolve();
	}
	return app.workspace.getLeaf(true).openFile(file, openState);
}

/**
 * Register the openFile + openLinkText patches (idempotent).
 * Called by every feature that uses the redirect (file-explorer, bookmarks).
 */
export function initOpenInTab(plugin: Plugin): void {
	if (pluginRef) return;
	pluginRef = plugin;

	// eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: wrap prototype method, bound via .call
	const origOpenFile = WorkspaceLeaf.prototype.openFile;

	WorkspaceLeaf.prototype.openFile = function (
		this: WorkspaceLeaf,
		file: TFile,
		openState?: OpenViewState,
	): Promise<void> {
		if (isPathPending(file.path)) {
			clearPathPending(file.path);
			return openInEnhancerMode(file, openState);
		}
		if (isAnyPending()) {
			clearAnyPending();
			return openInEnhancerMode(file, openState);
		}
		return origOpenFile.call(this, file, openState);
	};

	// eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: wrap prototype method, bound via .call
	const origOpenLinkText = Workspace.prototype.openLinkText;

	Workspace.prototype.openLinkText = function (
		this: Workspace,
		linktext: string,
		sourcePath: string,
		newLeaf?: PaneType | boolean,
		openViewState?: OpenViewState,
	): Promise<void> {
		const file = pluginRef!.app.metadataCache.getFirstLinkpathDest(linktext, sourcePath);
		if (file instanceof TFile) {
			if (isPathPending(file.path)) {
				clearPathPending(file.path);
				void openInEnhancerMode(file, openViewState);
				return Promise.resolve();
			}
			if (isAnyPending()) {
				clearAnyPending();
				void openInEnhancerMode(file, openViewState);
				return Promise.resolve();
			}
		}
		return origOpenLinkText.call(this, linktext, sourcePath, newLeaf, openViewState);
	};

	plugin.register(() => {
		WorkspaceLeaf.prototype.openFile = origOpenFile;
		Workspace.prototype.openLinkText = origOpenLinkText;
	});
}

/** Redirect the next open whose target matches `path`. */
export function requestOpenInTab(path: string): void {
	pendingPath = { path, ts: Date.now() };
	window.setTimeout(() => {
		if (pendingPath?.path === path) pendingPath = null;
	}, WINDOW_MS);
}

/** Redirect the next open regardless of target. */
export function requestOpenAnyInTab(): void {
	pendingAny = Date.now();
	window.setTimeout(() => {
		pendingAny = null;
	}, WINDOW_MS);
}
