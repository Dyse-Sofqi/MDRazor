# 目录聚焦 (Directory Focus) — Design Spec

## Context

MDRazor plugin's "列表增强" module currently provides three editor-focused features (list integration, enter soft-break, focus options). The "聚焦选项" feature folds siblings around cursor position inside the CM6 editor.

This spec adds a complementary feature, **目录聚焦**, that applies the same "focus" concept to Obsidian's native file explorer sidebar: clicking a folder name expands only that folder's subtree and its ancestor chain, collapsing everything else.

## Files to Modify

| File | Change |
|------|--------|
| `src/model/settings.ts` | Add `dirFocusOption: boolean` to interface + defaults |
| `src/view/settings-tab.ts` | Add toggle in "列表增强" section |
| `src/controller/main.ts` | Import + call `registerDirFocus()`; add `syncDirFocus()` to `saveSettings()` |

## Files to Create

| File | Purpose |
|------|---------|
| `src/controller/dir-focus.ts` | Core implementation (~120 lines) |

## Architecture

```
settings-tab.ts                    dir-focus.ts
    │                                  │
    │ toggle.onChange()                │ capture-phase click handler
    │ plugin.saveSettings()            │ stopPropagation → React won't see it
    ▼                                  ▼
main.ts ──syncConfig()──► settings (accessor fn reads live value)
                                  │
                                  ▼
                     computeCollapseStates()
                         │          │
                    ancestors    descendants
                         │          │
                         ▼──────────▼
                     keepExpanded Set
                         │
                         ▼
                    applyStates()
                         │
                         ▼
              RAF batch ×10/frame
              view.setCollapsed(folder, bool)
```

## Settings

```typescript
// src/model/settings.ts
export interface MDRazorSettings {
    // ...
    dirFocusOption: boolean;  // NEW — default: true
}

export const DEFAULT_SETTINGS: MDRazorSettings = {
    // ...
    dirFocusOption: true,
};
```

## Feature Module: `src/controller/dir-focus.ts`

### Exports

- `registerDirFocus(plugin: MDRazorPlugin, enabled: () => boolean): void`

### Lifecycle

1. `onLayoutReady()` → find file-explorer leaf → `attachHandler(containerEl, enabledAccessor)`
2. On layout-change → `detachHandler()` (removeEventListener) → `attachHandler()` (fresh container)
3. On unload → Obsidian auto-cleans registered events; `registerEvent()` wraps the handler lifecycle

### Click Handler (capture-phase)

```typescript
container.addEventListener('click', (e) => {
    if (!enabled()) return;                          // 1. Gate
    const el = (e.target as HTMLElement).closest('.nav-folder-title');
    if (!el || isChevronClick(e)) return;            // 2. Ignore chevron
    e.stopPropagation();                             // 3. Block React handler

    const path = el.closest('.nav-folder')?.getAttribute('data-path');
    const folder = path && app.vault.getFolderByPath(path);
    if (!(folder instanceof TFolder)) return;

    RAF(() => processFocus(folder));                 // 4. Defer to next frame
}, true); // capture phase
```

### Core Algorithm: `computeCollapseStates()`

```
Input:  clickedFolder (TFolder), allVisiblePaths (string[])
Output: { [path: string]: boolean }  — true=collapsed, false=expanded

1. ancestors = walk clickedFolder.parent → root, collect into array
2. descendants = recursive collect(clickedFolder.children) for TFolder instances
3. keepExpanded = new Set([...ancestors.paths, clickedFolder.path, ...descendants.paths])
4. for each path in allVisiblePaths:
     states[path] = path === clickedFolder.path ? false : !keepExpanded.has(path)
5. return states
```

### State Application: `applyStates()`

```
BatchId counter (module-level): auto-increment on each call
RAF batch: 10 entries per frame
Each entry: view.setCollapsed(folder, bool)
Stale batch detection: batchId !== currentBatchId → discard
```

### Edge Cases

| Case | Behavior |
|------|----------|
| Click folder with no children | Still collapses non-ancestors (only root→parent→clicked visible) |
| Click root | ancestors=[], descendants=all → all expanded (correct by algorithm) |
| Setting toggled OFF | Handler checks `enabled()` → returns early, React handles click normally |
| Rapid clicks (<200ms) | New call increments batchId → previous RAF chain discards itself |
| Layout change (sidebar recreate) | `layout-change` event fires → cleanup + re-attach handler |
| Leaf not found on load | Retry ×3 with 500ms delay |
| `setCollapsed` not available | Graceful no-op (feature degrades safely) |

### Memory & Performance

- Handler ref stored for cleanup before re-attach
- RAF batch limit (10/frame) prevents main-thread blocking
- `is-collapsed` class never touched directly — always through `setCollapsed` which triggers React reconciliation
- `computeCollapseStates` uses `Set` for O(1) lookup

## Verification

1. Toggle ON → click folder → only ancestor chain + descendants visible
2. Toggle OFF → click folder → normal behavior
3. Click root → all folders expand
4. Rapid clicks → no flicker, final state matches last-clicked folder
5. Deep tree (10+ levels) → RAF batches process without hang
6. Empty vault (single root) → no crash
7. Move sidebar to right → listener re-attached
8. Toggle ON → click → toggle OFF → click → verify no residual interception
