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
			const file = leaf.view?.file;
			if (file instanceof TFile) {
				paths.add(file.path);
			}
		});
		return paths;
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

	const getFileItem = (
		view: FileExplorerView,
		path: string,
	): FileExplorerItem | undefined => {
		const items = view.fileItems;
		if (items instanceof Map) return items.get(path);
		return (items as Record<string, FileExplorerItem>)[path];
	};

	/* ---- A: toggle button ---- */

	const injectToggleButton = (): void => {
		if (!containerEl) return;
		const navButtons = containerEl.querySelector('.nav-buttons-container');
		if (!navButtons) return;

		// Remove existing if any
		const existing = navButtons.querySelector('.mdr-vertical-tabs-toggle');
		if (existing) existing.remove();

		if (!enabled()) return;

		const btn = document.createElement('div');
		btn.className = 'clickable-icon nav-action-button mdr-vertical-tabs-toggle';
		btn.setAttribute('aria-label', '切换标签页视图');
		setIcon(btn, 'arrow-left-right');
		btn.addEventListener('click', () => {
			setViewActive(!isViewActive());
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
			}
		});
	};

	const addCloseBtnToTitle = (title: HTMLElement, path: string): void => {
		if (!title.querySelector('.mdr-vertical-tab-close')) {
			title.appendChild(buildCloseBtn(path));
		}
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

	const refreshClassMarks = (): void => {
		if (!containerEl) return;
		const openPaths = getOpenFilePaths();

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

		// Mark folder titles that contain active files
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

		// Expand ancestor folders of active files when in tabs view
		if (isViewActive()) {
			const leaves = app.workspace.getLeavesOfType('file-explorer');
			if (leaves.length && leaves[0]) {
				const view = leaves[0].view as unknown as FileExplorerView;
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
			}
		}
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
					// Scan the added node and its descendants for file titles
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
			refreshClassMarks();
			applyViewState();
		}
	};

	/* ---- attach / detach ---- */

	const attach = (): void => {
		if (!containerEl) return;
		injectToggleButton();
		ensureCloseButtons();
		applyViewState();
		startObserver();
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
