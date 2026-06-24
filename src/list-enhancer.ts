/**
 * MDRazor — 列表增强模块
 *
 * 将列表标记（如 `- `、`1. `、`* `）视为原子单元进行光标定位和删除，
 * 改善实时预览模式下列表编辑体验。
 *
 * ── 架构 ──
 *
 * 本模块导出：
 *   - `listEnhancerConfig` — 模块级可变配置，由 main.ts 同步。
 *   - `createListEnhancerExtension()` — 工厂函数，返回一个 `Prec.high`
 *     CM6 扩展，由两个独立部分组成：
 *
 *     1. **ViewPlugin**（`listEnhancerPlugin`）— 从 Lezer 语法树构建
 *        原子区间集，每次鼠标点击后将在原子区间内的光标推到边界外。
 *
 *     2. **DOM 事件处理器**（`listDeleteHandler`）— 拦截 Backspace 和
 *        Delete 按键。如果被删除的字符与原子区间有交集，删除范围扩展
 *        为覆盖整个标记。如果该项后为空且上一行也有列表标记，则吞入
 *        前一个换行符使内容向上合并。
 *
 * ── 原子区间概念 ──
 *
 * HyperMD 的 Lezer 语法产生的 `formatting-list` 节点已包含标记字符
 * 和尾随空格（例如 `- ` 是一个跨 2 个字符的节点）。我们直接使用节点
 * 范围作为"原子区间"——光标永远不允许落在内部。
 *
 * 通过 `currentAtomicRanges` 模块级变量追踪，ViewPlugin 和 DOM 处理器
 * 均访问此变量，无需在两个扩展组件之间共享状态或消息传递。
 */

import {
	ViewPlugin,
	ViewUpdate,
	EditorView,
} from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { MDRazorSettings, DEFAULT_SETTINGS } from './settings';

/**
 * 模块级可变配置对象。
 * 由 main.ts 在每次 saveSettings() 时写入，两个扩展组件均读取此对象。
 */
export const listEnhancerConfig: MDRazorSettings = { ...DEFAULT_SETTINGS };

/**
 * 表示文档中一个连续的、应被视为单一原子单元的区间 ——
 * 光标永不放置在内部，且与其重叠的字符删除操作会扩展为覆盖整个区间。
 */
interface AtomicRange {
	from: number;
	to: number; // 结束位置（不含）
}

/**
 * 最新的原子区间集，每次文档变更后重新计算。
 * 在 ViewPlugin（更新者）和删除处理器（读取者）之间共享。
 * 这种做法是安全的，因为两者在同一事件循环轮次运行 ——
 * 处理器总是读取 ViewPlugin 上一次 update() 产生的版本。
 */
let currentAtomicRanges: AtomicRange[] = [];

/**
 * 从当前语法树构建原子区间集。
 *
 * HyperMD 的 `formatting-list` 节点已包含尾随空格，
 * 因此 `node.from` → `node.to` 正是我们要保护的范围。
 *
 * @param view  当前的 EditorView
 * @returns     原子区间数组（功能关闭时返回空数组）
 */
function buildAtomicRanges(view: EditorView): AtomicRange[] {
	if (!listEnhancerConfig.listIntegration) return [];

	const ranges: AtomicRange[] = [];
	const tree = syntaxTree(view.state);

	tree.iterate({
		enter(node) {
			if (!node.type.name.includes('formatting-list')) return;
			ranges.push({ from: node.from, to: node.to });
		},
	});

	return ranges;
}

/**
 * 如果 `pos` 严格在原子区间*内部*，将其推向最近的边界。
 * 如果距两侧距离相等，优先推向左边界。
 *
 * @returns 调整后的位置，或原位置（如果不在任何区间内）
 */
function nudgeOutOfAtomicRanges(pos: number, ranges: readonly AtomicRange[]): number {
	for (const r of ranges) {
		if (pos > r.from && pos < r.to) {
			const distLeft = pos - r.from;
			const distRight = r.to - pos;
			return distLeft <= distRight ? r.from : r.to;
		}
	}
	return pos;
}

