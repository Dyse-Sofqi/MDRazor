/**
 * MDRazor — 打字机模式（Controller）
 *
 * 功能：
 *   1. 光标行居中：编辑文档时，光标移动到新行即调整滚动轴，使该行
 *      始终保持于页面垂直中央（打字机滚动）。鼠标按压/拖选期间不触发
 *      居中，松开鼠标后才触发，避免拖选过程中光标跟随跳动
 *   2. 非当前行淡化：除光标所在行外的所有行按「非当前行的不透明度」
 *      （0-100）淡化显示
 *   3. 文档头部留白：开启「允许文档头部留存空白区域」后，在 .cm-editor 上
 *      切换 mdrazor-typewriter-top-padding 类并设置 CSS 变量
 *      --mdrazor-typewriter-top-padding = (视口高 - 行高) / 2，styles.css 将
 *      其应用到 .cm-sizer 的 padding-top（.cm-sizer 是 .cm-scroller 内的内容
 *      容器，Obsidian 的页面内标题 inline-title 也位于其中），在文档最顶部
 *      创建可滚动空白，使光标位于第一行时也能滚动到页面中央。留白位于标题
 *      上方，标题不会被推离正文。CM6 坐标换算基于真实 DOM 几何（contentDOM
 *      rect 已含该推挤），scrollIntoView 居中计算自动正确。
 *      注意：EditorView.scrollMargins 仅用于让滚动避开固定面板，不会创建
 *      可滚动空白，故不采用。
 *
 * 开关：
 *   - 设置面板「标签页」区域的「打字机模式」开关（默认关闭）
 *   - 子开关「允许文档头部留存空白区域」（默认开启）
 *   - 命令「开启/关闭打字机模式」（可绑定快捷键），与设置开关双向同步
 *
 * 实现：单个 CM6 ViewPlugin ——
 *   - decorations 基于 visibleRanges 为每条非当前行添加 line 装饰（内联
 *     opacity 样式），仅处理可视行，性能开销低（与空格可视化同模式）
 *   - update() 中监听文档/选区/视口变化；光标跨行时经
 *     EditorView.scrollIntoView(..., { y: 'center' }) 滚动居中
 *   - 头部留白在 update() 中按视口/行高计算并写入 CSS 变量，由 styles.css
 *     应用到 .cm-sizer 的 padding-top（含页面内标题的文档，留白位于标题上方）
 */

import { type Plugin } from 'obsidian';
import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { type MDRazorSettings } from '../../model/settings';

/** 模块级可变配置，由 controller/main.ts 在设置变更时写入。 */
export const typewriterConfig: { mode: boolean; opacity: number; topPadding: boolean } = {
	mode: false,
	opacity: 50,
	topPadding: true,
};

/**
 * 为可视范围内所有非当前行构建淡化装饰。
 * 不透明度 = typewriterConfig.opacity / 100（100 时返回空装饰，不做任何淡化）。
 */
