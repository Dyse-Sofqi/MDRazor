/**
 * MDRazor — Callout「标题单击折叠/展开」离线回归
 *
 * 用法：`node scripts/verify-callout-title-fold.mjs`（或 `npm run verify:callout-fold`）
 *
 * 为什么需要它：可折叠 callout 的标题单击折叠是本模块新补的交互，其正确性
 * 几乎全部系于 **handleClick 的分支顺序**与 **tryToggleCalloutFold 的三个门**：
 *   - 顺序：「编辑这个区块」按钮（原生 .edit-block-button 与插件触屏按钮）、
 *     交互元素（链接 / 折叠箭头）必须排在新分支**之前**，否则标题单击会遮挡
 *     编辑按钮、或与原生箭头切换叠加成两次（用户明确要求不能遮挡编辑按钮）；
 *   - 门①：点击必须落在 widget 内部的 .callout-title 上（正文区、右侧空白
 *     不触发；嵌套 callout 只切换被点的最近一层）；
 *   - 门②：标题行内必须有 .callout-fold（Obsidian 只为可折叠 callout 渲染它），
 *     不可折叠 callout 的标题单击保持原有的「只保持渲染」；
 *   - 门③：mousedown 与 click 位移超过 TITLE_FOLD_SLOP_PX 视为拖拽选择标题
 *     文本，不切换（标题可拖选是 2.6.5 起既有的交互）。
 * 这些在 Obsidian 里靠肉眼点覆盖面有限，这里用**最小 DOM 桩**复现实时预览
 * callout widget 的 DOM 结构与事件传播（捕获 → 目标 → 冒泡，经
 * registerDomEvent 注册的捕获处理器与元素自身监听都参与），把
 * registerCalloutEnhancer 注册的**真实处理器**接上去跑断言。
 *
 * 桩的边界（与真实 DOM 的差异不影响被测路径）：
 *   - obsidian / @codemirror/view 用 esbuild 插件打成桩模块（同
 *     verify-list-integration.mjs 的做法）：EditorView.findFromDOM 返回 null，
 *     编辑面板路径因此不展开（本回归只测点击分流，不测面板内容）；
 *   - MutationObserver 置为桩：widget 注入/重建不在本回归范围；
 *   - getBoundingClientRect 由夹具显式给定：只服务 resolveCalloutWidget 的
 *     「widget 右侧同行空白」几何判定路径。
 * 期望值取自设计语义（哪条分支应生效、合成 click 应落在哪个折叠箭头上），
 * 不从实现反推。
 */

import esbuild from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outfile = join(tmpdir(), 'mdrazor-callout-title-fold.cjs');

// callout-enhancer.ts 依赖 obsidian（Notice/Plugin/setIcon/getLanguage/
// requireApiVersion）与 @codemirror/view（EditorView）。打包含真实依赖的包会
// 拖进整条 CM6 运行时，这里用 esbuild 插件把两者替换为桩模块。
const stubPlugin = {
	name: 'stub-obsidian-cm6',
	setup(build) {
		build.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'stub-obs' }));
		build.onResolve({ filter: /^@codemirror\/view$/ }, () => ({ path: '@codemirror/view', namespace: 'stub-cm6' }));
		build.onLoad({ filter: /.*/, namespace: 'stub-obs' }, () => ({
			contents: `
				export class Notice {}
				export class Plugin {}
				export const setIcon = () => {};
				export const getLanguage = () => 'en';
				export const requireApiVersion = () => false;
			`,
			loader: 'js',
		}));
		build.onLoad({ filter: /.*/, namespace: 'stub-cm6' }, () => ({
			contents: `
				export class EditorView {
					// 测试经 globalThis.__mdrazorFakeView 注入桩 view（含 posAtDOM /
					// posAtCoords / state.doc）；未注入时返回 null（编辑面板路径不展开）
					static findFromDOM() { return globalThis.__mdrazorFakeView ?? null; }
					static domEventHandlers() { return {}; }
				}
			`,
			loader: 'js',
		}));
	},
};

await esbuild.build({
	entryPoints: [join(root, 'src/controller/general/callout-enhancer.ts')],
	outfile,
	bundle: true,
	platform: 'node',
	format: 'cjs',
	target: 'node18',
	logLevel: 'warning',
	plugins: [stubPlugin],
});