/**
 * 给定一个原始（单字符）删除范围，扩展以完整覆盖任何相交的原子区间。
 * 如有需要还与上一个列表项合并。
 *
 * 扩展分三个阶段：
 *   1. 收集所有与原始删除范围重叠的原子区间。
 *   2. 将 `from`/`to` 扩展到这些区间的最小/最大值。
 *   3. 如果结果位于行首且前一行也是列表项，将 `from` 向后扩展到换行符，
 *      使删除操作与上一项合并（Obsidian 对空项的原生行为也是如此处理）。
 *
 * @param delFrom  原始删除起始（单个字符）
 * @param delTo    原始删除结束（单个字符，不含）
 * @param view     EditorView，用于访问文档、行和语法树
 * @returns        扩展后的范围，如果未命中任何原子区间则返回 null
 */
function expandDeletion(
	delFrom: number,
	delTo: number,
	view: EditorView,
): { from: number; to: number } | null {
	// ── 阶段 1 & 2：扩展以覆盖整个原子区间 ──
	let expandedFrom = delFrom;
	let expandedTo = delTo;
	let expanded = false;

	for (const r of currentAtomicRanges) {
		if (delFrom < r.to && delTo > r.from) {
			if (r.from < expandedFrom) expandedFrom = r.from;
			if (r.to > expandedTo) expandedTo = r.to;
			expanded = true;
		}
	}

	if (!expanded) return null;

	// ── 阶段 3：与上一个列表项合并（Backspace 删除空续行时向上归并） ──
	const doc = view.state.doc;
	const curLine = doc.lineAt(expandedFrom);
	if (curLine.from > 0) {
		// 我们可能要吞掉的换行符位于当前行之上的一个字符。
		const prevNewline = curLine.from - 1;
		const tree = syntaxTree(view.state);

		// 检查上一位置是否在列表项节点内 —— 涵盖续行/软换行场景。
		// 续行自身不含 formatting-list，但所在位置仍位于 ListItem
		// 等结构性节点内，此时同样应当触发合并。
		let prevInListItem = false;
		const cursor = tree.cursorAt(prevNewline, -1);
		do {
			const name = cursor.type.name.toLowerCase();
			// BulletList / OrderedList / ListItem 等结构性节点均含 "list"
			// 且不含 "formatting"（排除 formatting-list 叶节点）
			if (name.includes('list') && !name.includes('formatting')) {
				prevInListItem = true;
				break;
			}
		} while (cursor.parent());

		if (prevInListItem) {
			// 将换行符纳入删除范围 —— 当前行的内容（不含标记）将与上一行合并。
			expandedFrom = prevNewline;
		}
	}

	return { from: expandedFrom, to: expandedTo };
}

// ═══════════════════════════════════════════════════════════════════════════
//  ViewPlugin — 光标修正 & 续行缩进对齐
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 维护原子区间集、修正点击后光标位置、对齐续行缩进的 ViewPlugin。
 */
const listEnhancerPlugin = ViewPlugin.fromClass(
	class {
		private atomicRanges: AtomicRange[] = [];

		constructor(view: EditorView) {
			this.atomicRanges = buildAtomicRanges(view);
			currentAtomicRanges = this.atomicRanges;
		}

		update(update: ViewUpdate) {
			this.atomicRanges = buildAtomicRanges(update.view);
			currentAtomicRanges = this.atomicRanges;
			this.correctCursorAfterClick(update);
		}

		/**
		 * 鼠标点击后，如果光标落在原子区间内（在 `-` 和内容之间），
		 * 将其推到最近的边界。
		 */
		private correctCursorAfterClick(update: ViewUpdate) {
			if (!listEnhancerConfig.listIntegration) return;

			for (const tr of update.transactions) {
				if (!tr.isUserEvent('select.pointer')) continue;

				const sel = tr.state.selection.main;
				if (sel.anchor !== sel.head) continue; // 不是简单点击

				const pos = sel.head;
				const adjusted = nudgeOutOfAtomicRanges(pos, this.atomicRanges);
				if (adjusted === pos) continue;

				const view = update.view;
				queueMicrotask(() => {
					view.dispatch({
						selection: { anchor: adjusted, head: adjusted },
						scrollIntoView: false,
					});
				});
			}
		}

	},
);

