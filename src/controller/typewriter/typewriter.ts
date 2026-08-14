/**
 * MDRazor — 打字机模式（Controller）
 *
 * 功能：
 *   1. 范围居中（死区滚动）：视口高度分为顶部 1/8、中部 3/4、底部 1/8，
 *      光标所在行落在中部死区（12.5%~87.5%）时不调整滚轴；落入顶部/底部
 *      1/8 时统一将该行滚动到死区上沿（视口 12.5% 处）。相比精准居中滚动
 *      频率大幅降低。鼠标按压/拖选期间不触发，松开后才触发，避免拖选干扰
 *   2. 死区外淡化：在编辑器顶部/底部 1/8 各盖一块半透明遮罩（position:
 *      absolute + CSS 百分比，天然与视口绑定），死区（视口中部 12.5%~
 *      87.5%）不遮罩、始终明亮。遮罩不拦截点击。相比逐行装饰，无坐标
 *      换算、无缓存滞后、无模型不一致问题，滚动时淡化边界永远与视口一致
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
 *   - 淡化：两个绝对定位遮罩 div（顶部/底部 12.5%），由 styles.css 的
 *     百分比高度定位，opacity 经 CSS 变量动态设置，纯视口绑定、零 JS
 *     几何计算
 *   - update() 中监听光标跨行，经 EditorView.scrollIntoView(..., { y:
 *     'start', yMargin: 12.5%H }) 做死区滚动
 *   - 头部留白按视口高计算并写入 CSS 变量，由 styles.css 应用到 .cm-sizer
 */

import { type Plugin } from 'obsidian';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { type MDRazorSettings } from '../../model/settings';

/** 模块级可变配置，由 controller/main.ts 在设置变更时写入。 */
export const typewriterConfig: { mode: boolean; opacity: number; topPadding: boolean } = {
	mode: false,
	opacity: 50,
	topPadding: true,
};

/** 范围居中：死区上沿（2 区间顶部）相对视口高度的比例（视口 1/8 处 = 12.5%） */
const ZONE2_TOP_RATIO = 0.125;

