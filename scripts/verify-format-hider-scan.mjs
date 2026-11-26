/**
 * MDRazor — HTML 标签扫描（html-tag-scan.ts）离线回归
 *
 * 用法：`node scripts/verify-format-hider-scan.mjs`（或 `npm run verify:format-hider-scan`）
 *
 * 为什么需要它：format-hider 的整篇收集阶段每次 ViewUpdate 都会跑，其中
 * 「排除区段 ∩ 标签匹配」的判定原先写成对每条匹配遍历整个 exclusions 数组
 * （`exclusions.some(...)`）。那是 O(匹配数 × 排除数)：实测 8 万字、1056 个
 * `<span>`、4526 条排除区间时单次调用 24.9ms，而线性实现 0.6ms —— 差约 40 倍，
 * 且随「行内代码数 × HTML 标签数」平方增长。行内代码多、又带 HTML 标签的文档
 * 因此每帧都要几百毫秒，而纯文本文档（0 标签、0 排除）完全没有开销 —— 这正是
 * 「十几万字的书没问题、8 万字的笔记卡到不能用」的成因（详见 DEBUGLOG）。
 *
 * 优化必须**逐条输出不变**，否则会静默改变「哪些标签被隐藏」。本脚本对
 * 两个被改写的函数做**差分测试**：把旧实现原样抄进来当参照，对同一批夹具
 * 断言新旧输出完全一致；另附线性度与配对语义的断言。
 *
 * 模块只依赖 `@codemirror/state` 的 Text（纯数据、可在 Node 里直接构造），
 * 故可离线驱动。
 */

import esbuild from 'esbuild';
import { Text } from '@codemirror/state';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outfile = join(tmpdir(), 'mdrazor-html-tag-scan.cjs');

await esbuild.build({
	entryPoints: [join(root, 'src/controller/format-hider/html-tag-scan.ts')],
	outfile,
	bundle: true,
	platform: 'node',
	format: 'cjs',
	target: 'node18',
	logLevel: 'warning',
});

const { collectFenceRanges, collectHtmlBlockRanges, collectPairedHtmlTags, collectPairedOtherHtmlTags } = await import(pathToFileURL(outfile).href);

// ── 参照实现（改写前的原样抄录，仅用于差分对照）─────────────────────────

