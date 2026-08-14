### Changelog

**2.4.4** (2026-08-13)

- **New: Expand/Collapse Sibling Lists or Headings command** — The List Enhancements module adds the command "Expand/Collapse Sibling Lists or Headings", triggerable from the command palette and bindable to a hotkey. Uses the fold state of the list item/heading under the cursor as the baseline: folded → unfold all, unfolded → fold all. The cursor line itself plus every same-level list item/heading in the document (same heading level, or same list indent level) are uniformly switched to the target state; on completion a Notice reports how many sibling headings or lists were actually folded/unfolded. Lines hidden under a folded ancestor, lines already in the target state, and non-foldable lines (no following content) are skipped automatically
- **New: Context Menu module** — A new "Context Menu" tab in the settings panel, alongside the other modules. First toggle "Expand/Collapse Sibling Lists or Headings" (default on): when enabled, a same-named item appears in the Markdown editor right-click menu, executing exactly the same logic as the command-palette command (uses the fold state of the list item/heading under the cursor as the baseline, uniformly folds or unfolds same-level list items/headings across the whole document, then reports the actual count). The menu item reads the toggle live at popup time, so changes apply without reloading the plugin; when disabled, the item disappears from the right-click menu while the command and its hotkey binding remain unaffected
- **Renamed: Settings module names shortened** — Three settings tabs renamed: "Tab Enhancer" → "Tabs", "Statusbar Enhancement" → "Statusbar", "Ribbon Enhancement" → "Left Ribbon". README (CN & EN) and source comments updated in sync. Commands, hotkey bindings, and setting IDs are unaffected
- **New: Typewriter Mode** — New "Typewriter Mode" toggle (default off) in the Tabs settings section. When enabled, the cursor line is kept in the middle band of the page (range centering / dead-zone scrolling): the viewport is split into four equal quarters; the cursor line is left untouched while it sits in the middle quarters 2–3 (25%–75%), and when it falls into the top or bottom quarter it is scrolled to the top of quarter 2 (25% of the viewport) — far fewer scroll operations than precise centering, reducing visual fatigue. Scrolling is skipped while the mouse is pressed/dragging and triggers only after release, so drag-selection is not disturbed. Lines outside the dead zone (top/bottom quarter) are dimmed per the "Outside Dead-Zone Opacity" sub-setting (0-100 slider, default 50, shown only while the mode is on), while lines inside the dead zone and the current line stay bright. Decorations are built from CM6 visible ranges line by line, so only visible lines are processed — low overhead. New command "Toggle Typewriter Mode" (`mdrazor-toggle-typewriter`) can be bound to a hotkey and stays bidirectionally in sync with the settings toggle (the settings switch and sub-setting visibility refresh immediately after a command toggle)
- **New: "Allow Blank Area at Document Top" sub-toggle for Typewriter Mode** — Default on. When enabled, blank space of 1/4 of the viewport height is reserved at the top of the document so the cursor can reach the middle band (top of quarter 2) even on the very first line — the padding size matches the range-centering target, otherwise first-line positioning is clamped by the scroll top edge; when disabled, the original behavior is restored. The blank is part of the scrollable content: it is only visible at the very top of the document and scrolls out of view while editing mid-document, so no editing space is wasted. Implementation: toggles a class on `.cm-editor` and sets a CSS variable, applied by the stylesheet to `.cm-sizer`'s `padding-top` (the content container inside `.cm-scroller`, which also holds the inline title) — the inline title sits below the blank and stays flush with the first line. The value is recomputed only on config/geometry (window, pane resize) changes to avoid forced reflows that cause flicker. Shown only while the mode is on
- **New: Up-key same-level rewind (any depth)** — New rule for "Up/Down Do Not Skip Folded List/Heading Items": when ↑ is pressed while the cursor is on a list item and the line above (or its continuation) belongs to a lower-level (deeper) item — typically the deep tail of the previous same-level item's subtree — the cursor jumps straight to the previous list item at the current level (unfolding it if blocked by a fold) instead of landing inside that deeper subtree. Works at every depth: a level-2 item rewinds to the previous level-2 item when the line above is level 3/4+, a level-3 item to the previous level-3 when facing level 4+, and so on. The backward scan skips continuation lines (soft-break content lines belong to their parent item) and stops only at block boundaries (blank lines, headings, horizontal rules, unindented paragraphs), so jumps never cross list blocks; if no same-level item exists, native behavior is preserved
- **Fix: Option Focus fails after the sibling fold command** — Option Focus only tracked the folds it created itself, so after using "Expand/Collapse Sibling Lists or Headings" (or manual folding), the folds made by that command were invisible to Option Focus, the focus chain could not expand, and Option Focus appeared broken. `applyFolds` now also reads the editor's actual folded state (`foldedRanges`): list items inside the focused block that were folded externally but should be expanded per the focus computation are unfolded along with the plugin's own stale folds, restoring the focus chain; folds outside the block are left untouched. The fold side now checks actual anchors, avoiding conflicts with externally-created fold ranges

