/**
 * MDRazor — 代码块语言标签中文支持（Controller）
 *
 * 需求：实时预览下代码块右上角的原生语言标签对中文支持不完整（提取机制
 * 见 code-block-lang-scan.ts 头注释）：``` 后跟纯中文时退化为复制图标；
 * 中英混杂（```py中文）时在首个非 ASCII 字符处截断、只显示英文前缀。
 * 本模块把 Unicode 词元填回原生 flair span，外观与「点击复制」行为和
 * 纯英文名完全一致；原生已完整显示的纯 ASCII 词元一律不碰。
 *
 * ── 实现 ──
 *
 * 原生 flair span 的构建（Z5 widget）：
 *   createSpan({ cls: "code-block-flair", text: lang })，lang 为空时以
 *   setIcon(span, "lucide-copy") 塞图标；widget 挂在围栏起始行行末
 *   （replace 装饰隐藏 ```` ``` ```` 后的整个信息串），点击 span 复制代码块
 *   内容。中文场景下该 span 必定已存在于 DOM（图标分支或截断文本），只是
 *   文本为空或残缺——所以修法是「就地补文本」，不需要自己造装饰：
 *   - 用 posAtDOM(span) 定位围栏行（span 就在该行的 DOM 里），取行文本交给
 *     纯函数层同时提取 Unicode 词元（token）与原生 B5 词元（nativeToken）；
 *   - token 为空（无语言名 / 信息串含反引号）→ 不动；若之前补过则还原图标；
 *   - token === nativeToken（纯 ASCII 词元，原生已完整显示，含 js →
 *     JavaScript 的模式名映射）→ 不碰，保持原生行为；
 *   - token ≠ nativeToken（原生截断或为空）→ span.textContent = token
 *     （svg 图标随之移除，原生文本样式自动生效），并打 data-mz-code-lang
 *     标记记录「本插件补的、补的是什么」。
 *
 * 标记（data-mz-code-lang）的必要性：补完文本后 span 与原生英文标签外表
 * 相同，无法再从外观区分；后续重扫要靠标记识别「哪些是本插件补的」——
 * 行文本变了要更新、词元消失要还原成图标、开关关闭要整体还原。
 * 注意「不碰原生」的判据是 token === nativeToken 而非「span 有文本」：
 * 原生对混合词元的截断显示（py中文 → py）也是非空文本，同样要补全。
 *
 * ── 触发时机（性能取向）──
 *
 * 不做每帧扫描（format-hider 2.7.3 的教训），两条互补路径覆盖全部出现时机：
 *   1. MutationObserver 挂 view.scrollDOM（增量、零轮询）：flair widget 由
 *      Obsidian 按需创建/销毁（光标进出代码块、行进入视口、文档编辑都会
 *      重建 widget DOM），新增节点里出现 flair 就补；只在确有新增节点时
 *      才有开销，光标移动/滚动本身不触发任何逻辑。
 *   2. ViewUpdate 钩子在 docChanged 或开关翻转时全量重扫一遍视口内的
 *      flair：兜住「DOM 被 CM 原样复用、观察器静默」的过期场景——例如
 *      撤销/重做只改了信息串行（widget eq 按 lang/code 比较，二者皆不变
 *      时复用旧 DOM，补过的文本不会自行更新）。重扫是一次
 *      querySelectorAll：CM6 虚拟化视口，DOM 只有视口内的行，量级很小；
 *      且只在按键/开关翻转时触发，不随光标移动发生。
 *
 * 文档位置（posAtDOM）每次现取、从不缓存：编辑与撤销都会让旧位置失效，
 * 缓存反而制造过期映射；span 不在视图内（离屏/销毁中）时 closest/posAtDOM
 * 失败直接放行，不扩散。
 *
 * 开关即时生效：controller/main.ts 的 syncConfig 写本模块配置对象，
 * saveSettings 自带的 repaintAllEditors 派发空事务 → update() 察觉开关
 * 翻转 → 全量重扫（关闭 = 还原所有补过的标签为图标）。无需重注册扩展。
 *
 * 范围：仅编辑器（实时预览 / 源码模式，随 registerEditorExtension 覆盖
 * popout）。阅读模式没有 flair（右上角只有悬停出现的复制按钮），不处理。
 */

