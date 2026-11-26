/**
 * MDRazor — HTML 标签扫描（纯函数层）
 *
 * 供 format-hider 在构建装饰时收集「HTML 标签类」隐藏区间：
 *   - `collectFenceRanges`     围栏代码块区间（`<span>` 在代码块内是字面文本）
 *   - `collectSpanExclusions`  围栏 + 行内代码 + 数学的排除区段
 *   - `collectPairedHtmlTags`  按出现顺序配对开/闭标签（正则扫描全文）
 *
 * ── 为什么单独成模块 ──
 *
 * 这三个函数只依赖 `@codemirror/state` 的 `Text` 与 `@lezer/common` 的 `Tree`
 * 两个纯数据接口，不碰 DOM、不碰 EditorView，因此可以被 `scripts/` 下的
 * 离线回归直接驱动（`npm run verify:format-hider-scan`），用**差分测试**
 * 对照旧实现断言「输出逐条相同」。format-hider 本体依赖 `@codemirror/view`
 * 的运行时（`ViewPlugin`/`Decoration`），在 Node 里无法加载，故把可测部分
 * 抽到这一层。
 *
 * ── 复杂度约定（性能关键）──
 *
 * `collectPairedHtmlTags` 的排除判定**必须**是 O(匹配数 + 排除数) 的均摊扫描，
 * 不能写成对每条匹配遍历整个 exclusions 数组。后者是 O(匹配数 × 排除数)：
 * 实测（8 万字、1056 个 `<span>`、4526 条排除区间）单次调用 24.9ms，而线性
 * 实现 0.6ms —— 差 40 倍，且随「行内代码数 × HTML 标签数」平方增长，正是
 * 「文档不大但卡得很严重」的成因（详见 DEBUGLOG）。故此处：
 *   - `exclusions` 先按 `from` 升序规范化（已有序时仅做一次 O(n) 检查）；
 *   - 匹配按正则顺序天然升序，用单游标推进，只回看「起点落在本条匹配之前」
 *     的那几条排除区间。
 */

import type { Text } from '@codemirror/state';
import type { Tree } from '@lezer/common';

/** 文档中的一段连续区间 */
export interface DocRange {
	from: number;
	to: number;
}

/** 单条 HTML 标签匹配（区间 + 是否为闭标签） */
export interface HtmlTagMatch extends DocRange {
	isClose: boolean;
}

