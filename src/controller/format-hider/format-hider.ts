/**
 * MDRazor — 隐藏样式模块（Controller）
 *
 * 在 Obsidian 实时预览模式下，通过 CodeMirror 6 装饰隐藏 Markdown
 * 格式化标记符号（**、*、==、~~、`）、转义符号（\）、以及双链格式（[[、]]）。
 *
 * ── 架构 ──
 *
 * 本模块导出：
 *   - `formattingConfig` — 模块级可变配置，由 controller/main.ts 在设置变更时写入，
 *     ViewPlugin 在每一帧更新时读取。
 *   - `buildDecorations(view)` — 收集 + 写入装饰集；被本模块的 ViewPlugin 与
 *     cursor-boundary-hint 的 ViewPlugin **共用**。
 *   - `createFormatHiderExtension()` — 工厂函数，返回一个 `Prec.high`
 *     CM6 扩展，为格式化标记提供 replace 装饰。
 *
 * ── 性能（改动前的主要瓶颈）──
 *
 * 「收集」是整篇工作（一次全树遍历 + 一次排除区段扫描 + 最多三次全文
 * 正则配对），而 `buildDecorations` 在**每一次 ViewUpdate** 都会被调用 ——
 * 选区变化（拖选时每个 mousemove）、滚动引起的视口变化、跳转全都算，
 * 且两个 ViewPlugin 各调一次。改动前因此每帧跑两遍整篇工作。
 *
 * 现在：收集结果按 (文档对象, 语法树, 开关快照) 缓存（三者皆不可变，
 * 纯光标移动/滚动时身份不变），第二个调用者直接命中缓存；全文文本
 * `toString()` 按文档对象缓存；HTML 标签扫描先用同源正则预检全文，
 * 没有该标签就整趟跳过。行内代码密集 + 带 HTML 标签的文档另有
 * 「排除区间 ∩ 标签匹配」的算法修复（见 html-tag-scan.ts 的复杂度约定）。
 */

import {
	ViewPlugin,
	ViewUpdate,
	Decoration,
	DecorationSet,
	EditorView,
} from '@codemirror/view';
import { Prec, RangeSetBuilder, type Text } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { MDRazorSettings, DEFAULT_SETTINGS } from '../../model/settings';
import { revealCaretRanges } from './caret-reveal';
import {
	collectPairedHtmlTags,
	collectSpanExclusions,
	type DocRange,
} from './html-tag-scan';

/**
 * 模块级可变配置对象。
 *
 * 插件在每次 `saveSettings()` 时写入此对象。ViewPlugin 在每次
 * `update()` 时读取 —— 无需重新注册扩展即可使开关立即生效。
 *
 * 这避免了 CM6 扩展与 Obsidian 插件生命周期之间的耦合。
 */
export const formattingConfig: MDRazorSettings = { ...DEFAULT_SETTINGS };

/** 单条待写入的 decoration（{from, to, spec}）。 */
interface DecorationEntry {
	from: number;
	to: number;
	spec: {
		/**
		 * 是否以 mark 装饰隐藏（HTML 标签用）。
		 * HTML 标签若用 replace 装饰，会在同一起点遮蔽 Obsidian 的内联
		 * HTML 渲染 widget（cm-html-embed），导致标签对内的渲染文本在
		 * 光标经过后消失。改用 mark + CSS 隐藏可避免该冲突。
		 */
		hideAsMark?: boolean;
	};
}

/**
 * 最近一次 buildDecorations 收集的隐藏区间（含 mark 与 replace 装饰）。
 *
 * 供空格可视化模块（whitespace-visible）读取：跳过这些区间内的空格，
 * 避免 `<span ...>` 等已被隐藏的格式符号内的空格被 `·` widget 覆盖而
 * 重新显示出来。
 */
let currentHiddenRanges: DocRange[] = [];

/**
 * 返回最近一次 buildDecorations 生成的隐藏区间（只读）。
 */
export function getHiddenRanges(): readonly DocRange[] {
	return currentHiddenRanges;
}

