/**
 * MDRazor — Directory File Count
 *
 * Show file/folder count badge on each folder in the file explorer.
 * Supports two modes controlled by settings:
 *   - Direct only (default): count direct children (sub-folders + files)
 *   - Recursive: count all descendant files (excluding folders themselves)
 *
 * Badge creation is deferred via setTimeout(0) with a 50ms retry because
 * Obsidian's React renderer sets data-path on .nav-folder AFTER the
 * MutationObserver callback runs (same microtask but later in the synchronous
 * React commit phase). The retry handles deeply-nested trees where virtual
 * scrolling delays attribute assignment across multiple frames.
 *
 * CSS lives in styles.css (Obsidian loads it for us — no runtime <style> injection).
 */

import { App, Plugin, TFile, TFolder } from 'obsidian';
import { listEnhancerConfig } from '../model/shared';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const BADGE_CLASS = 'mdr-dir-file-count';

/* ------------------------------------------------------------------ */
/*  Badge DOM management                                               */
/* ------------------------------------------------------------------ */

function getDirectChildCount(folder: TFolder): number {
	return folder.children.length;
}

/** Recursively count all files within a folder (including nested sub-folders). */
function getRecursiveFileCount(folder: TFolder): number {
	let count = 0;
	for (const child of folder.children) {
		if (child instanceof TFile) {
			count++;
		} else if (child instanceof TFolder) {
			count += getRecursiveFileCount(child);
		}
	}
	return count;
}

/** Remove all count badges from the file-explorer container. */
function removeAllBadges(containerEl: HTMLElement): void {
	const selector = '.' + BADGE_CLASS;
	containerEl.querySelectorAll(selector).forEach((el) => el.remove());
}

/**
 * Resolve a folder title element to its vault path.
 * data-path may be on the title itself or on the parent .nav-folder.
 */
function getFolderPath(titleEl: HTMLElement): string | null {
	let path = titleEl.getAttribute('data-path');
	if (path) return path;

	const folderEl = titleEl.closest('.nav-folder');
	if (folderEl) {
		path = folderEl.getAttribute('data-path');
	}
	return path ?? null;
}

/**
 * Add or update a count badge for a single folder title element.
 * Gracefully ignores elements whose data-path is not yet set (returns false).
 */
function ensureBadge(app: App, titleEl: HTMLElement, directOnly: boolean): boolean {
	const path = getFolderPath(titleEl);
	if (!path) return false;

	const abstractFile = app.vault.getAbstractFileByPath(path);
	if (!(abstractFile instanceof TFolder)) return false;

	const count = directOnly
		? getDirectChildCount(abstractFile)
		: getRecursiveFileCount(abstractFile);
	const selector = '.' + BADGE_CLASS;

	let badge = titleEl.querySelector<HTMLElement>(selector);
	if (badge) {
		badge.textContent = '' + count;
		return true;
	}

	badge = app.workspace.containerEl.ownerDocument.createElement('span');
	badge.className = BADGE_CLASS;
	badge.textContent = '' + count;

	const titleContent = titleEl.querySelector('.nav-folder-title-content');
	if (titleContent && titleContent.parentElement === titleEl) {
		titleContent.after(badge);
	} else {
		titleEl.appendChild(badge);
	}
	return true;
}

/**
 * Update counts on all currently-visible badges.
 * Called after vault create/delete to refresh numbers.
 */
function refreshAllBadges(app: App, containerEl: HTMLElement, directOnly: boolean): void {
	const selector = '.' + BADGE_CLASS;
	const badges = containerEl.querySelectorAll<HTMLElement>(selector);
	badges.forEach((badge) => {
		const titleEl = badge.closest('.nav-folder-title');
		if (!(titleEl instanceof HTMLElement)) return;
		ensureBadge(app, titleEl, directOnly);
	});
}

/* ------------------------------------------------------------------ */
/*  Deferred badge processor                                           */
/* ------------------------------------------------------------------ */

/** Pending titles that need badge creation (data-path not yet ready). */
type PendingBatch = {
	titles: Set<HTMLElement>;
	retryCount: number;
};

/**
 * Process a batch of pending folder titles.
 * Returns titles whose data-path is still missing so caller can retry.
 */
function processBatch(
	app: App,
	batch: PendingBatch,
	directOnly: boolean,
): HTMLElement[] {
	const missed: HTMLElement[] = [];
	for (const title of batch.titles) {
		if (!title.isConnected) continue;
		if (!ensureBadge(app, title, directOnly)) {
			missed.push(title);
		}
	}
	return missed;
}

/* ------------------------------------------------------------------ */
/*  Lifecycle                                                          */
/* ------------------------------------------------------------------ */

/**
 * Register the directory file-count feature.
 *
 * - Finds the file-explorer leaf on layout-ready (with retry)
 * - Uses MutationObserver + attributes to catch folder titles
 * - Defers badge creation via setTimeout(0) + 50ms retry for React timing
 * - Listens to vault create/delete events to keep counts live
 * - Re-attaches on layout-change (sidebar recreate)
 * - Removes badges on plugin unload
 */