const { registerCalloutEnhancer } = await import(pathToFileURL(outfile).href);

/* ------------------------------------------------------------------ */
/*  最小 DOM 桩                                                        */
/* ------------------------------------------------------------------ */

// eventTargetElement 用 instanceof Element / Node 判定事件目标
globalThis.Node = class Node {};
globalThis.Element = class Element extends Node {};
// tryToggleCalloutFold 用 new MouseEvent 重放合成 click
globalThis.MouseEvent = class MouseEvent {
	constructor(type, init = {}) {
		this.type = type;
		this.bubbles = Boolean(init.bubbles);
		this.cancelable = Boolean(init.cancelable);
		this.defaultPrevented = false;
		this.propagationStopped = false;
		this.preventDefault = () => {
			this.defaultPrevented = true;
		};
		this.stopPropagation = () => {
			this.propagationStopped = true;
		};
	}
};
// registerCalloutEnhancer 里 new MutationObserver(...).observe(...)
globalThis.MutationObserver = class MutationObserver {
	observe() {}
	disconnect() {}
};
// openEditor / attachEditorListeners 触及的浏览器全局
globalThis.ResizeObserver = class ResizeObserver {
	observe() {}
	disconnect() {}
};
globalThis.activeDocument = { styleSheets: [] };
globalThis.window = {
	setTimeout: () => 0,
	getComputedStyle: () => ({ padding: '0px 12px', backgroundColor: 'rgba(0, 0, 0, 0)' }),
};

/** 经 plugin.registerDomEvent 登记的处理器（含 capture 标志），供 dispatchEvent 回放 */
const domRegistry = [];

/** 选择器匹配：仅支持本模块用到的形态 —— 标签名 / .class（可多类连写）/ [attr="value"] / 逗号列表 */
function matches(el, selectorList) {
	for (const part of selectorList.split(',')) {
		const sel = part.trim();
		if (!sel) continue;
		if (sel.startsWith('.')) {
			const need = sel.slice(1).split('.').filter(Boolean);
			if (need.length > 0 && need.every((c) => el.classes.has(c))) return true;
		} else if (sel.startsWith('[')) {
			const m = /^\[([\w-]+)="([^"]*)"\]$/.exec(sel);
			if (m && el.attrs.get(m[1]) === m[2]) return true;
		} else if (el.tagName === sel.toUpperCase()) {
			return true;
		}
	}
	return false;
}

class MiniElement extends Element {
	constructor(tag, classes = [], attrs = {}) {
		super();
		this.tagName = tag.toUpperCase();
		this.classes = new Set(classes);
		this.attrs = new Map(Object.entries(attrs));
		this.children = [];
		this.parent = null;
		this.listeners = new Map();
		this.rect = { left: 0, right: 900, top: 0, bottom: 1000 };
		this.isConnected = true;
		this.ownerDocument = null;
		this.scrollHeight = 0;
	}

	append(...kids) {
		for (const k of kids) {
			k.parent = this;
			this.children.push(k);
		}
		return this;
	}

	get firstChild() {
		return this.children[0] ?? null;
	}

	addEventListener(type, fn, opts) {
		if (!this.listeners.has(type)) this.listeners.set(type, []);
		this.listeners.get(type).push({ fn, capture: Boolean(opts?.capture) });
	}

	removeEventListener(type, fn) {
		const list = this.listeners.get(type);
		if (!list) return;
		this.listeners.set(
			type,
			list.filter((l) => l.fn !== fn),
		);
	}

	/* ── Obsidian DOM 助手桩（openEditor / addField / ensureTouchEditButton 用到）── */

	createEl(tag, opts = {}) {
		const child = new MiniElement(tag, opts.cls ? [opts.cls] : []);
		if (opts.type !== undefined) child.attrs.set('type', opts.type);
		if (opts.value !== undefined) child.attrs.set('value', opts.value);
		if (opts.text !== undefined) child.setText(opts.text);
		this.append(child);
		return child;
	}

	createDiv(opts) {
		return this.createEl('div', opts);
	}

	createSpan(opts) {
		return this.createEl('span', opts);
	}

