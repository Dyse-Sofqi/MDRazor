/**
 * MDRazor — 界面语言适配（i18n）
 *
 * 依据 Obsidian 的界面语言（设置 → 通用 → 语言）为渲染/注册时刻的文案
 * 选择中文或英文：语言为中文（zh-*）时显示中文界面，其余语言显示英文界面。
 * 每次调用都即时探测、不缓存，切换 Obsidian 语言后无需重启插件即可生效。
 */

import { getLanguage, requireApiVersion } from 'obsidian';

/** 插件支持的界面语言类型 */
export type MDRazorLocale = 'zh' | 'en';

/**
 * 探测当前 Obsidian 界面语言。
 *
 * getLanguage() 自 Obsidian 1.8.7 才提供，用 requireApiVersion 守卫：
 * 低版本回退到浏览器语言（minAppVersion 仍为 1.0.0，保证兼容）。
 */
export function detectLocale(): MDRazorLocale {
	let lang = '';
	if (requireApiVersion('1.8.7')) {
		lang = getLanguage().toLowerCase();
	}
	if (!lang) lang = (navigator.language ?? 'en').toLowerCase();
	return lang.startsWith('zh') ? 'zh' : 'en';
}

/**
 * 中英双语文案选择器：中文界面取中文，非中文界面取英文。
 *
 * @param zh 中文文案
 * @param en 英文文案
 * @returns 当前界面语言对应的文案
 */
export function tr(zh: string, en: string): string {
	return detectLocale() === 'zh' ? zh : en;
}
