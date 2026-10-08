/**
 * MDRazor — Callout 增强（Controller）
 *
 * 需求（设置 → 通用 → Callout 增强，默认开启）：
 *   1. 实时预览下，单击 callout 不使其退回纯文本（`>` 引用源码），保持渲染外观；
 *   2. 点击 callout 右上角的「编辑这个区块」按钮时，能在 callout 正常渲染的
 *      外观里直接编辑纯文本内容；
 *   3. 粘贴多行文本时，自动补全换行后的 `>` 并校验；
 *   4. 可折叠 callout（`[!type]+` / `[!type]-`）在实时预览下，单击**标题区域**
 *      （图标 / 标题文字）即切换折叠 / 展开，且不遮挡「编辑这个区块」按钮。
 *
 * ── 机制（读真实 obsidian 1.13.7 的 app.js / app.css 确认，非猜测）──
 *
 * 实时预览的 callout 是 Obsidian 自己的 CM6 **块级 replace widget**：
 *   `.cm-content` → `.cm-embed-block.cm-callout` → `.markdown-rendered` → `.callout`
 * 它**替换掉了 callout 的 `>` 源码行**（渲染态下 `.callout-content` 里没有
 * `.cm-line`/`.HyperMD-quote`）。Obsidian 只在「没有任何选区与 callout 源码区间
 * 重叠」时才发出该 widget：
 *   `m = t.hasFocus ? d.selection.ranges : []`
 *   `b = (e,t) => LL(m,e,t) || OL(g,y,e,t)`
 *   `if (!b(K,G)) C.push(w({widget:o, side:1, block:!0}, K,G))`
 * 其中 `IL(e,t,n){ return e.from<=n && e.to>=t }`，即**选区触碰区间边界也算重叠**。
 *
 * 而单击 callout 会触发 Obsidian 自己的 `hookClickHandler` → `selectElement()`，
 * 后者派发「覆盖整个 callout 源码区间」的选区 —— 这正是「单击 callout 就退回
 * 纯文本」的根因。`Gm()` 挂的 click 监听器在 `event.defaultPrevented` 时会跳过，
 * 因此**在捕获阶段 preventDefault 即可阻止这次选区派发**（需求 1）。
 *
 * ── 需求 2 的设计取舍 ──
 *
 * 因为渲染态 widget 把源码「替换」掉了，不可能在保持官方 widget 的同时就地编辑
 * 那段源码。故采用「**就地替换内容、保留官方外观**」：
 *   - callout 的边框/底色/圆角/配色全部仍由 Obsidian 自己的 `.callout` 元素提供
 *     （主题变量自动生效，外观与官方渲染完全一致）；
 *   - 编辑期间给 `.callout` 加 `mdrazor-callout-editing` 类，用 CSS 隐藏其
 *     `.callout-title` 与 `.callout-content`，并在同一 `.callout` 内插入本模块的
 *     编辑面板（标题输入框 + 正文文本域，图标从原 `.callout-icon` 克隆）；
 *   - 正文文本域高度随内容自适应：input / 粘贴后按 `scrollHeight` 重设高度，
 *     宽度变化（窗口缩放等改变折行数）由 ResizeObserver 兜底重算，始终
 *     不出现滚动条（`fitBodyHeight`）；
 *   - 类型/元数据候选不用原生 `datalist`（弹层尺寸不可控、候选 70 项直接
 *     超出屏幕；按屏幕坐标定位、编辑器滚动时不跟随输入框），改用自带下拉
 *     （`addField`）：绝对定位挂在字段内随编辑器滚动、限高内部滚动、
 *     ↑/↓/Enter/Esc 键盘可选；
 *   - 提交时把「标题 + 正文行」重建为 `> [!type] title` + `> body` 写回文档，
 *     Obsidian 随即重新渲染 callout（编辑面板随 widget 一起被回收）。
 *   - 触屏设备（iPad 等）没有悬停，Obsidian 原生编辑按钮（仅悬停可见）无法
 *     呼出——由 MutationObserver 给 widget 注入本插件自有的编辑按钮
 *     （`TOUCH_EDIT_BUTTON_CLASS`），仅在不具备悬停能力的环境显示；
 *   - 「取消」按钮与 Esc 丢弃修改关闭面板，「完成」与点击面板外提交——
 *     原先三条关闭路径全是提交，改错了无法不写回地退出。
 *
 * 编辑期间**不改文档**（只在提交时派发一次事务），避免 Obsidian 重建 widget 把
 * 编辑面板销毁、打断输入。代价：若编辑期间 widget 因外部原因被重建，未提交的
 * 内容会丢失 —— 面板 DOM 被移除时（`isConnected` 为假）本模块放弃该会话。
 *
 * ── 需求 3：粘贴自动补 `>` 与校验 ──
 *
 * 正文文本域里粘贴多行文本时：先规范化（CRLF/CR → LF、剥掉粘贴内容里已有的
 * `>`/`> ` 前缀以免出现 `> >`、去掉行尾空白），再按光标位置插入；提交时每一行
 * 统一补 `>` 前缀（空行补 `>`），即「换行后自动补全 `>`」。另注册一个保守的
 * CM6 粘贴兜底：光标位于 callout 源码行首且粘贴多行时，同样按 `>` 前缀展开。
 *
 * ── 需求 4 的设计取舍 ──
 *
 * Obsidian 原生的折叠开关只认标题行内的折叠箭头（`.callout-fold`）：标题其余
 * 位置（图标 / 标题文字）单击并不折叠。而本模块为「保持渲染」（需求 1）早已
 * 把标题区的点击整体拦截 —— 不补处理，标题区就是一片死区。故在 click 捕获
 * 分支补一条：命中**可折叠** callout 的标题行、且不是折叠箭头 / 链接等交互
 * 元素（它们在 interactiveInside 已放行）时，拦下这次点击，并**在折叠箭头上
 * 重放一次合成 click**。
 *
 * 为什么不自己切类名 / 写状态：Obsidian 把折叠状态存在哪（`.callout` 上的类、
 * aria 属性、图标旋转）全是内部实现，重放点击与「真实点击箭头」走**同一条
 * 代码路径**，对这些细节零假设；而箭头点击的原生行为本模块本就放行
 * （INTERACTIVE_SELECTOR 含 `.callout-fold`，见 DEBUGLOG 2.6.5 第 4 条），
 * 该路径确定可用。
 *
 * 三个边界：
 *   - 「编辑这个区块」按钮（原生 `.edit-block-button` 与插件触屏按钮）在
 *     handleClick 里排在本分支**之前**分流，永不被遮挡（用户明确要求）；
 *   - 拖拽选择标题文本不算单击：mousedown 与 click 位移超过
 *     TITLE_FOLD_SLOP_PX 时不拦截也不切换，交回常规「保持渲染」路径
 *     （标题文本仍可拖选，见 handleMouseDown 注释）；
 *   - 就地编辑会话进行中不切换（切换不可见，且「取消」不重建 widget 会残留
 *     折叠态，见 tryToggleCalloutFold）。
 */

import { Notice, Plugin, setIcon } from 'obsidian';
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { CALLOUT_HEADER_RE, isQuoteLine, stripQuotePrefix } from './callout-parse';
import { tr } from '../../i18n';

/** 实时预览 callout 块 widget（Obsidian 自身类名，勿改） */
const CALLOUT_WIDGET_SELECTOR = '.cm-embed-block.cm-callout';
/** 「编辑这个区块」按钮（Obsidian 自身类名：.embed-actions > .embed-action.edit-block-button） */
const EDIT_BLOCK_BUTTON_SELECTOR = '.edit-block-button';
/** callout 标题行（Obsidian 自身类名） */
const CALLOUT_TITLE_SELECTOR = '.callout-title';
/**
 * 可折叠 callout 标题行内的折叠箭头（Obsidian 自身类名）。
 * Obsidian 只为可折叠 callout（`[!type]+` / `[!type]-`）渲染该元素，
 * 故「标题行内有 `.callout-fold`」即可判定该 callout 可折叠。
 */
