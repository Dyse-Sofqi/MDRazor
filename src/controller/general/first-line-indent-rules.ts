/**
 * MDRazor — 通用：首行缩进 / 正文段落识别规则（纯函数，无 Obsidian / CM6 依赖）
 *
 * 为什么需要自己识别段落：实时预览的 DOM 里**没有「段落」元素** ——
 * 一段正文在 CodeMirror 6 里就是一串 `.cm-line`（每行源码一个 div）。
 * CSS 的 `text-indent` 作用于块级元素的首行，直接写在 `.cm-line` 上时，
 * 「一段硬换行的正文」会每一行都缩进（每个 `.cm-line` 各自成为一个块），
 * 而纯 CSS 无法知道哪一行是段落首行。因此缩进位置必须由 JS 判定。
 *
 * 判定方式：按 Markdown 块结构逐行分类（本文件），段落 = 连续的 text 行，
 * 只有「上一行不是 text」的那一行才是段落首行。
 *
 * 排除的非正文块（需求列出 + 实际存在的）：
 *   frontmatter（文档头 YAML）/ ATX 与 Setext 标题 / 分割线 / 围栏代码块 /
 *   缩进式代码块 / 引用与 callout（含惰性续行）/ 列表（含惰性续行与任务项）/
 *   GFM 表格（含分隔行）/ HTML 块 / `$$` 数学块 / `%%` 注释块 /
 *   脚注定义 / 链接引用定义 / 独立块 ID 行 / 纯图片或嵌入段落。
 *
 * 与 Obsidian 解析器的关系：这里**不使用语法树**。Obsidian 的 markdown
 * 解析器是 HyperMD 流式模式的 CM6 移植，其节点名是 `formatting-*` /
 * `hmd-*` 一类 token 拼接（见 DEBUGLOG），**没有 `Paragraph` 这样的块级
 * 节点**（实测：app.js 的 `parseLine` 只为「带行类 token 的行」建节点，
 * 纯文本行不产出任何节点），因此无法据其判断段落边界。本模块改用行分类，
 * 好处是纯函数、可在 Node 里用固定夹具回归（见 scripts/verify-first-line-indent.mjs）。
 */

/** 行类型（块结构） */
export type IndentLineKind =
	/** 空行 / 纯空白行 */
	| 'blank'
	/** 文档头 YAML 属性块（含首尾 `---` 行） */
	| 'frontmatter'
	/** 围栏代码块（含围栏行）/ 缩进式代码块 */
	| 'code'
	/** `$$` 数学块 */
	| 'math'
	/** `%%` 注释块 */
	| 'comment'
	/** HTML 块 */
	| 'html'
	/** 引用 / callout / 列表（含其惰性续行） */
	| 'container'
	/** GFM 表格（含表头、分隔行、数据行） */
	| 'table'
	/** ATX / Setext 标题（含 Setext 下划线行） */
	| 'heading'
	/** 分割线 */
	| 'hr'
	/** 脚注定义 / 链接引用定义 / 独立块 ID 行 */
	| 'meta'
	/** 正文段落行 */
	| 'text';

/**
 * 行文本访问器（1-based 行号）。
 * 用访问器而非 `string[]`：CM6 侧直接读 `doc.line(n).text`，
 * 避免每次 update 把整篇文档切成字符串数组。
 */
export interface IndentLineSource {
	/** 总行数 */
	readonly lineCount: number;
	/** 读取第 n 行（1-based）的文本（不含换行符）；n 越界时返回空串 */
	readLine(n: number): string;
}

/** 由纯文本构造行访问器（测试与离线校验用） */
export function textLineSource(text: string): IndentLineSource {
	const lines = text.split('\n');
	return {
		lineCount: lines.length,
		readLine: (n: number) => lines[n - 1] ?? '',
	};
}

