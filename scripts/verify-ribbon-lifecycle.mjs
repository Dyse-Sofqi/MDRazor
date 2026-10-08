/**
 * MDRazor — 左功能区「清理失联图片」开关的注销回归
 *
 * 用法：`node scripts/verify-ribbon-lifecycle.mjs`（或 `npm run verify:ribbon`）
 *
 * 为什么需要它：`Plugin.addRibbonIcon()` 并不是「返回一个元素」这么简单 ——
 * 它同时在 `workspace.leftRibbon` 内部以 `${manifest.id}:${title}` 为 action id
 * 注册了一个条目（asar 实证，obsidian 1.13.7 的 app.js）：
 *
 *   addRibbonIcon(icon, title, cb) {
 *     const id = manifest.id + ":" + title;
 *     const el = workspace.leftRibbon.addRibbonItemButton(id, icon, title, cb);
 *     this.register(() => { workspace.leftRibbon.removeRibbonAction(id); el.detach(); });
 *     return el;
 *   }
 *
 * 因此「关掉开关」只 detach 元素是不够的：条目仍留在 `leftRibbon.items` 里且
 * `buttonEl` 未清空，而本插件的功能区管理器会把 `items` 里**所有**带 buttonEl
 * 的条目重新 append 回容器（`applyRibbonOrder`），于是按钮「又回来了」、点击
 * 仍可触发清理。必须在移除时调用 `removeRibbonAction(id)` 真正注销。
 *
 * 本脚本用**照抄宿主语义**的最小桩复现这条链路：leftRibbon 的
 * addRibbonItemButton / removeRibbonAction / onChange 三个方法按 asar 反编译
 * 逐条对齐（含 `removeRibbonAction` 只 delete buttonEl/callback、**不**从 items
 * 里 splice 这个关键细节），Plugin.addRibbonIcon 亦按原样实现。断言覆盖：
 *   - 开启：按钮进容器、进 getRibbonItems() 列表；
 *   - 关闭（走设置面板的真实调用顺序 removeRibbon → saveSettings → refresh）：
 *     按钮出容器、出列表，且 leftRibbon 条目已被注销（无 buttonEl）；
 *   - 再开启：按钮回来且**不重复**（addRibbonItemButton 按 id 复用条目）；
 *   - 反例守卫：不调 removeRibbonAction、只 detach 元素时，refresh() 必须把
 *     按钮**重新挂回**——证明本夹具对原 bug 是敏感的（否则这条回归是假绿）。
 */

import esbuild from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outdir = join(tmpdir(), 'mdrazor-ribbon-lifecycle');

/* ------------------------------------------------------------------ */
/*  打包：obsidian 替换为桩模块                                         */
/* ------------------------------------------------------------------ */

const stubPlugin = {
	name: 'stub-obsidian',
	setup(build) {
		build.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'stub-obs' }));
		build.onLoad({ filter: /.*/, namespace: 'stub-obs' }, () => ({
			contents: `
				// Notice 把消息记进 globalThis.__mdrazorNotices，供断言「命令缺失时是否有提示」
				export class Notice {
					constructor(message) { (globalThis.__mdrazorNotices ??= []).push(String(message ?? '')); }
					setMessage(m) { (globalThis.__mdrazorNotices ??= []).push(String(m ?? '')); }
					hide() {}
				}
				export class Plugin {}
				// orphan-image-cleaner 的确认弹窗在模块作用域 extends Modal
				export class Modal { constructor() {} }
				export class ButtonComponent { setButtonText() { return this; } setCta() { return this; } onClick() { return this; } }
				export const setIcon = () => {};
				// i18n 走 requireApiVersion('1.8.7') → getLanguage()，固定中文便于断言 key
				export const getLanguage = () => 'zh';
				export const requireApiVersion = () => true;
			`,
			loader: 'js',
		}));
	},
};

/** 逐个打包（多个 entry 会让 esbuild 按目录分桶，输出路径不好猜） */
async function bundle(entry, name) {
	const outfile = join(outdir, `${name}.cjs`);
	await esbuild.build({
		entryPoints: [join(root, 'src/controller', entry)],
		outfile,
		bundle: true,
		platform: 'node',
		format: 'cjs',
		target: 'node18',
		logLevel: 'warning',
		plugins: [stubPlugin],
	});
	return pathToFileURL(outfile).href;
}

const cleanerMod = await import(await bundle('orphan-image-cleaner/orphan-image-cleaner.ts', 'orphan-image-cleaner'));
const managerMod = await import(await bundle('ribbon-manager/ribbon-manager.ts', 'ribbon-manager'));

