/**
 * MDRazor — Directory File Count
 *
 * Show file/folder count badge on each folder in the file explorer.
 * Counts direct children only (sub-folders + files, excluding files inside sub-folders).
 * The count is displayed right-aligned on the folder title, before the collapse icon.
 *
 * CSS lives in styles.css (Obsidian loads it for us — no runtime <style> injection).
 */

import { App, Plugin, TFolder } from 'obsidian';
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

/** Remove all count badges from the file-explorer container. */
function removeAllBadges(containerEl: HTMLElement): void {
	const selector = '.' + BADGE_CLASS;
	containerEl.querySelectorAll(selector).forEach((el) => el.remove());
}

/**
 * Update count badges for all folders in the file explorer.
 * If the feature is disabled, remove all badges.
 */
function updateCounts(app: App, containerEl: HTMLElement): void {
	if (!listEnhancerConfig.showDirFileCount) {
		removeAllBadges(containerEl);
		return;
	}

	const selector = '.' + BADGE_CLASS;
	const folderTitles = containerEl.querySelectorAll(
		'.nav-folder-title[data-path]',
	);
	folderTitles.forEach((el) => {
		const titleEl = el as HTMLElement;
		const path = titleEl.getAttribute('data-path');
		if (!path) return;

		const abstractFile = app.vault.getAbstractFileByPath(path);
		if (!(abstractFile instanceof TFolder)) return;

		const count = getDirectChildCount(abstractFile);

		// Update existing badge or create new one
		let badge = titleEl.querySelector(selector);
		if (badge) {
			badge.textContent = '' + count;
			return;
		}

		badge = document.createElement('span');
		badge.className = BADGE_CLASS;
		badge.textContent = '' + count;

		// Insert after .nav-folder-title-content so badge appear right after folder name,
		// before any collapse icon (handles both old and new Obsidian DOM order).
		const titleContent = titleEl.querySelector('.nav-folder-title-content');
		if (titleContent && titleContent.parentElement === titleEl) {
			titleContent.after(badge);
		} else {
			titleEl.appendChild(badge);
		}
	});
}

/* ------------------------------------------------------------------ */
/*  Lifecycle                                                          */
/* ------------------------------------------------------------------ */

/**
 * Register the directory file-count feature.
 *
 * - Finds the file-explorer leaf on layout-ready (with retry)
 * - Re-attaches on layout-change (sidebar recreate)
 * - Listens to vault create/delete events to keep counts live
 * - Removes badges on plugin unload
 */
export function registerDirFileCount(
	plugin: Plugin,
	enabled: () => boolean,
): void {
	const { app } = plugin;

	let containerEl: HTMLElement | null = null;

	/* ---- locate file-explorer container ---- */

	const findContainer = (): boolean => {
		const leaves = app.workspace.getLeavesOfType('file-explorer');
		if (!leaves.length) return false;
		const leaf = leaves[0];
		if (!leaf) return false;
		containerEl = leaf.view.containerEl;
		return true;
	};

	/* ---- debounced update ---- */

	let updateTimer: number | null = null;
	const scheduleUpdate = (): void => {
		if (!containerEl) return;
		if (updateTimer) window.clearTimeout(updateTimer);
		updateTimer = window.setTimeout(() => {
			updateTimer = null;
			updateCounts(app, containerEl!);
		}, 200);
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
					scheduleUpdate();
				}
			}, 500);
			return;
		}
		scheduleUpdate();
	});

	/* ---- re-attach on layout-change ---- */

	plugin.registerEvent(
		app.workspace.on('layout-change', () => {
			containerEl = null;
			if (findContainer()) scheduleUpdate();
		}),
	);

	/* ---- vault events: live updates on create/delete ---- */

	plugin.registerEvent(
		app.vault.on('create', () => scheduleUpdate()),
	);

	plugin.registerEvent(
		app.vault.on('delete', () => scheduleUpdate()),
	);

	/* ---- cleanup on unload ---- */

	plugin.register(() => {
		if (containerEl) removeAllBadges(containerEl);
	});
}
