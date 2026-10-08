/**
 * MDRazor — 首行缩进「正文段落识别」离线回归
 *
 * 用法：`node scripts/verify-first-line-indent.mjs`（或 `npm run verify:indent`）
 *
 * 为什么需要它：首行缩进的正确性完全取决于「哪些行是正文段落首行」这一个判定，
 * 而它要覆盖围栏/缩进代码块、标题、表格、列表与引用（含惰性续行）、数学块、
 * 注释、HTML 块、属性区、脚注定义等十来种块结构 —— 靠肉眼在 Obsidian 里点是
 * 覆盖不全的。这里用 esbuild 把 first-line-indent-rules.ts（纯函数、不 import
 * obsidian / CM6）打成一个 CJS 文件，在 Node 里直接跑断言。
 *
 * 期望值来源：`scripts/fixtures/first-line-indent.md` 的段落首行**取自
 * @codemirror/lang-markdown（@lezer/markdown，CommonMark+GFM 的参考实现）**
 * 对同一份夹具的解析结果（`Paragraph` 且父节点为 `Document`），不是从本实现
 * 反推的。三处**刻意的偏离**已在下方的 KNOWN_DEVIATIONS 里逐条注明理由。
 *
 * 另有 scripts/fixtures/first-line-indent-mechanism.html：用真实浏览器量
 * `text-indent` 的 line box 左边界，证明「纯 CSS 直接给 .cm-line 加
 * text-indent 会让硬换行段落的每一行都缩进」（实测每行 left 均为 46px），
 * 即本功能必须由 JS 判定段落边界。
 */

import esbuild from 'esbuild';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outfile = join(tmpdir(), 'mdrazor-first-line-indent-rules.cjs');

await esbuild.build({
	entryPoints: [join(root, 'src/controller/general/first-line-indent-rules.ts')],
	outfile,
	bundle: true,
	platform: 'node',
	format: 'cjs',
	target: 'node18',
	logLevel: 'warning',
});

const { textLineSource, findIndentableParagraphStarts } = await import(pathToFileURL(outfile).href);

/**
 * 与 @lezer/markdown 的刻意偏离（其余差异都算失败）：
 *   - 属性区（frontmatter）：参考实现不认 frontmatter，把 `---\n…\n---` 解析成
 *     分割线 + Setext 标题；Obsidian 认（阅读视图用 markdown-it 的 front matter
 *     插件，`^---\n[\s\S]*?\n---`），故属性区行一律不缩进。
 *   - `^block-id` 独占行：参考实现当作普通段落；Obsidian 渲染为不可见的块 ID，
 *     不缩进。
 *   - `%%注释%%` 独占行：参考实现当作普通段落；Obsidian 渲染为空，不缩进。
 *   - 表格末尾紧跟的不含 `|` 行：参考实现把它并入 Table；Obsidian 的 hypermd
 *     模式在行式不匹配时 `wU()` 复位表格（normal 模式行式 `fU = /^\|/`），
 *     表格就此结束、该行是新段落。
 *   - **空行也缩进**：参考实现里空行不产出 Paragraph，故不在判定结果中。但缩进
 *     是「视觉/光标」层面的需求 —— 回车新建的那一行是空的，不缩进的话光标会停在
 *     未缩进处、键入第一个字符才跳过去。空行按「它若变成正文行会不会是段落首行」
 *     判定（与正文行同一条规则）。**只影响空行的缩进，不改任何非空行的判定。**
 */
const KNOWN_DEVIATIONS = [
	'属性区行',
	'`^block-id` 独占行',
	'`%%注释%%` 独占行',
	'表格末尾紧跟的不含 `|` 行',
	'空行（段落首行位置的空行也缩进）',
];

const failures = [];
const check = (label, actual, expected) => {
	const a = JSON.stringify(actual);
	const e = JSON.stringify(expected);
	if (a === e) {
		console.log(`  PASS  ${label}`);
	} else {
		console.log(`  FAIL  ${label}\n        期望 ${e}\n        实得 ${a}`);
		failures.push(label);
	}
};

console.log('① 夹具（scripts/fixtures/first-line-indent.md）');
const fixture = readFileSync(join(root, 'scripts/fixtures/first-line-indent.md'), 'utf8');
const fixtureLines = fixture.split('\n');
const isBlankFixtureLine = (n) => (fixtureLines[n - 1] ?? '').trim() === '';
// 期望值 = 参考实现对同一夹具的判定（正文段落首行），减去 KNOWN_DEVIATIONS 中的四类行。
// 空行是新增的第 5 类偏离，逐行手写会非常脆，故夹具这一层改用**性质断言**：
// 参考实现判定过的行一个都不能丢；新增的只允许是空行；非严格结果必须包含严格结果。
const referenceStarts = [10, 13, 31, 98, 100, 105, 107, 109, 111, 114, 121, 123];
const strictStarts = findIndentableParagraphStarts(textLineSource(fixture));
check(
	'严格换行：参考实现判定过的段落首行一个都没丢',
	referenceStarts.every((n) => strictStarts.includes(n)),
	true,
);
check(
	'严格换行：新增的缩进行全部是空行（没有把标题/列表/表格/代码块等误判成正文段落）',
	strictStarts.every((n) => referenceStarts.includes(n) || isBlankFixtureLine(n)),
	true,
);
check(
	'严格换行：结果升序且无重复',
	strictStarts.every((n, i) => i === 0 || n > strictStarts[i - 1]),
	true,
);

