# 符号边界提示 — 设计文档

在实时预览模式下，光标处于隐藏格式标识符与文本内容边界时，在光标下方弹出小框展示光标与隐藏标识符的位置关系。

## 背景

"隐藏样式"功能隐藏 Markdown 格式化标记（`**`、`*`、`==`、`~~`、``` ` ```、`\`、`#`、`[[`/`]]`、HTML 颜色标签）。用户在编辑时看不见这些标记，需要一种方式感知标记的位置，避免意外破坏格式。

## 设计

### 触发条件

- 光标移动（鼠标点击 **和** 键盘方向键）后，检测光标是否处于隐藏标记边界
- 仅实时预览模式生效
- 仅当 `symbolBoundaryHint` 设置开启时生效

### 显示内容

只显示被隐藏的标识符字符。不显示方向箭头或类型标签。连续出现的标识符全部展示。

用主题色（`var(--text-accent)`）的 `|` 标记光标在标识符序列中的位置。

算法：
1. 从光标位置 `pos` 向左右展开，收集相邻的 decoration（复用 format-hider 的 `buildDecorations()`）
2. 以 `pos` 为界分左右两侧：
   - decoration 完全在左 → 加入 leftParts
   - decoration 完全在右 → 加入 rightParts
   - decoration 包含 cursor → 切开，左部分加入 leftParts，右部分加入 rightParts
3. 消除每段尾部空白（heading 标记后的空格不显示）
4. 拼接：`leftParts + "|" + rightParts`

示例（`### [[双链]][[双链]]==高亮==`）：
| 光标位置 | 显示 |
|----------|------|
| 第二个和第三个 `#` 之间 | `##|# [[` |
| `]]` 和 `[[` 之间 | `]]|[[` |
| `==` 两个 `=` 之间 | `]]=|=` |
| `]]` 结束位 | `==` |

### 定位

- 使用 `view.coordsAtPos(pos)` 获取 viewport 坐标
- `position: fixed`，直接使用 viewport 坐标
- 显示在 cursor 下方 2px 处
- 无最长宽度限制

### 样式

```css
.mdrazor-boundary-hint {
    position: fixed;
    font-family: var(--font-monospace);
    font-size: 13px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    padding: 2px 6px;
    z-index: 1000;
    white-space: pre;
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}
.mdrazor-hint-cursor {
    color: var(--text-accent);
}
```

### 生命周期

| 事件 | 行为 |
|------|------|
| cursor 移动到边界 | 构建标记文本，显示 tooltip |
| cursor 离开边界（正常文本区） | 隐藏 tooltip |
| 文档变更 | 重新检测 |
| 滚动 | 重定位或隐藏（通过 `update()` 的 `viewportChanged` ） |
| 窗口缩放 | CM6 触发 update → 重定位 |
| 切换选项卡/切换源码模式 | ViewPlugin 重建 → 无 decoration → 隐藏 |

## 架构

### 模块依赖

```
cursor-boundary-hint.ts
  ├── 读取 formattingConfig（模块级配置）
  ├── 调用 buildDecorations(view) — 从 format-hider.ts 导出
  └── 管理 ViewPlugin + 浮动 DOM
```

`buildDecorations()` 原为 format-hider.ts 的内部函数，需改为导出。ViewPlugin 的 update() 回调中调用此函数，通过 `.between()` 查询光标附近的 decoration。

### 文件改动清单

| 文件 | 改动 |
|------|------|
| `src/model/settings.ts` | 新增 `symbolBoundaryHint: boolean`（默认 `true`） |
| `src/view/settings-tab.ts` | "隐藏样式"区末尾新增 Toggle，名称"符号边界提示" |
| `src/controller/format-hider/format-hider.ts` | 将 `buildDecorations()` 改为 `export` |
| `src/controller/format-hider/cursor-boundary-hint.ts` | **新建** — 核心实现 |
| `src/controller/main.ts` | 导入新模块，注册扩展，syncConfig 无需改动 |

### 实现细节

```typescript
// cursor-boundary-hint.ts

import { ViewPlugin, ViewUpdate, DecorationSet, EditorView } from '@codemirror/view';
import { formattingConfig, buildDecorations } from './format-hider';

function getHintMarkers(view: EditorView, decorations: DecorationSet, pos: number): { left: string; right: string } | null {
    // if no format hiding enabled → null

    // Expand right: decorations starting at current rightBound
    let leftBound = pos;
    let rightBound = pos;
    
    while (true) {
        let expanded = false;
        decorations.between(rightBound, rightBound + 1, (from, to) => {
            if (from === rightBound && from < to) { rightBound = to; expanded = true; }
        });
        if (!expanded) break;
    }
    while (true) {
        let expanded = false;
        decorations.between(leftBound - 1, leftBound, (from, to) => {
            if (to === leftBound && from < to) { leftBound = from; expanded = true; }
        });
        if (!expanded) break;
    }
    
    if (leftBound === pos && rightBound === pos) return null;
    
    const leftParts: string[] = [];
    const rightParts: string[] = [];
    let hasAny = false;
    
    decorations.between(leftBound, rightBound, (from, to) => {
        hasAny = true;
        if (to <= pos) {
            leftParts.push(view.state.doc.sliceString(from, to).replace(/\s+$/, ''));
        } else if (from >= pos) {
            rightParts.push(view.state.doc.sliceString(from, to).replace(/\s+$/, ''));
        } else {
            const lt = view.state.doc.sliceString(from, pos).replace(/\s+$/, '');
            const rt = view.state.doc.sliceString(pos, to).replace(/\s+$/, '');
            if (lt) leftParts.push(lt);
            if (rt) rightParts.push(rt);
        }
    });
    
    if (!hasAny) return null;
    const left = leftParts.join('');
    const right = rightParts.join('');
    if (!left && !right) return null;
    return { left, right };
}

export function createCursorBoundaryHintExtension() {
    return ViewPlugin.fromClass(class {
        decorations: DecorationSet;
        hintEl: HTMLElement | null = null;
        
        constructor(view: EditorView) {
            this.decorations = buildDecorations(view);
            this.updateHint(view, view.state.selection.main.head);
        }
        
        update(update: ViewUpdate) {
            this.decorations = buildDecorations(update.view);
            if (update.selectionSet || update.docChanged) {
                this.updateHint(update.view, update.view.state.selection.main.head);
            } else if (update.viewportChanged || update.geometryChanged) {
                this.reposition(update.view);
            }
        }
        
        // ... show/hide/reposition logic
    });
}
```

## 性能考量

- `buildDecorations()` 已在 format-hider 中每帧调用，本模块复用同一函数但多调用一次（双倍遍历 syntax tree）。按 CM6 的性能特征，每次遍历耗时 < 0.5ms，可忽略。
- 浮动 DOM 操作仅在 cursor 进入/离开边界时发生，常态下无开销。
- `.between()` 查询使用 RangeSet 的树搜索，O(log n)。