const typewriterPlugin = ViewPlugin.fromClass(
	class {
		private readonly view: EditorView;
		private lastMode = typewriterConfig.mode;
		private lastOpacity = typewriterConfig.opacity;
		private lastTopPadding = typewriterConfig.topPadding;
		/** 上一次已检查并（可能）调整过滚动的行号（光标未跨行时不读取布局） */
		private lastAdjustedLine = -1;
		/** 插件已销毁标记（延后派发前检查，避免对已卸载视图操作） */
		private destroyed = false;
		/** 鼠标按下标志：按压/拖选期间不触发居中，松开后才触发 */
		private isPointerDown = false;
		/** 留白是否已应用（-1 = 未应用，其余为已应用的像素值） */
		private appliedTopPadding = -1;
		/** 留白值是否需要（重新）计算：配置变化 / 几何变化（窗口、面板缩放）时置位 */
		private topPaddingDirty = true;
		/** 顶部/底部淡化遮罩（视口固定，纯 CSS 百分比定位） */
		private readonly dimVeilTop: HTMLElement;
		private readonly dimVeilBottom: HTMLElement;

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

		constructor(view: EditorView) {
			this.view = view;
			const doc = view.dom.ownerDocument;
			this.dimVeilTop = doc.createElement('div');
			this.dimVeilTop.className = 'mdrazor-typewriter-dim-top';
			this.dimVeilBottom = doc.createElement('div');
			this.dimVeilBottom.className = 'mdrazor-typewriter-dim-bottom';
			view.dom.appendChild(this.dimVeilTop);
			view.dom.appendChild(this.dimVeilBottom);

			this.syncDimVeil(view);
			this.syncTopPadding(view);
			const dom = view.dom;
			dom.addEventListener('pointerdown', this.onPointerDown, true);
			dom.addEventListener('pointercancel', this.onPointerCancel, true);
			dom.addEventListener('mousedown', this.onEditorMouseDown, true);
			dom.ownerDocument.addEventListener('pointerup', this.onDocumentPointerUp, true);
		}

		destroy() {
			this.destroyed = true;
			this.dimVeilTop.remove();
			this.dimVeilBottom.remove();
			const dom = this.view.dom;
			dom.removeEventListener('pointerdown', this.onPointerDown, true);
			dom.removeEventListener('pointercancel', this.onPointerCancel, true);
			dom.removeEventListener('mousedown', this.onEditorMouseDown, true);
			dom.ownerDocument.removeEventListener('pointerup', this.onDocumentPointerUp, true);
		}

		/**
		 * 死区外淡化遮罩：在 .cm-editor 上切换 mdrazor-typewriter-dimming 类，
		 * 并动态设置 CSS 变量 --mdrazor-typewriter-dim-opacity = (100 − 不透明度)
		 * / 100。styles.css 将该变量应用到两块绝对定位遮罩（顶部/底部 12.5%）
		 * 的 opacity —— 纯 CSS 百分比定位，天然与视口绑定，滚动时淡化边界
		 * 永远与视口一致，无坐标换算/缓存滞后问题。死区内（中部 3/4）不遮罩。
		 * 模式关闭或不透明度为 100 时移除类与变量。
		 */
		private syncDimVeil(view: EditorView): void {
			const editorEl = view.dom;
			const active = typewriterConfig.mode && typewriterConfig.opacity < 100;
			if (active) {
				const opacity = Math.max(0, Math.min(100, typewriterConfig.opacity)) / 100;
				editorEl.classList.add('mdrazor-typewriter-dimming');
				const value = String(1 - opacity);
				if (editorEl.style.getPropertyValue('--mdrazor-typewriter-dim-opacity') !== value) {
					editorEl.setCssProps({ '--mdrazor-typewriter-dim-opacity': value });
				}
			} else if (editorEl.classList.contains('mdrazor-typewriter-dimming')) {
				editorEl.classList.remove('mdrazor-typewriter-dimming');
				editorEl.setCssProps({ '--mdrazor-typewriter-dim-opacity': '0' });
			}
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
		 * 范围居中（死区滚动）——调度入口（零布局读取）：
		 * 光标跨行时安排一次微任务执行实际的区间判定与滚动。
		 * 视口高度分为顶部 1/8、中部 3/4、底部 1/8：
		 *   - 光标所在行整体落在中部死区（视口 12.5%~87.5%）→ 不调整滚轴；
		 *   - 落入顶部/底部 1/8 → 将该行统一滚动到死区上沿（行首对齐视口
		 *     12.5% 处）。
		 * 相比精准居中，滚动频率大幅降低，减轻视觉疲劳。
		 */
		private maybeRangeScroll(view: EditorView): void {
			if (!typewriterConfig.mode || this.isPointerDown || this.destroyed) return;
			const head = view.state.selection.main.head;
			const lineNumber = view.state.doc.lineAt(head).number;
			if (lineNumber === this.lastAdjustedLine) return; // 光标未跨行 → 不安排
			this.lastAdjustedLine = lineNumber;

			// 布局读取（coordsAtPos/getBoundingClientRect）与 dispatch 在
			// ViewPlugin.update 期间均不被允许，统一延后到本次更新完成后的
			// 微任务执行。
			window.queueMicrotask(() => {
				if (this.destroyed || !typewriterConfig.mode || this.isPointerDown) return;
				// 光标可能已再次跨行：仅当仍在同一行时才执行判定
				const nowHead = view.state.selection.main.head;
				if (view.state.doc.lineAt(nowHead).number !== lineNumber) return;
				this.applyRangeScroll(view, nowHead);
			});
		}

		/**
		 * 范围居中判定与滚动（仅从微任务/事件回调调用，不在 update 内）：
		 * 光标所在行落入顶部/底部 1/8 时滚动到死区上沿（视口 12.5% 处）。
		 * 使用 coordsAtPos（真实 DOM 几何）判定，与淡化遮罩（视口固定）
		 * 天然一致，不存在边界错位。
		 */
		private applyRangeScroll(view: EditorView, head: number): void {
			const coords = view.coordsAtPos(head);
			if (!coords) return; // 不可见/未测量
			const viewportTop = view.scrollDOM.getBoundingClientRect().top;
			const viewportHeight = view.scrollDOM.clientHeight;
			const zone2Top = viewportHeight * ZONE2_TOP_RATIO; // 死区上沿 = 视口 12.5% 处
			const zone3Bottom = viewportHeight * (1 - ZONE2_TOP_RATIO); // 死区下沿 = 视口 87.5% 处

			// 行整体落在死区内（不越出中部 12.5%~87.5%）→ 无需调整
			if (coords.top >= viewportTop + zone2Top
				&& coords.bottom <= viewportTop + zone3Bottom) {
				return;
			}

			// 落入顶部/底部 1/8 → 滚动到死区上沿（行首对齐视口 12.5% 处）
			const effects = EditorView.scrollIntoView(head, { y: 'start', yMargin: zone2Top });
			window.queueMicrotask(() => {
				if (!this.destroyed) view.dispatch({ effects });
			});
		}

		update(update: ViewUpdate) {
			const mode = typewriterConfig.mode;
			const opacity = typewriterConfig.opacity;
			const topPadding = typewriterConfig.topPadding;

			// 设置变化（开关/不透明度/头部留白）无需任何文档事件即可感知
			const configChanged = mode !== this.lastMode
				|| opacity !== this.lastOpacity
				|| topPadding !== this.lastTopPadding;
			// 头部留白变化需触发一次测量，让 CM6 立即读取新的 padding-top
			const marginChanged = mode !== this.lastMode || topPadding !== this.lastTopPadding;
			this.lastMode = mode;
			this.lastOpacity = opacity;
			this.lastTopPadding = topPadding;

			if (configChanged) {
				this.syncDimVeil(update.view);
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
		name: '开启/关闭打字机模式',
		icon: 'text-cursor-input',
		callback: async () => {
			settings.typewriterMode = !settings.typewriterMode;
			await save();
		},
	});
}
