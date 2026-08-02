/**
 * MDRazor — 隐藏样式模块（Controller）
 *
 * 在 Obsidian 实时预览模式下，通过 CodeMirror 6 装饰隐藏 Markdown
 * 格式化标记符号（**、*、==、~~、`）、转义符号（\）、以及双链格式（[[、]]）。
 *
 * ── 架构 ──
 *
 * 本模块导出：
 *   - `formattingConfig` — 模块级可变配置，由 controller/main.ts 在设置变更时写入，
 *     ViewPlugin 在每一帧更新时读取。
 *   - `createFormatHiderExtension()` — 工厂函数，返回一个 `Prec.high`
 *     CM6 扩展，它（a）为格式化标记提供 replace 装饰，（b）在鼠标点击后
 *     修正光标位置。
 */

import {
	ViewPlugin,
	ViewUpdate,
	Decoration,
	DecorationSet,
	EditorView,
} from '@codemirror/view';
import { Prec, RangeSetBuilder } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { MDRazorSettings, DEFAULT_SETTINGS } from '../../model/settings';

/**
 * 模块级可变配置对象。
 *
 * 插件在每次 `saveSettings()` 时写入此对象。ViewPlugin 在每次
 * `update()` 时读取 —— 无需重新注册扩展即可使开关立即生效。
 *
 * 这避免了 CM6 扩展与 Obsidian 插件生命周期之间的耦合。
 */
export const formattingConfig: MDRazorSettings = { ...DEFAULT_SETTINGS };

/** 单条待写入的 decoration（{from, to, spec}）。 */
interface DecorationEntry {
	from: number;
	to: number;
	spec: { markerType: 'open' | 'close' };
}

/**
 * 构建一个 `DecorationSet`，替换（隐藏）当前视口中所有已启用的
 * 格式化标记。
 *
 * 流程：收集全部 Decoration → 按 from 排序 → 一次性写入同一个
 *        RangeSetBuilder。
 *
 * 每个 replace 装饰在其 spec 中携带 `markerType` 属性（`'open'`
 * 或 `'close'`），光标修正逻辑据此区分一对标记的左右部分，
 * 从而正确计算推送方向。
 *
 * @param view  当前的 CodeMirror EditorView
 * @returns     覆盖所有待隐藏标记的 DecorationSet
 */
