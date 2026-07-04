<div align="center">

# MDRazor

Designed to refine your writing experience with precision like a razor.

[![GitHub Release](https://img.shields.io/github/v/release/Dyse-Sofqi/MDRazor?style=flat-square&logo=github&color=%2342b883)](https://github.com/Dyse-Sofqi/MDRazor/releases) [![License](https://img.shields.io/github/license/Dyse-Sofqi/MDRazor?style=flat-square&color=%2342b883)](LICENSE) [![Obsidian Min App](https://img.shields.io/badge/Obsidian-%5E1.0.0-%234a7ec1?style=flat-square&logo=obsidian&logoColor=%234a7ec1)](https://obsidian.md) [![GitHub Stars](https://img.shields.io/github/stars/Dyse-Sofqi/MDRazor?style=flat-square&logo=github&color=%23e4b341)](https://github.com/Dyse-Sofqi/MDRazor)

[🇨🇳 中文](README.md) · [🇬🇧 English](README.en.md)

</div>

---

### Installation

#### Via Community Plugins (Recommended)

1. Open Obsidian → Settings → Community plugins → Browse
2. Search for **MDRazor** and install
3. Enable in Installed plugins list

#### Via BRAT (Preview builds)

1. Install [BRAT](https://obsidian.md/plugins?id=obsidian42-brat) plugin
2. Add `Dyse-Sofqi/MDRazor` in BRAT settings
3. Enable MDRazor manually

---

### Introduction

MDRazor is an Obsidian plugin focused on improving the Markdown editing experience.
Currently provides **Style Hiding**, **List Enhancements**, and **Tab Enhancer** — three major feature modules, with more in development.

### Features

Features are organized by the three settings-panel sections. Each toggle is independently switchable in settings.

---

#### ✂️ Style Hiding

Hide Markdown formatting markers; markers reappear when the cursor enters the range. Cleaner live preview, zero distraction.

Each format below can be toggled independently:

- **Bold** — hides `**` bold markers
- **Italic** — hides `*` italic markers
- **Highlight** — hides `==` highlight markers
- **Strikethrough** — hides `~~` strikethrough markers
- **Inline Code** — hides `` ` `` inline code markers
- **Escape** — hides `\` escape character markers
- **Heading** — hides `#` heading markers (H1–H6); standalone `#` without trailing space is not hidden

All hidden formats share these behaviors:

- Clicking near the boundary of formatted content places the cursor outside the markers, preventing accidental format entry
- Since markers are hidden, cursor movement distance can be inferred from the cursor blink trail

👁️ **Space Visualization** — Display spaces as translucent `·` markers, making indentation and alignment visible at a glance. Based on CM6 viewport iteration — only visible lines are processed, minimal performance overhead. Translucent style won't interfere with editing. Listed as an independent toggle within the Style Hiding section.

---

#### 🗑️ Orphan Image Cleaner

- **Orphan Image Cleaner** — Enable in settings to show a trash-2 ribbon icon. Click it to scan all Markdown notes in the vault for image references via three syntaxes (`![[path]]`, `![](path)`, `<img src>`). Finds unreferenced image files (jpg/jpeg/png/gif/svg) and moves them to the system recycle bin. Reports each processed filename via Notice.

---

#### 📝 List Enhancements

Optimized list editing experience with the following independent toggles:

- **List Integration** — Treats list markers (`-`, `1.`, `*`) as atomic units: cursor navigation skips the marker, backspace removes the entire marker at once. Editing experience closer to WYSIWYG.

- **Enter Soft Break** — Pressing Enter inside a list item inserts a line break, indentation, and two trailing spaces (equivalent to native `Shift+Enter` behavior), without creating a new list item. Press Enter again to create a new list item — consecutive Enter presses create new items. Ideal for multi-line list items.

- **List Focus Option** — When the cursor enters a list item, automatically expand all its descendants and collapse all non-directly-related content (siblings, parent siblings, etc.). Only the focus chain (itself + ancestors + descendants) stays visible. Deeply nested list navigation no longer overwhelming. Fold is deferred until mouse button release to prevent flicker during selection drag.

  - **Second-level Max Expand Count** — Sub-setting of List Focus Option (slider 1-9 + toggle). When enabled, top-level items with ≤ threshold second-level children will be expanded during focus. Affects top-level items only; descendants still follow normal focus-fold behavior. Disabled when List Focus Option is off.

- **Directory Focus** — Click a folder name in the file explorer to automatically expand its entire descendant tree and ancestor chain, while collapsing all unrelated branches (siblings, parent siblings, grandparent siblings, etc.). Focus on the current directory structure. Clicking the folder name (not the collapse chevron) triggers focus; clicking the same folder again toggles its collapse state. The chevron still works independently for normal single-level toggle.

  - 🖱️ **Blank-area Expand** — Shares toggle with Directory Focus (available when Directory Focus is enabled). Click empty area in the file list to expand all top-level folders. Quickly browse the full directory structure. Won't trigger on sort/filter buttons or other interactive areas.

- **Directory File Count** — Displays the count of direct children (sub-folders + files) right-aligned on each folder title in the file explorer. Does NOT recurse into sub-folders. Counts update in real-time as files are created or deleted. Live updates via Obsidian vault events, debounced at 200ms. Font size matches the folder name.

---

#### 📑 Tab Enhancer

File tab management with the following independent toggles:

- **Default New Tab Open** — Click a file in the file explorer: if a tab for that file already exists, switch to it; otherwise open a new tab. Prevents duplicate tabs for more efficient file navigation. Ctrl/Meta+click restores native Obsidian behavior (open in new tab).

- **🗂️ Vertical Tabs** — Tab management in the file explorer. Toggle button (`arrow-left-right` icon) in nav buttons switches to a "tabs-only" view that hides inactive files and empty folders; close buttons on open file titles. Supports "tabs-only" and "full directory" view toggle. Tabs-only view hides unopened files and empty folders, focuses on active files. Close button displayed on the right of each open file title.

### Settings

Configure in Obsidian Settings → Community Plugins → MDRazor:

- **Style Hiding** — 8 toggles: Bold, Italic, Highlight, Strikethrough, Inline Code, Escape, Heading, Space Visualization
- **Orphan Image Cleaner** — 1 toggle: enables trash-2 ribbon icon, scans unreferenced images
- **List Enhancements** — 6 toggles + 1 sub-setting: List Integration, Enter Soft Break, List Focus Option (with Second-level Max Expand Count), Directory Focus, Directory File Count
- **Tab Enhancer** — 2 toggles: Default New Tab Open, Vertical Tabs
- **Statusbar Enhancement** — 1 toggle: Workspace Switch

### Changelog

**2.0.7** (2026-07-05)

- **Fix: Orphan image cleaner API compatibility** — `FileManager.trashFile()` is Obsidian ≥1.1.x only; fallback to `Vault.trash()` ensures `minAppVersion 1.0.0` passes eslint-plugin-obsidianmd checks
- **Refactor: CSS lint cleanup** — Removed 4 `!important` rules (replaced with higher-specificity selectors), restructured `:has()` usage to eliminate `:not(:has())`, resolves `no-important` / `no-recent-has` warnings

**2.0.6** (2026-07-05)

- **Fix: Deprecated API replacement** — `Workspace.activeLeaf` → `Workspace.getMostRecentLeaf()` in `vertical-tabs.ts`, resolves `@typescript-eslint/no-deprecated` error
- **Fix: Vertical tabs hiding method** — removed `element.style.display = 'none'` in `renderCustomList` and `style.display = ''` in `destroyCustomList`; CSS class now controls visibility
- **Fix: Orphan image cleaner API** — replaced `Vault.trash()` with `FileManager.trashFile()` to respect user's recycle-bin preference
- **Fix: Space widget `toDOM` signature** — removed optional `?` from `toDOM(view?: EditorView)`, CM6 always passes an `EditorView` instance at runtime; removed `document` fallback

**2.0.5** (2026-07-04)

- **Rewrite: Vertical Tabs rendering engine** — replaced CSS-hiding + `fileItems` API with a custom DOM tree that replaces the virtual-scroller; only renders open tabs + ancestor folders. Uses native Obsidian CSS classes, inheriting all theme styles automatically
- **Fix: Close buttons missing from file-list entries** — dual-path `data-path` detection (`.nav-file-title` first, `.nav-file` ancestor fallback) + MutationObserver handles virtual-scroller delayed rendering
- **Fix: Highlight (is-active) lost on tab switch** — immediately apply highlight on file click, don't wait for async leaf-change rebuild; fallback to `lastActiveFilePath` cache when non-file leaf activates
- **Fix: No highlight on first VT toggle after startup/refresh** — fallback to first open tab when active path resolution fails
- **Fix: Folder names in VT custom list had extension stripped** — `name.replace(/\.[^/.]+$/, '')` now only applies to file nodes, folders no longer lose trailing characters
- **Fix: Close buttons persisted after tab closed in VT view** — `refreshCloseButtons()` re-scans on `detach()` and leaf-change, removes orphan close buttons
- **Change: VT interaction switched to capture-phase events** — capture listener on `containerEl.parentElement` fires before dir-focus on containerEl
- **Removed: Deprecated polling retries, save/restore folder states, CSS display:none hiding, full `forceExplorerRefresh`**

**2.0.4** (2026-07-03)

- Fix: Vertical Tabs sync refactored — replaced polling retries + full collapse-expand refresh with MutationObserver that waits for file-title DOM readiness + single-pass `syncFolderStates` (expand ancestors, collapse rest), plus `collapseAllFolders` on startup
- Fix: Vertical Tabs ancestor expansion and non-ancestor collapsing each traversed `fileItems` separately — merged into single `syncFolderStates` pass
- Fix: `iterateAllLeaves` in tab-enhancer.ts only matched loaded leaves (`.view.file`), missing unloaded leaves — added `getViewState().state.file` fallback
- Fix: `tsconfig.json` `moduleResolution: "node"` deprecated in TS 5.8+ — changed to `"bundler"` to match esbuild bundler
- Change: Dir-focus blank-area click now collapses **all** folders (not just top-level)
- Change: Vertical Tabs toggle preserves folder collapse/expand state on exit — no more destructive full-expand

**2.0.3** (2026-07-03)

- Fix: Clicking a file in the file explorer no longer expands all folders — all three `register*` functions (Dir Focus / Tab Enhancer / Vertical Tabs) now check `enabled()` before attaching capture-phase event listeners to the file explorer. Previously, handlers were attached even when their feature toggle was off, interfering with Obsidian's React event delegation
- Fix: Switching from "tabs-only" back to "file list" view in Vertical Tabs no longer expands all folders — folder collapse states are saved before entering Vertical Tabs view and restored via `setCollapsed()` API on exit, replacing the destructive `forceExplorerRefresh()` full-expand
- Fix: Dir-focus no longer expands all descendants of the clicked folder — `computeCollapseStates` now keeps only ancestors + clicked folder expanded
- Fix: Dir-focus blank-area click now correctly **collapses** all top-level folders instead of expanding them, matching documented behavior
- Change: Removed redundant `view.requestUpdate?.()` call from dir-focus `applyStates` — `setCollapsed()` directly triggers React re-render without additional refresh

**2.0.2** (2026-07-03)

- Fix: TS type errors in `vertical-tabs.ts` — `leaf.view` lacks `.file` property, added explicit type assertions
- Fix: Undescribed eslint-disable directives in `status-bar-enhancer.ts` and `vertical-tabs.ts` — replaced with scoped described suppressions; removed redundant `as WorkspacesPluginInstance` cast
- New: Cross-window-safe `isHTMLElement` type guard in `vertical-tabs.ts`, replaces `instanceof HTMLElement`
- Change: Improved type safety — `WorkspaceLeaf` type parameter replaces implicit `any`, `AppInternalPlugins` interface replaces `as any` chain-cast

**2.0.1** (2026-07-03)

- Fix: Status bar workspace switch now loads and displays current workspace name on initialization, no need to click first

**2.0.0** (2026-07-02)

- New: Status bar workspace switch — button at the bottom-right. 0-1 workspaces no-op, 2 workspaces direct switch, 3+ opens a popup list attached above the button
- New: Popup menu features hover highlight, Escape/outside-click dismiss, current workspace name tracking
- New: Settings panel "Statusbar Enhancement" section with "Workspace Switch" toggle (default on)
- Fix: Graceful degradation when workspace plugin is disabled — button auto-hides

- Fix: Vertical tabs blank/partial display with large file lists — virtual scroller height corruption from `display:none` on hundreds of items
- Fix: Switching back to file list showed missing items and scroll loop — added `forceExplorerRefresh()` to rebuild scroller on toggle-off
- Enhancement: Non-ancestor folders now collapsed via `setCollapsed(true)` API instead of CSS hiding — removes children from DOM, fixing virtual scroller height measurement
- Enhancement: `collapseNonAncestors()` — collapse all folders outside the active file path chain when entering vertical tabs view
- Enhancement: RAF retry increased from 3 to 8 frames for async-rendered large directory trees
- Enhancement: MutationObserver now marks ancestor `.nav-folder` nodes on new DOM insertion, covering async-rendered folders

**1.9.8** (2026-07-02)

- New: Orphan image cleaner — settings toggle + trash-2 ribbon icon, scans vault for unreferenced images (jpg/jpeg/png/gif/svg), moves to system recycle bin
- Change: Cleanup reports individual filenames instead of generic progress

**1.9.7** (2026-07-02)

- Fix: List focus fold misidentified content paragraph lines between lists as continuations — separate lists merged into one block, triggering fold on previous list
- Change: Block boundary detection now compares indent — content lines with indent ≤ previous item indent recognized as paragraph boundary

**1.9.6** (2026-07-02)

- Change: Renamed "Second-level child threshold" to "Second-level Max Expand Count" — semantics shifted from "skip fold" to "active expand"
- New: Threshold toggle now depends on List Focus Option — auto-disabled when List Focus is off
- New: README installation guide — Community Plugins and BRAT

**1.9.5** (2026-07-02)

- New: List focus sub-setting "Second-level child threshold" — slider (1-9) + toggle. When enabled, top-level items with ≤ threshold second-level children skip focus folding
- Fix: manifest.json version aligned to 1.9.5

**1.9.4** (2026-07-02)

- New: Vertical tabs toggle button gets `.is-active` state (background + darker icon), matching Obsidian native "Show current file" button behavior
- Fix: `any` type warnings in tab-enhancer — replaced with `WorkspaceLeaf`, added `void` to `openFile` promise

**1.9.3** (2026-07-02)

- New: Ctrl/Meta+click on a file restores native Obsidian new-tab behavior, bypassing tab-enhancer switch logic
- Change: List Focus Option renamed from "聚焦选项" to "选项聚焦" in settings UI
- Fix: List focus fold triggered while mouse button held down caused flicker — added pointerdown/pointerup guard, defers fold until mouse release

**1.9.2** (2026-07-02)

- Fix: Close button SVG constrained to 1em to prevent inflating folder row line-height
- Fix: Vertical tabs detects inactive pseudo tabs restored on restart (`.view` null, fallback to `getViewState()`)
- Fix: Close button now works on pseudo tabs — detaches the shortcut leaf via `leaf.detach()`

**1.9.1** (2026-07-02)

- Fix: Inactive tabs after Obsidian restart not shown in vertical tabs view — added `leaf.getViewState()` fallback for leaves with null `.view`
- Fix: Close button SVG constrained to 1em to prevent inflating folder row line-height

**1.9.0** (2026-07-02)

- New: Vertical tabs — tab management in the file explorer. Toggle button (`arrow-left-right` icon) in nav buttons, close buttons on open file titles, one-click "tabs-only" view that hides inactive files and empty folders
- New: Blank-area expand — click empty area of the file list to expand all top-level folders. Coexists with directory focus and vertical tabs
- Fix: Directory file count hidden in vertical tabs view; file explorer sort/filter buttons broken by blank-area click feature
- Enhancement: Vertical tabs async DOM population robustness (MutationObserver listener, ancestor path expansion retry)

**1.8.2** (2026-07-01)

- New: Tab enhancer — click a file in the file explorer: if an existing tab is found, switch to it; otherwise open a new tab. Prevents duplicate tabs, more efficient file navigation

**1.8.1** (2026-07-01)

- Fix: Directory file count style injection moved to `styles.css` — complies with Obsidian security policy (runtime `<style>` creation blocked)

**1.8.0** (2026-07-01)

- New: Directory file count — displays direct child count (sub-folders + files) right-aligned on each folder title in the file explorer. Live updates via vault events, debounced at 200ms

**v1.7.1** (2026-06-30)

- Enhancement: Directory focus — first click focuses a folder, second click on the same folder toggles its collapse state. Added `focusedFolderPath` to track the current focused directory; toggling avoids re-expanding the entire tree
- Optimization: Directory focus chevron click remains independent for normal single-level collapse/expand

**v1.7.0** (2026-06-29)

- New: Hide heading markers — hides `#` heading markers (H1–H6) in live preview; standalone `#` without trailing space is not hidden; cursor repulsion on click moves cursor to the left of the marker
- New: Heading marker toggle added to format hiding settings panel

**v1.6.1** (2026-06-27)

- Fix: Eliminated ESLint `any` type errors — replaced with local interface definitions for type safety

**v1.6.0** (2026-06-27)

- New: Directory focus — click folder name in file explorer to expand descendants + ancestor chain, collapse unrelated branches
- Fix: Chevron detection uses `.tree-item-icon.collapse-icon`, compatible with Obsidian v1.12+

**v1.5.0** (2026-06-27)

- Fix: Focus mode cursor at end of last list item incorrectly treated as outside list

**v1.4.7** (2026-06-26)

- New: Hide escape marker (`\`) — hides backslash escape characters in live preview, enabled by default, with cursor repulsion on click

**v1.4.6** (2026-06-26)

- Fix: Whitespace visualization lint error — use `view.dom.ownerDocument` instead of `document`

**v1.4.5** (2026-06-26)

- New: English README (README.en.md)
- New: Badges + language switcher
- New: Sponsorship section
- Fix: Manifest plugin id changed to lowercase (`md-razor`)

**v1.4.3** (2026-06-25)

- Fix: Focus mode still matching last item after cursor leaves list — `computeFoldIndices` now uses continuation-line scan boundary instead of `Number.MAX_SAFE_INTEGER` when there's no next sibling
- Fix: Focus mode last-item fold range swallowing subsequent content — `computeFoldRanges` changed last subtree branch to continuation-line scanning (stops at blank line) instead of `doc.length`

**v1.4.2** (2026-06-25)

- Optimize: Enter soft break blank top-level item format clearing now also clears previous line if it's also blank — `changes.from` changed from `line.from` to `prevLine.from`, deleting two lines in one dispatch

**v1.4.1** (2026-06-25)

- Fix: Focus mode items at depth 3+ not triggering fold — `buildListItems` depth now uses indentation-stack algorithm instead of `Math.round(indent/4)`
- Fix: Focus mode fold arrow on indented items wrongly positioned at parent — `focusFoldService` now uses line-number mapping instead of `markerFrom` range matching
- Fix: Focus mode default fold service overriding custom service — `Prec.high` ensures priority query
- Fix: Items without children showing fold arrow that folds siblings — childless items return `null`, handled by default `indentRangeFinder`
- Fix: Continuation lines under folded focus items not being folded — `computeFoldRanges` scans continuation lines into fold range without merging child-independent folds

**v1.4.0** (2026-06-25)

- New: Space visualization — translucent · markers for space positions
- New: Instant settings — toggle changes take effect immediately without Obsidian restart
- New: Space visualization toggle added to settings panel "Style Hiding" section
- New: Blank list item Enter level promotion — consecutive blank child items promote one level on Enter; top-level items clear list formatting

**v1.2.0** (2026-06-25)
- Refactor: MVC architecture split (model/controller/view), improved maintainability
- New: List focus option — auto-collapse non-direct content when cursor focuses a list item
- Fix: Each folded item now independently shows `...` instead of merging
- Optimize: Chinese comments

**v1.1.0** (2026-06-24)
- New: Enter soft break (continuation indentation + blank continuation promoted to list item)
- New: Collapsible settings panel
- Optimize: List merge detection now uses `cursorAt()`, supports continuation-line scenarios
- Optimize: All features enabled by default
- Migration: `enhancedListMarkers` setting auto-migrated to `enterSoftBreak`

**v1.0.0** (2026-06-24)
- Style marker hiding
- List integration (cursor correction + atomic deletion + smart merge)

## Technical Stack

- Built on [Obsidian API](https://github.com/obsidianmd/obsidian-api)
- Uses CodeMirror 6 (`ViewPlugin`, `Decoration`, `syntaxTree`, `domEventHandlers`) for editor-level manipulation
- Modular architecture: each feature resides in its own source file under `src/`

## Sponsorship

If this plugin helps you, feel free to scan the QR code to sponsor ❤️

![Sponsor](https://github.com/Dyse-Sofqi/MDRazor/blob/main/zanshang.jpg)

## License

[0-BSD](LICENSE)
