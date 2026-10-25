/**
 * MDRazor — 代码块语言标签（code-block-lang-scan.ts）离线回归
 *
 * 用法：`node scripts/verify-code-block-lang.mjs`（或 `npm run verify:code-block-lang`）
 *
 * 为什么需要它：code-block-lang-label 模块把 Unicode 语言词元填回 Obsidian
 * 原生的代码块右上角标签（.code-block-flair）。填什么、什么时候填，由
 * extractFenceLanguage 对围栏起始行的提取结果决定：token（Unicode 放宽词元）
 * 是要显示的完整词元，nativeToken（原生 B5 第 2 组的忠实复刻）代表原生标签
 * 当前的显示语义——调用方只在 token ≠ nativeToken 时补全（原生截断或为空），
 * token === nativeToken 时保持原生行为（含 js → JavaScript 的模式名映射）。
 *
 * 必须守住三条边界：
 *   1. nativeToken 必须与原生 B5 正则逐条一致（差分对照，抄录正则当参照）；
 *   2. 原生非空 ⟹ token 以 nativeToken 开头（同一条提取流水线的放宽，不偏移）；
 *   3. 原生为空 ⟹ token 要么为空（保持图标），要么首字符不在原生 ASCII
 *      词元字符集内——差异只允许落在原生显示图标的场景。
 *
 * 模块是零依赖纯函数，可离线驱动；原生 B5/dR 正则原样抄录作差分参照。
 */

import esbuild from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outfile = join(tmpdir(), 'mdrazor-code-block-lang-scan.cjs');

await esbuild.build({
	entryPoints: [join(root, 'src/controller/general/code-block-lang-scan.ts')],
	outfile,
	bundle: true,
	platform: 'node',
	format: 'cjs',
	target: 'node18',
	logLevel: 'warning',
});

const { extractFenceLanguage } = await import(pathToFileURL(outfile).href);

// ── 参照实现（Obsidian 原生正则原样抄录，仅用于差分对照）────────────────
// B5：原生围栏语言提取（app.js 反混淆）；dR：列表前缀（列表行先剥前缀再跑 B5）
const NATIVE_LIST_PREFIX = /^([>\s]*)(([*+-] |(\d+)([.)] ))(?:\[(.)\] )?)?/;
const NATIVE_B5 = /^\s*(~~~+|```+)[ \t]*([\w\/+#-]*)[^\n`]*$/;

/** 原生流水线：列表行剥 dR 前缀 → B5 第 2 捕获组（未作 findModeByName 映射） */
function nativeExtract(lineText) {
	const stripped = lineText.replace(NATIVE_LIST_PREFIX, '');
	return NATIVE_B5.exec(stripped)?.[2] ?? '';
}

// ── 断言工具 ────────────────────────────────────────────────────────────

let failures = 0;
function check(name, actual, expected) {
	const ok = actual === expected;
	if (!ok) {
		failures++;
		console.error(`✗ ${name}\n    期望: ${JSON.stringify(expected)}\n    实际: ${JSON.stringify(actual)}`);
	}
}

// ── 夹具表：[行文本, 期望 token（应显示）, 期望 nativeToken（原生语义）] ──
// nativeToken === token → 原生已完整显示，调用方不碰（保持映射等原生行为）
// nativeToken === ''    → 原生显示图标（纯中文 / 反引号 / 无语言名）
// 两者不等且均非空      → 原生截断（中英混杂），调用方补全为 token

