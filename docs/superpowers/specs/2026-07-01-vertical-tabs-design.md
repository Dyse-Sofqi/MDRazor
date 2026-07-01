# 垂直标签页 (Vertical Tabs) — 设计文档

> 日期: 2026-07-01 | 状态: 设计中

## 概述

在"标签页增强"模块下新增"垂直标签页"功能，将标签页管理融合进 Obsidian 原生文件列表侧边栏。

**三个子功能：**

1. **切换视图按钮** — 在 `nav-buttons-container` 最右侧注入 `arrow-left-right` 图标按钮
2. **关闭按钮** — 活跃标签页对应文件名后显示关闭 X，hover 显现
3. **标签页列表视图** — 点击切换按钮，文件列表仅显示活跃标签页及其祖先目录

## 设置

`MDRazorSettings` 新增 2 字段，`DEFAULT_SETTINGS` 初始值如下：

```typescript
// ── 标签页增强 ──
verticalTabsEnabled: true,       // 功能总开关
verticalTabsViewActive: false,   // 是否在标签页列表视图（持久化）
```

- `verticalTabsEnabled`: 在设置面板"标签页增强"折叠区域暴露 toggle，位于"默认新标签页打开"之后
- `verticalTabsViewActive`: 不在设置面板暴露，由切换按钮内部翻转，持久化到 `data.json`

开关关闭时：移除切换按钮 + 关闭按钮，强制退出标签页视图。

## 架构

```
src/
  controller/
    vertical-tabs.ts   ← 新增独立模块
    main.ts            ← 注册入口
  model/
    settings.ts        ← 新增 2 字段
  view/
    settings-tab.ts    ← 新增 1 个 toggle
styles.css             ← 新增 3 条规则
```

独立模块 `vertical-tabs.ts`，遵循 `dir-focus.ts` / `tab-enhancer.ts` 的既有模块模式。

## 模块: `vertical-tabs.ts`

### 函数签名

```typescript
export function registerVerticalTabs(
  plugin: Plugin,
  enabled: () => boolean,
  viewActive: () => boolean,
): void
```

### 生命周期

与 `tab-enhancer.ts` 一致：

- `app.workspace.onLayoutReady()` → 查找 file-explorer leaf（3 次 retry × 500ms）
- `app.workspace.on('layout-change')` → detach + 重新 attach
- `plugin.register()` → 清理回调

### 子功能 A: 注入切换按钮

- 查找 `containerEl` 内的 `.nav-buttons-container`
- 若 `enabled()` 为 `false`，不注入
- 追加 `clickable-icon` 到容器末尾，图标 `arrow-left-right`
- 添加 `aria-label="切换标签页视图"`
- 点击回调触发子功能 C

### 子功能 B: 注入关闭按钮

- 使用 `MutationObserver` 监听 `containerEl` 内 `.nav-file-title` 的增删
- 对每个 `.nav-file-title`，通过 `data-path` 获取路径，检查 `app.workspace.iterateAllLeaves` 是否存在对应 leaf
- 若 leaf 存在 → 追加 `<span class="mdr-vertical-tab-close">` 关闭按钮
- 若 leaf 不存在 → 移除已存在的关闭按钮（如已注入）
- 监听 `layout-change` 事件 + `workspace.on('active-leaf-change')` 来更新关闭按钮
- `enabled()` 为 `false` 时，移除所有关闭按钮，不注入新按钮

**关闭按钮回调:**

```typescript
function closeTab(path: string): void {
  app.workspace.iterateAllLeaves((leaf) => {
    if (leaf.view?.file?.path === path) {
      leaf.detach();
    }
  });
  // MutationObserver 自动移除关闭按钮
  // 若在标签页视图，DOM 自动刷新
}
```

### 子功能 C: 视图切换

- 点击切换按钮翻转 `verticalTabsViewActive`（持久化到 settings）
- 进入标签页视图：给 `containerEl` 添加 class `mdr-vertical-tabs-view`
- 退出标签页视图：移除 class

**标签页视图 CSS 行为**（通过 `styles.css` 控制）:

```css
/* 隐藏非活跃文件 */
.mdr-vertical-tabs-view .nav-file-title:not(.mdr-vertical-tab-active) {
  display: none;
}
/* 隐藏不含活跃文件的目录 */
.mdr-vertical-tabs-view .nav-folder-title:not(.mdr-vertical-tab-has-active) {
  display: none;
}
```

**class 注入逻辑**（切换视图时执行，以及 leaf 变化时增量更新）:

1. 遍历所有 `leaf.view.file` 收集活跃文件路径集合
2. 给活跃文件对应的 `.nav-file-title` 添加 `mdr-vertical-tab-active`
3. 递归向上给所有祖先 `.nav-folder-title` 添加 `mdr-vertical-tab-has-active`
4. 非活跃文件的 class 移除，不含活跃子节点的目录 class 移除

## CSS 规则

```css
/* ── 垂直标签页 ── */

/* 关闭按钮：默认透明，hover 显现 */
.mdr-vertical-tab-close {
    margin-left: auto;
    margin-right: 2px;
    cursor: pointer;
    opacity: 0;
    flex-shrink: 0;
}
.nav-file-title:hover .mdr-vertical-tab-close {
    opacity: 1;
}

/* 标签页列表视图：隐藏非活跃项和不含活跃文件的目录 */
.mdr-vertical-tabs-view .nav-file-title:not(.mdr-vertical-tab-active),
.mdr-vertical-tabs-view .nav-folder-title:not(.mdr-vertical-tab-has-active) {
    display: none;
}
```

## 边界处理

| 场景 | 处理 |
|------|------|
| `verticalTabsEnabled = false` | 不注入切换按钮、不注入关闭按钮、移除 `mdr-vertical-tabs-view` class |
| 设置面板关闭开关 | 通过 `saveSettings()` → `syncConfig()` 路径自动生效（无需 repaint） |
| 关闭最后一个活跃叶子 | 关闭按钮由 MutationObserver 自动移除；若在标签页视图，对应项和空祖目录隐藏 |
| 文件列表未就绪 | retry 机制：3 次 × 500ms |
| layout-change | 全部 detach（移除 observer、按钮），重新查找 container，重新 attach |
| 多 file-explorer leaf | 仅处理第一个叶子（与现有模块一致） |
| 外部打开文件（非本插件） | `active-leaf-change` 事件检测到新 tabs，动态添加相应关闭按钮 |
| 外部关闭文件 | `active-leaf-change` 事件检测到移除的 tabs，动态移除相应关闭按钮 |
