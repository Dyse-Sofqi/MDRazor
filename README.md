<div align="center">

# MDRazor

像剃刀一样精准打磨你的 Markdown 编辑体验。

[![GitHub Release](https://img.shields.io/github/v/release/Dyse-Sofqi/MDRazor?style=flat-square&logo=github&color=%2342b883)](https://github.com/Dyse-Sofqi/MDRazor/releases) [![License](https://img.shields.io/github/license/Dyse-Sofqi/MDRazor?style=flat-square&color=%2342b883)](LICENSE) [![Obsidian Min App](https://img.shields.io/badge/Obsidian-%5E1.0.0-%234a7ec1?style=flat-square&logo=obsidian&logoColor=%234a7ec1)](https://obsidian.md) [![GitHub Stars](https://img.shields.io/github/stars/Dyse-Sofqi/MDRazor?style=flat-square&logo=github&color=%23e4b341)](https://github.com/Dyse-Sofqi/MDRazor)

</div>

---

> 🇬🇧 **English**: scroll down to view the English README.

### 简介

MDRazor 是一款 Obsidian 插件，专注于提升 Markdown 编辑体验。
目前提供**隐藏样式**、**列表增强**、**标签页增强**、**状态栏增强**和**清理失联图片**五大功能模块，更多功能正在开发中。

### 功能

功能按设置面板的五大区域组织，每项均可在设置面板中独立开关。

---

#### ✂️ 隐藏样式

隐藏 Markdown 标记符号，光标移入时自动显示。更干净的实时预览，零干扰。

以下每种格式可独立开关：

- **隐藏加粗符号** — 隐藏 `**` 加粗标记符号
- **隐藏斜体符号** — 隐藏 `*` 斜体标记符号
- **隐藏高亮符号** — 隐藏 `==` 高亮标记符号
- **隐藏删除线符号** — 隐藏 `~~` 删除线标记符号
- **隐藏行内代码符号** — 隐藏 `` ` `` 行内代码标记符号
- **隐藏转义符号** — 隐藏 `\` 转义符号
- **隐藏标题符号** — 隐藏 `#` 标题标记符号（支持 H1-H6），`#` 后无空格时不隐藏
- **隐藏双链符号** — 隐藏 `[[` 和 `]]` 双链格式标记
- **隐藏 HTML 颜色标签** — 在实时预览中隐藏 `<font color="#c00000">` 和 `</font>` 等 Hex 颜色标签对
- **隐藏 HTML 下划线符号** — 在实时预览中隐藏 `<u>` 和 `</u>` 下划线 HTML 标签对
- **隐藏 HTML 行标签** — 在实时预览中隐藏 `<span>` 和 `</span>` HTML 标签对，涵盖带任意属性（如 `style="color:var(--color-yellow)"`、`style="color:#b58900"`、`style="background-color:rgba(...)"`、`style="text-decoration:underline"`）的开标签。围栏代码块、行内代码及数学公式内的 `<span>` 视为字面文本，自动跳过不隐藏
- **HTML 标签成对隐藏** — `<font>`/`<u>`/`<span>` 三类标签仅当开标签与闭标签成对出现时才隐藏；只检测到单边（如 `<u>` 后缺 `</u>`，或孤立 `</u>`）时该标签不隐藏，原文保持可见，便于发现未闭合标签

所有隐藏格式共享以下特性：

- 鼠标点击格式内容边界时，光标会自动落在标记符号之外，避免输入时误判格式。
- 由于格式符号被隐藏，可以根据光标经过时光标的闪烁判断光标途径的距离。
- **健壮性** — 兼容数学公式（`$..$`）与格式标记（`**..**` 等）共存的行内内容。即使 Obsidian 解析器在此类行上产生异常语法树，也不会导致编辑器崩溃，公式正文绝不会被误当作格式标记隐藏。

👁️ **空格可视化** — 以半透明 `·` 标记显示空格位置，一目了然看清缩进和对齐。基于 CM6 视图范围迭代，仅处理可视行，性能开销极低。半透明样式不干扰编辑。已隐藏格式符号（如 `<span style="...">` HTML 标签）内的空格一并隐藏，不残留 `·`。作为隐藏样式区域中的一项独立开关。

🔍 **符号边界提示** — 光标处于格式标识符与文本内容边界时，在光标下方弹出小框，展示光标与隐藏标识符的位置关系（左/右两侧符号）。弹框原样展示完整隐藏标记（含组合标记如加粗+斜体的 `***`），不截断、不重复；空格可视化开启时弹框内空格同样以 `·` 展示。使用 CM6 `showTooltip` 系统，自动跟随光标位置、响应滚动和编辑器销毁生命周期。在隐藏样式设置区独立开关。

---

#### 🗑️ 清理失联图片

- **清理失联图片** — 在设置中启用后，左侧 ribbon 功能区出现垃圾桶图标按钮（trash-2）。点击后扫描库中所有 Markdown 笔记，提取四种图片引用语法（`![[path]]`、`[[path]]`、`![](path)`、`<img src>`），找出未被任何笔记引用过的图片文件（jpg/jpeg/png/gif/svg），弹出多选确认框（列表含勾选、路径、状态与缩略图，默认全选）供确认后移入系统回收站。确认时未勾选的图片记入白名单，下次弹框自动保持未勾选并置底显示，可重新勾选解除白名单。

---

#### 📝 列表增强

列表编辑体验优化，提供以下独立开关：

- **列一体化** — 将列表标记（`-`、`1.`、`*`）视为原子单元：光标定位跳过标记，退格键一次删除整个标记。编辑体验更接近所见即所得。

- **回车软换行** — 在列表项内按 Enter 仅插入换行、缩进及两个空格（等效原生 `Shift+Enter` 行为），不新建列表项。需要新建列表项时，再按一次 Enter 即可，也就是连续回车新建列表项。适合多行列表项。

- **选项聚焦** — 光标移入列表项时，自动折叠所有非直属内容（兄弟、父兄弟等），仅展开焦点链（当前项、其祖先、及其子孙）。深度嵌套列表导航不再眼花缭乱。鼠标未弹起时不触发折叠，避免拖选过程中闪烁。

  - **二级子项最大展开数** — 选项聚焦的子设置（滑块 1-9 + 开关）。开启后，一级项的第二级子项数量 ≤ 设定值时该一级项展开。仅影响一级项，其后代仍受选项聚焦影响。选项聚焦关闭时此设置自动禁用。

- **目录聚焦** — 点击文件列表中的文件夹名称时，仅展开该文件夹及其祖先链，同时折叠所有无关分支（同级、父同级、祖父同级等），专注当前目录结构。点击文件夹名称（非折叠箭头）触发，触发后再次点击同一个文件夹仅触发折叠状态的改变。折叠箭头可正常独立控制单层展开/折叠。

  - 🖱️ **空白区域展开** — 与目录聚焦共用开关（目录聚焦开启时可用）。点击文件列表空白区域时，展开所有一级文件夹，快速浏览全局目录结构。点击排序/筛选等操作区域不会误触。

- **显示目录文件数量** — 在文件浏览器的每个文件夹标题右侧显示直接子项（子文件夹 + 文件）数量，不递归统计子文件夹内的内容。数量随文件创建/删除实时更新。基于 Obsidian vault 事件监听，创建或删除文件后 200ms 自动刷新。字体大小与文件夹名称一致。

---

#### 📑 标签页增强

文件标签页管理，提供以下独立开关：

- **默认新标签页打开** — 单击文件目录中的文件时，若标签页已存在则跳转到该标签页，否则打开新标签页。右键菜单新建文件时同样在新标签页中打开。避免重复标签页，文件导航更高效。Ctrl/Meta+ 点击时恢复 Obsidian 原生行为（在新标签页中打开）；Shift+ 点击保留原生范围多选。

- **新标签页打开双链** — 在文档内点击双链（包括普通双链 `[[page]]`、别名双链 `[[page|alias]]`、块引用双链 `[[page#^blockid]]`）时，自动检测目标文档是否已存在标签页：若已存在则跳转到该标签页并定位到对应块位置（块引用时），否则在新标签页中打开。Ctrl/Meta+ 点击时恢复 Obsidian 原生行为。

- **新标签页打开书签** — 点击 Obsidian 核心插件「书签」视图中的文件书签时，自动检测目标文件是否已存在标签页：若已存在则跳转到该标签页，否则在新标签页中打开。Ctrl/Meta/Shift+ 点击时恢复 Obsidian 原生行为。

- **🗂️ 垂直标签页** — 在文件列表中为已打开的文件提供标签页管理。顶部添加切换按钮（`arrow-left-right` 图标），一键切换「仅标签页」视图，隐藏未打开的文件和空文件夹；已打开的文件标题右侧显示关闭按钮。支持「仅标签页」与「完整目录」两种视图切换。标签页视图下隐藏未打开的文件和空文件夹，专注当前工作文件。关闭按钮显示在标题右侧，一目了然。关闭当前激活标签页时自动聚焦上一个标签页，与原生标签栏行为一致。

- **目录展开关联标签页** — 开启后，从垂直标签页视图切换回文件列表时，仅展开包含已打开标签页的文件夹；关闭后，切换时恢复文件列表原来的展开结构。

---

#### 🖥️ 状态栏增强

状态栏增强功能，提供以下独立开关：

- **工作区切换** — 右下角状态栏显示工作区切换按钮：0-1 个工作区不显示、2 个工作区点击直接切换、3+ 个弹出浮层列表选切。切换后自动记录当前工作区名称。
- **自动更新工作区布局** — 切换或加载工作区时自动保存当前工作区布局，与 Obsidian 原生「加载工作区」功能及本插件工作区切换联动。
- **侧边栏伸缩按钮** — 状态栏最左侧显示按钮，点击一键折叠/展开左右侧边栏。
- **隐藏样式启闭按钮** — 状态栏最左侧显示「标识」按钮，一键开启/关闭所有格式隐藏样式（加粗、斜体、高亮、删除线、行内代码、转义符号、标题符号、双链符号、HTML 颜色标签、HTML 下划线符号、HTML 行标签），不影响空格可视化。按钮图标与设置面板中隐藏样式开关双向同步。命令面板命令 `mdrazor-toggle-formatting` 可绑定快捷键。

### 设置

在 Obsidian 设置 → 第三方插件 → MDRazor 中配置：

- **隐藏样式** — 13 个开关：加粗、斜体、高亮、删除线、行内代码、转义符号、标题符号、双链符号、HTML 颜色标签、HTML 下划线符号、HTML 行标签、空格可视化、符号边界提示
- **清理失联图片** — 1 个开关：启用后 ribbon 显示垃圾桶图标，扫描未引用图片
- **列表增强** — 7 个开关 + 1 个滑块：列一体化、回车软换行、选项聚焦（含二级子项最大展开数）、目录聚焦、显示目录文件数量（含仅显示直接子项数量）
- **标签页增强** — 5 个开关：默认新标签页打开、垂直标签页、新标签页打开双链、新标签页打开书签、目录展开关联标签页
- **状态栏增强** — 4 个开关：工作区切换、自动更新工作区布局、侧边栏伸缩按钮、隐藏样式启闭按钮

---

### 安装

#### 通过社区插件市场安装（推荐）

1. 打开 Obsidian → 设置 → 第三方插件 → 社区插件市场
2. 搜索 **MDRazor** 并安装
3. 在已安装插件列表中启用

#### 通过 BRAT 安装（预览版）

1. 安装 [BRAT](https://obsidian.md/plugins?id=obsidian42-brat) 插件
2. 在 BRAT 设置中添加 `Dyse-Sofqi/MDRazor`
3. 手动启用 MDRazor 插件

## 赞助

如果这个插件对你有帮助，欢迎扫码赞助 ❤️

![赞助](https://raw.githubusercontent.com/Dyse-Sofqi/MDRazor/main/zanshang.jpg)

## License

[0-BSD](LICENSE)

---

<div align="center">

# MDRazor

Designed to refine your writing experience with precision like a razor.

[![GitHub Release](https://img.shields.io/github/v/release/Dyse-Sofqi/MDRazor?style=flat-square&logo=github&color=%2342b883)](https://github.com/Dyse-Sofqi/MDRazor/releases) [![License](https://img.shields.io/github/license/Dyse-Sofqi/MDRazor?style=flat-square&color=%2342b883)](LICENSE) [![Obsidian Min App](https://img.shields.io/badge/Obsidian-%5E1.0.0-%234a7ec1?style=flat-square&logo=obsidian&logoColor=%234a7ec1)](https://obsidian.md) [![GitHub Stars](https://img.shields.io/github/stars/Dyse-Sofqi/MDRazor?style=flat-square&logo=github&color=%23e4b341)](https://github.com/Dyse-Sofqi/MDRazor)

[🇨🇳 中文](README.md) · [🇬🇧 English](README.en.md)

</div>

---

### Introduction

MDRazor is an Obsidian plugin focused on improving the Markdown editing experience.
Currently provides **Style Hiding**, **List Enhancements**, **Tab Enhancer**, **Statusbar Enhancement**, and **Orphan Image Cleaner** — five feature modules, with more in development.

### Features

Features are organized by the five settings-panel sections. Each toggle is independently switchable in settings.

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
- **HTML Inline Tags** — hides `<span>` and `</span>` HTML tag pairs in live preview, covering opening tags with arbitrary attributes (e.g. `style="color:var(--color-yellow)"`, `style="color:#b58900"`, `style="background-color:rgba(...)"`, `style="text-decoration:underline"`). `<span>` inside fenced code blocks, inline code, and math is treated as literal text and skipped
- **Paired HTML Tags Only** — `<font>`/`<u>`/`<span>` are hidden only when the opening and closing tags appear as a pair; a lone tag (e.g. `<u>` without `</u>`, or a stray `</u>`) stays visible, making unclosed tags easy to spot

All hidden formats share these behaviors:

- Clicking near the boundary of formatted content places the cursor outside the markers, preventing accidental format entry
- Since markers are hidden, cursor movement distance can be inferred from the cursor blink trail
- **Robustness** — Compatible with inline content where math (`$..$`) coexists with formatting markers (`**..**`, etc.). Even when Obsidian's parser produces an anomalous syntax tree on such lines, the editor never crashes and math content is never mistaken for a hidden marker.

👁️ **Space Visualization** — Display spaces as translucent `·` markers, making indentation and alignment visible at a glance. Based on CM6 viewport iteration — only visible lines are processed, minimal performance overhead. Translucent style won't interfere with editing. Spaces inside hidden format markers (e.g. `<span style="...">` HTML tags) are hidden along with the tag, leaving no stray dots. Listed as an independent toggle within the Style Hiding section.

🔍 **Symbol Boundary Hint** — When the cursor is at the boundary between a formatting marker and content, a small tooltip appears below the cursor displaying the hidden markers on either side. The tooltip shows the complete hidden marker verbatim (including combined markers such as bold+italic `***`) — no truncation, no duplication; with space visualization enabled, tooltip spaces also render as `·`. Built on CM6's `showTooltip` system — automatically tracks cursor position, follows scrolling, and cleans up on editor destroy. Independent toggle under the Style Hiding section.

---

#### 🗑️ Orphan Image Cleaner

- **Orphan Image Cleaner** — Enable in settings to show a trash-2 ribbon icon. Click it to scan all Markdown notes in the vault for image references via four syntaxes (`![[path]]`, `[[path]]`, `![](path)`, `<img src>`). Finds unreferenced image files (jpg/jpeg/png/gif/svg) and shows a multi-select confirm dialog (columns for checkbox, path, status, and thumbnail; all checked by default) before moving the selected ones to the system recycle bin. Images left unchecked are added to a whitelist — on subsequent dialogs they stay unchecked and are pinned to the bottom of the list; re-checking them removes them from the whitelist.

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

- **Default New Tab Open** — Click a file in the file explorer: if a tab for that file already exists, switch to it; otherwise open a new tab. Prevents duplicate tabs for more efficient file navigation. Ctrl/Meta+click restores native Obsidian behavior (open in new tab); Shift+click preserves native range multi-select.

- **Open Wiki Link in New Tab** — Click a wiki link in a document (including plain `[[page]]`, aliased `[[page|alias]]`, and block references `[[page#^blockid]]`): if the target file already has an open tab, switch to it with block-level scroll positioning; otherwise open in a new tab. Ctrl/Meta+click bypasses to native behavior.

- **Open Bookmark in New Tab** — Click a file bookmark in Obsidian's core Bookmarks view: if the target file already has an open tab, switch to it; otherwise open in a new tab. Ctrl/Meta/Shift+click bypasses to native behavior.

- **🗂️ Vertical Tabs** — Tab management in the file explorer. Toggle button (`arrow-left-right` icon) in nav buttons switches to a "tabs-only" view that hides inactive files and empty folders; close buttons on open file titles. Supports "tabs-only" and "full directory" view toggle. Tabs-only view hides unopened files and empty folders, focuses on active files. Close button displayed on the right of each open file title. Closing the active tab auto-focuses the previous tab, matching native tab bar behavior.

- **Tab Expansion Associated Folders** — When enabled, switching back from the vertical tabs view to the file list expands only folders containing open tabs; when disabled, the original expanded structure is restored.

---

#### 🖥️ Statusbar Enhancement

Status bar enhancements with the following independent toggles:

- **Workspace Switch** — Shows a workspace-switch button in the bottom-right status bar: no button for 0-1 workspaces, direct switch for 2, popup list for 3+. Tracks and highlights the current workspace name.
- **Auto-save Workspace Layout** — Automatically saves the current workspace layout when switching to or loading another workspace. Integrates with Obsidian's native "Load Workspace" and the plugin's workspace switch.
- **Sidebar Toggle Button** — Shows a button at the leftmost position of the status bar to collapse/expand both sidebars with one click.
- **Format Toggle Button** — Shows a "标识" button at the leftmost position of the status bar to toggle all format hiding styles (bold, italic, highlight, strikethrough, inline code, escape, heading, wiki link brackets, HTML color tags, HTML underline tags, HTML inline tags) at once; space visualization is excluded. The button icon stays bidirectionally in sync with the Style Hiding switches in settings. The command `mdrazor-toggle-formatting` can be bound to a hotkey.

### Settings

Configure in Obsidian Settings → Community Plugins → MDRazor:

- **Style Hiding** — 13 toggles: Bold, Italic, Highlight, Strikethrough, Inline Code, Escape, Heading, Wiki Link Brackets, HTML Color Tags, HTML Underline Tags, HTML Inline Tags, Space Visualization, Symbol Boundary Hint
- **Orphan Image Cleaner** — 1 toggle: enables trash-2 ribbon icon, scans unreferenced images
- **List Enhancements** — 7 toggles + 1 slider: List Integration, Enter Soft Break, List Focus Option (with Second-level Max Expand Count), Directory Focus, Directory File Count (with Direct Children Count)
- **Tab Enhancer** — 5 toggles: Default New Tab Open, Vertical Tabs, Open Wiki Link in New Tab, Open Bookmark in New Tab, Tab Expansion Associated Folders
- **Statusbar Enhancement** — 4 toggles: Workspace Switch, Auto-save Workspace Layout, Sidebar Toggle Button, Format Toggle Button

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

## Sponsorship

If this plugin helps you, feel free to scan the QR code to sponsor ❤️

![Sponsor](https://raw.githubusercontent.com/Dyse-Sofqi/MDRazor/main/zanshang.jpg)

## License

[0-BSD](LICENSE)
