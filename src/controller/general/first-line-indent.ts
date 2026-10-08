/**
 * MDRazor — 通用：首行缩进（Controller）
 *
 * 需求：为正文段落添加首行缩进（1~2 个中文字符，默认关闭）。
 *
 * ── 为什么不能纯靠 CSS ──
 *
 * 阅读视图可以（正文是真正的 `<p>`，配合逐项排除即可），但**实时预览不行**：
 * CodeMirror 6 的 DOM 里没有「段落」元素，一段正文就是一串 `.cm-line`
 * （每行源码一个 div）。`text-indent` 作用于块级元素的首行，直接写在
 * `.cm-line` 上时，「一段硬换行的正文」会**每一行都缩进**（每个 `.cm-line`
 * 各自成为一个块），而 CSS 无法知道哪一行是段落首行 —— 没有任何选择器能
 * 表达「这个 `.cm-line` 是某个段落的起始行」。因此缩进位置必须由 JS 判定。
 *
 * 结论：编辑器侧用 CM6 行装饰标出段落首行（判定见 first-line-indent-rules.ts），
 * 阅读视图侧用 body 开关类 + 样式表规则（`<p>` 有真实块结构，排除项写在
 * styles.css 里）。两侧共用同一个缩进变量 `--mdrazor-first-line-indent`
 * （单位 em，1em = 一个中文字符宽）。
 *
 * ── 生效范围（作用域严格限定在「正文区域」）──
 *
 * 仅**实时预览**（`editorLivePreviewField`）与**阅读视图**。源码模式下缩进会把
 * 源码本身推右，看起来像误输入的空格，故不生效。
 *
 * 且都要求处于 Obsidian 自己的正文容器内：
 *   - 编辑器侧要求 `.markdown-source-view` 祖先。本扩展经 `registerEditorExtension`
 *     注册，会挂到工作区里**所有** CM6 编辑器上；不设这道门，第三方视图自建的
 *     编辑器（Glimpse 提词器里内嵌的编辑区、画布文本节点等）也会被缩进。
 *   - 阅读视图侧要求 `.markdown-reading-view` 祖先（见 styles.css）。`markdown-preview-view`
 *     / `markdown-rendered` 这两个类常被第三方视图借去复用主题样式（Glimpse 提词器
 *     的内容容器就是 `glimpse-tp-content markdown-rendered markdown-preview-view`），
 *     只用 `.markdown-preview-view p` 会把缩进外溢出去。
 *
 * ── 段落边界随 Obsidian 的「严格换行」设置而变 ──
 *
 * 设置 → 编辑器 → 严格换行 = 关（**Obsidian 默认**，非严格换行）时，单个换行
 * 在渲染中就是一次硬换行 —— 阅读视图里 `甲\n乙` 渲染成 `<p>甲<br>乙</p>`，
 * 实时预览里更是每行一个 `.cm-line`。此时「一行即一段」，**每个正文行都是
 * 段落首行、都要缩进**（否则用户按单回车写的每一段只有第一行缩进，看起来就是
 * 「遗漏了缩进」）。严格换行 = 开时，单回车是软换行，同一段落的续行不缩进。
 *
 * 阅读视图侧的差异与对策：非严格换行下单个回车在 HTML 里只是 `<p>` 内的一个
 * `<br>`，而 `<br>` 之后的文本拿不到 `text-indent`（实测四种 CSS 做法全无效，见
 * first-line-indent-reading.ts 的注释）。那一侧改由该模块做 DOM 后处理：在每个
 * `<br>` 之后插入一个空的 inline-block 占位元素撑出缩进，使阅读视图与实时预览
 * 的逐行缩进表现一致。
 *
 * ── 排除的非正文块 ──
 *
 * 标题 / 表格 / 列表（含任务项）/ 引用与 callout（含惰性续行）/ 围栏与缩进式
 * 代码块 / `$$` 数学块 / `%%` 注释 / HTML 块 / frontmatter / 脚注与链接引用
 * 定义 / 独立块 ID / 纯图片与嵌入段落 —— 详见 first-line-indent-rules.ts。
 */

import { Plugin, editorLivePreviewField, type App } from 'obsidian';
import { Decoration, type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder, type Text } from '@codemirror/state';
import {
	findIndentableParagraphStarts,
	type IndentLineSource,
} from './first-line-indent-rules';
import { forEachDocument } from './window-scope';

/** body 上的「首行缩进」开关类（styles.css 以它限定规则生效，关闭即时失效） */
export const FIRST_LINE_INDENT_BODY_CLASS = 'mdrazor-first-line-indent';

/** 正文段落首行的行装饰类（styles.css 据它应用 text-indent） */
export const FIRST_LINE_INDENT_LINE_CLASS = 'mdrazor-indent-first-line';

