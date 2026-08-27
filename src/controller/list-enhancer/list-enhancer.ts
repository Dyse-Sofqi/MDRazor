/**
 * MDRazor — 列表增强组合入口（Controller）
 *
 * 将各子模块的 CM6 扩展组合为单个 Extension，由 controller/main.ts 加载。
 *
 * 子模块：
 *   - list-integration.ts  列一体化
 *   - enter-soft-break.ts  回车软换行
 *   - focus-options.ts     聚焦选项
 *   - fold-navigation.ts   上下键进入折叠块
 */

import { Prec } from '@codemirror/state';
import { createListIntegrationExtension } from './list-integration';
import { createEnterSoftBreakExtension } from './enter-soft-break';
import { createFocusOptionsExtension } from './focus-options';
import { createFoldNavigationExtension } from './fold-navigation';
import { listEnhancerConfig } from '../../model/shared';

// 保持对外接口一致：controller/main.ts 使用 `listEnhancerConfig`
export { listEnhancerConfig };

/**
 * 「光标所在列表行也可折叠」的 CSS 开关类。
 *
 * 挂在 document.body 上，styles.css 以 `body.` 前缀选择器启用覆盖规则：
 * 恢复 Obsidian 原生活跃行上被压缩为 0 尺寸的折叠指示器
 * （.cm-fold-indicator .collapse-indicator），使光标所在列表行仍可通过
 * 列表符号折叠/展开，悬停时折叠箭头正常显现。
 */
export const LIST_FOLD_ACTIVE_LINE_CLASS = 'mdrazor-fold-active-line';

/**
 * 根据设置同步 body 上的开关类。
 *
 * 在插件 onload / saveSettings 后调用（settings 已写入 listEnhancerConfig）。
 */
export function applyListFoldOnActiveLineClass(): void {
	// activeDocument 为 Obsidian 全局变量（obsidian.d.ts declare global），
	// 与浏览器 document 的区别：弹出窗（popout window）聚焦时指向弹出窗口的文档。
	activeDocument.body.classList.toggle(
		LIST_FOLD_ACTIVE_LINE_CLASS,
		!!listEnhancerConfig.listFoldOnActiveLine,
	);
}

/**
 * 插件卸载（用户禁用）时移除 body 开关类。
 * styles.css 由 Obsidian 自动移除，但该类是 JS 添加的，需手动清理。
 */
export function removeListFoldOnActiveLineClass(): void {
	activeDocument.body.classList.remove(LIST_FOLD_ACTIVE_LINE_CLASS);
}

/**
 * 创建列表增强的组合 CM6 扩展。
 *
 * 以 `Prec.high` 优先级确保按键处理器在 Obsidian 自己的处理器之前触发。
 */
export function createListEnhancerExtension() {
	return Prec.high([
		...createListIntegrationExtension(),
		...createEnterSoftBreakExtension(),
		...createFocusOptionsExtension(),
		...createFoldNavigationExtension(),
	]);
}