**2.4.3** (2026-08-13)

- **New: Settings switched to tabbed sections** — Style Hiding, List Enhancements, Tab Enhancer, and Statusbar Enhancement are now shown as tabs to avoid an over-long settings list; the Orphan Image Cleaner toggle becomes its own "Ribbon Enhancement" module, the fifth tab. The active tab is remembered for the plugin's lifetime
- **New: Scroll Sync** — New "Scroll Sync" toggle (default on) under List Enhancements in settings. When Option Focus folds/unfolds, the cursor's line is scrolled to the vertical center so it never leaves the viewport on long-list relayout
- **New: Up/Down do not skip folded list/heading items** — New toggle under List Enhancements (default on). When the target line is a folded list item or heading content, ↑/↓ actively unfold that block and land on the target line (goal column preserved) instead of CodeMirror's native whole-block skip
- **Fix: Position cache did not survive reloads** — `position-cache.json` is written in flat format (`{path: record}`), but was read back as the wrapped format (`{positions: {...}}`), so the cache was emptied on every plugin load and positions were never restored. The loader now accepts both formats; existing cache files migrate seamlessly
- **New: Folder renames now update the position cache** — When a folder is renamed in the file explorer, every cached record under that folder has its path rewritten to the new folder path, so positions are not lost to the old path
- **Fix: Folder-rename rewrite dropped the path separator** — The rewritten path was joined without the trailing `/`, so normal renames produced a key missing its separator (e.g. `test1/2234MDRazor简介.md`). The separator is restored; when the old path equals the new path (same-name rename), the rewrite is skipped entirely
- **Docs: README adds CHANGELOG link** — Changelog link added before the intro and in the English section; the English section's self-link now points to an in-page anchor

**2.4.2** (2026-08-12)

- **New: MD document cursor & scroll position persistence** — New "MD Document Cursor and Scroll Position Persistence" toggle (default on) under Tab Enhancer in settings. Automatically records each Markdown document's cursor and scroll position and restores them when the document is reopened. Positions are saved once, 250ms after changes settle (continuous changes batch into a single write); the final position is flushed immediately when a tab closes, keeping overhead low. Data is stored in a dedicated `position-cache.json` in the plugin folder, separate from user settings
- **Removed: Push cursor out of hidden-marker boundary on click** — The logic that pushed the cursor out of the entire formatting area when a click landed on a hidden-marker boundary (between marker and content) is removed; clicks now land where Obsidian natively places them

**2.4.1** (2026-08-10)

- **New: Directory Focus first-click quick toggle** — On the first click of a folder, if every folder's collapse state already matches the focus target (the tree is already in the focused shape), the clicked folder's collapse state toggles directly — the same effect as clicking the folder twice; otherwise the full focus normalization runs as before
- **Fix: First click still ran full normalization when the tree was already focused** — The quick toggle depends on reading every folder's current collapse state; a hidden folder (nested under a collapsed ancestor) whose state could not be determined caused a bail-out to full focus, so the quick toggle never fired. State is now read from the DOM `is-collapsed` class first, with the FileItem `collapsed` flag as fallback; an unknown hidden folder is assumed collapsed (its focus target state is always collapsed), making the quick toggle reliable

**2.4.0** (2026-08-09)

