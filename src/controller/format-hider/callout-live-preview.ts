/**
 * Callout Live Preview decorations that keep editing in Obsidian's primary
 * CodeMirror instance. Only Markdown markers are replaced; all actual text,
 * selections, commands, history, and third-party editor extensions remain
 * native CodeMirror behavior.
 */

import { setIcon } from 'obsidian';
import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from '@codemirror/view';
import { Prec } from '@codemirror/state';
import type { Range } from '@codemirror/state';
import { DEFAULT_SETTINGS, MDRazorSettings } from '../../model/settings';

export const calloutConfig: MDRazorSettings = { ...DEFAULT_SETTINGS };

interface ParsedQuote {
	depth: number;
	prefixFrom: number;
	contentFrom: number;
	content: string;
}

interface CalloutBlock {
	id: number;
	depth: number;
	type: string;
	metadata: string;
	fold: string;
	themeStyle: string;
}

interface CalloutLine {
	lineNumber: number;
	lineFrom: number;
	lineTo: number;
	text: string;
	quote: ParsedQuote;
	block: CalloutBlock;
	header: RegExpMatchArray | null;
}

const CALLOUT_HEADER_RE = /^\[!([^\]|]+)(?:\|([^\]]*))?\]([+-])?(?:([\t ]+)(.*))?$/i;
const TASK_RE = /^([-+*]\s+)?\[([ xX])\]([\t ]+)/;

const ICONS: Record<string, string> = {
	abstract: 'clipboard-list', summary: 'clipboard-list', tldr: 'clipboard-list',
	info: 'info', todo: 'circle-check-big',
	tip: 'flame', hint: 'flame', important: 'flame',
	success: 'check', check: 'check', done: 'check',
	question: 'circle-help', help: 'circle-help', faq: 'circle-help',
	warning: 'triangle-alert', caution: 'triangle-alert', attention: 'triangle-alert',
	failure: 'x', fail: 'x', missing: 'x',
	danger: 'zap', error: 'zap', bug: 'bug',
	example: 'list', quote: 'quote', cite: 'quote',
};

const themeStyleCache = new WeakMap<Document, Map<string, string>>();

function cssVariable(name: string, value: string): string {
	return value ? `${name}:${value};` : '';
}

