/**
 * MDRazor — 通用：首行缩进的启闭命令与编辑器右键菜单项
 *
 * 与 first-line-indent.ts 分工：那边负责「怎么缩进」（CM6 行装饰 + 阅读视图
 * DOM 后处理），这里只负责「怎么开关」—— 把设置开关暴露成命令面板命令与
 * 编辑器右键菜单项，两处共用同一条切换逻辑（都直接翻转 `settings` 并走
 * saveSettings 的传播链，与设置面板开关双向同步）。
 *
 * 命令用 `callback` 而非 `checkCallback`：开关是**全局设置**，实时预览与
 * 阅读视图都要生效，而阅读视图里没有 MarkdownView；若要求「当前有 Markdown
 * 编辑器」才可用，用户在阅读视图下会发现命令从命令面板里消失。
 *
 * 菜单项标题固定、不随开关状态改写为「开启…」/「关闭…」：标题是右键菜单
 * 设置面板「隐藏命令」列表的记录键（`context:<图标>:<标题>`），动态标题会让
 * 同一个菜单项按状态记成两条记录，隐藏状态也就跟着分裂。
 */

import { Plugin } from 'obsidian';
import { tr } from '../../i18n';
import type { MDRazorSettings } from '../../model/settings';

/** 命令 id（自定义命令 / 快捷键绑定依赖它，发布后不要改名） */
export const FIRST_LINE_INDENT_COMMAND_ID = 'mdrazor-toggle-first-line-indent';

/** 命令与右键菜单项共用的图标（indent-increase：Obsidian 内置 lucide 图标） */
const FIRST_LINE_INDENT_ICON = 'indent-increase';

/** 命令与右键菜单项共用的标题（每次取用即时探测语言，切换 Obsidian 语言后无需重载） */
function toggleTitle(): string {
	return tr('开启/关闭首行缩进', 'Toggle First-Line Indent');
}

/**
 * 注册「开启/关闭首行缩进」命令 + 编辑器右键菜单项。
 *
 * @param plugin               Plugin 实例（取 app.workspace 订阅 editor-menu）
 * @param settings             设置对象引用（直接翻转，与设置面板同一份数据）
 * @param save                 持久化并触发同步的回调（saveSettings + 同步设置面板）
 * @param isContextMenuEnabled 右键菜单项开关读取器（弹出菜单时实时读取，切换无需重载）
 */
export function registerFirstLineIndentToggle(
	plugin: Plugin,
	settings: MDRazorSettings,
	save: () => Promise<void>,
	isContextMenuEnabled: () => boolean,
): void {
	const toggle = async (): Promise<void> => {
		settings.firstLineIndentEnabled = !settings.firstLineIndentEnabled;
		await save();
	};

	// 命令随插件注册，不受右键菜单开关影响：关闭菜单项后仍可从命令面板或快捷键触发
	plugin.addCommand({
		id: FIRST_LINE_INDENT_COMMAND_ID,
		name: toggleTitle(),
		icon: FIRST_LINE_INDENT_ICON,
		callback: toggle,
	});

	plugin.registerEvent(
		plugin.app.workspace.on('editor-menu', (menu) => {
			if (!isContextMenuEnabled()) return;
			menu.addItem((item) =>
				item
					.setTitle(toggleTitle())
					.setIcon(FIRST_LINE_INDENT_ICON)
					// toggle 是 async，事件回调里显式丢弃 Promise，避免 no-misused-promises
					.onClick(() => void toggle()),
			);
		}),
	);
}
