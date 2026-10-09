/**
 * MDRazor — 选项聚焦「滚动策略」离线回归
 *
 * 用法：`node scripts/verify-focus-scroll.mjs`（或 `npm run verify:focus-scroll`）
 *
 * 为什么需要它：这条链路很薄，但有两处「错了也不报错」的地方：
 *   1. **互斥优先级** —— 「滚轴固定」与「滚轴同步」互斥。运行时
 *      （focus-options.ts）、设置加载归一（settings-storage.ts）与设置面板
 *      三处都依赖「两者同时为真时以固定为准」这条规则；只要有一处反了，
 *      用户就会看到两种滚动策略互相打架（或旧数据升级后行为不一致）。
 *   2. **固定位置的夹取** —— 「滚轴固定」把光标当前的视口偏移直接当作
 *      scrollIntoView 的 yMargin。若不做夹取，光标原本在视口外时（键盘移动
 *      后视口尚未跟上等）会把它顶得更远，正是本功能要杜绝的「光标落出
 *      界面外」。这里锁死两条边界：贴顶（0）与贴底（viewportHeight - 行高）。
 *
 * focus-scroll.ts 不依赖 CM6 / DOM，打成 CJS 后在 Node 里直接跑断言。
 */

import esbuild from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outfile = join(tmpdir(), 'mdrazor-focus-scroll.cjs');

await esbuild.build({
	entryPoints: [join(root, 'src/controller/list-enhancer/focus-scroll.ts')],
	outfile,
	bundle: true,
	platform: 'node',
	format: 'cjs',
	target: 'node18',
	logLevel: 'warning',
});

const { resolveFocusScrollMode, computePinMargin } = await import(pathToFileURL(outfile).href);

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

console.log('① 滚动策略：互斥优先级（固定 > 同步 > 不动）');
{
	check('两者都开 → 固定', resolveFocusScrollMode({ focusScrollPin: true, focusScrollSync: true }), 'pin');
	check('只开固定 → 固定', resolveFocusScrollMode({ focusScrollPin: true, focusScrollSync: false }), 'pin');
	check('只开同步 → 同步', resolveFocusScrollMode({ focusScrollPin: false, focusScrollSync: true }), 'sync');
	check('两者都关 → 不动', resolveFocusScrollMode({ focusScrollPin: false, focusScrollSync: false }), 'none');
}

console.log('\n② 滚轴固定：光标视口偏移的夹取');
{
	// 光标在视口内 → 原样返回（这就是「固定」：折叠后回到同一屏幕位置）
	check('视口内（上边 500、容器顶 100）→ 400',
		computePinMargin(500, 520, 100, 600), 400);
	// 光标在视口上方 → 贴顶
	check('视口上方（上边 50、容器顶 100）→ 0',
		computePinMargin(50, 70, 100, 600), 0);
	check('恰在容器顶（上边 100）→ 0',
		computePinMargin(100, 120, 100, 600), 0);
	// 光标在视口下方 → 贴底（整行仍可见）
	check('视口下方（上边 900、容器顶 100）→ 580',
		computePinMargin(900, 920, 100, 600), 580);
	check('恰在容器底（上边 680、行高 20）→ 580（下边 700 = 容器底，仍可见）',
		computePinMargin(680, 700, 100, 600), 580);
	// 行高大于视口（极窄视口 / 大字号）→ 退化为贴顶，不出现负值
	check('行高 > 视口（行高 700、视口 600）→ 0',
		computePinMargin(200, 900, 100, 600), 0);
	// 折叠光标（零高矩形）不应被当作「行高 0 → 可贴任意位置」以外的东西
	check('零高矩形（上边 = 下边 = 300）→ 200',
		computePinMargin(300, 300, 100, 600), 200);
	// 视口为 0（尚未测量）→ 贴顶
	check('视口高 0 → 0', computePinMargin(500, 520, 100, 0), 0);
}

console.log('\n③ 反例守卫：不做夹取时下方光标会被顶出视口');
{
	// 直接照抄「把原始偏移当 yMargin」的错误做法，证明它必然把光标顶出视口；
	// 而 computePinMargin 的返回值必须落在视口内。这条守卫保证回归对「漏夹取」
	// 这一退化敏感 —— 若哪天把夹取删掉，② 的边界用例会立刻变红。
	const scrollTop = 100;
	const viewportHeight = 600;
	const cursorTop = 900;
	const cursorBottom = 920;
	const rawOffset = cursorTop - scrollTop; // 800
	const margin = computePinMargin(cursorTop, cursorBottom, scrollTop, viewportHeight);
	check('原始偏移确实超出视口（反例前提成立）', rawOffset > viewportHeight, true);
	check('夹取后光标下边不越过视口底',
		scrollTop + margin + (cursorBottom - cursorTop) <= scrollTop + viewportHeight, true);
	check('夹取后光标上边不越过视口顶',
		scrollTop + margin >= scrollTop, true);
}

if (failures.length > 0) {
	console.log(`\n结果：FAIL（${failures.length} 条）`);
	process.exit(1);
}
console.log('\n结果：PASS');
