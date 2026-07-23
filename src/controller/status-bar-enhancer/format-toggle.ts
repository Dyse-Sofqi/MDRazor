/**
 * MDRazor — 格式隐藏启闭按钮
 *
 * 在状态栏添加按钮，一键切换所有格式隐藏样式（加粗、斜体、高亮、删除线、
 * 行内代码、转义符号、标题符号、双链符号）的启闭状态。
 * 不控制空格可视化（showWhitespace）。
 */

import { Plugin, setIcon } from 'obsidian';
import type { MDRazorSettings } from '../../model/settings';

/**
 * 受此按钮控制的格式隐藏设置键列表。
 * 不包括 showWhitespace（空格可视化）。
 */
const FORMATTING_KEYS: Array<keyof MDRazorSettings> = [
	'hideBoldFormatting',
	'hideItalicFormatting',
	'hideHighlightFormatting',
	'hideStrikethroughFormatting',
	'hideCodeFormatting',
	'hideEscapeFormatting',
	'hideHeadingFormatting',
	'hideWikiLinkFormatting',
	'hideHtmlColorTagFormatting',
];

/** 检查当前是否任一格式隐藏开关已开启 */
function isAnyActive(settings: MDRazorSettings): boolean {
	return FORMATTING_KEYS.some((key) => settings[key]);
}

/** 将所有格式隐藏开关设为同一值 */
function setAll(settings: MDRazorSettings, active: boolean): void {
	for (const key of FORMATTING_KEYS) {
		(settings as unknown as Record<string, boolean>)[key] = active;
	}
}

/**
 * 注册格式隐藏启闭功能。
 *
 * @param plugin    Obsidian Plugin 实例
 * @param settings  设置对象引用（直接写入）
 * @param save      持久化设置并触发同步的回调
 */
export function registerFormatToggle(
	plugin: Plugin,
	settings: MDRazorSettings,
	save: () => Promise<void>,
): { addButton: () => void; removeButton: () => void } {
	let statusBarEl: HTMLElement | null = null;
	let iconEl: HTMLElement | null = null;

	const updateIcon = (): void => {
		if (!iconEl) return;
		setIcon(iconEl, isAnyActive(settings) ? 'square-dashed-mouse-pointer' : 'square-mouse-pointer');
	};

	const toggle = async (): Promise<void> => {
		setAll(settings, !isAnyActive(settings));
		updateIcon();
		await save();
	};

	const addButton = (): void => {
		if (statusBarEl) return;

		statusBarEl = plugin.addStatusBarItem();
		statusBarEl.addClass('mdrazor-statusbar-format-toggle');

		// 移到状态栏最左端
		const statusBarContainer = statusBarEl.parentElement;
		if (statusBarContainer && statusBarContainer.firstChild) {
			statusBarContainer.insertBefore(statusBarEl, statusBarContainer.firstChild);
		}

		iconEl = statusBarEl.createSpan();
		updateIcon();
		statusBarEl.createSpan({ text: '标识' });

		statusBarEl.addEventListener('click', toggle);
	};

	const removeButton = (): void => {
		if (statusBarEl) {
			statusBarEl.remove();
			statusBarEl = null;
			iconEl = null;
		}
	};

	// 注册命令面板命令（常驻，不受设置开关影响）
	plugin.addCommand({
		id: 'mdrazor-toggle-formatting',
		name: '切换格式隐藏：开启/关闭所有格式隐藏样式',
		icon: 'square-dashed-mouse-pointer',
		callback: toggle,
	});

	return { addButton, removeButton };
}