/* ------------------------------------------------------------------ */
/*  浏览器全局桩                                                       */
/* ------------------------------------------------------------------ */

// tr() 经 requireApiVersion/getLanguage 固定为中文（见上面的桩），key 可预期
globalThis.MutationObserver = class MutationObserver {
	observe() {}
	disconnect() {}
};
// ribbon-manager 的兜底定时器与观察器回调；本回归只走显式调用，故置空
globalThis.window = { setTimeout: () => 0, clearTimeout: () => {} };

/* ------------------------------------------------------------------ */
/*  最小 DOM 桩                                                        */
/* ------------------------------------------------------------------ */

/** 选择器匹配：仅支持本路径用到的形态 —— 标签名 / .class（可多类连写）/ 逗号列表 */
function matches(el, selectorList) {
	for (const part of selectorList.split(',')) {
		const sel = part.trim();
		if (!sel) continue;
		if (sel.startsWith('.')) {
			const need = sel.slice(1).split('.').filter(Boolean);
			if (need.length > 0 && need.every((c) => el.classes.has(c))) return true;
		} else if (el.tagName === sel.toUpperCase()) {
			return true;
		}
	}
	return false;
}

class MiniElement {
	constructor(tag, classes = [], attrs = {}) {
		this.tagName = tag.toUpperCase();
		this.classes = new Set(classes);
		this.attrs = new Map(Object.entries(attrs));
		this.children = [];
		this.parent = null;
		this.hidden = false;
		this.listeners = new Map();
	}

	/** DOM 语义：appendChild 是「移动」，先从前一个父节点摘除、再从当前父节点末尾插入 */
	append(...kids) {
		for (const k of kids) {
			if (k.parent) k.parent.children = k.parent.children.filter((c) => c !== k);
			k.parent = this;
			this.children.push(k);
		}
		return this;
	}

	appendChild(k) {
		return this.append(k);
	}

	/** Obsidian 的 setChildrenInPlace：用给定数组**替换**容器子节点 */
	setChildrenInPlace(list) {
		this.children = [];
		for (const k of list) {
			k.parent = this;
			this.children.push(k);
		}
	}

	get parentElement() {
		return this.parent;
	}

	setAttribute(name, value) {
		this.attrs.set(name, value);
		return this;
	}

	getAttribute(name) {
		return this.attrs.get(name) ?? null;
	}

	addClass(c) {
		this.classes.add(c);
		return this;
	}

	toggleClass(c, on) {
		if (on) this.classes.add(c);
		else this.classes.delete(c);
		return this;
	}

	hasClass(c) {
		return this.classes.has(c);
	}

	/** Obsidian 的 toggle(show)：false 即隐藏 */
	toggle(show) {
		this.hidden = !show;
		return this;
	}

	remove() {
		if (this.parent) {
			this.parent.children = this.parent.children.filter((c) => c !== this);
			this.parent = null;
		}
		return this;
	}

	detach() {
		return this.remove();
	}

	onClickEvent(cb) {
		this.addEventListener('click', cb);
		return this;
	}

	/** 触发 click 监听器（模拟用户点击功能区按钮） */
	click() {
		for (const fn of this.listeners.get('click') ?? []) fn({ target: this, type: 'click' });
	}

	addEventListener(type, fn) {
		if (!this.listeners.has(type)) this.listeners.set(type, []);
		this.listeners.get(type).push(fn);
	}

	querySelector(selector) {
		return this.querySelectorAll(selector)[0] ?? null;
	}

	querySelectorAll(selector) {
		const out = [];
		const walk = (node) => {
			for (const c of node.children) {
				if (matches(c, selector)) out.push(c);
				walk(c);
			}
		};
		walk(this);
		return out;
	}

	closest(selector) {
		for (let el = this; el; el = el.parent) if (matches(el, selector)) return el;
		return null;
	}
}

/* ------------------------------------------------------------------ */
/*  宿主桩：leftRibbon 与 Plugin.addRibbonIcon（逐条对齐 asar 反编译）   */
/* ------------------------------------------------------------------ */

/**
 * 对齐 asar 的 `makeRibbonItemButton(icon, title, cb)`：
 * `createDiv("clickable-icon side-dock-ribbon-action")` + onClickEvent(cb) +
 * 工具提示 + setIcon（此处以 data-icon 与 lucide-* svg 类表达，与 getMetaFromEl
 * 的读取方式一致）。
 */
