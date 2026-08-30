/**
 * MDRazor — 清理本地持久化数据确认弹窗
 *
 * MDRazor 的设置与位置记录已持久化到 .obsidian 配置目录
 * （md-razor-settings.json / md-razor-position-cache.json），
 * 卸载插件不会被 Obsidian 自动删除；本弹窗提供手动清除入口。
 *
 * 两个数据项的复选框默认均不勾选（默认保留），勾选并确认后：
 *   - 位置记录：清空内存缓存并写空文件（防止旧记录复活 / 下次加载回退迁移）；
 *   - 设置与命令：重置为默认设置并落盘，设置面板即时重渲染。
 * 数据文件本身保留（内容清零），避免依赖「删除文件」这一在该环境
 * 可能失败的操作，同时阻断旧位置文件复活已清理数据的路径。
 */

import { Modal, Notice, Setting } from 'obsidian';
import { tr } from '../i18n';
import { DEFAULT_SETTINGS } from '../model/settings';
import type MDRazorPlugin from '../controller/main';
import { resetPositionCache } from '../controller/tab-enhancer/position-persistence';

export class DataCleanupModal extends Modal {
	constructor(private plugin: MDRazorPlugin) {
		super(plugin.app);
	}

	onOpen(): void {
		this.titleEl.setText(tr('清理 MDRazor 本地数据', 'Clear MDRazor Local Data'));

		const { contentEl } = this;
		const configDir = this.plugin.app.vault.configDir;
		contentEl.createEl('p', {
			cls: 'setting-item-description',
			text: tr(
				`MDRazor 的设置与位置记录保存在 ${configDir} 目录下，卸载插件时不会被自动删除，重装后可继续沿用。若确定不再需要，可在此清除（默认不勾选 = 保留）。`,
				`MDRazor settings and position records are stored in the ${configDir} folder and survive plugin uninstall/reinstall. Clear them here if you no longer need them (unchecked by default = keep).`,
			),
		});

		let clearPositions = false;
		let clearSettings = false;

		new Setting(contentEl)
			.setName(tr('位置记录', 'Position Records'))
			.setDesc(`${configDir}/md-razor-position-cache.json`)
			.addToggle((toggle) =>
				toggle.setValue(false).onChange((value) => {
					clearPositions = value;
					updateButtons();
				}),
			);

		new Setting(contentEl)
			.setName(tr('设置与命令', 'Settings & Commands'))
			.setDesc(`${configDir}/md-razor-settings.json`)
			.addToggle((toggle) =>
				toggle.setValue(false).onChange((value) => {
					clearSettings = value;
					updateButtons();
				}),
			);

		const buttonsEl = contentEl.createDiv({ cls: 'modal-button-container' });
		const cancelBtn = buttonsEl.createEl('button', {
			cls: 'mod-cta',
			text: tr('取消', 'Cancel'),
		});
		const confirmBtn = buttonsEl.createEl('button', {
			cls: 'mod-warning',
			text: tr('清理选中项', 'Clear Selected'),
		});

		const updateButtons = (): void => {
			confirmBtn.setAttribute('disabled', clearPositions || clearSettings ? '' : 'true');
		};
		updateButtons();

		cancelBtn.addEventListener('click', () => this.close());
		confirmBtn.addEventListener('click', () => {
			void this.confirm(clearPositions, clearSettings);
		});
	}

	private async confirm(clearPositions: boolean, clearSettings: boolean): Promise<void> {
		const cleared: string[] = [];
		if (clearPositions) {
			// 未打开文档的恢复记录不再生效；已打开文档保持现状
			resetPositionCache();
			cleared.push(tr('位置记录', 'Position records'));
		}
		if (clearSettings) {
			// 重置为默认设置并落盘：覆盖新位置文件，防止下次加载从旧 data.json 回迁；
			// forceMirror 同步覆盖镜像，防止旧设置从镜像补洞复活。
			this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS);
			await this.plugin.saveSettings({ forceMirror: true });
			this.plugin.ribbonManager?.refresh();
			this.plugin.settingTab?.display();
			cleared.push(tr('设置与命令', 'Settings & commands'));
		}
		this.close();
		if (cleared.length > 0) {
			new Notice(
				tr(
					`已清除：${cleared.join('、')}`,
					`Cleared: ${cleared.join(', ')}`,
				),
			);
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