export function buildDecorations(view: EditorView): DecorationSet {
	// 仅实时预览模式生效，源码模式跳过。
	const cmContainer = view.dom.closest('.markdown-source-view');
	if (!cmContainer || !cmContainer.classList.contains('is-live-preview')) {
		return Decoration.none;
	}

	/* ---- Phase 1: 收集全部 decoration 到 entries 数组 ---- */

	const entries: DecorationEntry[] = [];
	const tree = syntaxTree(view.state);

	tree.iterate({
		enter(node) {
			const typeName = node.type.name;
			let markerLen = 0;

			// ── 按节点类型前缀匹配，并检查对应开关状态 ──

			// 加粗：** 或 __ → 2 字符
			if (formattingConfig.hideBoldFormatting && typeName.includes('formatting-strong')) {
				markerLen = 2;
			}
			// 斜体：* 或 _ → 1 字符
			else if (formattingConfig.hideItalicFormatting && typeName.includes('formatting-em')) {
				markerLen = 1;
			}
			// 高亮：== → 2 字符
			else if (formattingConfig.hideHighlightFormatting && typeName.includes('formatting-highlight')) {
				markerLen = 2;
			}
			// 删除线：~~ → 2 字符
			else if (formattingConfig.hideStrikethroughFormatting && typeName.includes('formatting-strikethrough')) {
				markerLen = 2;
			}
			// 行内代码：支持 `、``、```（可变长度）。
			// 通过同时匹配 "formatting-code" 和 "inline-code" 排除代码块。
			else if (
				formattingConfig.hideCodeFormatting &&
				typeName.includes('formatting-code') &&
				typeName.includes('inline-code')
			) {
				const text = view.state.doc.sliceString(node.from, node.to);
				const match = text.match(/^`+/);
				markerLen = match ? match[0].length : 1;
			}
			// 转义符号：\ → 1 字符
			else if (
				formattingConfig.hideEscapeFormatting &&
				(typeName === 'Escape' || typeName === 'escape' || typeName.includes('formatting-escape'))
			) {
				markerLen = 1;
			}
			// Wiki link brackets: [[ and ]].
			// Obsidian live preview splits them into separate formatting tokens:
			//   "formatting-link_formatting-link-start" → [[  (2 chars, open marker)
			//   "formatting-link_formatting-link-end"   → ]]  (2 chars, close marker)
			// hmd-internal-link child nodes (alias, pipe, etc.) are skipped.
			else if (
				formattingConfig.hideWikiLinkFormatting &&
				typeName.startsWith('formatting-link_formatting-link')
			) {
				markerLen = 2;
			}
			// 标题：# → 1-6 字符（可变长度）。
			// # 后必须有空格才算有效标题格式。空格可能在 node 内或 node 后。
			else if (
				formattingConfig.hideHeadingFormatting &&
				(typeName.includes('formatting-header') || typeName.includes('formatting-heading') || typeName.includes('HeadingMark') || typeName.includes('HeaderMark'))
			) {
				const text = view.state.doc.sliceString(node.from, node.to);
				const headingMatch = text.match(/^(#+)\s?$/);
				if (headingMatch) {
					const spaceInside = text.endsWith(' ');
					const spaceAfter = !spaceInside && view.state.doc.sliceString(node.to, node.to + 1) === ' ';
					if (spaceInside || spaceAfter) {
						markerLen = headingMatch[1]!.length + 1;
					}
				}
			}

			// ── 收集起始和结束标记的 replace 装饰 ──

			if (markerLen > 0) {
				const isEscape = typeName === 'Escape' || typeName === 'escape' || typeName.includes('formatting-escape');
				const isHeading = typeName.includes('formatting-header') || typeName.includes('formatting-heading') || typeName.includes('HeadingMark') || typeName.includes('HeaderMark');
				const isInlineCode = typeName.includes('formatting-code') && typeName.includes('inline-code');
				const isWikiStart = typeName.includes('formatting-link_formatting-link-start');
				const isWikiEnd = typeName.includes('formatting-link_formatting-link-end');

				// 防御：Obsidian 解析器在行内 math（$..$）与加粗（**..**）等标记共存时，
				// 会生成范围错误的格式化节点 —— 节点本应只覆盖标记字符本身，实际却可能
				// 包含 latex 正文。校验即将隐藏的切片确实是标记字符；不匹配则跳过该节点。
				// 绝不隐藏非标记内容，同时防止光标边界提示弹框把 latex 误当标记显示。
				const validMarker = (from: number, to: number): boolean => {
					const text = view.state.doc.sliceString(from, to);
					if (isWikiEnd) return text === ']]';
					if (isWikiStart) return text === '[[';
					if (isInlineCode) return /^`+$/.test(text);
					if (isEscape) return text === '\\';
					if (isHeading) return /^#+\s?$/.test(text);
					if (typeName.includes('formatting-strong')) return /^[*_]+$/.test(text);
					if (typeName.includes('formatting-em')) return /^[*_]+$/.test(text);
					if (typeName.includes('formatting-highlight')) return /^=+$/.test(text);
					if (typeName.includes('formatting-strikethrough')) return /^~+$/.test(text);
					return true; // 未知类型 —— 不拦截
				};

				if (isWikiEnd) {
					// ]] close marker only — this node is the 2-char end bracket
					if (validMarker(node.from, node.to)) {
						entries.push({ from: node.from, to: node.to, spec: { markerType: 'close' } });
					}
				} else if (isWikiStart) {
					// [[ open marker only — this node is the 2-char start bracket
					if (validMarker(node.from, node.to)) {
						entries.push({ from: node.from, to: node.to, spec: { markerType: 'open' } });
					}
				} else if (isInlineCode) {
					// 行内代码：node 仅覆盖单个 ` 本身，而非整个标记->内容->标记跨度。
					// 只需一个 decoration 覆盖整个 node 范围。
					if (validMarker(node.from, node.to)) {
						entries.push({ from: node.from, to: node.to, spec: { markerType: 'open' } });
					}
				} else {
					// 起始/结束标记需同时通过校验，否则跳过整个节点。
					if (
						validMarker(node.from, node.from + markerLen) &&
						(isEscape || isHeading || validMarker(node.to - markerLen, node.to))
					) {
						// 起始标记：从节点开始到内容起始
						entries.push({
							from: node.from,
							to: node.from + markerLen,
							spec: { markerType: 'open' },
						});
						// 结束标记：从内容结束到节点结束。
						// 转义符号和标题仅隐藏修饰符，不隐藏被修饰的字符，因此跳过结束标记。
						if (!isEscape && !isHeading) {
							entries.push({
								from: node.to - markerLen,
								to: node.to,
								spec: { markerType: 'close' },
							});
						}
					}
				}
			}
		},
	});

	// ── HTML 颜色标签（如 <font color="#c00000">、</font>）──
	// 此类标签不由 CM6 syntax tree 解析，需正则扫描。
	if (formattingConfig.hideHtmlColorTagFormatting) {
		const docStr = view.state.doc.toString();
		const colorTagRe = /<font\s+color="#[a-fA-F0-9]{3,8}"[^>]*>|<\/font\s*>/g;
		let m: RegExpExecArray | null;
		while ((m = colorTagRe.exec(docStr)) !== null) {
			const isClose = m[0].charAt(1) === '/';
			entries.push({
				from: m.index,
				to: m.index + m[0].length,
				spec: { markerType: isClose ? 'close' : 'open' },
			});
		}
	}

	// ── HTML 下划线标签（<u>、</u>）──
	if (formattingConfig.hideHtmlUnderlineFormatting) {
		const docStr = view.state.doc.toString();
		const underlineTagRe = /<\/?u\s*>/gi;
		let m: RegExpExecArray | null;
		while ((m = underlineTagRe.exec(docStr)) !== null) {
			const isClose = m[0].charAt(1) === '/';
			entries.push({
				from: m.index,
				to: m.index + m[0].length,
				spec: { markerType: isClose ? 'close' : 'open' },
			});
		}
	}

	/* ---- Phase 2: 按 from 排序 ---- */

	entries.sort((a, b) => a.from - b.from);

	/* ---- Phase 3: 一次性写入同一个 RangeSetBuilder ---- */

	const builder = new RangeSetBuilder<Decoration>();
	for (const { from, to, spec } of entries) {
		// CM6 禁止 replace 装饰跨越换行符。Obsidian 的解析器在数学符号
		// （$..$）与加粗（**..**）等标记共存于一行时会生成异常的语法树
		// 节点，其标记范围可能跨越 \n。若直接写入 replace 装饰，ViewPlugin
		// 初始化会抛异常，导致整个编辑器（乃至文件）无法打开。
		// 防御：跳过任何跨越行边界的范围 —— 宁可保留标记可见，不可崩溃。
		const line = view.state.doc.lineAt(from);
		if (to > line.to) continue;

		builder.add(from, to, Decoration.replace(spec));
	}

	return builder.finish();
}

