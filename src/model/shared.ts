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
 * 两种原子单元：
 *   1. 列表标记（`formatting-list` 节点，如 `- `、`1. `）—— 由「列一体化」
 *      控制；HyperMD 的该节点已包含尾随空格，`node.from` → `node.to` 正是
 *      要保护的范围。
 *   2. 任务勾选框标记（`formatting-task` 节点，如 `[ ]`、`[x]`）—— 由
 *      「勾选框一体化」控制。若其同行紧邻列表标记，则两个节点合并为
 *      一个整体区间（`- [ ]` 视为一个整体），并吞入紧随其后的一个空格
 *      （与列表标记节点含尾随空格的语义一致，保证内容起点 Backspace
 *      一次即可整体删除）。
 *
 * @param view  当前的 EditorView
 * @returns     原子区间数组（两个开关均关闭时返回空数组）
 */
export function buildAtomicRanges(view: EditorView): AtomicRange[] {
	if (!listEnhancerConfig.listIntegration && !listEnhancerConfig.checkboxIntegration) return [];

	const ranges: AtomicRange[] = [];
	const tree = syntaxTree(view.state);
	// 列表标记专用暂存：仅用于勾选框合并查找，最终输出见下方合并步骤。
	const listRanges: AtomicRange[] = [];

	tree.iterate({
		enter(node) {
			const typeName = node.type.name;

			// ── 列表标记（- / 1. 等）──
			if (listEnhancerConfig.listIntegration && typeName.includes('formatting-list')) {
				listRanges.push({ from: node.from, to: node.to });
				return undefined;
			}

			// ── 任务勾选框标记（[ ] / [x]）──
			// Obsidian 树节点名由 Mp 记号以下划线连接（如
			// formatting-link_formatting-link-start），故用 includes 匹配。
			if (listEnhancerConfig.checkboxIntegration && typeName.includes('formatting-task')) {
				// 防御：校验切片确实是复选框标记（`[` + 单字符状态 + `]`），
				// 解析器异常时宁可放弃也不保护错误范围。
				const text = view.state.doc.sliceString(node.from, node.to);
				if (
					text.length !== 3 ||
					text[0] !== '[' ||
					text[2] !== ']' ||
					text[1] === '[' ||
					text[1] === ']'
				) {
					return undefined;
				}

				const line = view.state.doc.lineAt(node.from);
				let from = node.from;
				let to = node.to;

				// 与同行、紧邻其前的列表标记合并为一个整体（- [ ]）。
				// iterate 按文档序访问，formatting-list 节点先于
				// formatting-task 进入，listRanges 此时已收集完毕。
				if (listEnhancerConfig.listIntegration) {
					for (const r of listRanges) {
						if (
							r.to <= node.from &&
							view.state.doc.lineAt(r.from).number === line.number &&
							/^[ \t]*$/.test(view.state.doc.sliceString(r.to, node.from))
						) {
							from = r.from;
							break;
						}
					}
				}

				// 吞入紧随其后、与内容之间的一个空格（若存在）。
				if (to + 1 <= line.to && view.state.doc.sliceString(to, to + 1) === ' ') {
					to += 1;
				}

				ranges.push({ from, to });
				return undefined;
			}

			return undefined;
		},
	});

	// ── 合并输出：列表标记 + 勾选框区间 ──
	// 被勾选框区间吸收（from 相同）的列表标记不重复输出，避免重叠区间；
	// 其余列表标记与独立的勾选框区间按文档序输出。
	for (const r of listRanges) {
		const absorbed = ranges.some((c) => c.from === r.from && c.to > r.to);
		if (!absorbed) ranges.push(r);
	}
	ranges.sort((a, b) => a.from - b.from || a.to - b.to);

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

/**
 * 向上扫描寻找父级列表缩进。
 *
 * 从 `fromLine - 1` 行向上逐行查找第一个「缩进严格小于 `currIndent` 且以
 * 列表标记（`-`/`*`/`+` 或 `数字.`/`数字)`）开头」的行，返回其缩进字符串
 * （可能为空串，表示父级位于行首）；找不到返回 null。
 *
 * 由回车软换行（Feature 3 提升）与列一体化退格提升链共用。两者对 null
 * 的解释不同：Feature 3 提升到列 0（保持既有行为），退格链将 null 视为
 * 一级、直接删除列表格式。
 *
 * @param view       当前的 EditorView
 * @param fromLine   起始行号（从其上一行开始向上扫描）
 * @param currIndent 当前行缩进（用于长度比较）
 * @returns 父级缩进字符串；未找到父级时返回 null
 */
export function findParentListIndent(
	view: EditorView,
	fromLine: number,
	currIndent: string,
): string | null {
	for (let j = fromLine - 1; j >= 1; j--) {
		const cl = view.state.doc.line(j);
		const clMatch = /^[ \t]*/.exec(cl.text);
		if (!clMatch) continue;
		if (clMatch[0].length < currIndent.length
			&& (/^[ \t]*[-*+]/.test(cl.text) || /^[ \t]*\d+[.)]/.test(cl.text))) {
			return clMatch[0];
		}
	}
	return null;
}