function buildDimDecorations(view: EditorView): DecorationSet {
	if (!typewriterConfig.mode || typewriterConfig.opacity >= 100) {
		return Decoration.none;
	}

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
			if (line.number !== cursorLine) {
				builder.add(line.from, line.from, dim);
			}
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
		/** 上一次已执行居中滚动的行号（同一行内编辑不重复滚动，避免抖动） */
		private centeredLine = -1;
		/** 插件已销毁标记（延后派发前检查，避免对已卸载视图操作） */
		private destroyed = false;
		/** 鼠标按下标志：按压/拖选期间不触发居中，松开后才触发 */
		private isPointerDown = false;

		/** 文档级 pointerup（capture）：编辑器内按下后即使拖出编辑器/窗口也能捕获松开 */
		private readonly onDocumentPointerUp = (): void => {
			if (!this.isPointerDown) return;
			this.isPointerDown = false;
			this.maybeCenter(this.view);
		};

		/** 编辑器 DOM 级 pointerdown / pointercancel（capture），闭包持有实例状态 */
		private readonly onPointerDown = (): void => {
			this.isPointerDown = true;
		};
		private readonly onPointerCancel = (): void => {
			this.isPointerDown = false;
		};

		constructor(view: EditorView) {
			this.view = view;
			this.decorations = buildDimDecorations(view);
			this.applyTopPadding(view);
			const dom = view.dom;
			dom.addEventListener('pointerdown', this.onPointerDown, true);
			dom.addEventListener('pointercancel', this.onPointerCancel, true);
			dom.ownerDocument.addEventListener('pointerup', this.onDocumentPointerUp, true);
		}

		destroy() {
			this.destroyed = true;
			const dom = this.view.dom;
			dom.removeEventListener('pointerdown', this.onPointerDown, true);
			dom.removeEventListener('pointercancel', this.onPointerCancel, true);
			dom.ownerDocument.removeEventListener('pointerup', this.onDocumentPointerUp, true);
		}

		/**
		 * 文档头部留白：在 .cm-editor 上切换 mdrazor-typewriter-top-padding 类，
		 * 并动态设置 CSS 变量 --mdrazor-typewriter-top-padding = (视口高 - 行高) / 2。
		 * styles.css 将该变量应用到 .cm-sizer 的 padding-top —— .cm-sizer 位于
		 * .cm-scroller 内，Obsidian 的页面内标题 inline-title 也位于其中，因此
		 * 留白出现在文档最顶部（标题上方），标题紧贴正文不被隔开。CM6 坐标
		 * 换算基于真实 DOM 几何（contentDOM rect 已含该推挤），scrollIntoView
		 * 居中计算随之正确（首行居中恰好落在 scrollTop=0）。
		 * 模式关闭或留白开关关闭时移除类与变量。
		 */
		private applyTopPadding(view: EditorView): void {
			const editorEl = view.dom;
			const active = typewriterConfig.mode && typewriterConfig.topPadding;
			if (!active) {
				if (editorEl.classList.contains('mdrazor-typewriter-top-padding')) {
					editorEl.classList.remove('mdrazor-typewriter-top-padding');
					editorEl.setCssProps({ '--mdrazor-typewriter-top-padding': '0px' });
				}
				return;
			}
			const lineHeight = view.defaultLineHeight;
			if (!lineHeight || lineHeight <= 0) return; // 首次测量前行高未知，跳过
			const viewportHeight = view.scrollDOM.clientHeight;
			const top = Math.max(0, Math.floor((viewportHeight - lineHeight) / 2));
			const value = `${top}px`;
			editorEl.classList.add('mdrazor-typewriter-top-padding');
			if (editorEl.style.getPropertyValue('--mdrazor-typewriter-top-padding') !== value) {
				editorEl.setCssProps({ '--mdrazor-typewriter-top-padding': value });
			}
		}

		/**
		 * 光标跨行时将该行滚动至页面中央（仅在模式开启、鼠标未按压时执行）。
		 * 注意：ViewPlugin.update 执行期间不允许同步 dispatch（会递归触发更新
		 * 抛错），因此经 queueMicrotask 延后到本次更新完成后再派发。
		 */
		private maybeCenter(view: EditorView): void {
			if (!typewriterConfig.mode || this.isPointerDown || this.destroyed) return;
			const head = view.state.selection.main.head;
			const lineNumber = view.state.doc.lineAt(head).number;
			if (lineNumber === this.centeredLine) return;
			this.centeredLine = lineNumber;
			const effects = EditorView.scrollIntoView(head, { y: 'center' });
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

			// 淡化装饰：设置、文档、选区、视口（滚动）任一变化即重建
			if (configChanged || update.docChanged || update.selectionSet || update.viewportChanged) {
				this.decorations = buildDimDecorations(update.view);
			}

			// 头部留白：模式/留白开关变化或视口/几何（缩放、字体、窗口大小）变化
			// 时重新计算并写入 scrollDOM 的 padding-top；写入后请求一次测量，
			// 让 CM6 立即读取新的 paddingTop 并刷新坐标换算。
			if (marginChanged || update.viewportChanged || update.geometryChanged) {
				this.applyTopPadding(update.view);
				if (marginChanged) {
					update.view.requestMeasure();
				}
			}

			// 打字机滚动：光标跨行时居中。鼠标按压/拖选期间跳过（松开后由
			// 文档级 pointerup 触发 once 居中），避免拖选过程中光标跟随跳动。
			if (mode && !this.isPointerDown && (update.selectionSet || update.docChanged)) {
				this.maybeCenter(update.view);
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
		name: '开启/关闭打字机模式',
		icon: 'text-cursor-input',
		callback: async () => {
			settings.typewriterMode = !settings.typewriterMode;
			await save();
		},
	});
}