const CALLOUT_FOLD_SELECTOR = '.callout-fold';
/**
 * 单击判定阈值（px）：mousedown 与 click 的位移超过它视为「拖拽选择标题文本」，
 * 不触发折叠切换（标题文本可拖选是本模块既有的交互，见 handleMouseDown 注释）。
 */
const TITLE_FOLD_SLOP_PX = 5;
/** 本模块插入的编辑面板根节点类名 */
const EDITOR_ROOT_CLASS = 'mdrazor-callout-editor';
/**
 * 交互元素：这些元素上的点击必须保留原生行为（打开链接、折叠/展开 callout、
 * 嵌入块内操作、表单控件等），本模块不拦截，否则会破坏 callout 内的正常交互。
 *
 * 注意：判定时必须用 `interactiveInside()` 限定在 widget **内部** —— 见该函数注释。
 */
const INTERACTIVE_SELECTOR =
	'a, button, input, textarea, select, [contenteditable="true"], .callout-fold, .internal-link, .external-link, .markdown-embed, .interactive-child';

/**
 * 点击目标是否落在 widget **内部**的交互元素上。
 *
 * 必须用 `widget.contains(hit)` 限定范围：`[contenteditable="true"]` 会向上匹配到
 * 编辑器自身的 `.cm-content`（它是 widget 的**祖先**）。若不加限定，编辑器内**任何**
 * 点击都会被判成「命中交互元素」而放行，抑制逻辑永不执行 —— 症状就是「单击 callout
 * 仍然退回纯文本」。
 */
function interactiveInside(target: HTMLElement, widget: HTMLElement): boolean {
	const hit = target.closest(INTERACTIVE_SELECTOR);
	return hit !== null && hit !== widget && widget.contains(hit);
}
/** 编辑期间挂在 `.callout` 上的类名（CSS 据此隐藏官方标题文字/正文、显示编辑面板） */
const EDITING_CLASS = 'mdrazor-callout-editing';
/**
 * 编辑期间挂在 widget（`.cm-embed-block.cm-callout`）上的类名。
 * 用于**解除主题对 widget 的限宽**：本库 Callout.css 用 `width: fit-content` +
 * `min-width: 200px`，渲染态 widget 仅 200px 宽，直接在里面放文本域会窄到不可用。
 */
const WIDGET_EDITING_CLASS = 'mdrazor-callout-widget-editing';

/**
 * 本插件自有的「编辑这个区块」按钮（挂在 callout widget 上）。
 *
 * Obsidian 原生按钮（.edit-block-button）的显示由 `.embed-actions` 容器的
 * `opacity: 0` 控制（app.css 实证），仅在 hover 时恢复——触屏设备（iPad 等）
 * 没有 hover，按钮不可见；且 opacity 作用于**容器**，用户对按钮本身写
 * `opacity: 1 !important` 也救不回来（opacity: 0 的父级把整个子树绘制成
 * 全透明，但 hit-testing 仍在——按钮「看不见却摸得着」）。
 * 本按钮仅在不具备 hover 能力的环境（styles.css 的
 * `@media (hover: none) and (pointer: coarse)`）显示，桌面 hover 环境继续用
 * 原生按钮，外观零变化。
 */
const TOUCH_EDIT_BUTTON_CLASS = 'mdrazor-callout-touch-edit-button';

/** callout 首行：可选缩进 + `>` + `[!type]` + 可选折叠标记 + 可选标题 —— 见 callout-parse.ts */

/** 设置读取器（registerCalloutEnhancer 传入；null = 尚未注册） */
let isEnabledRef: (() => boolean) | null = null;
/** 「触屏编辑按钮」子开关读取器（registerCalloutEnhancer 传入） */
let isTouchButtonEnabledRef: (() => boolean) | null = null;
/**
 * 最近一次 mousedown 的视口坐标（click 分支据此区分「单击标题」与
 * 「拖拽选择标题文本」；位移超过 TITLE_FOLD_SLOP_PX 后者不触发折叠切换）。
 */
let lastMouseDownPos: { x: number; y: number } | null = null;

/** callout 源码解析结果 */
interface CalloutSource {
	/** 源码区间起点（首行行首） */
	from: number;
	/** 源码区间终点（末行行尾） */
	to: number;
	/** 引用前缀（含缩进，如 `> ` / `  > `），提交时复用 */
	prefix: string;
	/** callout 类型（如 note / tips / warning） */
	type: string;
	/**
	 * 元数据（`[!type|metadata]` 里 `|` 之后的部分，可为空）。
	 * Obsidian 自身不解释它，只写进 `data-callout-metadata` 供主题/片段选择器使用
	 * （如 MCL 片段的 `center` → `text-align: center`、`notitle` → 隐藏标题）。
	 */
	metadata: string;
	/** 折叠标记：'' | '+' | '-' */
	fold: string;
	/** 标题文本（不含 `[!type]`） */
	title: string;
	/** 正文行（已剥掉 `>` 前缀） */
	body: string[];
}

/** 一次就地编辑会话 */
interface CalloutSession {
	view: EditorView;
	/** callout 块 widget（编辑期间挂 WIDGET_EDITING_CLASS 解除限宽） */
	widgetEl: HTMLElement;
	/** 承载编辑面板的官方 `.callout` 元素（外观由它提供） */
	calloutEl: HTMLElement;
	/** 本模块插入的编辑面板根节点 */
	rootEl: HTMLElement;
	titleInput: HTMLInputElement;
	/** 类型输入框（带候选下拉） */
	typeInput: HTMLInputElement;
	/** 元数据输入框（带候选下拉，如 center / notitle） */
	metaInput: HTMLInputElement;
	/** 折叠选择框（'' | '+' | '-'） */
	foldSelect: HTMLSelectElement;
	bodyInput: HTMLTextAreaElement;
	/** 打开时的源码区间（提交时按它替换） */
	from: number;
	to: number;
	prefix: string;
	/** 打开时的类型（仅用于提交前的「区间是否仍是同一 callout」校验） */
	type: string;
	/** 解除本会话内所有 DOM 监听 */
	dispose: () => void;
}

let session: CalloutSession | null = null;

/**
 * 注册 Callout 增强（onload 调用一次）。
 *
 * 捕获阶段监听 mousedown / click：既阻止「单击 callout 退回纯文本」，
 * 也接管「编辑这个区块」按钮，并在可折叠 callout 的标题区域单击时切换
 * 折叠/展开（见 tryToggleCalloutFold）。CM6 粘贴扩展作为 `>` 补全的兜底路径。
 * 另挂 MutationObserver 为 callout widget 注入触屏编辑按钮（见
 * TOUCH_EDIT_BUTTON_CLASS 注释——原生按钮仅悬停可见，触屏无法呼出）。
 *
 * @param plugin               Plugin 实例（registerDomEvent / registerEditorExtension 保证卸载时清理）
 * @param isEnabled            设置读取器（开关切换无需重注册）
 * @param isTouchButtonEnabled 「触屏编辑按钮」子开关读取器
 */
