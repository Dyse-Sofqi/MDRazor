/**
 * MDRazor — 空白符号可视化模块（Controller）
 *
 * 在实时预览中将看不见但占据空间的空白符号以半透明标记展现：
 *   空格 → ·  制表符 → →  软回车 → ↓  硬回车 → ↵  段落结束 → ¶
 *
 * ── 架构 ──
 *
 * 本模块导出：
 *   - `whitespaceConfig` — 模块级可变配置，由 controller/main.ts 在设置变更时写入，
 *     ViewPlugin 在每一帧更新时读取。
 *   - `createWhitespaceExtension()` — 工厂函数，返回一个 CM6 ViewPlugin，
 *     通过 Decoration.replace/widget 替换空白字符的视觉呈现。
 *
 * ── 兼容性 ──
 *
 * formatting-list 节点内的空白字符不受影响（保留原始空格），
 * 以免 Decoration.replace 干扰列一体化的光标位置映射。
 *
 * 行首缩进空白（空格/制表符）同样保留原样，以免干扰编辑器的缩进参考线。
 */

import {
	ViewPlugin,
	ViewUpdate,
	Decoration,
	DecorationSet,
	EditorView,
	WidgetType,
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { MDRazorSettings, DEFAULT_SETTINGS } from '../model/settings';

export const whitespaceConfig: MDRazorSettings = { ...DEFAULT_SETTINGS };

// ═══════════════════════════════════════════════════════════════════════════
// Widget
// ═══════════════════════════════════════════════════════════════════════════

class WhitespaceWidget extends WidgetType {
	constructor(
		readonly symbol: string,
		readonly extraClass: string = '',
	) {
		super();
	}

	toDOM(): HTMLElement {
		const span = document.createElement('span');
		span.className = `mdrazor-ws-char ${this.extraClass}`.trim();
		span.textContent = this.symbol;
		return span;
	}

	eq(other: WhitespaceWidget): boolean {
		return other.symbol === this.symbol && other.extraClass === this.extraClass;
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// Decoration 构建
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 行末换行有三类：
 *
 *   ↓ 软回车 — 段内续行（下一行是非空无列表标记的内容）
 *   ↵ 硬回车 — 新块级元素（下一行是列表项、标题等）
 *   ¶ 段落结束 — 后面有空行（再下一行开始新段落）
 *
 * 以下位置保持原样不替换：
 *   - 行首缩进空白（兼容缩进参考线）
 *   - formatting-list 节点内的空白（兼容列一体化光标定位）
 */
function buildDecorations(view: EditorView): DecorationSet {
	if (!whitespaceConfig.showWhitespace) {
		return Decoration.none;
	}

	const builder = new RangeSetBuilder<Decoration>();
	const doc = view.state.doc;
	const tree = syntaxTree(view.state);

	/**
	 * 判断第 lineNum 行后的换行类型。
	 */
	function breakType(lineNum: number): 'soft' | 'hard' | 'para' {
		if (lineNum >= doc.lines) return 'para';
		const nextText = doc.line(lineNum + 1).text;

		if (nextText.trim().length === 0) return 'para';                          // 空行
		if (/^\s*(?:[-*+]|\d+[.)]|\[[ x\]])[\s]/.test(nextText)) return 'hard';  // 新列表项
		return 'soft';                                                             // 续行
	}

	// 收集 formatting-list 节点范围（列一体化白名单）
	const listMarkerRanges: Array<{ from: number; to: number }> = [];
	tree.iterate({
		enter(node) {
			if (node.type.name.includes('formatting-list')) {
				listMarkerRanges.push({ from: node.from, to: node.to });
			}
		},
	});

	function isInListMarker(pos: number): boolean {
		for (const r of listMarkerRanges) {
			if (pos >= r.from && pos < r.to) return true;
		}
		return false;
	}

	// ═══════════════════════════════════════════════════════════════════════
	// 可见区域扫描
	// ═══════════════════════════════════════════════════════════════════════

	for (const { from, to } of view.visibleRanges) {
		if (from >= to) continue;

		const startLine = doc.lineAt(from);
		const endLine = doc.lineAt(to);

		for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
			const line = doc.line(lineNum);
			const lineFrom = Math.max(line.from, from);
			const lineTo = Math.min(line.to, to);
			if (lineFrom >= lineTo) continue;

			const text = line.text;

			// 行首缩进结束位置
			const firstNonWs = text.search(/\S/);
			const indentEnd = firstNonWs === -1 ? text.length : firstNonWs;

			// ── 逐字符处理空格/制表符/不换行空格 ──
			const startOffset = lineFrom - line.from;
			const endOffset = lineTo - line.from;

			for (let i = startOffset; i < endOffset; i++) {
				const ch = text[i];
				const pos = line.from + i;

				if (i < indentEnd || isInListMarker(pos)) continue;

				if (ch === ' ') {
					builder.add(pos, pos + 1, Decoration.replace({
						widget: new WhitespaceWidget('·', 'mdrazor-ws-space'),
					}));
				} else if (ch === '\t') {
					builder.add(pos, pos + 1, Decoration.replace({
						widget: new WhitespaceWidget('→', 'mdrazor-ws-tab'),
					}));
				} else if (ch === ' ') {
					builder.add(pos, pos + 1, Decoration.replace({
						widget: new WhitespaceWidget('°', 'mdrazor-ws-nbsp'),
					}));
				}
			}

			// ── 行末标记（跳过文档最后一行和空行） ──
			if (lineNum < doc.lines) {
				if (text.trim().length === 0) continue;

				switch (breakType(lineNum)) {
					case 'soft':
						builder.add(line.to, line.to, Decoration.widget({
							widget: new WhitespaceWidget('↓', 'mdrazor-ws-softbreak'),
							side: 1,
						}));
						break;
					case 'hard':
						builder.add(line.to, line.to, Decoration.widget({
							widget: new WhitespaceWidget('↵', 'mdrazor-ws-hardbreak'),
							side: 1,
						}));
						break;
					case 'para':
						builder.add(line.to, line.to, Decoration.widget({
							widget: new WhitespaceWidget('¶', 'mdrazor-ws-paragraph'),
							side: 1,
						}));
						break;
				}
			}
		}
	}

	return builder.finish();
}

// ═══════════════════════════════════════════════════════════════════════════
// ViewPlugin
// ═══════════════════════════════════════════════════════════════════════════

const whitespaceViewPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;

		constructor(view: EditorView) {
			this.decorations = buildDecorations(view);
		}

		update(update: ViewUpdate) {
			if (update.docChanged || update.viewportChanged) {
				this.decorations = buildDecorations(update.view);
			}
		}
	},
	{
		decorations: (v) => v.decorations,
	},
);

// ═══════════════════════════════════════════════════════════════════════════
// 工厂函数
// ═══════════════════════════════════════════════════════════════════════════

export function createWhitespaceExtension() {
	return whitespaceViewPlugin;
}
