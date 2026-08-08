/**
 * MDRazor — Bookmark Opener
 *
 * Intercept clicks on the core "Bookmarks" view (left-ribbon star icon). If the
 * bookmarked file is already open in a tab, switch to it; otherwise open a new
 * tab — same logic as the wiki-link opener (tabEnhancerOpenLink).
 *
 * The click is NOT blocked: Obsidian's native handler still runs (keeps the
 * bookmark view's own selection/highlight bookkeeping), and the shared re-route
 * in open-in-tab.ts redirects the native open (WorkspaceLeaf.openFile OR
 * Workspace.openLinkText) to the enhancer target.
 *
 * Ctrl/Meta/Shift+click, middle/right click bypass → native behavior.
 */

import { type Plugin, TFile } from 'obsidian';
import { initOpenInTab, requestOpenInTab } from './open-in-tab';

/**
 * Bookmark items in the core Bookmarks view carry the `.bookmark` class on the
 * `.tree-item-self` element (confirmed in the live DOM). This is unique to the
 * bookmarks view, so no view-type scoping is needed.
 */
function findBookmarkItem(target: HTMLElement): HTMLElement | null {
	return target.closest<HTMLElement>('.tree-item-self.bookmark.is-clickable');
}

/**
 * Resolve a bookmark item's file path via data-path on the item or a nearby
 * ancestor (data-path is not part of the public API and may move between
 * versions, hence the ancestor walk).
 */
function resolvePath(item: HTMLElement): string | null {
	let node: Element | null = item;
	let guard = 0;
	while (node && !node.classList.contains('workspace-leaf-content') && guard++ < 6) {
		const p = node.getAttribute('data-path');
		if (p) return p;
		node = node.parentElement;
	}
	return null;
}

export function registerBookmarkOpener(plugin: Plugin, enabled: () => boolean): void {
	const { app } = plugin;

	initOpenInTab(plugin);

	const handler = (e: MouseEvent): void => {
		if (!enabled()) return;
		if (e.ctrlKey || e.metaKey || e.shiftKey) return;
		if (e.button !== 0) return;

		const item = findBookmarkItem(e.target as HTMLElement);
		if (!item) return;

		const linkText = resolvePath(item);
		if (!linkText) return;

		// data-path on bookmark items holds the note TITLE (e.g. basename without
		// extension), not the file path — so resolve it like a wiki-link.
		const file = app.metadataCache.getFirstLinkpathDest(linkText, '');
		if (!(file instanceof TFile)) return; // folder/search/etc. bookmark — native
		requestOpenInTab(file.path);
	};

	for (const evt of ['pointerdown', 'mousedown', 'click'] as const) {
		plugin.registerDomEvent(app.workspace.containerEl, evt, handler, { capture: true });
	}
}
