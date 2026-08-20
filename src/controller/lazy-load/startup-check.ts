/**
 * MDRazor — 加载耗时记录 + 「立即检查」弹窗（复用 Obsidian 原生按钮交互）
 *
 * 背景（逆向自本机 obsidian.asar / app.js，webpack module 9941）：
 *   Obsidian「设置 → 关于 → 高级」里，在「应用启动缓慢时进行通知」开关前有一个
 *   「立即检查」按钮 —— 它是该设置行的 addExtraButton：图标 lucide-timer、
 *   tooltip「立即检查」，点击后打开名为 "Startup time" 的启动性能弹窗。
 *   原生弹窗与它的计时数据（闭包内的 aD 计时树 sD/lD/cD、P7 弹窗类）均不对外暴露，
 *   社区插件无法直接调起原生弹窗或读取其计时。
 *
 * 因此这里「复用」其交互形态而非其内部实现：
 *   - 按钮外观与位置与原生完全一致（lucide-timer + 「立即检查」tooltip，
 *     挂在「启用懒加载」开关行、开关之前）；
 *   - 点击由本模块打开一个信息弹窗：环境 + 每个社区插件一行，
 *     行内值 = 加载耗时 · 延迟 · 当前状态（耗时前置在延迟数值前，不再单列）。
 *
 * 加载耗时测量（StartupTimingRecorder）：
 *   Obsidian 内部 loadPlugin 先 `plugins[id]=n`（new 出插件类即赋值，此时只是
 *   eval 打包代码 + 构造类），随后才 `await n.load()`（执行 onload 重活）——
 *   所以轮询 plugins[id] 只能量到「bundle 解析 + 实例化」的同质化开销。
 *   真实加载窗口用 `app.plugins.loadingPluginId`：它在整个 enablePlugin → loadPlugin
 *   （含 onload）期间保持为该插件 id，完成后置 null。记录器轮询该字段，
 *   捕捉「id 出现 → 消失」即该插件真实加载耗时（插件间天然不同）。
 *   只统计「已启用且延迟启动」的懒加载插件（由懒加载控制器触发时记录）。
 *   所有 interval 均经 plugin.registerInterval 注册，插件卸载自动清理。
 */

import { App, ButtonComponent, Modal, Notice, Setting } from 'obsidian';
import type { Plugin, PluginManifest } from 'obsidian';
import type MDRazorPlugin from '../main';
import { SELF_PLUGIN_ID } from './lazy-load';

/** obsidian.d.ts 未公开的 app.plugins 内部接口（运行时存在，仅取只读字段）。
 *  loadingPluginId 内部分配：enablePlugin 期间 = 正在加载的插件 id，完成后置 null */
interface PluginManagerView {
	plugins: Record<string, Plugin>;
	manifests: Record<string, PluginManifest>;
	loadingPluginId?: string | null;
}

/** 社区插件判断：核心插件 manifest 不含 version，社区插件必含 */
const isCommunityManifest = (m: PluginManifest): boolean =>
	typeof (m as PluginManifest & { version?: string }).version === 'string';

/** 安全的 own-property 检查（规避 no-prototype-builtins） */
const hasOwn = (obj: object, key: string): boolean =>
	Object.prototype.hasOwnProperty.call(obj, key);

/** 单次加载测量的超时上限（毫秒）：超过仍未完成则放弃 */
const LOAD_WATCH_TIMEOUT = 60000;

/** 一次进行中的加载测量 */
interface LoadWatch {
	id: string;
	/** 我们触发 enable 的时刻（兜底基准：快速加载可能错过 loadingPluginId 窗口） */
	baseStart: number;
	/** 观察到 loadingPluginId === id 的精确保准时刻（即 onload 真正开始的时刻） */
	loadingStart?: number;
	/** 是否已捕捉到「正在加载」窗口 */
	loading: boolean;
	interval: number;
}

/**
 * 加载耗时记录器。
 *
 * 只统计「已启用且延迟启动」的懒加载插件：懒加载控制器每次触发其加载（enablePlugin）
 * 前调用 trackLoad()，随后 20ms 轮询 app.plugins.loadingPluginId ——
 * 该字段在整个加载过程（含 onload）保持为插件 id，置回 null 即结算真实加载耗时。
 * 若加载极快错过窗口，则退化为按「触发时刻 → 实例出现」的近似值。
 */
export class StartupTimingRecorder {
	/** 已完成的测量：pluginId → 加载耗时（毫秒） */
	private readonly completed = new Map<string, number>();
	/** 进行中的测量：pluginId → watch */
	private readonly watches = new Map<string, LoadWatch>();

	constructor(
		private readonly plugin: MDRazorPlugin,
		private readonly api: () => PluginManagerView,
	) {}

