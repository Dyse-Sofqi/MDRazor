/**
 * MDRazor — 更新日志弹窗（View）
 *
 * 插件更新到新版本后首次启动时弹出，展示本次更新的 CHANGELOG 最新版本条目。
 *
 * 更新日志文本在构建时随 main.js 打包（esbuild text loader）：
 * Obsidian 社区市场安装仅分发 main.js/manifest.json/styles.css，
 * 插件目录中并不存在 CHANGELOG.md 文件，因此不能读取 vault 文件，
 * 必须读取打包进 main.js 的文本副本（与仓库内 CHANGELOG.md 保持同步）。
 */

import { Component, MarkdownRenderer, Modal, Setting } from 'obsidian';
import changelogText from '../../CHANGELOG.md';

/**
 * 提取 CHANGELOG 中最新一个版本条目：首个 `**x.y.z**` 标题至第二个标题之间。
 * 解析失败（全文无版本标题）时回退返回全文。
 */
function extractLatestSection(text: string): string {
	const headerRe = /^\*\*\d+\.\d+\.\d+\*\*/;
	const lines = text.split('\n');
	let firstHeader = -1;
	let secondHeader = -1;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line !== undefined && headerRe.test(line)) {
			if (firstHeader === -1) {
				firstHeader = i;
			} else {
				secondHeader = i;
				break;
			}
		}
	}
	if (firstHeader === -1) return text;
	return secondHeader === -1
		? lines.slice(firstHeader).join('\n')
		: lines.slice(firstHeader, secondHeader).join('\n');
}

export class ChangelogModal extends Modal {
	/** Markdown 渲染产生的监听器归属组件，弹窗关闭时卸载清理 */
	private renderComponent: Component | null = null;

	onOpen() {
		this.titleEl.setText('📜 更新日志');
		this.modalEl.addClass('mdrazor-changelog-modal');

		const body = this.contentEl.createDiv({ cls: 'mdrazor-changelog-body' });
		// 用 MarkdownRenderer 渲染正式 Markdown（标题/加粗/列表/行内代码），
		// 而不是把原文当纯文本展示；`[[path]]` 等位于行内代码中不会被解析成链接。
		// 新版 typings 中 Modal 不再继承 Component，需自建组件承接渲染监听器。
		this.renderComponent = new Component();
		void MarkdownRenderer.render(
			this.app,
			extractLatestSection(changelogText),
			body,
			'',
			this.renderComponent,
		);

		new Setting(this.contentEl).addButton((btn) =>
			btn.setButtonText('关闭').setCta().onClick(() => this.close()),
		);
	}

	onClose() {
		this.renderComponent?.unload();
		this.renderComponent = null;
		this.contentEl.empty();
	}
}