function oldFenceRanges(doc) {
	const ranges = [];
	let inFence = false;
	let fenceFrom = 0;
	for (let i = 1; i <= doc.lines; i++) {
		const line = doc.line(i);
		if (/^\s*(?:```+|~~~+)/.test(line.text)) {
			if (!inFence) {
				inFence = true;
				fenceFrom = line.from;
			} else {
				ranges.push({ from: fenceFrom, to: line.to });
				inFence = false;
			}
		}
	}
	if (inFence) {
		ranges.push({ from: fenceFrom, to: doc.line(doc.lines).to });
	}
	return ranges;
}

/**
 * 参照实现（仅用于差分对照）。
 *
 * 排除判定保留**改写前**的 `exclusions.some()`（O(匹配数 × 排除数)）——
 * 差分测试要守的正是这条性能重构（单游标推进）不改变输出。
 *
 * 配对语义在「栈式配对」修复后与线上一致：此处参照同样用栈式，否则随机
 * 夹具里的孤立闭标签 / 交叉配对会让两侧语义不同而误报。配对规则本身由
 * ③ 区的语义断言专门覆盖（与实现无关）。
 */
function oldCollectPairedHtmlTags(docStr, tagPattern, exclusions = []) {
	tagPattern.lastIndex = 0;
	let m;
	const paired = [];
	const openStack = [];
	while ((m = tagPattern.exec(docStr)) !== null) {
		if (/\/\s*>$/.test(m[0])) continue; // 自闭合写法无闭标签
		const from = m.index;
		const to = from + m[0].length;
		const inExcluded = exclusions.some((r) => from < r.to && to > r.from);
		if (inExcluded) continue;
		if (m[0].charAt(1) === '/') {
			const open = openStack.pop();
			if (open) paired.push(open, { from, to, isClose: true });
		} else {
			openStack.push({ from, to, isClose: false });
		}
	}
	return paired.sort((a, b) => a.from - b.from);
}

// ── 断言框架 ─────────────────────────────────────────────────────────────

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

const doc = (str) => Text.of(str.split('\n'));
const SPAN_RE = /<span(?:\s[^>]*)?>|<\/span\s*>/gi;

/* ═══ ① collectFenceRanges：与旧逐行实现逐条相同 ═══ */

console.log('① collectFenceRanges 差分对照（旧：doc.line(i) 逐行）');
{
	const cases = {
		'无围栏': '正文一\n正文二\n正文三',
		'一对围栏': '正文\n```js\nconst a = 1;\n```\n正文',
		'未闭合围栏': '正文\n```js\nconst a = 1;\n还没关',
		'行首缩进围栏': '正文\n   ```\n内容\n   ```\n正文',
		'波浪号围栏': '正文\n~~~\n内容\n~~~\n正文',
		'多对围栏混排': '```\na\n```\n正文\n~~~\nb\n~~~\n```\n未闭合',
		'首行即围栏': '```\n内容\n```',
		'末行是围栏开始': '正文\n```',
		'空文档': '',
		'仅一个空行': '\n',
		'四个反引号': '正文\n````\n内容\n````\n正文',
		'围栏内含反引号行': '```\n``\n```',
		'制表符缩进围栏': '正文\n\t```\n内容\n\t```',
		'行中出现反引号不算围栏': '正文 a ``` b\n```\n内容\n```',
	};
	for (const [label, src] of Object.entries(cases)) {
		const d = doc(src);
		check(label, collectFenceRanges(d), oldFenceRanges(d));
	}
}

/* ═══ ② collectPairedHtmlTags 差分对照（随机夹具） ═══ */

console.log('② collectPairedHtmlTags 差分对照（随机文档 × 随机排除区间）');

// 固定种子的线性同余伪随机：保证每次运行夹具一致
let seed = 0x9e3779b9;
const rnd = (n) => {
	seed = (seed * 1103515245 + 12345) & 0x7fffffff;
	return seed % n;
};

const TAG_POOL = ['<span>', '<span style="color:#c00">', '</span>', '`code`', '普通文字', '\n', '> 引用'];

function randomDoc() {
	let s = '';
	const n = 20 + rnd(80);
	for (let i = 0; i < n; i++) s += TAG_POOL[rnd(TAG_POOL.length)];
	return s;
}

/** 随机排除区间：故意**不排序**、允许重叠与空区间（from === to），逼近真实输入的恶劣情况 */
function randomExclusions(len) {
	const arr = [];
	for (let i = 0; i < len; i++) {
		const from = rnd(len + 1);
		arr.push({ from, to: from + rnd(6) });
	}
	return arr;
}

{
	let mismatch = 0;
	let checked = 0;
	for (let round = 0; round < 400; round++) {
		const docStr = randomDoc();
		const exclusions = randomExclusions(Math.max(0, docStr.length));
		const expect = oldCollectPairedHtmlTags(docStr, SPAN_RE, exclusions);
		const actual = collectPairedHtmlTags(docStr, SPAN_RE, exclusions);
		checked++;
		if (JSON.stringify(expect) !== JSON.stringify(actual)) {
			mismatch++;
			if (mismatch === 1) {
				console.log(`  FAIL  首例不一致 docStr=${JSON.stringify(docStr)}`);
				console.log(`        期望 ${JSON.stringify(expect)}`);
				console.log(`        实得 ${JSON.stringify(actual)}`);
			}
		}
	}
	check(`随机夹具 ${checked} 轮逐条一致（含未排序/重叠/空区间排除）`, mismatch, 0);
}

{
	// 已排序输入同样要一致
	let mismatch = 0;
	for (let round = 0; round < 200; round++) {
		const docStr = randomDoc();
		const exclusions = randomExclusions(Math.max(0, docStr.length)).sort((a, b) => a.from - b.from);
		if (
			JSON.stringify(oldCollectPairedHtmlTags(docStr, SPAN_RE, exclusions)) !==
			JSON.stringify(collectPairedHtmlTags(docStr, SPAN_RE, exclusions))
		) {
			mismatch++;
		}
	}
	check('已排序排除区间 200 轮逐条一致', mismatch, 0);
}

/* ═══ ③ 配对语义（与实现无关的语义断言） ═══ */

console.log('③ 配对语义');
{
	const d = '<span>甲</span><span>乙';
	check('缺闭标签的那一对不隐藏（只保留配成对的）', collectPairedHtmlTags(d, SPAN_RE).length, 2);
	const d2 = '</span>孤立的闭标签';
	check('孤立闭标签不隐藏', collectPairedHtmlTags(d2, SPAN_RE).length, 0);
	const d3 = '<span>甲</span>';
	check('完整一对：开 + 闭', collectPairedHtmlTags(d3, SPAN_RE), [
		{ from: 0, to: 6, isClose: false },
		{ from: 7, to: 14, isClose: true },
	]);
	const d4 = '`<span>`';
	check(
		'排除区间覆盖整段时全部跳过',
		collectPairedHtmlTags(d4, SPAN_RE, [{ from: 0, to: d4.length }]),
		[],
	);
	check(
		'排除区间与匹配端点相接（不重叠）不算命中',
		collectPairedHtmlTags(d4, SPAN_RE, [{ from: 1, to: 7 }]),
		[],
	);
	check(
		'排除区间恰好结束于匹配起点：不算命中',
		collectPairedHtmlTags('<span>', SPAN_RE, [{ from: 0, to: 0 }]),
		[],
	);
	check('空排除数组：行为等同不排除', collectPairedHtmlTags('<span>', SPAN_RE), []);

	// 自闭合写法没有闭标签，不应占用配对名额：否则它会排在同名开标签前面、
	// 把后面真正的闭标签配走，令真正的开标签配不上对而保持可见 —— 表现为
	// 「文档别处有个自闭合标签，这边的标签隐藏就失败了」（实测案例：测试文档
	// 第 3 节 <span data-x="1"/> 偷配了第 7 节唯一的 </span>）。
	const d5 = '<span data-x="1"/>正文<span style="color:red">文字</span>';
	const r5 = collectPairedHtmlTags(d5, SPAN_RE);
	check(
		'自闭合标签不占名额：后面真正的对照样隐藏',
		r5.map((r) => d5.slice(r.from, r.to)),
		['<span style="color:red">', '</span>'],
	);
	check('自闭合标签自身不被隐藏', r5.some((r) => d5.slice(r.from, r.to).includes('data-x')), false);
	check(
		'仅剩自闭合标签时无任何隐藏',
		collectPairedHtmlTags('<span a="1" />和<span/>', SPAN_RE),
		[],
	);

	// ── 栈式配对：孤立闭标签不得偷配后面的开标签 ──
	// 旧实现按序 opens[i]↔closes[i]：会把 </span>@0 与 <span>@9 配成一对，
	// 行尾真正的 </span> 反而露着。
	const s1 = '</span>文字<span>甲</span>';
	check(
		'文档前部的孤立闭标签不偷配（真正的那一对隐藏）',
		collectPairedHtmlTags(s1, SPAN_RE),
		[
			{ from: 9, to: 15, isClose: false },
			{ from: 16, to: 23, isClose: true },
		],
	);
	// 嵌套：闭标签配最近的开标签（内层），外层开标签未闭合 → 保持可见
	const s2 = '<span>甲<span>乙</span>';
	check(
		'嵌套时闭标签配最近的开标签，未闭合的外层保持可见',
		collectPairedHtmlTags(s2, SPAN_RE),
		[
			{ from: 7, to: 13, isClose: false },
			{ from: 14, to: 21, isClose: true },
		],
	);
	// 多出的闭标签：只配第一对，多余的保持可见
	const s3 = '<span>甲</span></span>';
	check(
		'多余的闭标签保持可见，只隐藏配成对的部分',
		collectPairedHtmlTags(s3, SPAN_RE),
		[
			{ from: 0, to: 6, isClose: false },
			{ from: 7, to: 14, isClose: true },
		],
	);
	// 完整两对：顺序与旧实现一致（回归保护）
	const s4 = '<span>甲</span><span>乙</span>';
	check(
		'完整两对按 from 升序全部隐藏',
		collectPairedHtmlTags(s4, SPAN_RE),
		[
			{ from: 0, to: 6, isClose: false },
			{ from: 7, to: 14, isClose: true },
			{ from: 14, to: 20, isClose: false },
			{ from: 21, to: 28, isClose: true },
		],
	);
}

/* ═══ ④ 线性度：排除区间数量放大后成本不得按乘法增长 ═══ */

console.log('④ 线性度（固定标签数，放大排除区间数）');
{
	// 夹具刻意让排除区间与标签匹配**互不相交**，这样旧实现的 `exclusions.some()`
	// 必须把整个数组走完才能判定「不相交」，无法靠提前命中退出 —— 正好暴露
	// O(匹配数 × 排除数)。新实现用单游标，游标只前进不回退。
	//
	// 形态贴近真实文档：一段 HTML 标签、一段行内代码交替出现，排除区间即
	// 行内代码所在范围（collectSpanExclusions 的输出量级）。
	const build = (segments) => {
		const parts = [];
		const exclusions = [];
		let pos = 0;
		for (let i = 0; i < segments; i++) {
			const tag = `<span style="color:#c00000">第${i}段文字</span>`;
			parts.push(tag);
			pos += tag.length;
			const code = `调用 \`fn${i}()\` 返回 \`R${i}\`。`;
			parts.push(code);
			// 两个行内代码的排除区间（与上方 span 不重叠）
			const a = code.indexOf('`');
			exclusions.push({ from: pos + a, to: pos + a + 1 });
			const b = code.lastIndexOf('`');
			exclusions.push({ from: pos + b - 1, to: pos + b });
			pos += code.length;
			parts.push('\n');
			pos += 1;
		}
		return { docStr: parts.join(''), exclusions };
	};

	const time = (fn, n) => {
		fn();
		const t0 = process.hrtime.bigint();
		for (let k = 0; k < n; k++) fn();
		return Number(process.hrtime.bigint() - t0) / 1e6 / n;
	};

	const small = build(500);
	const large = build(4000);
	const oldSmall = time(() => oldCollectPairedHtmlTags(small.docStr, SPAN_RE, small.exclusions), 3);
	const oldLarge = time(() => oldCollectPairedHtmlTags(large.docStr, SPAN_RE, large.exclusions), 3);
	const newSmall = time(() => collectPairedHtmlTags(small.docStr, SPAN_RE, small.exclusions), 3);
	const newLarge = time(() => collectPairedHtmlTags(large.docStr, SPAN_RE, large.exclusions), 3);

	console.log(`  ${'规模'.padEnd(22)} ${'排除区间'.padStart(9)} ${'旧实现'.padStart(10)} ${'新实现'.padStart(10)}`);
	console.log(`  ${'500 段'.padEnd(20)} ${String(small.exclusions.length).padStart(9)} ${(oldSmall.toFixed(2) + 'ms').padStart(10)} ${(newSmall.toFixed(2) + 'ms').padStart(10)}`);
	console.log(`  ${'4000 段（8×）'.padEnd(19)} ${String(large.exclusions.length).padStart(9)} ${(oldLarge.toFixed(2) + 'ms').padStart(10)} ${(newLarge.toFixed(2) + 'ms').padStart(10)}`);
	console.log(`  成本增长倍数：旧 ${(oldLarge / oldSmall).toFixed(1)}×（应接近 64×，即 O(匹配×排除)）  新 ${(newLarge / newSmall).toFixed(1)}×（应接近 8×，即 O(匹配+排除)）`);

	check('新旧结果仍逐条一致（小夹具）',
		JSON.stringify(collectPairedHtmlTags(small.docStr, SPAN_RE, small.exclusions)),
		JSON.stringify(oldCollectPairedHtmlTags(small.docStr, SPAN_RE, small.exclusions)));
	check('新旧结果仍逐条一致（大夹具）',
		JSON.stringify(collectPairedHtmlTags(large.docStr, SPAN_RE, large.exclusions)),
		JSON.stringify(oldCollectPairedHtmlTags(large.docStr, SPAN_RE, large.exclusions)));
	// 旧实现是平方增长：规模 8× 时耗时应涨到数十倍。新实现应显著更平缓。
	check('新实现增长倍数 < 旧实现的一半', newLarge / newSmall < (oldLarge / oldSmall) / 2, true);
	check('大夹具下新实现 < 10ms', newLarge < 10, true);
}

/* ═══ ⑤ collectPairedOtherHtmlTags 配对与排除语义 ═══ */

console.log('⑤ collectPairedOtherHtmlTags 配对与排除语义');
{
	const d1 = '<b>粗体</b><i>斜体</i>';
	check('多类型标签各自配对成对隐藏', collectPairedOtherHtmlTags(d1), [
		{ from: 0, to: 3, isClose: false },
		{ from: 5, to: 9, isClose: true },
		{ from: 9, to: 12, isClose: false },
		{ from: 14, to: 18, isClose: true },
	]);

	const d2 = '<b><i>嵌套</i></b>';
	check('嵌套标签正确成对隐藏', collectPairedOtherHtmlTags(d2), [
		{ from: 0, to: 3, isClose: false },
		{ from: 3, to: 6, isClose: false },
		{ from: 8, to: 12, isClose: true },
		{ from: 12, to: 16, isClose: true },
	]);

	const d3 = '<b>未闭合 <mark>高亮</mark>';
	check('未闭合标签不隐藏，成对标签正常隐藏', collectPairedOtherHtmlTags(d3), [
		{ from: 7, to: 13, isClose: false },
		{ from: 15, to: 22, isClose: true },
	]);

	const d4 = '<font color="#fff">颜色</font><u>下划线</u><span>行</span><kbd>键</kbd>';
	check('默认忽略 font、u、span 标签', collectPairedOtherHtmlTags(d4), [
		{ from: 52, to: 57, isClose: false },
		{ from: 58, to: 64, isClose: true },
	]);

	const d5 = '<br>换行<hr><img src="a.png" /><div class="box">盒子</div>';
	check('void 标签与自闭合标签跳过，div 标签正常配对', collectPairedOtherHtmlTags(d5), [
		{ from: 29, to: 46, isClose: false },
		{ from: 48, to: 54, isClose: true },
	]);

	const d6 = '<KBD>按键</kbd>';
	check('大小写不敏感匹配', collectPairedOtherHtmlTags(d6), [
		{ from: 0, to: 5, isClose: false },
		{ from: 7, to: 13, isClose: true },
	]);

	const d7 = '`<b>字面代码</b>` <p>段落</p>';
	const exclusions = [{ from: 0, to: 12 }]; // 代码区间
	check('排除区间内的标签跳过', collectPairedOtherHtmlTags(d7, exclusions), [
		{ from: 14, to: 17, isClose: false },
		{ from: 19, to: 23, isClose: true },
	]);
}

/* ═══ ⑥ collectHtmlBlockRanges HTML 渲染块排除语义 ═══ */

console.log('⑥ collectHtmlBlockRanges HTML 渲染块排除语义');
{
	const FONT_RE = /<font\s+color="#[a-fA-F0-9]{3,8}"[^>]*>|<\/font\s*>/g;
	const U_RE = /<\/?u\s*>/gi;

	const src = [
		'正文里的<font color="#c00000">红字</font>与<u>下划线</u>',
		'<span style="color:blue">整行内联span</span>',
		'<br>',
		'紧跟br后的<font color="#00aa00">绿字</font>',
		'',
		'<div class="card">',
		'  <p>块内<span style="color:red">文字</span>和<font color="#c00000">色</font>和<u>下</u></p>',
		'</div>',
		'',
		'<style>',
		'.a { color: red; }',
		'',
		'.b { color: blue; }',
		'</style>',
		'',
		'```html',
		'<div>围栏内的不触发HTML块</div>',
		'```',
		'围栏后<b>正常内联</b>',
	].join('\n');

	const htmlBlocks = collectHtmlBlockRanges(doc(src));
	const excludedTexts = htmlBlocks.map((r) => src.slice(r.from, r.to));
	check('仅命中 <br>、<div> 块与 <style> 跨空行块', excludedTexts, [
		'<br>',
		'<div class="card">\n  <p>块内<span style="color:red">文字</span>和<font color="#c00000">色</font>和<u>下</u></p>\n</div>',
		'<style>\n.a { color: red; }\n\n.b { color: blue; }\n</style>',
	]);

	const allExclusions = [...collectFenceRanges(doc(src)), ...htmlBlocks].sort((a, b) => a.from - b.from);
	check(
		'HTML 块内的 font 不隐藏，正文与 br 后的 font 正常隐藏',
		collectPairedHtmlTags(src, FONT_RE, allExclusions).map((r) => src.slice(r.from, r.to)),
		['<font color="#c00000">', '</font>', '<font color="#00aa00">', '</font>'],
	);
	check(
		'HTML 块内的 u 不隐藏，正文 u 正常隐藏',
		collectPairedHtmlTags(src, U_RE, allExclusions).map((r) => src.slice(r.from, r.to)),
		['<u>', '</u>'],
	);
	check(
		'HTML 块内的 span 不隐藏，整行内联 span 正常隐藏',
		collectPairedHtmlTags(src, SPAN_RE, allExclusions).map((r) => src.slice(r.from, r.to)),
		['<span style="color:blue">', '</span>'],
	);
	check(
		'HTML 块与围栏内的其他标签不隐藏，正文内联 b 正常隐藏',
		collectPairedOtherHtmlTags(src, allExclusions).map((r) => src.slice(r.from, r.to)),
		['<b>', '</b>'],
	);
}

console.log(
	failures.length === 0
		? '\n全部通过。'
		: `\n${failures.length} 项失败：\n  - ${failures.join('\n  - ')}`,
);
process.exitCode = failures.length === 0 ? 0 : 1;
