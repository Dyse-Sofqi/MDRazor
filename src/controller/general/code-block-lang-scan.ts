/**
 * MDRazor — 代码块语言标签：围栏语言词元提取（纯函数层）
 *
 * 需求背景：实时预览下代码块右上角的原生语言标签（.code-block-flair，点击
 * 即复制代码）对中文支持不完整——``` 后跟纯中文时只会显示复制图标，
 * 中英混杂（```py中文）时在首个非 ASCII 字符处截断、只显示英文前缀。
 *
 * 原生机制（Obsidian app.js 反混淆结论）：
 *   - 编辑器扩展对 HyperMD-codeblock-begin 行用正则
 *       B5 = /^\s*(~~~+|```+)[ \t]*([\w\/+#-]*)[^\n`]*$/（字符类即 [\w/+#-]）
 *     提取语言（第 2 捕获组），列表行先按 dR 剥离列表前缀再匹配；
 *   - 提取结果非空 → 创建 `createSpan({ cls: "code-block-flair", text: lang })`
 *     （findModeByName 能映射的还换成形如 "JavaScript" 的规范名）；
 *   - 提取结果为空 → 同一个 span 只塞 lucide-copy 图标，标签退化为复制按钮。
 *   两个缺陷都源自 `[\w\/+#-]` 是纯 ASCII 字符集：
 *   ① ``` 后的首词以中文开头时捕获组零宽匹配为空 → 图标；
 *   ② 首词以 ASCII 开头但掺入中文时（py中文），捕获组在首个非 ASCII 字符处
 *     截断（py），中文部分落进余部 → 标签只显示英文前缀。
 *
 * 为什么不能只用 CSS 修：两种场景下中文都从未进入渲染后的 DOM——flair span
 * 无文本或文本被截断、无携带完整语言名的属性，围栏行本身又被原生 replace
 * 装饰隐藏（隐藏区段不产生 DOM）。`content: attr(...)` 无处可读，按类名
 * 枚举也拿不到任意中文名 —— 只能由 JS 把名字填回 span。
 *
 * 本模块只负责「给一行围栏起始行文本，提取应显示的语言词元」，零依赖、
 * 可在 Node 离线驱动（scripts/verify-code-block-lang.mjs 差分回归）。
 *
 * 提取规则 = 原生流水线的 Unicode 放宽：
 *   1. 按 dR 同构前缀剥离列表/任务标记（无条件剥离与原生的「列表行才剥离」
 *      等价：dR 的标记分支要求 `标记符 + 空格`，能剥掉标记的行必然是列表行；
 *      无标记时只剥空白，与 B5 自带的 `^\s*` 等价）；
 *   2. token：与 B5 同构的围栏正则（`^\s*` + 三连及以上的 ` 或 ~ + `[ \t]*`），
 *      词元字符集放宽为「非空白且非反引号」，返回首个空白分隔词元——
 *      中英混杂、纯中文均完整（B5 的信息串余部 `[^\n`]*$` 原样保留，
 *      含反引号的整体不匹配，原生此时同样只给图标）；
 *   3. nativeToken：原生 B5 第 2 捕获组的忠实复刻（ASCII 截断语义），
 *      供调用方判断原生标签是否已完整：token === nativeToken（纯 ASCII
 *      词元）时原生已完整显示（含 js → JavaScript 的模式名映射），调用方
 *      不碰标签保持原生行为；token ≠ nativeToken 即原生截断/为空，调用方
 *      就地补全为 token。
 */

/**
 * 列表/任务前缀（Obsidian 原生 dR 的同构改写）：
 * dR = /^([>\s]*)(([*+-] |(\d+)([.)] ))(?:\[(.)\] )?)?/
 * 这里去掉 `>`（引用行在实时预览下走嵌入渲染路径，不产生 flair，无须处理；
 * 保留 `>` 剥离反而会让「> ```中文」显示标签而「> ```python」显示图标，
 * 与原生行为不一致），空白组收窄为 [ \t]（行文本不含换行）。
 */
const LIST_PREFIX_RE = /^[ \t]*(?:(?:[*+-] |\d+[.)] )(?:\[.\] )?)?/;

/**
 * 围栏语言提取（Obsidian 原生 B5 的 Unicode 放宽版）：
 * B5 = /^\s*(~~~+|```+)[ \t]*([\w\/+#-]*)[^\n`]*$/
 * 词元组放宽为 [^\s`]+，余部保持 [^\n`]*$（整行匹配 + 禁反引号语义不变）。
 */
const FENCE_LANG_RE = /^\s*(?:~{3,}|`{3,})[ \t]*([^\s`]+)?[^\n`]*$/;

/** 原生 B5 的忠实复刻（用于 nativeToken；正则本体照抄 app.js，仅按 lint 去掉字符类内 `\/` 的多余转义） */
const NATIVE_FENCE_LANG_RE = /^\s*(~~~+|```+)[ \t]*([\w/+#-]*)[^\n`]*$/;

/** 一行围栏起始行的语言词元提取结果 */
export interface FenceLanguageInfo {
	/** Unicode 放宽词元（首个空白分隔词，中英混杂/纯中文完整）；无词元为空串 */
	token: string;
	/** 原生 B5 词元（ASCII 字符集，在首个字符集外字符处截断）；原生为空/失败为空串 */
	nativeToken: string;
}

/**
 * 从一行「围栏起始行」文本提取语言词元（Unicode 放宽 + 原生复刻各一）。
 *
 * @param lineText 围栏起始行的整行文本（含可能的列表/任务前缀与缩进）
 * @returns token = 应显示的完整词元；nativeToken = 原生标签当前语义的词元。
 *          两者皆空串表示「无语言名 / 信息串含反引号」——原生显示图标，
 *          调用方也应保持图标。
 */
export function extractFenceLanguage(lineText: string): FenceLanguageInfo {
	// 无条件剥离列表前缀：与原生的「列表行才剥离」等价，论证见 LIST_PREFIX_RE 注释
	const stripped = lineText.replace(LIST_PREFIX_RE, '');
	return {
		token: FENCE_LANG_RE.exec(stripped)?.[1] ?? '',
		nativeToken: NATIVE_FENCE_LANG_RE.exec(stripped)?.[2] ?? '',
	};
}

/**
 * 仅取 Unicode 放宽词元（兼容旧调用与离线回归）。
 */
export function extractFenceLanguageToken(lineText: string): string {
	return extractFenceLanguage(lineText).token;
}
