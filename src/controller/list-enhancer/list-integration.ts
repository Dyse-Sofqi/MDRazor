/**
 * MDRazor — 列一体化模块（Controller）
 *
 * 将列表标记（如 `- `、`1. `、`* `）视为原子单元进行光标定位和删除，
 * 改善实时预览模式下列表编辑体验。「勾选框一体化」将任务项标记
 * `- [ ]`（含复选框）并入同一套原子单元处理，规则完全一致。
 *
 * 本模块处理：
 *   1. ViewPlugin — 从 Lezer 语法树构建原子区间集；点击或键盘移动后，
 *      将落入原子区间（含行首左端点）的光标推到右端点（标记之后），
 *      使光标永不驻留标记区。这同时避免了 Obsidian 的「光标感知装饰」
 *      被触发重建——否则光标一进入标记区，列表符号就会退化为原始 `- `。
 *   2. DOM 事件处理器 — 拦截 Backspace 和 Delete。如果被删除的字符
 *      与原子区间有交集，删除范围扩展为覆盖整个标记。如果该项后为空
 *      且上一行也有列表标记，则吞入前一个换行符使内容向上合并。
 *   3. 「退格提升层级」开关（默认开启，`backspacePromoteLevel`）—
 *      光标位于标记单元右边界（`- |` / `- [ ] |`，即列一体化把光标推到的
 *      内容起点）时，退格不再整体删除标记，改为渐进退链：任务项先剥离
 *      勾选框（`- [ ] |` → `- |`），再逐级提升（每按一次提升一级，整行
 *      缩进替换为父级缩进，内容与子树随行），无父级（视为一级）则直接
 *      删除列表格式。
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
	findParentListIndent,
} from '../../model/shared';

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
 * 维护原子区间集、修正点击或键盘移动后光标位置的 ViewPlugin。
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
			this.correctCursorPosition(update);
		}

		/**
		 * 光标修正：无论鼠标点击还是键盘移动（Home / ← 等），只要主光标
		 * 落入列表标记范围 [from, to)，一律推到 to（标记之后、内容之前）。
		 *
		 * 注意与 `nudgeOutOfAtomicRanges` 的差异：这里把左端点 from（行首）
		 * 也视为「区间内」——光标停在 from 上同样会让 Obsidian 的光标感知
		 * 装饰省去 `list-bullet` 标记，使列表符号退化为原始 `- `。推到 to
		 * 后光标永不驻留标记区，列表符号因此始终显示。
		 */
		private correctCursorPosition(update: ViewUpdate) {
			if (!listEnhancerConfig.listIntegration) return;

			for (const tr of update.transactions) {
				if (!tr.selection) continue; // 事务未改变光标

				const sel = tr.state.selection.main;
				if (sel.anchor !== sel.head) continue; // 只处理单光标（无选区）

				const pos = sel.head;
				const target = this.targetForAtomicRange(pos);
				if (target === null) continue;

				const view = update.view;
				queueMicrotask(() => {
					view.dispatch({
						selection: { anchor: target, head: target },
						scrollIntoView: false,
					});
				});
			}
		}

		/**
		 * 若 `pos` 落在某个原子区间 [from, to) 内（含左端点、不含右端点），
		 * 返回 to；否则返回 null。
		 */
		private targetForAtomicRange(pos: number): number | null {
			for (const r of this.atomicRanges) {
				if (pos >= r.from && pos < r.to) return r.to;
			}
			return null;
		}
	},
);

// ═══════════════════════════════════════════════════════════════════════════
//  退格提升层级 — 边界行为链
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 解析「退格提升层级」：光标位于该行标记单元右边界时，按链返回本次
 * 退格应执行的单步变更；未命中边界返回 null（交给原有整体删除逻辑）。
 *
 * 行为链（每按一次 Backspace 退一步）：
 *   1. 任务项（合并区间含勾选框，如 `- [ ] `）→ 剥离勾选框，变为普通
 *      列表项 `- `——层级、缩进、内容均不动；
 *   2. 普通列表项（任意层级、含内容的项同样适用）→ 提升一级：整行缩进
 *      替换为父级缩进，内容与子树随行（其后的原同级项会因缩进关系成为
 *      其子项，与 Obsidian 原生 Shift+Tab 的行级语义一致）；
 *   3. 无更浅缩进的父级列表行（视为一级）→ 直接删除列表格式：移除行首
 *      缩进与标记，内容保留。
 *
 * 触发条件：单光标恰好位于该行原子区间的右端点 `r.to === pos`（即
 * 列一体化把光标推到的内容起点）。有序任务项剥离勾选框后保留有序
 * 标记（`1. [ ] ` → `1. `）；「勾选框一体化」关闭时任务项无合并边界，
 * 链从 `- |` 位置才开始生效。
 *
 * @param view  当前的 EditorView
 * @param pos   光标位置
 * @returns 变更描述（from/to 区间、insert 插入文本、cursor 落点），未命中返回 null
 */
function resolveBoundaryAction(
	view: EditorView,
	pos: number,
): { from: number; to: number; insert: string; cursor: number } | null {
	const line = view.state.doc.lineAt(pos);
	const ranges = getCurrentAtomicRanges();

	let markerRange: AtomicRange | null = null;
	for (const r of ranges) {
		if (r.from >= line.from && r.to <= line.to && r.to === pos) {
			markerRange = r;
			break;
		}
	}
	if (!markerRange) return null;

	const rangeText = view.state.doc.sliceString(markerRange.from, markerRange.to);

	// ── 第 1 步：任务项 → 剥离勾选框（区间尾部的 `[ ]` 及其后吞入的空格）──
	const checkboxMatch = /\[.\]\s?$/.exec(rangeText);
	if (checkboxMatch) {
		const from = markerRange.to - checkboxMatch[0].length;
		return { from, to: markerRange.to, insert: '', cursor: from };
	}

	// ── 第 3 步判定：无父级列表行 → 视为一级，删除列表格式 ──
	// 注意：原子区间文本不含行首缩进（formatting-list 节点从标记字符起，
	// 缩进是节点之前的部分），层级比较必须用行首缩进而非区间文本。
	const lineIndentMatch = /^[ \t]*/.exec(line.text);
	const lineIndent = lineIndentMatch ? lineIndentMatch[0] : '';
	const parentIndent = findParentListIndent(view, line.number, lineIndent);
	if (parentIndent === null) {
		return { from: line.from, to: markerRange.to, insert: '', cursor: line.from };
	}

	// ── 第 2 步：提升一级（整行缩进替换为父级缩进，内容不动）──
	// rangeText 即标记文本（无缩进），[line.from, r.to] 覆盖「行首缩进 + 标记」，
	// 以 parentIndent + 标记替换即完成缩进降级。
	const prefix = parentIndent + rangeText;
	return {
		from: line.from,
		to: markerRange.to,
		insert: prefix,
		cursor: line.from + prefix.length,
	};
}

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

			// ── 边界提升链：「退格提升层级」开启时，右边界退格优先走
			// 剥勾选框 → 提升一级 → 删格式；未命中边界落入整体删除 ──
			if (listEnhancerConfig.backspacePromoteLevel) {
				const action = resolveBoundaryAction(view, pos);
				if (action) {
					event.preventDefault();
					view.dispatch({
						changes: { from: action.from, to: action.to, insert: action.insert },
						selection: { anchor: action.cursor },
						userEvent: 'deleteContentBackward',
					});
					return true;
				}
			}

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
