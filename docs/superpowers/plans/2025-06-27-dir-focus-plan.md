# 目录聚焦 (Directory Focus) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "目录聚焦" toggle in settings — click folder name in file explorer → expand descendants + ancestor chain, collapse everything else.

**Architecture:** Capture-phase click intercept on `.nav-folder-title` → `stopPropagation()` blocking React handler → `computeCollapseStates()` via ancestor chain + descendant tree → batch-apply via `view.setCollapsed()` in RAF batches of 10/frame → scrollTop restore + requestUpdate?.().

**Tech Stack:** Obsidian Plugin API (internal file-explorer plugin view), DOM capture-phase events, `requestAnimationFrame` batching.

## Global Constraints

- New setting `dirFocusOption: boolean`, default `true`, in `MDRazorSettings` interface + `DEFAULT_SETTINGS`
- Toggle in "列表增强" section after "聚焦选项" toggle
- New file: `src/controller/dir-focus.ts`
- Capture-phase click listener with `stopPropagation()` on file-explorer containerEl
- Core algorithm: `computeCollapseStates(clicked, allPaths)` → `keepExpanded = ancestors ∪ clicked ∪ descendants`, everything else collapsed
- State application: `view.setCollapsed(folder, collapsed)` in RAF batches of 10/frame
- **Scroll preservation**: save `containerEl.scrollTop` before mutations, restore after final RAF batch
- **Defensive refresh**: call `view.requestUpdate?.()` after final batch
- Cancel in-flight RAF batches on rapid clicks via `batchId` counter
- **Retry cleanup**: if file-explorer leaf not found after 3×500ms retries, set `currentHandler = null; currentContainerEl = null;`
- Layout-change → `detachHandler()` + re-attach
- Chevron clicks (`.nav-folder-collapse-indicator`) pass through
- **No `syncDirFocus()`** — `enabled()` accessor reads live `this.settings.dirFocusOption` via closure

---

### Task 1: Add `dirFocusOption` to settings model

**Files:**
- Modify: `src/model/settings.ts` (add field + default)

- [ ] **Step 1: Add field to interface**

Insert `dirFocusOption` after `listFocusOption`:

```typescript
	// ── 列表增强 (list-enhancer.ts) ──
	listIntegration: boolean;
	enterSoftBreak: boolean;
	listFocusOption: boolean;
	dirFocusOption: boolean;
```

- [ ] **Step 2: Add default**

```typescript
	listIntegration: true,
	enterSoftBreak: true,
	listFocusOption: true,
	dirFocusOption: true,
```

- [ ] **Step 3: Commit**

```bash
git add src/model/settings.ts
git commit -m "feat: add dirFocusOption setting field + default true"
```

---

### Task 2: Add "目录聚焦" toggle to settings tab

**Files:**
- Modify: `src/view/settings-tab.ts` (add toggle after "聚焦选项")

- [ ] **Step 1: Insert toggle after "聚焦选项" block (after line 161)**

```typescript
			new Setting(listSection)
				.setName('目录聚焦')
				.setDesc('点击文件列表的文件夹时，展开该文件夹的所有子孙文件夹，折叠其余无关文件夹（同级、父同级、祖父同级等）')
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.dirFocusOption)
						.onChange(async (value) => {
							this.plugin.settings.dirFocusOption = value;
							await this.plugin.saveSettings();
						}),
				);
```

- [ ] **Step 2: Commit**

```bash
git add src/view/settings-tab.ts
git commit -m "feat: add 目录聚焦 toggle to settings tab"
```

---

### Task 3: Create `dir-focus.ts` core module

**Files:**
- Create: `src/controller/dir-focus.ts`

**Interfaces:**
- Exports: `registerDirFocus(plugin: MDRazorPlugin, enabled: () => boolean): void`
- Internal: `getFileExplorerView`, `getAncestors`, `getDescendants`, `getAllFolderPaths`, `computeCollapseStates`, `applyStates`, `processFocus`, `attachHandler`, `detachHandler`

- [ ] **Step 1: Create module with complete implementation**