import { setIcon, type Plugin } from 'obsidian';
import { ViewPlugin, ViewUpdate, EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import type { PluginValue } from '@codemirror/view';
import { extractFenceLanguage } from './code-block-lang-scan';

/**
 * 模块级可变配置。
 *
 * controller/main.ts 在每次 syncConfig() 时写入。ViewPlugin 在 update()
 * 里对比上次已知值，翻转即全量重扫（开启 = 补齐，关闭 = 还原）。
 */
export const codeBlockLangLabelConfig = { enabled: true };

/** 原生 flair span（语言标签 / 复制图标二合一） */
const FLAIR_SELECTOR = '.code-block-flair';
/** 本插件补丁标记：值为当前填入的词元；存在即「本插件补过」 */
const LABEL_ATTR = 'data-mz-code-lang';
/** 原生空标签时塞的图标（还原时用 Obsidian 公开 API 重画） */
const COPY_ICON = 'lucide-copy';

/**
 * 创建「代码块语言标签中文支持」扩展（onload 经 registerEditorExtension 注册）。
 */
export function createCodeBlockLangLabelExtension(): Extension {
	return ViewPlugin.fromClass(
		class implements PluginValue {
			private readonly view: EditorView;
			private lastEnabled: boolean;
			private readonly observer: MutationObserver;

			constructor(view: EditorView) {
				this.view = view;
				this.lastEnabled = codeBlockLangLabelConfig.enabled;
				if (this.lastEnabled) {
					this.scanAll();
				}
				// 增量观察：flair widget 的 DOM 由 Obsidian 按需创建（见模块头注释），
				// 出现即补；removedNodes 不处理（widget 销毁时 DOM 自然移除，无泄漏）
				this.observer = new MutationObserver((mutations) => this.onMutations(mutations));
				this.observer.observe(view.scrollDOM, { childList: true, subtree: true });
			}

			update(u: ViewUpdate) {
				// docChanged：兜住「DOM 复用导致补丁过期」的重扫；
				// 开关翻转：syncConfig 已写配置对象，这里察觉后全量补/还原
				if (u.docChanged || codeBlockLangLabelConfig.enabled !== this.lastEnabled) {
					this.lastEnabled = codeBlockLangLabelConfig.enabled;
					this.scanAll();
				}
			}

			destroy() {
				this.observer.disconnect();
			}

			private onMutations(mutations: MutationRecord[]) {
				if (!codeBlockLangLabelConfig.enabled) {
					return;
				}
				for (const mutation of mutations) {
					for (const node of Array.from(mutation.addedNodes)) {
						// instanceOf 是 Obsidian 的跨窗口 instanceof（popout 编辑器同样生效）
						if (!node.instanceOf(Element)) {
							continue;
						}
						if (node.matches(FLAIR_SELECTOR)) {
							processSpan(this.view, node as HTMLElement);
							continue;
						}
						for (const el of Array.from(node.querySelectorAll<HTMLElement>(FLAIR_SELECTOR))) {
							processSpan(this.view, el);
						}
					}
				}
			}

			/** 全量重扫视口内的 flair span（幂等：已正确的 span 原样跳过） */
			private scanAll() {
				for (const el of Array.from(this.view.dom.querySelectorAll<HTMLElement>(FLAIR_SELECTOR))) {
					processSpan(this.view, el);
				}
			}
		},
	);
}

/**
 * 就地处理一个 flair span（幂等）。
 *
 * - 开关关闭：只还原本插件补过的（移除文本 → 重画复制图标），原生的一律不动；
 * - token 为空：保持/还原为原生图标（无语言名 / 信息串含反引号的原生形态）；
 * - token === nativeToken：原生已完整显示的纯 ASCII 词元，不碰（英文名、
 *   含模式名映射的显示都保持原生）；
 * - token ≠ nativeToken：原生截断（中英混杂）或为空（纯中文），补全为 token。
 */
function processSpan(view: EditorView, flair: HTMLElement): void {
	const marked = flair.getAttribute(LABEL_ATTR);
	if (!codeBlockLangLabelConfig.enabled) {
		if (marked !== null) {
			restoreFlair(flair);
		}
		return;
	}
	if (!flair.isConnected) {
		return;
	}
	const lineText = resolveFenceLineText(view, flair);
	if (lineText === null) {
		return; // 行定位失败（离屏/视图重建中）：放行，等下次触发再补
	}
	const { token, nativeToken } = extractFenceLanguage(lineText);
	if (!token) {
		// 原生同样只给图标的输入：保持图标；之前补过的（信息串后来被改坏）还原
		if (marked !== null) {
			restoreFlair(flair);
		}
		return;
	}
	if (marked === null && token === nativeToken) {
		return; // 原生已完整显示：不碰（含 js → JavaScript 等模式名映射）
	}
	if (flair.textContent !== token) {
		flair.textContent = token;
	}
	flair.setAttribute(LABEL_ATTR, token);
}

/**
 * 定位 flair span 所在的围栏起始行文本。
 *
 * flair widget 挂在围栏起始行行末（原生 replace 装饰之后），其最近
 * .cm-line 祖先即该行；行首 posAtDOM 后 lineAt 取整行文本。提取正则
 * 要求行首必须是围栏标记，非围栏行取不到词元，天然兜底。
 *
 * @returns 整行文本；span 已脱离视图等定位失败时返回 null
 */
function resolveFenceLineText(view: EditorView, flair: HTMLElement): string | null {
	const lineEl = flair.closest('.cm-line');
	if (!lineEl || !view.dom.contains(lineEl)) {
		return null;
	}
	try {
		const pos = view.posAtDOM(lineEl, 0);
		return view.state.doc.lineAt(pos).text;
	} catch {
		return null; // 视图重建/坐标失效等：放弃本次，不扩散
	}
}

/**
 * 还原为原生图标形态：清掉补的文本与标记，用 Obsidian 公开 API 重画
 * lucide-copy（与原生 setIcon 同源，样式由 .code-block-flair 的 CSS 接管）。
 */
function restoreFlair(flair: HTMLElement): void {
	flair.removeAttribute(LABEL_ATTR);
	flair.textContent = '';
	setIcon(flair, COPY_ICON);
}

/**
 * 注册入口（保持模块自包含：扩展注册 + 初始开关值）。
 *
 * @param plugin    Plugin 实例（registerEditorExtension 保证卸载时自动清理）
 * @param isEnabled 设置读取器（初始值；此后由 syncConfig 写配置对象驱动）
 */
export function registerCodeBlockLangLabel(plugin: Plugin, isEnabled: () => boolean): void {
	codeBlockLangLabelConfig.enabled = isEnabled();
	plugin.registerEditorExtension(createCodeBlockLangLabelExtension());
}
