/**
 * MDRazor — 打字机模式（Controller）
 *
 * 功能：
 *   1. 范围居中（死区滚动，基础行为始终开启）：视口高度分为顶部 1/8、
 *      中部 3/4、底部 1/8，光标所在行落在中部死区（12.5%~87.5%）时不调整
 *      滚轴；落入顶部 1/8 → 滚回死区上沿（12.5%）维持视觉位置；落入底部
 *      1/8 → 默认滚回死区下沿（87.5%）维持视觉位置，开启子开关「死区下沿
 *      跳转上沿」（默认关闭）时则跳到上沿（12.5%）。相比精准居中滚动频率
 *      大幅降低。鼠标按压/拖选期间不触发，松开后才触发，避免拖选干扰
 *   2. 死区外淡化：除当前行与死区（视口中部 12.5%~87.5%）内的行外，其余行
 *      （顶部/底部 1/8）按「死区外的不透明度」（0-100）淡化显示，聚焦中部
 *      阅读带
 *   3. 文档头部留白：开启「允许文档头部留存空白区域」后，在 .cm-editor 上
 *      切换 mdrazor-typewriter-top-padding 类并设置 CSS 变量
 *      --mdrazor-typewriter-top-padding = 视口高 × 12.5%，styles.css 将其应用到
 *      .cm-sizer（.cm-scroller 内的内容容器，Obsidian 的页面内标题
 *      inline-title 也位于其中）的 padding-top，在文档最顶部创建可滚动空白：
 *      使光标位于文档第一行时也能滚入中部死区（死区上沿 = 视口 12.5% 处，
 *      与范围居中的目标一致）；留白属滚动内容，仅顶部可见，光标在文档中部
 *      编辑时滚出视口，不占用编辑空间。页面内标题位于留白之下，标题紧贴
 *      正文不被隔开。
 *      注意：EditorView.scrollMargins 仅用于让滚动避开固定面板，不会创建
 *      可滚动空白，故不采用。
 *
 * 开关：
 *   - 设置面板「标签页」区域的「打字机模式」开关（默认关闭）
 *   - 子开关「允许文档头部留存空白区域」（默认开启）
 *   - 命令「开启/关闭打字机模式」（可绑定快捷键），与设置开关双向同步
 *
 * 实现：单个 CM6 ViewPlugin ——
 *   - decorations 基于 visibleRanges 为死区外的行添加 line 装饰（内联
 *     opacity 样式），仅处理可视行，性能开销低（与空格可视化同模式）
 *   - update() 中监听文档/选区/视口变化；光标跨行时经
 *     EditorView.scrollIntoView(..., { y: 'center' }) 滚动居中
 *   - 头部留白在 update() 中按视口/行高计算并写入 CSS 变量，由 styles.css
 *     应用到 .cm-sizer 的 padding-top（含页面内标题的文档，留白位于标题上方）
 */

import { type Plugin } from 'obsidian';
import { tr } from '../../i18n';
import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet } from '@codemirror/view';
import { type StateEffect, RangeSetBuilder } from '@codemirror/state';
import { type MDRazorSettings } from '../../model/settings';

/** 模块级可变配置，由 controller/main.ts 在设置变更时写入。 */
export const typewriterConfig: {
	mode: boolean;
	opacity: number;
	topPadding: boolean;
	bottomJumpToTop: boolean;
} = {
	mode: false,
	opacity: 50,
	topPadding: true,
	bottomJumpToTop: false,
};

/** 范围居中：死区上沿（2 区间顶部）相对视口高度的比例（视口 1/8 处 = 12.5%） */
const ZONE2_TOP_RATIO = 0.125;

/**
 * 死区：范围居中保持光标所在行的中部区域（视口 12.5%~87.5%，中段 3/4）。
 * 死区内与当前行不淡化，「死区外的不透明度」只作用于顶部/底部 1/8 的行。
 */
const DEAD_ZONE_TOP_RATIO = ZONE2_TOP_RATIO;
const DEAD_ZONE_BOTTOM_RATIO = 1 - ZONE2_TOP_RATIO;

/**
 * 为可视范围内死区外的行构建淡化装饰。
 * 死区 = 视口中部 12.5%~87.5%（光标所在区域，范围居中保持区）；死区外 =
 * 顶部/底部 1/8。当前行与死区内的行保持明亮。
 * 不透明度 = typewriterConfig.opacity / 100（100 时返回空装饰，不做淡化）。
 *
 * 死区边界用「实时 scrollDOM.scrollTop（普通属性读取，不触发布局，update
 * 内允许）− 静态偏移 + 比例 × 视口高」计算，任何时刻（含范围居中派发的
 * 滚动事务）都与当前滚动位置一致，不会因缓存滞后把死区外最近的行误判为
 * 死区内。静态偏移/视口高由插件在允许读布局的上下文缓存（滚动事件/构造
 * 函数/几何变化后的 rAF）；lineBlockAt 的行块位置同为 contentDOM 局部坐标
 * 的缓存值，本函数不读取 DOM 布局。
 */