/* ─────────────────────────── 整篇工作缓存 ───────────────────────────
 *
 * 为什么需要：本模块的「收集」阶段是**整篇**的 —— 一次全语法树遍历、
 * 一次排除区段扫描（围栏行扫描 + 第二次全树遍历）、最多三次全文
 * `doc.toString()` 与三次全文正则配对。它原先在**每一次 ViewUpdate**
 * 都被完整执行一遍（选区变化、滚动导致的视口变化、跳转都算），而且被
 * 两个 ViewPlugin 各调一次（format-hider 自身与 cursor-boundary-hint）。
 *
 * 关键事实：收集结果只取决于 (doc, 语法树, 开关状态) 三者 ——
 * CM6 的 `Text` 与 `Tree` 都是不可变对象，纯光标移动 / 滚动时二者
 * 身份不变。故按这三者缓存，把每次更新的成本从「整篇」降到「只做光标
 * 可见性修正 + 写一次 RangeSetBuilder」。
 *
 * 缓存按 EditorView 分桶（WeakMap）：多标签页 / 分屏同时打开多个文档时
 * 各自独立，不会互相踩掉；视图销毁后条目可被回收。
 * ------------------------------------------------------------------ */

/** 单个视图的整篇收集结果缓存 */
interface EntriesCache {
	doc: Text;
	tree: ReturnType<typeof syntaxTree>;
	/** 影响收集结果的开关快照（见 configKey） */
	configKey: string;
	/** 已按 from 升序的条目（光标可见性修正前的原始集） */
	entries: DecorationEntry[];
	/** 「光标未遮盖任何标记」时的成品装饰集与其隐藏区间 */
	built: boolean;
	deco: DecorationSet;
	hiddenRanges: DocRange[];
}

const entriesCache = new WeakMap<EditorView, EntriesCache>();

/** 全文文本缓存：`Text` 不可变，同一文档对象只需 toString 一次 */
const docTextCache = new WeakMap<Text, string>();

/**
 * 取全文文本（按文档对象缓存）。
 *
 * HTML 标签类隐藏（`<font>` / `<u>` / `<span>`）只能靠正则扫描全文，
 * 需要先拿到整篇字符串。原先每帧重建、且三个开关各 toString 一次；
 * 这里按文档对象缓存，文档不变就复用同一个字符串。
 */
function documentText(doc: Text): string {
	let text = docTextCache.get(doc);
	if (text === undefined) {
		text = doc.toString();
		docTextCache.set(doc, text);
	}
	return text;
}

/**
 * 影响「收集」阶段的开关快照。
 *
 * 只包含参与 buildDecorations 收集逻辑的开关 —— 设置变更会经
 * repaintAllEditors 派发空事务，此时快照不同即触发重算。
 */
function configKey(): string {
	const c = formattingConfig;
	return [
		c.hideBoldFormatting,
		c.hideItalicFormatting,
		c.hideHighlightFormatting,
		c.hideStrikethroughFormatting,
		c.hideCodeFormatting,
		c.hideEscapeFormatting,
		c.hideHeadingFormatting,
		c.hideWikiLinkFormatting,
		c.hideHtmlColorTagFormatting,
		c.hideHtmlUnderlineFormatting,
		c.hideHtmlSpanFormatting,
	].map((on) => (on ? '1' : '0')).join('');
}

/**
 * 全文预检正则：用于在全文不含任何该标签时跳过整趟扫描与配对。
 *
 * 扫描时用 `toGlobal()` 从同一个正则派生出带 `g` 的版本 —— 预检与扫描
 * 同源，不会出现「预检通过但扫描正则已改」的漂移。必须保留 `i` 标志，
 * 否则会漏掉 `<U>` 这类写法（预检的作用是「肯定没有才跳过」，宁可多扫
 * 不可漏扫）。
 */
const COLOR_TAG_RE = /<font\s+color="#[a-fA-F0-9]{3,8}"[^>]*>|<\/font\s*>/;
const UNDERLINE_TAG_RE = /<\/?u\s*>/i;
const SPAN_TAG_RE = /<span(?:\s[^>]*)?>|<\/span\s*>/i;

/** 由预检正则派生扫描用正则（补上 g 标志；已有则原样返回） */
function toGlobal(re: RegExp): RegExp {
	return re.flags.includes('g') ? re : new RegExp(re.source, re.flags + 'g');
}