- **New: Collapsible "Statusbar Enhancement" settings section** — Now folds/unfolds like the Style Hiding, List Enhancements, and Tab Enhancer sections (heading click or chevron)
- **New: Orphan image cleaner confirm dialog** — After scanning, images are no longer deleted directly; a multi-select dialog (all checked by default) asks for confirmation before deletion. Images left unchecked are added to a whitelist — on the next dialog they stay unchecked and are pinned to the bottom of the list; re-checking removes them from the whitelist
- **New: Four-column table in the confirm dialog** — Columns for checkbox / file path / status (whitelist badge) / thumbnail; clicking a row toggles that row's checkbox; the header checkbox selects/deselects all (with indeterminate state)
- **Change: Single persistent progress notice for scanning** — Consecutive stacked Notices replaced by one persistent notice updated via `setMessage`, no longer flooding the right side
- **Fix: Unpaired HTML tags are not hidden** — For `<font>`/`<u>`/`<span>`, hiding applies only when the opening and closing tags both exist; a lone tag (e.g. `<u>` without `</u>`, or a stray `</u>`) stays visible so unclosed tags are easy to spot
- **Fix: Orphan image cleaner audit errors** — The confirm dialog's inline styles moved to CSS classes (`.mdrazor-orphan-table*` etc.) for theming and maintainability; `ButtonComponent.setDisabled` (requires Obsidian v1.2.3) replaced with direct `buttonEl.disabled` to stay compatible with minAppVersion 1.0.0; confirm callback promise handling normalized (`void | Promise<void>` type + `void` operator), eliminating lint errors
- **Docs: README improvements** — Orphan cleaner now documents the bare wiki-link `[[path]]` reference (four syntaxes total); sponsor image switched to a raw link; removed Technical Stack; merged the English README into the end of the Chinese one; added an English notice at the top

**2.3.8** (2026-08-09)

- **New: Open bookmark in new tab** — Added "Open Bookmark in New Tab" toggle (default on) under Tab Enhancer in settings. Clicking a file bookmark in Obsidian's core Bookmarks view follows the wiki-link logic: if the target file already has an open tab, switch to it; otherwise open in a new tab. Ctrl/Meta/Shift+click, middle/right click restore native Obsidian behavior
- **Fix: "Default New Tab Open" toggle did not take effect immediately** — The old implementation skipped handler registration entirely when the toggle was off at plugin load, so re-enabling it later left the file-explorer click handler absent and the feature dead until reload. Handlers are now attached unconditionally and re-read the toggle at event time (same pattern as the wiki-link opener), so the toggle takes effect instantly in both directions
- **Fix: File explorer Shift+click multi-select broke with "Default New Tab Open" on** — The old implementation intercepted native clicks with `stopImmediatePropagation`, which also blocked Obsidian's native selection and Shift+click range-select anchor updates, corrupting range selection. Native clicks are no longer blocked; a scoped `WorkspaceLeaf.openFile` patch re-routes the native open to the enhancer target (switch to existing tab / open new tab), preserving native selection and the range-select anchor
- **Refactor: Open re-route extracted to a shared module** — The `WorkspaceLeaf.openFile` / `Workspace.openLinkText` patches moved into the shared `open-in-tab.ts` module, reused by both the file-explorer and bookmark features
- **Fix: Bookmark item data-path holds the note title, not the file path** — A bookmark item's `data-path` stores the note title (filename minus extension), so exact-path resolution failed and bookmark interception was dead. Resolution now uses `metadataCache.getFirstLinkpathDest()` (the wiki-link resolver) to map the title to the real file path

**2.3.7** (2026-08-07)

- **Fix: Space visualization collided with hidden HTML tags** — Space visualization also rendered spaces inside hidden format markers (e.g. `<span style="...">`) as `·`, leaving visible dots inside hidden tags. Spaces within hidden ranges are now skipped and hidden along with the tag
- **Fix: Boundary hint tooltip did not render spaces as `·`** — When the cursor is at a hidden-marker boundary, spaces inside the marker text shown in the tooltip were unreadable. With space visualization enabled, tooltip spaces now render as `·` too; toggling the switch refreshes the tooltip immediately, no stale rendering
- **Fix: Boundary hint tooltip showed duplicate characters (`***` → `****`)** — Combined markers (e.g. bold+italic `***`) consist of overlapping/adjacent decorations; concatenating per-decoration slices double-counted the overlap. The tooltip now slices the whole contiguous hidden block once, so displayed characters exactly match the real markers
- **Fix: Space left of the cursor disappeared in the boundary hint tooltip** — The left segment was trimmed of trailing whitespace, deleting a space when the cursor sat to its right. Only the block's trailing whitespace is trimmed now (e.g. heading markers), the left segment is preserved verbatim