	setText(text) {
		this.text = text;
		return this;
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

	removeClass(c) {
		this.classes.delete(c);
		return this;
	}

	hasClass(c) {
		return this.classes.has(c);
	}

	setCssProps(props) {
		this.cssProps = { ...(this.cssProps ?? {}), ...props };
		return this;
	}

	focus() {}

	remove() {
		if (this.parent) {
			this.parent.children = this.parent.children.filter((c) => c !== this);
			this.parent = null;
		}
		this.isConnected = false;
		return this;
	}

	getBoundingClientRect() {
		return this.rect;
	}

	closest(selector) {
		for (let el = this; el; el = el.parent) if (matches(el, selector)) return el;
		return null;
	}

	contains(el) {
		for (let x = el; x; x = x.parent) if (x === this) return true;
		return false;
	}

	querySelector(selector) {
		return this.querySelectorAll(selector)[0] ?? null;
	}

	querySelectorAll(selector) {
		const out = [];
		const walk = (el) => {
			for (const c of el.children) {
				if (matches(c, selector)) out.push(c);
				walk(c);
			}
		};
		walk(this);
		return out;
	}

	/**
	 * 事件传播桩：捕获（root → target，元素自身 capture 监听 + 经
	 * registerDomEvent 的 capture 处理器）→ 目标/冒泡（target → root，元素
	 * 自身非 capture 监听 + 非 capture 处理器）。stopPropagation 之后的
	 * 监听器不再执行（与浏览器一致）。
	 */
	dispatchEvent(event) {
		if (event.target === undefined) event.target = this;
		const path = [];
		for (let el = this; el; el = el.parent) path.unshift(el);
		const run = (fn) => {
			if (!event.propagationStopped) fn(event);
		};
		for (const el of path) {
			for (const l of el.listeners.get(event.type) ?? []) {
				if (l.capture) run(l.fn);
			}
			for (const r of domRegistry) {
				if (r.el === el && r.type === event.type && r.capture) run(r.handler);
			}
		}
		for (const el of [...path].reverse()) {
			for (const l of el.listeners.get(event.type) ?? []) {
				if (!l.capture) run(l.fn);
			}
			for (const r of domRegistry) {
				if (r.el === el && r.type === event.type && !r.capture) run(r.handler);
			}
		}
		return true;
	}
}

const el = (tag, classes = [], attrs = {}) => new MiniElement(tag, classes, attrs);

/**
 * 文档根桩：ownerDocument 与事件捕获路径的顶端（真实 DOM 里 document 是
 * containerEl 的祖先，onOutsidePointer 就挂在它上面）。
 */
const docStub = el('#document');

/* ------------------------------------------------------------------ */
/*  夹具：实时预览的编辑器 DOM                                          */
/* ------------------------------------------------------------------ */

function buildFixture() {
	const containerEl = el('div', ['workspace']);
	const editor = el('div', ['cm-editor']);
	// .cm-content 是 contenteditable=true（interactiveInside 的祖先陷阱来源，
	// 见 DEBUGLOG 2.6.5 第 12 条；widget.contains 限定必须能挡住它）
	const content = el('div', ['cm-content'], { contenteditable: 'true' });
	containerEl.append(editor);
	editor.append(content);

	// 普通文本行（对照：不得被过度拦截）
	const line = el('div', ['cm-line']);
	content.append(line);

	// ── 可折叠 callout widget（.cm-content > .cm-embed-block.cm-callout >
	//    .markdown-rendered > .callout > .callout-title > … + .callout-fold）──
	const widget = el('div', ['cm-embed-block', 'cm-callout']);
	widget.rect = { left: 40, right: 340, top: 100, bottom: 300 };
	const callout = el('div', ['callout']);
	const title = el('div', ['callout-title']);
	const icon = el('div', ['callout-icon']);
	const titleInner = el('div', ['callout-title-inner']);
	const link = el('a', ['internal-link']);
	const fold = el('div', ['callout-fold']);
	const body = el('div', ['callout-content']);
	title.append(icon, titleInner, fold);
	titleInner.append(link);
	callout.append(title, body);
	callout.ownerDocument = docStub;
	widget.append(el('div', ['markdown-rendered']));
	widget.firstChild.append(callout);
	// 原生「编辑这个区块」按钮（.embed-actions > .edit-block-button）
	const embedActions = el('div', ['embed-actions']);
	const editBtn = el('button', ['embed-action', 'edit-block-button']);
	embedActions.append(editBtn);
	widget.append(embedActions);
	// 插件自有的触屏编辑按钮
	const touchBtn = el('button', ['mdrazor-callout-touch-edit-button']);
	widget.append(touchBtn);
	content.append(widget);

	// ── 不可折叠 callout widget（标题行内没有 .callout-fold）──
	const widget2 = el('div', ['cm-embed-block', 'cm-callout']);
	widget2.rect = { left: 40, right: 340, top: 500, bottom: 600 };
	const callout2 = el('div', ['callout']);
	const title2 = el('div', ['callout-title']);
	const titleInner2 = el('div', ['callout-title-inner']);
	title2.append(el('div', ['callout-icon']), titleInner2);
	callout2.append(title2, el('div', ['callout-content']));
	widget2.append(el('div', ['markdown-rendered']));
	widget2.firstChild.append(callout2);
	content.append(widget2);

	// ── 嵌套 callout：外层可折叠，内层（位于外层正文内）也可折叠 ──
	const outerTitle = el('div', ['callout-title']);
	const outerFold = el('div', ['callout-fold']);
	outerTitle.append(el('div', ['callout-icon']), el('div', ['callout-title-inner']), outerFold);
	const innerTitle = el('div', ['callout-title']);
	const innerFold = el('div', ['callout-fold']);
	const innerTitleInner = el('div', ['callout-title-inner']);
	innerTitle.append(el('div', ['callout-icon']), innerTitleInner, innerFold);
	const innerCallout = el('div', ['callout']);
	innerCallout.append(innerTitle, el('div', ['callout-content']));
	const outerBody = el('div', ['callout-content']);
	outerBody.append(innerCallout);
	const outerCallout = el('div', ['callout']);
	outerCallout.append(outerTitle, outerBody);
	const widget3 = el('div', ['cm-embed-block', 'cm-callout']);
	widget3.rect = { left: 40, right: 340, top: 700, bottom: 900 };
	const rendered3 = el('div', ['markdown-rendered']);
	rendered3.append(outerCallout);
	widget3.append(rendered3);
	content.append(widget3);

	// containerEl 的祖先是文档根（真实 DOM 结构），捕获路径才能走到 document
	containerEl.parent = docStub;

	return {
		containerEl,
		content,
		line,
		widget,
		callout,
		title,
		icon,
		titleInner,
		link,
		fold,
		body,
		editBtn,
		touchBtn,
		titleInner2,
		outerTitle,
		outerFold,
		innerTitleInner,
		innerFold,
	};
}

/* ------------------------------------------------------------------ */
/*  接线：把 registerCalloutEnhancer 的真实处理器接到最小 DOM 上         */
/* ------------------------------------------------------------------ */

const fx = buildFixture();

const mockPlugin = {
	app: {
		workspace: {
			containerEl: fx.containerEl,
			on: () => () => {},
		},
	},
	registerDomEvent: (target, type, handler, opts) => {
		domRegistry.push({ el: target, type, handler, capture: Boolean(opts?.capture) });
	},
	register: () => {},
	registerEditorExtension: () => {},
	registerEvent: () => {},
};

registerCalloutEnhancer(mockPlugin, () => true, () => true);

/* ── 编辑会话路径的桩 view（openEditor 经 EditorView.findFromDOM 拿到它）── */

const CALLOUT_SOURCE = '> [!note]+ 标题\n> 正文';

/** 按源码文本构造 parseCalloutAt 用到的 doc 子集（行号 1 起） */
function makeFakeDoc(text) {
	const lines = text.split('\n');
	const starts = [];
	let off = 0;
	for (const l of lines) {
		starts.push(off);
		off += l.length + 1;
	}
	const lineAt = (pos) => {
		let i = 0;
		for (let j = 0; j < lines.length; j++) {
			const end = j + 1 < starts.length ? starts[j + 1] - 1 : text.length;
			if (pos >= starts[j] && pos <= end) {
				i = j;
				break;
			}
		}
		return { from: starts[i], to: starts[i] + lines[i].length, number: i + 1, text: lines[i] };
	};
	return {
		length: text.length,
		lines: lines.length,
		toString: () => text,
		sliceString: (from, to) => text.slice(from, to),
		lineAt,
		line: (n) => lineAt(starts[n - 1]),
	};
}

const fakeView = {
	posAtDOM: () => 0,
	posAtCoords: () => 0,
	state: { doc: makeFakeDoc(CALLOUT_SOURCE) },
	dom: { isConnected: true },
	dispatch: () => {},
};

/** 合成 click 的落点记录（模拟 Obsidian 原生折叠处理器：挂在折叠箭头上） */
const foldHits = [];
for (const [label, foldEl] of [
	['主夹具', fx.fold],
	['嵌套外层', fx.outerFold],
	['嵌套内层', fx.innerFold],
]) {
	foldEl.addEventListener('click', (event) => {
		// 只计「本模块重放的合成 click」（tryToggleCalloutFold 里 new 出来的
		// MouseEvent 实例）；夹具派发的真实点击是普通对象、不计 —— 真实点击
		// 到达箭头监听正对应 Obsidian 原生处理器自己被触发，是箭头单击路径
		// 应有的行为（本回归要断言的是「本模块不额外重放」）。
		if (event instanceof MouseEvent) foldHits.push(label);
	});
}

function makeEvent(type, target, x, y) {
	return {
		type,
		target,
		clientX: x,
		clientY: y,
		defaultPrevented: false,
		propagationStopped: false,
		preventDefault() {
			this.defaultPrevented = true;
		},
		stopPropagation() {
			this.propagationStopped = true;
		},
	};
}

/** 真实交互顺序：先 mousedown（记录坐标 / 阻断 CM6 放光标）再 click */
function clickAt(target, x, y) {
	target.dispatchEvent(makeEvent('mousedown', target, x, y));
	const ev = makeEvent('click', target, x, y);
	target.dispatchEvent(ev);
	return ev;
}

const mousedownAt = (target, x, y) => {
	const ev = makeEvent('mousedown', target, x, y);
	target.dispatchEvent(ev);
	return ev;
};

/* ------------------------------------------------------------------ */
/*  断言                                                               */
/* ------------------------------------------------------------------ */

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

console.log('① 可折叠 callout：单击标题区域 → 折叠/展开');
foldHits.length = 0;
let ev = clickAt(fx.titleInner, 200, 150);
check('单击标题文字 → 在折叠箭头上产生一次合成 click', foldHits, ['主夹具']);
check('单击标题文字 → 真实点击被拦截（callout 保持渲染）', ev.defaultPrevented, true);
foldHits.length = 0;
ev = clickAt(fx.icon, 200, 150);
check('单击标题图标 → 同样切换折叠/展开', foldHits, ['主夹具']);
foldHits.length = 0;
ev = clickAt(fx.title, 200, 150);
check('单击标题行本身（图标/文字之间的空隙）→ 同样切换', foldHits, ['主夹具']);

console.log('② 不遮挡「编辑这个区块」按钮（用户明确要求）');
foldHits.length = 0;
ev = clickAt(fx.editBtn, 300, 110);
check('原生编辑按钮单击 → 不触发折叠切换', foldHits, []);
check('原生编辑按钮单击 → 走编辑分支（拦截事件、不落入折叠分支）', ev.defaultPrevented, true);
foldHits.length = 0;
ev = clickAt(fx.touchBtn, 300, 110);
check('触屏编辑按钮单击 → 不触发折叠切换', foldHits, []);
check('触屏编辑按钮单击 → 走编辑分支', ev.defaultPrevented, true);

console.log('③ 交互元素保持原生行为（不与原生折叠叠加）');
foldHits.length = 0;
ev = clickAt(fx.fold, 300, 150);
check('折叠箭头自身单击 → 本模块不重放合成 click（避免切换两次）', foldHits, []);
check('折叠箭头自身单击 → 完全放行（不 preventDefault）', ev.defaultPrevented, false);
foldHits.length = 0;
ev = clickAt(fx.link, 200, 150);
check('标题内链接单击 → 不触发折叠切换', foldHits, []);
check('标题内链接单击 → 完全放行', ev.defaultPrevented, false);

console.log('④ 拖拽选择标题文本不算单击');
foldHits.length = 0;
mousedownAt(fx.titleInner, 200, 150); // 按下在标题文字上
const dragEv = makeEvent('click', fx.titleInner, 200, 190); // 抬起时位移 40px
fx.titleInner.dispatchEvent(dragEv);
check('标题上按住拖拽 40px 后抬起 → 不触发折叠切换', foldHits, []);
check('标题上拖拽 → 仍走常规「保持渲染」拦截', dragEv.defaultPrevented, true);
foldHits.length = 0;
mousedownAt(fx.titleInner, 200, 150);
const jitterEv = makeEvent('click', fx.titleInner, 202, 152); // 位移 2px（单击抖动）
fx.titleInner.dispatchEvent(jitterEv);
check('单击抖动（位移 2px，≤ 阈值 5px）→ 照常切换折叠/展开', foldHits, ['主夹具']);
check('单击抖动 → 真实点击被拦截（保持渲染）', jitterEv.defaultPrevented, true);

console.log('⑤ 不可折叠 callout：标题单击保持原行为');
foldHits.length = 0;
ev = clickAt(fx.titleInner2, 200, 550);
check('标题行内无 .callout-fold → 不触发折叠切换', foldHits, []);
check('不可折叠 callout 标题单击 → 仍只保持渲染', ev.defaultPrevented, true);

console.log('⑥ 嵌套 callout：只切换被点的最近一层');
foldHits.length = 0;
ev = clickAt(fx.innerTitleInner, 200, 800);
check('内层标题单击 → 合成 click 落在内层折叠箭头', foldHits, ['嵌套内层']);
foldHits.length = 0;
ev = clickAt(fx.outerTitle, 200, 750);
check('外层标题单击 → 合成 click 落在外层折叠箭头', foldHits, ['嵌套外层']);

console.log('⑦ 标题区以外：不误触发');
foldHits.length = 0;
ev = clickAt(fx.body, 200, 250);
check('callout 正文区单击 → 不触发折叠切换', foldHits, []);
check('正文区单击 → 常规「保持渲染」拦截', ev.defaultPrevented, true);
foldHits.length = 0;
ev = clickAt(fx.content, 500, 150); // widget 右侧同行空白（几何判定归入该 widget）
check('widget 右侧同行空白单击 → 不触发折叠切换', foldHits, []);
check('右侧同行空白单击 → 常规「保持渲染」拦截', ev.defaultPrevented, true);
foldHits.length = 0;
ev = clickAt(fx.line, 200, 410); // 普通文本行（不在任何 widget 垂直带内）
check('普通文本行单击 → 不触发折叠切换', foldHits, []);
check('普通文本行单击 → 完全不拦截（无过度抑制）', ev.defaultPrevented, false);

console.log('⑧ mousedown 阶段：标题阻断传播（CM6 不放光标），箭头放行');
check('标题 mousedown → stopPropagation（阻断 CM6 把光标放进源码区间）', mousedownAt(fx.titleInner, 200, 150).propagationStopped, true);
check('折叠箭头 mousedown → 不阻断（放行原生）', mousedownAt(fx.fold, 300, 150).propagationStopped, false);

console.log('⑨ 就地编辑会话进行中：标题区不切换折叠');
foldHits.length = 0;
// 经「编辑这个区块」按钮打开**真实**编辑会话（桩 view 供 parseCalloutFromWidget
// 解析源码，openEditor / attachEditorListeners 全流程真实执行）
globalThis.__mdrazorFakeView = fakeView;
clickAt(fx.editBtn, 300, 110);
check('编辑面板已插入 .callout 内（会话确已打开）', fx.callout.querySelector('.mdrazor-callout-editor') !== null, true);
ev = clickAt(fx.icon, 200, 150);
check('会话中单击标题图标 → 不触发折叠切换（取消编辑不重建 widget，避免残留折叠态）', foldHits, []);
check('会话中单击标题图标 → 仍常规拦截（保持渲染）', ev.defaultPrevented, true);
// 「取消」按钮丢弃修改并关闭会话（点面板内按钮不经过本模块的折叠分支）
const cancelBtn = fx.callout.querySelector('.mdrazor-callout-editor-cancel');
clickAt(cancelBtn, 100, 400);
check('取消后面板已拆除（会话关闭）', fx.callout.querySelector('.mdrazor-callout-editor'), null);
foldHits.length = 0;
ev = clickAt(fx.icon, 200, 150);
check('会话关闭后标题单击恢复切换折叠/展开', foldHits, ['主夹具']);

console.log(
	failures.length === 0
		? '\n全部通过。'
		: `\n${failures.length} 项失败：\n  - ${failures.join('\n  - ')}`,
);
process.exitCode = failures.length === 0 ? 0 : 1;