export function registerCalloutEnhancer(
	plugin: Plugin,
	isEnabled: () => boolean,
	isTouchButtonEnabled: () => boolean,
): void {
	isEnabledRef = isEnabled;
	isTouchButtonEnabledRef = isTouchButtonEnabled;

	// 捕获阶段：必须早于 Obsidian 挂在 .cm-content 上的处理器与它自己的 click 钩子
	plugin.registerDomEvent(
		plugin.app.workspace.containerEl,
		'mousedown',
		(event) => handleMouseDown(event),
		{ capture: true },
	);
	plugin.registerDomEvent(
		plugin.app.workspace.containerEl,
		'click',
		(event) => handleClick(event),
		{ capture: true },
	);

	// 触屏编辑按钮注入：widget 由 Obsidian 频繁重建（光标/编辑每次都可能重建），
	// 增量观察新增节点，出现 widget 就补按钮（幂等）；开关关闭时顺手摘除。
	// 挂 containerEl：主窗口全部编辑器都在其内。popout 的独立窗口不覆盖——
	// 触屏设备（该按钮的目标环境）没有 popout，桌面有原生 hover 按钮。
	// removedNodes 不处理：按钮随 widget 移除自然消失，无泄漏。
	const observer = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			for (const node of Array.from(mutation.addedNodes)) {
				// instanceOf 是跨窗口安全的 instanceof（popout 窗口的节点也能正确判定）
				if (!node.instanceOf(Element)) continue;
				const widget = node.matches(CALLOUT_WIDGET_SELECTOR)
					? (node as HTMLElement)
					: node.closest<HTMLElement>(CALLOUT_WIDGET_SELECTOR);
				if (widget) {
					ensureTouchEditButton(widget);
					continue;
				}
				for (const w of Array.from(
					node.querySelectorAll<HTMLElement>(CALLOUT_WIDGET_SELECTOR),
				)) {
					ensureTouchEditButton(w);
				}
			}
		}
	});
	observer.observe(plugin.app.workspace.containerEl, { childList: true, subtree: true });
	plugin.register(() => observer.disconnect());

	plugin.registerEditorExtension(createCalloutPasteExtension());

	// 主题/片段变更后候选值（类型 / 元数据）可能变化，失效缓存以便下次重扫
	plugin.registerEvent(
		plugin.app.workspace.on('css-change', () => invalidateCalloutSuggestions()),
	);

	plugin.register(() => closeSession(false));
}

/**
 * 确保 callout widget 上有（或没有）触屏编辑按钮，幂等。
 *
 * 开关开启且缺按钮时注入；开关关闭时移除已有按钮。按钮不挂任何监听器：
 * 点击统一由 handleClick 的捕获分支处理（containerEl 上的捕获先于一切
 * 冒泡），因此无需清理事件监听。
 */
function ensureTouchEditButton(widget: HTMLElement): void {
	const active = Boolean(isEnabledRef?.()) && Boolean(isTouchButtonEnabledRef?.());
	const existing = widget.querySelector('.' + TOUCH_EDIT_BUTTON_CLASS);
	if (!active) {
		existing?.remove();
		return;
	}
	if (existing) return;
	const btn = widget.createEl('button', { cls: TOUCH_EDIT_BUTTON_CLASS });
	btn.setAttribute('type', 'button');
	btn.setAttribute('aria-label', tr('编辑这个区块', 'Edit this block'));
	setIcon(btn, 'pencil');
}

/**
 * 全量重扫主窗口所有 callout widget，按当前开关补/摘触屏编辑按钮。
 *
 * 由 controller/main.ts 的 syncConfig() 在每次设置保存后调用：
 * 「触屏编辑按钮」开关切换即时生效（MutationObserver 只看新增节点，
 * 开关翻转不会触发 DOM 变化，需要这里显式刷新）。
 */
export function refreshTouchEditButtons(): void {
	const container = isEnabledRef ? document.querySelector('.workspace') : null;
	if (!container) return;
	for (const widget of Array.from(
		container.querySelectorAll<HTMLElement>(CALLOUT_WIDGET_SELECTOR),
	)) {
		ensureTouchEditButton(widget);
	}
}

/**
 * 解析点击所属的 callout 块 widget。
 *
 * 先走 DOM 祖先链；未命中时退回**几何判定**。
 *
 * 为什么需要几何判定（实测数据）：callout widget 的宽度由主题决定，本库的
 * `Callout.css` 用 `width: fit-content` + `min-width: 200px`，实测 widget 盒仅
 * **200px 宽**，而 `.cm-content` 宽 **900px** —— 于是 callout **右侧同一行的空白区
 * 并不属于 widget，而是 `.cm-content` 本身**（`elementFromPoint` 实测返回
 * `DIV.cm-content`）。`closest('.cm-embed-block.cm-callout')` 因此找不到 widget，
 * 抑制逻辑被跳过，点这块空白照样退回纯文本。但那一行在语义上就是 callout 所在行，
 * 故用「点击 Y 落在 widget 垂直范围内、且 X 在其左边界之后」补判。
 *
 * 只处理 `.cm-content` 内的点击，且要求 Y 落在某个 widget 的垂直带内 ——
 * 普通文本行的 Y 不会与 callout 的垂直带重叠，故不会误伤正常点击。
 */
function resolveCalloutWidget(target: HTMLElement, event: MouseEvent): HTMLElement | null {
	const direct = target.closest<HTMLElement>(CALLOUT_WIDGET_SELECTOR);
	if (direct) return direct;

	const editorEl = target.closest<HTMLElement>('.cm-editor');
	if (!editorEl) return null;
	const content = editorEl.querySelector<HTMLElement>('.cm-content');
	if (!content) return null;

	const contentRect = content.getBoundingClientRect();
	if (
		event.clientX < contentRect.left ||
		event.clientX > contentRect.right ||
		event.clientY < contentRect.top ||
		event.clientY > contentRect.bottom
	) {
		return null;
	}

	const widgets = content.querySelectorAll<HTMLElement>(CALLOUT_WIDGET_SELECTOR);
	for (const widget of Array.from(widgets)) {
		const rect = widget.getBoundingClientRect();
		if (event.clientY >= rect.top && event.clientY <= rect.bottom && event.clientX >= rect.left) {
			return widget;
		}
	}
	return null;
}

/**
 * 捕获阶段 mousedown：点击落在 callout（widget 本体**或其右侧同一行的空白区**）时
 * 只 `stopPropagation()`，阻断 CM6 的 MouseSelection 把光标放进 callout 源码区间
 * （边界也算重叠，放进去即会退回纯文本）。
 *
 * **有意不 `preventDefault()`** —— 保留浏览器原生的文本选择，用户才能在渲染后的
 * callout 里用鼠标拖选文本（需求：保持渲染的同时可选中文本）。实测（obsidian
 * 1.13.7）在 widget 内建立 DOM 选区后 widget 依然渲染（`widgetStillRendered: true`、
 * `.HyperMD-quote` 行数为 0、CM6 选区不动），即 CM6 不会同步落在 widget 内的 DOM 选区，
 * 故不 preventDefault 是安全的。
 *
 * 例外：
 *   - 编辑面板内部 → 完全放行；
 *   - 其他交互元素（链接 / 折叠箭头 / 嵌入块 / 表单控件）→ 放行原生行为；
 *   - 可折叠 callout 的标题区域 → 同样阻断传播（单击切换折叠/展开由 click
 *     分支的 tryToggleCalloutFold 处理，mousedown 这里只负责让 widget 不被撤掉）。
 */
function handleMouseDown(event: MouseEvent): void {
	if (!isEnabledRef?.()) return;
	// 记录坐标：click 分支靠它区分「单击标题（切换折叠）」与「拖拽选择标题文本」
	lastMouseDownPos = { x: event.clientX, y: event.clientY };
	const target = eventTargetElement(event);
	if (!target) return;
	// 编辑面板自身（输入框、按钮）需要正常获得焦点与默认行为
	if (target.closest(`.${EDITOR_ROOT_CLASS}`)) return;
	const widget = resolveCalloutWidget(target, event);
	if (!widget) return;
	if (!target.closest(EDIT_BLOCK_BUTTON_SELECTOR) && !target.closest('.' + TOUCH_EDIT_BUTTON_CLASS) && interactiveInside(target, widget)) {
		return;
	}
	// 仅阻断传播，不 preventDefault（保留原生文本选择）
	event.stopPropagation();
}

