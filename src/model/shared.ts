/**
 * MDRazor — 列表增强共享模型
 *
 * 提供各列表增强子模块共享的类型、配置和工具函数。
 */

import { EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { MDRazorSettings, DEFAULT_SETTINGS } from './settings';

/**
 * 原子区间 —— 光标永不置于内部，删除操作扩展覆盖整个区间。
 */
export interface AtomicRange {
	from: number;
	to: number; // 结束位置（不含）
}

/**
 * 模块级可变配置对象。
 * 由 main.ts 在每次 saveSettings() 时写入，各子模块均读取此对象。
 */
export const listEnhancerConfig: MDRazorSettings = { ...DEFAULT_SETTINGS };

/**
 * 最新原子区间集，ViewPlugin（更新者）与删除处理器（读取者）之间共享。
 *
 * 这种做法的安全性是有保障的，因为两者在同一事件循环轮次运行 ——
 * 处理器总是读取 ViewPlugin 上一次 update() 产生的版本。
 */
let currentAtomicRanges: AtomicRange[] = [];

/**
 * 更新共享的原子区间集。
 * 由 list-integration 的 ViewPlugin 在每次 update() 时调用。
 */
export function setCurrentAtomicRanges(ranges: AtomicRange[]): void {
	currentAtomicRanges = ranges;
}

/**
 * 返回共享的原子区间集（唯讀）。
 */
export function getCurrentAtomicRanges(): readonly AtomicRange[] {
	return currentAtomicRanges;
}

/**
 * 从当前语法树构建原子区间集。
 *
 * HyperMD 的 `formatting-list` 节点已包含尾随空格，
 * 因此 `node.from` → `node.to` 正是我们要保护的范围。
 *
 * @param view  当前的 EditorView
 * @returns     原子区间数组（功能关闭时返回空数组）
 */
export function buildAtomicRanges(view: EditorView): AtomicRange[] {
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
export function nudgeOutOfAtomicRanges(pos: number, ranges: readonly AtomicRange[]): number {
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
 * 检测给定位置是否位于结构性的列表节点（ListItem / BulletList / OrderedList）
 * 内。续行（软换行产物）虽不含 `formatting-list` 叶节点，但其位置仍位于
 * 列表结构性节点内，因此同样返回 true。
 */
export function isInListItem(view: EditorView, pos: number): boolean {
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