/**
 * **空的**段落首行的行装饰类（styles.css 据它改用透明左边框位移）。
 *
 * 为什么空行要单独一套：`text-indent` 只推「首行盒里的内联内容」。空行里没有
 * 内联内容（只有一个 `<br>`），浏览器仍把光标画在**未缩进**处 —— 实测
 * （scripts/fixtures/first-line-indent-caret.html，Chrome 153）：空行里的 `<br>`
 * 已被 text-indent 推到 38px，但内容盒左边界仍是 6px，光标停在 6px；键入第一个
 * 字符后行盒有了内容，光标才跳到 38px。改用**透明 `border-inline-start`** 把内容盒
 * 右移一个缩进宽度：光标基准跟着走，而行盒（背景盒）不动，故「当前行高亮」等整行
 * 背景不会被切掉一角；也不碰 `padding`，CM6 的 `posAtCoords` 文本区基准不受影响。
 * 三者的实测对比见 scripts/fixtures/first-line-indent-empty-line-shift.html。
 */
export const FIRST_LINE_INDENT_EMPTY_LINE_CLASS = 'mdrazor-indent-first-line-empty';

/** 缩进宽度 CSS 变量（body 上，单位 em；1em = 一个中文字符宽） */
export const FIRST_LINE_INDENT_VAR = '--mdrazor-first-line-indent';

/** 缩进宽度允许范围（中文字符数） */
export const FIRST_LINE_INDENT_MIN = 1;
export const FIRST_LINE_INDENT_MAX = 2;

/** 模块级可变配置，由 controller/main.ts 在设置变更时写入 */
export const firstLineIndentConfig: { enabled: boolean } = { enabled: false };

/** 设置读取器（registerFirstLineIndent 传入；null = 尚未注册） */
let enabledRef: (() => boolean) | null = null;
let sizeRef: (() => number) | null = null;
/** App 引用：CM6 扩展据此读「严格换行」设置（registerFirstLineIndent 传入） */
let appRef: App | null = null;

/** 把设置值钳制到允许范围 */
function clampSize(value: number): number {
	if (!Number.isFinite(value)) return FIRST_LINE_INDENT_MAX;
	return Math.min(FIRST_LINE_INDENT_MAX, Math.max(FIRST_LINE_INDENT_MIN, value));
}

/** 把 CM6 文档包装成行访问器（不整篇切数组，按需切片） */
function docLineSource(doc: Text): IndentLineSource {
	return {
		lineCount: doc.lines,
		readLine: (n: number) => (n >= 1 && n <= doc.lines ? doc.line(n).text : ''),
	};
}

/**
 * 读取 Obsidian 的「严格换行」设置（设置 → 编辑器 → 严格换行）。
 *
 * 关闭（非严格换行）时单回车就是硬换行，每个源码行都是独立视觉行 →
 * 「一行即一段」，每个正文行都要缩进；开启时单回车是软换行（同一段落），
 * 只有整段首行缩进。
 *
 * `Vault.getConfig` 未进 typings，故经类型收窄访问；取不到时按 Obsidian
 * 的默认值处理 —— app.js 的默认设置表里 `strictLineBreaks: false`（非严格）。
 *
 * 阅读视图侧的逐行缩进（first-line-indent-reading.ts）也要用它判同一个条件。
 */
export function isNonStrictLineBreaks(app: App): boolean {
	const vault = app.vault as unknown as { getConfig?: (key: string) => unknown };
	return vault.getConfig?.('strictLineBreaks') !== true;
}

/**
 * 首行缩进 CM6 扩展。
 *
 * 每个 update 重建装饰（设置开关经 repaintAllEditors 派发空事务生效，
 * 与空格可视化 / 打字机同模式）。段落判定按文档缓存：`doc` 未变（纯光标
 * 移动）时直接复用上一次的行号表，避免每次光标移动都全篇扫描。
 */
const firstLineIndentPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;

		/** 段落首行缓存：文档对象与「严格换行」设置都未变时判定结果不变 */
		private cachedDoc: Text | null = null;
		private cachedNonStrict: boolean | null = null;
		private starts: number[] = [];

		constructor(view: EditorView) {
			this.decorations = this.build(view);
		}

		update(update: ViewUpdate) {
			this.decorations = this.build(update.view);
		}

		/** 取（必要时重算）正文段落首行行号表 */
		private paragraphStarts(view: EditorView, nonStrict: boolean): number[] {
			const doc = view.state.doc;
			if (this.cachedDoc === doc && this.cachedNonStrict === nonStrict) return this.starts;
			this.cachedDoc = doc;
			this.cachedNonStrict = nonStrict;
			this.starts = findIndentableParagraphStarts(docLineSource(doc), {
				nonStrictLineBreaks: nonStrict,
			});
			return this.starts;
		}

		private build(view: EditorView): DecorationSet {
			if (!firstLineIndentConfig.enabled) return Decoration.none;
			// 仅实时预览：源码模式下缩进会把源码推右（见文件头说明）
			if (!view.state.field(editorLivePreviewField, false)) return Decoration.none;
			// 作用域限定在**真正的正文编辑器**：本扩展由 registerEditorExtension
			// 注册，会挂到工作区里**所有** CM6 编辑器上 —— 包括第三方视图自建的
			// 编辑器（如 Glimpse 提词器里内嵌的编辑区）。要求 .markdown-source-view
			// 祖先即可把范围收回到 Obsidian 自己的 Markdown 编辑器（源码模式与
			// 实时预览共用该容器），与 format-hider 的判定一致。
			if (!view.dom.closest('.markdown-source-view')) return Decoration.none;

			// 非严格换行（Obsidian 默认）下「一行即一段」：app 尚未就绪时按默认值处理
			const nonStrict = appRef === null || isNonStrictLineBreaks(appRef);
			const starts = this.paragraphStarts(view, nonStrict);
			if (starts.length === 0) return Decoration.none;

			const doc = view.state.doc;
			const deco = Decoration.line({ class: FIRST_LINE_INDENT_LINE_CLASS });
			// 空行走另一套样式（margin 位移）：text-indent 对空行不移动光标，
			// 详见 FIRST_LINE_INDENT_EMPTY_LINE_CLASS 的说明
			const emptyDeco = Decoration.line({
				class: `${FIRST_LINE_INDENT_LINE_CLASS} ${FIRST_LINE_INDENT_EMPTY_LINE_CLASS}`,
			});
			const builder = new RangeSetBuilder<Decoration>();
			// starts 升序、visibleRanges 升序 → 单游标推进即可，无需去重
			let cursor = 0;
			for (const { from, to } of view.visibleRanges) {
				if (from >= to) continue;
				const firstLine = doc.lineAt(from).number;
				const lastLine = doc.lineAt(to).number;
				while (cursor < starts.length && starts[cursor]! < firstLine) cursor++;
				for (let k = cursor; k < starts.length && starts[k]! <= lastLine; k++) {
					const line = doc.line(starts[k]!);
					builder.add(line.from, line.from, line.text.trim() === '' ? emptyDeco : deco);
				}
			}
			return builder.finish();
		}
	},
	{
		decorations: (v) => v.decorations,
	},
);

/** 创建首行缩进 CM6 扩展（controller/main.ts 注册） */
export function createFirstLineIndentExtension() {
	return firstLineIndentPlugin;
}

/**
 * 注册首行缩进（onload 调用）：设置开启时立即挂 body 开关类并写入缩进变量。
 *
 * @param plugin    Plugin 实例（取 app 以覆盖所有窗口的 document）
 * @param isEnabled 设置读取器：设置切换无需重注册
 * @param getSize   缩进宽度读取器（中文字符数）
 */
export function registerFirstLineIndent(
	plugin: Plugin,
	isEnabled: () => boolean,
	getSize: () => number,
): void {
	enabledRef = isEnabled;
	sizeRef = getSize;
	appRef = plugin.app;
	applyFirstLineIndentClass(plugin.app);
}

/**
 * 设置变化后同步状态（saveSettings → syncConfig 调用）：
 * 开启时挂类并写入 `--mdrazor-first-line-indent = <n>em`，关闭时摘类并归零。
 * 纯 classList / CSS 变量切换，即时生效；编辑器侧的行装饰由
 * repaintAllEditors 派发的空事务重建。
 *
 * @param app App 实例：类与变量挂到**所有已打开窗口**的 document
 *            （主窗口 + popout），只挂 activeDocument 会让 popout 里的
 *            编辑器拿不到样式
 */
export function applyFirstLineIndentClass(app: App): void {
	const enabled = enabledRef?.() ?? false;
	// 关闭时写 0em 而非移除变量（与打字机留白同款：规则已由 body 类关闭，
	// 保留一个中性值避免再引入 removeProperty 这类裸 DOM 操作）
	const size = `${clampSize(sizeRef?.() ?? FIRST_LINE_INDENT_MAX)}em`;
	forEachDocument(app, (doc) => {
		doc.body.classList.toggle(FIRST_LINE_INDENT_BODY_CLASS, enabled);
		doc.body.setCssProps({ [FIRST_LINE_INDENT_VAR]: enabled ? size : '0em' });
	});
}

/** 插件卸载时清理（body 类与变量由 JS 添加，需手动摘除） */
export function removeFirstLineIndentClass(app: App): void {
	forEachDocument(app, (doc) => {
		doc.body.classList.remove(FIRST_LINE_INDENT_BODY_CLASS);
		doc.body.setCssProps({ [FIRST_LINE_INDENT_VAR]: '0em' });
	});
}
