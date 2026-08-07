/**
 * MDRazor — 空格可视化模块（Controller）
 *
 * 在实时预览中将空格以半透明 · 标记展现，帮助辨识空白位置。
 *
 * ── 架构 ──
 *
 * 本模块导出：
 *   - `spaceConfig` — 模块级可变配置，由 controller/main.ts 在设置变更时写入。
 *   - `createSpaceVisualizationExtension()` — 工厂函数，返回一个 CM6 ViewPlugin，
 *     通过 Decoration.replace 将空格替换为 · 标记。
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
import { MDRazorSettings, DEFAULT_SETTINGS } from '../../model/settings';
import { getHiddenRanges } from './format-hider';

export const spaceConfig: MDRazorSettings = { ...DEFAULT_SETTINGS };

class SpaceWidget extends WidgetType {
		toDOM(view: EditorView): HTMLElement {
			const doc = view.dom.ownerDocument;
			const span = doc.createElement('span');
			span.className = 'mdrazor-space-char';
			span.textContent = '·';
			return span;
	}

	eq(other: SpaceWidget): boolean {
		return other instanceof SpaceWidget;
	}
}

function buildDecorations(view: EditorView): DecorationSet {
	if (!spaceConfig.showWhitespace) {
		return Decoration.none;
	}

	const builder = new RangeSetBuilder<Decoration>();
	const doc = view.state.doc;

	// 隐藏格式符号（如 <span style="...">）内的空格 —— 这些区间已被
	// format-hider 隐藏（mark/replace 装饰），若再渲染空格 widget 会让
	// 隐藏内容里的空格以 `·` 重新显示出来。收集这些空格位置并在下方跳过。
	const hiddenSpaces = new Set<number>();
	for (const range of getHiddenRanges()) {
		const { from, to } = range;
		if (from >= to) continue;
		const startLine = doc.lineAt(from);
		const endLine = doc.lineAt(to);
		for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
			const line = doc.line(lineNum);
			const segStart = Math.max(line.from, from) - line.from;
			const segEnd = Math.min(line.to, to) - line.from;
			for (let i = segStart; i < segEnd; i++) {
				if (line.text[i] === ' ') hiddenSpaces.add(line.from + i);
			}
		}
	}

	for (const { from, to } of view.visibleRanges) {
		if (from >= to) continue;

		const startLine = doc.lineAt(from);
		const endLine = doc.lineAt(to);

		for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
			const line = doc.line(lineNum);
			const lineFrom = Math.max(line.from, from);
			const lineTo = Math.min(line.to, to);
			if (lineFrom >= lineTo) continue;

			for (let i = lineFrom - line.from; i < lineTo - line.from; i++) {
				if (line.text[i] !== ' ') continue;
				const pos = line.from + i;
				if (hiddenSpaces.has(pos)) continue;
				builder.add(
					pos, pos + 1,
					Decoration.replace({ widget: new SpaceWidget() }),
				);
			}
		}
	}

	return builder.finish();
}

const spaceViewPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;

		constructor(view: EditorView) {
			this.decorations = buildDecorations(view);
		}

		update(update: ViewUpdate) {
			this.decorations = buildDecorations(update.view);
		}
	},
	{
		decorations: (v) => v.decorations,
	},
);

export function createSpaceVisualizationExtension() {
	return spaceViewPlugin;
}
