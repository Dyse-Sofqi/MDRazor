/**
 * MDRazor — 「开启/关闭首行缩进」命令与右键菜单项回归
 *
 * 用法：`node scripts/verify-first-line-indent-toggle.mjs`（或 `npm run verify:indent-toggle`）
 *
 * 为什么需要它：这条链路本身很薄，但有三处「看着对、错了也不报错」的地方：
 *   1. **命令 id 稳定性** —— 自定义命令 / 状态栏按钮 / 功能区图标 / 右键菜单
 *      自定义项存的都是一条命令 id，`executeCommandById` 对不存在的 id 只返回
 *      `false`（宿主 `findCommand` 是纯 id 查表），改名就等于把所有绑定它的
 *      按钮变成永久静默失效。故 id 单独导出并在此锁死。
 *   2. **切换必须走 settings 引用 + save 回调** —— 只改局部变量、不落盘的话
 *      「设置面板显示已开、插件实际没缩进」；只落盘不走回调则设置面板的开关
 *      显示不同步。
 *   3. **菜单项必须实时读开关** —— 右键菜单项在每次弹出时判定，若把开关状态
 *      缓存在注册时刻，关闭开关后菜单项仍会出现（反之亦然），且无需重载插件
 *      即可生效这条承诺失效。
 *
 * 另有一条**反例守卫**：命令必须用 `callback`（而非 `checkCallback`）注册 ——
 * 开关是全局设置，阅读视图下没有 MarkdownView，若命令要求「当前有 Markdown
 * 编辑器」，用户在阅读视图里会发现命令从命令面板消失。
 */

import esbuild from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outfile = join(tmpdir(), 'mdrazor-first-line-indent-toggle.cjs');

/* obsidian 桩：本模块只用到 i18n（getLanguage / requireApiVersion） */
const stubPlugin = {
	name: 'stub-obsidian',
	setup(build) {
		build.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'stub-obs' }));
		build.onLoad({ filter: /.*/, namespace: 'stub-obs' }, () => ({
			contents: `
				export class Plugin {}
				export const getLanguage = () => 'zh';
				export const requireApiVersion = () => true;
			`,
			loader: 'js',
		}));
	},
};

await esbuild.build({
	entryPoints: [join(root, 'src/controller/general/first-line-indent-toggle.ts')],
	outfile,
	bundle: true,
	platform: 'node',
	format: 'cjs',
	target: 'node18',
	logLevel: 'warning',
	plugins: [stubPlugin],
});

const { registerFirstLineIndentToggle, FIRST_LINE_INDENT_COMMAND_ID } = await import(
	pathToFileURL(outfile).href
);

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

/** 复刻宿主语义的最小桩：只保留本链路用到的三个方法 */
function makeHarness({ contextMenuEnabled = true } = {}) {
	const commands = [];
	const events = [];
	let saveCount = 0;
	const settings = { firstLineIndentEnabled: false };
	const plugin = {
		app: {
			workspace: {
				on: (name, handler) => {
					events.push({ name, handler });
					return { name, handler };
				},
			},
		},
		addCommand: (cmd) => commands.push(cmd),
		registerEvent: () => {},
	};
	registerFirstLineIndentToggle(
		plugin,
		settings,
		async () => {
			saveCount++;
		},
		() => contextMenuEnabled,
	);
	return { commands, events, settings, plugin, getSaveCount: () => saveCount };
}

/** 复刻 Menu.addItem(cb) 的语义：回调里拿到一个链式 MenuItem，记录 onClick */
function popupMenu(events) {
	const items = [];
	const handler = events.find((e) => e.name === 'editor-menu')?.handler;
	if (!handler) return { items, ran: false };
	const menu = {
		addItem: (cb) => {
			const item = {
				title: undefined,
				icon: undefined,
				onClickCb: undefined,
				setTitle(t) {
					this.title = t;
					return this;
				},
				setIcon(i) {
					this.icon = i;
					return this;
				},
				onClick(cb) {
					this.onClickCb = cb;
					return this;
				},
			};
			cb(item);
			items.push(item);
		},
	};
	handler(menu);
	return { items, ran: true };
}

console.log('① 命令注册（id 稳定性 + 切换语义）');
{
	const h = makeHarness();
	check('注册了恰好 1 条命令', h.commands.length, 1);
	const cmd = h.commands[0] ?? {};
	check('命令 id 锁死为 mdrazor-toggle-first-line-indent', cmd.id, 'mdrazor-toggle-first-line-indent');
	check('导出的 id 常量与注册的一致', FIRST_LINE_INDENT_COMMAND_ID, cmd.id);
	check('命令标题为中文（zh 界面）', cmd.name, '开启/关闭首行缩进');
	check('命令图标为 indent-increase', cmd.icon, 'indent-increase');
	// 反例守卫：用 checkCallback 会让命令在阅读视图（无 MarkdownView）下消失
	check('用 callback 注册（阅读视图下也必须在命令面板里可用）', typeof cmd.callback, 'function');
	check('没有用 checkCallback', cmd.checkCallback, undefined);

	check('初始状态：设置里首行缩进关闭', h.settings.firstLineIndentEnabled, false);
	await cmd.callback();
	check('执行一次：设置被翻转为开启', h.settings.firstLineIndentEnabled, true);
	check('执行一次：触发了 1 次 save 回调（落盘 + 同步设置面板）', h.getSaveCount(), 1);
	await cmd.callback();
	check('再执行一次：翻回关闭', h.settings.firstLineIndentEnabled, false);
	check('再执行一次：save 回调累计 2 次', h.getSaveCount(), 2);
}

console.log('\n② 右键菜单项（实时读开关 + 与命令同一逻辑）');
{
	const h = makeHarness({ contextMenuEnabled: true });
	check('订阅了 editor-menu', h.events.filter((e) => e.name === 'editor-menu').length, 1);

	const on = popupMenu(h.events);
	check('开关开启时菜单里出现 1 项', on.items.length, 1);
	check('菜单项标题与命令一致', on.items[0]?.title, '开启/关闭首行缩进');
	check('菜单项图标与命令一致', on.items[0]?.icon, 'indent-increase');

	on.items[0]?.onClickCb?.();
	await Promise.resolve();
	check('点击菜单项：翻转设置（与命令同一条逻辑）', h.settings.firstLineIndentEnabled, true);
	check('点击菜单项：同样触发 save 回调', h.getSaveCount(), 1);

	const off = makeHarness({ contextMenuEnabled: false });
	const offMenu = popupMenu(off.events);
	check('开关关闭时菜单里不添加任何项', offMenu.items.length, 0);
	check('开关关闭不影响命令仍然注册', off.commands.length, 1);
	check('开关关闭后设置值未被改动', off.settings.firstLineIndentEnabled, false);
}

if (failures.length > 0) {
	console.log(`\n结果：FAIL（${failures.length} 条）`);
	process.exit(1);
}
console.log('\n结果：PASS');
