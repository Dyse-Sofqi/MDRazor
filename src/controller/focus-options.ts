/**
 * MDRazor - 聚焦模式模块（Controller）
 *
 * 光标进入列表项时，展开其自身、祖先和后代列表项，折叠其余有子项的列表项。
 *
 * 深度检测使用缩进宽度（而非语法树层级），
 * 因为 HyperMD 将所有 formatting-list 节点扁平化在 Document 下。
 *
 * 折叠使用 CM6 的 foldEffect/unfoldEffect（不移动光标）。
 * foldService 注册可折叠范围以供 gutter 交互。
 *
 * 关键：切勿在 update() 内调用 view.dispatch() — CM6 会抛出
 * "Calls to EditorView.update are not allowed while an update is in progress"。
 * 所有 dispatch 通过 queueMicrotask 执行。
 */

import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { EditorState, Prec } from '@codemirror/state';
import { syntaxTree, foldEffect, unfoldEffect, foldService } from '@codemirror/language';
import { listEnhancerConfig } from '../model/shared';

// ═══════════════════════════════════════════════════════════════════════════
// 数据结构
// ═══════════════════════════════════════════════════════════════════════════

interface ListItemInfo {
	markerFrom: number;
	markerTo: number;
	depth: number;
	lineNumber: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// 基于缩进的树分析
// ═══════════════════════════════════════════════════════════════════════════

function getIndentWidth(text: string, tabSize: number): number {
	let width = 0;
	for (const char of text) {
		if (char === '\t') width += tabSize - (width % tabSize);
		else if (char === ' ') width += 1;
		else break;
	}
	return width;
}

function buildListItems(state: EditorState): ListItemInfo[] {
	if (!listEnhancerConfig.listFocusOption) return [];

	const doc = state.doc;
	const tabSize = 4;
	const docLen = doc.length;

	// 第一阶段：收集原始项及其绝对缩进
	const rawItems: Array<{
		markerFrom: number;
		markerTo: number;
		indent: number;
		lineNumber: number;
	}> = [];

	syntaxTree(state).iterate({
		enter(node) {
			if (!node.type.name.includes('formatting-list')) return;
			// 防御：语法树节点位置可能超出文档范围（增量解析边界情况）
			if (node.from < 0 || node.from > docLen) return;

			const line = doc.lineAt(node.from);
			const indent = getIndentWidth(line.text, tabSize);

			rawItems.push({
				markerFrom: node.from,
				markerTo: node.to,
				indent,
				lineNumber: line.number,
			});
		},
	});

	// 第二阶段：用缩进栈确定真实深度。
	// 栈维护当前祖先链的缩进值，栈大小 = 当前项的深度。
	// 遍历时弹出所有缩进 >= 当前项的项（同层/更深层兄弟），
	// 剩余的栈顶就是父级缩进，剩下的栈长就是深度。
	const items: ListItemInfo[] = [];
	const stack: number[] = [];

	for (const raw of rawItems) {
		while (stack.length > 0 && stack[stack.length - 1]! >= raw.indent) {
			stack.pop();
		}
		const depth = stack.length;
		stack.push(raw.indent);

		items.push({
			markerFrom: raw.markerFrom,
			markerTo: raw.markerTo,
			depth,
			lineNumber: raw.lineNumber,
		});
	}

	return items;
}

function subtreeEndIndex(items: ListItemInfo[], i: number): number {
	const self = items[i];
	if (!self) return items.length;
	const depth = self.depth;
	for (let j = i + 1; j < items.length; j++) {
		const sibling = items[j];
		if (sibling && sibling.depth <= depth) return j;
	}
	return items.length;
}

function hasDescendants(items: ListItemInfo[], i: number): boolean {
	const self = items[i];
	if (!self) return false;
	const end = subtreeEndIndex(items, i);
	for (let j = i + 1; j < end && j < items.length; j++) {
		const sibling = items[j];
		if (sibling && sibling.depth > self.depth) return true;
	}
	return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// 聚焦计算
// ═══════════════════════════════════════════════════════════════════════════

function computeFoldIndices(
	items: ListItemInfo[],
	cursorPos: number,
): Set<number> {
	if (items.length === 0) return new Set();

	let focusedIdx = -1;
	let bestDepth = -1;
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		if (!item) continue;
		const end = subtreeEndIndex(items, i);
		const endPos = end < items.length
			? items[end]?.markerFrom ?? Number.MAX_SAFE_INTEGER
			: Number.MAX_SAFE_INTEGER;
		if (cursorPos >= item.markerFrom && cursorPos < endPos) {
			if (item.depth > bestDepth) {
				bestDepth = item.depth;
				focusedIdx = i;
			}
		}
	}

	if (focusedIdx === -1) return new Set();

	const unfoldSet = new Set<number>();
	unfoldSet.add(focusedIdx);

	const focusedItem = items[focusedIdx];
	if (!focusedItem) return new Set();
	let currentDepth = focusedItem.depth;
	for (let i = focusedIdx - 1; i >= 0; i--) {
		const ancestor = items[i];
		if (!ancestor) continue;
		if (ancestor.depth < currentDepth
			&& subtreeEndIndex(items, i) > focusedIdx) {
			unfoldSet.add(i);
			currentDepth = ancestor.depth;
		}
	}

	const focusedEnd = subtreeEndIndex(items, focusedIdx);
	for (let j = focusedIdx + 1; j < focusedEnd; j++) {
		const descendant = items[j];
		if (descendant && descendant.depth > focusedItem.depth) {
			unfoldSet.add(j);
		}
	}

	const foldSet = new Set<number>();
	for (let i = 0; i < items.length; i++) {
		if (!unfoldSet.has(i)) foldSet.add(i);
	}

	return foldSet;
}

// ═══════════════════════════════════════════════════════════════════════════
// CM6 折叠范围计算
// ═══════════════════════════════════════════════════════════════════════════

function computeFoldRanges(
	items: ListItemInfo[],
	foldSet: Set<number>,
	doc: EditorState['doc'],
): Array<{ from: number; to: number }> {
	const ranges: Array<{ from: number; to: number }> = [];
	const sorted = [...foldSet].sort((a, b) => a - b);
	let lastFoldTo = -1;

	for (const idx of sorted) {
		if (idx < 0 || idx >= items.length) continue;
		if (!hasDescendants(items, idx)) continue;

		const item = items[idx];
		if (!item) continue;
		const line = doc.lineAt(item.markerFrom);
		if (line.to <= lastFoldTo) continue;

		const subtreeEnd = subtreeEndIndex(items, idx);
		// Fold from parent line end to last child line end,
		// not beyond the subtree — don't fold content/paragraphs
		// between the subtree and the next item.
		const lastChildIdx = subtreeEnd - 1;
		if (lastChildIdx < 0 || lastChildIdx >= items.length) continue;
		const lastChild = items[lastChildIdx];
		if (!lastChild) continue;
		const lastChildLine = doc.lineAt(lastChild.markerFrom);
		const foldTo = lastChildLine.to;

		if (foldTo <= lastFoldTo) continue;

		ranges.push({ from: line.to, to: foldTo });
		lastFoldTo = foldTo;
	}

	return ranges;
}

// ═══════════════════════════════════════════════════════════════════════════
// foldService — 注册可折叠范围供 gutter/收缩使用
//
// CM6 按行调用 foldService, pos = 行首。对每一行，查找该行上的列表项：
//   - 有子孙 → 返回折叠范围（用户可点击折叠/展开）
//   - 无子孙 → 返回 null，由默认缩进服务处理
//   - 非列表行 → 返回 null，默认服务处理
//
// Prec.high 确保优先于 Obsidian 默认缩进 fold service 被查询。
// 用行号映射直接定位项，避免 markerFrom 偏移不匹配（缩进空格）导致
// 误识别为上级项 → 折叠箭头错误显示在子级行上。
// ═══════════════════════════════════════════════════════════════════════════

const focusFoldService = Prec.high(foldService.of((state, pos) => {
	if (!listEnhancerConfig.listFocusOption) return null;

	const items = buildListItems(state);
	if (items.length === 0) return null;

	// 行号 → items 索引映射
	const lineMap = new Map<number, number>();
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		if (!item) continue;
		lineMap.set(item.lineNumber, i);
	}

	const line = state.doc.lineAt(pos);
	const itemIdx = lineMap.get(line.number);
	if (itemIdx === undefined) return null;

	if (!hasDescendants(items, itemIdx)) {
		// 无后代列表项：返回 null。默认缩进服务不会对其提供折叠范围
		// （无更深缩进的行跟在后面 → indentRangeFinder 返回 null），
		// 箭头自然不出现。
		return null;
	}

	const end = subtreeEndIndex(items, itemIdx);
	const lastChildIdx = end - 1;
	if (lastChildIdx < 0 || lastChildIdx >= items.length) return null;
	const lastChild = items[lastChildIdx];
	if (!lastChild) return null;
	const lastChildLine = state.doc.lineAt(lastChild.markerFrom);
	return { from: line.to, to: lastChildLine.to };
}));