/** 围栏代码块起始行（``` / ~~~，允许行首空白） */
const FENCE_RE = /^\s*(?:```+|~~~+)/;

/**
 * 围栏代码块区间：行扫描 ``` / ~~~，成对给出 [起始行首, 结束行尾]；
 * 未闭合的围栏延伸到文档末尾。
 *
 * 用 `doc.iterLines()` 顺序取行文本（内部按 rope 游标推进），避免
 * `doc.line(i)` 的逐行二分查找 —— CM6 的 `Text` 没有行缓存，`line(i)`
 * 每次都从根重新下降。
 *
 * @param doc 当前文档
 * @returns   围栏区间（升序）
 */
export function collectFenceRanges(doc: Text): DocRange[] {
	const ranges: DocRange[] = [];
	let inFence = false;
	let fenceFrom = 0;
	let lastLineEnd = 0;
	let offset = 0;
	for (const text of doc.iterLines()) {
		if (FENCE_RE.test(text)) {
			if (!inFence) {
				inFence = true;
				fenceFrom = offset;
			} else {
				ranges.push({ from: fenceFrom, to: offset + text.length });
				inFence = false;
			}
		}
		lastLineEnd = offset + text.length;
		offset = lastLineEnd + 1; // 跳过换行符
	}
	// 未闭合的围栏 —— 延伸到文档末尾
	if (inFence) {
		ranges.push({ from: fenceFrom, to: lastLineEnd });
	}
	return ranges;
}

/**
 * 收集 `<span>` 标签隐藏的排除区段：围栏代码块、行内代码、数学公式。
 *
 * 在这些区域内 `<span>` 是字面文本（如代码示例），不是真实 HTML 标签，
 * 隐藏它们会错误地删除可见内容。任何误判都只会让标签保持可见，不会崩溃
 * （正确性优先）。
 *
 * 策略（多重保险，不依赖任何单一具体节点名）：
 *   1. 围栏代码块 —— 行扫描 ``` / ~~~（确定性）
 *   2. 行内代码 / 数学 —— 语法树中匹配对应元素节点，覆盖整段范围
 *   3. 行内代码标记 —— `formatting-code`+`inline-code` 标记按行配对，
 *      兜底覆盖元素节点命名差异（标记必然存在，见 format-hider 中
 *      对行内代码的处理逻辑）
 *
 * @param doc  当前文档
 * @param tree 当前语法树
 * @returns    排除区间（**已按 from 升序**，collectPairedHtmlTags 依赖此序）
 */
export function collectSpanExclusions(doc: Text, tree: Tree): DocRange[] {
	const ranges: DocRange[] = collectFenceRanges(doc);

	// ── 2 + 3. 语法树：元素节点 + 行内代码标记 ──
	const inlineMarkers: DocRange[] = [];
	tree.iterate({
		enter(node) {
			const typeName = node.type.name;

			// 行内代码标记（单个 ` 等）：先收集，随后配对为完整元素范围
			if (typeName.includes('formatting-code') && typeName.includes('inline-code')) {
				inlineMarkers.push({ from: node.from, to: node.to });
				return undefined;
			}

			// 代码块 / 行内代码元素 / 数学元素 —— 覆盖整段范围
			if (
				typeName.includes('inline-code') ||
				typeName.includes('codeblock') ||
				typeName.includes('FencedCode') ||
				typeName.includes('CodeText') ||
				typeName.includes('hmd-code') ||
				typeName.includes('math')
			) {
				ranges.push({ from: node.from, to: node.to });
				return false; // 不再深入子节点，避免重复收集
			}
			return undefined;
		},
	});

	// 行内代码标记按位置配对，得出完整元素范围（open ` 到 close `）
	inlineMarkers.sort((a, b) => a.from - b.from);
	for (let i = 0; i + 1 < inlineMarkers.length; i += 2) {
		const open = inlineMarkers[i]!;
		const close = inlineMarkers[i + 1]!;
		if (open.to <= close.from) {
			ranges.push({ from: open.from, to: close.to });
		}
	}

	ranges.sort((a, b) => a.from - b.from);
	return ranges;
}

/**
 * 配对 HTML 标签对：仅返回能配成对的标签区间，不成对的单边标签不返回。
 *
 * 配对规则（**栈式，LIFO**）：开标签入栈；闭标签与栈顶（同名前一个尚未
 * 配对的开标签）配对；栈空时遇到的闭标签是**孤立闭标签**，保持可见；
 * 扫描结束后栈里剩余的开标签没有闭标签，同样保持可见。
 *
 * 为什么不用「opens[i] ↔ closes[i]」按序配对：那种配法会把**文档前部的
 * 孤立闭标签**（还没写开标签就先出现 `</span>`）与后面的开标签配成一
 * 对，令真正的那一对反而配不上；嵌套场景还会把外层开标签与内层闭标签
 * 错配。实测案例：`</span>文字<span>甲</span>` 旧逻辑隐藏了 `</span>`@0
 * 与 `<span>`@9，行尾真正的 `</span>` 反而露着。
 *
 * 自闭合写法（`<span ... />`、`<br />` 等）没有闭标签，直接跳过、不占用
 * 配对名额：否则它会排在同名开标签之前，把后面真正的闭标签配走，令真正的
 * 开标签配不上对而保持可见 —— 表现为「文档里别的处有个自闭合标签，这边
 * 的标签隐藏就失败了」。
 *
 * @param docStr      全文
 * @param tagPattern  匹配开/闭标签的正则（须含 g 标志）
 * @param exclusions  需跳过的区段（如代码区内的字面标签）；默认不跳过
 * @returns           应隐藏的标签区间列表（按 from 升序，仅成对部分）
 */
export function collectPairedHtmlTags(
	docStr: string,
	tagPattern: RegExp,
	exclusions: readonly DocRange[] = [],
): HtmlTagMatch[] {
	const paired: HtmlTagMatch[] = [];
	/** 尚未配对的开标签栈（LIFO：闭标签配最近的那个） */
	const openStack: HtmlTagMatch[] = [];

	// 排除区间必须按 from 升序才能用单游标推进（collectSpanExclusions 已保证）；
	// 传入未排序数组时（外部误用）先规范化，代价 O(n)，远小于 O(匹配数 × n)
	if (exclusions.length > 1 && !isSortedByFrom(exclusions)) {
		exclusions = [...exclusions].sort((a, b) => a.from - b.from);
	}

	tagPattern.lastIndex = 0;
	let m: RegExpExecArray | null;
	// 单游标：指向「第一条可能与本条匹配相交」的排除区间。匹配按正则顺序
	// 天然升序，故游标只前进不回退 —— 整体 O(匹配数 + 排除数)。
	let cursor = 0;
	while ((m = tagPattern.exec(docStr)) !== null) {
		// 自闭合写法无闭标签，跳过（不占用配对名额）
		if (/\/\s*>$/.test(m[0])) continue;
		const from = m.index;
		const to = from + m[0].length;
		// 已整体结束于本条匹配之前的区间（to <= from）不可能再相交
		while (cursor < exclusions.length && exclusions[cursor]!.to <= from) cursor++;
		if (overlapsFrom(exclusions, cursor, from, to)) continue;
		if (m[0].charAt(1) === '/') {
			// 闭标签：与栈顶配对；栈空 = 孤立闭标签，保持可见
			const open = openStack.pop();
			if (open) paired.push(open, { from, to, isClose: true });
		} else {
			openStack.push({ from, to, isClose: false });
		}
	}
	// 栈里剩余的开标签没有闭标签可配，保持可见（不进入 paired）

	paired.sort((a, b) => a.from - b.from);
	return paired;
}

/** 区间数组是否已按 from 升序（O(n) 单遍检查） */
function isSortedByFrom(ranges: readonly DocRange[]): boolean {
	for (let i = 1; i < ranges.length; i++) {
		if (ranges[i]!.from < ranges[i - 1]!.from) return false;
	}
	return true;
}

/**
 * 从 `cursor` 起，是否存在与 [from, to) 相交的排除区间。
 *
 * 区间按 from 升序且 cursor 之前的区间都满足 `to <= from`，故只需向后
 * 扫描到第一条 `from >= to` 为止；正常文档下命中的区间至多一两条，
 * 均摊接近 O(1)。
 */
function overlapsFrom(
	exclusions: readonly DocRange[],
	cursor: number,
	from: number,
	to: number,
): boolean {
	for (let i = cursor; i < exclusions.length; i++) {
		const r = exclusions[i]!;
		if (r.from >= to) return false; // 起点已越过本条匹配，后面更不可能相交
		if (r.to > from) return true;
	}
	return false;
}
