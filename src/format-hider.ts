/**
 * MDRazor — 隐藏样式模块
 *
 * 在 Obsidian 实时预览模式下，通过 CodeMirror 6 装饰隐藏 Markdown
 * 格式化标记符号（**、*、==、~~、`）。
 *
 * ── 架构 ──
 *
 * 本模块导出：
 *   - `formattingConfig` — 模块级可变配置，由 main.ts 在设置变更时写入，
 *     ViewPlugin 在每一帧更新时读取。
 *   - `createFormatHiderExtension()` — 工厂函数，返回一个 `Prec.high`
 *     CM6 扩展，它（a）为格式化标记提供 replace 装饰，（b）在鼠标点击后
 *     修正光标位置。
 *
 * ── 工作原理 ──
 *
 * Obsidian 的实时预览使用基于 HyperMD 的 Lezer 语法。每个格式化标记
 * 是一个独立的语法树节点，其名称包含 `formatting-<style>` 模式。
 * 关键的节点类型有：
 *
 *   格式     │ 节点名称（包含）          │ 标记长度
 *   ─────────┼───────────────────────────┼────────────
 *   加粗     │ formatting-strong         │ 2 (** / __)
 *   斜体     │ formatting-em             │ 1 (* / _)
 *   高亮     │ formatting-highlight      │ 2 (==)
 *   删除线   │ formatting-strikethrough  │ 2 (~~)
 *   行内代码 │ formatting-code...inline  │ 可变长度 (` / `` / ```)
 *
 * 每次更新时，`buildDecorations()` 遍历语法树，对标记区间应用
 * `Decoration.replace({})`。replace 装饰指示 CM6 不渲染这些区间
 * —— 字符仍在文档模型中（因此光标逻辑正常工作），但在 DOM 中不可见。
 *
 * ── 光标修正 ──
 *
 * 由于标记被隐藏，鼠标点击样式文本的视觉边界时，光标可能落在
 * 起始标记和内容之间（或内容和结束标记之间）。`adjustCursor()` 方法
 * 通过检查点击位置附近的装饰集来检测这种情况，并将光标推出隐藏标记
 * 之外，让用户感知到符合预期的光标位置。
 */

import {
	ViewPlugin,
	ViewUpdate,
	Decoration,
	DecorationSet,
	EditorView,
} from '@codemirror/view';
import { RangeSetBuilder, Prec } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { MDRazorSettings, DEFAULT_SETTINGS } from './settings';

/**
 * 模块级可变配置对象。
 *
 * 插件在每次 `saveSettings()` 时写入此对象。ViewPlugin 在每次
 * `update()` 时读取 —— 无需重新注册扩展即可使开关立即生效。
 *
 * 这避免了 CM6 扩展与 Obsidian 插件生命周期之间的耦合。
 */
export const formattingConfig: MDRazorSettings = { ...DEFAULT_SETTINGS };

/**
 * 构建一个 `DecorationSet`，替换（隐藏）当前视口中所有已启用的
 * 格式化标记。
 *
 * 每个 replace 装饰在其 spec 中携带 `markerType` 属性（`'open'`
 * 或 `'close'`），光标修正逻辑据此区分一对标记的左右部分，
 * 从而正确计算推送方向。
 *
 * @param view  当前的 CodeMirror EditorView
 * @returns     覆盖所有待隐藏标记的 DecorationSet
 */
function buildDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const tree = syntaxTree(view.state);

	tree.iterate({
		enter(node) {
			const typeName = node.type.name;
			let markerLen = 0;

			// ── 按节点类型前缀匹配，并检查对应开关状态 ──

			// 加粗：** 或 __ → 2 字符
			if (formattingConfig.hideBoldFormatting && typeName.includes('formatting-strong')) {
				markerLen = 2;
			}
			// 斜体：* 或 _ → 1 字符
			else if (formattingConfig.hideItalicFormatting && typeName.includes('formatting-em')) {
				markerLen = 1;
			}
			// 高亮：== → 2 字符
			else if (formattingConfig.hideHighlightFormatting && typeName.includes('formatting-highlight')) {
				markerLen = 2;
			}
			// 删除线：~~ → 2 字符
			else if (formattingConfig.hideStrikethroughFormatting && typeName.includes('formatting-strikethrough')) {
				markerLen = 2;
			}
			// 行内代码：支持 `、``、```（可变长度）。
			// 通过同时匹配 "formatting-code" 和 "inline-code" 排除代码块。
			else if (
				formattingConfig.hideCodeFormatting &&
				typeName.includes('formatting-code') &&
				typeName.includes('inline-code')
			) {
				const text = view.state.doc.sliceString(node.from, node.to);
				const match = text.match(/^`+/);
				markerLen = match ? match[0].length : 1;
			}

			// ── 对起始和结束标记应用 replace 装饰 ──

			if (markerLen > 0) {
				// 起始标记：从节点开始到内容起始
				builder.add(
					node.from,
					node.from + markerLen,
					Decoration.replace({ markerType: 'open' }),
				);
				// 结束标记：从内容结束到节点结束
				builder.add(
					node.to - markerLen,
					node.to,
					Decoration.replace({ markerType: 'close' }),
				);
			}
		},
	});

	return builder.finish();
}

/**
 * 创建隐藏格式化标记的 CM6 扩展。
 *
 * 使用 `Prec.high` 确保我们的装饰优先级高于 Obsidian 内部的格式化装饰，
 * 使标记真正消失，而不是被内置的"光标移入时显示"逻辑覆盖。
 *
 * ViewPlugin 还会捕获 `select.pointer` 事务并通过 `adjustCursor()`
 * 修正光标位置 —— 详见该方法。
 */
export function createFormatHiderExtension() {
	return Prec.high(
		ViewPlugin.fromClass(
			class {
				decorations: DecorationSet;

				constructor(view: EditorView) {
					this.decorations = buildDecorations(view);
				}

				update(update: ViewUpdate) {
					this.decorations = buildDecorations(update.view);
					this.correctCursorAfterClick(update);
				}

				/**
				 * 鼠标点击后，如果光标落在隐藏标记的边界处（标记与内容之间），
				 * 将其推出整个格式化区域，使体验与视觉外观一致。
				 *
				 * 仅处理 `select.pointer` 事务中的简单点击（非拖拽选择）。
				 * 使用 `queueMicrotask` 确保修正 dispatch 不会干扰原始事务。
				 */
				private correctCursorAfterClick(update: ViewUpdate) {
					for (const tr of update.transactions) {
						if (!tr.isUserEvent('select.pointer')) continue;

						const sel = tr.state.selection.main;
						if (sel.anchor !== sel.head) continue; // 拖拽选择 —— 跳过

						const pos = sel.head;
						const adjusted = this.adjustCursor(pos);
						if (adjusted === pos) continue;

						const view = update.view;
						queueMicrotask(() => {
							view.dispatch({
								selection: { anchor: adjusted, head: adjusted },
								scrollIntoView: false,
							});
						});
					}
				}

				/**
				 * 扫描 `pos` 附近的装饰集：
				 *   - 光标在起始标记右侧 → 返回标记起始位置
				 *   - 光标在结束标记左侧 → 返回标记结束位置
				 *   - 否则 → 返回原位置
				 *
				 * 先检查起始标记（光标左侧），再检查结束标记（光标右侧）。
				 * 由于标记是不重叠的区间，最多只有一个能匹配。
				 */
				private adjustCursor(pos: number): number {
					let adjusted = pos;

					// 检查光标左侧是否有结束位置 == 光标位置的起始标记。
					// 查询区间 [pos-1, pos) —— 光标前一个字符。
					this.decorations.between(pos - 1, pos, (from, to, value) => {
						const spec = value.spec as Record<string, unknown>;
						if (to === pos && spec.markerType === 'open') {
							adjusted = from;
							return false; // 停止遍历
						}
						return;
					});

					if (adjusted !== pos) return adjusted;

					// 检查光标右侧是否有开始位置 == 光标位置的结束标记。
					// 查询区间 [pos, pos+1) —— 光标后一个字符。
					this.decorations.between(pos, pos + 1, (from, to, value) => {
						const spec = value.spec as Record<string, unknown>;
						if (from === pos && spec.markerType === 'close') {
							adjusted = to;
							return false; // 停止遍历
						}
						return;
					});

					return adjusted;
				}
			},
			{
				// 告诉 CM6 `decorations` 属性提供此插件的装饰集。
				decorations: (v) => v.decorations,
			},
		),
	);
}