```typescript
/**
 * MDRazor — 目录聚焦
 *
 * 在 Obsidian 原生文件列表中实现"目录聚焦"功能。
 * 点击文件夹名称时，展开其所有子孙文件夹，折叠除直系父系以外的所有文件夹。
 *
 * 通过 capture-phase click 拦截阻止 React 处理器的默认展开/折叠，
 * 改用 view.setCollapsed() 批量设置文件夹状态。
 */

import { type App, TFolder, type Plugin } from 'obsidian';

/* ------------------------------------------------------------------ */
/*  Type helpers for internal file-explorer view                       */
/* ------------------------------------------------------------------ */

interface FileExplorerView {
	setCollapsed: (folder: TFolder, collapsed: boolean) => void;
}

/** Retrieve the file-explorer view via internal plugin API (no public types). */
function getFileExplorerView(app: App): FileExplorerView | null {
	const plugin = (app.internalPlugins as Record<string, any>)
		.getPluginById?.('file-explorer');
	return plugin?.instance?.view ?? null;
}

/* ------------------------------------------------------------------ */
/*  Core algorithm                                                     */
/* ------------------------------------------------------------------ */

export interface CollapseState {
	[path: string]: boolean; // true = collapsed, false = expanded
}

/** Build ancestor chain from folder up to root (exclusive). */
function getAncestors(folder: TFolder): TFolder[] {
	const chain: TFolder[] = [];
	let p = folder.parent;
	while (p && !p.isRoot()) {
		chain.unshift(p);
		p = p.parent;
	}
	return chain;
}

/** Collect all descendant folders recursively. */
function getDescendants(folder: TFolder): TFolder[] {
	const result: TFolder[] = [];
	function walk(f: TFolder): void {
		for (const child of f.children) {
			if (child instanceof TFolder) {
				result.push(child);
				walk(child);
			}
		}
	}
	walk(folder);
	return result;
}

/**
 * Get all visible folder paths from the file-explorer view's fileItems.
 */
function getAllFolderPaths(view: FileExplorerView, app: App): string[] {
	const items = (view as any).fileItems;
	if (!items) return [];
	if (items instanceof Map) {
		return Array.from(items.keys()).filter((path: string) => {
			const f = app.vault.getFolderByPath(path);
			return f instanceof TFolder;
		});
	}
	return Object.keys(items).filter((path: string) => {
		const f = app.vault.getFolderByPath(path);
		return f instanceof TFolder;
	});
}

/**
 * Compute target collapse states for ALL folders.
 *
 * keepExpanded set = ancestors ∪ clicked ∪ descendants
 * Everything outside keepExpanded → collapsed (true)
 * Inside keepExpanded → expanded (false)
 * Clicked folder → always expanded (false)
 */
export function computeCollapseStates(
	clicked: TFolder,
	allPaths: string[],
): CollapseState {
	const ancestors = getAncestors(clicked);
	const descendants = getDescendants(clicked);

	const keepExpanded = new Set<string>();
	for (const f of ancestors) keepExpanded.add(f.path);
	keepExpanded.add(clicked.path);
	for (const f of descendants) keepExpanded.add(f.path);

	const states: CollapseState = {};
	for (const path of allPaths) {
		states[path] = path === clicked.path ? false : !keepExpanded.has(path);
	}
	return states;
}

/* ------------------------------------------------------------------ */
/*  State application via RAF-batched setCollapsed()                    */
/* ------------------------------------------------------------------ */

let currentBatchId = 0;

/**
 * Apply collapse states using view.setCollapsed(), batched via RAF.
 *
 * Features:
 *   - RAF batches of 10/frame to avoid blocking main thread
 *   - batchId counter cancels stale batches on rapid clicks
 *   - Saves & restores scrollTop to prevent scrollbar jump
 *   - Calls view.requestUpdate?.() after final batch for defensive refresh
 */
export function applyStates(
	view: FileExplorerView,
	app: App,
	states: CollapseState,
	containerEl?: HTMLElement,
): void {
	const batchId = ++currentBatchId;
	const entries = Object.entries(states);
	if (entries.length === 0) return;

	// Save scroll position before any DOM mutations
	const savedScrollTop = containerEl?.scrollTop ?? 0;

	let i = 0;
	function batch(): void {
		if (batchId !== currentBatchId) return; // stale — discard
		const chunk = entries.slice(i, i + 10);
		for (const [path, collapsed] of chunk) {
			const folder = app.vault.getFolderByPath(path);
			if (folder instanceof TFolder) {
				try {
					view.setCollapsed(folder, collapsed);
				} catch {
					// silently skip if setCollapsed is unavailable
				}
			}
		}
		i += 10;
		if (i >= entries.length) {
			// All batches done — defensive refresh + restore scroll
			(view as any)?.requestUpdate?.();
			if (containerEl) containerEl.scrollTop = savedScrollTop;
			return;
		}
		requestAnimationFrame(batch);
	}
	requestAnimationFrame(batch);
}

/* ------------------------------------------------------------------ */
/*  Full focus processing pipeline                                     */
/* ------------------------------------------------------------------ */

/**
 * Execute directory focus for a clicked folder.
 *
 * 1. Get file-explorer view + all folder paths
 * 2. Compute target collapse states
 * 3. Apply states in RAF batches (with scroll preservation)
 */
export function processFocus(
	app: App,
	clicked: TFolder,
	containerEl?: HTMLElement,
): void {
	const view = getFileExplorerView(app);
	if (!view) return;

	const allPaths = getAllFolderPaths(view, app);
	if (allPaths.length === 0) return;

	const states = computeCollapseStates(clicked, allPaths);
	applyStates(view, app, states, containerEl);
}

/* ------------------------------------------------------------------ */
/*  Lifecycle: capture-phase click handler on file-explorer DOM         */
/* ------------------------------------------------------------------ */

/** Return true if the click target is inside the collapse chevron. */
function isChevronClick(e: MouseEvent): boolean {
	const target = e.target as HTMLElement;
	return !!target.closest('.nav-folder-collapse-indicator');
}

/** Bound handler ref (for cleanup on layout-change). */
let currentHandler: ((e: MouseEvent) => void) | null = null;

/** The current containerEl (for scrollTop access in processFocus). */
let currentContainerEl: HTMLElement | null = null;

/**
 * Attach a capture-phase click handler to the file-explorer container.
 *
 * Previously attached handler (if any) is removed first to prevent leaks.
 */
export function attachHandler(
	containerEl: HTMLElement,
	app: App,
	enabled: () => boolean,
): void {
	if (currentHandler) {
		containerEl.removeEventListener('click', currentHandler, true);
	}

	currentContainerEl = containerEl;

	currentHandler = (e: MouseEvent) => {
		if (!enabled()) return;

		const el = (e.target as HTMLElement).closest('.nav-folder-title');
		if (!el || isChevronClick(e)) return;

		e.stopPropagation(); // block React's default handler

		const folderEl = el.closest('.nav-folder') as HTMLElement | null;
		const path = folderEl?.getAttribute('data-path');
		if (!path) return;

		const folder = app.vault.getFolderByPath(path);
		if (!(folder instanceof TFolder)) return;

		requestAnimationFrame(() => processFocus(app, folder, currentContainerEl ?? undefined));
	};

	containerEl.addEventListener('click', currentHandler, true);
}

/** Remove the currently attached handler (if any). */
export function detachHandler(containerEl: HTMLElement): void {
	if (currentHandler) {
		containerEl.removeEventListener('click', currentHandler, true);
		currentHandler = null;
		currentContainerEl = null;
	}
}

/* ------------------------------------------------------------------ */
/*  Public entry point                                                 */
/* ------------------------------------------------------------------ */

/**
 * Set up directory focus feature.
 *
 * - Finds file-explorer leaf on layout-ready
 * - Retries ×3 with 500ms delay if leaf not found
 * - On retry exhaustion, sets handler refs to null (cleanup)
 * - Attaches capture-phase click handler
 * - Re-attaches on layout-change (sidebar recreate)
 */
export function registerDirFocus(plugin: Plugin, enabled: () => boolean): void {
	const { app } = plugin;
	let containerEl: HTMLElement | null = null;

	const findAndAttach = (): boolean => {
		const leaves = app.workspace.getLeavesOfType('file-explorer');
		if (!leaves.length) return false;

		const leaf = leaves[0];
		containerEl = leaf.view.containerEl;
		attachHandler(containerEl, app, enabled);
		return true;
	};

	app.workspace.onLayoutReady(() => {
		const found = findAndAttach();

		if (!found) {
			let retries = 0;
			const interval = setInterval(() => {
				if (containerEl) { clearInterval(interval); return; }
				if (retries++ >= 3) {
					clearInterval(interval);
					// Exhausted retries — clean up refs to prevent stale listeners
					currentHandler = null;
					currentContainerEl = null;
					return;
				}
				if (findAndAttach()) clearInterval(interval);
			}, 500);
		}
	});

	// Re-attach on layout change (sidebar moved / recreated)
	plugin.registerEvent(
		(app.workspace as any).on('layout-change', () => {
			if (containerEl) detachHandler(containerEl);
			containerEl = null;
			findAndAttach();
		}),
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/controller/dir-focus.ts
git commit -m "feat: create dir-focus module"
```

