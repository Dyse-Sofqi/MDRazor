# 符号边界提示 (Symbol Boundary Hint) 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 光标处于隐藏格式标识符边界时，在光标下方弹出小框展示隐藏标识符位置关系。

**Architecture:** 新建 ViewPlugin 管理浮动 DOM tooltip。复用 format-hider 的 `buildDecorations()` 查询光标附近的隐藏标记 decoration。通过 `view.coordsAtPos()` 定位，`position: fixed` 跟随光标。

**Tech Stack:** CodeMirror 6 ViewPlugin, DecorationSet, Obsidian CSS 变量

## Global Constraints

- `symbolBoundaryHint` 默认 `true`
- 鼠标和键盘光标移动时都触发检测
- 仅实时预览模式生效（复用 `buildDecorations` 的 live-preview 检查）
- 只显示被隐藏的标识符字符，用主题色 `|` 标记光标位置
- 无最长宽度限制
- 连续标识符全部展示，尾部空白消除
- 文件用 tab 缩进

---

### Task 1: 设置模型新增 symbolBoundaryHint

**Files:**
- Modify: `src/model/settings.ts`

**Interfaces:**
- Consumes: MDRazorSettings interface, DEFAULT_SETTINGS
- Produces: `MDRazorSettings.symbolBoundaryHint: boolean`, default `true`

- [ ] **Step 1: 在 MDRazorSettings interface 添加字段**

在 `hideHtmlColorTagFormatting`（第 28 行）后、`// ── 列表增强` 注释前插入 `symbolBoundaryHint` 字段：

```typescript
	hideHtmlColorTagFormatting: boolean;

	// ── 光标边界提示 ──
	symbolBoundaryHint: boolean;

	// ── 列表增强 (controller/list-enhancer/) ──
```

- [ ] **Step 2: 在 DEFAULT_SETTINGS 添加默认值**

在 `hideHtmlColorTagFormatting: true`（第 67 行）后、`listIntegration: true` 前插入：

```typescript
	hideHtmlColorTagFormatting: true,
	symbolBoundaryHint: true,
	listIntegration: true,
```

- [ ] **Step 3: 验证**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/model/settings.ts
git commit -m "feat: add symbolBoundaryHint setting (default true)"
```

---

### Task 2: 导出 buildDecorations

**Files:**
- Modify: `src/controller/format-hider/format-hider.ts:59`

**Interfaces:**
- Produces: exported `buildDecorations(view: EditorView): DecorationSet`

- [ ] **Step 1: 将 `buildDecorations` 改为 export**

第 59 行 `function buildDecorations` → `export function buildDecorations`

- [ ] **Step 2: 验证**

Run: `npx tsc --noEmit`
Expected: no errors (export unused for now, TS doesn't error on unused exports)

- [ ] **Step 3: Commit**

```bash
git add src/controller/format-hider/format-hider.ts
git commit -m "refactor: export buildDecorations for reuse by cursor-boundary-hint"
```

---

### Task 3: 创建光标边界提示核心模块

**Files:**
- Create: `src/controller/format-hider/cursor-boundary-hint.ts`

**Interfaces:**
- Consumes: `formattingConfig` from `./format-hider`, `buildDecorations(view)` from `./format-hider`
- Produces: `createCursorBoundaryHintExtension(): Extension`

- [ ] **Step 1: 创建文件**

完整文件内容：

```typescript
/**
 * MDRazor — 符号边界提示（Controller）
 *
 * 光标处于隐藏格式标识符与文本内容边界时，在光标下方弹出小框展示
 * 光标与隐藏标识符的位置关系。
 *
 * ── 架构 ──
 *
 * 独立 ViewPlugin，每帧从 format-hider 模块读取 decoration set，
 * 通过 `.between()` 查询光标附近的标记，若处于边界则在光标下方
 * 显示浮动 tooltip。
 *
 * Tooltip 内容：连续隐藏标记字符，用主题色的 | 标记光标位置。
 */

