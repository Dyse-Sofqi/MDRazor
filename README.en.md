<div align="center">

# MDRazor

Designed to refine your writing experience with precision like a razor.

[![GitHub Release](https://img.shields.io/github/v/release/Dyse-Sofqi/MDRazor?style=flat-square&logo=github&color=%2342b883)](https://github.com/Dyse-Sofqi/MDRazor/releases) [![License](https://img.shields.io/github/license/Dyse-Sofqi/MDRazor?style=flat-square&color=%2342b883)](LICENSE) [![Obsidian Min App](https://img.shields.io/badge/Obsidian-%5E1.0.0-%234a7ec1?style=flat-square&logo=obsidian&logoColor=%234a7ec1)](https://obsidian.md) [![GitHub Stars](https://img.shields.io/github/stars/Dyse-Sofqi/MDRazor?style=flat-square&logo=github&color=%23e4b341)](https://github.com/Dyse-Sofqi/MDRazor)

[🇨🇳 中文](README.md) · [🇬🇧 English](README.en.md)

</div>

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

#### 📝 List Enhancements

Optimized list editing experience with the following independent toggles:

- **List Integration** — Treats list markers (`-`, `1.`, `*`) as atomic units: cursor navigation skips the marker, backspace removes the entire marker at once. Editing experience closer to WYSIWYG.

- **Enter Soft Break** — Pressing Enter inside a list item inserts a line break, indentation, and two trailing spaces (equivalent to native `Shift+Enter` behavior), without creating a new list item. Press Enter again to create a new list item — consecutive Enter presses create new items. Ideal for multi-line list items.

- **List Focus Option** — When the cursor enters a list item, automatically expand all its descendants and collapse all non-directly-related content (siblings, parent siblings, etc.). Only the focus chain (itself + ancestors + descendants) stays visible. Deeply nested list navigation no longer overwhelming. Fold is deferred until mouse button release to prevent flicker during selection drag.

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
- **List Enhancements** — 5 toggles: List Integration, Enter Soft Break, Focus Option, Directory Focus, Directory File Count
- **Tab Enhancer** — 2 toggles: Default New Tab Open, Vertical Tabs

### Changelog

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
