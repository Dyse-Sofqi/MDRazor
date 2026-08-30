/**
 * MDRazor — 通用：当前行高亮（Controller）
 *
 * 需求：高亮编辑光标所在的行（CM6 自动给光标行挂 .cm-active，随光标
 * 移动自动更新），与鼠标位置无关；不启用 Custom.css 的
 * activeline-highlight（snippet）也能独立生效。默认关闭——避免与
 * Custom.css 同款效果两边叠加。
 *
 * 实现：纯 CSS body 开关类，无需事件监听与空闲计时器——「高亮哪一行」
 * 由 CodeMirror 的 .cm-active 类维护，插件只负责「是否开启」：
 *   - onload / 设置同步（syncConfig）时在 body 上挂/摘
 *     `mdrazor-current-line-highlight` 常驻类；
 *   - styles.css 以 `body.mdrazor-current-line-highlight` 为前缀限定规则
 *     （镜像 Custom.css 99-107 行，三个选择器含 CM6 主路径与 CM5 变体）；
 *   - 卸载时摘除 JS 添加的类。
 * 与「鼠标移动时行高亮」的区别：后者是活动瞬时效果（活动中挂、静止
 * 300ms 后消失），当前行高亮是跟随光标的常驻效果，只随设置开关变化。
 */

import { Plugin } from 'obsidian';

/* eslint-disable obsidianmd/prefer-active-doc -- 刻意使用 document（主窗口文档）：
 * 开关类必须挂在主窗口 body 上，styles.css 的规则只在主编辑器生效；
 * activeDocument 在悬浮/弹出窗口（hover-editor、popout 视图）聚焦时会指向
 * 浮动窗口的文档，类会挂错 body（已在本插件的「当前行高亮开关不即时」调修中
 * 被用户探针证实）。document 在插件渲染进程中恒为主窗口文档。 */

/** body 上的「当前行高亮」开关类：随设置常驻（styles.css 以此限定高亮规则生效） */
export const CURRENT_LINE_HIGHLIGHT_CLASS = 'mdrazor-current-line-highlight';

/** 设置读取器（registerCurrentLineHighlight 传入；null = 尚未注册） */
let isEnabledRef: (() => boolean) | null = null;

/**
 * 注册当前行高亮（onload 调用）：设置开启时立即挂类。
 * 无 DOM 事件监听——.cm-active 光标行状态由 CodeMirror 维护，
 * CSS 规则随 body 类常驻即时生效。
 *
 * @param _plugin   Plugin 实例（签名与兄弟模块一致；此类驱动无监听需清理）
 * @param isEnabled 设置读取器：设置切换无需重注册
 */
export function registerCurrentLineHighlight(_plugin: Plugin, isEnabled: () => boolean): void {
	isEnabledRef = isEnabled;
	if (isEnabled()) document.body.classList.add(CURRENT_LINE_HIGHLIGHT_CLASS);
	else document.body.classList.remove(CURRENT_LINE_HIGHLIGHT_CLASS);
}

/**
 * 设置变化后同步状态（saveSettings → syncConfig 调用）：
 * 开启挂类、关闭摘类。纯 classList 切换，即时生效，无需重绘编辑器。
 */
export function applyCurrentLineHighlightClass(): void {
	if (isEnabledRef?.()) document.body.classList.add(CURRENT_LINE_HIGHLIGHT_CLASS);
	else document.body.classList.remove(CURRENT_LINE_HIGHLIGHT_CLASS);
}

/** 插件卸载时清理（body 类由 JS 添加，需手动摘除） */
export function removeCurrentLineHighlightClass(): void {
	document.body.classList.remove(CURRENT_LINE_HIGHLIGHT_CLASS);
}
