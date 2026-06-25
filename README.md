# MDRazor

> **Markdown Razor** — A Obsidian plugin for enhanced markdown editing, designed to refine your writing experience with precision like a razor.

---

### 简介

MDRazor 是一款 Obsidian 插件，专注于提升 Markdown 编辑体验。
目前提供**隐藏样式符号**和**列表增强**两大功能模块，更多功能正在开发中。

### 功能

#### ✂️ 格式标记隐藏

隐藏 **加粗**、*斜体*、==高亮==、~~删除线~~、`行内代码` 的标记符号（`**`、`*`、`==`、`~~`、`` ` ``），光标移入时自动显示。更干净的实时预览，零干扰。

- 支持每项格式独立开关
- 鼠标点击格式内容边界时，光标会自动落在标记符号之外，避免输入时误判格式。
- 由于格式符号被隐藏，可以根据光标经过时光标的闪烁判断光标途径的距离。

#### 👁️ 空格可视化

以半透明 · 标记显示空格位置，一目了然看清缩进和对齐：

- 基于 CM6 视图范围迭代，仅处理可视行，性能开销极低
- 半透明样式不干扰编辑
- 可在设置面板中独立开关

#### 📝 列表增强

##### 列表一体化（List Integration）
将列表标记（`-`、`1.`、`*`）视为原子单元：光标定位跳过标记，退格键一次删除整个标记。编辑体验更接近所见即所得。

##### 回车软换行（Enter Soft Break）

- 在列表项内按 Enter 仅插入换行、缩进及两个空格（`Shift+Enter` 行为），不新建列表项。
- 需要新建列表项时，再按一次 Enter 即可，也就是连续回车新建列表项。
- 适合多行列表项。

##### 聚焦模式（List Focus Option）

光标进入列表项时，自动展开其所有后代，折叠所有非直属内容（兄弟、父兄弟等）。
仅保留聚焦链（自身 + 祖先 + 后代）可见。深度嵌套列表导航不再眼花缭乱。

### 设置

在 Obsidian 设置 → 第三方插件 → MDRazor 中配置：

- **隐藏样式** — 6 个开关：加粗、斜体、高亮、删除线、行内代码、**空格可视化**
- **列表增强** — 3 个开关：列一体化、回车软换行、聚焦选项

### 开发进度

- [x] 项目脚手架搭建
- [x] 隐藏样式功能（CodeMirror 6 ViewPlugin + Decoration）
- [x] 列一体化（光标修正 + 整体删除 + 智能合并）
- [x] 回车软换行（续行缩进 + 续行升级 + 空白项层级提升）
- [x] 折叠设置面板
- [x] 聚焦选项
- [x] 空格可视化

### 版本历史

**v1.4.3** (2026-06-25)

- 修复：聚焦模式光标脱离列表后仍匹配最后一项 — `computeFoldIndices` 对无下一兄弟项改用续行扫描边界，替代 `Number.MAX_SAFE_INTEGER`
- 修复：聚焦模式最后一项折叠范围吞没后续内容 — `computeFoldRanges` 最后子树分支改为续行扫描（遇空行停止），替代 `doc.length`

**v1.4.2** (2026-06-25)

- 优化：回车软换行空白一级项清除格式时，上一行也为空则一并清除 — `changes.from` 从 `line.from` 改为 `prevLine.from`，一次 dispatch 删除两行

**v1.4.1** (2026-06-25)

- 修复：聚焦模式三四级项不触发折叠 — `buildListItems` depth 改用缩进栈算法替代 `Math.round(indent/4)`
- 修复：聚焦模式缩进项折叠箭头错误定位到父级 — `focusFoldService` 改用行号映射替代 `markerFrom` 范围匹配
- 修复：聚焦模式默认 fold service 覆盖自定义服务 — `Prec.high` 确保优先查询
- 修复：无子项项显示折叠箭头，点击折叠同级 — 无子项返回 `null`，由默认 `indentRangeFinder` 处理
- 修复：聚焦模式折叠项的子项续行未被折叠 — `computeFoldRanges` 扫描续行纳入折叠范围，不合并子项独立折叠

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

## Technical Stack

- Built on [Obsidian API](https://github.com/obsidianmd/obsidian-api)
- Uses CodeMirror 6 (`ViewPlugin`, `Decoration`, `syntaxTree`, `domEventHandlers`) for editor-level manipulation
- Modular architecture: each feature resides in its own source file under `src/`

## License

[0-BSD](LICENSE)
