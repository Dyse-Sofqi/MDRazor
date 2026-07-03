/**
 * MDRazor - Vertical Tabs
 *
 * Integrates tab management into the file-explorer sidebar:
 *   A. Toggle button in nav-buttons-container (arrow-left-right icon)
 *   B. Close buttons on file titles whose tabs are open
 *   C. Tabs-only view: hide inactive files and empty folders, expand
 *      ancestor directories of active files
 */

import { type Plugin, type WorkspaceLeaf, TFolder, TFile, setIcon } from 'obsidian';

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

/* ---- cross-window-safe type guard ---- */

const isHTMLElement = (n: Node): n is HTMLElement => n.nodeType === Node.ELEMENT_NODE;

/* ------------------------------------------------------------------ */
/*  Lifecycle                                                          */
/* ------------------------------------------------------------------ */

export function registerVerticalTabs(
	plugin: Plugin,
	enabled: () => boolean,
	isViewActive: () => boolean,
	setViewActive: (active: boolean) => void,
): void {
	if (!enabled()) return;
	const { app } = plugin;

	let containerEl: HTMLElement | null = null;
	let observer: MutationObserver | null = null;
	let toggleBtn: HTMLElement | null = null;
	let savedFolderStates: Map<string, boolean> | null = null;
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
		app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
			/* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- leaf.view untyped generic obsidian API */
			const file = (leaf.view as { file?: TFile })?.file;
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
		app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
			/* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- leaf.view generic obsidian type, .path exists at runtime */
			if ((leaf.view as { file?: { path: string } })?.file?.path === path) {
				leaf.detach();
				return;
			}
			// Pseudo tab: view not loaded, match via view state
			if (!(leaf.view as { file?: unknown })?.file) {
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
	 * Request virtual-scroller recalc. No collapse-all hammer needed;
	 * refreshClassMarks handles folder collapsing separately.
	 */
	const forceExplorerRefresh = (): void => {
		const leaves = app.workspace.getLeavesOfType('file-explorer');
		if (!leaves.length || !leaves[0]) return;
		const view = leaves[0].view as unknown as FileExplorerView;
		view.requestUpdate?.();
	};

	/**
	 * Single-pass expand ancestors + collapse non-ancestors.
	 * Called only after file titles confirmed in DOM.
	 */
	const syncFolderStates = (): void => {
		const leaves = app.workspace.getLeavesOfType('file-explorer');
		if (!leaves.length || !leaves[0]) return;
		const view = leaves[0].view as unknown as FileExplorerView;

		const ancestorPaths = getAncestorPaths(getOpenFilePaths());
		const items = view.fileItems;
		const entries = items instanceof Map ? Array.from(items.entries()) : Object.entries(items);
		for (const [p, item] of entries) {
			const af = app.vault.getAbstractFileByPath(p);
			if (!af) continue;
			const expand = ancestorPaths.has(p);
			try { item.setCollapsed(!expand); } catch { /* skip */ }
		}
		view.requestUpdate?.();
	};

	/**
	 * Wait until all target file-title elements appear in DOM, or timeout.
	 */
	const waitForFileTitles = (paths: Set<string>, timeout = 1500): Promise<void> => {
		if (!containerEl || paths.size === 0) return Promise.resolve();
		const found = (): boolean => {
			for (const p of paths) {
				if (!containerEl!.querySelector(`.nav-file-title[data-path="${CSS.escape(p)}"]`)) return false;
			}
			return true;
		};
		if (found()) return Promise.resolve();
		return new Promise((resolve) => {
			const mo = new MutationObserver(() => { if (found()) { mo.disconnect(); resolve(); } });
			mo.observe(containerEl!, { childList: true, subtree: true });
			window.setTimeout(() => { mo.disconnect(); resolve(); }, timeout);
		});
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

	const collapseAllFolders = (): void => {
		const leaves = app.workspace.getLeavesOfType('file-explorer');
		if (!leaves.length || !leaves[0]) return;
		const view = leaves[0].view as unknown as FileExplorerView;
		const items = view.fileItems;
		const entries = items instanceof Map ? Array.from(items.entries()) : Object.entries(items);
		for (const [p, item] of entries) {
			const af = app.vault.getAbstractFileByPath(p);
			if (!af || (af instanceof TFolder && af.isRoot())) continue;
			try { item.setCollapsed(true); } catch { /* skip */ }
		}
		view.requestUpdate?.();
	};

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

	/* ---- save/restore folder states on view toggle ---- */
	const saveCurrentFolderStates = (): void => {
		savedFolderStates = new Map();
		if (!containerEl) return;
		const folderEls = containerEl.querySelectorAll<HTMLElement>('.nav-folder');
		folderEls.forEach((folderEl) => {
			const path = folderEl.getAttribute('data-path');
			if (path) savedFolderStates!.set(path, folderEl.classList.contains('is-collapsed'));
		});
	};

	const restoreFolderStates = (): void => {
		if (!savedFolderStates || savedFolderStates.size === 0) return;
		const leaves = app.workspace.getLeavesOfType('file-explorer');
		if (!leaves.length || !leaves[0]) return;
		const view = leaves[0].view as unknown as FileExplorerView;
		const items = view.fileItems;
		for (const [path, collapsed] of savedFolderStates) {
			const item = items instanceof Map ? items.get(path) : items[path];
			if (item) {
				try { item.setCollapsed(collapsed); } catch { /* skip */ }
			}
		}
		view.requestUpdate?.();
		savedFolderStates.clear();
	};

	const applyViewState = (): void => {
		if (!containerEl) return;

		/* save scroll position before DOM-altering ops */
		const scroller = containerEl.querySelector('.nav-files-container');
		const savedScrollTop = scroller?.scrollTop ?? 0;

		if (!enabled() || !isViewActive()) {
			const wasActive = containerEl.classList.contains('mdr-vertical-tabs-view');
			containerEl.classList.remove('mdr-vertical-tabs-view');
			if (wasActive) restoreFolderStates();
			return;
		}

		saveCurrentFolderStates();
		forceExplorerRefresh();
		containerEl.classList.add('mdr-vertical-tabs-view');

		// Single-pass expand ancestors + collapse non-ancestors, then wait
		// for file titles to appear in DOM before marking.
		const openPaths = getOpenFilePaths();
		if (openPaths.size === 0) {
			refreshClassMarks();
			collapseAllFolders();
			window.requestAnimationFrame(() => {
				if (scroller) scroller.scrollTop = 0;
			});
			return;
		}
		syncFolderStates();

		waitForFileTitles(openPaths).then(() => {
			if (!containerEl || !isViewActive()) return;
			refreshClassMarks();
			window.requestAnimationFrame(() => {
				if (scroller) scroller.scrollTop = savedScrollTop;
			});
		}).catch(() => { });
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
					if (!isHTMLElement(node)) continue;
					const candidates = node.classList.contains('nav-file-title')
						? [node]
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
					if (isViewActive() && isHTMLElement(node)) {
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
	};

	const attach = (): void => {
		if (!containerEl) return;
		startObserver();
		injectToggleButton();

		// Initial pass
		syncAll();
		if (isViewActive()) {
			applyViewState();
		}

		// One async follow-up - observer handles rest
		window.requestAnimationFrame(() => {
			if (containerEl && isViewActive()) {
				ensureCloseButtons();
				refreshClassMarks();
			}
		});
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