// ═══════════════════════════════════════════════════════════════════════════
// ViewPlugin — 光标追踪，通过 foldEffect 折叠/展开
//
// 绝不在 update() 内调用 view.dispatch() — 所有 dispatch 通过
// queueMicrotask 延迟执行，避免 CM6 "update in progress" 错误。
// ═══════════════════════════════════════════════════════════════════════════

const focusViewPlugin = ViewPlugin.fromClass(
	class {
		private lastPos: number = -1;
		private currentRanges: Array<{ from: number; to: number }> = [];

		constructor(view: EditorView) {
			if (listEnhancerConfig.listFocusOption) {
				requestAnimationFrame(() => {
					this.recomputeFolds(view);
				});
			}
		}

		update(update: ViewUpdate) {
			if (update.docChanged) {
				const oldRanges = this.currentRanges;
				this.currentRanges = [];
				this.lastPos = -1;
				if (oldRanges.length > 0) {
					queueMicrotask(() =>
						this.applyFolds(update.view, []));
				}
				return;
			}

			const enabled = listEnhancerConfig.listFocusOption;

			if (!enabled) {
				const oldRanges = this.currentRanges;
				this.currentRanges = [];
				this.lastPos = -1;
				if (oldRanges.length > 0) {
					queueMicrotask(() =>
						this.applyFolds(update.view, []));
				}
				return;
			}

			if (!update.selectionSet) return;

			const sel = update.state.selection.main;
			const pos = sel.head;
			if (pos === this.lastPos) return;
			this.lastPos = pos;

			queueMicrotask(() => {
				this.recomputeFolds(update.view);
			});
		}

		destroy() {
			this.currentRanges = [];
		}

		private recomputeFolds(cmView: EditorView) {
			if (!listEnhancerConfig.listFocusOption) return;

			const items = buildListItems(cmView.state);
			if (items.length === 0) {
				this.applyFolds(cmView, []);
				this.currentRanges = [];
				return;
			}

			const foldSet = computeFoldIndices(items, cmView.state.selection.main.head);
			const newRanges = computeFoldRanges(items, foldSet, cmView.state.doc);

			this.applyFolds(cmView, newRanges);
			this.currentRanges = newRanges;
		}

		/**
		 * 对比 currentRanges 与 targetRanges，派发 foldEffect/unfoldEffect。
		 * 单次同步 dispatch — 不移动光标，不重入。
		 *
		 * 重要：仅能从 queueMicrotask/RAF 上下文调用，
		 * 绝不在 update() 内调用。
		 */
		private applyFolds(
			view: EditorView,
			targetRanges: Array<{ from: number; to: number }>,
		): void {
			const effects: Array<ReturnType<typeof foldEffect.of>> = [];

			for (const r of this.currentRanges) {
				if (!targetRanges.some(t => t.from === r.from && t.to === r.to)) {
					effects.push(unfoldEffect.of(r));
				}
			}

			for (const r of targetRanges) {
				if (!this.currentRanges.some(c => c.from === r.from && c.to === r.to)) {
					effects.push(foldEffect.of(r));
				}
			}

			if (effects.length > 0) {
				view.dispatch({ effects });
			}
		}
	},
);

// ═══════════════════════════════════════════════════════════════════════════
// 工厂函数
// ═══════════════════════════════════════════════════════════════════════════

export function createFocusOptionsExtension() {
	return [focusFoldService, focusViewPlugin];
}
