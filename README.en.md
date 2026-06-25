<div align="center">

# MDRazor

**Markdown Razor** — An Obsidian plugin for enhanced markdown editing, designed to refine your writing experience with precision like a razor.

[![GitHub Release](https://img.shields.io/github/v/release/Dyse-Sofqi/MDRazor?style=flat-square&logo=github&color=%2342b883)](https://github.com/Dyse-Sofqi/MDRazor/releases) [![License](https://img.shields.io/github/license/Dyse-Sofqi/MDRazor?style=flat-square&color=%2342b883)](LICENSE) [![Obsidian Min App](https://img.shields.io/badge/Obsidian-%5E1.0.0-%234a7ec1?style=flat-square&logo=obsidian&logoColor=%234a7ec1)](https://obsidian.md) [![GitHub Stars](https://img.shields.io/github/stars/Dyse-Sofqi/MDRazor?style=flat-square&logo=github&color=%23e4b341)](https://github.com/Dyse-Sofqi/MDRazor)

[🇨🇳 中文](README.md) · [🇬🇧 English](README.en.md)

</div>

---

### Introduction

MDRazor is an Obsidian plugin focused on improving the Markdown editing experience.
Currently provides **format marker hiding** and **list enhancements** — two major feature modules, with more in development.

### Features

#### ✂️ Format Marker Hiding

Hide markers for **bold**, *italic*, ==highlight==, ~~strikethrough~~, `inline code` (`**`, `*`, `==`, `~~`, `` ` ``). Markers reappear when the cursor enters the range. Cleaner live preview, zero distraction.

- Each format can be toggled independently
- Clicking near the boundary of formatted content places the cursor outside the markers, preventing accidental format entry
- Since markers are hidden, cursor movement distance can be inferred from the cursor blink trail

#### 👁️ Space Visualization

Display spaces as translucent · markers, making indentation and alignment visible at a glance:

- Based on CM6 viewport iteration — only visible lines are processed, minimal performance overhead
- Translucent style won't interfere with editing
- Can be toggled independently in settings

#### 📝 List Enhancements

##### List Integration
Treats list markers (`-`, `1.`, `*`) as atomic units: cursor navigation skips the marker, backspace removes the entire marker at once. Editing experience closer to WYSIWYG.

##### Enter Soft Break

- Pressing Enter inside a list item inserts a line break, indentation, and two trailing spaces (equivalent to native `Shift+Enter` behavior), without creating a new list item.
- Press Enter again to create a new list item — consecutive Enter presses create new items.
- Ideal for multi-line list items.

##### List Focus Option

When the cursor enters a list item, automatically expand all its descendants and collapse all non-directly-related content (siblings, parent siblings, etc.).
Only the focus chain (itself + ancestors + descendants) stays visible. Deeply nested list navigation no longer overwhelming.

### Settings

Configure in Obsidian Settings → Community Plugins → MDRazor:

- **Style Hiding** — 6 toggles: Bold, Italic, Highlight, Strikethrough, Inline Code, **Space Visualization**
- **List Enhancements** — 3 toggles: List Integration, Enter Soft Break, Focus Option

### Development Progress

- [x] Project scaffolding
- [x] Style hiding (CodeMirror 6 ViewPlugin + Decoration)
- [x] List integration (cursor correction + atomic deletion + smart merge)
- [x] Enter soft break (continuation indentation + continuation upgrade + blank item level promotion)
- [x] Collapsible settings panel
- [x] Focus option
- [x] Space visualization

### Changelog

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
