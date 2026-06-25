/**
 * MDRazor — 回车软换行模块（Controller）
 *
 * 在 capture 阶段拦截 DOM keydown Enter 事件，以绕过 CodeMirror 6 的优先级体系。
 * HyperMD 的 Enter 处理使用 domEventHandlers（冒泡阶段），capture 阶段优先
 * 于所有冒泡处理器，确保我们的拦截一定生效。
 *
 * 当 `enterSoftBreak` 启用且光标位于列表项内时：
 *   1. Feature 1：插入软换行（\n + 缩进）而非创建新列表项
 *   2. Feature 2：空白续行升级为同级列表项
 *   3. Feature 3：空白列表项（上级也空）回车 → 提升层级；一级项清除格式
 */

import { EditorView, ViewPlugin } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { listEnhancerConfig, isInListItem } from '../model/shared';

/**
 * ViewPlugin — 在 capture 阶段拦截 Enter 按键。
 *
 * 当光标在列表项内且 `enterSoftBreak` 开启时，以软换行替代 Enter 默认行为。
 */
const enterCapturePlugin = ViewPlugin.fromClass(
	class {
		private readonly view: EditorView;
		private readonly handler: (event: KeyboardEvent) => void;

		constructor(view: EditorView) {
			this.view = view;

			this.handler = (event: KeyboardEvent) => {
				if (event.key !== 'Enter') return;
				if (!listEnhancerConfig.enterSoftBreak) return;

				const sel = view.state.selection.main;
				if (sel.anchor !== sel.head) return;

				const pos = sel.head;
				if (!isInListItem(view, pos)) return;

				const tree = syntaxTree(view.state);

				// 在 cursor 之前寻找最近的 formatting-list 节点
				// HyperMD 无 ListItem 节点，以 formatting-list 定位所属列表项
				let lastMarker: { from: number; to: number } | null = null;
				{
					const cursor = tree.cursor();
					do {
						if (cursor.type.name.includes('formatting-list')) {
							if (cursor.from > pos) break;
							lastMarker = { from: cursor.from, to: cursor.to };
						}
					} while (cursor.next());
				}

				if (!lastMarker) return;

				const markerText = view.state.doc.sliceString(
					lastMarker.from, lastMarker.to);
				const markerLine = view.state.doc.lineAt(lastMarker.from);

				const line = view.state.doc.lineAt(pos);
				const prefix = view.state.doc.sliceString(line.from, pos);
				const isBlankPrefix = /^[ \t]*$/.test(prefix);
				const isFirstLine = line.number === markerLine.number;

				// 缩进：保留原始样式（tab 保持 tab），仅列表符替换为等宽空格
				const leadingMatch = /^[ \t]*/.exec(line.text);
				const leadingLen = leadingMatch ? leadingMatch[0].length : 0;
				let indentStr: string;
				if (isFirstLine) {
					// 首行：保留列表符之前的缩进样式，将列表符替换为等宽空格
					const beforeMarker = view.state.doc.sliceString(
						markerLine.from, lastMarker.from);
					const markerWidth = lastMarker.to - lastMarker.from;
					indentStr = '\n' + beforeMarker + ' '.repeat(markerWidth);
				} else {
					// 续行：直接复制前置空白（tab/空格原样保留）
					indentStr = '\n'
						+ view.state.doc.sliceString(line.from, line.from + leadingLen);
				}

				// ── Feature 2：空白续行升级为列表项 ──
				if (!isFirstLine && isBlankPrefix && line.number > 1) {
					const prevLine = view.state.doc.line(line.number - 1);
					if (prevLine.text.trim().length > 0) {
						const beforeMarker = view.state.doc.sliceString(
							markerLine.from, lastMarker.from);
						const replacement = beforeMarker + markerText;

						event.preventDefault();
						event.stopImmediatePropagation();
						view.dispatch({
							changes: { from: line.from, to: pos, insert: replacement },
							selection: { anchor: line.from + replacement.length },
							userEvent: 'input',
						});
						return;
					}
				}

				// ── Feature 3：空白列表项回车 → 提升层级 ──
				if (isFirstLine && line.number > 1) {
					const afterMarker = line.text.slice(lastMarker.to - line.from);
					if (afterMarker.trim().length === 0) {
						const prevLine = view.state.doc.line(line.number - 1);
						const prevLineText = prevLine.text.trim();
						if (/^[-*+]\s*$/.test(prevLineText) || /^\d+[.)]\s*$/.test(prevLineText)) {
							const currIndent = leadingMatch ? leadingMatch[0] : '';
							if (currIndent.length === 0) {
								// Top level → clear list format
								event.preventDefault();
								event.stopImmediatePropagation();
								view.dispatch({
									changes: { from: line.from, to: line.to, insert: '' },
									selection: { anchor: line.from },
									userEvent: 'input',
								});
								return;
							}
							// Find parent indent level
							let parentIndent = '';
							for (let j = line.number - 1; j >= 1; j--) {
								const cl = view.state.doc.line(j);
								const clMatch = /^[ \t]*/.exec(cl.text);
								if (!clMatch) continue;
								if (clMatch[0].length < currIndent.length
									&& /^[ \t]*[-*+]/.test(cl.text)) {
									parentIndent = clMatch[0];
									break;
								}
							}
							const promoted = (parentIndent || '') + markerText;
							event.preventDefault();
							event.stopImmediatePropagation();
							view.dispatch({
								changes: { from: line.from, to: line.to, insert: promoted },
								selection: { anchor: line.from + promoted.length },
								userEvent: 'input',
							});
							return;
						}
					}
				}

				// ── Feature 1：软换行 ──
				event.preventDefault();
				event.stopImmediatePropagation();
				view.dispatch({
					changes: { from: pos, insert: indentStr },
					selection: { anchor: pos + indentStr.length },
					userEvent: 'input',
				});
			};

			view.dom.addEventListener('keydown', this.handler, { capture: true });
		}

		destroy() {
			this.view.dom.removeEventListener('keydown', this.handler, { capture: true });
		}
	},
);

/**
 * 创建回车软换行 CM6 扩展。
 */
export function createEnterSoftBreakExtension() {
	return [enterCapturePlugin];
}