---

### Task 4: Wire dir-focus into main.ts

**Files:**
- Modify: `src/controller/main.ts` (import + register call)

**Note:** No `syncDirFocus()` needed. `enabled()` reads `this.settings.dirFocusOption` live via closure.

- [ ] **Step 1: Add import**

After `import { listEnhancerConfig, createListEnhancerExtension } from './list-enhancer';`:

```typescript
import { registerDirFocus } from './dir-focus';
```

- [ ] **Step 2: Add registration call after editor extensions**

```typescript
		// 注册目录聚焦（非 CM6 扩展 — 直接操作文件列表 DOM）
		registerDirFocus(this, () => this.settings.dirFocusOption);
```

Complete `onload`:

```typescript
	async onload() {
		await this.loadSettings();

		this.addSettingTab(new MDRazorSettingTab(this.app, this));

		this.registerEditorExtension(createFormatHiderExtension());
		this.registerEditorExtension(createSpaceVisualizationExtension());
		this.registerEditorExtension(createListEnhancerExtension());

		registerDirFocus(this, () => this.settings.dirFocusOption);
	}
```

- [ ] **Step 3: Commit**

```bash
git add src/controller/main.ts
git commit -m "feat: wire dir-focus into plugin lifecycle"
```

---

### Verification

1. **Toggle ON (default)**: Settings → "列表增强" → "目录聚焦" toggle exists, default ON
2. **Click folder name**: Nested folder (not chevron) → only ancestor chain + descendants visible, rest collapsed
3. **Scroll preservation**: After collapse, scroll position stays (no jump to top)
4. **Chevron click**: Normal single-level toggle, no focus behavior
5. **Toggle OFF**: Click folder → normal Obsidian behavior
6. **Rapid clicks**: Hammer different folders → no flicker, final state = last-clicked folder
7. **Sidebar layout change**: Move sidebar → click folder → still works
8. **Root click**: All folders expand
9. **Build**: `npm run build` or `tsc --noEmit` → no TS errors
