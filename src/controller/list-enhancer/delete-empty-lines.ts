/**
 * MDRazor — 批量删除空行（Controller，右键菜单模块）
 *
 * 功能入口：
 *   - 命令「批量删除空行」（随插件注册，不受开关控制；可在命令面板
 *     触发或在「设置 → 快捷键」绑定快捷键）
 *   - 右键菜单项「批量删除空行」（右键菜单模块开关控制显示，点击执行
 *     与命令相同的逻辑）
 *
 * 逻辑：
 *   - 有选中文本：仅删除选中范围内的空行（选中内容重建，非空行保留）
 *   - 无选中文本：删除当前文档的空行
 * 空行定义：行内容移除首尾空白后为空（纯空白行同样视为空行）。
 * Markdown 感知（本功能用于 MD 文档，直接删除空行会破坏结构）：
 *   保留的空行（相邻结构前后，多个空行折叠为一个）：
 *     - 紧邻代码块 / 引用块的行（含代码块内部所有空行，防止破坏代码）；
 *     - 标题（# 开头）与分割线（--- / *** / ___）前后的空行；
 *     - 列表 / 表格整体前后的空行；
 *     - 两个独立表格之间的空行（以「表头行 + 分隔行」区分：下方出现
 *       新表头即视为新表开始）。
 *   删除的空行：
 *     - 段落之间、文档首尾的空行与连续空行（折叠后仍剩的部分亦删）；
 *     - 列表项与列表项之间的空行（松散列表转紧凑列表）；
 *     - 表格行与行之间的空行（粘贴网页内容常带，会导致表格断裂无法
 *       正常显示；删除后可正常渲染）。
 * 实现：按换行符拆分 → 逐行分类（围栏代码 / 表格 / 列表 / 引用 / 块级
 * 标题分割线 / 其他）→ 按「连续空行链」统一判定删除或保留（保留时折叠
 * 为一个）。替换动作经编辑器 dispatch（replaceRange），可用 Ctrl/Cmd+Z
 * 撤销；与原文无差异时不写入。
 */

import { type Editor, MarkdownView, type Plugin } from 'obsidian';
import { tr } from '../../i18n';

/** 行分类：结构识别用 */
type LineKind = 'blank' | 'code' | 'quote' | 'list' | 'table' | 'block' | 'other';

