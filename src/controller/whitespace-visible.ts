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
 *   - 硬换行（HardBreak 节点，即 Shift+Enter 产生的 <br>）→ ↓ (U+2193)
 *   - 普通段落回车 → ↵ (U+21B5)
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

	// 收集包含 HardBreak 的行号（软回车 → 显示 ↓）
	const hardBreakLines = new Set<number>();
	tree.iterate({
		enter(node) {
			if (node.type.name.includes('HardBreak')) {
				const line = doc.lineAt(node.from);
				hardBreakLines.add(line.number);
			}
		},
	});

	// 仅扫描可见区域
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

			// ── 逐字符处理空格/制表符/不换行空格 ──
			const startOffset = lineFrom - line.from;
			const endOffset = lineTo - line.from;

			for (let i = startOffset; i < endOffset; i++) {
				const ch = text[i];
				const pos = line.from + i;

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

			// ── 行末标记（跳过文档最后一行） ──
			if (lineNum < doc.lines) {
				const isSoft = hardBreakLines.has(lineNum);
				const symbol = isSoft ? '↓' : '↵';
				const cls = isSoft ? 'mdrazor-ws-softbreak' : 'mdrazor-ws-hardbreak';

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
			// 文档变更、视口滚动、选区变化时均需重新计算
			if (update.docChanged || update.viewportChanged || update.selectionSet) {
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
