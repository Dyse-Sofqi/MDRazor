/**
 * MDRazor — 隐藏标记「光标可见性保护」离线回归
 *
 * 用法：`node scripts/verify-caret-reveal.mjs`（或 `npm run verify:caret`）
 *
 * 为什么需要它：format-hider 的「始终隐藏」把标记从 DOM 里抹掉后，折叠
 * 光标可能落在**没有任何可见文本**的位置——①在一条隐藏区间内部（行首键入
 * 反引号时 Obsidian 自动配对插入一对、解析器把整段反引号建成一条节点，
 * 光标正好在区间中间），或 ②夹在两条相邻隐藏区间之间。此时 DOM 里没有
 * 文本可承载光标，Chromium 会把 DOM 光标规范化到占位元素之后、CM6 状态
 * 光标却停在原位，两者分叉后每个键入字符都插到同一位置：字符落到标记
 * 之外并逐键倒序（实测 `doc="``" pos=1` 键入 123 得到 `"``321"`、光标
 * 停在 1、提示持续显示 `` `|` ``）。caret-reveal.ts 的规则决定「哪些装饰
 * 在光标处放开」，这里以区间夹具直接断言。
 *
 * 夹具期望值以语义为准（与实现无关的部分）：
 *   - 光标在区间内部（from < caret < to）或夹在两条相邻区间之间
 *     （A.to === caret === B.from）→ 放开全部「盖住 / 夹住光标」的区间；
 *   - 其余状态（单侧贴邻、光标在行首/行尾、非折叠选区、空集合）一律原样。
 *
 * 真实 CM6 端到端验证（浏览器实测，含真实键盘与 execCommand 两条输入路径，
 * 语法树按「反引号整段一条节点」构造）：修复后在上述两种状态下键入
 * `123` 均得到 `` `1` `` → `` `12` `` → `` `123` ``，且插入后标记立即
 * 恢复隐藏；其余位置的输入落点与修复前一致（无回归）。
 */

import esbuild from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outfile = join(tmpdir(), 'mdrazor-caret-reveal.cjs');

await esbuild.build({
	entryPoints: [join(root, 'src/controller/format-hider/caret-reveal.ts')],
	outfile,
	bundle: true,
	platform: 'node',
	format: 'cjs',
	target: 'node18',
	logLevel: 'warning',
});

const { isCaretObscured, revealCaretRanges } = await import(pathToFileURL(outfile).href);

// ── 断言 ─────────────────────────────────────────────────────────────────

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

/** 区间数组 → [[from,to],…] 便于断言 */
const rangesOf = (v) => v.map((r) => [r.from, r.to]);

/** 构造区间夹具（可带额外字段，用于验证泛型保留） */
const R = (from, to, extra) => ({ from, to, ...(extra ?? {}) });

console.log('① 光标在单条隐藏区间内部（行首自动配对的 ``，整段一条节点）');
check('isCaretObscured：`` 区间 [0,2)、光标 1', isCaretObscured([R(0, 2)], 1), true);
check(
	'`` 区间 [0,2)、光标 1 → 放开该区间',
	rangesOf(revealCaretRanges([R(0, 2)], 1)),
	[],
);
check(
	'`` 区间 [0,2) + 远处区间 [5,6)：光标 1 → 只放开被盖住的那条',
	rangesOf(revealCaretRanges([R(0, 2), R(5, 6)], 1)),
	[[5, 6]],
);
check('光标在区间左端点 0（不是内部）→ 不变', rangesOf(revealCaretRanges([R(0, 2)], 0)), [[0, 2]]);
check('光标在区间右端点 2（不是内部）→ 不变', rangesOf(revealCaretRanges([R(0, 2)], 2)), [[0, 2]]);
check('长标记区间 [0,6)、光标 3（中间）→ 放开', rangesOf(revealCaretRanges([R(0, 6)], 3)), []);

console.log('② 光标夹在两条相邻隐藏区间之间（空格式单元拆成两条标记）');
check('HTML 标签接壤 </font><font>：光标 1 → 不放开（保持隐藏）', isCaretObscured([R(0, 1, { spec: { hideAsMark: true } }), R(1, 2, { spec: { hideAsMark: true } })], 1), false);
check('HTML 标签接壤 </font><font>：光标 1 → 原样保留', rangesOf(revealCaretRanges([R(0, 1, { spec: { hideAsMark: true } }), R(1, 2, { spec: { hideAsMark: true } })], 1)), [[0, 1], [1, 2]]);
check('isCaretObscured：`` 拆两条 [0,1)[1,2)、光标 1', isCaretObscured([R(0, 1), R(1, 2)], 1), true);
check('`` 拆两条、光标 1 → 两条全部放开', rangesOf(revealCaretRanges([R(0, 1), R(1, 2)], 1)), []);
check('空加粗 **** 两条 [0,2)[2,4)、光标 2 → 两条全部放开', rangesOf(revealCaretRanges([R(0, 2), R(2, 4)], 2)), []);
check(
	'嵌套 *** 两条 [0,2)[2,3)、光标 2 → 两条全部放开',
	rangesOf(revealCaretRanges([R(0, 2), R(2, 3)], 2)),
	[],
);
check(
	'相邻两个空单元（`` + 远处一对）：光标 1 → 只放开贴缝的两条',
	rangesOf(revealCaretRanges([R(0, 1), R(1, 2), R(3, 4), R(4, 5)], 1)),
	[[3, 4], [4, 5]],
);

console.log('③ 非遮盖状态一律原样（无回归）');
check('单侧贴邻：`` 拆两条、光标 0（行首）', rangesOf(revealCaretRanges([R(0, 1), R(1, 2)], 0)), [[0, 1], [1, 2]]);
check('单侧贴邻：`` 拆两条、光标 2（行尾）', rangesOf(revealCaretRanges([R(0, 1), R(1, 2)], 2)), [[0, 1], [1, 2]]);
check(
	'非空行内代码 `ab`：光标 0 / 1 / 2 / 3 / 4 全部不变',
	[0, 1, 2, 3, 4].map((p) => rangesOf(revealCaretRanges([R(0, 1), R(3, 4)], p))),
	Array.from({ length: 5 }, () => [[0, 1], [3, 4]]),
);
check('非折叠选区（caret=null）：不变', rangesOf(revealCaretRanges([R(0, 2)], null)), [[0, 2]]);
check('空集合：不变', rangesOf(revealCaretRanges([], 1)), []);
check('isCaretObscured：no 集合 / null', [isCaretObscured([], 1), isCaretObscured([R(0, 2)], null)], [false, false]);

console.log('④ 无遮盖时不产生分配（返回入参本身）');
{
	const same = [R(0, 1), R(3, 4)];
	check('返回同一引用', revealCaretRanges(same, 1) === same, true);
}

console.log('⑤ 泛型保留条目其余字段（spec 等）');
{
	check('放开后不残留条目', revealCaretRanges([R(0, 2, { spec: { hideAsMark: true } })], 1).length, 0);
	const kept = revealCaretRanges([R(0, 1, { spec: {} }), R(3, 4, { spec: { hideAsMark: true } })], 1);
	check('保留条目字段原样', kept.map((e) => e.spec), [{}, { hideAsMark: true }]);
}

console.log(failures.length === 0
	? '\n全部通过。'
	: `\n${failures.length} 项失败：\n  - ${failures.join('\n  - ')}`);
process.exitCode = failures.length === 0 ? 0 : 1;