const BLANK_RE = /^\s*$/;
const FENCE_OPEN_RE = /^\s*(`{3,}|~{3,})/;
const QUOTE_RE = /^\s*>/;
const LIST_MARKER_RE = /^\s*(?:[-+*]|\d{1,9}[.)])(?:\s|$)/;
const HEADING_RE = /^\s{0,3}#{1,6}(?:\s|$)/;
/** 分割线：连续 3 个及以上横线/星号/下划线（可含空格间隔：---、* * *、- - -） */
const HR_RE = /^\s{0,3}(?:[-*_]\s*){3,}$/;
/** GFM 表格分隔行：每格至少 3 个连字符（可带 : 对齐）；至少一个 |（支持单列表） */
const TABLE_DELIM_RE = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const TABLE_LEAD_PIPE_RE = /^\s*\|/;

/** 是否为表格分隔行（须含 |，避免与分割线 ---/*** 冲突） */
function isTableDelimLine(line: string): boolean {
	return line.includes('|') && TABLE_DELIM_RE.test(line);
}

/**
 * 空行判定：整行仅含空白字符（含空行与纯空格/制表符行）。
 */
function isEmptyLine(line: string): boolean {
	return line.trim() === '';
}

/** 含 | 的行其后方（跳过空行）紧跟表格分隔行 → 视为无前导竖线的表格行 */
function isFollowedByTableDelim(lines: string[], index: number): boolean {
	for (let i = index + 1; i < lines.length; i++) {
		if (BLANK_RE.test(lines[i]!)) continue;
		return isTableDelimLine(lines[i]!);
	}
	return false;
}

/**
 * 逐行分类。
 * 规则：
 *   - \`\`\` / ~~~ 围栏之间（含围栏行本身，含块内空行）全部视为代码行 code；
 *   - 行首 > 视为引用行 quote；列表标记（-/+/*、1.、1)）视为列表行 list；
 *   - 表格：前导竖线行、GFM 分隔行、无前导竖线但后续紧跟分隔行的行
 *     （表头表）、表格延续中（未隔行）含 | 的行；
 *   - 标题（# 开头）与分割线（--- / *** / ___ 等）视为块级行 block；
 *   - 列表 / 引用后未隔行的续行（惰性续行或缩进内容，非标题 / 分割线 /
 *     表格起始行）归入同组，使结构边界覆盖整个结构而非仅起始行；
 *   - 其余为 other（段落等）。
 * 注：缩进式代码块（4 空格起）不做识别，围栏代码块覆盖绝大多数场景。
 */
function classifyLines(lines: string[]): LineKind[] {
	const kinds: LineKind[] = [];
	let fence: { char: string; len: number } | null = null;
	let runKind: 'list' | 'quote' | 'table' | null = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;

		if (fence !== null) {
			kinds.push('code');
			const close = /^\s*(`+|~+)\s*$/.exec(line);
			if (close && close[1]![0] === fence.char && close[1]!.length >= fence.len) fence = null;
			runKind = null;
			continue;
		}
		const fenceOpen = FENCE_OPEN_RE.exec(line);
		if (fenceOpen) {
			kinds.push('code');
			fence = { char: fenceOpen[1]!.charAt(0), len: fenceOpen[1]!.length };
			runKind = null;
			continue;
		}
		if (BLANK_RE.test(line)) {
			kinds.push('blank');
			runKind = null;
			continue;
		}
		if (QUOTE_RE.test(line)) {
			kinds.push('quote');
			runKind = 'quote';
			continue;
		}
		if (isTableDelimLine(line)) {
			kinds.push('table');
			runKind = 'table';
			continue;
		}
		if (runKind === 'table' && line.includes('|')) {
			kinds.push('table');
			continue;
		}
		if (TABLE_LEAD_PIPE_RE.test(line)) {
			kinds.push('table');
			runKind = 'table';
			continue;
		}
		if (line.includes('|') && isFollowedByTableDelim(lines, i)) {
			kinds.push('table');
			runKind = 'table';
			continue;
		}
		if (HR_RE.test(line)) {
			kinds.push('block');
			runKind = null;
			continue;
		}
		if (HEADING_RE.test(line)) {
			kinds.push('block');
			runKind = null;
			continue;
		}
		if (LIST_MARKER_RE.test(line)) {
			kinds.push('list');
			runKind = 'list';
			continue;
		}
		if (
			(runKind === 'list' || runKind === 'quote') &&
			!HEADING_RE.test(line) &&
			!HR_RE.test(line) &&
			!TABLE_LEAD_PIPE_RE.test(line)
		) {
			kinds.push(runKind);
			continue;
		}
		kinds.push('other');
		runKind = null;
	}
	return kinds;
}

/**
 * down 行是否为「新表表头」：含 | 的非分隔行，其后（跳过空行）紧跟表格
 * 分隔行。用于区分同一表格内部空行（删）与两个独立表格之间的空行（留）。
 */
function isNewTableHeader(body: string[], downIndex: number): boolean {
	if (downIndex >= body.length) return false;
	const line = body[downIndex]!;
	if (isTableDelimLine(line)) return false;
	if (!line.includes('|')) return false;
	for (let k = downIndex + 1; k < body.length; k++) {
		if (isEmptyLine(body[k]!)) continue;
		return isTableDelimLine(body[k]!);
	}
	return false;
}

/**
 * 空行链删除判定：
 *   - up/down = 链两侧最近的非空行 kind（null = 文档边界）；
 *   - 删除：文档边界；两侧均为普通段落（other）；两侧同为列表行或同为
 *     表格行（结构内部）——例外：两侧均为表格行且下方是新表头（两表独立）；
 *   - 其余一律保留（标题/分割线/引用/代码等结构前后，以及列表与表格等
 *     结构之间）。
 */
