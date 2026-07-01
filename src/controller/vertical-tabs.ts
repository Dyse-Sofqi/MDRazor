/**
 * MDRazor — Vertical Tabs
 *
 * Integrates tab management into the file-explorer sidebar:
 *   A. Toggle button in nav-buttons-container (arrow-left-right icon)
 *   B. Close buttons on file titles whose tabs are open
 *   C. Tabs-only view: hide inactive files and empty folders, expand
 *      ancestor directories of active files
 */

import { type App, type Plugin, TFile, setIcon } from 'obsidian';

/* ------------------------------------------------------------------ */
/*  File-explorer view shape (same pattern as dir-focus.ts)            */
/* ------------------------------------------------------------------ */

interface FileExplorerItem {
	file: TFile | any;
	setCollapsed(collapsed: boolean): void;
}

interface FileExplorerView {
	fileItems: Map<string, FileExplorerItem> | Record<string, FileExplorerItem>;
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
		const btn = document.createElement('span');
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

	const syncToggleActive = (): void => {
		if (!toggleBtn) return;
		toggleBtn.classList.toggle('is-active', isViewActive());
	};

	const injectToggleButton = (): void => {
		if (!containerEl) return;
		const navButtons = containerEl.querySelector('.nav-buttons-container');
		if (!navButtons) return;

		const existing = navButtons.querySelector('.mdr-vertical-tabs-toggle');
		if (existing) existing.remove();

		if (!enabled()) return;

		const btn = document.createElement('div');
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
					if (item) item.setCollapsed(false);
					parent = parent.parent;
				}
			}
		}
	};

	const refreshClassMarks = (): void => {
		if (!containerEl) return;
		const openPaths = getOpenFilePaths();

		// Expand ancestors FIRST so file titles appear in DOM
		if (isViewActive()) expandAncestors();

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

		// Mark folder containers that contain active files
		const folderTitles = containerEl.querySelectorAll<HTMLElement>('.nav-folder-title');
		folderTitles.forEach((folder) => {
			const folderEl = folder.closest('.nav-folder');
			if (folderEl) {
				const hasActive = folderEl.querySelector('.nav-file-title.mdr-vertical-tab-active');
				if (hasActive) {
					folderEl.classList.add('mdr-vertical-tab-has-active');
				} else {
					folderEl.classList.remove('mdr-vertical-tab-has-active');
				}
			}
		});
	};

	const applyViewState = (): void => {
		if (!containerEl) return;

		if (!enabled() || !isViewActive()) {
			containerEl.classList.remove('mdr-vertical-tabs-view');
			return;
		}

		refreshClassMarks();
		containerEl.classList.add('mdr-vertical-tabs-view');
	};

	/* ---- mutation observer (handle folder expand/collapse) ---- */

	const startObserver = (): void => {
		if (!containerEl) return;
		if (observer) observer.disconnect();

		observer = new MutationObserver((mutations) => {
			if (!enabled()) return;
			const openPaths = getOpenFilePaths();
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

		// Retry: ancestor folder expansion may render file titles asynchronously,
		// especially on restart when Obsidian restores leaves before file explorer DOM
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