/**
 * 捕获阶段 click：
 *   - 「编辑这个区块」按钮 → 打开就地编辑面板（并阻止 Obsidian 的整段选区派发）；
 *   - callout 内的交互元素 → 放行原生行为；
 *   - 可折叠 callout 的标题区域（非交互元素）→ 切换折叠/展开（见 tryToggleCalloutFold）；
 *   - callout 其他位置（含其右侧同一行的空白区）→ 阻止默认，callout 保持渲染。
 */
function handleClick(event: MouseEvent): void {
	if (!isEnabledRef?.()) return;
	const target = eventTargetElement(event);
	if (!target) return;
	if (target.closest(`.${EDITOR_ROOT_CLASS}`)) return;
	const widget = resolveCalloutWidget(target, event);
	if (!widget) return;

	if (target.closest(EDIT_BLOCK_BUTTON_SELECTOR)) {
		// 阻止 Obsidian hookClickHandler → selectElement() 派发整段选区
		event.preventDefault();
		event.stopPropagation();
		const view = viewFromElement(widget);
		if (view) openEditor(view, widget);
		return;
	}

	// 本插件自有的触屏编辑按钮（TOUCH_EDIT_BUTTON_CLASS）：与原生按钮同义。
	// 按钮 DOM 在 widget 内（button 命中 INTERACTIVE_SELECTOR 的 `button`），
	// 必须在 interactiveInside 放行之前分流。
	if (target.closest('.' + TOUCH_EDIT_BUTTON_CLASS)) {
		event.preventDefault();
		event.stopPropagation();
		const view = viewFromElement(widget);
		if (view) openEditor(view, widget);
		return;
	}

	// 链接 / 折叠箭头等交互元素保持原生行为
	if (interactiveInside(target, widget)) return;

	// 可折叠 callout 的标题区域：单击切换折叠/展开（在折叠箭头上重放合成
	// click，折叠状态切换完全交给 Obsidian 原生处理器，详见 tryToggleCalloutFold）
	if (tryToggleCalloutFold(target, widget, event)) return;

	// 阻止 Obsidian selectElement() 派发整段选区 → callout 保持渲染
	event.preventDefault();
	event.stopPropagation();
}

/**
 * 可折叠 callout 的标题区域单击 → 切换折叠 / 展开。
 *
 * Obsidian 原生的折叠开关只认标题行内的折叠箭头（`.callout-fold`）：标题其余
 * 位置（图标 / 标题文字）单击并不折叠，而本模块为「保持渲染」又早已把标题区
 * 的点击整体拦截（见 handleClick 末两条）—— 不补处理它就是死区。
 *
 * 做法是**在折叠箭头上重放一次合成 click**，而不是自己切类名 / 写状态：
 * Obsidian 把折叠状态存在哪（`.callout` 上的类、aria 属性、图标旋转）全是
 * 内部实现，重放点击与「真实点击箭头」走同一条代码路径，零假设；且箭头点击
 * 的原生行为本模块本就放行（INTERACTIVE_SELECTOR 含 `.callout-fold`），该
 * 路径确定可用。合成事件 `bubbles: true`：无论 Obsidian 的处理器挂在箭头
 * 本身、标题行还是更上层，都与真实点击箭头等价可达；`cancelable: true`：
 * 处理器若 preventDefault 不会触发「非可取消事件」告警。
 *
 * 约束（对应用户要求「不能遮挡编辑这个区块按钮」与「标题文本可拖选」）：
 *   - 「编辑这个区块」按钮（原生 `.edit-block-button` 与插件触屏按钮）在
 *     handleClick 里排在本函数之前分流，永不会被本分支吞掉；
 *   - 折叠箭头自身的点击在 interactiveInside 已放行走原生，不会走到这里
 *     （否则合成点击会与原生切换叠加成两次）；
 *   - 拖拽选择标题文本不算单击：mousedown 与 click 位移超过
 *     TITLE_FOLD_SLOP_PX 时返回 false，交回 handleClick 的常规拦截
 *     （保持渲染 + 允许拖选），不切换折叠；
 *   - 就地编辑会话进行中不切换（此时标题行内是标题输入框，点图标等位置
 *     切换折叠不可见，且「取消」不重建 widget、折叠类会残留）。
 *
 * @returns 是否已处理本次点击（true = 调用方应直接 return）
 */
function tryToggleCalloutFold(target: HTMLElement, widget: HTMLElement, event: MouseEvent): boolean {
	// 编辑会话进行中：可点的标题区必在**编辑中的那个 callout** 内（点别处已
	// 在 mousedown 阶段被 onOutsidePointer 提交并关闭会话），此时切换折叠
	// 没有视觉反馈，且 closeSession(false)（取消）不重建 widget，Obsidian
	// 的 is-collapsed 类会残留在 `.callout` 上 —— 取消编辑后 callout 停在
	// 折叠态。故编辑期间标题区保持既有行为（常规「保持渲染」拦截）。
	if (session) return false;
	const titleEl = target.closest<HTMLElement>(CALLOUT_TITLE_SELECTOR);
	// widget.contains 限定范围：嵌套 callout 只切换被点的最近一层
	if (!titleEl || !widget.contains(titleEl)) return false;
	// 标题行内没有折叠箭头 → 该 callout 不可折叠（Obsidian 只为可折叠
	// callout 渲染 .callout-fold），不属于本分支
	const foldEl = titleEl.querySelector<HTMLElement>(CALLOUT_FOLD_SELECTOR);
	if (!foldEl) return false;
	// 拖拽选择（mousedown → mouseup 有明显位移）不当单击：不拦截、不切换，
	// 让 handleClick 走常规的「保持渲染」路径，标题文本照常可拖选
	if (
		lastMouseDownPos &&
		(Math.abs(event.clientX - lastMouseDownPos.x) > TITLE_FOLD_SLOP_PX ||
			Math.abs(event.clientY - lastMouseDownPos.y) > TITLE_FOLD_SLOP_PX)
	) {
		return false;
	}
	// 先拦下这次真实点击（阻止 Obsidian hookClickHandler → selectElement()
	// 把 callout 退回纯文本），再在折叠箭头上重放一次合成 click ——
	// 折叠/展开完全由 Obsidian 自己的处理器完成
	event.preventDefault();
	event.stopPropagation();
	foldEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
	return true;
}

/** 取事件目标元素（文本节点时回退父元素） */
function eventTargetElement(event: Event): HTMLElement | null {
	const raw: unknown = event.target;
	if (raw instanceof Element) return raw as HTMLElement;
	if (raw instanceof Node) return raw.parentElement;
	return null;
}

/** 由 widget 内的任意元素反查所属 EditorView */
function viewFromElement(el: HTMLElement): EditorView | null {
	const editorEl = el.closest<HTMLElement>('.cm-editor');
	if (!editorEl) return null;
	try {
		return EditorView.findFromDOM(editorEl);
	} catch {
		return null;
	}
}

/**
 * 解析包含 pos 的 callout 源码区间。
 *
 * 以 pos 所在行向上/向下扩展到连续的引用行，首行必须匹配 `[!type]` 头；
 * 否则视为普通引用块，返回 null（绝不误伤普通 blockquote）。
 */