/**
 * 收集阶段（整篇）：遍历语法树 + 正则扫描 HTML 标签，产出全部待隐藏条目。
 *
 * 这是本模块唯一的「整篇」成本所在（一次全树遍历、一次排除区段扫描、
 * 最多三次全文正则配对），由 buildDecorations 按
 * (文档对象, 语法树, 开关快照) 缓存 —— 纯光标移动 / 滚动 / 跳转时不重算。
 *
 * @param view 当前的 CodeMirror EditorView
 * @param tree 与 view.state 对应的语法树
 * @returns    按 from 升序的条目数组
 */
function collectEntries(
	view: EditorView,
	tree: ReturnType<typeof syntaxTree>,
): DecorationEntry[] {
	const entries: DecorationEntry[] = [];

	tree.iterate({
		enter(node) {
			const typeName = node.type.name;
			let markerLen = 0;

			// ── 按节点类型前缀匹配，并检查对应开关状态 ──

			// 加粗：** 或 __ → 2 字符
			if (formattingConfig.hideBoldFormatting && typeName.includes('formatting-strong')) {
				markerLen = 2;
			}
			// 斜体：* 或 _ → 1 字符
			else if (formattingConfig.hideItalicFormatting && typeName.includes('formatting-em')) {
				markerLen = 1;
			}
			// 高亮：== → 2 字符
			else if (formattingConfig.hideHighlightFormatting && typeName.includes('formatting-highlight')) {
				markerLen = 2;
			}
			// 删除线：~~ → 2 字符
			else if (formattingConfig.hideStrikethroughFormatting && typeName.includes('formatting-strikethrough')) {
				markerLen = 2;
			}
			// 行内代码：支持 `、``、```（可变长度）。
			// 通过同时匹配 "formatting-code" 和 "inline-code" 排除代码块。
			else if (
				formattingConfig.hideCodeFormatting &&
				typeName.includes('formatting-code') &&
				typeName.includes('inline-code')
			) {
				const text = view.state.doc.sliceString(node.from, node.to);
				const match = text.match(/^`+/);
				markerLen = match ? match[0].length : 1;
			}
			// 转义符号：\ → 1 字符
			else if (
				formattingConfig.hideEscapeFormatting &&
				(typeName === 'Escape' || typeName === 'escape' || typeName.includes('formatting-escape'))
			) {
				markerLen = 1;
			}
			// Wiki link brackets: [[ and ]].
			// Obsidian live preview splits them into separate formatting tokens:
			//   "formatting-link_formatting-link-start" → [[  (2 chars, open marker)
			//   "formatting-link_formatting-link-end"   → ]]  (2 chars, close marker)
			// hmd-internal-link child nodes (alias, pipe, etc.) are skipped.
			else if (
				formattingConfig.hideWikiLinkFormatting &&
				typeName.startsWith('formatting-link_formatting-link')
			) {
				markerLen = 2;
			}
			// 标题：# → 1-6 字符（可变长度）。
			// # 后必须有空格才算有效标题格式。空格可能在 node 内或 node 后。
			else if (
				formattingConfig.hideHeadingFormatting &&
				(typeName.includes('formatting-header') || typeName.includes('formatting-heading') || typeName.includes('HeadingMark') || typeName.includes('HeaderMark'))
			) {
				const text = view.state.doc.sliceString(node.from, node.to);
				const headingMatch = text.match(/^(#+)\s?$/);
				if (headingMatch) {
					const spaceInside = text.endsWith(' ');
					const spaceAfter = !spaceInside && view.state.doc.sliceString(node.to, node.to + 1) === ' ';
					if (spaceInside || spaceAfter) {
						markerLen = headingMatch[1]!.length + 1;
					}
				}
			}

			// ── 收集起始和结束标记的 replace 装饰 ──

			if (markerLen > 0) {
				const isEscape = typeName === 'Escape' || typeName === 'escape' || typeName.includes('formatting-escape');
				const isHeading = typeName.includes('formatting-header') || typeName.includes('formatting-heading') || typeName.includes('HeadingMark') || typeName.includes('HeaderMark');
				const isInlineCode = typeName.includes('formatting-code') && typeName.includes('inline-code');
				const isWikiStart = typeName.includes('formatting-link_formatting-link-start');
				const isWikiEnd = typeName.includes('formatting-link_formatting-link-end');

				// 防御：Obsidian 解析器在行内 math（$..$）与加粗（**..**）等标记共存时，
				// 会生成范围错误的格式化节点 —— 节点本应只覆盖标记字符本身，实际却可能
				// 包含 latex 正文。校验即将隐藏的切片确实是标记字符；不匹配则跳过该节点。
				// 绝不隐藏非标记内容，同时防止光标边界提示弹框把 latex 误当标记显示。
				const validMarker = (from: number, to: number): boolean => {
					const text = view.state.doc.sliceString(from, to);
					if (isWikiEnd) return text === ']]';
					if (isWikiStart) return text === '[[';
					if (isInlineCode) return /^`+$/.test(text);
					if (isEscape) return text === '\\';
					if (isHeading) return /^#+\s?$/.test(text);
					if (typeName.includes('formatting-strong')) return /^[*_]+$/.test(text);
					if (typeName.includes('formatting-em')) return /^[*_]+$/.test(text);
					if (typeName.includes('formatting-highlight')) return /^=+$/.test(text);
					if (typeName.includes('formatting-strikethrough')) return /^~+$/.test(text);
					return true; // 未知类型 —— 不拦截
				};

				if (isWikiEnd) {
					// ]] close marker only — this node is the 2-char end bracket
					if (validMarker(node.from, node.to)) {
						entries.push({ from: node.from, to: node.to, spec: {} });
					}
				} else if (isWikiStart) {
					// [[ open marker only — this node is the 2-char start bracket
					if (validMarker(node.from, node.to)) {
						entries.push({ from: node.from, to: node.to, spec: {} });
					}
				} else if (isInlineCode) {
					// 行内代码：node 仅覆盖单个 ` 本身，而非整个标记->内容->标记跨度。
					// 只需一个 decoration 覆盖整个 node 范围。
					if (validMarker(node.from, node.to)) {
						entries.push({ from: node.from, to: node.to, spec: {} });
					}
				} else {
					// 起始/结束标记需同时通过校验，否则跳过整个节点。
					if (
						validMarker(node.from, node.from + markerLen) &&
						(isEscape || isHeading || validMarker(node.to - markerLen, node.to))
					) {
						// 起始标记：从节点开始到内容起始
						entries.push({
							from: node.from,
							to: node.from + markerLen,
							spec: {},
						});
						// 结束标记：从内容结束到节点结束。
						// 转义符号和标题仅隐藏修饰符，不隐藏被修饰的字符，因此跳过结束标记。
						if (!isEscape && !isHeading) {
							entries.push({
								from: node.to - markerLen,
								to: node.to,
								spec: {},
							});
						}
					}
				}
			}
		},
	});

	// ── HTML 颜色标签（如 <font color="#c00000">、</font>）──
	// 此类标签不由 CM6 syntax tree 解析，需正则扫描。
	// 用 mark 装饰隐藏（hideAsMark），避免遮蔽 Obsidian 的 HTML 渲染 widget。
	// 预检：全文不含任何该标签时正则必然无匹配，直接跳过扫描与配对。
	if (formattingConfig.hideHtmlColorTagFormatting) {
		const docStr = documentText(view.state.doc);
		if (COLOR_TAG_RE.test(docStr)) {
			for (const { from, to } of collectPairedHtmlTags(docStr, toGlobal(COLOR_TAG_RE))) {
				entries.push({
					from,
					to,
					spec: { hideAsMark: true },
				});
			}
		}
	}

	// ── HTML 下划线标签（<u>、</u>）──
	// 用 mark 装饰隐藏（hideAsMark），避免遮蔽 Obsidian 的 HTML 渲染 widget。
	if (formattingConfig.hideHtmlUnderlineFormatting) {
		const docStr = documentText(view.state.doc);
		if (UNDERLINE_TAG_RE.test(docStr)) {
			for (const { from, to } of collectPairedHtmlTags(docStr, toGlobal(UNDERLINE_TAG_RE))) {
				entries.push({
					from,
					to,
					spec: { hideAsMark: true },
				});
			}
		}
	}

	// ── HTML 行标签（<span ...>、</span>）──
	// 与 <u> 一样不由 syntax tree 解析，需正则扫描。span 标签可能携带
	// style 等任意属性，故开标签匹配 <span> 或 <span 属性...>。
	// 用 mark 装饰隐藏（hideAsMark），避免遮蔽 Obsidian 的 HTML 渲染 widget。
	//
	// 排除区段（围栏 / 行内代码 / 数学）只在**确有 span 标签**时才需要计算：
	// 全文不含 `<span` / `</span` 时正则必然无匹配，此时省掉整趟围栏行扫描
	// 与第二次全树遍历 —— 实测这是本模块原先最大的单项开销（12k 行文档
	// 单次 3.6ms、21k 行 7.2ms，而绝大多数文档根本没有 span 标签）。
	if (formattingConfig.hideHtmlSpanFormatting) {
		const docStr = documentText(view.state.doc);
		if (SPAN_TAG_RE.test(docStr)) {
			const exclusions = collectSpanExclusions(view.state.doc, tree);
			for (const { from, to } of collectPairedHtmlTags(docStr, toGlobal(SPAN_TAG_RE), exclusions)) {
				entries.push({
					from,
					to,
					spec: { hideAsMark: true },
				});
			}
		}
	}

	/* ---- Phase 2: 按 from 排序 ---- */

	entries.sort((a, b) => a.from - b.from);
	return entries;
}