function makeRibbonItemButton(icon, title, callback) {
	const el = new MiniElement('div', ['clickable-icon', 'side-dock-ribbon-action']);
	el.onClickEvent(callback);
	el.setAttribute('aria-label', title);
	el.setAttribute('title', title);
	el.setAttribute('data-icon', icon);
	const svg = new MiniElement('svg', [`lucide-${icon}`], { 'data-lucide': icon });
	el.append(svg);
	return el;
}

/**
 * 对齐 asar 的 leftRibbon：
 *   addRibbonItemButton(id, icon, title, cb) —— 按 id 复用条目，否则 push，再 onChange
 *   removeRibbonAction(id)                  —— **只** delete buttonEl/callback，不 splice
 *   onChange(saveLayout)                    —— 只把「有 buttonEl」的条目 setChildrenInPlace
 */
function makeLeftRibbon(ribbonItemsEl) {
	const api = {
		items: [],
		ribbonItemsEl,
		removeRibbonActionCalls: 0,
		onChange() {
			const els = [];
			for (const item of api.items) {
				if (!item.buttonEl) continue;
				item.buttonEl.toggle(!item.hidden);
				els.push(item.buttonEl);
			}
			ribbonItemsEl.setChildrenInPlace(els);
		},
		addRibbonItemButton(id, icon, title, callback) {
			const el = makeRibbonItemButton(icon, title, callback);
			const existing = api.items.find((i) => i.id === id);
			if (existing) {
				existing.title = title;
				existing.icon = icon;
				existing.callback = callback;
			} else {
				api.items.push({ id, icon, title, callback, hidden: false });
			}
			const item = api.items.find((i) => i.id === id);
			item.buttonEl = el;
			api.onChange(false);
			return el;
		},
		removeRibbonAction(id) {
			api.removeRibbonActionCalls++;
			for (const item of api.items) {
				if (item.id === id) {
					delete item.buttonEl;
					delete item.callback;
					break;
				}
			}
		},
	};
	return api;
}

/**
 * 对齐 asar 的命令注册表：
 *   `findCommand(id)` 是纯 id 查表（`this.commands[id]`）；
 *   `executeCommandById(id)` 找不到时**返回 false 且不抛错**（回调抛错也返回 false）。
 * 这是「命令被改名/卸载后按钮静默失效」的宿主语义来源，桩必须照抄。
 */
function makeCommands(registry = {}) {
	return {
		commands: registry,
		// findCommand 是纯 id 查表（asar 实证）——命令存在性判定的唯一依据
		findCommand(id) {
			return registry[id];
		},
		executeCommandById(id) {
			const cmd = registry[id];
			if (!cmd) return false;
			try {
				cmd.callback?.();
			} catch {
				// 对齐 asar：回调抛错被 catch 后同样返回 false（与「命令不存在」同值）
				return false;
			}
			return true;
		},
	};
}

/** 对齐 asar 的 `Plugin.addRibbonIcon`（含注册 cleanup） */
function createPlugin({ settings, leftRibbon, containerEl, commands }) {
	const cleanups = [];
	return {
		manifest: { id: 'md-razor' },
		settings,
		app: {
			workspace: {
				leftRibbon,
				containerEl,
				on: () => ({}),
				onLayoutReady: () => {},
			},
			commands: commands ?? makeCommands(),
		},
		addRibbonIcon(icon, title, callback) {
			const id = `${this.manifest.id}:${title}`;
			const el = this.app.workspace.leftRibbon.addRibbonItemButton(id, icon, title, callback);
			cleanups.push(() => {
				this.app.workspace.leftRibbon.removeRibbonAction(id);
				el.detach();
			});
			return el;
		},
		register(fn) {
			cleanups.push(fn);
			return fn;
		},
		registerEvent() {},
		saveSettings: async () => {},
		_cleanups: cleanups,
	};
}

/* ------------------------------------------------------------------ */
/*  夹具                                                              */
/* ------------------------------------------------------------------ */

const TRASH_TITLE = '清理失联图片';
const TRASH_KEY = `ribbon:trash-2:${TRASH_TITLE}`;
const NATIVE_ID = 'obsidian:graph';
const NATIVE_TITLE = 'Open graph view';