export function registerDirFileCount(
	plugin: Plugin,
	enabled: () => boolean,
	directOnly: () => boolean,
): { forceRefresh: () => void } {
	const { app } = plugin;

	let containerEl: HTMLElement | null = null;
	let observer: MutationObserver | null = null;

	/* ---- locate file-explorer container ---- */

	const findContainer = (): boolean => {
		const leaves = app.workspace.getLeavesOfType('file-explorer');
		if (!leaves.length) return false;
		const leaf = leaves[0];
		if (!leaf) return false;
		containerEl = leaf.view.containerEl;
		return true;
	};

	/* ---- deferred batch processing ---- */

	let deferredTimer: number | null = null;
	let retryTimer: number | null = null;

	const clearDeferred = (): void => {
		if (deferredTimer !== null) {
			window.clearTimeout(deferredTimer);
			deferredTimer = null;
		}
		if (retryTimer !== null) {
			window.clearTimeout(retryTimer);
			retryTimer = null;
		}
	};

	/**
	 * Schedule a batch for deferred processing.
	 * Phase 1 (setTimeout 0): try immediately after React commits.
	 * Phase 2 (setTimeout 50ms): retry elements whose data-path still missing.
	 */
	const scheduleBatch = (titles: Set<HTMLElement>): void => {
		if (titles.size === 0) return;

		// Cancel any pending deferred timer — new batch supersedes it
		if (deferredTimer !== null) window.clearTimeout(deferredTimer);

		deferredTimer = window.setTimeout(() => {
			deferredTimer = null;
			if (!listEnhancerConfig.showDirFileCount) return;

			const missed = processBatch(
				app,
				{ titles, retryCount: 0 },
				directOnly(),
			);

			// Phase 2: retry stragglers after 50ms
			if (missed.length > 0) {
				if (retryTimer !== null) window.clearTimeout(retryTimer);
				retryTimer = window.setTimeout(() => {
					retryTimer = null;
					if (!listEnhancerConfig.showDirFileCount) return;
					const isDirect = directOnly();
					for (const title of missed) {
						if (title.isConnected) ensureBadge(app, title, isDirect);
					}
				}, 50);
			}
		}, 0);
	};

	/* ---- mutation observer ---- */

	const startObserver = (): void => {
		if (!containerEl) return;
		stopObserver();

		observer = new MutationObserver((mutations) => {
			if (!listEnhancerConfig.showDirFileCount) return;

			const batch = new Set<HTMLElement>();

			for (const mutation of mutations) {
				/* ---- childList: new nodes entering the DOM ---- */
				for (const node of mutation.addedNodes) {
					if (!(node instanceof HTMLElement)) continue;

					if (node.matches('.nav-folder-title')) {
						batch.add(node);
					}

					const nested = node.querySelectorAll<HTMLElement>(
						'.nav-folder-title',
					);
					nested.forEach((title) => batch.add(title));
				}

				/* ---- attributes: folder expanded (is-collapsed removed) ----
				 * Virtual scrolling keeps children in DOM with display:none;
				 * expanding only toggles a class, so childList never fires. */
				if (
					mutation.type === 'attributes' &&
					mutation.attributeName === 'class' &&
					mutation.target instanceof HTMLElement &&
					mutation.target.matches('.nav-folder')
				) {
					const wasCollapsed = mutation.target.classList.contains('is-collapsed');
					if (!wasCollapsed) {
						const nested = mutation.target.querySelectorAll<HTMLElement>(
							'.nav-folder-title',
						);
						nested.forEach((title) => batch.add(title));
					}
				}
			}

			scheduleBatch(batch);
		});

		observer.observe(containerEl, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['class'],
		});
	};

	const stopObserver = (): void => {
		if (observer) {
			observer.disconnect();
			observer = null;
		}
		clearDeferred();
	};

	/* ---- debounced count refresh (vault events) ---- */

	let updateTimer: number | null = null;
	const scheduleUpdate = (): void => {
		if (!containerEl) return;
		if (updateTimer) window.clearTimeout(updateTimer);
		updateTimer = window.setTimeout(() => {
			updateTimer = null;
			if (!containerEl) return;
			if (!listEnhancerConfig.showDirFileCount) {
				removeAllBadges(containerEl);
				return;
			}
			refreshAllBadges(app, containerEl, directOnly());
		}, 200);
	};

	/* ---- initial full scan (RAF loop for React virtual scrolling) ---- */

	let initRetries = 0;
	const initFullScan = (): void => {
		if (!containerEl || !listEnhancerConfig.showDirFileCount) return;
		removeAllBadges(containerEl);
		const isDirect = directOnly();
		const titles = containerEl.querySelectorAll<HTMLElement>(
			'.nav-folder-title',
		);
		for (const title of titles) {
			ensureBadge(app, title, isDirect);
		}
		if (initRetries++ < 6) {
			window.requestAnimationFrame(initFullScan);
		} else {
			initRetries = 0;
		}
	};

	/* ---- setup ---- */

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
					startObserver();
					initFullScan();
				}
			}, 500);
			return;
		}
		startObserver();
		initFullScan();
	});

	/* ---- re-attach on layout-change ---- */

	plugin.registerEvent(
		app.workspace.on('layout-change', () => {
			stopObserver();
			containerEl = null;
			if (findContainer()) {
				startObserver();
				initFullScan();
			}
		}),
	);

	/* ---- vault events ---- */

	plugin.registerEvent(
		app.vault.on('create', () => scheduleUpdate()),
	);
	plugin.registerEvent(
		app.vault.on('delete', () => scheduleUpdate()),
	);

	/* ---- cleanup ---- */

	plugin.register(() => {
		stopObserver();
		if (containerEl) removeAllBadges(containerEl);
	});

	/* ---- forceRefresh (settings change) ---- */

	const forceRefresh = (): void => {
		if (!containerEl) return;
		if (!listEnhancerConfig.showDirFileCount) {
			removeAllBadges(containerEl);
			return;
		}
		const isDirect = directOnly();
		const titles = containerEl.querySelectorAll<HTMLElement>(
			'.nav-folder-title',
		);
		for (const title of titles) {
			ensureBadge(app, title, isDirect);
		}
	};

	return { forceRefresh };
}
