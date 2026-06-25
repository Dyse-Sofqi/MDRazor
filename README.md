# MDRazor

> **Markdown Razor** — A powerful Obsidian plugin for enhanced markdown editing, designed to refine your writing experience with precision like a razor.

---

## 中文说明

### 简介

MDRazor 是一款 Obsidian 插件，专注于提升 Markdown 编辑体验。目前提供**隐藏样式符号**和**列表增强**两大功能模块，更多功能正在开发中。

### 功能

#### ✂️ 格式标记隐藏

隐藏 **加粗**、*斜体*、==高亮==、~~删除线~~、`行内代码` 的标记符号（`**`、`*`、`==`、`~~`、`` ` ``），光标移入时自动显示。更干净的实时预览，零干扰。

- 支持每项格式独立开关
- 光标进入范围时格式标记符号自动浮现

#### 👁️ 空格可视化

以半透明 · 标记显示空格位置，一目了然看清缩进和对齐：

- 基于 CM6 视图范围迭代，仅处理可视行，性能开销极低
- 半透明样式不干扰编辑
- 可在设置面板中独立开关

#### 📝 列表增强

##### 列表一体化（List Integration）
将列表标记（`-`、`1.`、`*`）视为原子单元：光标定位跳过标记，退格键一次删除整个标记。编辑体验更接近所见即所得。

##### 回车软换行（Enter Soft Break）
在列表项内按 Enter 仅插入 `<br>` 换行（`Shift+Enter` 行为），不新建列表项。需要新建列表项时用 `Shift+Enter`（即常规软换行和新建项互换）。适合多行列表项。

##### 聚焦模式（List Focus Option）
光标进入列表项时，自动展开其所有后代，折叠所有非直属内容（兄弟、父兄弟等），仅保留聚焦链（自身 + 祖先 + 后代）可见。深度嵌套列表导航不再眼花缭乱。

- 基于缩进宽度计算层级（以兼容 HyperMD 扁平语法树）
- 每个被折叠的独立列表项显示为单独一行 `...`
- 光标移动时通过 `queueMicrotask` 延迟重新计算折叠范围
- 不移动光标位置，无重入风险

### 设置

在 Obsidian 设置 → 第三方插件 → MDRazor 中配置：

- **隐藏样式**（可折叠） — 6 个开关：加粗、斜体、高亮、删除线、行内代码、**空格可视化**
- **列表增强**（可折叠） — 3 个开关：列一体化、回车软换行、聚焦选项

### 开发进度

- [x] 项目脚手架搭建
- [x] 隐藏样式功能（CodeMirror 6 ViewPlugin + Decoration）
- [x] 列一体化（光标修正 + 整体删除 + 智能合并）
- [x] 回车软换行（续行缩进 + 续行升级 + 空白项层级提升）
- [x] 折叠设置面板
- [ ] 增强列符
- [x] 聚焦选项
- [x] 空格可视化

### 版本历史

**v1.4.1** (2026-06-25)

- 修复：聚焦模式三四级项不触发折叠 — `buildListItems` depth 改用缩进栈算法替代 `Math.round(indent/4)`
- 修复：聚焦模式缩进项折叠箭头错误定位到父级 — `focusFoldService` 改用行号映射替代 `markerFrom` 范围匹配
- 修复：聚焦模式默认 fold service 覆盖自定义服务 — `Prec.high` 确保优先查询
- 修复：无子项项显示折叠箭头，点击折叠同级 — 无子项返回 `null`，由默认 `indentRangeFinder` 处理

**v1.4.0** (2026-06-25)

- 新增：空格可视化 — 以半透明 · 标记显示空格位置
- 新增：设置即时生效 — 开关变更后无需重启 Obsidian，所有编辑器即时响应
- 新增：设置面板「隐藏样式」新增空格可视化开关
- 新增：空白列表项回车提升层级 — 连续空白子项按 Enter 提升一级；一级项清除列表格式

**v1.2.0** (2026-06-25)
- 重构：MVC 架构拆分（model/controller/view），增强可维护性
- 新增：列表聚焦模式（List Focus Option）—— 光标聚焦列表项时自动折叠非直属内容
- 修复：聚焦模式下每个被折叠项独立显示一行 `...`，不再合并
- 优化：注释中文化

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
- **Blank item promotion**: Pressing Enter on an empty list item whose previous line is also empty promotes it one level; top-level items get cleared

#### 🎯 List Focus Option

When the cursor enters a list item, all non-lineage content (siblings, parent-siblings, etc.) is automatically folded, keeping only the focus chain (self + ancestors + descendants) visible.

- Depth detection uses indentation width (for HyperMD flattened syntax tree compatibility)
- Each folded item gets its own `...` line
- Fold recomputation deferred via `queueMicrotask` on cursor move
- Zero cursor movement, no re-entrancy

#### 👁️ Space Visualization

Renders spaces as semi-transparent `·` markers to reveal indent and alignment at a glance:

- Scans only visible viewport lines via `view.visibleRanges` — minimal overhead
- Semi-transparent styling avoids visual clutter
- Toggle in settings under "Style Hider"

#### ⚙️ Settings Improvements

- **Collapsible sections**: Style Hider and List Enhancement config areas are collapsible for a cleaner settings panel
- **All-on by default**: All features are enabled out of the box

### Settings

Navigate to Obsidian Settings → Community Plugins → MDRazor:

- **Style Hider** (collapsible) — 6 toggles: Bold, Italic, Highlight, Strikethrough, Inline Code, **Space Visualization**
- **List Enhancement** (collapsible) — 3 toggles: List Integration, Enter Soft Break, Focus Options

### Development Roadmap

- [x] Project scaffolding
- [x] Style Hider (CodeMirror 6 ViewPlugin + Decoration)
- [x] List Integration (cursor correction + whole-unit deletion + smart merge)
- [x] Enter soft-break (continuation indent + continuation promotion + blank item promotion)
- [x] Collapsible settings panel
- [ ] Enhanced List Markers
- [x] Focus Options (MVC refactored)
- [x] Space Visualization

### Architecture

MVC pattern:

```text
src/
├── main.ts               # Thin re-export for esbuild bundling
├── controller/
│   ├── main.ts           # Plugin lifecycle & CM6 extension registration
│   ├── format-hider.ts   # Format marker hiding
│   ├── whitespace-visible.ts # Space visualization
│   ├── list-enhancer.ts  # List enhancement combiner
│   ├── focus-options.ts  # List focus mode (focus chain folding)
│   ├── list-integration.ts # List marker integration
│   └── enter-soft-break.ts # Enter soft break
├── model/
│   ├── settings.ts       # Settings data model & defaults
│   └── shared.ts         # Shared types & config
└── view/
    └── settings-tab.ts   # Settings UI
