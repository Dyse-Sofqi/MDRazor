/**
 * MDRazor — Vertical Tabs
 *
 * Integrates tab management into the file-explorer sidebar:
 *   A. Toggle button in nav-buttons-container (arrow-left-right icon)
 *   B. Close buttons on file titles whose tabs are open
 *   C. Tabs-only view: hide inactive files and empty folders, expand
 *      ancestor directories of active files
 */

import { type Plugin, TFile, setIcon } from 'obsidian';
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, obsidianmd/prefer-instanceof, @typescript-eslint/no-unnecessary-type-assertion */

/* ------------------------------------------------------------------ */
/*  File-explorer view shape (same pattern as dir-focus.ts)            */
/* ------------------------------------------------------------------ */

interface FileExplorerItem {
	file: TFile;
	setCollapsed(collapsed: boolean): void;
}

interface FileExplorerView {
	fileItems: Map<string, FileExplorerItem> | Record<string, FileExplorerItem>;
	requestUpdate?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Lifecycle                                                          */
/* ------------------------------------------------------------------ */

export function registerVerticalTabs(
	plugin: Plugin,
	enabled: () => boolean,
	isViewActive: () => boolean,
	setViewActive: (active: boolean) => void,
): void {
	const { app } = plugin;

	let containerEl: HTMLElement | null = null;
	let observer: MutationObserver | null = null;
	let toggleBtn: HTMLElement | null = null;
	const doc = app.workspace.containerEl.ownerDocument;

	/* ---- locate file-explorer container ---- */

	const findContainer = (): boolean => {
		const leaves = app.workspace.getLeavesOfType('file-explorer');
		if (!leaves.length) return false;
		const leaf = leaves[0];
		if (!leaf) return false;
		containerEl = leaf.view.containerEl;
		return true;
	};

	/* ---- helpers ---- */

	const getOpenFilePaths = (): Set<string> => {
		const paths = new Set<string>();
		app.workspace.iterateAllLeaves((leaf: any) => {
			// Fast path: view already loaded
			const file = leaf.view?.file;
			if (file instanceof TFile) {
				paths.add(file.path);
				return;
			}
			// Fallback: view state has file path even before view loads
			// Covers inactive tabs restored on startup where .view is null
			try {
				const vs = leaf.getViewState?.();
				if (vs?.state?.file && typeof vs.state.file === 'string') {
					paths.add(vs.state.file);
				}
			} catch { /* leaf not ready */ }
		});
		return paths;
	};

	const getFileItem = (
		view: FileExplorerView,
		path: string,
	): FileExplorerItem | undefined => {
		const items = view.fileItems;
		if (items instanceof Map) return items.get(path);
		return (items as Record<string, FileExplorerItem>)[path];
	};

	/* ---- close button factory (avoids duplication) ---- */

	const buildCloseBtn = (path: string): HTMLElement => {
		const btn = doc.createElement('span');
		btn.className = 'mdr-vertical-tab-close';
		setIcon(btn, 'x');
		btn.setAttribute('aria-label', '关闭标签页');
		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			e.preventDefault();
			closeTab(path);
		});
		return btn;
	};

	const addCloseBtnToTitle = (title: HTMLElement, path: string): void => {
		if (!title.querySelector('.mdr-vertical-tab-close')) {
			title.appendChild(buildCloseBtn(path));
		}
	};

	/* ---- A: toggle button ---- */

	const injectToggleButton = (): void => {
		if (!containerEl) return;
		const navButtons = containerEl.querySelector('.nav-buttons-container');
		if (!navButtons) return;

		const existing = navButtons.querySelector('.mdr-vertical-tabs-toggle');
		if (existing) existing.remove();

		if (!enabled()) return;

		const btn = doc.createElement('div');
		btn.className = 'clickable-icon nav-action-button mdr-vertical-tabs-toggle';
		if (isViewActive()) btn.classList.add('is-active');
		btn.setAttribute('aria-label', '切换标签页视图');
		setIcon(btn, 'arrow-left-right');
		btn.addEventListener('click', () => {
			const next = !isViewActive();
			setViewActive(next);
			btn.classList.toggle('is-active', next);
			applyViewState();
		});
		navButtons.appendChild(btn);
		toggleBtn = btn;
	};

	/* ---- B: close buttons ---- */

	const closeTab = (path: string): void => {
		app.workspace.iterateAllLeaves((leaf: any) => {
			if (leaf.view?.file?.path === path) {
				leaf.detach();
				return;
			}
			// Pseudo tab: view not loaded, match via view state
			if (!leaf.view?.file) {
				try {
					const vs = leaf.getViewState?.();
					if (vs?.state?.file === path) {
						leaf.detach();
					}
				} catch { /* leaf not ready */ }
			}
		});
	};

	const ensureCloseButtons = (): void => {
		if (!containerEl || !enabled()) return;
		const openPaths = getOpenFilePaths();
		const fileTitles = containerEl.querySelectorAll<HTMLElement>('.nav-file-title');

		fileTitles.forEach((title) => {
			const path = title.getAttribute('data-path');
			if (!path) return;
			const existing = title.querySelector('.mdr-vertical-tab-close');
			if (openPaths.has(path)) {
				if (!existing) title.appendChild(buildCloseBtn(path));
			} else {
				if (existing) existing.remove();
			}
		});
	};

	const removeAllCloseButtons = (): void => {
		if (!containerEl) return;
		containerEl
			.querySelectorAll('.mdr-vertical-tab-close')
			.forEach((el) => el.remove());
	};

	/* ---- C: view toggle + class marks ---- */

	/**
	 * Force file explorer virtual scroller to recalculate by collapsing
	 * then re-expanding ALL folders. Fixes scroll corruption from
	 * virtual-scroller measurement on collapsed/display-none elements.
	 */
	const forceExplorerRefresh = (): void => {
		const leaves = app.workspace.getLeavesOfType('file-explorer');
		if (!leaves.length || !leaves[0]) return;
		const view = leaves[0].view as unknown as FileExplorerView;

		const items = view.fileItems;
		const entries: Array<[string, FileExplorerItem]> =
			items instanceof Map ? Array.from(items.entries()) : Object.entries(items);

		// Collapse every item that could be a folder
		const collapsed: string[] = [];
		for (const [p, item] of entries) {
			const af = app.vault.getAbstractFileByPath(p);
			if (!af) continue;
			try { item.setCollapsed(true); collapsed.push(p); } catch { /* skip */ }
		}
		// Re-expand — forces scroller recalc
		for (const p of collapsed) {
			const item = getFileItem(view, p);
			if (item) {
				try { item.setCollapsed(false); } catch { /* skip */ }
			}
		}
		view.requestUpdate?.();
	};

	/**
	 * Collapse folders that are NOT ancestors of open files.
	 * Removes their children from the DOM so virtual scroller
	 * measurements are accurate — avoids the display:none layout
	 * collapse that corrupts scroll height.
	 */
	const collapseNonAncestors = (): void => {
		const leaves = app.workspace.getLeavesOfType('file-explorer');
		if (!leaves.length || !leaves[0]) return;
		const view = leaves[0].view as unknown as FileExplorerView;

		const openPaths = getOpenFilePaths();
		const ancestorPaths = getAncestorPaths(openPaths);

		const items = view.fileItems;
		const entries = items instanceof Map ? Array.from(items.entries()) : Object.entries(items);
		for (const [p, item] of entries) {
			const af = app.vault.getAbstractFileByPath(p);
			if (!af) continue;
			if (ancestorPaths.has(p)) continue;
			try { item.setCollapsed(true); } catch { /* skip */ }
		}
	};

	/**
	 * Expand ancestor folders of all open files so their file titles
	 * are present in the DOM before we try to mark them.
	 */
	const expandAncestors = (): void => {
		const leaves = app.workspace.getLeavesOfType('file-explorer');
		if (!leaves.length || !leaves[0]) return;
		const view = leaves[0].view as unknown as FileExplorerView;

		const openPaths = getOpenFilePaths();
		for (const path of openPaths) {
			const file = app.vault.getAbstractFileByPath(path);
			if (file) {
				let parent = file.parent;
				while (parent && !parent.isRoot()) {
					const item = getFileItem(view, parent.path);
					if (item) {
						try { item.setCollapsed(false); } catch { /* skip */ }
					}
					parent = parent.parent;
				}
			}
		}
		view.requestUpdate?.();
	};

	/**
	 * Compute ancestor folder paths of all open files from vault tree.
	 */
	const getAncestorPaths = (openPaths: Set<string>): Set<string> => {
		const paths = new Set<string>();
		for (const path of openPaths) {
			const file = app.vault.getAbstractFileByPath(path);
			if (file) {
				let parent = file.parent;
				while (parent && !parent.isRoot()) {
					paths.add(parent.path);
					parent = parent.parent;
				}
			}
		}
		return paths;
	};

	const refreshClassMarks = (): void => {
		if (!containerEl) return;
		const openPaths = getOpenFilePaths();

		// Expand ancestors FIRST so file titles appear in DOM
		if (isViewActive()) {
			expandAncestors();
			collapseNonAncestors();
		}

		// Mark file titles
		const fileTitles = containerEl.querySelectorAll<HTMLElement>('.nav-file-title');
		fileTitles.forEach((title) => {
			const path = title.getAttribute('data-path');
			if (path && openPaths.has(path)) {
				title.classList.add('mdr-vertical-tab-active');
			} else {
				title.classList.remove('mdr-vertical-tab-active');
			}
		});

		// Mark folder containers using pre-computed ancestor paths.
		const ancestorPaths = getAncestorPaths(openPaths);
		const folderTitles = containerEl.querySelectorAll<HTMLElement>('.nav-folder-title');
		folderTitles.forEach((folder) => {
			const folderEl = folder.closest('.nav-folder');
			if (!folderEl) return;
			let path = folder.getAttribute('data-path');
			if (!path) path = folderEl.getAttribute('data-path');
			if (path && ancestorPaths.has(path)) {
				folderEl.classList.add('mdr-vertical-tab-has-active');
			} else {
				folderEl.classList.remove('mdr-vertical-tab-has-active');
			}
		});

		// Re-mark folders for any newly rendered file titles
		const activeTitles = containerEl.querySelectorAll<HTMLElement>('.nav-file-title.mdr-vertical-tab-active');
		activeTitles.forEach((title) => {
			let el: Element | null = title.closest('.nav-folder');
			while (el) {
				if (!el.classList.contains('mdr-vertical-tab-has-active')) {
					el.classList.add('mdr-vertical-tab-has-active');
				}
				el = el.parentElement?.closest('.nav-folder') ?? null;
			}
		});
	};

	const applyViewState = (): void => {
		if (!containerEl) return;

		if (!enabled() || !isViewActive()) {
			containerEl.classList.remove('mdr-vertical-tabs-view');
			forceExplorerRefresh();
			return;
		}

		forceExplorerRefresh();
		refreshClassMarks();
		containerEl.classList.add('mdr-vertical-tabs-view');

		// Retry: Obsidian renders expanded folders asynchronously.
		let retries = 0;
		const retry = (): void => {
			if (retries++ >= 8 || !containerEl || !isViewActive()) return;
			refreshClassMarks();
			window.requestAnimationFrame(retry);
		};
		window.requestAnimationFrame(retry);
	};

	/* ---- mutation observer (handle folder expand/collapse) ---- */

	const startObserver = (): void => {
		if (!containerEl) return;
		if (observer) observer.disconnect();

		observer = new MutationObserver((mutations) => {
			if (!enabled()) return;
			const openPaths = getOpenFilePaths();
			const ancestorPaths = getAncestorPaths(openPaths);
			for (const mutation of mutations) {
				const addedNodes = Array.from(mutation.addedNodes);
				for (const node of addedNodes) {
					if (!(node instanceof HTMLElement)) continue;
					const candidates = node.classList.contains('nav-file-title')
						? [node as HTMLElement]
						: Array.from(node.querySelectorAll<HTMLElement>('.nav-file-title'));
					for (const title of candidates) {
						const path = title.getAttribute('data-path');
						if (!path) continue;
						if (openPaths.has(path)) {
							addCloseBtnToTitle(title, path);
							if (isViewActive()) title.classList.add('mdr-vertical-tab-active');
						}
					}
					// Mark ancestor folders for all added nodes containing nav-folder
					if (isViewActive() && (node instanceof HTMLElement)) {
						const newFolders = node.classList.contains('nav-folder')
							? [node]
							: Array.from(node.querySelectorAll<HTMLElement>('.nav-folder'));
						for (const folderEl of newFolders) {
							const path = folderEl.getAttribute('data-path');
							if (path && ancestorPaths.has(path)) {
								folderEl.classList.add('mdr-vertical-tab-has-active');
							}
						}
					}
				}
			}
		});

		observer.observe(containerEl, {
			childList: true,
			subtree: true,
		});
	};

	/* ---- leaf change listener ---- */

	const onLeafChange = (): void => {
		if (!containerEl || !enabled()) return;
		ensureCloseButtons();
		if (isViewActive()) {
			applyViewState();
		}
	};

	/* ---- attach / detach ---- */

	const syncAll = (): void => {
		ensureCloseButtons();
		refreshClassMarks();
		applyViewState();
	};

	const attach = (): void => {
		if (!containerEl) return;
		startObserver();
		injectToggleButton();

		// Initial pass
		syncAll();

		// Retry: ancestor folder expansion may render file titles asynchronously
		let retries = 0;
		const retryInterval = window.setInterval(() => {
			if (retries++ >= 3) {
				window.clearInterval(retryInterval);
				return;
			}
			syncAll();
		}, 200);

		// Stop retrying once all open files have their close buttons in DOM
		const stopChecker = window.setInterval(() => {
			const openPaths = getOpenFilePaths();
			if (openPaths.size === 0) {
				window.clearInterval(stopChecker);
				window.clearInterval(retryInterval);
				return;
			}
			let allFound = true;
			for (const path of openPaths) {
				if (!containerEl?.querySelector(`.nav-file-title[data-path="${path}"] .mdr-vertical-tab-close`)) {
					allFound = false;
					break;
				}
			}
			if (allFound) {
				window.clearInterval(retryInterval);
				window.clearInterval(stopChecker);
			}
		}, 200);
	};

	const detach = (): void => {
		if (observer) {
			observer.disconnect();
			observer = null;
		}
		removeAllCloseButtons();
		if (toggleBtn) {
			toggleBtn.remove();
			toggleBtn = null;
		}
		if (containerEl) {
			containerEl.classList.remove('mdr-vertical-tabs-view');
		}
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

	/* ---- update close buttons + view on active-leaf-change ---- */

	plugin.registerEvent(
		app.workspace.on('active-leaf-change', () => {
			onLeafChange();
		}),
	);

	/* ---- cleanup on unload ---- */

	plugin.register(() => detach());
}