const BLANK_RE = /^\s*$/;
const FENCE_OPEN_RE = /^\s{0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE_RE = /^\s{0,3}(`{3,}|~{3,})\s*$/;
const FRONTMATTER_DELIM_RE = /^(?:---|\.\.\.)$/;
const QUOTE_RE = /^\s{0,3}>/;
/** 分割线：连续 3 个及以上横线/星号/下划线（可含空格间隔：---、* * *、- - -） */
const HR_RE = /^\s{0,3}(?:[-*_][ \t]*){3,}$/;
const ATX_HEADING_RE = /^\s{0,3}#{1,6}(?:\s|$)/;
const SETEXT_UNDERLINE_RE = /^\s{0,3}(?:=+|-+)\s*$/;
const LIST_MARKER_RE = /^\s{0,3}(?:[-+*]|\d{1,9}[.)])(?:\s|$)/;
/** 缩进式代码块：4 空格或 1 个制表符起 */
const INDENTED_CODE_RE = /^(?: {4}|\t)/;
const MATH_BLOCK_RE = /^\s{0,3}\$\$/;
/** 单行内闭合的 `$$...$$`（不成块） */
const MATH_INLINE_RE = /^\s{0,3}\$\$[\s\S]*\$\$\s*$/;
const COMMENT_RE = /^\s{0,3}%%/;
const FOOTNOTE_DEF_RE = /^\s{0,3}\[\^[^\]]+\]:/;
const LINK_REF_DEF_RE = /^\s{0,3}\[[^\]]+\]:\s*\S/;
/** 独立块 ID 行：`^block-id` 独占一行 */
const BLOCK_ID_RE = /^\s{0,3}\^\S+$/;
/**
 * HTML 块起始（CommonMark type 1~6 的块级标签 + 注释 + 声明）。
 * 只收录真正按块渲染的标签：`span`/`a`/`em`/`code` 等行内标签不在此列，
 * 否则「以 `<span>` 开头的正文段落」会被误判成 HTML 块。
 */
const HTML_BLOCK_RE =
	/^\s{0,3}<(?:\/?)(?:div|table|thead|tbody|tfoot|tr|td|th|caption|colgroup|col|p|h[1-6]|ul|ol|li|dl|dt|dd|blockquote|pre|section|article|aside|nav|header|footer|figure|figcaption|details|summary|form|fieldset|iframe|video|audio|canvas|svg|script|style|template|center|main|hr)\b|^\s{0,3}<!--|^\s{0,3}<![A-Za-z]/i;
/** GFM 表格分隔行：每格至少 3 个连字符（可带 : 对齐）；至少一个 |（支持单列表） */
const TABLE_DELIM_RE = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const TABLE_LEAD_PIPE_RE = /^\s*\|/;

/** 是否为表格分隔行（须含 `|`，避免与分割线 `---` / `***` 冲突） */
function isTableDelimLine(line: string): boolean {
	return line.includes('|') && TABLE_DELIM_RE.test(line);
}

/**
 * 表格模式（复刻 Obsidian hypermd 模式的两种形态）：
 *   - `normal`：表头行有前导 `|`（`| a | b |`），此后每行必须**以 `|` 开头**；
 *   - `simple`：表头行无前导 `|`（`a | b`），此后每行必须**以非 `|` 开头且含 `|`**。
 * 对应 Obsidian 的 `fU = /^\|/` 与 `pU = /^\s*[^\|].*\|/` —— 表格在
 * 「下一行不满足本模式的行式」处结束，而不是「不含 `|`」处结束。
 */
type TableMode = 'simple' | 'normal';

/** 该行是否符合当前表格模式的行式（Obsidian `pU` / `fU`） */
function isTableRow(line: string, mode: TableMode): boolean {
	return mode === 'normal' ? /^\|/.test(line) : /^\s*[^|].*\|/.test(line);
}

/** 由表头行判断表格模式（有前导 `|` 为 normal） */
function tableModeOf(line: string): TableMode {
	return TABLE_LEAD_PIPE_RE.test(line) ? 'normal' : 'simple';
}

/**
 * 文档头 YAML 块的行范围（1-based，含首尾分隔行）。
 *
 * 仅当第 1 行是 `---` 且其后存在配对的 `---` / `...` 时成立 ——
 * 无配对时第 1 行只是分割线，其余内容是普通正文（否则「以 --- 开头、
 * 没有闭合」的文档会被整篇当成属性块而完全不缩进）。
 *
 * @returns `{ from, to }`；不构成属性块时返回 null
 */
function frontmatterRange(src: IndentLineSource): { from: number; to: number } | null {
	if (src.lineCount === 0) return null;
	if (src.readLine(1).trim() !== '---') return null;
	for (let n = 2; n <= src.lineCount; n++) {
		if (FRONTMATTER_DELIM_RE.test(src.readLine(n).trim())) return { from: 1, to: n };
	}
	return null;
}

/**
 * 逐行分类（块结构）。
 *
 * 顺序即优先级，几个关键取舍：
 *   - **围栏 / 数学块 / 注释块 / HTML 块 / 属性块**先判：进入块状态后整块
 *     归为同类，块内的 `#`、`-`、`|` 等一律不再参与块结构判定；
 *   - **HTML 块起始**排在惰性续行之前：CommonMark 的 HTML 块（type 1~6）
 *     可以中断段落；
 *   - **惰性续行**排在缩进式代码之前：`- 项\n续行` 与 `正文\n    缩进行`
 *     里的第二行都属于前一个块（缩进式代码不能中断段落 / 列表项），
 *     若误判成 code，会让再下一行被当成新段落首行而错误缩进；
 *   - **表格**按 Obsidian hypermd 的两种模式判「本行是否仍是表格行」
 *     （normal 要求行首 `|`，simple 要求行首非 `|` 且含 `|`），不满足即
 *     退出表格状态、该行继续按块结构判定（所以不能 `continue`）；
 *   - **Setext 下划线**需要回头改判上一行：`标题\n===` 的两行都是标题。
 */
export function classifyLines(src: IndentLineSource): IndentLineKind[] {
	const kinds: IndentLineKind[] = new Array<IndentLineKind>(src.lineCount).fill('text');

	let scanStart = 1;
	const frontmatter = frontmatterRange(src);
	if (frontmatter) {
		for (let n = frontmatter.from; n <= frontmatter.to; n++) kinds[n - 1] = 'frontmatter';
		scanStart = frontmatter.to + 1;
	}

	let fence: { char: string; len: number } | null = null;
	let mathBlock = false;
	let commentBlock = false;
	let htmlBlock = false;
	let tableMode: TableMode | null = null;
	let prev: IndentLineKind | null = null;
	/** 上一行是「带 Setext 下划线」的标题文本 → 本行应是那条下划线（见文件末分支） */
	let pendingSetextUnderline = false;

	for (let n = scanStart; n <= src.lineCount; n++) {
		const line = src.readLine(n);

		// ── Setext 下划线：上一行（段落文本）已判定为标题，本行即它的下划线 ──
		// 必须最先判：`---` 形式的 Setext 下划线否则会被 HR_RE 抢走判成分割线
		const isSetextUnderline = pendingSetextUnderline;
		pendingSetextUnderline = false;
		if (isSetextUnderline && SETEXT_UNDERLINE_RE.test(line)) {
			kinds[n - 1] = 'heading';
			prev = 'heading';
			continue;
		}

		// ── 块状态内：整块同类，不再判块结构 ──
		if (fence !== null) {
			kinds[n - 1] = 'code';
			const close = FENCE_CLOSE_RE.exec(line);
			if (close && close[1]!.charAt(0) === fence.char && close[1]!.length >= fence.len) {
				fence = null;
			}
			prev = 'code';
			continue;
		}
		if (mathBlock) {
			kinds[n - 1] = 'math';
			if (line.includes('$$')) mathBlock = false;
			prev = 'math';
			continue;
		}
		if (commentBlock) {
			kinds[n - 1] = 'comment';
			if (line.includes('%%')) commentBlock = false;
			prev = 'comment';
			continue;
		}
		if (htmlBlock) {
			kinds[n - 1] = 'html';
			if (BLANK_RE.test(line)) htmlBlock = false;
			prev = 'html';
			continue;
		}

		if (BLANK_RE.test(line)) {
			kinds[n - 1] = 'blank';
			tableMode = null;
			prev = 'blank';
			continue;
		}

		const fenceOpen = FENCE_OPEN_RE.exec(line);
		if (fenceOpen) {
			kinds[n - 1] = 'code';
			fence = { char: fenceOpen[1]!.charAt(0), len: fenceOpen[1]!.length };
			tableMode = null;
			prev = 'code';
			continue;
		}

		if (MATH_BLOCK_RE.test(line)) {
			kinds[n - 1] = 'math';
			// 同行闭合（`$$E=mc^2$$`）不成块，下一行仍按块结构判定
			if (!MATH_INLINE_RE.test(line)) mathBlock = true;
			tableMode = null;
			prev = 'math';
			continue;
		}

		if (COMMENT_RE.test(line)) {
			// 同行闭合（`%%注释%%`）按正文行处理：其后一行仍是同一段落的续行
			if (line.trim().slice(2).includes('%%')) {
				kinds[n - 1] = 'text';
				prev = 'text';
			} else {
				kinds[n - 1] = 'comment';
				commentBlock = true;
				prev = 'comment';
			}
			tableMode = null;
			continue;
		}

		if (QUOTE_RE.test(line)) {
			kinds[n - 1] = 'container';
			tableMode = null;
			prev = 'container';
			continue;
		}

		// ── 表格：先判「表格是否在本行结束」，不满足行式即退出表格状态、
		//    本行继续按块结构判定（不能 continue，否则该行会被整行吞掉）──
		if (tableMode !== null) {
			if (isTableRow(line, tableMode)) {
				kinds[n - 1] = 'table';
				prev = 'table';
				continue;
			}
			tableMode = null;
		}
		if (isTableDelimLine(line)) {
			kinds[n - 1] = 'table';
			tableMode = tableModeOf(line);
			prev = 'table';
			continue;
		}
		// 无前导竖线的表头行：分隔行必须**紧接**其后（中间不能有空行）
		if (line.includes('|') && isTableDelimLine(src.readLine(n + 1))) {
			kinds[n - 1] = 'table';
			tableMode = tableModeOf(line);
			prev = 'table';
			continue;
		}
		if (TABLE_LEAD_PIPE_RE.test(line)) {
			kinds[n - 1] = 'table';
			tableMode = 'normal';
			prev = 'table';
			continue;
		}

		// ── Setext 下划线（`---` 形态）必须先于 HR 判定：`段落\n---` 是
		//    Setext 二级标题而非「段落 + 分割线」；HR_RE 同样匹配 `---`，
		//    排在前面会把下划线抢走，导致段落首行被误缩进 ──
		if (SETEXT_UNDERLINE_RE.test(line) && prev === 'text') {
			// 多行段落 + 下划线：整段（连续 text 行）都是 Setext 标题，一并改判
			let k = n - 1;
			while (k >= 1 && kinds[k - 1] === 'text') {
				kinds[k - 1] = 'heading';
				k--;
			}
			kinds[n - 1] = 'heading';
			prev = 'heading';
			continue;
		}

		if (HR_RE.test(line)) {
			kinds[n - 1] = 'hr';
			prev = 'hr';
			continue;
		}

		if (ATX_HEADING_RE.test(line)) {
			kinds[n - 1] = 'heading';
			prev = 'heading';
			continue;
		}

		if (LIST_MARKER_RE.test(line)) {
			kinds[n - 1] = 'container';
			prev = 'container';
			continue;
		}

		// ── HTML 块起始（可中断段落，故先于惰性续行判定）──
		if (HTML_BLOCK_RE.test(line)) {
			kinds[n - 1] = 'html';
			htmlBlock = true;
			prev = 'html';
			continue;
		}

		// ── 惰性续行：段落 / 引用 / 列表的续行优先于缩进式代码 ──
		if (prev === 'text') {
			kinds[n - 1] = 'text';
			continue;
		}
		if (prev === 'container') {
			kinds[n - 1] = 'container';
			continue;
		}

		if (INDENTED_CODE_RE.test(line)) {
			kinds[n - 1] = 'code';
			prev = 'code';
			continue;
		}

		if (FOOTNOTE_DEF_RE.test(line) || LINK_REF_DEF_RE.test(line) || BLOCK_ID_RE.test(line)) {
			kinds[n - 1] = 'meta';
			prev = 'meta';
			continue;
		}

		// ── 正文段落起始；下一行是 Setext 下划线时本行实为标题 ──
		if (SETEXT_UNDERLINE_RE.test(src.readLine(n + 1))) {
			kinds[n - 1] = 'heading';
			pendingSetextUnderline = true;
			prev = 'heading';
			continue;
		}

		kinds[n - 1] = 'text';
		prev = 'text';
	}

	return kinds;
}

/**
 * 段落判定选项。
 */
export interface IndentRuleOptions {
	/**
	 * Obsidian 是否处于「非严格换行」（设置 → 编辑器 → 严格换行 = 关，**Obsidian 的默认值**）。
	 *
	 * 关闭时，单个换行（单回车）在渲染中就是一次硬换行 —— 阅读视图里
	 * `甲\n乙` 渲染成 `<p>甲<br>乙</p>`，两个源码行是**两条视觉行**；
	 * 实时预览里更是每行一个 `.cm-line`。此时「一行即一段」，每个 text 行
	 * 都是段落首行，都要缩进。
	 *
	 * 开启（严格换行）时，`甲\n乙` 是**同一个段落**（软换行），只有整段的第一行
	 * 缩进，硬换行产生的续行不缩进。
	 *
	 * 两种模式都只影响「段落边界」，不影响行分类：列表 / 引用的惰性续行
	 * 在任何模式下都仍属于外层容器（CommonMark 语义，Obsidian 亦然）。
	 */
	nonStrictLineBreaks?: boolean;
}

/**
 * 找出「需要首行缩进的正文段落首行」（1-based 行号，升序）。
 *
 * 判定：该行是 text（正文）**或 blank（空行）**且属于一个段落的首行；
 * 再排除三类虽然算正文、但不该缩进的段落：
 *   - 以 `![` 开头（纯图片 / 嵌入 `![[…]]`）—— 缩进会把图整体推右；
 *   - 以 `%%` 开头（单行注释开头，注释渲染为空）或 `$$` 开头（同行数学）。
 *
 * 空行为什么也要缩进：回车新建的那一行是空的，若不挂装饰，光标会停在未缩进处、
 * 键入第一个字符才跳过去（用户报告）。空行按「它若变成正文行会不会是段落首行」
 * 判定，故与正文行共用同一条规则（见下）。
 *
 * 「段落首行」随 Obsidian 的严格换行设置而变（见 IndentRuleOptions）：
 * 非严格换行时每个 text 行都是首行；严格换行时只有连续 text 行的第一行是。
 * 空行同理：严格换行下「上一行是 text」即视为同一段的延续，不缩进。
 *
 * 注意：围栏代码块 / 数学块 / 注释块 / HTML 块**内部**的空行不会走到这里 ——
 * 它们在 classifyLines 里已被块状态分支吃掉，类型是 code / math / comment / html。
 */
export function findIndentableParagraphStarts(
	src: IndentLineSource,
	options: IndentRuleOptions = {},
): number[] {
	const nonStrict = options.nonStrictLineBreaks === true;
	const kinds = classifyLines(src);
	const starts: number[] = [];
	for (let n = 1; n <= src.lineCount; n++) {
		const kind = kinds[n - 1];
		if (kind !== 'text' && kind !== 'blank') continue;
		// 严格换行：连续正文行属同一段，只有第一行缩进
		if (!nonStrict && n > 1 && kinds[n - 2] === 'text') continue;
		const trimmed = src.readLine(n).trim();
		if (trimmed.startsWith('![')) continue;
		if (trimmed.startsWith('%%')) continue;
		if (trimmed.startsWith('$$')) continue;
		starts.push(n);
	}
	return starts;
}
