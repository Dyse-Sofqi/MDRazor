# Vertical Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add vertical tabs feature — close buttons on active-tab file names in file explorer, plus a toggle button that switches the file explorer into a "tabs only" view showing only active tabs and their ancestor directories.

**Architecture:** New independent module `vertical-tabs.ts` following the existing `tab-enhancer.ts` / `dir-focus.ts` pattern. Two new settings fields. One new setting toggle. CSS rules in `styles.css` for hiding non-active items and styling close buttons.

**Tech Stack:** TypeScript, Obsidian Plugin API, DOM manipulation

## Global Constraints

- Follow existing MVC pattern (settings in `model/`, UI in `view/`, logic in `controller/`)
- All feature switches default `true` for consistent first-run experience
- `verticalTabsViewActive` defaults `false` — only persisted after user toggles
- Layout-ready retry pattern: 3 retries × 500ms (match `tab-enhancer.ts`)
- Single file-explorer leaf only (match existing modules)
- No `any` casts for Obsidian APIs unless existing code already does so

---

### Task 1: Add settings fields to data model

**Files:**
- Modify: `src/model/settings.ts`

**Interfaces:**
- Produces: `MDRazorSettings.verticalTabsEnabled: boolean`, `MDRazorSettings.verticalTabsViewActive: boolean`, `DEFAULT_SETTINGS` entries for both

- [ ] **Step 1: Add fields to MDRazorSettings interface**

```typescript
// In MDRazorSettings interface, update the 标签页增强 group comment and add two fields:
	// ── 标签页增强 (tab-enhancer.ts / vertical-tabs.ts) ──
	tabEnhancerDefaultOpen: boolean;
	verticalTabsEnabled: boolean;
	verticalTabsViewActive: boolean;
```

- [ ] **Step 2: Add defaults to DEFAULT_SETTINGS**

```typescript
// In DEFAULT_SETTINGS, add:
	tabEnhancerDefaultOpen: true,
	verticalTabsEnabled: true,
	verticalTabsViewActive: false,
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/model/settings.ts
git commit -m "feat: add verticalTabsEnabled and verticalTabsViewActive settings fields"
```

---

### Task 2: Add vertical tabs toggle to settings UI

**Files:**
- Modify: `src/view/settings-tab.ts:199-215`

**Interfaces:**
- Consumes: `MDRazorSettings.verticalTabsEnabled` (from Task 1)
- Produces: Settings UI toggle that writes `verticalTabsEnabled`

- [ ] **Step 1: Add toggle after the existing "默认新标签页打开" toggle**

Insert after line 215 (`});`) in the tabSection block:

```typescript
			new Setting(tabSection)
				.setName('垂直标签页')
				.setDesc('在文件列表中为已打开的文件显示关闭按钮，并提供标签页列表切换视图')
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.verticalTabsEnabled)
						.onChange(async (value) => {
							this.plugin.settings.verticalTabsEnabled = value;
							await this.plugin.saveSettings();
						}),
				);
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/view/settings-tab.ts
git commit -m "feat: add vertical tabs toggle to settings UI"
```

---

### Task 3: Register vertical tabs in main controller

**Files:**
- Modify: `src/controller/main.ts:26,56-57`

**Interfaces:**
- Consumes: `registerVerticalTabs` (from Task 4 — but import can be added now, function won't exist yet)
- Produces: Wired registration with enabled/viewActive callbacks and setViewActive callback

- [ ] **Step 1: Add import**

Add after line 26 (`import { registerTabEnhancer } from './tab-enhancer';`):

```typescript
import { registerVerticalTabs } from './vertical-tabs';
```

- [ ] **Step 2: Add registration call**

Add after line 57 (`registerTabEnhancer(this, () => this.settings.tabEnhancerDefaultOpen);`):

```typescript
		// 注册垂直标签页（文件列表关闭按钮 + 标签页列表视图）
		registerVerticalTabs(
			this,
			() => this.settings.verticalTabsEnabled,
			() => this.settings.verticalTabsViewActive,
			(active: boolean) => {
				this.settings.verticalTabsViewActive = active;
				this.saveSettings();
			},
		);
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Error — `Module './vertical-tabs' has no exported member 'registerVerticalTabs'`. This is expected until Task 4 creates the file.

- [ ] **Step 4: Commit**

```bash
git add src/controller/main.ts
git commit -m "feat: wire registerVerticalTabs into main controller"
```

---

### Task 4: Create vertical-tabs.ts module

**Files:**
- Create: `src/controller/vertical-tabs.ts`

**Interfaces:**
- Consumes: `Plugin`, `TFile` from `obsidian`; `setIcon` from `obsidian`; settings accessor callbacks (enabled, isViewActive, setViewActive) passed from `main.ts`
- Produces: `export function registerVerticalTabs(plugin, enabled, isViewActive, setViewActive): void`

- [ ] **Step 1: Create the module file**

Create `src/controller/vertical-tabs.ts`:

```typescript
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
					folder.classList.add('mdr-vertical-tab-has-active');
				} else {
					folder.classList.remove('mdr-vertical-tab-has-active');
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
				for (const node of mutation.addedNodes) {
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (Task 3 import now resolves).

- [ ] **Step 3: Commit**

```bash
git add src/controller/vertical-tabs.ts
git commit -m "feat: add vertical-tabs module with toggle button, close buttons, and tabs-only view"
```

---

### Task 5: Add CSS styles

**Files:**
- Modify: `styles.css`

**Interfaces:**
- Consumes: CSS classes from Task 4 (`mdr-vertical-tab-close`, `mdr-vertical-tabs-view`, `mdr-vertical-tab-active`, `mdr-vertical-tab-has-active`)

- [ ] **Step 1: Append CSS rules to styles.css**

Append to `styles.css`:

```css
/* ── 垂直标签页 ── */

/* 关闭按钮：靠右对齐，默认透明，hover 显现 */
.mdr-vertical-tab-close {
	margin-left: auto;
	margin-right: 4px;
	cursor: pointer;
	opacity: 0;
	flex-shrink: 0;
	display: flex;
	align-items: center;
}
.nav-file-title:hover .mdr-vertical-tab-close {
	opacity: 0.6;
}
.nav-file-title:hover .mdr-vertical-tab-close:hover {
	opacity: 1;
}

/* 标签页列表视图：隐藏非活跃文件和不含活跃文件的目录 */
.mdr-vertical-tabs-view .nav-file-title:not(.mdr-vertical-tab-active),
.mdr-vertical-tabs-view .nav-folder-title:not(.mdr-vertical-tab-has-active) {
	display: none;
}
```

- [ ] **Step 2: Commit**

```bash
git add styles.css
git commit -m "feat: add vertical tabs CSS styles"
```

---

### Task 6: Build and verify

**Files:**
- (produces) `main.js` (compiled output)

- [ ] **Step 1: Build the plugin**

Run: `npm run build`
Expected: Build succeeds, `main.js` updated.

- [ ] **Step 2: Verify no runtime import errors**

Run: `node -e "require('./main.js')"`
Expected: No errors related to missing exports (may error on missing Obsidian API — that's expected outside Obsidian).

- [ ] **Step 3: Commit**

```bash
git add main.js
git commit -m "chore: rebuild with vertical tabs feature"
```
