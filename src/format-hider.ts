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
 * Module-level mutable config — written by the plugin when settings change,
 * read by the ViewPlugin on each editor update. Avoids coupling the CM6
 * extension to the Obsidian Plugin instance lifecycle.
 */
export const formattingConfig: MDRazorSettings = { ...DEFAULT_SETTINGS };

/**
 * Build a DecorationSet that replaces (hides) formatting markers for any
 * enabled format types. The spec carries a `markerType` so the cursor-
 * adjustment logic can distinguish opening vs closing markers.
 */
function buildDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const tree = syntaxTree(view.state);

	tree.iterate({
		enter(node) {
			const typeName = node.type.name;
			let markerLen = 0;

			// Bold: ** or __  (2 chars)
			if (formattingConfig.hideBoldFormatting && typeName.includes('formatting-strong')) {
				markerLen = 2;
			}
			// Italic: * or _  (1 char)
			else if (formattingConfig.hideItalicFormatting && typeName.includes('formatting-em')) {
				markerLen = 1;
			}
			// Highlight: ==  (2 chars)
			else if (formattingConfig.hideHighlightFormatting && typeName.includes('formatting-highlight')) {
				markerLen = 2;
			}
			// Strikethrough: ~~  (2 chars)
			else if (formattingConfig.hideStrikethroughFormatting && typeName.includes('formatting-strikethrough')) {
				markerLen = 2;
			}
			// Inline code: ` or `` etc. (variable length, exclude code blocks)
			else if (
				formattingConfig.hideCodeFormatting &&
				typeName.includes('formatting-code') &&
				typeName.includes('inline-code')
			) {
				const text = view.state.doc.sliceString(node.from, node.to);
				const match = text.match(/^`+/);
				markerLen = match ? match[0].length : 1;
			}

			if (markerLen > 0) {
				builder.add(
					node.from,
					node.from + markerLen,
					Decoration.replace({ markerType: 'open' }),
				);
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
 * Create the CodeMirror extension that hides formatting markers.
 * Uses `Prec.high` so our decorations take priority over Obsidian internals.
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
				 * After a mouse click, if the cursor lands at the boundary
				 * of a hidden marker (between marker and content), nudge it
				 * outside the entire formatting region so the user experience
				 * matches the visual appearance.
				 */
				private correctCursorAfterClick(update: ViewUpdate) {
					for (const tr of update.transactions) {
						if (!tr.isUserEvent('select.pointer')) continue;

						const sel = tr.state.selection.main;
						if (sel.anchor !== sel.head) continue; // drag selection — skip

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
				 * Scan the decoration set around `pos`:
				 * - pos right after an opening marker → return marker start
				 * - pos right before a closing marker  → return marker end
				 * - otherwise → pos unchanged
				 */
				private adjustCursor(pos: number): number {
					let adjusted = pos;

					// Opening marker to the left?
					this.decorations.between(pos - 1, pos, (from, to, value) => {
						const spec = value.spec as Record<string, unknown>;
						if (to === pos && spec.markerType === 'open') {
							adjusted = from;
							return false;
						}
						return;
					});

					if (adjusted !== pos) return adjusted;

					// Closing marker to the right?
					this.decorations.between(pos, pos + 1, (from, to, value) => {
						const spec = value.spec as Record<string, unknown>;
						if (from === pos && spec.markerType === 'close') {
							adjusted = to;
							return false;
						}
						return;
					});

					return adjusted;
				}
			},
			{
				decorations: (v) => v.decorations,
			},
		),
	);
}
