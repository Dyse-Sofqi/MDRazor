/**
 * MDRazor — 列一体化模块（Controller）
 *
 * 将列表标记（如 `- `、`1. `、`* `）视为原子单元进行光标定位和删除，
 * 改善实时预览模式下列表编辑体验。
 *
 * 本模块处理：
 *   1. ViewPlugin — 从 Lezer 语法树构建原子区间集，每次点击后将
 *      落在原子区间内的光标推到边界外。
 *   2. DOM 事件处理器 — 拦截 Backspace 和 Delete。如果被删除的字符
 *      与原子区间有交集，删除范围扩展为覆盖整个标记。如果该项后为空
 *      且上一行也有列表标记，则吞入前一个换行符使内容向上合并。
 */

import {
	ViewPlugin,
	ViewUpdate,
	EditorView,
} from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import {
	listEnhancerConfig,
	setCurrentAtomicRanges,
	getCurrentAtomicRanges,
	AtomicRange,
	buildAtomicRanges,
	nudgeOutOfAtomicRanges,
} from '../model/shared';

// ═══════════════════════════════════════════════════════════════════════════
//  删除范围扩展
// ═══════════════════════════════════════════════════════════════════════════

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

	const ranges = getCurrentAtomicRanges();
	for (const r of ranges) {
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
		const prevNewline = curLine.from - 1;
		const tree = syntaxTree(view.state);

		let prevInListItem = false;
		const cursor = tree.cursorAt(prevNewline, -1);
		do {
			const name = cursor.type.name.toLowerCase();
			if (name.includes('list') && !name.includes('formatting')) {
				prevInListItem = true;
				break;
			}
		} while (cursor.parent());

		if (prevInListItem) {
			expandedFrom = prevNewline;
		}
	}

	return { from: expandedFrom, to: expandedTo };
}

// ═══════════════════════════════════════════════════════════════════════════
//  ViewPlugin — 光标修正
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 维护原子区间集、修正点击后光标位置的 ViewPlugin。
 */
const listEnhancerPlugin = ViewPlugin.fromClass(
	class {
		private atomicRanges: AtomicRange[] = [];

		constructor(view: EditorView) {
			this.atomicRanges = buildAtomicRanges(view);
			setCurrentAtomicRanges(this.atomicRanges);
		}

		update(update: ViewUpdate) {
			this.atomicRanges = buildAtomicRanges(update.view);
			setCurrentAtomicRanges(this.atomicRanges);
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
//  DOM 事件处理器 — Backspace / Delete
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
			const line = view.state.doc.lineAt(pos);
			const prefix = view.state.doc.sliceString(line.from, pos);
			if (/^[ \t]*$/.test(prefix)) {
				const ranges = getCurrentAtomicRanges();
				let foundRange = false;
				for (const r of ranges) {
					if (r.from >= line.from && r.to <= line.to) {
						delFrom = line.from;
						delTo = r.to;
						foundRange = true;
						break;
					}
				}

				// 本行无列表符，但光标处于列表项续行（软换行产物）内。
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
//  工厂函数
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 创建列一体化 CM6 扩展。
 *
 * 返回组合后的 ViewPlugin 和 DOM 事件处理器。
 */
export function createListIntegrationExtension() {
	return [listEnhancerPlugin, listDeleteHandler];
}