	/**
	 * 开始测量某插件的加载耗时（应在本插件触发 enablePlugin 之前调用）。
	 * 幂等：已有完成或进行中的测量时忽略。
	 */
	trackLoad(pluginId: string): void {
		if (this.watches.has(pluginId) || this.completed.has(pluginId)) return;
		if (hasOwn(this.api().plugins, pluginId)) return;

		const watch: LoadWatch = {
			id: pluginId,
			baseStart: performance.now(),
			loading: false,
			interval: 0,
		};
		const interval = window.setInterval(() => this.pollLoad(watch), 20);
		watch.interval = interval;
		this.watches.set(pluginId, watch);
		this.plugin.registerInterval(interval);
	}

	/** 某插件当前是否处于「正在加载」（含 onload 执行中） */
	isLoading(pluginId: string): boolean {
		return this.watches.get(pluginId)?.loading === true;
	}

	/**
	 * 某插件的加载耗时（毫秒）。
	 * - 已完成测量 → 该值；
	 * - 仍在加载中 → 已流逝时间（界面显示「加载中」）；
	 * - 从未测量 → undefined。
	 */
	getDuration(pluginId: string): number | undefined {
		const completed = this.completed.get(pluginId);
		if (completed !== undefined) return completed;
		const watch = this.watches.get(pluginId);
		if (watch?.loading && watch.loadingStart !== undefined) {
			return Math.round(performance.now() - watch.loadingStart);
		}
		return undefined;
	}

	private pollLoad(watch: LoadWatch): void {
		const pm = this.api();
		const loadingNow = pm.loadingPluginId ?? null;
		const now = performance.now();

		// 捕捉加载窗口开始：loadingPluginId 首次等于该插件 id
		if (!watch.loading && loadingNow === watch.id) {
			watch.loading = true;
			watch.loadingStart = now;
		}

		// 窗口结束：loadingPluginId 从该 id 变走 → 精确结算（含 onload）
		if (watch.loading && loadingNow !== watch.id) {
			this.finish(watch, now - (watch.loadingStart as number));
			return;
		}

		// 未捕捉到窗口（加载极快）但实例已出现 → 用「触发时刻 → 实例出现」近似
		if (!watch.loading && hasOwn(pm.plugins, watch.id)) {
			this.finish(watch, now - watch.baseStart);
			return;
		}

		// 超时兜底
		if (now - watch.baseStart > LOAD_WATCH_TIMEOUT) {
			this.finish(watch, 0);
		}
	}

	private finish(watch: LoadWatch, durationMs: number): void {
		window.clearInterval(watch.interval);
		if (this.watches.get(watch.id)?.interval === watch.interval) {
			this.watches.delete(watch.id);
		}
		this.completed.set(watch.id, Math.max(0, Math.round(durationMs)));
	}
}

/**
 * 创建加载耗时记录器（供主控制器 onload 调用）。
 */
export function createStartupTimingRecorder(plugin: MDRazorPlugin): StartupTimingRecorder {
	const api = (): PluginManagerView =>
		(plugin.app as unknown as { plugins: PluginManagerView }).plugins;
	return new StartupTimingRecorder(plugin, api);
}

/**
 * 「立即检查」弹窗：仿 Obsidian 原生 "Startup time" 弹窗，
 * 环境 + 每社区插件一行（加载耗时前置 · 延迟 · 当前状态），底部「复制」+「完成」。
 */
export class StartupCheckModal extends Modal {
	constructor(
		app: App,
		private readonly plugin: MDRazorPlugin,
		private readonly recorder: StartupTimingRecorder,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle('启动耗时检查');

		this.buildEnvironmentSection(contentEl);
		this.buildPluginStatusSection(contentEl);

		const footer = this.modalEl.createDiv({ cls: 'modal-button-container' });
		new ButtonComponent(footer)
			.setClass('mod-secondary')
			.setButtonText('复制')
			.onClick(() => this.copyToClipboard());
		new ButtonComponent(footer)
			.setButtonText('完成')
			.onClick(() => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/* ------------------------------------------------------------- */

	private pluginsAPI(): PluginManagerView {
		return (this.app as unknown as { plugins: PluginManagerView }).plugins;
	}

	private addValueRow(parent: HTMLElement, name: string, value: string, desc?: string): void {
		const row = parent.createDiv({ cls: 'setting-item' });
		const info = row.createDiv({ cls: 'setting-item-info' });
		info.createDiv({ cls: 'setting-item-name', text: name });
		if (desc) info.createDiv({ cls: 'setting-item-desc', text: desc });
		row.createDiv({ cls: 'setting-item-control', text: value });
	}

	/** 当前已在运行会话中的社区插件（含核心之外的、且非自身），按名称排序 */
	private communityPlugins(): Array<{ id: string; manifest: PluginManifest }> {
		const pm = this.pluginsAPI();
		return Object.entries(pm.manifests)
			.filter(([id, m]) => id !== SELF_PLUGIN_ID && m != null && isCommunityManifest(m))
			.map(([id, manifest]) => ({ id, manifest }))
			.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name, undefined, { sensitivity: 'base' }));
	}

