/**
 * MDRazor - Vertical Tabs
 *
 * Integrates tab management into the file-explorer sidebar:
 *   A. Toggle button in nav-buttons-container (arrow-left-right icon)
 *   B. Close buttons on file titles whose tabs are open
 *   C. Tabs-only view: custom filtered DOM tree replacing the virtual-scroller
 *      file list. Only open tabs + ancestor folders are rendered. Identical
 *      Obsidian CSS classes — inherits all file-explorer styles automatically.
 *
 * Interaction is delegated via a single capture-phase handler on
 * containerEl.parentElement — fires before dir-focus on containerEl.
 */

import { type Plugin, type WorkspaceLeaf, TFolder, TFile, setIcon, Menu } from 'obsidian';

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
/*  Tree node (custom filtered list)                                    */
/* ------------------------------------------------------------------ */

interface TreeNode {
	type: 'file' | 'folder';
	path: string;
	name: string;
	isOpen: boolean;
	children: TreeNode[];
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
	if (!enabled()) return;
	const { app } = plugin;

	let containerEl: HTMLElement | null = null;
	let toggleBtn: HTMLElement | null = null;
	let customListEl: HTMLElement | null = null;
	const customCollapsed = new Set<string>();
	let leafChangeTimer: number | null = null;
	let captureHandler: ((e: MouseEvent) => void) | null = null;
	let lastActiveFilePath: string | null = null;
	let closeBtnObserver: MutationObserver | null = null;

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
			const file = (leaf.view as { file?: TFile })?.file;
			if (file instanceof TFile) {
				paths.add(file.path);
				return;
			}
			try {
				const vs = leaf.getViewState?.();
				if (vs?.state?.file && typeof vs.state.file === 'string') {
					paths.add(vs.state.file);
				}
			} catch { /* leaf not ready */ }
		});
		return paths;
	};

	const getAncestorPaths = (openPaths: Set<string>): Set<string> => {
		const paths = new Set<string>();
		for (const p of openPaths) {
			const file = app.vault.getAbstractFileByPath(p);
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

	const buildFilteredTree = (openPaths: Set<string>, ancestorPaths: Set<string>): TreeNode[] => {
		return buildChildren(app.vault.getRoot(), openPaths, ancestorPaths);
	};

	const buildChildren = (
		folder: TFolder,
		openPaths: Set<string>,
		ancestorPaths: Set<string>,
	): TreeNode[] => {
		const result: TreeNode[] = [];
		const sorted = [...folder.children].sort((a, b) => {
			const aIsFolder = a instanceof TFolder;
			const bIsFolder = b instanceof TFolder;
			if (aIsFolder && !bIsFolder) return -1;
			if (!aIsFolder && bIsFolder) return 1;
			return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
		});

		for (const child of sorted) {
			if (child instanceof TFile) {
				if (openPaths.has(child.path)) {
					result.push({ type: 'file', path: child.path, name: child.name.replace(/\.[^/.]+$/, ''), isOpen: true, children: [] });
				}
			} else if (child instanceof TFolder) {
				if (ancestorPaths.has(child.path)) {
					result.push({
						type: 'folder',
						path: child.path,
						name: child.name.replace(/\.[^/.]+$/, ''),
						isOpen: false,
						children: buildChildren(child, openPaths, ancestorPaths),
					});
				}
			}
		}
		return result;
	};

	/* ---- close button factory ---- */

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

	/* ---- B: close buttons on native file-list entries ---- */

	const refreshCloseButtons = (): void => {
		if (!containerEl || !enabled()) return;
		// Only touch the real (non-VT) file list
		const realList = containerEl.querySelector<HTMLElement>('.nav-files-container:not(.mdr-vt-custom-list)');
		if (!realList) return;
		const openPaths = getOpenFilePaths();
		realList.querySelectorAll<HTMLElement>('.nav-file-title').forEach((title) => {
			let path = title.getAttribute('data-path');
			if (!path) {
				const navFile = title.closest('.nav-file');
				if (navFile) path = navFile.getAttribute('data-path');
			}
			if (!path) return;
			const existing = title.querySelector('.mdr-vertical-tab-close');
			if (openPaths.has(path)) {
				if (!existing) title.appendChild(buildCloseBtn(path));
			} else {
				if (existing) existing.remove();
			}
		});
	};

	const closeTab = (path: string): void => {
		app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
			if ((leaf.view as { file?: { path: string } })?.file?.path === path) {
				leaf.detach();
				return;
			}
			if (!(leaf.view as { file?: unknown })?.file) {
				try {
					const vs = leaf.getViewState?.();
					if (vs?.state?.file === path) leaf.detach();
				} catch { /* leaf not ready */ }
			}
		});
	};

	/**
	 * Switch to existing tab if file already open, else open in current leaf.
	 * Mirrors tab-enhancer.ts logic exactly.
	 */
	const openOrSwitchTab = (path: string): void => {
		let existingLeaf: WorkspaceLeaf | null = null;
		app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
			const lf = (leaf.view as { file?: TFile })?.file;
			if (lf instanceof TFile && lf.path === path) {
				existingLeaf = leaf;
				return;
			}
			try {
				const vs = leaf.getViewState?.();
				if (vs?.state?.file === path) existingLeaf = leaf;
			} catch { /* skip */ }
		});
		if (existingLeaf) {
			void app.workspace.setActiveLeaf(existingLeaf, { focus: true });
		} else {
			void app.workspace.openLinkText(path, '', false);
		}
	};

	/**
	 * Path of the file currently active in the workspace (displayed tab).
	 * Triggered by leaf-change listener too.
	 */
	const getActiveFilePath = (): string | null => {
		const al = app.workspace.getMostRecentLeaf();
		if (al) {
			const f = (al.view as { file?: TFile })?.file;
			if (f instanceof TFile) return f.path;
			try {
				const vs = al.getViewState?.();
				if (vs?.state?.file && typeof vs.state.file === 'string') return vs.state.file;
			} catch { /* skip */ }
		}
		// Fallback: cache from last known active file. Prevents highlight
		// loss when sidebar/blank-area click triggers leaf-change to a
		// non-file leaf (file-explorer, search, etc.).
		return lastActiveFilePath;
	};

	/**
	 * Highlight a file title in custom list by setting is-active class.
	 * Set highlight to null to clear all.
	 */
	const setFileHighlight = (newPath: string | null): void => {
		if (!customListEl) return;
		const oldActive = customListEl.querySelector<HTMLElement>('.tree-item-self.nav-file-title.is-active');
		if (oldActive) oldActive.classList.remove('is-active');

		lastActiveFilePath = newPath;

		if (newPath) {
			const fileEl = customListEl.querySelector<HTMLElement>(
				`.nav-file[data-path="${CSS.escape(newPath)}"] > .tree-item-self.nav-file-title`,
			);
			if (fileEl) fileEl.classList.add('is-active');
		}
	};

	/* ---- C: custom filtered list ---- */

	const renderTreeNode = (node: TreeNode, depth: number, activePath: string | null): HTMLElement => {
		const itemEl = doc.createElement('div');
		itemEl.className = `tree-item ${node.type === 'folder' ? 'nav-folder' : 'nav-file'}`;
		itemEl.setAttribute('data-path', node.path);

		if (node.type === 'folder') {
			const isCollapsed = customCollapsed.has(node.path);
			itemEl.classList.toggle('is-collapsed', isCollapsed);

			const selfEl = doc.createElement('div');
			selfEl.className = 'tree-item-self is-clickable nav-folder-title';

			const chevronEl = doc.createElement('div');
			chevronEl.className = 'tree-item-icon collapse-icon';
			setIcon(chevronEl, isCollapsed ? 'chevron-right' : 'chevron-down');
			selfEl.appendChild(chevronEl);

			const innerEl = doc.createElement('div');
			innerEl.className = 'tree-item-inner nav-folder-title-content';
			innerEl.textContent = node.name;
			selfEl.appendChild(innerEl);

			itemEl.appendChild(selfEl);

			const childrenEl = doc.createElement('div');
			childrenEl.className = 'tree-item-children nav-folder-children';
			for (const child of node.children) {
				childrenEl.appendChild(renderTreeNode(child, depth + 1, activePath));
			}
			itemEl.appendChild(childrenEl);
		} else {
			const selfEl = doc.createElement('div');
			selfEl.className = 'tree-item-self is-clickable nav-file-title';

			if (node.path === activePath) {
				selfEl.classList.add('is-active');
			}

			const innerEl = doc.createElement('div');
			innerEl.className = 'tree-item-inner nav-file-title-content';
			innerEl.textContent = node.name;
			selfEl.appendChild(innerEl);

			if (node.isOpen) {
				itemEl.classList.add('mdr-vertical-tab-active');
				addCloseBtnToTitle(selfEl, node.path);
			}

			itemEl.appendChild(selfEl);
		}

		return itemEl;
	};

	const toggleCustomFolder = (path: string): void => {
		if (!customListEl) return;
		const folderEl = customListEl.querySelector<HTMLElement>(
			`.nav-folder[data-path="${CSS.escape(path)}"]`,
		);
		if (!folderEl) return;

		if (customCollapsed.has(path)) {
			customCollapsed.delete(path);
			folderEl.classList.remove('is-collapsed');
		} else {
			customCollapsed.add(path);
			folderEl.classList.add('is-collapsed');
		}

		const chevron = folderEl.querySelector<HTMLElement>(':scope > .tree-item-self .collapse-icon');
		if (chevron) {
			chevron.empty();
			setIcon(chevron, customCollapsed.has(path) ? 'chevron-right' : 'chevron-down');
		}
	};

	const setAllCustomFolders = (collapsed: boolean): void => {
		if (!customListEl) return;
		const folders = customListEl.querySelectorAll<HTMLElement>('.nav-folder');
		folders.forEach((folderEl) => {
			const path = folderEl.getAttribute('data-path');
			if (!path) return;
			if (collapsed) {
				customCollapsed.add(path);
				folderEl.classList.add('is-collapsed');
			} else {
				customCollapsed.delete(path);
				folderEl.classList.remove('is-collapsed');
			}
			const chevron = folderEl.querySelector<HTMLElement>(':scope > .tree-item-self .collapse-icon');
			if (chevron) {
				chevron.empty();
				setIcon(chevron, collapsed ? 'chevron-right' : 'chevron-down');
			}
		});
	};

	const showContextMenu = (e: MouseEvent, path: string): void => {
		const abstractFile = app.vault.getAbstractFileByPath(path);
		if (!abstractFile) return;
		const menu = new Menu();
		app.workspace.trigger('file-menu', menu, abstractFile, 'file-explorer');
		(menu as unknown as { showAtMouseEvent(e: MouseEvent): void }).showAtMouseEvent(e);
	};

	/* ---- delegated interaction ---- */

	const installCaptureHandler = (): void => {
		if (!containerEl) return;
		removeCaptureHandler();

		captureHandler = (e: MouseEvent) => {
			if (!isViewActive() || !customListEl) return;
			const target = e.target as HTMLElement;

			if (target.closest('.mdr-vertical-tab-close')) return;

			if (e.type === 'contextmenu') {
				const ctxTarget = target.closest<HTMLElement>('[data-path]');
				if (ctxTarget) {
					e.stopPropagation();
					e.stopImmediatePropagation();
					e.preventDefault();
					const path = ctxTarget.getAttribute('data-path');
					if (path) showContextMenu(e, path);
				}
				return;
			}

			const navBtn = target.closest('.nav-action-button');
			if (navBtn) {
				const label = navBtn.getAttribute('aria-label') ?? '';
				if (label === 'Collapse all' || label === 'Expand all') {
					const collapse = label === 'Collapse all';
					void Promise.resolve().then(() => {
						if (customListEl && isViewActive()) setAllCustomFolders(collapse);
					});
					return;
				}
			}

			const folderTitle = target.closest('.nav-folder-title');
			if (folderTitle) {
				const folderEl = folderTitle.closest('.nav-folder');
				const path = folderEl?.getAttribute('data-path');
				if (path) {
					e.stopPropagation();
					e.stopImmediatePropagation();
					e.preventDefault();
					toggleCustomFolder(path);
					return;
				}
			}

			const fileTitle = target.closest<HTMLElement>('.nav-file-title');
			if (fileTitle) {
				e.stopPropagation();
				e.stopImmediatePropagation();
				e.preventDefault();
				const fileEl = fileTitle.closest('.nav-file');
				const path = fileEl?.getAttribute('data-path');
				if (path) {
					const abstractFile = app.vault.getAbstractFileByPath(path);
					if (abstractFile instanceof TFile) {
						if (e.button === 1 || e.ctrlKey || e.metaKey) {
							void app.workspace.openLinkText(path, '', 'tab');
						} else {
							openOrSwitchTab(path);
						}
						// Update is-active immediately — don't wait for leaf-change rebuild
						setFileHighlight(path);
					}
				}
				return;
			}
		};

		const hostEl = containerEl.parentElement;
		if (!hostEl) return;
		hostEl.addEventListener('click', captureHandler, true);
		hostEl.addEventListener('contextmenu', captureHandler, true);
	};

	const removeCaptureHandler = (): void => {
		if (!captureHandler) return;
		const hostEl = containerEl?.parentElement;
		if (hostEl) {
			hostEl.removeEventListener('click', captureHandler, true);
			hostEl.removeEventListener('contextmenu', captureHandler, true);
		}
		captureHandler = null;
	};

	/* ---- custom list lifecycle ---- */

	const renderCustomList = (tree: TreeNode[], activePath: string | null): void => {
		if (!containerEl) return;
		if (customListEl) { customListEl.remove(); customListEl = null; }

			const realList = containerEl.querySelector<HTMLElement>('.nav-files-container');

		const wrapper = doc.createElement('div');
		wrapper.className = 'nav-files-container mdr-vt-custom-list';
		for (const node of tree) wrapper.appendChild(renderTreeNode(node, 0, activePath));
		if (realList) realList.after(wrapper); else containerEl.appendChild(wrapper);

		customListEl = wrapper;
		installCaptureHandler();
	};

	const destroyCustomList = (): void => {
		removeCaptureHandler();
		if (customListEl) { customListEl.remove(); customListEl = null; }
		customCollapsed.clear();
	};

	/* ---- apply / remove view state ---- */

	const applyViewState = (): void => {
		if (!containerEl) return;
		if (!enabled() || !isViewActive()) {
			const wasActive = containerEl.classList.contains('mdr-vertical-tabs-view');
			if (!wasActive) return;
			containerEl.classList.remove('mdr-vertical-tabs-view');
			destroyCustomList();
			return;
		}

		containerEl.classList.add('mdr-vertical-tabs-view');
		const openPaths = getOpenFilePaths();
		if (openPaths.size === 0) { renderCustomList([], null); return; }

		// Resolve active path: try workspace activeLeaf, fall back to first open tab
		let activePath = getActiveFilePath();
		if (!activePath) {
			activePath = openPaths.values().next().value ?? null;
		}

		const ancestorPaths = getAncestorPaths(openPaths);
		renderCustomList(buildFilteredTree(openPaths, ancestorPaths), activePath);
	};

	/* ---- leaf change (debounced) ---- */

	const onLeafChange = (): void => {
		if (!containerEl || !enabled()) return;
		refreshCloseButtons();
		if (!isViewActive()) return;
		if (leafChangeTimer !== null) window.clearTimeout(leafChangeTimer);
		leafChangeTimer = window.setTimeout(() => {
			leafChangeTimer = null;
			if (containerEl && isViewActive()) {
				applyViewState();
			}
		}, 100);
	};

	/* ---- observer for virtual-scrolled close buttons ---- */

	const startCloseBtnObserver = (): void => {
		if (!containerEl) return;
		if (closeBtnObserver) closeBtnObserver.disconnect();

		closeBtnObserver = new MutationObserver(() => {
			if (!containerEl || !enabled()) return;
			refreshCloseButtons();
		});

		closeBtnObserver.observe(containerEl, { childList: true, subtree: true });
	};

	const stopCloseBtnObserver = (): void => {
		if (closeBtnObserver) { closeBtnObserver.disconnect(); closeBtnObserver = null; }
	};

	/* ---- attach / detach ---- */

	const attach = (): void => {
		if (!containerEl) return;
		injectToggleButton();
		startCloseBtnObserver();
		refreshCloseButtons();
		if (isViewActive()) applyViewState();
	};

	const detach = (): void => {
		destroyCustomList();
		stopCloseBtnObserver();
		if (toggleBtn) { toggleBtn.remove(); toggleBtn = null; }
		if (leafChangeTimer !== null) { window.clearTimeout(leafChangeTimer); leafChangeTimer = null; }
		if (containerEl) containerEl.classList.remove('mdr-vertical-tabs-view');
		refreshCloseButtons();
	};

	/* ---- initial setup ---- */

	app.workspace.onLayoutReady(() => {
		if (!findContainer()) {
			let retries = 0;
			const interval = window.setInterval(() => {
				if (containerEl) { window.clearInterval(interval); return; }
				if (retries++ >= 3) { window.clearInterval(interval); return; }
				if (findContainer()) { window.clearInterval(interval); attach(); }
			}, 500);
			return;
		}
		attach();
	});

	plugin.registerEvent(app.workspace.on('layout-change', () => {
		detach();
		containerEl = null;
		if (findContainer()) attach();
	}));

	plugin.registerEvent(app.workspace.on('active-leaf-change', () => onLeafChange()));

	plugin.register(() => detach());
}