**2.3.6** (2026-08-03)

- **New: Hide HTML inline tags** — Added "Hide HTML Inline Tags" toggle (default on) under Style Hiding in settings. Hides `<span>` and `</span>` HTML tag pairs in live preview, covering opening tags with arbitrary attributes (e.g. `style="color:var(--color-yellow)"`, `style="color:#b58900"`, `style="background-color:rgba(...)"`, `style="text-decoration:underline"`). Uses regex scanning instead of CM6 syntax tree; `<span>` inside fenced code blocks, inline code, and math is treated as literal text and skipped. Included in the format toggle button's toggle-all list; the symbol boundary hint shows the full tag string (with attributes) verbatim, no truncation
- **Fix: Text inside HTML tags disappeared after the cursor passed through** — HTML tag hiding switched from `Decoration.replace` to `Decoration.mark` + CSS. Root cause: the opening tag's replace decoration collided with Obsidian's inline-HTML render widget (`cm-html-embed`) at the same start position, shadowing the widget so its rendered text vanished after cursor interaction. All three HTML tag types (`<span>`/`<u>`/`<font>`) now hide via marks, compatible with Obsidian's rendering mechanism
- **Fix: Format toggle button and settings switches fell out of sync** — The status bar "Format Toggle Button" and the Style Hiding switches in settings are now bidirectionally synchronized: toggling any individual switch instantly refreshes the button icon; a one-click toggle from the button or command re-syncs the settings switches' display

**2.3.5** (2026-08-02)

