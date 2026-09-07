### Changelog

**2.5.15** (2026-09-08)

- **New toggle: Backspace Promotes List Level (on by default)** — When Backspace is pressed with the cursor at the right boundary of the integrated list marker unit (`- |` / `- [ ] |`, i.e. the content start where List Integration parks the cursor), the marker is no longer deleted wholesale; instead a progressive chain runs, one step per press: ① task items have their checkbox stripped first — `- [ ] |` → `- |`, with level, indent and content untouched (ordered task items likewise keep their ordered marker, `1. [ ] ` → `1. `); ② a plain list item is promoted level by level — one level per press, the whole line's indent replaced with the parent indent, content kept and its subtree carried along; **items with content are promoted too** (a following former sibling becomes a child of the promoted item due to indentation — the same line-level semantics as Obsidian's native Shift+Tab; level 3 → 2, level 2 → 1); ③ with no shallower-indent list line above (treated as top level) → the list format is removed outright — leading indent and marker deleted, content kept. On by default: after upgrading, right-boundary Backspace switches from "delete wholesale" to this chain (whole-marker deletion at the boundary is still reachable by promoting to the top level and pressing Backspace once more).
- Implementation & gating: the chain triggers when a single cursor sits exactly on the line's atomic-range right endpoint (`r.to === pos`), checked at the very front of the existing Backspace handler — misses fall through to the original logic (whole-marker deletion, blank-continuation merge) with zero behavior change. Requires List Integration (with it off, the handler never runs and Backspace is fully native); with Checkbox Integration off the task item has no merged boundary (`- [ ]` is not atomic), so the chain only starts taking effect from the `- |` position. The parent-indent scan is extracted into the shared `findParentListIndent` (shared.ts), now also used by the Enter soft break's Feature 3 (Enter-promote of consecutive empty items) with unchanged behavior (no parent still promotes to column 0; the differing null interpretation — "top level, delete format" for Backspace vs "promote to column 0" for Enter — is intentional: Enter is the exit-list cleanup flow, Backspace an explicit format-unwinding chain).

- **Checkbox inheritance for the Enter soft break** — "Blank continuation line upgraded to a list item" (pressing Enter again to create a new list item) previously always produced a plain list item (`- `): after a soft break inside a task item (`- [ ] `), the next Enter lost the checkbox. This release checks whether the owning list item's first line has a task checkbox right after its marker (`[ ]`/`[x]`/`[X]`); if so, the newly created list item also starts with a checkbox (`- [ ] `), always unchecked — matching Obsidian's native behavior when pressing Enter at the end of a task item (checked items `[x]`/`[X]` likewise produce an unchecked item). Works for ordered-list task items (`1. [ ] `) at any indent level; Feature 1 (the soft-break continuation line itself), Feature 3 (promoting/clearing blank list items) and the atomic ranges of checkbox integration are unaffected.
- **Fix: wrong indent source in the first implementation of Backspace Level Promotion (caught in real-world testing, fixed before this release)** — The first version extracted the indent from the atomic-range text, but the `formatting-list` atomic node starts at the marker character and **excludes the line's leading indent** (the indent is what precedes the node). The parent-indent scan therefore always received an empty current indent, its "strictly smaller indent" condition never matched, and Backspace at the right boundary deleted the list format plus all indentation at every level instead of promoting step by step. The fix compares levels using the leading indent of `line.text`, with an in-code note documenting that atomic-range text contains no leading indent; the level-3 → level-2 → level-1 → format-removed chain now works as designed.

**2.5.12** (2026-09-04)