function shouldDeleteChain(
	up: LineKind | null,
	down: LineKind | null,
	body: string[],
	downIndex: number,
): boolean {
	if (up === null || down === null) return true;
	if (up === 'other' && down === 'other') return true;
	if (up === 'list' && down === 'list') return true;
	if (up === 'table' && down === 'table') {
		return !isNewTableHeader(body, downIndex);
	}
	return false;
}

/**
 * 从文本中移除空行（按 \n 分行重建）。
 * 以「连续空行链」为单位判定：删除的链整链移除；保留的链折叠为一个空行。
 * 文件末尾的换行符不算空行：仅当原文以 \n 结尾时保留一个尾换行；
 * 全文均为空行时清空（含尾换行）。空文本原样返回。
 */
export function removeEmptyLinesFromText(text: string): string {
	if (text === '') return text;
	const endsWithNewline = text.endsWith('\n');
	const body = endsWithNewline ? text.split('\n').slice(0, -1) : text.split('\n');
	const kinds = classifyLines(body);
	const keep = new Array<boolean>(body.length).fill(true);

	let i = 0;
	while (i < body.length) {
		if (kinds[i] !== 'blank') {
			i++;
			continue;
		}
		let j = i;
		while (j + 1 < body.length && kinds[j + 1] === 'blank') j++;
		const upKind = i > 0 ? kinds[i - 1]! : null;
		const downKind = j + 1 < body.length ? kinds[j + 1]! : null;
		if (shouldDeleteChain(upKind, downKind, body, j + 1)) {
			for (let k = i; k <= j; k++) keep[k] = false;
		} else {
			for (let k = i; k <= j; k++) keep[k] = k === i;
		}
		i = j + 1;
	}

	const kept: string[] = [];
	for (let k = 0; k < body.length; k++) {
		if (keep[k]) kept.push(body[k]!);
	}
	if (kept.length === 0) return '';
	return kept.join('\n') + (endsWithNewline ? '\n' : '');
}

/**
 * 执行「批量删除空行」：
 * 有选中文本 → 仅删除选中范围内的空行；无选中 → 删除当前文档空行。
 * 替换结果与原文一致时不写入（避免无意义的历史记录与校验重算）。
 */
export function executeDeleteEmptyLines(editor: Editor): void {
	if (editor.somethingSelected()) {
		const selection = editor.getSelection();
		const cleaned = removeEmptyLinesFromText(selection);
		if (cleaned !== selection) {
			editor.replaceRange(cleaned, editor.getCursor('from'), editor.getCursor('to'));
		}
		return;
	}

	const text = editor.getValue();
	const cleaned = removeEmptyLinesFromText(text);
	if (cleaned !== text) {
		const endLine = editor.lastLine();
		editor.replaceRange(
			cleaned,
			{ line: 0, ch: 0 },
			{ line: endLine, ch: editor.getLine(endLine).length },
		);
	}
}

/**
 * 注册「批量删除空行」命令（右键菜单模块）。
 * 命令随插件注册、不受右键菜单开关影响；可在命令面板触发或绑定快捷键。
 */
export function registerDeleteEmptyLinesCommand(plugin: Plugin): void {
	plugin.addCommand({
		id: 'mdrazor-delete-empty-lines',
		name: tr('批量删除空行', 'Delete Empty Lines'),
		icon: 'eraser',
		checkCallback: (checking: boolean) => {
			const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) return false;

			if (!checking) {
				executeDeleteEmptyLines(view.editor);
			}
			return true;
		},
	});
}

/**
 * 注册「批量删除空行」右键菜单项（右键菜单模块）。
 * 开启时在 Markdown 编辑器右键菜单中添加同名菜单项，点击执行与命令
 * 相同的逻辑。菜单项在弹出时实时读取开关状态，切换无需重载插件。
 */
export function registerDeleteEmptyLinesContextMenu(plugin: Plugin, enabled: () => boolean): void {
	plugin.registerEvent(
		plugin.app.workspace.on('editor-menu', (menu, editor) => {
			if (!enabled()) return;
			menu.addItem((item) =>
				item
					.setTitle(tr('批量删除空行', 'Delete Empty Lines'))
					.setIcon('eraser')
					.onClick(() => executeDeleteEmptyLines(editor)),
			);
		}),
	);
}