function buildDimDecorations(
	view: EditorView,
	geo: { staticOffsetPx: number; viewportHeightPx: number } | null,
): DecorationSet {
	if (!typewriterConfig.mode || typewriterConfig.opacity >= 100) {
		return Decoration.none;
	}
	// 几何未就绪或退化（未测量/隐藏）→ 不做淡化，避免全部行被误淡化
	if (!geo || geo.viewportHeightPx <= 0) return Decoration.none;

	// 实时滚动位置（无需布局）；死区边界随当前滚动即时更新
	const scrollTop = view.scrollDOM.scrollTop;
	const viewportTopPx = scrollTop - geo.staticOffsetPx; // 视口顶（contentDOM 局部）
	const zone2TopPx = viewportTopPx + geo.viewportHeightPx * DEAD_ZONE_TOP_RATIO; // 12.5%
	const zone3BottomPx = viewportTopPx + geo.viewportHeightPx * DEAD_ZONE_BOTTOM_RATIO; // 87.5%

	const opacity = Math.max(0, Math.min(100, typewriterConfig.opacity)) / 100;
	const dim = Decoration.line({ attributes: { style: `opacity: ${opacity}` } });
	const builder = new RangeSetBuilder<Decoration>();
	const doc = view.state.doc;
	const cursorLine = doc.lineAt(view.state.selection.main.head).number;

	for (const { from, to } of view.visibleRanges) {
		if (from >= to) continue;
		const startLine = doc.lineAt(from);
		const endLine = doc.lineAt(to);
		for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
			const line = doc.line(lineNum);
			if (line.number === cursorLine) continue; // 当前行始终不淡化
			const block = view.lineBlockAt(line.from);
			// 行整体落在死区内（不越出 12.5%~87.5%）→ 保持明亮；死区外 → 淡化
			if (block.top >= zone2TopPx && block.bottom <= zone3BottomPx) continue;
			builder.add(line.from, line.from, dim);
		}
	}

	return builder.finish();
}

const typewriterPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;

		private readonly view: EditorView;
		private lastMode = typewriterConfig.mode;
		private lastOpacity = typewriterConfig.opacity;
		private lastTopPadding = typewriterConfig.topPadding;
		/** 插件已销毁标记（延后派发前检查，避免对已卸载视图操作） */
		private destroyed = false;
		/** 鼠标按下标志：按压/拖选期间不触发居中，松开后才触发 */
		private isPointerDown = false;
		/** 留白是否已应用（-1 = 未应用，其余为已应用的像素值） */
		private appliedTopPadding = -1;
		/** 留白值是否需要（重新）计算：配置变化 / 几何变化（窗口、面板缩放）时置位 */
		private topPaddingDirty = true;
		/** 滚动刷新派发是否已排队（同一帧多个滚动事件合并为一次派发） */
		private scrollRefreshPending = false;
		/**
		 * 内容静态偏移（contentDOM 顶部相对滚动容器内容顶，不含滚动）与滚动
		 * 视口高。布局不变则静态偏移恒定，仅需在允许读布局的上下文刷新
		 * （构造函数 / 滚动事件 / 几何变化后的 rAF）；滚动位置在装饰重建时
		 * 实时读取，因此边界始终与当前滚动一致。
		 */
		private dimGeo: { staticOffsetPx: number; viewportHeightPx: number } | null = null;

		/** 文档级 pointerup（capture）：编辑器内按下后即使拖出编辑器/窗口也能捕获松开 */
		private readonly onDocumentPointerUp = (): void => {
			if (!this.isPointerDown) return;
			this.isPointerDown = false;
			this.maybeRangeScroll(this.view);
		};

		/** 编辑器 DOM 级 pointerdown / pointercancel（capture），闭包持有实例状态 */
		private readonly onPointerDown = (): void => {
			this.isPointerDown = true;
		};
		private readonly onPointerCancel = (): void => {
			this.isPointerDown = false;
		};

		/**
		 * 拦截编辑器内 `.cm-content` 之外的点击（capture 阶段 preventDefault）：
		 * CM6 的内置 mousedown 处理器（负责点击聚焦与光标定位）只挂在
		 * `.cm-content` 上，点击文档头部留白等空白区域时不会触发它，浏览器
		 * 默认行为会把焦点从可编辑区移走导致编辑器失焦、破坏打字机状态。
		 * preventDefault 阻止默认焦点变化，同时不阻断点击事件（折叠箭头等
		 * 基于 click 的交互不受影响）。仅打字机模式开启时生效。
		 */
		private readonly onEditorMouseDown = (event: MouseEvent): void => {
			if (!typewriterConfig.mode) return;
			const target = event.target as HTMLElement | null;
			if (target && !target.closest('.cm-content')) {
				event.preventDefault();
			}
		};

		/**
		 * 滚动监听：纯滚动不产生 CM6 事务，且视口/visibleRanges 缓存要到
		 * 测量（rAF）后才更新。这里刷新静态偏移缓存（滚动事件上下文允许读
		 * 布局），请求测量，并把空事务派发延后到 rAF——测量先于我们的 rAF
		 * 执行（rAF 队列 FIFO），派发时可见行已刷新，update() 中每次重建
		 * 装饰即可用正确的 visibleRanges 与实时边界渲染。
		 */
		private readonly onScroll = (): void => {
			if (!typewriterConfig.mode || typewriterConfig.opacity >= 100 || this.destroyed) return;
			this.refreshDimGeo(this.view);
			this.view.requestMeasure();
			if (this.scrollRefreshPending) return; // 同一帧内多个滚动事件合并为一次派发
			this.scrollRefreshPending = true;
			window.requestAnimationFrame(() => {
				this.scrollRefreshPending = false;
				if (this.destroyed || !typewriterConfig.mode) return;
				this.view.dispatch({});
			});
		};

		/**
		 * 刷新静态偏移与视口高缓存。仅可从允许读布局的上下文调用（滚动
		 * 事件 / 构造函数 / rAF），绝不在 update 内调用。
		 */
		private refreshDimGeo(view: EditorView): void {
			const scroller = view.scrollDOM;
			const scrollTop = scroller.scrollTop;
			const staticOffsetPx = view.contentDOM.getBoundingClientRect().top
				- scroller.getBoundingClientRect().top
				+ scrollTop;
			const viewportHeightPx = scroller.clientHeight;
			if (viewportHeightPx <= 0) {
				this.dimGeo = null;
				return;
			}
			this.dimGeo = { staticOffsetPx, viewportHeightPx };
		}

		constructor(view: EditorView) {
			this.view = view;
			this.refreshDimGeo(view);
			this.decorations = buildDimDecorations(view, this.dimGeo);
			this.syncTopPadding(view);
			const dom = view.dom;
			dom.addEventListener('pointerdown', this.onPointerDown, true);
			dom.addEventListener('pointercancel', this.onPointerCancel, true);
			dom.addEventListener('mousedown', this.onEditorMouseDown, true);
			dom.ownerDocument.addEventListener('pointerup', this.onDocumentPointerUp, true);
			view.scrollDOM.addEventListener('scroll', this.onScroll, { passive: true });
		}

		destroy() {
			this.destroyed = true;
			const dom = this.view.dom;
			dom.removeEventListener('pointerdown', this.onPointerDown, true);
			dom.removeEventListener('pointercancel', this.onPointerCancel, true);
			dom.removeEventListener('mousedown', this.onEditorMouseDown, true);
			dom.ownerDocument.removeEventListener('pointerup', this.onDocumentPointerUp, true);
			this.view.scrollDOM.removeEventListener('scroll', this.onScroll);
		}

		/**
		 * 文档头部留白：在 .cm-editor 上切换 mdrazor-typewriter-top-padding 类，
		 * 并动态设置 CSS 变量 --mdrazor-typewriter-top-padding = 视口高 × 12.5%。
		 * styles.css 将该变量应用到 .cm-sizer 的 padding-top —— .cm-sizer 位于
		 * .cm-scroller 内，页面内标题 inline-title 也位于其中，因此留白出现在
		 * 文档最顶部（标题上方），标题紧贴正文不被隔开。留白属滚动内容：仅
		 * 顶部可见，光标在文档中部编辑时滚出视口，不占用编辑空间。
		 *
		 * 大小与范围居中的死区上沿（视口 12.5%）一致：使光标位于文档第一行
		 * 时恰好能滚入中部死区（12.5% 处），而非旧的精准居中所需的 50%。
		 *
		 * 性能关键：只在 topPaddingDirty（配置变化 / 几何变化）时才读取
		 * scrollDOM.clientHeight 计算留白值——读取会强制同步布局，若每次
		 * update 都读取，点击/滚动会引发反复回流导致闪烁。尺寸暂不可用时
		 * 保持 pending（topPaddingDirty 不清除），下次 update 再试，保证首次
		 * 测量完成后立即应用。模式关闭或留白开关关闭时移除类与变量。
		 */
		private syncTopPadding(view: EditorView): void {
			const editorEl = view.dom;
			const active = typewriterConfig.mode && typewriterConfig.topPadding;
			if (!active) {
				if (this.appliedTopPadding !== -1) {
					editorEl.classList.remove('mdrazor-typewriter-top-padding');
					editorEl.setCssProps({ '--mdrazor-typewriter-top-padding': '0px' });
					this.appliedTopPadding = -1;
				}
				this.topPaddingDirty = false;
				return;
			}
			if (!this.topPaddingDirty) return; // 已应用且无需重算 → 不读取布局，避免回流
			const viewportHeight = view.scrollDOM.clientHeight;
			if (viewportHeight <= 0) return; // 暂不可用（未测量、隐藏标签页），保持 pending
			// 留白大小 = 视口高 × 12.5%（范围居中只需第一行滚到死区上沿）
			const top = Math.max(0, Math.floor(viewportHeight * ZONE2_TOP_RATIO));
			editorEl.classList.add('mdrazor-typewriter-top-padding');
			editorEl.setCssProps({ '--mdrazor-typewriter-top-padding': `${top}px` });
			this.appliedTopPadding = top;
			this.topPaddingDirty = false;
		}

		/**
		 * 范围居中（死区滚动）——调度入口（零布局读取）：打字机模式的基础
		 * 行为，始终生效。每次光标移动 / 文档变更（含同一逻辑行内打字）都
		 * 安排一次微任务执行区间判定——同一逻辑行可能含多行视觉文本（自动
		 * 换行），行号不变时光标视觉位置仍可能越过死区边界，故不做行号去重。
		 * 视口高度分为顶部 1/8、中部 3/4、底部 1/8：
		 *   - 光标所在行整体落在中部死区（视口 12.5%~87.5%）→ 不调整滚轴；
		 *   - 落入顶部 1/8 → 滚回死区上沿（12.5%）维持视觉位置；
		 *   - 落入底部 1/8 → 默认滚回死区下沿（87.5%）维持视觉位置；开启
		 *     「死区下沿跳转上沿」时跳到上沿（12.5%）。
		 * 相比精准居中，滚动频率大幅降低，减轻视觉疲劳。
		 */
		private maybeRangeScroll(view: EditorView): void {
			if (!typewriterConfig.mode || this.isPointerDown || this.destroyed) return;
			const head = view.state.selection.main.head;
			const lineNumber = view.state.doc.lineAt(head).number;

			// 布局读取（coordsAtPos/getBoundingClientRect）与 dispatch 在
			// ViewPlugin.update 期间均不被允许，统一延后到本次更新完成后的
			// 微任务执行。
			window.queueMicrotask(() => {
				if (this.destroyed || !typewriterConfig.mode || this.isPointerDown) return;
				// 光标可能已再次跨行：仅当仍在同一行时才执行判定（新位置会有
				// 新检查）；同一行内的视觉位置漂移（换行增长）则照常判定。
				const nowHead = view.state.selection.main.head;
				if (view.state.doc.lineAt(nowHead).number !== lineNumber) return;
				this.applyRangeScroll(view, nowHead);
			});
		}

		/**
		 * 范围居中判定与滚动（仅从微任务/事件回调调用，不在 update 内）：
		 * 判定与淡化（buildDimDecorations）共用同一套几何——lineBlockAt 的
		 * 逻辑行块 + dimGeo 边界（静态偏移 + 视口高），消除此前 coordsAtPos
		 * 与模型坐标之间约一行的系统偏差，跳转触发与死区渲染范围严格一致。
		 * 上边界始终滚回死区上沿（视口 12.5% 处）；下边界默认滚回死区下沿
		 * （视口 87.5% 处）维持视觉位置，开启「死区下沿跳转上沿」时跳到上沿。
		 */
		private applyRangeScroll(view: EditorView, head: number): void {
			const geo = this.dimGeo;
			if (!geo || geo.viewportHeightPx <= 0) return; // 几何未就绪
			const block = view.lineBlockAt(head);
			const scrollTop = view.scrollDOM.scrollTop;
			const viewportTopPx = scrollTop - geo.staticOffsetPx; // 视口顶（contentDOM 局部）
			const zone2TopPx = viewportTopPx + geo.viewportHeightPx * DEAD_ZONE_TOP_RATIO; // 12.5%
			const zone3BottomPx = viewportTopPx + geo.viewportHeightPx * DEAD_ZONE_BOTTOM_RATIO; // 87.5%

			// 行整体落在死区内（与淡化判定一致）→ 无需调整
			if (block.top >= zone2TopPx && block.bottom <= zone3BottomPx) {
				return;
			}

			// 滚动目标（真实视口坐标）：yMargin = 视口高 × 12.5%
			const viewportHeight = view.scrollDOM.clientHeight;
			const zone2Top = viewportHeight * ZONE2_TOP_RATIO;
			let effects: StateEffect<unknown>;
			if (block.top < zone2TopPx) {
				// 跨过/位于上沿之上 → 滚回上沿（行首对齐视口 12.5% 处）
				effects = EditorView.scrollIntoView(head, { y: 'start', yMargin: zone2Top });
			} else if (typewriterConfig.bottomJumpToTop) {
				// 跨过下沿 + 开启「死区下沿跳转上沿」→ 跳到上沿（12.5%）
				effects = EditorView.scrollIntoView(head, { y: 'start', yMargin: zone2Top });
			} else {
				// 跨过下沿（默认）→ 滚回下沿维持视觉位置（行底对齐视口 87.5% 处）
				effects = EditorView.scrollIntoView(head, { y: 'end', yMargin: zone2Top });
			}
			window.queueMicrotask(() => {
				if (!this.destroyed) view.dispatch({ effects });
			});
		}

		update(update: ViewUpdate) {
			const mode = typewriterConfig.mode;
			const topPadding = typewriterConfig.topPadding;

			// 头部留白变化需触发一次测量，让 CM6 立即读取新的 padding-top
			const marginChanged = mode !== this.lastMode || topPadding !== this.lastTopPadding;
			this.lastMode = mode;
			this.lastOpacity = typewriterConfig.opacity;
			this.lastTopPadding = topPadding;

			// 淡化装饰：每次 update 都重建（不依赖 viewportChanged——滚动触发的
			// 空事务在 CM6 看来视口未变，但 rAF 派发时可见行已刷新，重建即用
			// 正确状态渲染）。边界用实时 scrollTop 计算，范围居中派发的滚动
			// 事务也能立即得到与当前滚动一致的死区边界。
			this.decorations = buildDimDecorations(update.view, this.dimGeo);

			// 几何（缩放/标题/面板）或留白变化、或几何缓存尚未就绪时，安排 rAF
			// 刷新静态偏移/视口高缓存并重建装饰（rAF 上下文允许读布局；update
			// 内禁止）。
			if (update.geometryChanged || marginChanged || this.dimGeo === null) {
				window.requestAnimationFrame(() => {
					if (this.destroyed) return;
					this.refreshDimGeo(update.view);
					this.decorations = buildDimDecorations(update.view, this.dimGeo);
				});
			}

			// 头部留白：配置/几何（窗口、面板缩放）变化时置脏，下次 update
			// 重算；其余 update 只做零读取同步，避免强制回流导致闪烁。
			if (marginChanged || update.geometryChanged) {
				this.topPaddingDirty = true;
				if (marginChanged) {
					update.view.requestMeasure();
				}
			}
			this.syncTopPadding(update.view);

			// 范围居中滚动：光标跨行时按死区（12.5%~87.5%）判定是否调整。鼠标
			// 按压/拖选期间跳过（松开后由文档级 pointerup 触发 once），避免拖选干扰。
			if (mode && !this.isPointerDown && (update.selectionSet || update.docChanged)) {
				this.maybeRangeScroll(update.view);
			}
		}
	},
	{
		decorations: (v) => v.decorations,
	},
);

/**
 * 创建打字机模式 CM6 扩展。
 */
export function createTypewriterExtension() {
	return typewriterPlugin;
}

/**
 * 注册「开启/关闭打字机模式」命令。
 * 命令切换设置开关（与设置面板开关双向同步），经 save 回调持久化并刷新 UI。
 */
export function registerTypewriterCommand(
	plugin: Plugin,
	settings: MDRazorSettings,
	save: () => Promise<void>,
): void {
	plugin.addCommand({
		id: 'mdrazor-toggle-typewriter',
		name: tr('开启/关闭打字机模式', 'Toggle Typewriter Mode'),
		icon: 'text-cursor-input',
		callback: async () => {
			settings.typewriterMode = !settings.typewriterMode;
			await save();
		},
	});
}