function parseCalloutAt(view: EditorView, pos: number): CalloutSource | null {
	const doc = view.state.doc;
	if (pos < 0 || pos > doc.length) return null;
	const line = doc.lineAt(pos);

	let first = line.number;
	while (first > 1 && isQuoteLine(doc.line(first - 1).text)) first--;
	let last = line.number;
	while (last < doc.lines && isQuoteLine(doc.line(last + 1).text)) last++;

	const header = doc.line(first);
	const m = CALLOUT_HEADER_RE.exec(header.text);
	if (!m) return null;

	// `[!type|metadata]`：Obsidian 把整段放进 data-callout-metadata，
	// 类型取 `|` 之前、元数据取之后（无 `|` 时元数据为空）
	const rawType = m[2] ?? '';
	const pipe = rawType.indexOf('|');
	const type = pipe >= 0 ? rawType.slice(0, pipe) : rawType;
	const metadata = pipe >= 0 ? rawType.slice(pipe + 1) : '';

	const body: string[] = [];
	for (let n = first + 1; n <= last; n++) {
		body.push(stripQuotePrefix(doc.line(n).text));
	}

	return {
		from: header.from,
		to: doc.line(last).to,
		prefix: m[1] ?? '> ',
		type,
		metadata,
		fold: m[3] ?? '',
		title: m[4] ?? '',
		body,
	};
}

/**
 * 由 callout 块 widget 的 DOM 反查其源码区间。
 *
 * 不依赖单一映射：块级 replace widget 的 `posAtDOM` 在不同 CM6 版本上可能落在
 * 区间起点、终点或紧邻位置，故同时用「DOM 映射」与「坐标映射」两条路径取候选
 * 位置，再各自尝试 ±1 偏移，取第一个能解析出 callout 的结果。
 * 解析失败（普通引用块 / 映射异常）返回 null —— 宁可不打开面板，也不误伤。
 */
function parseCalloutFromWidget(view: EditorView, widgetEl: HTMLElement): CalloutSource | null {
	const candidates: number[] = [];
	try {
		candidates.push(view.posAtDOM(widgetEl, 0));
	} catch {
		// posAtDOM 不可用：仅依赖坐标映射
	}
	try {
		const rect = widgetEl.getBoundingClientRect();
		if (rect.height > 0) {
			const pos = view.posAtCoords({ x: rect.left + 2, y: rect.top + rect.height / 2 });
			if (pos !== null) candidates.push(pos);
		}
	} catch {
		// 坐标映射失败：忽略该候选
	}

	const docLength = view.state.doc.length;
	for (const candidate of candidates) {
		for (const delta of [0, -1, 1]) {
			const pos = Math.max(0, Math.min(docLength, candidate + delta));
			const src = parseCalloutAt(view, pos);
			if (src) return src;
		}
	}
	return null;
}

/**
 * 规范化「正文纯文本」：CRLF/CR → LF；剥掉粘贴内容里已有的 `>`/`> ` 前缀
 * （校验：避免在 callout 里出现 `> >` 双层引用）；去掉行尾空白。
 */
export function normalizeBodyText(text: string): string[] {
	return text
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((l) => stripQuotePrefix(l).replace(/\s+$/, ''));
}

/**
 * 把类型 / 元数据 / 折叠标记 / 标题与正文行重建为 callout 源码
 * （需求 3：每行补 `>`；空行补 `>` 本身）。
 *
 * 头部形如 `> [!type|metadata]+ title`：`|metadata` 仅在非空时输出，
 * 折叠标记 `+`（可折叠·默认展开）/ `-`（可折叠·默认折叠）/ 空（不可折叠）
 * 紧跟 `]` 之后。标题里的换行会被压成空格（校验：标题只能是单行）。
 */
export function buildCalloutText(
	prefix: string,
	type: string,
	metadata: string,
	fold: string,
	title: string,
	body: string[],
): string {
	const safeTitle = title.replace(/[\r\n]+/g, ' ').trim();
	// 类型/元数据里不允许出现 `]` `|` 或换行，否则会破坏头部语法（校验）
	const safeType = type.replace(/[\]|\r\n]+/g, '').trim() || 'note';
	const safeMeta = metadata.replace(/[\]\r\n]+/g, '').trim();
	const marker = `${safeType}${safeMeta ? '|' + safeMeta : ''}`;
	const head = `${prefix}[!${marker}]${fold}${safeTitle ? ' ' + safeTitle : ''}`;
	const quote = prefix.replace(/\s+$/, '');
	const lines = body.map((l) => (l === '' ? quote : prefix + l));
	return [head, ...lines].join('\n');
}

/* ------------------------------------------------------------------ */
/*  类型 / 元数据候选值                                                */
/* ------------------------------------------------------------------ */

/** Obsidian 内置 callout 类型（官方文档所列，含全部别名） */
const BUILTIN_CALLOUT_TYPES = [
	'note',
	'abstract', 'summary', 'tldr',
	'info',
	'todo',
	'tip', 'hint', 'important',
	'success', 'check', 'done',
	'question', 'help', 'faq',
	'warning', 'caution', 'attention',
	'failure', 'fail', 'missing',
	'danger', 'error',
	'bug',
	'example',
	'quote', 'cite',
];

/**
 * 候选值缓存（样式表扫描较贵，按 css-change 失效）。
 *
 * 注意这里**不预置任何元数据取值**：元数据完全是主题/片段的扩展点，
 * Obsidian 自身不解释、也不存在「原生支持的元数据」。预置 `center` 之类的
 * 约定值会让用户以为选中即生效，实际却什么都不做（本库实测：`center` 依赖的
 * MCL 片段并未启用，`data-callout-metadata` 在整个样式表里一个都没有）。
 * 故元数据候选只来自「当前文档实际在用的取值」与「已加载样式表真正定义的取值」。
 */
let cssSuggestionCache: { types: string[]; metadata: string[] } | null = null;

/** 清空候选值缓存（样式表变更后调用） */
export function invalidateCalloutSuggestions(): void {
	cssSuggestionCache = null;
}