// 非严格换行（Obsidian 默认）：单回车即硬换行 → 每个 text 行都是段落首行，
// 故非严格结果必然是严格结果的**超集**，且多出来的全是「同段续行」或空行。
const nonStrictStarts = findIndentableParagraphStarts(textLineSource(fixture), {
	nonStrictLineBreaks: true,
});
check(
	'非严格换行：包含严格换行的全部结果',
	strictStarts.every((n) => nonStrictStarts.includes(n)),
	true,
);
check(
	'非严格换行：多出来的是 3 处同段续行（L11 / L101 / L112）与空行',
	nonStrictStarts
		.filter((n) => !strictStarts.includes(n))
		.every((n) => [11, 101, 112].includes(n) || isBlankFixtureLine(n)),
	true,
);

console.log('\n② 内联用例（期望值同样取自参考实现，偏离见 KNOWN_DEVIATIONS）');
const cases = [
	['空文档（唯一那行是空行 → 也缩进，光标落点即未来首行位置）', '', [1]],
	['单段正文', '正文', [1]],
	['标题后正文', '# 标题\n正文', [2]],
	['属性区后正文（含属性区后的空行）', '---\ntitle: x\n---\n\n正文', [4, 5]],
	['未闭合的 --- 只是分割线', '---\n\n正文', [2, 3]],
	['列表的惰性续行不缩进', '- 项\n续行', []],
	['段落硬换行的续行不缩进', '正文第一行\n正文第二行', [1]],
	['四空格续行仍属同段', '正文\n    四空格缩进', [1]],
	['围栏代码块后的正文', '```\ncode\n```\n正文', [4]],
	['围栏代码块**内部**的空行不缩进', '```\n甲\n\n乙\n```\n正文', [6]],
	['单行段落 + --- 是 Setext 标题', '段落\n---', []],
	['多行段落 + --- 是 Setext 标题', '段落一\n段落二\n---', []],
	['callout 不缩进', '> [!note] x\n> y', []],
	['表格不缩进（段落被表格打断）', '正文\n| a | b |\n| --- | --- |\n| 1 | 2 |', [1]],
	['纯图片段落不缩进（其后的空行也不缩进：严格换行下紧随正文行）', '![[image.png]]\n\n正文', [3]],
	['数学块不缩进', '$$\nE = mc^2\n$$\n\n正文', [4, 5]],
	['脚注定义不缩进', '[^1]: 脚注定义\n\n正文', [2, 3]],
	['引用块后的正文', '> 引用\n\n正文', [2, 3]],
	['回车新建的空行在严格换行下不缩进（属同段软换行）', '甲段\n', [1]],
	['空行夹在两段正文之间（严格换行）不缩进', '甲段\n\n乙段', [1, 3]],
];
for (const [label, text, expected] of cases) {
	check(label, findIndentableParagraphStarts(textLineSource(text)), expected);
}

// ③ 非严格换行（Obsidian 默认设置：设置 → 编辑器 → 严格换行 = 关）
//    此时单个换行就是硬换行（阅读视图渲染成 <p>甲<br>乙</p>），「一行即一段」，
//    每个正文行都要缩进；块结构判定（列表/引用/代码/表格…）不变。
//    期望值来自 Obsidian 的渲染语义（app.js: globalOptions.breaks = !strictLineBreaks），
//    没有第三方参考实现可对拍 —— 这一层是 Obsidian 的选择，不是 CommonMark。
console.log('\n③ 非严格换行（单回车即新段落）');
const nonStrictCases = [
	['单回车分段：三行都缩进', '甲段\n乙段\n丙段', [1, 2, 3]],
	['空行分隔的段落同样都缩进（空行自己也是空段落）', '甲段\n\n乙段', [1, 2, 3]],
	['标题后正文缩进、列表后的空行段落也缩进', '# 标题\n甲段\n\n- 列表\n\n甲段', [2, 3, 5, 6]],
	['引用的惰性续行仍不缩进', '- 项\n续行\n\n> 引用\n续行\n\n甲段', [3, 6, 7]],
	['围栏代码块与表格仍不缩进', '```\ncode\n```\n甲段\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n乙段', [4, 5, 9]],
	['四空格续行在非严格模式下也是新行', '甲段\n    四空格缩进\n乙段', [1, 2, 3]],
	['图片段落仍不缩进', '![[image.png]]\n甲段', [2]],
	// 本 bug 的回归：回车后新建的空行必须带缩进，否则光标停在未缩进处、
	// 键入第一个字符才跳过去
	['回车新建的空行也缩进（光标对齐缩进）', '甲段\n', [1, 2]],
	['连按两次回车：两行空行都缩进', '甲段\n\n', [1, 2, 3]],
];
for (const [label, text, expected] of nonStrictCases) {
	check(label, findIndentableParagraphStarts(textLineSource(text), { nonStrictLineBreaks: true }), expected);
}

console.log(`\n刻意偏离参考实现：${KNOWN_DEVIATIONS.join(' / ')}`);
if (failures.length > 0) {
	console.log(`\n结果：FAIL（${failures.length} 条）`);
	process.exit(1);
}
console.log('\n结果：PASS');