const FIXTURES = [
	// 中英混杂（本次修复的核心缺陷：原生截断只显英文前缀）
	['```py中文', 'py中文', 'py'],
	['```js中文', 'js中文', 'js'],
	['```中文py', '中文py', ''],
	['```PY中文', 'PY中文', 'PY'],
	['```py_中文', 'py_中文', 'py_'],
	['```py中文 js', 'py中文', 'py'],
	['- ```py中文', 'py中文', 'py'],
	['```c++中文', 'c++中文', 'c++'],
	['```node.js', 'node.js', 'node'], // ASCII 词元也截断（. 在原生字符集外）
	// 纯中文（原生整个提取为空 → 图标）
	['```中文', '中文', ''],
	['```中文 js', '中文', ''],
	['``` 中文', '中文', ''],
	['~~~中文', '中文', ''],
	['`````中文', '中文', ''],
	['```中文语言', '中文语言', ''],
	['- ```中文', '中文', ''],
	['  - ```中文', '中文', ''],
	['- [x] ```中文', '中文', ''],
	['- [ ] ```中文', '中文', ''],
	['12. ```中文', '中文', ''],
	['  ```中文', '中文', ''],
	['\t~~~中文', '中文', ''],
	// 双方都为空：保持原生图标，不得给任何词元
	['```', '', ''],
	['``` ', '', ''],
	['``中文', '', ''], // 围栏不足 3 个
	['```中`文', '', ''], // 信息串含反引号（原生 B5 整体不匹配）
	['```中文```', '', ''],
	['``` 中文`x', '', ''],
	['```py`中', '', ''],
	// 纯 ASCII 词元（原生完整显示，token === nativeToken）
	['```python', 'python', 'python'],
	['```c++', 'c++', 'c++'],
	['```c#', 'c#', 'c#'],
	['```objective-c', 'objective-c', 'objective-c'],
	['``` js', 'js', 'js'],
	['~~~js', 'js', 'js'],
	['- ```python', 'python', 'python'],
	['  - [x] ```python', 'python', 'python'],
	['12. ```python', 'python', 'python'],
	['  ```python', 'python', 'python'],
	['```python 中文 meta', 'python', 'python'],
	['```py th', 'py', 'py'],
	['``````js', 'js', 'js'],
	// 原生截断的 ASCII 词元（同属「截断补全」范畴）
	['```py.th', 'py.th', 'py'],
];

const NATIVE_CHARSET_START = /^[\w\/+#-]/;

for (const [text, expectedToken, expectedNative] of FIXTURES) {
	const { token, nativeToken } = extractFenceLanguage(text);

	// 1. 期望值逐条断言
	check(`token ${JSON.stringify(text)}`, token, expectedToken);
	check(`nativeToken ${JSON.stringify(text)}`, nativeToken, expectedNative);

	// 2. 差分：模块的 nativeToken 必须与脚本内抄录的原生 B5 逐条一致
	check(`nativeToken 差分 ${JSON.stringify(text)}`, nativeToken, nativeExtract(text));

	// 3. 边界二：原生非空 ⟹ token 以原生词元开头（同一条流水线的放宽）
	if (nativeToken !== '' && !token.startsWith(nativeToken)) {
		failures++;
		console.error(
			`✗ 词元偏离原生 ${JSON.stringify(text)}（native=${JSON.stringify(nativeToken)} token=${JSON.stringify(token)}）`,
		);
	}

	// 4. 边界三：原生为空 ⟹ token 为空或首字符在原生 ASCII 词元字符集之外
	//   （差异只允许落在原生显示图标的场景，不得改变任何原生行为）
	if (nativeToken === '' && token !== '' && NATIVE_CHARSET_START.test(token)) {
		failures++;
		console.error(
			`✗ 行为越界 ${JSON.stringify(text)}：原生为空但 token 以 ASCII 词元字符开头 ${JSON.stringify(token)}`,
		);
	}

	// 5. 幂等：补丁路径依赖重扫幂等
	const second = extractFenceLanguage(text);
	if (second.token !== token || second.nativeToken !== nativeToken) {
		failures++;
		console.error(`✗ 提取不幂等 ${JSON.stringify(text)}`);
	}
}

if (failures > 0) {
	console.error(`\n共 ${failures} 项失败`);
	process.exit(1);
}
console.log(`✓ 代码块语言词元提取：${FIXTURES.length} 条夹具全部通过（中英混杂 / 纯中文 / 保持空 / ASCII 差分 / 行为边界 / 幂等）`);