	/** 仅「已启用且延迟启动」（懒加载配置生效）的社区插件 */
	private managedPlugins(): Array<{ id: string; manifest: PluginManifest }> {
		return this.communityPlugins().filter(({ id }) => {
			const cfg = this.plugin.settings.lazyLoadPlugins[id];
			return cfg != null && cfg.enabled && cfg.delay > 0;
		});
	}

	private buildEnvironmentSection(parent: HTMLElement): void {
		new Setting(parent).setHeading().setName('环境');
		const pm = this.pluginsAPI();
		const loadedCount = Object.keys(pm.plugins).filter((id) => {
			const manifest = pm.manifests[id];
			return manifest != null && isCommunityManifest(manifest);
		}).length;
		this.addValueRow(parent, '仓库文件数', String(this.app.vault.getFiles().length));
		this.addValueRow(parent, '已加载社区插件数', String(loadedCount));
	}

	/**
	 * 插件状态列表（合并加载耗时 + 懒加载状态，单列显示）：
	 * 仅统计「已启用且延迟启动」的懒加载插件；
	 * 每行 = 插件名；行内值 = 加载耗时 · 延迟 · 当前状态。
	 */
	private buildPluginStatusSection(parent: HTMLElement): void {
		new Setting(parent).setHeading().setName('插件状态');
		new Setting(parent)
			.setName('仅统计已启用且延迟启动的懒加载插件')
			.setDesc('加载耗时为触发加载实测值；随 Obsidian 自然加载的插件未计时。');

		if (!this.plugin.settings.lazyLoadEnabled) {
			new Setting(parent)
				.setName('总开关已关闭')
				.setDesc('当前为自然加载；下方为已保存的逐插件配置（暂不生效）。');
		}

		const rows = this.managedPlugins();
		if (rows.length === 0) {
			new Setting(parent).setName('无已启用且延迟启动的插件');
			return;
		}

		for (const { id, manifest } of rows) {
			const cfg = this.plugin.settings.lazyLoadPlugins[id];
			const delay = cfg?.delay ?? 0;
			const pending = this.plugin.lazyLoadManager.isPending(id);

			const duration = this.recorder.getDuration(id);
			const loading = this.recorder.isLoading(id);
			let timingText: string;
			if (loading && duration !== undefined) {
				timingText = `启动耗时 ${duration}ms（加载中）`;
			} else if (duration !== undefined) {
				timingText = `启动耗时 ${duration}ms`;
			} else if (pending) {
				timingText = '启动耗时 未开始';
			} else {
				timingText = '启动耗时 未测量';
			}

			// 状态格式：延迟 x s，启动耗时 x ms
			this.addValueRow(parent, manifest.name, `延迟 ${delay / 1000}s，${timingText}`);
		}
	}

	/** 组装可复制的纯文本摘要（对齐「复制」按钮） */
	private buildCopyText(): string {
		const lines: string[] = ['Obsidian 启动耗时检查'];
		lines.push(`- 仓库文件数: ${this.app.vault.getFiles().length}`);
		lines.push('');
		lines.push('插件状态（延迟 x s，启动耗时 x ms）:');
		if (this.plugin.settings.lazyLoadEnabled) {
			lines.push('  总开关: 开启');
		} else {
			lines.push('  总开关: 关闭（自然加载）');
		}
		const managedRows = this.managedPlugins();
		if (managedRows.length === 0) {
			lines.push('  (无)');
		}
		for (const { id, manifest } of managedRows) {
			const cfg = this.plugin.settings.lazyLoadPlugins[id];
			const delay = cfg?.delay ?? 0;
			const pending = this.plugin.lazyLoadManager.isPending(id);

			const duration = this.recorder.getDuration(id);
			const loading = this.recorder.isLoading(id);
			let timingText: string;
			if (loading && duration !== undefined) {
				timingText = `启动耗时 ${duration}ms（加载中）`;
			} else if (duration !== undefined) {
				timingText = `启动耗时 ${duration}ms`;
			} else if (pending) {
				timingText = '启动耗时 未开始';
			} else {
				timingText = '启动耗时 未测量';
			}
			lines.push(`  - ${manifest.name}: 延迟 ${delay / 1000}s，${timingText}`);
		}
		return lines.join('\n');
	}

	private copyToClipboard(): void {
		const text = this.buildCopyText();
		try {
			void navigator.clipboard?.writeText(text);
			new Notice('已复制到剪贴板');
		} catch (e) {
			console.error('复制启动耗时检查失败', e);
			new Notice('复制失败');
		}
	}
}
