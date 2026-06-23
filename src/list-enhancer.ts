import {
	ViewPlugin,
	ViewUpdate,
	EditorView,
} from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { MDRazorSettings, DEFAULT_SETTINGS } from './settings';

/** Module-level mutable config — synced by the plugin on settings change. */
export const listEnhancerConfig: MDRazorSettings = { ...DEFAULT_SETTINGS };

interface AtomicRange {
	from: number;
	to: number; // exclusive
}

/** Module-level copy of the latest atomic ranges, usable by the keydown handler. */
let currentAtomicRanges: AtomicRange[] = [];

function buildAtomicRanges(view: EditorView): AtomicRange[] {
	if (!listEnhancerConfig.listIntegration) return [];

	const ranges: AtomicRange[] = [];
	const tree = syntaxTree(view.state);

	tree.iterate({
		enter(node) {
			if (!node.type.name.includes('formatting-list')) return;
			ranges.push({ from: node.from, to: node.to });
		},
	});

	return ranges;
}

function nudgeOutOfAtomicRanges(pos: number, ranges: readonly AtomicRange[]): number {
	for (const r of ranges) {
		if (pos > r.from && pos < r.to) {
			const distLeft = pos - r.from;
			const distRight = r.to - pos;
			return distLeft <= distRight ? r.from : r.to;
		}
	}
	return pos;
}

function expandDeletion(
	delFrom: number,
	delTo: number,
	view: EditorView,
): { from: number; to: number } | null {
	let expandedFrom = delFrom;
	let expandedTo = delTo;
	let expanded = false;

	for (const r of currentAtomicRanges) {
		if (delFrom < r.to && delTo > r.from) {
			if (r.from < expandedFrom) expandedFrom = r.from;
			if (r.to > expandedTo) expandedTo = r.to;
			expanded = true;
		}
	}

	if (!expanded) return null;

	// If the previous line also contains a list item (sibling or parent),
	// swallow the preceding newline to join with that item.
	const doc = view.state.doc;
	const curLine = doc.lineAt(expandedFrom);
	if (curLine.from > 0) {
		const prevNewline = curLine.from - 1;
		const prevLine = doc.lineAt(prevNewline);
		const tree = syntaxTree(view.state);
		let hasPrevListItem = false;
		tree.iterate({
			from: prevLine.from,
			to: prevLine.to,
			enter(node) {
				if (node.type.name.includes('formatting-list')) {
					hasPrevListItem = true;
					return false;
				}
				return;
			},
		});

		if (hasPrevListItem) {
			expandedFrom = prevNewline;
		}
	}

	return { from: expandedFrom, to: expandedTo };
}

// ── ViewPlugin ───────────────────────────────────────────────────────────

const listEnhancerPlugin = ViewPlugin.fromClass(
	class {
		private atomicRanges: AtomicRange[] = [];

		constructor(view: EditorView) {
			this.atomicRanges = buildAtomicRanges(view);
			currentAtomicRanges = this.atomicRanges;
		}

		update(update: ViewUpdate) {
			this.atomicRanges = buildAtomicRanges(update.view);
			currentAtomicRanges = this.atomicRanges;
			this.correctCursorAfterClick(update);
		}

		private correctCursorAfterClick(update: ViewUpdate) {
			if (!listEnhancerConfig.listIntegration) return;

			for (const tr of update.transactions) {
				if (!tr.isUserEvent('select.pointer')) continue;

				const sel = tr.state.selection.main;
				if (sel.anchor !== sel.head) continue;

				const pos = sel.head;
				const adjusted = nudgeOutOfAtomicRanges(pos, this.atomicRanges);
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
	},
);

// ── DOM handler: whole-unit deletion ────────────────────────────────────

const listDeleteHandler = EditorView.domEventHandlers({
	keydown(event, view) {
		if (!listEnhancerConfig.listIntegration) return false;

		const isBackspace = event.key === 'Backspace';
		const isDelete = event.key === 'Delete';
		if (!isBackspace && !isDelete) return false;

		const sel = view.state.selection.main;
		if (sel.anchor !== sel.head) return false;

		const pos = sel.head;
		let delFrom: number;
		let delTo: number;

		if (isBackspace) {
			if (pos === 0) return false;
			delFrom = pos - 1;
			delTo = pos;
		} else {
			if (pos >= view.state.doc.length) return false;
			delFrom = pos;
			delTo = pos + 1;
		}

		const expanded = expandDeletion(delFrom, delTo, view);
		if (!expanded) return false;

		event.preventDefault();
		view.dispatch({
			changes: { from: expanded.from, to: expanded.to },
			userEvent: isBackspace ? 'deleteContentBackward' : 'deleteContentForward',
		});
		return true;
	},
});

// ── Public factory ───────────────────────────────────────────────────────

export function createListEnhancerExtension() {
	return Prec.high([listEnhancerPlugin, listDeleteHandler]);
}
