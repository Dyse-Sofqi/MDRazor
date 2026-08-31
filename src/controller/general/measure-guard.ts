/**
 * MDRazor — 编辑器测量守护（Measure Guard）
 *
 * 问题根因：CM6 的行高度表（height map）只在「自身发起的测量」时刷新。
 * 若编辑器创建后，外部样式触发了行高/间距重排（CSS 片段重载、主题/插件
 * 样式注入、构造后晚到的 Web 字体换用），但编辑器容器尺寸不变，
 * CM6 的 ResizeObserver / fonts.ready / window.resize 都不会触发，
 * 高度表保持陈旧 —— 光标点击行的上半部分会落到上一行（点击偏移）。
 *
 * 守护机制：监听 <head> 的样式注入/变更（含 <style> 文本变更）与晚到的
 * 字体加载完成事件，防抖后对所有 Markdown 编辑器的 EditorView 调用
 * requestMeasure()，强制 CM6 重新测量行高、刷新高度表，根治点击偏移。
 *
 * CM6 已内置且无需重复防护（@codemirror/view dist/index.js 实证）：
 *   - document.fonts.ready → requestMeasure（构造时挂载，line 7617-7619）
 *   - window resize → requestMeasure（line 7184）
 *   - scrollDOM ResizeObserver（line 6854-6859，容器尺寸变化才触发）
 * 唯一盲区 = 样式注入/head 突变（容器尺寸不变，RO 不触发）。
 *
 * 说明：观察对象为主窗口 document.head（样式片段注入的位置）；
 * 弹出窗口（popout）在打开时会复制样式并各自完成测量，无需此守护。
 */

import { Plugin } from 'obsidian';
import { EditorView } from '@codemirror/view';

/** 最后一次监听事件后的防抖窗口（毫秒）：合并批量样式变更 */
const GUARD_DEBOUNCE_MS = 200;

let debounceTimer: number | undefined;
let headObserver: MutationObserver | null = null;

/**
 * 收集当前所有 Markdown 编辑器的 EditorView 并请求重新测量。
 * EditorView.findFromDOM 可从 .cm-editor 任意内部元素反查视图，
 * 无需持有任何引用、不侵入 CM6 扩展。
 */
function remeasureAllEditors(plugin: Plugin): void {
	const editorViews: EditorView[] = [];
	try {
		for (const leaf of plugin.app.workspace.getLeavesOfType('markdown')) {
			const cmEditor = leaf.view.containerEl?.querySelector<HTMLElement>('.cm-editor');
			if (!cmEditor) {
				continue;
			}
			const view = EditorView.findFromDOM(cmEditor);
			if (view) {
				editorViews.push(view);
			}
		}
	} catch {
		// 布局尚未就绪时 getLeavesOfType 可能抛错 —— 直接放弃本轮
		return;
	}
	for (const view of editorViews) {
		view.requestMeasure();
	}
}

/**
 * 注册测量守护（始终开启，无设置开关；空闲时零开销）。
 * 由插件生命周期调用方在 onload 时调用，卸载时自动清理。
 */
export function registerMeasureGuard(plugin: Plugin): void {
	const schedule = (): void => {
		if (debounceTimer !== undefined) {
			window.clearTimeout(debounceTimer);
		}
		debounceTimer = window.setTimeout(() => {
			debounceTimer = undefined;
			remeasureAllEditors(plugin);
		}, GUARD_DEBOUNCE_MS);
	};

	// 1) 样式注入/变更监听：CSS 片段重载、主题切换、插件样式注入、
	//    <style> 文本内容替换（characterData 覆盖）均在此类
	headObserver = new MutationObserver(schedule);
	headObserver.observe(activeDocument.head, {
		childList: true,
		subtree: true,
		characterData: true,
	});

	// 2) 晚到的 Web 字体加载完成（CM6 只在构造时挂 fonts.ready，
	//    构造后开始加载的字体换用时无感知）
	if (activeDocument.fonts?.addEventListener) {
		activeDocument.fonts.addEventListener('loadingdone', schedule);
	}

	plugin.register(() => {
		headObserver?.disconnect();
		headObserver = null;
		if (debounceTimer !== undefined) {
			window.clearTimeout(debounceTimer);
			debounceTimer = undefined;
		}
	});
}