/**
 * 写入阶段：把条目一次性写进同一个 RangeSetBuilder。
 *
 * @param view        当前的 CodeMirror EditorView
 * @param entries     已按 from 升序的条目
 * @param hiddenRanges 输出参数：实际写入的隐藏区间（供空格可视化读取）
 * @returns           覆盖所有待隐藏标记的 DecorationSet
 */
function writeDecorations(
	view: EditorView,
	entries: readonly DecorationEntry[],
	hiddenRanges: DocRange[],
): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const doc = view.state.doc;
	// 行窗口缓存：entries 按 from 升序，命中同一行时复用上次的 lineAt 结果。
	// CM6 的 Text 没有行缓存，逐条 lineAt 会反复从 rope 根部下降。
	let lineFrom = -1;
	let lineTo = -1;
	for (const { from, to, spec } of entries) {
		// CM6 禁止 replace 装饰跨越换行符。Obsidian 的解析器在数学符号
		// （$..$）与加粗（**..**）等标记共存于一行时会生成异常的语法树
		// 节点，其标记范围可能跨越 \n。若直接写入 replace 装饰，ViewPlugin
		// 初始化会抛异常，导致整个编辑器（乃至文件）无法打开。
		// 防御：跳过任何跨越行边界的范围 —— 宁可保留标记可见，不可崩溃。
		if (from < lineFrom || from > lineTo) {
			const line = doc.lineAt(from);
			lineFrom = line.from;
			lineTo = line.to;
		}
		if (to > lineTo) continue;
		hiddenRanges.push({ from, to });

		// HTML 标签用 mark 隐藏（CSS 使标签文本不可见），避免 replace 装饰
		// 与 Obsidian 内联 HTML 渲染 widget 在同一起点冲突而遮蔽 widget。
		// mark 不参与 replace 优先级竞争，widget 覆盖范围内不渲染，二者兼容。
		if (spec.hideAsMark) {
			builder.add(
				from,
				to,
				Decoration.mark({ ...spec, class: 'mdrazor-html-tag-hidden' }),
			);
			continue;
		}

		builder.add(from, to, Decoration.replace(spec));
	}
	return builder.finish();
}

