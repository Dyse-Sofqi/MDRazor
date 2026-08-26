/**
 * MDRazor — file-tab detection shared by the tab-enhancer modules
 *
 * A "file tab" is a leaf in the main workspace area that actually DISPLAYS
 * a file:
 *   - `view.file` is set (markdown / image / pdf / canvas / ...), or
 *   - it is a markdown view whose view state already references a file
 *     (view.file is still null while the file is loading).
 *
 * Sidebar views (backlink, file-properties, outline, search, ...) also
 * carry a `state.file` in their view state — they REFERENCE a file
 * without showing a tab. Treating them as open tabs leaks phantom
 * entries into the vertical-tab list: the file still renders there after
 * its tab was closed, clicking it only focuses the sidebar view, and the
 * close button can never detach anything (closeTab skips non-main-area
 * leaves). Every leaf lookup in this feature therefore goes through
 * getFileTabPath() so the notion of "open file" stays consistent.
 */

import { type App, type WorkspaceLeaf, TFile } from 'obsidian';

/** True when the leaf lives inside the main (root) workspace split. */
function isInMainArea(app: App, leaf: WorkspaceLeaf): boolean {
	const rootEl = app.workspace.containerEl.querySelector('.workspace-split.mod-root');
	return !rootEl || rootEl.contains(leaf.view.containerEl);
}

/**
 * Path of the file displayed by the leaf, or null when the leaf is not a
 * real file tab in the main area (sidebar views, popouts, empty leaves).
 */
export function getFileTabPath(app: App, leaf: WorkspaceLeaf): string | null {
	if (!isInMainArea(app, leaf)) return null;

	const file = (leaf.view as { file?: TFile | null })?.file;
	if (file instanceof TFile) return file.path;

	// Markdown views reloading a file: view.file is null for a moment —
	// fall back to the declared view state. Restrict to markdown: sidebar
	// views such as backlink/file-properties also declare state.file but
	// are NOT tabs.
	if (leaf.view.getViewType?.() !== 'markdown') return null;
	try {
		const vs = leaf.getViewState?.();
		const p = vs?.state?.file;
		return typeof p === 'string' && p.length > 0 ? p : null;
	} catch {
		return null;
	}
}