function buildHarness(options = {}) {
	const containerEl = new MiniElement('div', ['workspace']);
	const ribbonItemsEl = new MiniElement('div', ['workspace-ribbon']);
	containerEl.append(ribbonItemsEl);

	const leftRibbon = makeLeftRibbon(ribbonItemsEl);
	// 一个先于本插件注册的原生条目：用于验证「注销只影响目标条目」
	leftRibbon.addRibbonItemButton(NATIVE_ID, 'git-fork', NATIVE_TITLE, () => {});

	const settings = {
		orphanImageCleanerEnabled: false,
		orphanImageWhitelist: [],
		hiddenRibbonCommands: {},
		customRibbonCommands: options.customRibbonCommands ?? [],
		ribbonCommandOrder: [],
	};
	const commands = makeCommands(options.registry ?? {});
	const plugin = createPlugin({ settings, leftRibbon, containerEl, commands });

	const cleaner = cleanerMod.registerOrphanImageCleaner(plugin);
	const manager = managerMod.registerRibbonManager(plugin);
	manager.refresh();

	return { plugin, settings, cleaner, manager, leftRibbon, ribbonItemsEl, commands };
}

/** 复刻设置面板 onChange 的真实调用顺序 */
async function applyToggle(h, value) {
	h.settings.orphanImageCleanerEnabled = value;
	if (value) h.cleaner.addRibbon();
	else h.cleaner.removeRibbon();
	await h.plugin.saveSettings();
	h.manager.refresh();
}

const buttonsInRibbon = (h) => h.ribbonItemsEl.children.filter((c) => c.hasClass('side-dock-ribbon-action'));
const trashButtonsInRibbon = (h) => buttonsInRibbon(h).filter((c) => c.getAttribute('aria-label') === TRASH_TITLE);
const trashItem = (h) => h.leftRibbon.items.find((i) => i.id === `md-razor:${TRASH_TITLE}`);
const listHasTrash = (h) => h.manager.getRibbonItems().some((i) => i.key === TRASH_KEY);
const listTrashCount = (h) => h.manager.getRibbonItems().filter((i) => i.key === TRASH_KEY).length;

/** Notice 桩写入的消息（桩见上） */
const notices = () => globalThis.__mdrazorNotices ?? [];
const clearNotices = () => {
	globalThis.__mdrazorNotices = [];
};
/** 让 async 的 executeCommand 跑完（Notice 在 await 之后才产生） */
const tick = () => new Promise((r) => setTimeout(r, 0));

/* ------------------------------------------------------------------ */
/*  断言                                                              */
/* ------------------------------------------------------------------ */

let passed = 0;
const failures = [];
function check(label, cond) {
	if (cond) {
		passed++;
	} else {
		failures.push(label);
		console.log(`  ✗ ${label}`);
	}
}

/* ── ① 初始：开关关闭 → 无按钮 ── */
{
	console.log('① 初始（开关关闭）');
	const h = buildHarness();
	check('初始功能区不含垃圾桶按钮', trashButtonsInRibbon(h).length === 0);
	check('初始列表不含清理失联图片', !listHasTrash(h));
	check('原生条目仍在功能区', buttonsInRibbon(h).length === 1);
	check('原生条目仍在列表', h.manager.getRibbonItems().some((i) => i.key === `ribbon:git-fork:${NATIVE_TITLE}`));
}

/* ── ② 开启：按钮出现 ── */
{
	console.log('② 开启开关');
	const h = buildHarness();
	await applyToggle(h, true);
	check('功能区出现垃圾桶按钮', trashButtonsInRibbon(h).length === 1);
	check('列表出现清理失联图片', listHasTrash(h));
	check('leftRibbon 条目已挂 buttonEl', Boolean(trashItem(h)?.buttonEl));
	check('点击仍绑着回调', typeof trashItem(h)?.callback === 'function');
}

/* ── ③ 关闭：按钮与功能**立刻**注销（本 bug 的正面回归）── */
{
	console.log('③ 关闭开关（真实调用顺序：removeRibbon → saveSettings → refresh）');
	const h = buildHarness();
	await applyToggle(h, true);
	await applyToggle(h, false);

	check('功能区已无垃圾桶按钮（refresh 后不得复活）', trashButtonsInRibbon(h).length === 0);
	check('列表中已无清理失联图片', !listHasTrash(h));
	check('leftRibbon 条目已注销（buttonEl 被清空）', !trashItem(h)?.buttonEl);
	check('回调已解除（功能注销）', trashItem(h)?.callback === undefined);
	check('removeRibbonAction 确实被调用', h.leftRibbon.removeRibbonActionCalls >= 1);
	check('原生条目未被误伤', buttonsInRibbon(h).length === 1 && trashButtonsInRibbon(h).length === 0);
}

