import { Plugin } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	MDRazorSettings,
	MDRazorSettingTab,
} from './settings';
import { formattingConfig, createFormatHiderExtension } from './format-hider';
import { listEnhancerConfig, createListEnhancerExtension } from './list-enhancer';

export default class MDRazorPlugin extends Plugin {
	settings!: MDRazorSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new MDRazorSettingTab(this.app, this));
		this.registerEditorExtension(createFormatHiderExtension());
		this.registerEditorExtension(createListEnhancerExtension());
	}

	onunload() { }

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<MDRazorSettings>,
		);
		this.syncConfig();
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.syncConfig();
	}

	private syncConfig() {
		Object.assign(formattingConfig, this.settings);
		Object.assign(listEnhancerConfig, this.settings);
	}
}
