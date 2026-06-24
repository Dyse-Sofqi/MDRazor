# MDRazor

> **Markdown Razor** — A powerful Obsidian plugin for enhanced markdown editing, designed to refine your writing experience with precision like a razor.

---

## 中文说明

### 简介

MDRazor 是一款 Obsidian 插件，专注于提升 Markdown 编辑体验。目前提供**隐藏样式符号**和**列表增强**两大功能模块，更多功能正在开发中。

### 功能

#### ✂️ 隐藏样式

在实时预览模式下，隐藏 Markdown 格式化符号（如 `**`、`*`、`==`、`~~`、`` ` ``），让文档显示更干净。可在设置中分别为每种样式独立开关：

- **加粗** (`**`)  — 隐藏 `**文字**` 中的星号
- **斜体** (`*`)  — 隐藏 `*文字*` 中的星号
- **高亮** (`==`)  — 隐藏 `==文字==` 中的等号
- **删除线** (`~~`) — 隐藏 `~~文字~~` 中的波浪线
- **行内代码** (`` ` ``) — 隐藏 `` `代码` `` 中的反引号

开启后，格式化符号从渲染 DOM 中完全移除，光标操作（移动、点击、删除、选中）依然正常作用于隐藏符号。光标进入样式区域时符号也不会自动展开。

#### 📋 列表增强

将列表标识符（`- `、`1. ` 等）与后方空格视为一个整体，提供统一的操作行为：

- **光标修正**：鼠标点击时，光标只能落在标识符整体的前面或后面，不会落入标识符和空格之间
- **整体删除**：Backspace/Delete 一次性删除整个标识符（含空格）
- **智能合并**：删除列表项时，若上一行存在同级或子级列表项，自动吞并换行符，与上一项平滑合并
- **回车软换行**：在列表项内按 Enter 时插入软换行（续行缩进），而非创建新列表项
- **续行升级**：在空白续行上按 Enter，自动升级为同级列表项（含缩进和列表符号）

#### ⚙️ 设置优化

- **折叠设置面板**：隐藏样式和列表增强配置区域支持折叠，界面更简洁
- **默认全开**：所有功能默认启用，安装即用

### 设置

在 Obsidian 设置 → 第三方插件 → MDRazor 中配置：

- **隐藏样式**（可折叠） — 5 个开关：加粗、斜体、高亮、删除线、行内代码
- **列表增强**（可折叠） — 3 个开关：列一体化、回车软换行、聚焦选项（待实现）

### 开发进度

- [x] 项目脚手架搭建
- [x] 隐藏样式功能（CodeMirror 6 ViewPlugin + Decoration）
- [x] 列一体化（光标修正 + 整体删除 + 智能合并）
- [x] 回车软换行（续行缩进 + 续行升级）
- [x] 折叠设置面板
- [ ] 增强列符
- [ ] 聚焦选项

### 版本历史

**v1.1.0** (2026-06-24)
- 新增：Enter 软换行（续行缩进 + 空白续行升级为列表项）
- 新增：设置面板折叠区域
- 优化：列表合并检测改用 `cursorAt()`，支持续行场景
- 优化：所有功能默认开启
- 迁移：设置项 `enhancedListMarkers` 自动迁移为 `enterSoftBreak`

**v1.0.0** (2026-06-24)
- 隐藏样式符号
- 列一体化（光标修正 + 整体删除 + 智能合并）

---

## English

### Introduction

MDRazor is an Obsidian plugin focused on enhancing the markdown editing experience. It currently offers **Style Hider** and **List Enhancement** feature modules, with more functionality under development.

### Features

#### ✂️ Style Hider

Hide markdown formatting markers in Live Preview mode (such as `**`, `*`, `==`, `~~`, `` ` ``) for a cleaner visual display. Each style can be toggled independently in settings:

- **Bold** (`**`) — Hide asterisks around `**text**`
- **Italic** (`*`) — Hide asterisks around `*text*`
- **Highlight** (`==`) — Hide equals signs around `==text==`
- **Strikethrough** (`~~`) — Hide tildes around `~~text~~`
- **Inline Code** (`` ` ``) — Hide backticks around `` `code` ``

When enabled, formatting markers are completely removed from the rendered DOM via CM6 `Decoration.replace({})`, while cursor operations (movement, clicking, deletion, selection) continue to work correctly on the hidden markers. Markers stay hidden even when the cursor enters the formatted region.

#### 📋 List Enhancement

Treats list markers (`- `, `1. `, etc.) and the trailing space as a single atomic unit:

- **Cursor correction**: Mouse clicks snap to either before the marker or after the trailing space — never between them
- **Whole-unit deletion**: Backspace/Delete removes the entire marker (including the space) in one action
- **Smart merge**: When deleting a list item whose previous line is also a list item (sibling or parent), the newline is swallowed so the text merges smoothly
- **Enter soft-break**: Pressing Enter inside a list item inserts a soft line break (continuation with indentation) instead of creating a new list item
- **Continuation promotion**: Pressing Enter on a blank continuation line upgrades it to a same-level list item

#### ⚙️ Settings Improvements

- **Collapsible sections**: Style Hider and List Enhancement config areas are collapsible for a cleaner settings panel
- **All-on by default**: All features are enabled out of the box

### Settings

Navigate to Obsidian Settings → Community Plugins → MDRazor:

- **Style Hider** (collapsible) — 5 toggles: Bold, Italic, Highlight, Strikethrough, Inline Code
- **List Enhancement** (collapsible) — 3 toggles: List Integration, Enter Soft Break, Focus Options (pending)

### Development Roadmap

- [x] Project scaffolding
- [x] Style Hider (CodeMirror 6 ViewPlugin + Decoration)
- [x] List Integration (cursor correction + whole-unit deletion + smart merge)
- [x] Enter soft-break (continuation indent + continuation promotion)
- [x] Collapsible settings panel
- [ ] Enhanced List Markers
- [ ] Focus Options

### Version History

#### v1.1.0 (2026-06-24)
- New: Enter soft-break (continuation indent + blank continuation promotion to list item)
- New: Collapsible settings sections
- Improved: List merge detection uses `cursorAt()` — handles continuation lines correctly
- Improved: All features enabled by default
- Migration: `enhancedListMarkers` setting auto-migrates to `enterSoftBreak`

#### v1.0.0 (2026-06-24)
- Style Hider
- List Integration (cursor correction + whole-unit deletion + smart merge)

---

## Technical Stack

- Built on [Obsidian API](https://github.com/obsidianmd/obsidian-api)
- Uses CodeMirror 6 (`ViewPlugin`, `Decoration`, `syntaxTree`, `domEventHandlers`) for editor-level manipulation
- Modular architecture: each feature resides in its own source file under `src/`

## License

[0-BSD](LICENSE)
