/**
 * MDRazor — 隐藏标记的「光标可见性」保护规则（纯函数层）
 *
 * 供 format-hider 在构建装饰前调用：保证**折叠光标处始终有可见文本**
 * （真实文本节点），否则放开把光标盖住 / 夹住的隐藏区间。
 *
 * ── 为什么必须保证 ──
 *
 * replace 隐藏把标记从 DOM 里抹掉（只剩占位元素）后，光标落在下面两种
 * 位置时，DOM 里没有任何文本可承载光标：
 *
 *   1. **光标在一条隐藏区间内部**（`from < 光标 < to`）——典型来源：行首
 *      键入 `` ` `` 时 Obsidian 的自动配对（autoPairMarkdown）插入 `` `` ``
 *      并把光标放在两个反引号**中间**，而解析器把整个反引号段建成**一条**
 *      节点（`/^`+/`，可变长度），插件随即把 [0,2) 整段隐藏。
 *   2. **光标夹在两条相邻隐藏区间之间**（`A.to === 光标 === B.from`）——
 *      空格式单元被拆成两条节点时（如 `` 的两条单字符标记、`****` 的两条
 *      加粗标记）。
 *
 * 两种情况下 CM6 都画不出 DOM 光标：`inlineDOMAtPos` 只能落在零宽
 * widget buffer（`.cm-widgetBuffer`，专为浏览器「光标紧贴不可编辑内联
 * 内容」的兼容问题而设）之处，Chromium 会把 DOM 光标规范化到占位元素
 * 之后，而 CM6 状态里的光标停在原位不动 —— 两者分叉后，每个键入字符都
 * 由浏览器插到同一个 DOM 位置（占位元素之后）→ 文档位置固定、逐键形成
 * **倒序**，且字符落在标记之外；符号边界提示读的是状态光标，于是持续显示
 * `` `|` ``（实测：`doc="``" pos=1` 键入 123 得到 `"``321"`、光标停在 1）。
 *
 * Obsidian 原生的实时预览从不产生这两种状态：asar 实证其装饰构建器在
 * 光标与标记区间相交时走 reveal 分支（不生成隐藏装饰），另有专门的插件
 * 在光标落入隐藏区间时把光标吸附出区间（`Math.min(rangeFrom, pos)`）——
 * 原生机制默认「光标所在处不存在隐藏区间」。本插件的「始终隐藏」打破了
 * 这一不变量，故在光标被遮盖时自行恢复：仅放开盖住 / 夹住光标的那几条
 * 装饰，光标随即落回真实文本。
 *
 * 放开是收口的最小动作：首个字符插入后标记区间与光标不再重叠，隐藏行为
 * 立即照旧（实测插入后标记重新隐藏、后续输入各位置均正确）；光标移开
 * （点击 / 方向键）后装饰于下一帧恢复。提示弹框（symbolBoundaryHint）
 * 读到的是同一份放开后的装饰集，光标处无隐藏标记、自然不弹框。
 */

/** 文档中的一段连续区间（与 format-hider 的 DocRange 同构） */
export interface CaretRange {
	from: number;
	to: number;
	spec?: {
		hideAsMark?: boolean;
		[key: string]: unknown;
	};
}

/**
 * 光标是否被隐藏区间遮盖：位于某条区间内部（`from < 光标 < to`），或
 * 恰好夹在两条相邻区间之间（存在区间结束于光标、且存在区间起始于光标）。
 *
 * @param ranges 待隐藏的区间
 * @param caret  折叠光标位置（`null` 表示非折叠选区，一律不遮盖）
 */
export function isCaretObscured(ranges: readonly CaretRange[], caret: number | null): boolean {
	if (caret === null) return false;
	let endsAt = false;
	let startsAt = false;
	let endsAtMark = false;
	let startsAtMark = false;
	for (const r of ranges) {
		if (r.from < caret && caret < r.to) return true; // 区间内部
		if (r.to === caret) {
			endsAt = true;
			if (r.spec?.hideAsMark) endsAtMark = true;
		}
		if (r.from === caret) {
			startsAt = true;
			if (r.spec?.hideAsMark) startsAtMark = true;
		}
	}
	// 若两端恰好都是 HTML mark 隐藏标签（如 </xxx><xxx>），
	// 它们是两个独立富文本块之间的合法边界，中间通过提示气泡展示，
	// 不属于空 Markdown 格式单元的夹缝，不应错误展开裸标签。
	if (endsAtMark && startsAtMark) {
		return false;
	}
	return endsAt && startsAt; // 两条区间之间的夹缝
}

/**
 * 光标被遮盖时，返回去掉全部「盖住 / 夹住光标」区间（`from <= 光标 <= to`）
 * 的副本；否则原样返回入参（无遮盖时不产生分配）。
 *
 * 泛型保留条目自带的其余字段（如 format-hider 的 `spec`）。
 */
export function revealCaretRanges<T extends CaretRange>(ranges: T[], caret: number | null): T[] {
	if (caret === null || !isCaretObscured(ranges, caret)) return ranges;
	return ranges.filter((r) => !(r.from <= caret && caret <= r.to));
}
