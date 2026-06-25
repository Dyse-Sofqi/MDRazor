/**
 * MDRazor — 空白符号可视化模块（Controller）
 *
 * 在实时预览中将看不见但占据空间的空白符号以半透明标记展现：
 *   空格 → ·  制表符 → →  软回车 → ↓  回车 → ↵  不换行空格 → °
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

/**
 * 模块级可变配置对象。
 *
 * 插件在每次 `saveSettings()` 时写入此对象。ViewPlugin 在每次
 * `update()` 时读取 —— 无需重新注册扩展即可使开关立即生效。
 */
export const whitespaceConfig: MDRazorSettings = { ...DEFAULT_SETTINGS };

// ═══════════════════════════════════════════════════════════════════════════
// Widget — 替换空白字符的内联元素
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 每个空白字符/标记替换为一个 WhitespaceWidget 实例，
 * 其在 DOM 中按 CSS 类名区分符号类型。
 */
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
 * 为当前视口中所有可见空白字符构建 DecorationSet。
 *
 * 遍历 view.visibleRanges —— 仅处理用户当下能看到的行，
 * 避免对整个文档做全量扫描。
 *
 * 对每行逐字符检测：
 *   - 空格 → · (U+00B7)
 *   - 制表符 → → (U+2192)
 *   - 不换行空格 → ° (U+00B0)
 *
 * 行末标记：
 *   - 段内软换行（下一行非空）→ ↓ (U+2193)
 *   - 段落结束（下一行为空行）→ ↵ (U+21B5)
 *
 * 以下位置保持原样不替换：
 *   - 行首缩进空白（兼容缩进参考线）
 *   - formatting-list 节点内的空白（兼容列一体化光标定位）
 *
 * @param view 当前的 CodeMirror EditorView
 * @returns 覆盖所有待替换空白字符的 DecorationSet，或 Decoration.none
 */
function buildDecorations(view: EditorView): DecorationSet {
	if (!whitespaceConfig.showWhitespace) {
		return Decoration.none;
	}

	const builder = new RangeSetBuilder<Decoration>();
	const doc = view.state.doc;
	const tree = syntaxTree(view.state);

	/**
	 * 判断第 lineNum 行后的换行是段内软换行（↓）还是段落结束（↵）。
	 *
	 * 原理：下一行是空行 → 段落结束（↵）；下一行非空 → 段内续行（↓）。
	 * 不依赖语法树节点名称，兼容 HyperMD 下各种块级元素。
	 */
	function isSoftBreak(lineNum: number): boolean {
		if (lineNum >= doc.lines) return false;
		const nextLine = doc.line(lineNum + 1);
		return nextLine.text.trim().length > 0;
	}

	// 收集 formatting-list 节点范围（列一体化需要原始空格进行光标定位）
	const listMarkerRanges: Array<{ from: number; to: number }> = [];
	tree.iterate({
		enter(node) {
			if (node.type.name.includes('formatting-list')) {
				listMarkerRanges.push({ from: node.from, to: node.to });
			}
		},
	});

	/**
	 * 检查某位置是否落在列表标记范围内。
	 */
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

			// 行首缩进结束位置（缩进空白保留原样，兼容编辑器缩进参考线）
			const firstNonWs = text.search(/\S/);
			const indentEnd = firstNonWs === -1 ? text.length : firstNonWs;

			// ── 逐字符处理空格/制表符/不换行空格 ──
			const startOffset = lineFrom - line.from;
			const endOffset = lineTo - line.from;

			for (let i = startOffset; i < endOffset; i++) {
				const ch = text[i];
				const pos = line.from + i;

				// 跳过缩进空白和列表标记内的空白
				if (i < indentEnd || isInListMarker(pos)) continue;

				if (ch === ' ') {
					builder.add(
						pos, pos + 1,
						Decoration.replace({ widget: new WhitespaceWidget('·', 'mdrazor-ws-space') }),
					);
				} else if (ch === '\t') {
					builder.add(
						pos, pos + 1,
						Decoration.replace({ widget: new WhitespaceWidget('→', 'mdrazor-ws-tab') }),
					);
				} else if (ch === ' ') {
					builder.add(
						pos, pos + 1,
						Decoration.replace({ widget: new WhitespaceWidget('°', 'mdrazor-ws-nbsp') }),
					);
				}
			}

			// ── 行末标记（跳过文档最后一行和空行） ──
			if (lineNum < doc.lines) {
				// 空行本身不标记
				if (text.trim().length === 0) continue;

				const soft = isSoftBreak(lineNum);
				const symbol = soft ? '↓' : '↵';
				const cls = soft ? 'mdrazor-ws-softbreak' : 'mdrazor-ws-hardbreak';

				builder.add(
					line.to, line.to,
					Decoration.widget({
						widget: new WhitespaceWidget(symbol, cls),
						side: 1,
					}),
				);
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

/**
 * 创建空白符号可视化的 CM6 扩展。
 */
export function createWhitespaceExtension() {
	return whitespaceViewPlugin;
}