```

Each feature module exports a CM6 Extension factory and a module-level config object. No direct dependency on the Obsidian Plugin API.

### Version History

**v1.4.1** (2026-06-25)

- Fix: Level 3+ items not triggering focus folding — `buildListItems` depth uses indent-stack algorithm instead of `Math.round(indent/4)`
- Fix: Fold arrows on indented items incorrectly targeting parent — `focusFoldService` uses line-number map instead of `markerFrom` range matching
- Fix: Default fold service overriding custom service — `Prec.high` ensures focus service queried first
- Fix: Phantom fold arrows on childless items, clicking folded siblings inline — return `null` for childless items, defer to default `indentRangeFinder`

**v1.4.0** (2026-06-25)

- New: Space Visualization — show spaces as semi-transparent · markers
- New: Instant toggle — settings changes take effect immediately across all open editors, no restart needed
- New: Settings toggle for space visualization under "Style Hider"

**v1.3.0** (2026-06-25)
- New: Blank list item promotion — Enter on consecutive empty sub-items promotes one level; top-level items have their format cleared

**v1.2.0** (2026-06-25)
- Refactor: MVC architecture (model/controller/view) — improved maintainability
- New: List Focus Option — auto-fold non-lineage content when cursor enters a list item
- Fix: Each folded item gets its own `...` line instead of merging
- Chore: Chinese comments

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
