# MDRazor 开发日志（DEBUGLOG）

记录功能构建与错误修复的技术细节：根因、架构决策、排查过程。面向开发者。

---

## 2.3.8 (2026-08-09)

### 新增功能：新标签页打开书签

**模块结构**

| 文件 | 职责 |
|---|---|
| `src/controller/tab-enhancer/open-in-tab.ts` | 共享打开重定向模块：补丁 `WorkspaceLeaf.openFile` 与 `Workspace.openLinkText`，提供 `requestOpenInTab(path)` / `requestOpenAnyInTab()` / `initOpenInTab(plugin)` |
| `src/controller/tab-enhancer/bookmark-opener.ts` | 书签视图点击拦截，`registerBookmarkOpener(plugin, enabled)` |
| `src/controller/tab-enhancer/tab-enhancer.ts` | 文件列表点击，改用共享模块 |

**设计决策：拦截原生 click 还是重定向打开？**

文件列表功能原本在 capture 阶段拦截点击并 `stopImmediatePropagation`，自行打开标签页。但这样会连带阻止 Obsidian 原生选择/锚点更新，破坏 Shift+点击范围多选。改为**不拦截原生点击**：让原生 handler 完整执行（选择、锚点、高亮都保留），再用**作用域补丁**把原生打开调用（`WorkspaceLeaf.openFile` / `Workspace.openLinkText`）重定向到增强目标。

补丁安全模型：模块维护 `pendingPath`（路径匹配）与 `pendingAny`（泛化匹配）两个一次性标记，仅当功能 handler 设置了标记且 `Date.now() - ts < 500ms` 时才重定向；其余 `openFile`/`openLinkText` 调用（双链、快速切换、搜索等）原样透传。卸载时恢复原型方法。

**文件列表点击重定向流程**

```
pointerdown/mousedown/click (capture, 文件列表容器)
  → 识别 .nav-file-title + data-path → requestOpenInTab(path)
  → 不 stopPropagation
  → Obsidian 原生 handler 执行（选择 + 锚点更新）
  → 原生调用 openFile(file)
  → 补丁拦截：pendingPath 匹配 → 已有标签页跳转 / 新建标签页
```

**书签点击识别**

- 定位：`.tree-item-self.bookmark.is-clickable`（`.bookmark` class 是书签视图独有，无需依赖 `[data-type="bookmarks"]`）
- 事件：`pointerdown`/`mousedown`/`click` 三事件 capture 于 `app.workspace.containerEl`（与 link-opener 同模式）
- 修饰键豁免：Ctrl/Meta/Shift + 中键/右键 → 原生

### Bug 修复

#### 1. 默认新标签页打开开关切换后不能即时生效

**根因：** `registerTabEnhancer` 开头 `if (!enabled()) return;`。插件加载时开关为关 → 直接 return，click/contextmenu handler 永不挂载。之后设置里开开关 → 仅 settings 对象更新，handler 不存在 → 功能失效直到重载或 layout-change。

**修复：** 删除早期 return，handler 无条件挂载，事件触发时实时读取 `enabled()`（与 link-opener 一致）。vault.create handler 同样有 `enabled()` 运行时检查，无需改动。

#### 2. 文件列表 Shift+点击多选失效

**根因：** 拦截原生 click 时 `stopImmediatePropagation` 把 Obsidian 原生选择逻辑一并阻断，Shift+点击范围多选的锚点（最近一次普通点击的文件）永不更新，范围选取错误或空选。

**修复：** 架构级改动（见上方设计决策）——不再拦截点击，改用 `openFile` 补丁重定向。锚点由原生维护，Shift+点击天然恢复。

**排查记录：** 曾尝试在 click handler 中加 `e.shiftKey` 放行，但锚点本身已损坏，放行无效。最终确认必须让原生普通点击完整执行，而非只放行 Shift。

#### 3. 书签拦截失效（两次排查）

**第一次假设：** 视图类型字符串 `[data-type="bookmarks"]` 可能不对、书签项无 `data-path`、原生不走 `openFile`。遂改为 `.bookmark` class 直接定位 + 同时补丁 `openLinkText`。

**诊断（控制台日志定位）：**

```
[MDRazor-bookmark] pointerdown item= tree-item-self bookmark is-clickable dataPath= 《阅读你的症状》 enabled= true
[MDRazor-openFile] 《阅读你的症状》.md pendingPath= null pendingAny= null
```

**真正根因：** 书签项 `data-path` 存的是**笔记标题**（文件名去扩展名，`《阅读你的症状》`），不是文件路径。`app.vault.getAbstractFileByPath('《阅读你的症状》')` 解析失败（无 `.md`）→ handler 返回未设 pending → 原生 openFile 时 pending 为 null → 不重定向。

**修复：** 改用 `metadataCache.getFirstLinkpathDest(linkText, '')`（wikilink 解析器，link-opener 同款）把标题解析为真实文件路径。诊断同时确认：handler 触发正常、顺序正常（pointerdown 设 pending → 原生 click 才 openFile）、原生确实走 `openFile`。

**额外收获：** 诊断证实原生书签点击走 `WorkspaceLeaf.openFile`，openFile 补丁足以覆盖；openLinkText 补丁保留作为防御。移除泛化降级 `requestOpenAnyInTab` 的书签调用，避免 stale pending 在 500ms 窗口内误伤后续无关打开。

### 待验证 / 已知限制

- 书签 `getFirstLinkpathDest` 解析：同名笔记位于多个文件夹时取第一个匹配，存在歧义
- 补丁依赖原生打开走 `openFile`/`openLinkText`；若未来 Obsidian 变更打开路径，需跟进
- 无自动化测试框架，上述行为经 Obsidian 手动验证