/**
 * 创建隐藏格式化标记的 CM6 扩展。
 *
 * 使用 `Prec.high` 确保我们的装饰优先级高于 Obsidian 内部的格式化装饰，
 * 使标记真正消失，而不是被内置的"光标移入时显示"逻辑覆盖。
 *
 * ViewPlugin 还会捕获 `select.pointer` 事务并通过 `adjustCursor()`
 * 修正光标位置 —— 详见该方法。
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
				 * 鼠标点击后，如果光标落在隐藏标记的边界处（标记与内容之间），
				 * 将其推出整个格式化区域，使体验与视觉外观一致。
				 *
				 * 仅处理 `select.pointer` 事务中的简单点击（非拖拽选择）。
				 * 使用 `queueMicrotask` 确保修正 dispatch 不会干扰原始事务。
				 */
				private correctCursorAfterClick(update: ViewUpdate) {
					for (const tr of update.transactions) {
						if (!tr.isUserEvent('select.pointer')) continue;

						const sel = tr.state.selection.main;
						if (sel.anchor !== sel.head) continue; // 拖拽选择 —— 跳过

						const pos = sel.head;
						const adjusted = this.adjustCursor(pos);
						if (adjusted === pos) continue;

						const view = update.view;
						// 微任务中已使用 this（箭头函数捕获上层作用域）
						queueMicrotask(() => {
							// 重新检查：微任务执行时装饰集可能已被 rebuild（设置变更等）。
							// 如果装饰集变了（例如标记不再隐藏），跳到标记外的修正就不需要了。
							const curPos = view.state.selection.main.head;
							const curAdjusted = this.adjustCursor(curPos);
							if (curAdjusted === curPos) return;

							view.dispatch({
								selection: { anchor: curAdjusted, head: curAdjusted },
								scrollIntoView: false,
							});
						});
					}
				}

				/**
				 * 扫描 `pos` 附近的装饰集：
				 *   - 光标在起始标记右侧 → 返回标记起始位置
				 *   - 光标在结束标记左侧 → 返回标记结束位置
				 *   - 否则 → 返回原位置
				 *
				 * 先检查起始标记（光标左侧），再检查结束标记（光标右侧）。
				 * 由于标记是不重叠的区间，最多只有一个能匹配。
				 */
				private adjustCursor(pos: number): number {
					let adjusted = pos;

					// 检查光标左侧是否有结束位置 == 光标位置的起始标记。
					// 查询区间 [pos-1, pos) —— 光标前一个字符。
					this.decorations.between(pos - 1, pos, (from, to, value) => {
						const spec = value.spec as Record<string, unknown>;
						if (to === pos && spec.markerType === 'open') {
							adjusted = from;
							return false; // 停止遍历
						}
						return;
					});

					if (adjusted !== pos) return adjusted;

					// 检查光标右侧是否有开始位置 == 光标位置的结束标记。
					// 查询区间 [pos, pos+1) —— 光标后一个字符。
					this.decorations.between(pos, pos + 1, (from, to, value) => {
						const spec = value.spec as Record<string, unknown>;
						if (from === pos && spec.markerType === 'close') {
							adjusted = to;
							return false; // 停止遍历
						}
						return;
					});

					return adjusted;
				}
			},
			{
				// 告诉 CM6 `decorations` 属性提供此插件的装饰集。
				decorations: (v) => v.decorations,
			},
		),
	);
}