- **Fix: Files containing lines with coexisting math and bold markers fail to open** — When inline math (`$..$`) and bold (`**..**`) coexist on one line (e.g. `` `- $f(x)$的**周期**$l$` ``), Obsidian's parser emits an anomalous syntax-tree node spanning a line break. The format hider built a `Decoration.replace()` whose range contains `\n`, making CodeMirror 6 throw and fail editor (and file) initialization. Ranges crossing a line boundary are now skipped, so the file opens normally
- **Fix: Wrong symbol boundary hint content at the bold/latex boundary** — The same parser anomaly lets formatting-node ranges include latex content (e.g. `$l$`), so the tooltip displayed math text as if it were a hidden marker. Markers are now validated against their real marker characters (`**`/`*`/`==`/`~~`/`` ` ``/`\`/`[[`/`]]`/`#`) before hiding; non-matching nodes are skipped, so non-marker content is never hidden

**2.3.4** (2026-07-31)

- **Fix: Right-click on wiki link no longer opens new tab** — Added `e.button !== 0` check to `pointerdown`/`mousedown`/`click` handler; only left-click triggers tab opening, context menu works correctly on right-click
- **Enhance: Symbol boundary hint CSS specificity increased** — `.mdrazor-boundary-hint` selector raised from `(0,1,0)` to `(0,2,0)` to prevent style overrides
- **Docs: Version history extracted to dedicated CHANGELOG files** — Version history moved from README to dedicated CHANGELOG.md (Chinese) and CHANGELOG.en.md (English), keeping README concise

**2.3.3** (2026-07-27)

- **Fix: Vertical tab close button no longer closes sidebar note properties panel** — `closeTab()` uses `isInMainArea` DOM containment check to skip sidebar leaves, preventing wrongful detachment of the note properties view
- **New: Close active tab auto-focuses previous tab** — Clicking the close button on the currently active tab in vertical tabs now automatically activates the previous tab (left neighbor in tab order; if first tab was closed, activates the next). Matches Obsidian native top tab bar behavior

**2.3.2** (2026-07-26)

- **New: Hide HTML underline tags** — Added "Hide HTML Underline Tags" toggle (default on) under Style Hiding in settings. Hides `<u>` and `</u>` HTML underline tag pairs in live preview. Uses regex scanning instead of CM6 syntax tree iteration. Included in the format toggle button's toggle-all list

**2.3.1** (2026-07-26)

- **New: Symbol Boundary Hint** — Added "Symbol Boundary Hint" toggle under Style Hiding in settings. When the cursor is at the boundary between a hidden formatting marker and its content, a small tooltip appears below the cursor showing the markers on both sides. Uses CM6 `showTooltip` system — auto-repositions on scroll and cleans up on editor destroy
- **Fix: Tooltip scroll tracking + tab-switch persistence** — Replaced manual `position: fixed` tooltip DOM management with CM6's native `showTooltip` system, which handles scroll repositioning and editor lifecycle automatically
- **Fix: Duplicate characters in bold/italic/highlight/strikethrough tooltip** — Added `seenRanges` dedup in `getHintMarkers()` to skip open+close decorations at identical ranges
- **Fix: Error "Calls to EditorView.update are not allowed while an update is in progress"** — Wrapped `view.dispatch()` in `updateHint()` and `clearHint()` inside `queueMicrotask` to prevent recursive dispatch during update cycles
- **Fix: Duplicate CM6 instances from incorrect build config** — Switched from inline `--external:obsidian` esbuild command to `esbuild.config.mjs` which properly externalizes all CM6 packages
- **Refactor: cursor-boundary-hint.ts rewritten to CM6 StateEffect/StateField/showTooltip architecture** — Removed manual DOM management, fully leverages CM6 built-in tooltip system

**2.3.0** (2026-07-24)

- **Fix: All folders collapsed when switching from VT back to file list (toggle OFF)** — Removed the flawed snapshot-restore cycle. Real fileItems are never modified during VT (hidden via CSS `display:none`), and Obsidian's virtual scrolling means many folders have no DOM nodes — snapshot defaulted them to collapsed. Now toggle OFF skips sync entirely; original collapse states remain intact
- **Fix: Directory focus toggle required Obsidian restart to take effect** — Removed early `if (!enabled()) return` in `registerDirFocus()`. Handler is always registered; `enabled()` guard is checked per-click, so toggling is instant
- **Refactor: Decoration building changed to collect → sort → single-pass RangeSetBuilder** — Eliminated separate `colorBuilder` branch and `RangeSet.join()`, ensuring deterministic write order

**2.2.0** (2026-07-23)

- **New: Hide HTML color tags** — Added "Hide HTML Color Tags" toggle (default on) under Style Hiding in settings. Hides `<font color="#c00000">` and `</font>` Hex color tag pairs in live preview. Uses regex scanning instead of CM6 syntax tree iteration, supporting any Hex color value (3-8 hex digits). Included in the format toggle button's toggle-all list
- **New: Vertical tab close button hover effect** — Close button now has hover background `var(--background-modifier-hover)`, default icon color `var(--tab-text-color-focused-active)`, and hover icon color `var(--tab-text-color-focused-active-current)`. Cursor changed from `pointer` to `default`
- **New: Collapsible status bar section in settings** — The "Statusbar Enhancement" section heading is now collapsible/expandable, consistent with the other sections (Style Hiding, List Enhancements, Tab Enhancer). Chevron icon click correctly toggles folding
- **Fix: Collapsible section heading click occasionally not triggering fold** — Removed the separately registered `onClick` handler from the chevron extra button and the `.clickable-icon` early-return guard. The heading text area and chevron icon area now share a single click listener, eliminating race conditions between two competing click paths

**2.1.9** (2026-07-21)

- **New: Open wiki link in new tab** — Added "Open wiki link in new tab" toggle (default on) under Tab Enhancement in settings. When clicking a wiki link (including plain `[[page]]`, aliased `[[page|alias]]`, and block references `[[page#^blockid]]`) in a document, the plugin detects whether the target file already has an open tab: if so, switches to that tab with block-level scroll positioning (for block references); otherwise opens in a new tab. Ctrl/Meta+click bypasses to native Obsidian behavior.
- **Fix: Link target resolution for aliased and block ref links** — Uses CM6 editor source text as primary strategy to extract the full wiki link target including subpath (`#^blockid`). Handles DOM structure where `.cm-hmd-blockref-link` is a sibling of `.cm-hmd-internal-link`. Subpath preserved in `OpenViewState.eState` for correct block-level navigation.

**2.1.8** (2026-07-15)

- **New: Format toggle button** — Added "Format Toggle Button" toggle (default off) under Statusbar Enhancement in settings. When enabled, a "标识" button appears at the leftmost position of the status bar. Icon shows `square-dashed-mouse-pointer` (any format hiding active) or `square-mouse-pointer` (all off). Toggles all format hiding styles (bold, italic, highlight, strikethrough, code, escape, heading, wiki link) at once; whitespace visualization (showWhitespace) is excluded. Command palette command `mdrazor-toggle-formatting` is permanently registered for hotkey binding. Settings toggle only controls button visibility.
- **New: Format toggle hover style** — Same hover background, border-radius, text color as sidebar toggle button
- **Change: Sidebar toggle icon** — Changed from `columns-3` to `gallery-horizontal`

**2.1.7** (2026-07-14)

- **New: Direct children count toggle** — Added sub-toggle under "Show directory file count" to switch between counting direct children (sub-folders + files) or all descendant files recursively
- **New: Right-click new file opens in new tab** — Right-click "New file" in file explorer now opens the created file in a new tab instead of replacing the current tab
- **Fix: Directory file count lost when expanding collapsed folders** — Replaced one-shot DOM scanning with MutationObserver + attribute change listener, ensuring file counts appear immediately when folders are expanded in the virtual-scrolled file explorer
- **Fix: Directory file count not refreshed after plugin reload** — Initial scan uses a RAF loop with retries to cover React virtual scrolling async rendering delays
- **Fix: Directory file count missed due to React data-path timing** — Deferred badge creation via setTimeout(0) + 50ms retry, ensuring Obsidian's React renderer finishes writing attributes before processing
- **Fix: Dir-focus documentation corrected** — README, settings panel, and source comments all synchronized to actual behavior (only keeps ancestor chain + clicked folder expanded, no descendant expansion)

**2.1.6** (2026-07-14)

- **Refactor: Status bar buttons now use native Obsidian Lucide icons** — Sidebar toggle SVG replaced with `columns-3` icon, workspace switcher SVG replaced with `panels-top-left` icon. Native icons auto-adapt to Obsidian theme and dark mode
- **New: Sidebar toggle shows "侧栏" label** — Text label next to the icon makes button purpose clear
- **New: Sidebar toggle native hover shadow** — Background + rounded corners on hover, matching Obsidian native status bar buttons
- **Consistent: Button icon-text gap** — Both buttons use `gap: 4px`, visually uniform

**2.1.5** (2026-07-12)

- **Fix: Workspace switch corrupts layout after restart** — When Obsidian restarts with workspace 2 active, `currentWorkspaceName` was wrongly initialized to the first workspace name. Switching would auto-save current layout (workspace 2) into workspace 1 slot, corrupting both. Fix `findCurrentWorkspace` to read workspace plugin's internal `activeWorkspace` property first, instead of defaulting to first workspace

**2.1.4** (2026-07-08)

- **Fix: Vertical tab close button broken after file rename** — Close button closure captured old path, `closeTab(oldPath)` found no leaf after rename. Store path as `data-path` attribute, read at click time; `refreshCloseButtons` updates attribute in-place instead of DOM replace, avoiding MutationObserver infinite loop that froze Obsidian

**2.1.3** (2026-07-07)

- **New: Sync VT folder collapse state back to file explorer on exit** — When switching from "tabs-only" back to file list view, folders expanded in VT stay expanded, folders collapsed in VT and folders not shown in VT are all collapsed, keeping browsing state consistent

**2.1.2** (2026-07-06)

- **New: Hide wiki link formatting** — Added "Hide Wiki Link Brackets" toggle under "Format Hider" in the settings panel. Hides `[[` and `]]` formatting markers in Live Preview, with cursor exclusion (clicking at the boundary between a bracket and content pushes the cursor outside the marker). The `|` separator in `[[page|alias]]` remains visible
- **Fix: Orphan image cleaner missed bare link references** — `[[image.png]]` (wiki links without `!`) are now counted as image references. Previously only `![[embed]]` / `![md](img)` / `<img>` patterns were matched, causing images referenced via bare wiki links to be falsely flagged as orphaned

**2.1.0** (2026-07-05)

- **New: Auto-save workspace layout** — Automatically saves the current workspace layout before switching to or loading another workspace. Intercepts Obsidian's native "Load Workspace" via monkey-patching `loadWorkspace`, and also integrates with the plugin's own status-bar workspace switcher. Independent toggle under "Statusbar Enhancement" in the settings panel, enabled by default

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
