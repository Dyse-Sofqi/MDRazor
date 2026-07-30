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
- **Wiki Link Brackets** — hides `[[` and `]]` wiki link formatting markers
- **HTML Color Tags** — hides `<font color="#c00000">` and `</font>` Hex color tag pairs
- **HTML Underline Tags** — hides `<u>` and `</u>` HTML underline tag pairs in live preview

All hidden formats share these behaviors:

- Clicking near the boundary of formatted content places the cursor outside the markers, preventing accidental format entry
- Since markers are hidden, cursor movement distance can be inferred from the cursor blink trail

👁️ **Space Visualization** — Display spaces as translucent `·` markers, making indentation and alignment visible at a glance. Based on CM6 viewport iteration — only visible lines are processed, minimal performance overhead. Translucent style won't interfere with editing. Listed as an independent toggle within the Style Hiding section.

🔍 **Symbol Boundary Hint** — When the cursor is at the boundary between a formatting marker and content, a small tooltip appears below the cursor displaying the hidden markers on either side. Built on CM6's `showTooltip` system — automatically tracks cursor position, follows scrolling, and cleans up on editor destroy. Independent toggle under the Style Hiding section.

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

- **Open Wiki Link in New Tab** — Click a wiki link in a document (including plain `[[page]]`, aliased `[[page|alias]]`, and block references `[[page#^blockid]]`): if the target file already has an open tab, switch to it with block-level scroll positioning; otherwise open in a new tab. Ctrl/Meta+click bypasses to native behavior.

- **🗂️ Vertical Tabs** — Tab management in the file explorer. Toggle button (`arrow-left-right` icon) in nav buttons switches to a "tabs-only" view that hides inactive files and empty folders; close buttons on open file titles. Supports "tabs-only" and "full directory" view toggle. Tabs-only view hides unopened files and empty folders, focuses on active files. Close button displayed on the right of each open file title. Closing the active tab auto-focuses the previous tab, matching native tab bar behavior.

### Settings

Configure in Obsidian Settings → Community Plugins → MDRazor:

- **Style Hiding** — 12 toggles: Bold, Italic, Highlight, Strikethrough, Inline Code, Escape, Heading, Wiki Link Brackets, HTML Color Tags, HTML Underline Tags, Space Visualization, Symbol Boundary Hint
- **Orphan Image Cleaner** — 1 toggle: enables trash-2 ribbon icon, scans unreferenced images
- **List Enhancements** — 6 toggles + 1 sub-setting: List Integration, Enter Soft Break, List Focus Option (with Second-level Max Expand Count), Directory Focus, Directory File Count
- **Tab Enhancer** — 3 toggles: Default New Tab Open, Vertical Tabs, Open Wiki Link in New Tab
- **Statusbar Enhancement** — 3 toggles: Workspace Switch, Auto-save Workspace Layout, Format Toggle Button

## Technical Stack

- Built on [Obsidian API](https://github.com/obsidianmd/obsidian-api)
- Uses CodeMirror 6 (`ViewPlugin`, `Decoration`, `syntaxTree`, `domEventHandlers`) for editor-level manipulation
- Modular architecture: each feature resides in its own source file under `src/`

## Sponsorship

If this plugin helps you, feel free to scan the QR code to sponsor ❤️

![Sponsor](https://github.com/Dyse-Sofqi/MDRazor/blob/main/zanshang.jpg)

## License

[0-BSD](LICENSE)