// ═══════════════════════════════════════════════════════════════════════════
//  辅助函数 — 列表检测
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 检测给定位置是否位于结构性的列表节点（ListItem / BulletList / OrderedList）
 * 内。续行（软换行产物）虽不含 `formatting-list` 叶节点，但其位置仍位于
 * 列表结构性节点内，因此同样返回 true。
 *
 * 实现与 expandDeletion 阶段 3 及 Backspace 处理器的列表检测逻辑一致。
 */
function isInListItem(view: EditorView, pos: number): boolean {
	const tree = syntaxTree(view.state);
	let cursor = tree.cursorAt(pos, -1);
	do {
		const name = cursor.type.name.toLowerCase();
		if (name.includes('list') && !name.includes('formatting')) {
			return true;
		}
	} while (cursor.parent());
	return false;
}

// ═══════════════════════════════════════════════════════════════════════════
//  DOM 事件处理器 — 整体删除
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 拦截 Backspace 和 Delete 按键。如果正在删除的单个字符与任何原子区间
 * 重叠，通过 `expandDeletion()` 扩展删除以移除整个标记（并可能与上一个
 * 列表项合并）。
 *
 * 我们使用 `EditorView.domEventHandlers`（而不是事务过滤器），
 * 因为需要 `event.preventDefault()` —— 过滤器 API 无法取消已分发的
 * 事务。返回值 `true` 告诉 CM6 事件已被处理，它不应继续处理。
 */
const listDeleteHandler = EditorView.domEventHandlers({
	keydown(event, view) {
		if (!listEnhancerConfig.listIntegration) return false;

		const isBackspace = event.key === 'Backspace';
		const isDelete = event.key === 'Delete';
		if (!isBackspace && !isDelete) return false;

		// 仅处理单光标（无选区）按键。
		const sel = view.state.selection.main;
		if (sel.anchor !== sel.head) return false;

		const pos = sel.head;
		let delFrom: number;
		let delTo: number;

		if (isBackspace) {
			if (pos === 0) return false;
			delFrom = pos - 1;
			delTo = pos;

			// 光标前均为空白符号时，将删除起点前推到行首，
			// 确保删除范围与原子区间产生交集，从而触发整体删除与合并。
			// 涵盖：光标在行首、缩进列表项的空白前缀中等场景。
			const line = view.state.doc.lineAt(pos);
			const prefix = view.state.doc.sliceString(line.from, pos);
			if (/^[ 	]*$/.test(prefix)) {
				let foundRange = false;
				for (const r of currentAtomicRanges) {
					if (r.from >= line.from && r.to <= line.to) {
						delFrom = line.from;
						delTo = r.to;
						foundRange = true;
						break;
					}
				}

				// 本行无列符，但光标处于列表项续行（软换行产物）内。
				// 直接将换行符及前方空白一并删除，合并至上行。
				if (!foundRange && line.from > 0) {
					const tree = syntaxTree(view.state);
					let cur = tree.cursorAt(pos, -1);
					let insideListItem = false;
					do {
						const name = cur.type.name.toLowerCase();
						if (name.includes('list') && !name.includes('formatting')) {
							insideListItem = true;
							break;
						}
					} while (cur.parent());

					if (insideListItem) {
						event.preventDefault();
						view.dispatch({
							changes: { from: line.from - 1, to: pos },
							userEvent: 'deleteContentBackward',
						});
						return true;
					}
				}
			}
		} else {
			if (pos >= view.state.doc.length) return false;
			delFrom = pos;
			delTo = pos + 1;
		}

		const expanded = expandDeletion(delFrom, delTo, view);
		if (!expanded) return false;

		event.preventDefault();
		view.dispatch({
			changes: { from: expanded.from, to: expanded.to },
			userEvent: isBackspace ? 'deleteContentBackward' : 'deleteContentForward',
		});
		return true;
	},
});

// ═══════════════════════════════════════════════════════════════════════════
//  ViewPlugin — Enter 捕获（capture 阶段）
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 在 capture 阶段拦截 DOM keydown 事件，以绕过 CodeMirror 6 的优先级体系。
 * HyperMD 的 Enter 处理使用 domEventHandlers（冒泡阶段），capture 阶段优先
 * 于所有冒泡处理器，确保我们的拦截一定生效。
 *
 * 当 `enterSoftBreak` 启用且光标位于列表项内时：
 *   1. Feature 1：插入软换行（\n + 缩进）
 *   2. Feature 2：空白续行升级为同级列表项
 */
