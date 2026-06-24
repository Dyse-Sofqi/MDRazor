/**
 * MDRazor — 列表增强组合入口（Controller）
 *
 * 将各子模块的 CM6 扩展组合为单个 Extension，由 controller/main.ts 加载。
 *
 * 子模块：
 *   - list-integration.ts  列一体化
 *   - enter-soft-break.ts  回车软换行
 *   - focus-options.ts     聚焦选项
 */

import { Prec } from '@codemirror/state';
import { createListIntegrationExtension } from './list-integration';
import { createEnterSoftBreakExtension } from './enter-soft-break';
import { createFocusOptionsExtension } from './focus-options';
import { listEnhancerConfig } from '../model/shared';

// 保持对外接口一致：controller/main.ts 使用 `listEnhancerConfig`
export { listEnhancerConfig };

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
	]);
}
