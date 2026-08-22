/**
 * MDRazor — 更新日志弹窗（View）
 *
 * 插件更新到新版本后首次启动时弹出，展示本次更新的 CHANGELOG 最新版本条目。
 *
 * 取数策略（双源，天然防滞后）：
 * 1. 优先读取插件目录内的实时 CHANGELOG.md（`manifest.dir` + '/CHANGELOG.md'）——
 *    本地开发 / BRAT 安装的插件目录存在该文件，改完 CHANGELOG 重载即生效，无需重新构建。
 * 2. 读取不到（如 Obsidian 社区市场安装仅分发 main.js/manifest.json/styles.css，
 *    插件目录中不存在 CHANGELOG.md）时，回退到构建时经 esbuild text loader
 *    打包进 main.js 的文本副本（`import changelogText`）。
 *
 * ⚠️ 维护提示：内嵌副本与仓库 CHANGELOG.md 的同步依赖「改完后重新 build main.js」。
 * 若发布了未重新构建的 main.js（内嵌副本滞后于仓库），社区市场用户弹窗会显示旧版本内容。
 * 发布前务必确认 main.js 是在本次 CHANGELOG 改动之后构建的。
 */

import { App, Component, MarkdownRenderer, Modal, Plugin, Setting } from 'obsidian';
import { tr } from '../i18n';

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

	constructor(
		app: App,
		private readonly plugin: Plugin,
	) {
		super(app);
	}

	onOpen() {
		this.titleEl.setText(tr('📜 更新日志', '📜 Changelog'));
		this.modalEl.addClass('mdrazor-changelog-modal');

		const body = this.contentEl.createDiv({ cls: 'mdrazor-changelog-body' });
		// 用 MarkdownRenderer 渲染正式 Markdown（标题/加粗/列表/行内代码），
		// 而不是把原文当纯文本展示；`[[path]]` 等位于行内代码中不会被解析成链接。
		// 新版 typings 中 Modal 不再继承 Component，需自建组件承接渲染监听器。
		this.renderComponent = new Component();

		// 异步解析「实时文件 → 内嵌副本」兜底，解析完成后渲染。
		// 即便文件读取较慢，弹窗骨架已先展示，Markdown 内容就绪后再填充。
		void this.resolveChangelogText().then((source) => {
			if (this.renderComponent === null) return; // 弹窗已关闭
			void MarkdownRenderer.render(
				this.app,
				extractLatestSection(source),
				body,
				'',
				this.renderComponent,
			);
		});

		new Setting(this.contentEl).addButton((btn) =>
			btn.setButtonText(tr('关闭', 'Close')).setCta().onClick(() => this.close()),
		);
	}

	/**
	 * 优先读取插件目录内的实时 CHANGELOG.md；读取失败或不存在时回退到
	 * 构建时打包进 main.js 的内嵌副本。
	 */
	private async resolveChangelogText(): Promise<string> {
		const dir = this.plugin.manifest.dir;
		const path = dir ? `${dir}/CHANGELOG.md` : '';
		if (path) {
			try {
				const adapter = this.app.vault.adapter;
				if (await adapter.exists(path)) {
					return await adapter.read(path);
				}
			} catch (e) {
				console.error('MDRazor: 读取插件目录 CHANGELOG.md 失败，回退到内嵌副本', e);
			}
		}
		return changelogText;
	}

	onClose() {
		this.renderComponent?.unload();
		this.renderComponent = null;
		this.contentEl.empty();
	}
}