const enterCapturePlugin = ViewPlugin.fromClass(
	class {
		private readonly view: EditorView;
		private readonly handler: (event: KeyboardEvent) => void;

		constructor(view: EditorView) {
			this.view = view;

			this.handler = (event: KeyboardEvent) => {
				if (event.key !== 'Enter') return;
				if (!listEnhancerConfig.enterSoftBreak) return;

				const sel = view.state.selection.main;
				if (sel.anchor !== sel.head) return;

				const pos = sel.head;
				if (!isInListItem(view, pos)) return;

				const tree = syntaxTree(view.state);

				// 在 cursor 之前寻找最近的 formatting-list 节点
				// HyperMD 无 ListItem 节点，以 formatting-list 定位所属列表项
				let lastMarker: { from: number; to: number } | null = null;
				{
					const cursor = tree.cursor();
					do {
						if (cursor.type.name.includes('formatting-list')) {
							if (cursor.from > pos) break;
							lastMarker = { from: cursor.from, to: cursor.to };
						}
					} while (cursor.next());
				}

				if (!lastMarker) return;

				const markerText = view.state.doc.sliceString(
					lastMarker.from, lastMarker.to);
				const markerLine = view.state.doc.lineAt(lastMarker.from);

				const line = view.state.doc.lineAt(pos);
				const prefix = view.state.doc.sliceString(line.from, pos);
				const isBlankPrefix = /^[ \t]*$/.test(prefix);
				const isFirstLine = line.number === markerLine.number;

				// 缩进：保留原始样式（tab 保持 tab），仅列表符替换为等宽空格
				const leadingMatch = /^[ \t]*/.exec(line.text);
				const leadingLen = leadingMatch ? leadingMatch[0].length : 0;
				let indentStr: string;
				if (isFirstLine) {
					// 首行：保留列表符之前的缩进样式，将列表符替换为等宽空格
					const beforeMarker = view.state.doc.sliceString(
						markerLine.from, lastMarker.from);
					const markerWidth = lastMarker.to - lastMarker.from;
					indentStr = '\n' + beforeMarker + ' '.repeat(markerWidth);
				} else {
					// 续行：直接复制前置空白（tab/s空格原样保留）
					indentStr = '\n'
						+ view.state.doc.sliceString(line.from, line.from + leadingLen);
				}

				// ── Feature 2：空白续行升级为列表项 ──
				if (!isFirstLine && isBlankPrefix && line.number > 1) {
					const prevLine = view.state.doc.line(line.number - 1);
					if (prevLine.text.trim().length > 0) {
						const beforeMarker = view.state.doc.sliceString(
							markerLine.from, lastMarker.from);
						const replacement = beforeMarker + markerText;

						event.preventDefault();
						event.stopImmediatePropagation();
						view.dispatch({
							changes: { from: line.from, to: pos, insert: replacement },
							selection: { anchor: line.from + replacement.length },
							userEvent: 'input',
						});
						return;
					}
				}

				// ── Feature 1：软换行 ──
				event.preventDefault();
				event.stopImmediatePropagation();
				view.dispatch({
					changes: { from: pos, insert: indentStr },
					selection: { anchor: pos + indentStr.length },
					userEvent: 'input',
				});
			};
			view.dom.addEventListener('keydown', this.handler, { capture: true });
		}

		destroy() {
			this.view.dom.removeEventListener('keydown', this.handler, { capture: true });
		}
	},
);

// ═══════════════════════════════════════════════════════════════════════════
//  公开工厂函数
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 创建列表增强的组合 CM6 扩展。
 *
 * ViewPlugin 和 DOM 处理器通过数组组合成单个 `Extension`。
 * `Prec.high` 确保按键处理器在 Obsidian 自己的处理器之前触发。
 */
export function createListEnhancerExtension() {
	return Prec.high([listEnhancerPlugin, listDeleteHandler, enterCapturePlugin]);
}
