/**
 * MDRazor — 隐藏样式模块（Controller）
 *
 * 在 Obsidian 实时预览模式下，通过 CodeMirror 6 装饰隐藏 Markdown
 * 格式化标记符号（**、*、==、~~、`）。
 *
 * ── 架构 ──
 *
 * 本模块导出：
 *   - `formattingConfig` — 模块级可变配置，由 controller/main.ts 在设置变更时写入，
 *     ViewPlugin 在每一帧更新时读取。
 *   - `createFormatHiderExtension()` — 工厂函数，返回一个 `Prec.high`
 *     CM6 扩展，它（a）为格式化标记提供 replace 装饰，（b）在鼠标点击后
 *     修正光标位置。
 */

import {
	ViewPlugin,
	ViewUpdate,
	Decoration,
	DecorationSet,
	EditorView,
} from '@codemirror/view';
import { Prec, RangeSetBuilder } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { MDRazorSettings, DEFAULT_SETTINGS } from '../model/settings';

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
						// 微任务中已使用 this（箭头函数捕获上层作用域）
						queueMicrotask(() => {
							// 重新检查：微任务执行时装饰集可能已被 rebuild（设置变更等）。
							// 如果装饰集变了（例如标记不再隐藏），跳到标记外的修正就不需要了。
							const curPos = view.state.selection.main.head;
							const curAdjusted = this.adjustCursor(curPos);
							if (curAdjusted === curPos) return;

							view.dispatch({
								selection: { anchor: curAdjusted, head: curAdjusted },
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