/* ── ④ 关→开→关 反复切换：不重复、不残留 ── */
{
	console.log('④ 反复切换（关→开→关→开）');
	const h = buildHarness();
	await applyToggle(h, true);
	await applyToggle(h, false);
	await applyToggle(h, true);

	check('重新开启后功能区恰好一个按钮', trashButtonsInRibbon(h).length === 1);
	check('列表中恰好一条（不重复）', listTrashCount(h) === 1);

	await applyToggle(h, false);
	check('再次关闭后功能区无按钮', trashButtonsInRibbon(h).length === 0);
	check('再次关闭后列表无条目', !listHasTrash(h));
	check('leftRibbon 条目仍只有一条（按 id 复用，未堆叠）', h.leftRibbon.items.filter((i) => i.id === `md-razor:${TRASH_TITLE}`).length === 1);
}

/* ── ⑤ 幂等：重复 removeRibbon 不抛错 ── */
{
	console.log('⑤ removeRibbon 幂等');
	const h = buildHarness();
	await applyToggle(h, true);
	h.cleaner.removeRibbon();
	let threw = false;
	try {
		h.cleaner.removeRibbon();
		h.manager.refresh();
	} catch {
		threw = true;
	}
	check('连续两次 removeRibbon 不抛错', !threw);
	check('功能区仍无按钮', trashButtonsInRibbon(h).length === 0);
}

/* ── ⑥ 反例守卫：只 detach 元素（旧行为）时按钮必然复活 ── */
{
	console.log('⑥ 反例守卫：不调 removeRibbonAction，只 detach 元素');
	const h = buildHarness();
	await applyToggle(h, true);

	// 模拟修复前的 removeRibbon：只摘 DOM，不向 leftRibbon 注销
	const staleEl = trashItem(h)?.buttonEl;
	staleEl.remove();
	check('仅 detach 后功能区暂时无按钮', trashButtonsInRibbon(h).length === 0);

	h.manager.refresh();
	check('【反例】refresh() 把按钮重新挂回（旧 bug 的真实成因）', trashButtonsInRibbon(h).length === 1);
	check('【反例】列表中仍留着该条目', listHasTrash(h));
}

/* ── ⑦ 命令缺失守卫：不再静默失效 ── */
{
	console.log('⑦ 命令缺失守卫（自定义命令绑的命令 id 已失效时要有提示）');
	const CUSTOM = { commandId: 'style-tuner:show-style-tuner-leaf', name: 'Style Tuner', icon: 'lucide-paintbrush', id: 'cmd-stale' };
	let callbackRuns = 0;
	const h = buildHarness({
		customRibbonCommands: [CUSTOM],
		registry: {
			// 库里实际存在的那个命令（改名后的新 id）
			'app:open-settings': { id: 'app:open-settings', name: '打开设置', callback: () => { callbackRuns++; } },
			'boom:cmd': { id: 'boom:cmd', name: 'Boom', callback: () => { throw new Error('boom'); } },
		},
	});

	const customBtn = () => buttonsInRibbon(h).find((b) => b.getAttribute('aria-label') === 'Style Tuner');
	check('自定义命令按钮已渲染', Boolean(customBtn()));

	// ① 命令 id 已失效（本 bug 的场景）
	clearNotices();
	customBtn().click();
	await tick();
	check('命令不存在时弹出 1 条提示', notices().length === 1);
	check('提示里带上失效的命令 id', notices()[0]?.includes('style-tuner:show-style-tuner-leaf'));

	// ② 命令存在 → 正常执行、无提示
	h.settings.customRibbonCommands = [{ ...CUSTOM, commandId: 'app:open-settings' }];
	h.manager.refresh();
	clearNotices();
	customBtn().click();
	await tick();
	check('命令存在时回调被执行', callbackRuns === 1);
	check('命令存在时不弹提示', notices().length === 0);

	// ③ 命令存在但回调抛错 → 走「执行命令失败」分支
	h.settings.customRibbonCommands = [{ ...CUSTOM, commandId: 'boom:cmd' }];
	h.manager.refresh();
	clearNotices();
	customBtn().click();
	await tick();
	check('回调抛错时仍弹 1 条提示', notices().length === 1);
	check('抛错提示是「执行命令失败」而非「命令不存在」', notices()[0]?.includes('执行命令失败'));
}

/* ------------------------------------------------------------------ */
/*  汇总                                                              */
/* ------------------------------------------------------------------ */

console.log(`\n通过 ${passed} 项，失败 ${failures.length} 项`);
if (failures.length > 0) {
	console.log('失败项：');
	for (const f of failures) console.log(`  - ${f}`);
	process.exit(1);
}
console.log('✓ 左功能区注销链路回归全部通过');