function calloutTitle(type: string): string {
	if (type === 'tldr') return 'TL;DR';
	if (type === 'faq') return 'FAQ';
	return type
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

function resolveThemeStyle(view: EditorView, type: string, metadata: string): string {
	const doc = view.dom.ownerDocument;
	const signature = `${doc.body.className}|${doc.body.getAttribute('style') ?? ''}|${doc.styleSheets.length}`;
	const key = `${signature}|${type}|${metadata}`;
	let cache = themeStyleCache.get(doc);
	if (!cache) {
		cache = new Map();
		themeStyleCache.set(doc, cache);
	}
	const cached = cache.get(key);
	if (cached !== undefined) return cached;

	const probe = doc.createElement('div');
	probe.className = 'cm-embed-block markdown-rendered cm-callout mdrazor-callout-theme-probe';
	const callout = probe.createDiv({ cls: 'callout' });
	callout.dataset.callout = type;
	if (metadata) callout.dataset.calloutMetadata = metadata;
	const title = callout.createDiv({ cls: 'callout-title' });
	title.createSpan({ cls: 'callout-icon' });
	const titleInner = title.createSpan({ cls: 'callout-title-inner', text: calloutTitle(type) });
	const content = callout.createDiv({ cls: 'callout-content' });
	const quote = content.createEl('blockquote');
	quote.createEl('p', { text: 'Mdrazor theme probe' });

	(view.dom.closest('.markdown-source-view') ?? doc.body).appendChild(probe);
	const win = doc.defaultView;
	if (!win) {
		probe.remove();
		return '';
	}
	const rootStyle = win.getComputedStyle(callout);
	const titleStyle = win.getComputedStyle(title);
	const titleInnerStyle = win.getComputedStyle(titleInner);
	const contentStyle = win.getComputedStyle(content);
	const quoteStyle = win.getComputedStyle(quote);
	const serialized = [
		cssVariable('--mdrazor-callout-bg', rootStyle.background),
		cssVariable('--mdrazor-callout-color', rootStyle.color),
		cssVariable('--mdrazor-callout-border-top', rootStyle.borderTop),
		cssVariable('--mdrazor-callout-border-right', rootStyle.borderRight),
		cssVariable('--mdrazor-callout-border-bottom', rootStyle.borderBottom),
		cssVariable('--mdrazor-callout-border-left', rootStyle.borderLeft),
		cssVariable('--mdrazor-callout-radius-tl', rootStyle.borderTopLeftRadius),
		cssVariable('--mdrazor-callout-radius-tr', rootStyle.borderTopRightRadius),
		cssVariable('--mdrazor-callout-radius-br', rootStyle.borderBottomRightRadius),
		cssVariable('--mdrazor-callout-radius-bl', rootStyle.borderBottomLeftRadius),
		cssVariable('--mdrazor-callout-margin-top', rootStyle.marginTop),
		cssVariable('--mdrazor-callout-margin-bottom', rootStyle.marginBottom),
		cssVariable('--mdrazor-title-bg', titleStyle.background),
		cssVariable('--mdrazor-title-color', titleStyle.color),
		cssVariable('--mdrazor-title-border-bottom', titleStyle.borderBottom),
		cssVariable('--mdrazor-title-min-height', titleStyle.minHeight),
		cssVariable('--mdrazor-title-padding-top', titleStyle.paddingTop),
		cssVariable('--mdrazor-title-padding-right', titleStyle.paddingRight),
		cssVariable('--mdrazor-title-padding-bottom', titleStyle.paddingBottom),
		cssVariable('--mdrazor-title-padding-left', titleStyle.paddingLeft),
		cssVariable('--mdrazor-title-font-family', titleInnerStyle.fontFamily),
		cssVariable('--mdrazor-title-font-size', titleInnerStyle.fontSize),
		cssVariable('--mdrazor-title-font-weight', titleInnerStyle.fontWeight),
		cssVariable('--mdrazor-title-line-height', titleInnerStyle.lineHeight),
		cssVariable('--mdrazor-content-bg', contentStyle.background),
		cssVariable('--mdrazor-content-color', contentStyle.color),
		cssVariable('--mdrazor-content-padding-top', contentStyle.paddingTop),
		cssVariable('--mdrazor-content-padding-right', contentStyle.paddingRight),
		cssVariable('--mdrazor-content-padding-bottom', contentStyle.paddingBottom),
		cssVariable('--mdrazor-content-padding-left', contentStyle.paddingLeft),
		cssVariable('--mdrazor-quote-bg', quoteStyle.background),
		cssVariable('--mdrazor-quote-color', quoteStyle.color),
		cssVariable('--mdrazor-quote-border-left', quoteStyle.borderLeft),
		cssVariable('--mdrazor-quote-border-left-width', quoteStyle.borderLeftWidth),
		cssVariable('--mdrazor-quote-border-left-color', quoteStyle.borderLeftColor),
		cssVariable('--mdrazor-quote-padding-right', quoteStyle.paddingRight),
		cssVariable('--mdrazor-quote-padding-left', quoteStyle.paddingLeft),
	].join('');
	probe.remove();
	cache.set(key, serialized);
	return serialized;
}

function parseQuote(text: string): ParsedQuote | null {
	const match = text.match(/^(\s*)((?:>\s*)+)(.*)$/);
	if (!match) return null;
	return {
		depth: (match[2]!.match(/>/g) ?? []).length,
		prefixFrom: match[1]!.length,
		contentFrom: match[1]!.length + match[2]!.length,
		content: match[3]!,
	};
}

class CalloutTitleWidget extends WidgetType {
	constructor(private readonly type: string, private readonly showTitle: boolean) {
		super();
	}

	eq(other: CalloutTitleWidget): boolean {
		return this.type === other.type && this.showTitle === other.showTitle;
	}

	toDOM(view: EditorView): HTMLElement {
		const wrapper = view.dom.ownerDocument.createElement('span');
		wrapper.className = 'mdrazor-callout-title-prefix';
		const icon = wrapper.createSpan({ cls: 'callout-icon mdrazor-callout-icon' });
		setIcon(icon, ICONS[this.type] ?? 'pencil');
		if (this.showTitle) {
			wrapper.createSpan({ cls: 'callout-title-inner', text: calloutTitle(this.type) });
		}
		return wrapper;
	}
}

class TaskCheckboxWidget extends WidgetType {
	constructor(private readonly checked: boolean, private readonly position: number) {
		super();
	}

	eq(other: TaskCheckboxWidget): boolean {
		return this.checked === other.checked && this.position === other.position;
	}

	toDOM(view: EditorView): HTMLElement {
		const checkbox = view.dom.ownerDocument.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.className = 'task-list-item-checkbox mdrazor-callout-checkbox';
		checkbox.checked = this.checked;
		checkbox.addEventListener('change', () => {
			view.dispatch({
				changes: { from: this.position, to: this.position + 1, insert: checkbox.checked ? 'x' : ' ' },
				userEvent: 'input',
			});
		});
		return checkbox;
	}

	ignoreEvent(): boolean {
		return false;
	}
}

function buildDecorations(view: EditorView): { decorations: DecorationSet; atomic: DecorationSet } {
	const container = view.dom.closest('.markdown-source-view');
	if (!calloutConfig.calloutWysiwygEnabled || !container?.classList.contains('is-live-preview')) {
		return { decorations: Decoration.none, atomic: Decoration.none };
	}

	const stack: CalloutBlock[] = [];
	const lines: CalloutLine[] = [];
	let nextId = 0;
	for (let number = 1; number <= view.state.doc.lines; number++) {
		const line = view.state.doc.line(number);
		const quote = parseQuote(line.text);
		if (!quote) {
			stack.length = 0;
			continue;
		}
		while (stack.length && stack[stack.length - 1]!.depth > quote.depth) stack.pop();
		const header = quote.content.match(CALLOUT_HEADER_RE);
		if (header) {
			while (stack.length && stack[stack.length - 1]!.depth >= quote.depth) stack.pop();
			const type = header[1]!.trim().toLowerCase();
			const metadata = (header[2] ?? '').trim();
			stack.push({
				id: nextId++, depth: quote.depth, type, metadata,
				fold: header[3] ?? '', themeStyle: resolveThemeStyle(view, type, metadata),
			});
		}
		const block = stack[stack.length - 1];
		if (!block || quote.depth < block.depth) continue;
		lines.push({ lineNumber: number, lineFrom: line.from, lineTo: line.to, text: line.text, quote, block, header });
	}

	const ranges: Range<Decoration>[] = [];
	const atomic: Range<Decoration>[] = [];
	for (let index = 0; index < lines.length; index++) {
		const current = lines[index]!;
		const previous = lines[index - 1];
		const next = lines[index + 1];
		const first = !previous || previous.block.id !== current.block.id || previous.lineNumber + 1 !== current.lineNumber;
		const last = !next || next.block.id !== current.block.id || next.lineNumber !== current.lineNumber + 1;
		const firstContent = !current.header && (!previous || previous.block.id !== current.block.id || Boolean(previous.header));
		const lastContent = !current.header && (!next || next.block.id !== current.block.id || Boolean(next.header));
		const nested = !current.header && current.quote.depth > current.block.depth;
		const classes = ['mdrazor-callout-line', current.header ? 'mdrazor-callout-title-line' : 'mdrazor-callout-content-line'];
		if (first) classes.push('mdrazor-callout-first-line');
		if (last) classes.push('mdrazor-callout-last-line');
		if (firstContent) classes.push('mdrazor-callout-first-content-line');
		if (lastContent) classes.push('mdrazor-callout-last-content-line');
		if (nested) classes.push('mdrazor-callout-nested-quote');

		const attributes: Record<string, string> = {
			class: classes.join(' '),
			'data-callout': current.block.type,
			style: current.block.themeStyle,
		};
		if (current.block.metadata) attributes['data-callout-metadata'] = current.block.metadata;

		const markerFrom = current.lineFrom + current.quote.prefixFrom;
		let markerTo = current.lineFrom + current.quote.contentFrom;
		let widget: WidgetType | undefined;
		if (current.header) {
			const spacing = current.header[4] ?? '';
			const customTitle = current.header[5] ?? '';
			const syntaxLength = current.quote.content.length - spacing.length - customTitle.length;
			markerTo += syntaxLength + spacing.length;
			widget = new CalloutTitleWidget(current.block.type, customTitle.length === 0);
		}
		const marker = Decoration.replace({ widget }).range(markerFrom, markerTo);
		ranges.push(marker);
		atomic.push(marker);

		if (!current.header) {
			const remaining = view.state.sliceDoc(markerTo, current.lineTo);
			const task = remaining.match(TASK_RE);
			if (task) {
				const status = markerTo + task[0].indexOf('[') + 1;
				const taskMarker = Decoration.replace({
					widget: new TaskCheckboxWidget(task[2]!.toLowerCase() === 'x', status),
				}).range(markerTo, markerTo + task[0].length);
				ranges.push(taskMarker);
				atomic.push(taskMarker);
				classes.push('HyperMD-task-line');
				attributes.class = classes.join(' ');
				attributes['data-task'] = task[2]!.toLowerCase() === 'x' ? 'x' : ' ';
			}
		}
		ranges.push(Decoration.line({ attributes }).range(current.lineFrom));
	}

	return { decorations: Decoration.set(ranges, true), atomic: Decoration.set(atomic, true) };
}

export function createCalloutLivePreviewExtension() {
	const plugin = ViewPlugin.fromClass(class {
		decorations: DecorationSet;
		atomic: DecorationSet;

		constructor(view: EditorView) {
			const built = buildDecorations(view);
			this.decorations = built.decorations;
			this.atomic = built.atomic;
		}

		update(update: ViewUpdate): void {
			const built = buildDecorations(update.view);
			this.decorations = built.decorations;
			this.atomic = built.atomic;
		}
	}, { decorations: (instance) => instance.decorations });

	return Prec.highest([
		plugin,
		EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? Decoration.none),
	]);
}