/**
 * 构建一个 `DecorationSet`，替换（隐藏）当前视口中所有已启用的
 * 格式化标记。
 *
 * 流程：取（必要时重算并缓存）整篇条目 → 光标可见性修正 → 一次性写入
 *       同一个 RangeSetBuilder。
 *
 * 每次 ViewUpdate 都会被调用（选区变化、滚动引起的视口变化、跳转都算），
 * 且本函数被两个 ViewPlugin 共用（format-hider 自身与 cursor-boundary-hint），
 * 故整篇收集按 (doc, tree, 开关快照) 缓存：文档与语法树都没变时只做
 * 「光标可见性修正 + 写 RangeSetBuilder」这一步。缓存按视图分桶，多窗口
 * 并存互不影响；第二个调用者直接命中缓存，不再重复整篇遍历。
 *
 * @param view  当前的 CodeMirror EditorView
 * @returns     覆盖所有待隐藏标记的 DecorationSet
 */
export function buildDecorations(view: EditorView): DecorationSet {
	// 仅实时预览模式生效，源码模式跳过。
	const cmContainer = view.dom.closest('.markdown-source-view');
	if (!cmContainer || !cmContainer.classList.contains('is-live-preview')) {
		currentHiddenRanges = [];
		return Decoration.none;
	}

	const doc = view.state.doc;
	const tree = syntaxTree(view.state);
	const key = configKey();

	let cache = entriesCache.get(view);
	if (!cache || cache.doc !== doc || cache.tree !== tree || cache.configKey !== key) {
		cache = {
			doc,
			tree,
			configKey: key,
			entries: collectEntries(view, tree),
			built: false,
			deco: Decoration.none,
			hiddenRanges: [],
		};
		entriesCache.set(view, cache);
	}

	/* ---- Phase 1.5: 光标可见性保护 ---- */

	// 折叠光标被隐藏区间盖住（区间内部）或夹住（两条相邻区间之间）时，
	// 放开盖住 / 夹住光标的装饰 —— 这些位置 DOM 里没有文本可承载光标，
	// Chromium 会把 DOM 光标规范化到占位元素之后、而 CM6 状态光标停在
	// 原位，两者分叉后每个键入字符都插到同一位置：字符落到标记之外并
	// 逐键倒序（实测 doc="``" pos=1 键入 123 得到 "``321"、光标停在 1，
	// 符号边界提示持续显示 `|`；行首键入反引号时 Obsidian 自动配对插入
	// 一对并把光标放在中间，是最常见的入口）。放开后与 Obsidian 原生
	// 同态（原生在光标与标记相交时走 reveal 分支），光标落回真实文本、
	// 落点确定；首个字符插入后标记与光标不再重叠，隐藏行为立即照旧。
	// 判定与放开规则见 caret-reveal.ts（纯函数，离线回归 verify:caret）。
	// 未遮盖时 revealCaretRanges 原样返回入参（同一数组引用），据此可安全
	// 复用上一次的成品 —— 光标未落在标记上时结果只取决于缓存键三者。
	const mainSel = view.state.selection.main;
	const revealed = revealCaretRanges(cache.entries, mainSel.empty ? mainSel.head : null);

	if (revealed === cache.entries) {
		if (!cache.built) {
			cache.hiddenRanges = [];
			cache.deco = writeDecorations(view, revealed, cache.hiddenRanges);
			cache.built = true;
		}
		currentHiddenRanges = cache.hiddenRanges;
		return cache.deco;
	}

	// 光标被标记遮盖（罕见）：放开相关区间后重建一次，不写回缓存
	const hiddenRanges: DocRange[] = [];
	const deco = writeDecorations(view, revealed, hiddenRanges);
	currentHiddenRanges = hiddenRanges;
	return deco;
}

/**
 * 创建隐藏格式化标记的 CM6 扩展。
 *
 * 使用 `Prec.high` 确保我们的装饰优先级高于 Obsidian 内部的格式化装饰，
 * 使标记真正消失，而不是被内置的"光标移入时显示"逻辑覆盖。
 */
export function createFormatHiderExtension() {
	return Prec.high(
		ViewPlugin.fromClass(
			class {
				decorations: DecorationSet;

				constructor(view: EditorView) {
					this.decorations = buildDecorations(view);
				}

				update(update: ViewUpdate) {
					this.decorations = buildDecorations(update.view);
				}
			},
			{
				// 告诉 CM6 `decorations` 属性提供此插件的装饰集。
				decorations: (v) => v.decorations,
			},
		),
	);
}