import {
	ViewPlugin,
	ViewUpdate,
	DecorationSet,
	EditorView,
} from '@codemirror/view';
import { formattingConfig, buildDecorations } from './format-hider';

/**
 * 查询光标位置附近的隐藏标记，构建左、右两侧文本。
 *
 * 算法：
 *   1. 从光标 pos 向左右展开，收集相邻 decoration（strictly adjacent）
 *   2. 按 pos 为界分左右两侧
 *   3. 消除每段尾部空白
 *   4. 返回 { left, right } 或 null（无标记边界）
 *
 * @returns 左右文本片段，null 表示光标不在标记边界
 */
function getHintMarkers(
	view: EditorView,
	decorations: DecorationSet,
	pos: number,
): { left: string; right: string } | null {
	if (!formattingConfig.symbolBoundaryHint) return null;

	// ── 向左右展开：找到光标所在的连续 decoration 块 ──

	let leftBound = pos;
	let rightBound = pos;

	// 向右展开：查找从 rightBound 开始的 decoration
	while (true) {
		let expanded = false;
		decorations.between(rightBound, rightBound + 1, (from, to) => {
			if (from === rightBound && from < to) {
				rightBound = to;
				expanded = true;
			}
		});
		if (!expanded) break;
	}

	// 向左展开：查找在 leftBound 结束的 decoration
	while (true) {
		let expanded = false;
		decorations.between(leftBound - 1, leftBound, (from, to) => {
			if (to === leftBound && from < to) {
				leftBound = from;
				expanded = true;
			}
		});
		if (!expanded) break;
	}

	// 无相邻 decoration → 不在边界
	if (leftBound === pos && rightBound === pos) return null;

	// ── 收集两侧文本片段 ──

	const leftParts: string[] = [];
	const rightParts: string[] = [];
	let hasAny = false;

	decorations.between(leftBound, rightBound, (from, to) => {
		hasAny = true;
		if (to <= pos) {
			// decoration 完全在光标左侧
			leftParts.push(view.state.doc.sliceString(from, to).replace(/\s+$/, ''));
		} else if (from >= pos) {
			// decoration 完全在光标右侧
			rightParts.push(view.state.doc.sliceString(from, to).replace(/\s+$/, ''));
		} else {
			// decoration 包含光标位置 → 切开
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

/**
 * 创建符号边界提示的 CM6 扩展。
 *
 * 使用 ViewPlugin 管理一个 position: fixed 的浮动 DOM 元素，
 * 在光标移动到隐藏标记边界时显示提示。
 */
export function createCursorBoundaryHintExtension() {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			hintEl: HTMLElement | null = null;
			markerInfo: { left: string; right: string; pos: number } | null = null;

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

			destroy() {
				if (this.hintEl) {
					this.hintEl.remove();
					this.hintEl = null;
				}
			}

			private updateHint(view: EditorView, pos: number) {
				if (!formattingConfig.symbolBoundaryHint) {
					this.hideHint();
					return;
				}

				const info = getHintMarkers(view, this.decorations, pos);
				if (!info) {
					this.hideHint();
					return;
				}

				this.markerInfo = { ...info, pos };
				this.showHint(view, pos);
			}

			private showHint(view: EditorView, pos: number) {
				if (!this.hintEl) {
					this.hintEl = document.createElement('div');
					this.hintEl.className = 'mdrazor-boundary-hint';

					const leftSpan = document.createElement('span');
					leftSpan.className = 'mdrazor-hint-left';
					const cursorSpan = document.createElement('span');
					cursorSpan.className = 'mdrazor-hint-cursor';
					cursorSpan.textContent = '|';
					const rightSpan = document.createElement('span');
					rightSpan.className = 'mdrazor-hint-right';

					this.hintEl.appendChild(leftSpan);
					this.hintEl.appendChild(cursorSpan);
					this.hintEl.appendChild(rightSpan);
					document.body.appendChild(this.hintEl);
				}

				// 更新内容
				const leftSpan = this.hintEl.children[0] as HTMLElement;
				const rightSpan = this.hintEl.children[2] as HTMLElement;
				leftSpan.textContent = this.markerInfo!.left;
				rightSpan.textContent = this.markerInfo!.right;

				// 定位
				const coords = view.coordsAtPos(pos);
				if (coords) {
					this.hintEl.style.left = coords.left + 'px';
					this.hintEl.style.top = coords.bottom + 2 + 'px';
				}

				this.hintEl.style.display = '';
			}

			private hideHint() {
				this.markerInfo = null;
				if (this.hintEl) {
					this.hintEl.style.display = 'none';
				}
			}

			private reposition(view: EditorView) {
				if (this.markerInfo && this.hintEl && this.hintEl.style.display !== 'none') {
					const coords = view.coordsAtPos(this.markerInfo.pos);
					if (coords) {
						this.hintEl.style.left = coords.left + 'px';
						this.hintEl.style.top = coords.bottom + 2 + 'px';
					} else {
						this.hideHint();
					}
				}
			}
		},
	);
}
```

- [ ] **Step 2: 验证**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/controller/format-hider/cursor-boundary-hint.ts
git commit -m "feat: add cursor-boundary-hint ViewPlugin with tooltip"
```

---

### Task 4: 添加 CSS 样式

**Files:**
- Modify: `styles.css`（末尾追加）

- [ ] **Step 1: 在 styles.css 末尾添加边界提示样式**

追加以下 CSS：

```css
/* ── 符号边界提示 ── */
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
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
.mdrazor-hint-cursor {
	color: var(--text-accent);
}
```

- [ ] **Step 2: 验证**

Run: `npx tsc --noEmit`
Expected: no errors (CSS 文件不影响 TS 编译)

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "style: add boundary hint CSS styles"
```

---

### Task 5: 设置面板添加符号边界提示开关

**Files:**
- Modify: `src/view/settings-tab.ts`

**Interfaces:**
- Consumes: `this.plugin.settings.symbolBoundaryHint`, `this.plugin.saveSettings()`

- [ ] **Step 1: 在"空格可视化"开关后（第 176 行后）添加新开关**

在第 176 行（`空格可视化` 的 toggle 结束）后、第 178 行（`// ═══════════ 列表增强` 注释）前插入：

```typescript
			new Setting(hideSection)
				.setName('符号边界提示')
				.setDesc('光标处于格式标识符边界时，在光标下方弹出提示，展示光标与隐藏标识符的位置关系')
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.symbolBoundaryHint)
						.onChange(async (value) => {
							this.plugin.settings.symbolBoundaryHint = value;
							await this.plugin.saveSettings();
						}),
				);
```

- [ ] **Step 2: 验证**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/view/settings-tab.ts
git commit -m "feat: add symbol boundary hint toggle in settings"
```

---

### Task 6: 在主入口注册扩展

**Files:**
- Modify: `src/controller/main.ts`

- [ ] **Step 1: 导入新模块**

在现有 import 块（第 21 行 `import { formattingConfig, createFormatHiderExtension } from './format-hider/format-hider';`）后添加：

```typescript
import { createCursorBoundaryHintExtension } from './format-hider/cursor-boundary-hint';
```

- [ ] **Step 2: 注册扩展**

在 `this.registerEditorExtension(createSpaceVisualizationExtension())`（第 83 行）后添加：

```typescript
			this.registerEditorExtension(createCursorBoundaryHintExtension());
```

- [ ] **Step 3: 验证**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/controller/main.ts
git commit -m "feat: register cursor boundary hint extension"
```

---

### Task 7: 构建并验证

- [ ] **Step 1: 完整编译检查**

```bash
npx tsc --noEmit
```

Expected: no errors, zero warnings

- [ ] **Step 2: 最终提交**

```bash
git add -A
git commit -m "chore: complete symbol boundary hint feature"
```