/** 递归收集一条 CSS 规则里的 data-callout / data-callout-metadata 取值 */
function collectFromRule(rule: CSSRule, types: Set<string>, meta: Set<string>, depth: number): void {
	if (depth > 6) return;
	const grouping = rule as CSSGroupingRule;
	if (grouping.cssRules) {
		for (const inner of Array.from(grouping.cssRules)) {
			collectFromRule(inner, types, meta, depth + 1);
		}
	}
	const selector = (rule as CSSStyleRule).selectorText;
	if (!selector) return;
	for (const m of selector.matchAll(/\[data-callout\s*[*~|^$]?=\s*["']?([A-Za-z0-9_-]+)/g)) {
		if (m[1]) types.add(m[1]);
	}
	for (const m of selector.matchAll(/\[data-callout-metadata\s*[*~|^$]?=\s*["']?([A-Za-z0-9_-]+)/g)) {
		if (m[1]) meta.add(m[1]);
	}
}

/**
 * 汇总可用的 callout 类型与元数据候选值，供编辑面板的下拉使用。
 *
 * 三个来源合并：
 *   1. **内置类型列表** —— Obsidian 官方文档所列类型（含全部别名）；
 *   2. **已加载样式表** —— 扫描 `data-callout` / `data-callout-metadata` 选择器，
 *      能捞到主题/片段自定义的取值（本库实测捞到 38 个类型，含 kanban /
 *      timeline / def 等）。跨域样式表读 `cssRules` 会抛错，逐表 try/catch 跳过；
 *   3. **当前文档** —— 扫正文里已出现的 `[!type|metadata]`，把用户实际在用的
 *      取值纳入（本库笔记大量用 `|notitle`，而该值并未定义在任何已加载片段里，
 *      只靠扫样式表会漏掉）。
 *
 * 元数据**不预置任何取值**（见 cssSuggestionCache 注释）：只有真正在用或
 * 真正被样式定义的值才会出现在候选里；输入框始终可自由填写。
 *
 * @param docText 当前文档文本（可选；传入则并入来源 3）
 */
function getCalloutSuggestions(docText?: string): { types: string[]; metadata: string[] } {
	if (!cssSuggestionCache) {
		const types = new Set<string>(BUILTIN_CALLOUT_TYPES);
		const meta = new Set<string>();
		for (const sheet of Array.from(activeDocument.styleSheets)) {
			let rules: CSSRuleList | null = null;
			try {
				rules = sheet.cssRules;
			} catch {
				continue; // 跨域样式表：不可读，跳过
			}
			if (!rules) continue;
			for (const rule of Array.from(rules)) {
				collectFromRule(rule, types, meta, 0);
			}
		}
		cssSuggestionCache = { types: Array.from(types), metadata: Array.from(meta) };
	}

	const types = new Set(cssSuggestionCache.types);
	const metadata = new Set(cssSuggestionCache.metadata);
	if (docText) {
		for (const m of docText.matchAll(/\[!([^\]|\r\n]+)(?:\|([^\]\r\n]+))?\]/g)) {
			const t = m[1]?.trim();
			const d = m[2]?.trim();
			if (t) types.add(t);
			if (d) metadata.add(d);
		}
	}
	const byName = (a: string, b: string): number => a.localeCompare(b);
	return { types: Array.from(types).sort(byName), metadata: Array.from(metadata).sort(byName) };
}

/* ------------------------------------------------------------------ */
/*  就地编辑面板                                                       */
/* ------------------------------------------------------------------ */

/** 打开就地编辑面板（已有会话先提交，保证同时只有一个） */
function openEditor(view: EditorView, widgetEl: HTMLElement): void {
	// 先提交上一个会话：提交会派发事务、触发 Obsidian 重建 widget，
	// 必须在抓取任何 DOM 引用之前完成，否则会把面板建到已脱离文档的节点上。
	closeSession(true);

	// 上面的提交（或本次点击前的重渲染）可能已让该 widget 脱离文档，此时放弃
	if (!widgetEl.isConnected) return;
	const src = parseCalloutFromWidget(view, widgetEl);
	if (!src) return;
	const calloutEl = widgetEl.querySelector<HTMLElement>('.callout');
	if (!calloutEl) return;

	// 标题输入框插进**官方 `.callout-title` 行内**（而不是另起一行重画）：
	// 这样官方图标、整行的 gap/padding、`color: rgb(var(--callout-color))`、
	// `font-size: var(--callout-title-size)` 全部原样继承 —— 编辑态的标题行
	// 与渲染态逐像素同源，只需用 CSS 隐藏官方 `.callout-title-inner` 的文字。
	const titleRow = calloutEl.querySelector<HTMLElement>('.callout-title');
	const titleInput = titleRow
		? titleRow.createEl('input', { cls: 'mdrazor-callout-editor-title-input', type: 'text' })
		: calloutEl.createEl('input', { cls: 'mdrazor-callout-editor-title-input', type: 'text' });
	titleInput.value = src.title;

	// 正文文本域挂在 `.callout` 下、官方 `.callout-content` 之后，
	// 并由 CSS 复刻 `.callout-content` 的内边距与背景。
	//
	// 内边距**读官方元素的实际计算值**而不是用 `--callout-content-padding`：
	// 实测本库该变量解析为 0（官方 `.callout-content` 的计算内边距其实是
	// `0px 12px`，来自主题/片段的直接声明），照抄变量会让文本域贴边。
	const contentEl = calloutEl.querySelector<HTMLElement>('.callout-content');
	const contentStyle = contentEl ? window.getComputedStyle(contentEl) : null;

	const rootEl = calloutEl.createDiv({ cls: EDITOR_ROOT_CLASS });

	// 头部属性行：类型（带候选下拉）/ 元数据（带候选下拉）/ 折叠
	// 传入当前文档文本，把用户实际在用的类型/元数据取值并入候选
	const suggestions = getCalloutSuggestions(view.state.doc.toString());
	const metaRow = rootEl.createDiv({ cls: 'mdrazor-callout-editor-meta' });
	const typeInput = addField(metaRow, tr('类型', 'Type'), src.type, suggestions.types);
	const metaInput = addField(metaRow, tr('元数据', 'Metadata'), src.metadata, suggestions.metadata);

	// 折叠：对应 `[!type]` 之后的 `+` / `-`
	const foldField = metaRow.createDiv({ cls: 'mdrazor-callout-editor-field' });
	foldField.createSpan({ cls: 'mdrazor-callout-editor-field-label', text: tr('折叠', 'Collapse') });
	const foldSelect = foldField.createEl('select', { cls: 'mdrazor-callout-editor-fold' });
	const foldOptions: Array<[string, string]> = [
		['', tr('不折叠', 'Not collapsible')],
		['+', tr('可折叠 · 默认展开', 'Collapsible, expanded')],
		['-', tr('可折叠 · 默认折叠', 'Collapsible, collapsed')],
	];
	for (const [value, label] of foldOptions) {
		foldSelect.createEl('option', { value, text: label });
	}
	foldSelect.value = src.fold;

	const bodyInput = rootEl.createEl('textarea', {
		cls: 'mdrazor-callout-editor-body',
	});
	bodyInput.value = src.body.join('\n');
	if (contentStyle) {
		bodyInput.setCssProps({
			'--mdrazor-callout-content-padding': contentStyle.padding,
			'--mdrazor-callout-content-bg': contentStyle.backgroundColor,
		});
	}

	const actions = rootEl.createDiv({ cls: 'mdrazor-callout-editor-actions' });
	// 取消（丢弃修改并关闭）：触屏用户的补漏——原先 Done / 点面板外 / Esc
	// 全是提交，改错了没有任何不写回的退出路径
	const cancelBtn = actions.createEl('button', { cls: 'mdrazor-callout-editor-cancel' });
	cancelBtn.setText(tr('取消', 'Cancel'));
	const doneBtn = actions.createEl('button', { cls: 'mdrazor-callout-editor-done' });
	doneBtn.setText(tr('完成', 'Done'));

	// 隐藏官方标题文字与正文（图标/底色/边框/圆角全部保留），并解除 widget 限宽
	calloutEl.addClass(EDITING_CLASS);
	widgetEl.addClass(WIDGET_EDITING_CLASS);

	// 自适应增高首测：必须量在 WIDGET_EDITING_CLASS（解除限宽）挂上之后，
	// 否则按渲染态 200px 宽的 widget 折行，首测高度虚高
	fitBodyHeight(bodyInput);

	const dispose = attachEditorListeners({ calloutEl, titleInput, bodyInput, cancelBtn, doneBtn });

	session = {
		view,
		widgetEl,
		calloutEl,
		rootEl,
		titleInput,
		typeInput,
		metaInput,
		foldSelect,
		bodyInput,
		from: src.from,
		to: src.to,
		prefix: src.prefix,
		type: src.type,
		dispose,
	};

	// 光标默认落在正文；标题为空时先让用户填标题
	window.setTimeout(() => {
		if (!session || session.rootEl !== rootEl) return;
		(src.title ? bodyInput : titleInput).focus();
		if (src.title) bodyInput.setSelectionRange(0, 0);
	}, 0);
}

/**
 * 在属性行里加一个「标签 + 输入框 + 自定义候选下拉」字段。
 *
 * 不用原生 `input[list]` + `datalist`（首版实现，用户实测两处硬伤）：
 *   - 弹层由浏览器绘制，**尺寸与样式都不可控** —— 类型候选是「内置 30+ 项
 *     ∪ 主题/片段扫描值 ∪ 当前文档在用值」（实测 70 项），弹层直接超出屏幕；
 *   - 弹层按**屏幕坐标**定位且由浏览器管理，编辑器滚动时留在原地、输入框
 *     随内容滚走（Chromium 对嵌套滚动容器里的原生弹层不会重定位）。
 * 故改为自带下拉：绝对定位挂在字段内（字段是定位锚点），与编辑器内容同处
 * 一个滚动上下文 —— **滚动跟随由结构保证**，无需监听 scroll 重定位；限高
 * 内部滚动；按输入过滤；↑/↓ 环绕选择、Enter 选中、Esc 先关下拉再谈提交。
 *
 * 仍保留「自由输入 + 候选」而非 `select`：可填主题里自定义、但未被扫描到
 * 的取值（候选取值的三个来源见 getCalloutSuggestions）。
 *
 * @returns 输入框元素（closeSession 读取其 value）
 */
function addField(
	parent: HTMLElement,
	label: string,
	value: string,
	suggestions: string[],
): HTMLInputElement {
	const field = parent.createDiv({ cls: 'mdrazor-callout-editor-field' });
	field.createSpan({ cls: 'mdrazor-callout-editor-field-label', text: label });
	const input = field.createEl('input', {
		cls: 'mdrazor-callout-editor-field-input',
		type: 'text',
	});
	input.value = value;
	// 关掉浏览器自动补全，避免和候选下拉叠两层
	input.setAttribute('autocomplete', 'off');
	input.setAttribute('aria-expanded', 'false');

	const dropdown = field.createDiv({ cls: 'mdrazor-callout-editor-suggest' });
	dropdown.setAttribute('role', 'listbox');

	/** 当前过滤结果（与 dropdown 里的条目一一对应，供 Enter 取值） */
	let matched: string[] = [];
	/** 键盘导航的活动项下标（-1 = 关闭态） */
	let active = -1;

	const isOpen = (): boolean => dropdown.hasClass('is-open');

	const setActive = (index: number): void => {
		const items = Array.from(dropdown.querySelectorAll<HTMLElement>('.mdrazor-callout-editor-suggest-item'));
		if (items.length === 0) return;
		active = Math.max(0, Math.min(items.length - 1, index));
		items.forEach((el, i) => el.classList.toggle('is-active', i === active));
		const el = items[active];
		if (el) el.scrollIntoView({ block: 'nearest' });
	};

	const close = (): void => {
		dropdown.removeClass('is-open');
		input.setAttribute('aria-expanded', 'false');
		active = -1;
	};

	const select = (value: string): void => {
		input.value = value;
		close();
		// 光标落到末尾，便于继续微调
		input.setSelectionRange(value.length, value.length);
	};

	const open = (): void => {
		// 按当前输入过滤（不区分大小写的子串；空串显示全部），每次重建条目
		const query = input.value.trim().toLowerCase();
		matched = suggestions.filter((s) => s.toLowerCase().includes(query));
		dropdown.empty();
		for (const s of matched) {
			const item = dropdown.createDiv({ cls: 'mdrazor-callout-editor-suggest-item', text: s });
			item.setAttribute('role', 'option');
			// 选中挂在 pointerdown 而非 click：dropdown 层对 pointerdown
			// preventDefault 后兼容鼠标事件（含 click）不再派发（见下）
			item.addEventListener('pointerdown', () => select(s));
		}
		if (matched.length === 0) {
			// 无匹配也要收起，不能留下一个空弹层
			close();
			return;
		}
		dropdown.addClass('is-open');
		input.setAttribute('aria-expanded', 'true');
		// 先按默认向下展开并量出实际高度，再按「输入框到滚动容器底/顶的剩余
		// 空间」决定是否向上翻（+4px 是展开位与输入框之间那条 CSS 间隙
		// --size-4-1），面板贴近视口底部时不被裁。只在展开时算一次：此后
		// 滚动由绝对定位天然跟随，无需重算。
		dropdown.removeClass('is-up');
		const rect = input.getBoundingClientRect();
		const scroller =
			input.closest<HTMLElement>('.cm-scroller') ?? dropdown.ownerDocument.documentElement;
		const box = scroller.getBoundingClientRect();
		const below = box.bottom - rect.bottom;
		const above = rect.top - box.top;
		if (dropdown.offsetHeight + 4 > below && above > below) dropdown.addClass('is-up');
		setActive(0);
	};

	// 在下拉内任意处按下都不让输入框失焦 —— blur 会先一步收起下拉，条目就点
	// 不到了。注意 2026-09-23 第 13 条的坑在这里同样成立：pointerdown 上
	// preventDefault 会取消后续兼容鼠标事件（mousedown/click），故选中逻辑
	// 直接挂在条目的 pointerdown 上，不依赖 click。
	dropdown.addEventListener('pointerdown', (event) => event.preventDefault());

	// 聚焦 / 点击 / 输入都（重新）展开并按当前值过滤；失焦收起 —— 点条目
	// 已被上面的 preventDefault 保住焦点，Tab 离开或点到别处则正常收起
	input.addEventListener('focus', open);
	input.addEventListener('click', open);
	input.addEventListener('input', open);
	input.addEventListener('blur', close);

	input.addEventListener('keydown', (event) => {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			if (!isOpen()) {
				open();
				return;
			}
			const count = dropdown.children.length;
			if (count === 0) return;
			// 环绕：首尾相接
			const dir = event.key === 'ArrowDown' ? 1 : -1;
			setActive((active + dir + count) % count);
			return;
		}
		if (event.key === 'Enter' && isOpen()) {
			// 阻断冒泡：面板级 keydown 对 Enter/Escape 另有语义
			event.preventDefault();
			event.stopPropagation();
			const picked = active >= 0 ? matched[active] : undefined;
			if (picked !== undefined) select(picked);
			return;
		}
		if (event.key === 'Escape' && isOpen()) {
			// 下拉展开时 Esc 只关下拉（阻断冒泡：面板级 Esc 是「取消并关闭
			// 整个会话」）；已关闭时放行冒泡，维持面板原有取消行为
			event.preventDefault();
			event.stopPropagation();
			close();
		}
	});

	return input;
}

/**
 * 绑定编辑面板的交互。
 *
 * 关键：编辑面板位于 `.cm-content` 内部，其 keydown/input/paste 等事件会冒泡到
 * CM6 的处理器，导致 CM6 同时改文档（光标乱跳、内容被改）。故对面板内的这些
 * 事件一律 stopPropagation，把编辑行为完全收归本模块。
 */
function attachEditorListeners(parts: {
	calloutEl: HTMLElement;
	titleInput: HTMLInputElement;
	bodyInput: HTMLTextAreaElement;
	cancelBtn: HTMLButtonElement;
	doneBtn: HTMLButtonElement;
}): () => void {
	const { calloutEl, titleInput, bodyInput, cancelBtn, doneBtn } = parts;

	// 阻止面板事件冒泡进 CM6（含 Obsidian 自己的捕获监听器）。
	// 挂在 `.callout` 上而非面板根节点：标题输入框位于官方 `.callout-title` 内，
	// 不在面板根节点里，只挂根节点会漏掉它。
	// paste/drop 也在列：正文文本域有自己的处理器，但类型/元数据输入框没有 ——
	// 若放行，粘贴兜底扩展在「CM 选区恰位于 callout 源码行首」时会把粘贴内容
	// 写进文档、触发 widget 重建，编辑面板连同未提交内容当场销毁。
	const swallow = (event: Event): void => {
		event.stopPropagation();
	};
	const swallowedEvents = [
		'keydown',
		'keypress',
		'keyup',
		'beforeinput',
		'input',
		'paste',
		'drop',
		'cut',
		'copy',
		'mousedown',
		'mouseup',
		'click',
		'dblclick',
		'pointerdown',
		'pointerup',
		'focusin',
		'focusout',
	] as const;
	for (const type of swallowedEvents) {
		calloutEl.addEventListener(type, swallow);
	}

	// 粘贴：规范化后插入（多行文本的每一行提交时都会补 `>`）
	const onPaste = (event: ClipboardEvent): void => {
		const el = event.target as HTMLTextAreaElement | null;
		if (!el || el !== bodyInput) return;
		const text = event.clipboardData?.getData('text/plain');
		if (text === undefined) return;
		event.preventDefault();
		event.stopPropagation();
		const lines = normalizeBodyText(text);
		insertIntoTextarea(bodyInput, lines.join('\n'));
		// 程序化赋值不触发 input 事件，粘贴后单独重设高度
		fitBodyHeight(bodyInput);
	};
	bodyInput.addEventListener('paste', onPaste);

	// 正文自适应增高：输入后按内容重设高度（打开面板时的首测在 openEditor 里）
	const fitBody = (): void => fitBodyHeight(bodyInput);
	bodyInput.addEventListener('input', fitBody);

	// 宽度变化（窗口缩放、侧栏开合）会改变折行数：换行变多时若不重算，
	// 滚动条会重新出现。observe 的初次回调恰好兜住面板挂载后的最终宽度，
	// 与首测重复的那次是无害的 no-op（高度已一致，写回不再触发回调）。
	const bodyResizeObserver = new ResizeObserver(fitBody);
	bodyResizeObserver.observe(bodyInput);

	// Esc 取消（丢弃修改并关闭）；标题框回车跳到正文。
	// 保存路径是「完成」按钮与点击面板外部；Esc 作为「退出」键与取消按钮同义。
	const onKeyDown = (event: KeyboardEvent): void => {
		if (event.key === 'Escape') {
			event.preventDefault();
			closeSession(false);
			return;
		}
		if (event.key === 'Enter' && event.target === titleInput) {
			event.preventDefault();
			bodyInput.focus();
		}
	};
	calloutEl.addEventListener('keydown', onKeyDown);

	const onDone = (event: MouseEvent): void => {
		// 必须先于 closeSession 阻断冒泡：closeSession 会把面板（连同其上的
		// stopPropagation 监听器）从文档摘除，而事件传播路径在派发时已确定，
		// 之后仍会继续冒泡到 .cm-content → 被 CM6/Obsidian 当成编辑器内点击。
		event.preventDefault();
		event.stopPropagation();
		closeSession(true);
	};
	doneBtn.addEventListener('click', onDone);

	const onCancel = (event: MouseEvent): void => {
		event.preventDefault();
		event.stopPropagation();
		closeSession(false);
	};
	cancelBtn.addEventListener('click', onCancel);

	// 点击面板外部提交（捕获阶段，先于 CM6/Obsidian 的处理）。
	// 判据用 `.callout`：标题输入框与正文文本域都在它内部。
	const doc = calloutEl.ownerDocument;
	const onOutsidePointer = (event: MouseEvent): void => {
		const t = eventTargetElement(event);
		if (t && calloutEl.contains(t)) return;
		closeSession(true);
	};
	doc.addEventListener('mousedown', onOutsidePointer, true);

	return () => {
		for (const type of swallowedEvents) {
			calloutEl.removeEventListener(type, swallow);
		}
		bodyInput.removeEventListener('paste', onPaste);
		bodyInput.removeEventListener('input', fitBody);
		bodyResizeObserver.disconnect();
		calloutEl.removeEventListener('keydown', onKeyDown);
		doneBtn.removeEventListener('click', onDone);
		cancelBtn.removeEventListener('click', onCancel);
		doc.removeEventListener('mousedown', onOutsidePointer, true);
	};
}

/** 在文本域光标处插入文本（替换当前选区），并保持其后光标位置 */
function insertIntoTextarea(el: HTMLTextAreaElement, text: string): void {
	const start = el.selectionStart ?? el.value.length;
	const end = el.selectionEnd ?? start;
	el.value = el.value.slice(0, start) + text + el.value.slice(end);
	const caret = start + text.length;
	el.setSelectionRange(caret, caret);
}

/**
 * 把文本域高度重设为「内容实际高度」（自适应增高，替代滚动条）。
 *
 * 先置 `height: auto` 再按 `scrollHeight` 设值：`scrollHeight` 以当前布局计算，
 * 不先重置的话内容减少时高度不会回落。空内容时 `scrollHeight` 不小于
 * `clientHeight`，故 CSS 的 `min-height: 5em` 仍是下限。宽度变化引起的
 * 折行增减由 attachEditorListeners 里的 ResizeObserver 兜底重算。
 *
 * 动态样式必须走 `setCssProps`（审核 lint 规则 no-static-styles-assignment
 * 禁止 `element.style.height` 直赋）。
 */
function fitBodyHeight(el: HTMLTextAreaElement): void {
	el.setCssProps({ height: 'auto' });
	el.setCssProps({ height: `${el.scrollHeight}px` });
}

/**
 * 关闭会话。commit 为真时把编辑内容写回文档（一次事务），
 * 否则仅拆除面板（取消 / 插件卸载等场景），不写回。
 */
function closeSession(commit: boolean): void {
	const s = session;
	if (!s) return;
	session = null;

	try {
		s.dispose();
	} catch {
		// 监听器拆除失败不阻断后续
	}

	// widget 已被 Obsidian 重建（面板脱离文档）：没有可写回的目标，直接放弃
	const stillMounted = s.calloutEl.isConnected && s.rootEl.isConnected;
	s.calloutEl.removeClass(EDITING_CLASS);
	s.widgetEl.removeClass(WIDGET_EDITING_CLASS);
	// 标题输入框在官方 `.callout-title` 内，不在 rootEl 里，需单独摘除
	s.titleInput.remove();
	s.rootEl.remove();

	if (!commit || !stillMounted) return;

	const body = normalizeBodyText(s.bodyInput.value);
	// 末尾空行没有意义，去掉（保留中间空行）
	while (body.length > 0 && body[body.length - 1] === '') body.pop();
	const text = buildCalloutText(
		s.prefix,
		s.typeInput.value,
		s.metaInput.value,
		s.foldSelect.value,
		s.titleInput.value,
		body,
	);

	// 视图已销毁 / 文档已被外部整体替换 → 区间失效，放弃写回
	if (!s.view.dom.isConnected) return;
	const docLength = s.view.state.doc.length;
	if (s.from > docLength || s.to > docLength || s.from > s.to) return;

	// 区间内容已被外部改动（不再是同一个 callout）→ 放弃写回，避免误覆盖
	// 注意 headerMatch[2] 是 `type|metadata` 整段，只比类型部分
	const current = s.view.state.doc.sliceString(s.from, s.to);
	const headerMatch = CALLOUT_HEADER_RE.exec(current.split('\n')[0] ?? '');
	const currentType = (headerMatch?.[2] ?? '').split('|')[0];
	if (!headerMatch || currentType !== s.type) {
		new Notice(tr('Callout 已被修改，已放弃本次编辑', 'Callout changed elsewhere; edit discarded'));
		return;
	}

	s.view.dispatch({
		changes: { from: s.from, to: s.to, insert: text },
		selection: { anchor: s.from + text.length },
		userEvent: 'input',
	});
}

/* ------------------------------------------------------------------ */
/*  粘贴兜底（光标位于 callout 源码内时）                              */
/* ------------------------------------------------------------------ */

/**
 * 保守的粘贴兜底：仅当光标落在 callout 源码内**且位于行首**、粘贴内容为多行时，
 * 才把每一行按 `>` 前缀展开。其余情况一律放行原生粘贴，避免影响普通编辑。
 */
function createCalloutPasteExtension(): Extension {
	return EditorView.domEventHandlers({
		paste: (event, view) => {
			if (!isEnabledRef?.()) return false;
			const sel = view.state.selection.main;
			const line = view.state.doc.lineAt(sel.from);
			if (sel.from !== line.from) return false;
			const src = parseCalloutAt(view, sel.from);
			if (!src) return false;
			const text = event.clipboardData?.getData('text/plain');
			if (!text || !text.includes('\n')) return false;

			event.preventDefault();
			const lines = normalizeBodyText(text);
			const quote = src.prefix.replace(/\s+$/, '');
			const insert = lines.map((l) => (l === '' ? quote : src.prefix + l)).join('\n');
			view.dispatch({
				changes: { from: sel.from, to: sel.to, insert },
				selection: { anchor: sel.from + insert.length },
				userEvent: 'input.paste',
			});
			return true;
		},
	});
}
