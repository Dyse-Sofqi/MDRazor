/**
 * MDRazor — Link Opener
 *
 * Intercept wiki link clicks in editor (Live Preview / Reading view).
 * If target file already open in a leaf, switch to it.
 * Otherwise create new tab.
 *
 * Ctrl/Meta+click bypasses → native behavior.
 */

import { EditorView } from '@codemirror/view';
import { type Plugin, TFile, type WorkspaceLeaf } from 'obsidian';

interface LinkTarget {
	linkText: string;
	subpath?: string;
}

/**
 * Parse raw link inner text (from data-href, href, or [[...]]) into file
 * target + optional subpath.
 */
function parseLinkTarget(raw: string): LinkTarget {
	const noAlias = raw.split('|')[0]!;
	const subMatch = noAlias.match(/^(.*?)(#[^#]+)$/);
	if (subMatch) {
		return { linkText: subMatch[1]!, subpath: subMatch[2]! };
	}
	return { linkText: noAlias };
}

/**
 * Find the .cm-hmd-internal-link element that owns link data.
 *
 * In Live Preview, Obsidian renders internal links as a `.cm-hmd-internal-link`
 * span. Block references add a sibling `.cm-hmd-blockref-link` span AFTER
 * the internal-link span. Both may contain child spans with the actual text.
 *
 * This function normalizes:
 *   - el IS .cm-hmd-internal-link → return el
 *   - el is a child of .cm-hmd-internal-link → return parent
 *   - el IS .cm-hmd-blockref-link → return previous sibling .cm-hmd-internal-link
 *   - el is a child of .cm-hmd-blockref-link → return previous sibling of parent
 */
function findPairedInternalLink(el: HTMLElement): HTMLElement | null {
	if (el.classList.contains('cm-hmd-internal-link')) return el;

	const internalParent = el.closest('.cm-hmd-internal-link');
	if (internalParent) return internalParent as HTMLElement;

	const blockref = el.classList.contains('cm-hmd-blockref-link')
		? el
		: el.closest('.cm-hmd-blockref-link');
	if (blockref) {
		let sib = blockref.previousElementSibling;
		while (sib) {
			if (sib.classList.contains('cm-hmd-internal-link')) return sib as HTMLElement;
			sib = sib.previousElementSibling;
		}
	}

	return null;
}

/**
 * Read data-href attribute — checks paired CM6 internal-link, element itself,
 * children, and ancestors.
 */
function readDataHref(el: HTMLElement): string | null {
	const paired = findPairedInternalLink(el);
	if (paired) {
		const dh = paired.getAttribute('data-href');
		if (dh) return dh;
		const child = paired.querySelector('[data-href]');
		if (child) return child.getAttribute('data-href');
	}

	let dh = el.getAttribute('data-href');
	if (dh) return dh;

	const child = el.querySelector('[data-href]');
	if (child) return child.getAttribute('data-href');

	let p: HTMLElement | null = el.parentElement;
	while (p) {
		if (p.classList.contains('cm-editor')) break;
		dh = p.getAttribute('data-href');
		if (dh) return dh;
		p = p.parentElement;
	}

	return null;
}

/**
 * Extract [[...]] inner text from CM6 editor doc for the clicked element.
 *
 * Locates .cm-line container, parses all [[...]] patterns on the line,
 * matches by .cm-hmd-internal-link element index.
 *
 * This is the MOST RELIABLE source — it reads the raw editor text which
 * always contains the full link including subpath and alias.
 */
function extractFromCMState(el: HTMLElement, cm: EditorView): string | null {
	try {
		const cmLine = el.closest('.cm-line');
		if (!cmLine) return null;

		const lineStart = cm.posAtDOM(cmLine, 0);
		const line = cm.state.doc.lineAt(lineStart);
		const lineText = line.text;

		const re = /\[\[([^\]]+)\]\]/g;
		const links: string[] = [];
		let m: RegExpExecArray | null;
		while ((m = re.exec(lineText)) !== null) {
			links.push(m[1]!);
		}
		if (links.length === 0) return null;
		if (links.length === 1) return links[0]!;

		// Multiple links on same line — match by DOM index
		const internalLinks = cmLine.querySelectorAll('.cm-hmd-internal-link');
		const paired = findPairedInternalLink(el);
		if (paired) {
			for (let i = 0; i < internalLinks.length; i++) {
				if (internalLinks[i] === paired) {
					if (i < links.length) return links[i]!;
					return null;
				}
			}
		}

		return links[0]!;
	} catch { /* ignore */ }
	return null;
}

/**
 * Resolve link target from DOM element.
 *
 * Priority:
 *   1. CM6 editor source text — authoritative, always has full [[...]] text
 *   2. data-href — Obsidian attribute (may lack subpath for block refs)
 *   3. href — Reading View <a> tags
 *   4. textContent — simple non-aliased links
 */
function resolveLinkTarget(
	el: HTMLElement,
	cm: EditorView | null,
): LinkTarget | null {
	// Strategy 1: CM6 editor source (MOST RELIABLE — always has full link text)
	if (cm) {
		const raw = extractFromCMState(el, cm);
		if (raw) return parseLinkTarget(raw);
	}

	// Strategy 2: data-href (Obsidian sets this)
	const dh = readDataHref(el);
	if (dh) return parseLinkTarget(dh);

	// Strategy 3: href (Reading View <a> tag)
	const href = el.getAttribute('href');
	if (href) return parseLinkTarget(href);

	// Strategy 4: textContent (simple non-aliased links)
	const text = el.textContent?.trim();
	if (text) return parseLinkTarget(text);

	return null;
}

function getEditorView(plugin: Plugin): EditorView | null {
	const leaf = plugin.app.workspace.activeLeaf;
	if (!leaf) return null;
	try {
		const mdView = leaf.view;
		const editor = (mdView as { editor?: { cm?: EditorView } }).editor;
		return editor?.cm ?? null;
	} catch { return null; }
}

export function registerLinkOpener(
	plugin: Plugin,
	enabled: () => boolean,
): void {
	const { app } = plugin;

	let handled = false;

	const handler = (e: MouseEvent): void => {
		if (handled) { e.preventDefault(); e.stopPropagation(); return; }
		if (!enabled()) return;
		if (e.ctrlKey || e.metaKey) return;

		const linkEl = (e.target as HTMLElement).closest(
			'.cm-hmd-internal-link, .cm-hmd-blockref-link, .internal-link',
		);
		if (!linkEl) return;

		const cm = getEditorView(plugin);
		const linkTarget = resolveLinkTarget(linkEl as HTMLElement, cm);
		if (!linkTarget) return;

		// Resolve source path from active leaf
		const activeLeaf = app.workspace.activeLeaf;
		if (!activeLeaf) return;
		const sourceFile = (activeLeaf.view as { file?: TFile })?.file;
		const sourcePath = sourceFile?.path ?? '';

		const targetFile = app.metadataCache.getFirstLinkpathDest(
			linkTarget.linkText,
			sourcePath,
		);
		if (!targetFile) return;

		const targetPath = targetFile.path;

		// Check if target file is already open in any leaf
		let existingLeaf: WorkspaceLeaf | null = null;
		app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
			if (existingLeaf) return;
			const file = (leaf.view as { file?: TFile })?.file;
			if (file instanceof TFile && file.path === targetPath) {
				existingLeaf = leaf;
				return;
			}
			try {
				const vs = leaf.getViewState?.();
				if (vs?.state?.file === targetPath) {
					existingLeaf = leaf;
				}
			} catch { /* leaf not ready */ }
		});

		handled = true;
		setTimeout(() => { handled = false; }, 0);
		e.stopPropagation();
		e.stopImmediatePropagation();
		e.preventDefault();

		const openOpts: import('obsidian').OpenViewState = { active: true };
		if (linkTarget.subpath) {
			openOpts.eState = { subpath: linkTarget.subpath };
		}

		const leafToUse = existingLeaf ?? app.workspace.getLeaf('tab');
		void leafToUse.openFile(targetFile, openOpts);
	};

	for (const evt of ['pointerdown', 'mousedown', 'click'] as const) {
		plugin.registerDomEvent(
			app.workspace.containerEl,
			evt,
			handler,
			{ capture: true },
		);
	}
}