- **Fix: the real root cause of "dragging right from the lower half of the cursor's line selects the next line"** — The "stale height map" hypothesis of 2.5.11 was disproven (it reproduces even with Style Tuner 1.0.3 producer-side remeasure and the 2.5.10 `css-change` net active — the map is fresh, so remeasuring can't help). The actual mechanism is **independent of the height map**: Chrome's `caretPositionFromPoint` snaps positions in the **lower half of a line box** (the empty area below the text row) to the **start of the next line**; CM6's `isSuspiciousChromeCaretResult` (@codemirror/view 3681-3695) is supposed to reject that result — but the check requires the offset-0 node to traverse a "firstChild chain" up to `.cm-line` (`parent.firstChild != cur` abandons the suspicion), and **lines starting with an element node break the chain**: Obsidian Live Preview list bullets (`.list-bullet`) and MDRazor's hidden-HTML-tag mark decorations (`mdrazor-html-tag-hidden` span) create such leading nodes. The wrong result is accepted → the click lands on the next line; while dragging, `MouseSelection` rebuilds the selection through the same fooled `posAtCoords` on every mousemove (≥10px) → **the whole selection falls to the next line** (the 2.5.9 microtask heal fixes clicks only — the first drag move overwrites it; 2.5.11's sync remeasure is useless when the map is already fresh).
- **Fix: Click Sync upgraded to an all-drag-period DOM-truth correction** — The mousedown microtask records the DOM-truth anchor (`healedPosAt`: browser caret → `posAtDOM` mapping → retry at the line's text midline → line-start fallback); during a drag, a document-level `mousemove` listener compares, in a microtask (same event task, before paint), the selection's two endpoint **lines against the DOM-truth lines**, and rebuilds the selection from the truth when they disagree (`{anchor: min, head: max}`, matching CM6's native non-extend drag semantics; `userEvent: 'select.pointer'`). Self-gating: when the native result is correct (endpoint lines match) it does nothing — zero extra dispatches for normal drags; it stops on mouseup/pointercancel/new click. The 2.5.11 sync remeasure (for the stale-map family) and the click heal are kept.
- Note: Style Tuner 1.0.3 (producer remeasure) and MDRazor 2.5.10 (`css-change` net) were not wrong fixes — they guard the "stale height map" family; this symptom has a **different root cause** that remeasuring cannot address.

**2.5.11** (2026-09-04)

- **Fix: dragging right from the lower half of the cursor's line selects the next line** — Same "stale height map" family as 2.5.7/2.5.9/2.5.10, in the drag scenario. Mechanism: CM6's native click selection and drag extension (`basicMouseSelection`/`MouseSelection`) call `queryPos = posAtCoords(precise=false)` on **mousedown and on every mousemove**, picking the block via the height map (`elementAtHeight`) — when the map is stale, the "lower half" of a line is mapped onto the next line: the click lands on the wrong line, and **holding and dragging puts the whole selection (anchor and head both from the same stale mapping) onto the next line**. The 2.5.9 microtask heal only corrected the anchor at click time; the first drag move (≥10px) rebuilt the selection from the stale `start.pos` via a native `select.pointer` dispatch, clobbering the correction.
- **Fix: staleness check on mousedown + synchronous height-map re-measure** — On mousedown, the click's DOM-truth line start (`view.posAtDOM`, independent of the height map) is compared against the height-map result (`posAtCoords(precise=false)`); when they differ, the plugin calls CM6's internal `view.measure()` (the synchronous variant of the measure-request callback: its measure loop rebuilds the height map directly from the current real DOM geometry, all within one call). Plugin handlers run before the native mousedown handler (`computeHandlers`: plugins first, globals last), so the map is fresh within the same event dispatch — **this click and the whole drag (every move extension) now use the new map**, no per-frame correction needed, and all native behavior (drag-selection, double/triple click, shift-extend, edge autoscroll) is preserved. `measure()` is a CM6 `@internal` API (stable since 6.0; Obsidian pins its version), guarded with a `typeof` check and try/catch; on failure it degrades to the existing microtask heal (clicks still corrected; drags not self-healing).
- Strict triggers (as in 2.5.9): left single click only (button 0, detail ≤ 1), no modifier keys, skipping fold indicators/toggles and nested editors; **when the map is accurate (map line === DOM line) it does nothing** — zero extra measurement cost in the normal case.

**2.5.10** (2026-09-04)

- **Fix: Measure Guard gains the semantic `css-change` channel** — The 2.5.9 guard catches style injections through DOM observers (head mutations; `html`/`body` `class`/`style` attributes), which still leaves two blind spots: ① the injection window before the observers attach (plugin load-order race); ② paths that emit an event without an observable DOM mutation. This release also subscribes to the workspace `css-change` event (`plugin.app.workspace.on('css-change', schedule)`, sharing the same 200ms debounce scheduler): Obsidian core (theme switches, snippet reloads) and plugins (e.g. the Style Settings family, which fires `{source:"style-settings"}` right after writing CSS variables into `body`'s inline styles) emit it at the exact moment the styles take effect — semantically precise and independent of DOM-observer timing, closing both blind spots. Together with the 2.5.9 `html`/`body` attribute observers and Click Sync, the stale-height-map window shrinks from "until the next scroll/edit" to at most one debounce cycle.
- Note: the matching producer-side fix (explicit `requestMeasure` after applying styles) landed in the Style Settings family (Style Tuner 1.0.3); this guard is the generic safety net covering **every** style-change party that fires `css-change`.

**2.5.9** (2026-09-04)

- **Fix: clicking the lower half of the line above the cursor no longer moves the cursor up** — Same "stale height map" family as 2.5.7; this closes that fix's blind spots. Mechanism: CM6's `posAtCoords` first picks a block via the height map (which may be the wrong line when stale) and then refines with the browser's `caretPositionFromPoint` — but Chrome's "positions in the gap between lines are moved to the start of the next line" heuristic (CM6 `isSuspiciousChromeCaretResult`) rejects the accurate result for clicks below the line's text (its lower half) and falls back to the stale-map block, so clicking the lower half of the line above landed on the current line. This release adds **Click Sync** (always on, no setting): hooked on `mousedown`, in an event microtask it checks — when the cursor line differs from the clicked line and there is no selection (drag) — maps the click's browser caret back to the document via **real-DOM mapping** (`view.posAtDOM` = CM6 `posFromDOM`: real DOM tree + decoration-segment bookkeeping, independent of the height map, column-precise) and corrects the selection; when the height map is accurate it does nothing. Timing matters: `mousedown` (not `pointerdown` — pointerdown fires first and the microtask would run before CM6's native click selection, then be overwritten). Strict triggers: left single click only (button 0, detail ≤ 1), no modifier keys, skipping fold indicators/fold toggles and nested editors (embeds containing embedded CM6); column comes from the native caret at the click point (retried at the line's text center when the caret degenerates to the next line, falling back to the line start).
- **Fix: Measure Guard blind spots closed** — The 2.5.7 guard only observed `<head>` (childList + subtree + characterData), missing: ① in-place `attributes` changes on existing `<link href>`/`<style>` elements; ② `class`/`style` attribute changes on `<html>`/`<body>` (theme dark/light switches, layout classes, `setCssProps` inline styles — all outside `<head>`). The head observer now passes `attributes: true`, and new observers watch `document.documentElement` and `document.body` for `class`/`style` attributes (sharing the same 200ms debounce scheduler), shrinking the stale-map window at the source.

**2.5.8** (2026-09-04)

- **Fix: "Focus Mode" fold computation crashed with RangeError: Invalid position** — Console error `Uncaught RangeError: Invalid position 5931 in document of length 5930`, stack `recomputeFolds → computeFoldRanges → lineAt`. When a note does not end with a newline and its last line is a soft-wrapped continuation of the final list subtree, the continuation scan reached the last line (`to === doc.length`) and still called `doc.lineAt(scanLine.to + 1)` — position `doc.length + 1` is out of bounds and CM6 throws. Fix: before advancing, the scan now stops when `scanLine.to >= doc.length` (that line is already included in the fold range and there is no next line); the same guard was added to both scan branches (inter-sibling continuation scan and last-subtree continuation scan). Documents ending with a newline are unaffected (they already stop at the final empty line).

**2.5.7** (2026-09-01)

- **New: Editor Measure Guard (always on, no setting)** — Root-cause cure for "clicking the upper half of a line lands on the previous line". CM6's height map (Y → line mapping) is only recomputed on content/scroll/viewport changes, so *late reflows* (CSS snippet reloads, theme switches, delayed plugin style injection, late-loading web fonts) fix the visual layout while the height map stays stale — click-to-position mapping then drifts by about one line (taller lines: clicking line N's top lands in N+1; shorter: N−1), and no-op cursor transactions (clicks, arrow keys with no text change) never re-measure, so the offset persists until scroll, edit, or restart (previously only an Obsidian restart relieved it). Implementation: a MutationObserver on `<head>` (childList + subtree + characterData, covering `<style>` text replacement and new style tags) plus a `document.fonts` `loadingdone` listener (CM6 attaches its font-ready listener only at editor construction), then after a 200ms debounce every Markdown leaf is visited: `EditorView.findFromDOM` locates the editor and `requestMeasure()` forces a height-map refresh. Always on, zero idle cost, cleaned up on plugin unload.
- **Improved: Current Line Highlight** — Main selector upgraded to `.cm-editor.cm-focused .cm-line:is(.cm-active, .cm-activeLine)`, matching both Obsidian's custom `.cm-active` line decoration and CM6's standard `.cm-activeLine` (both appear on the current line) so the hit works across Obsidian versions/themes. Outward glow 20px → 22px, also applied to the mouse/scroll line highlight. 8px rounded capsule unchanged; CM5/fat-cursor variants kept for old-version compatibility; the background variable falls back to 5% theme-color translucency when undefined.
- **Fix: Current-line highlight stayed visible after the editor lost focus** — The old `.cm-active.cm-line` path had no focus gate, so the highlight persisted after clicking the sidebar. The main path now requires `.cm-editor.cm-focused`, and a new `.cm-editor:not(.cm-focused)` rule clears the background/outward shadow/capsule mask on blur.
- **Note**: The style stays in sync with the Custom.css `activeline-highlight` snippet (focus gate / blur clear / dual class / 22px). The "Highlight Current Line" setting description was updated in both languages (shown only while focused, auto-clears on blur, 22px outward glow).

**2.5.4** (2026-08-29)

- **New: Lazy-load config dormancy — disabled plugins keep their delay settings** — Previously, disabling a plugin in Settings → Community Plugins deleted its lazy-load delay config, and re-enabling the plugin required re-entering the delay. Delay configs are now decoupled from plugin enable state: disabling marks the config "dormant" (delay kept; the entry dims in the list), and re-enabling the plugin automatically restores "managed" state via the resident watcher, so lazy loading takes effect again on the next Obsidian start without re-entering the delay. Implementation notes: a lazily-managed plugin's persisted switch is always "off" (MDRazor calls disablePluginAndSave itself), indistinguishable from a user-disabled plugin via Obsidian's enabledPlugins — hence each config entry gains a persistent active flag (absent = managed; false = dormant). External disable/enable detection reuses the 2.5.3 watchdog polling with all anti-false-positive mechanisms kept (two-tick streak confirmation, session load seeding, safe-mode bulk-teardown sentinel); the action changes from "delete config" to "mark dormant". Poll interval 2s → 500ms (worst case ~1s to settle), and polling now also runs while the master switch is off, closing a 2.5.3 gap (plugins disabled while the switch was off kept a stale managed state and would be wrongly relaunched after re-enabling the switch). Turning the master switch off or uninstalling MDRazor restores only "managed" plugins to natural loading; dormant entries stay disabled (never starting plugins the user disabled themselves). Legacy enabled:false entries from 2.5.3 keep their zero-delay migration (at that time that meant the user had confirmed no lazy loading)
- **New: Plugin-directory mirror fallback for settings & position cache** — Every write to `.obsidian/md-razor-settings.json` and `.obsidian/md-razor-position-cache.json` now also maintains a read-only mirror inside the plugin folder (named `data.json` / `position-cache.json`). When the main file under the config dir is lost or corrupted, it is restored from the mirror; a healthy main file always wins. Mirror write failures never affect the main flow; restoration triggers only once when the main file is unparseable, with logging. Use case: sync clients / cleanup tools that mistakenly remove non-standard files under `.obsidian` — settings and cursor positions can be fully recovered from the mirror
- **New: "Symbol Boundary Hint" toggle in settings** — The Symbol Boundary Hint feature existed since 2.3.1 but had no settings entry (always on). An independent toggle (default on) is now provided in the Style Hiding section
- **Fix: Plugin failed to load after restart (scalar-JSON crash in position cache)** — When `.obsidian/md-razor-position-cache.json` contained a scalar JSON value (null / number / string / array), the loader had no type defense: null slipped past the catch into the module-level cache, and a later `Object.keys(cache)` threw a TypeError, failing onload — Obsidian then reports "plugin failed to load". This matches the reported "works on first install, fails after restart" symptom (that report had several candidate causes; this is one confirmed reproducible path, now hardened). The loader now type-checks after parsing and treats scalars as an empty cache; the prune-stale-records section is wrapped in its own try/catch so any failure there can no longer abort onload
- **Fix: Startup time always "not measured"** — In the Check Now modal, plugins going through the disable → re-enable → restart path always showed "not measured". Root cause was a startup race: a restored plugin stays persisted in community-plugins.json (re-enabling persisted it), so on restart, if it loaded after MDRazor in Obsidian's own startup sequence, MDRazor's scheduled load found the instance already present and enablePlugin was silently deduplicated (returns early when plugins[id] exists), producing no loadingPluginId window for the timer to observe. Fix: when a scheduled load finds the plugin already loaded, it now re-queues a flip (unload → measure → reload) so a measurement is never lost
- **Fix: Startup times wildly wrong (0ms / 1000+ms / inflated values)** — All three symptoms shared one root: `app.plugins.loadingPluginId` is a single-slot field (confirmed by reversing the local obsidian.asar / app.js). Concurrently triggered loads (scheduled loads, startup flips, restore reloads) overwrote each other's slot — a window preempted by another load settled as 0ms; a window polluted by other plugins' reload main-thread contention came out inflated; and the old "instance appeared" fallback measured "trigger time → instance appeared", which includes main.js read + eval but misses onload, systematically distorting fast plugins. Reworked into a **global serialized load queue**: all enable / flip / restore jobs are queued, and the next job starts only after the previous job's measurement Promise resolves (loading window closed) — windows are now clean. Each job waits for the loadingPluginId slot to idle first (≤10s), no longer colliding with Obsidian's own startup sequence. Timer poll interval 20ms → 5ms (baseline bias reduced from ±20–40ms to ≤5ms). The "instance appeared" fallback is removed: when no window is captured the measurement is abandoned (shown as "not measured") rather than displaying a distorted number. The hard timeout uses a native setTimeout (not registerInterval — plugin unload clears registered intervals, which would otherwise deadlock the queue on a never-resolving Promise)
- **Note**: Technical basis (local obsidian.asar / app.js): enablePlugin sets loadingPluginId = id → loadPlugin (reads main.js → window.eval parses the bundle → instantiates → plugins[id] = n → await n.load() i.e. onload → loadCSS) → sets null; both enablePlugin and loadPlugin dedupe-short-circuit when plugins[id] exists, producing no loading window; unloadPlugin synchronously deletes plugins[id]. The loadingPluginId window itself covers IO + eval + onload correctly — the distortion came from concurrent slot stomping and the fallback approximation, not from window semantics

**2.4.6** (2026-08-19)

- **Fix: Position cache cleared after restarting Obsidian** — position-cache.json losing all records across a restart, traced to two root causes:
  1. **Load/write race** — The editor extension was registered (and started tracking) before the async cache load finished: the initial selection/scroll of open documents triggered record writes that, before loading completed (up to ~1s on large vaults), overwrote the real, complete position-cache.json on disk with a "partial cache" holding only the currently open files; the loader then read that corrupted data back. Now, disk writes are blocked until loading completes (`loaded` gate + write guard), and the extension is registered **only after** the cache has finished loading — eliminating the concurrent-overwrite race at the root; records written by editors during the load window are preserved by a merge instead of being dropped
  2. **Early-startup deletion of all records** — On load, records for files no longer in the vault are pruned; if pruning ran before the vault file index was populated, `getAbstractFileByPath` returned empty for every path and deleted **all** records, then wrote an empty cache. Pruning now runs only once the vault index is ready (`getFiles().length > 0`); when the index is not ready it is skipped and old records are kept, to be cleaned on the next normal flush (triggered by a user edit)
- **Note**: The fix covers both clearing paths (race overwrite and early-startup deletion); already-corrupted cache files rebuild naturally from new records after a clean full restart

**2.4.5** (2026-08-15)

- **New: Changelog popup after update** — When the plugin is updated to a new version, a popup window showing what's new (the latest CHANGELOG section) appears on first launch after the update; once dismissed, the seen version is remembered and it never pops up again for the same version. The changelog text is bundled into main.js at build time — Community-market installs only receive main.js, manifest.json, and styles.css, and the plugin folder holds no CHANGELOG.md, so the bundled copy is required
- **Fix: Changelog popup polished** — The popup now renders the changelog as formatted Markdown (headings, bold, lists, and inline code display properly instead of raw text); it now appears only once, on the first launch after a plugin version update — the seen version is persisted to disk before the popup opens, so plugin reloads and Obsidian restarts no longer trigger it
- **Reworked: Typewriter Mode now uses a "dead zone" design** — The former "cursor line stays vertically centered" is replaced by a "focused middle reading band": the viewport is split into a top eighth, a middle 3/4, and a bottom eighth; lines outside the dead zone (12.5%–87.5%, i.e. the top/bottom eighth) are dimmed per the "Outside Dead-Zone Opacity" sub-setting (renamed from "Non-Current Line Opacity", 0-100 slider, default 50, shown only while the mode is on), while lines inside the dead zone and the current line stay bright. The cursor's visual position is maintained across lines (base behavior, always on): entering the top eighth scrolls it back to the dead zone's top edge (12.5%); entering the bottom eighth scrolls it back to the bottom edge (87.5%) by default. Scrolling is skipped while the mouse is pressed/dragging and triggers after release
- **New: "Dead-Zone Bottom Edge Jump to Top Edge" sub-toggle for Typewriter Mode** — Default off. When enabled, the cursor jumps to the top edge (12.5%) when it crosses the dead zone's bottom edge (87.5%), instead of scrolling back to the bottom edge to maintain the visual position
- **Changed: "Allow Blank Area at Document Top" blank now equals 1/8 viewport height** — Matches the dead-zone top-edge target (previously (viewport height − line height) / 2), so the cursor can reach the middle band even on the very first line. The blank is part of the scrollable content: visible only at the very top of the document, it scrolls out of view while editing mid-document and wastes no editing space
- **Fix: Multiple Typewriter Mode stability issues** — top-blank flicker (recomputed only on config/geometry changes, avoiding forced reflows); clicking blank areas outside `.cm-content` blurred the editor and broke the top blank (capture-phase mousedown now prevents default); dim boundary lag/misalignment (dimming and scroll judgment share one geometry model; decorations rebuild live on scroll); dimming did not track the viewport during pure scrolling (empty dispatch via requestAnimationFrame after scroll); reading layout during a CM6 update threw an error (layout reads deferred to a microtask); soft-wrapped long lines crossing the dead zone did not trigger the jump (now checked on every cursor move/doc change)
- **Changed: Scroll Sync target now 25% of the viewport** — When Option Focus folds/unfolds, the cursor's line is scrolled to 25% of the viewport height (previously the screen center) — a smaller scroll, less disruptive

**2.4.4** (2026-08-13)

- **New: Expand/Collapse Sibling Lists or Headings command** — The List Enhancements module adds the command "Expand/Collapse Sibling Lists or Headings", triggerable from the command palette and bindable to a hotkey. Uses the fold state of the list item/heading under the cursor as the baseline: folded → unfold all, unfolded → fold all. The cursor line itself plus every same-level list item/heading in the document (same heading level, or same list indent level) are uniformly switched to the target state; on completion a Notice reports how many sibling headings or lists were actually folded/unfolded. Lines hidden under a folded ancestor, lines already in the target state, and non-foldable lines (no following content) are skipped automatically
- **New: Context Menu module** — A new "Context Menu" tab in the settings panel, alongside the other modules. First toggle "Expand/Collapse Sibling Lists or Headings" (default on): when enabled, a same-named item appears in the Markdown editor right-click menu, executing exactly the same logic as the command-palette command (uses the fold state of the list item/heading under the cursor as the baseline, uniformly folds or unfolds same-level list items/headings across the whole document, then reports the actual count). The menu item reads the toggle live at popup time, so changes apply without reloading the plugin; when disabled, the item disappears from the right-click menu while the command and its hotkey binding remain unaffected
- **Renamed: Settings module names shortened** — Three settings tabs renamed: "Tab Enhancer" → "Tabs", "Statusbar Enhancement" → "Statusbar", "Ribbon Enhancement" → "Left Ribbon". README (CN & EN) and source comments updated in sync. Commands, hotkey bindings, and setting IDs are unaffected
- **New: Typewriter Mode** — New "Typewriter Mode" toggle (default off) in the Tabs settings section. When enabled, the cursor line stays vertically centered in the page while editing (moving the cursor to a new line auto-scrolls it to center; centering is skipped while the mouse is pressed/dragging and triggers only after release, so drag-selection does not yank the view; manual scrolling is not disturbed), and all other lines are dimmed per the "Non-Current Line Opacity" sub-setting (0-100 slider, default 50, shown only while the mode is on). Decorations are built from CM6 visible ranges line by line, so only visible lines are processed — low overhead. New command "Toggle Typewriter Mode" (`mdrazor-toggle-typewriter`) can be bound to a hotkey and stays bidirectionally in sync with the settings toggle (the settings switch and sub-setting visibility refresh immediately after a command toggle)
- **New: "Allow Blank Area at Document Top" sub-toggle for Typewriter Mode** — Default on. When enabled, blank space of (viewport height − line height) / 2 is reserved above the document so the cursor can scroll to the page center even on the very first line (otherwise first-line centering is clamped by the scroll top edge); when disabled, the original behavior is restored. Implementation: toggles a class on `.cm-editor` and sets a CSS variable, applied by the stylesheet to `.cm-sizer`'s `padding-top` (the content container inside `.cm-scroller`, which also holds Obsidian's inline title) — without an inline title the blank sits above the body, and with one it sits above the title so the title stays flush with the first line. Shown only while the mode is on
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
