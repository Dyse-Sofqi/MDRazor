/**
 * MDRazor — 懒加载（移植自 Plugin Manager / plugin-manager）
 *
 * 为每个社区插件维护懒加载配置 { delay, enabled }：
 *   - delay > 0 且 enabled 的插件在启动时不随 Obsidian 立即加载，
 *     而是由本模块在设定 delay（毫秒）后用 app.plugins.enablePlugin() 补加载 ——
 *     插件之间的相对 delay 即构成它们的启动先后顺序。
 *   - 被懒加载的插件持久化状态保持「禁用」（disablePluginAndSave），
 *     使 Obsidian 下次启动不会自动加载；会话内用 enablePlugin 保持运行。
 *   - 总开关关闭或本插件被卸载时，restore() 把全部懒加载插件恢复为
 *     持久化「启用」（enablePluginAndSave），下次启动自然加载，避免锁死用户。
 *
 * 相对原版 Plugin Manager 的优化：
 *   - 用显式方法（setEnabled / setDelay）替代 Proxy set 拦截，行为可控；
 *   - 仅管理社区插件（按 manifest 是否带 version 判断），不碰核心插件；
 *   - 记录并统一清理 setTimeout 句柄，恢复/卸载时取消未触发的调度；
 *   - 修改已懒加载插件的延迟（delay 从非 0 改为另一非 0 值）不重载
 *     正在运行的插件，仅对仍未加载的插件按新延迟重新调度；新延迟
 *     在下一次启动时生效。
 */

import type { Plugin, PluginManifest } from 'obsidian';
import type MDRazorPlugin from '../main';
import type { LazyLoadPluginConfig } from '../../model/settings';

/** MDRazor 自身 id：不可参与懒加载，避免自我管理 */
export const SELF_PLUGIN_ID = 'md-razor';

/** obsidian.d.ts 未公开的 app.plugins 内部接口（运行时存在） */
interface PluginManagerAPI {
	plugins: Record<string, Plugin>;
	manifests: Record<string, PluginManifest>;
	enablePlugin(id: string): void;
	disablePlugin(id: string): void;
	enablePluginAndSave(id: string): void;
	disablePluginAndSave(id: string): void;
}

/** 安全的 own-property 检查（规避 no-prototype-builtins） */
const hasOwn = (obj: object, key: string): boolean =>
	Object.prototype.hasOwnProperty.call(obj, key);

/** 懒加载控制器对外接口（供设置标签页与主控制器调用） */
export interface LazyLoadControl {
	/** 应用懒加载：调度未加载插件的延迟补载，并把已加载的懒加载插件翻转为持久化禁用 */
	start(): void;
	/** 恢复全部懒加载插件为持久化启用（总开关关闭 / 本插件卸载时调用） */
	restore(): void;
	/** 切换某插件启用状态（懒加载生效时立即按配置启停并持久化） */
	setEnabled(pluginId: string, enabled: boolean): Promise<void>;
	/** 修改某插件启动延迟（毫秒），0 = 取消懒加载 */
	setDelay(pluginId: string, delayMs: number): Promise<void>;
	/** 某插件当前是否处于「等待延迟加载」的调度中（仅供诊断展示） */
	isPending(pluginId: string): boolean;
}

/**
 * 注册懒加载控制器。
 *
 * 不产生任何副作用，直到 start() 被调用（onload 里根据「启用懒加载」开关决定）。
 *
 * @param onEnable 可选：当本控制器把「未加载」的插件触发加载（enablePlugin /
 *                 enablePluginAndSave）前回调，供启动耗时记录器对被触发的插件计时。
 */
export function registerLazyLoad(
	plugin: MDRazorPlugin,
	onEnable?: (pluginId: string) => void,
): LazyLoadControl {
	// 浏览器 setTimeout 的句柄类型为 number（@types/node 的全局类型会返回 Timeout，
	// 这里按 DOM 运行环境的实际值显式声明）
	const timers = new Map<string, number>();

	const pluginsAPI = (): PluginManagerAPI =>
		(plugin.app as unknown as { plugins: PluginManagerAPI }).plugins;

	const isPluginLoaded = (pluginId: string): boolean =>
		hasOwn(pluginsAPI().plugins, pluginId);

	/** 社区插件判断：核心插件 manifest 不含 version，社区插件必含 */
	const isCommunityManifest = (m: PluginManifest): boolean => {
		const version = (m as PluginManifest & { version?: string }).version;
		return typeof version === 'string' && version.length > 0;
	};

	/** 是否应纳入懒加载管理（社区插件且非 MDRazor 自身） */
	const isManaged = (pluginId: string): boolean => {
		if (pluginId === SELF_PLUGIN_ID) return false;
		const manifest = pluginsAPI().manifests[pluginId];
		return manifest != null && isCommunityManifest(manifest);
	};

	const cancelTimer = (pluginId: string): void => {
		const handle = timers.get(pluginId);
		if (handle !== undefined) {
			window.clearTimeout(handle);
			timers.delete(pluginId);
		}
	};

	/** 触发加载：如该插件当前未加载且属「已启用且延迟启动」的懒加载插件，
	 *  先通知记录器计时，再执行 enable */
	const enableNow = (pluginId: string, persist: boolean): void => {
		if (!isPluginLoaded(pluginId)) {
			const cfg = plugin.settings.lazyLoadPlugins[pluginId];
			if (cfg && cfg.enabled && cfg.delay > 0) {
				onEnable?.(pluginId);
			}
		}
		const pm = pluginsAPI();
		if (persist) {
			pm.enablePluginAndSave(pluginId);
		} else {
			pm.enablePlugin(pluginId);
		}
	};

	const scheduleEnable = (pluginId: string, delayMs: number): void => {
		cancelTimer(pluginId);
		timers.set(
			pluginId,
			window.setTimeout(() => {
				timers.delete(pluginId);
				enableNow(pluginId, false);
			}, Math.max(0, delayMs)),
		);
	};

	/** 读取（必要时按 fallback 创建）某插件配置 */
	const getConfig = (
		pluginId: string,
		fallback?: Partial<LazyLoadPluginConfig>,
	): LazyLoadPluginConfig => {
		let cfg = plugin.settings.lazyLoadPlugins[pluginId];
		if (!cfg) {
			cfg = {
				delay: fallback?.delay ?? 0,
				enabled: fallback?.enabled ?? isPluginLoaded(pluginId),
			};
			plugin.settings.lazyLoadPlugins[pluginId] = cfg;
		}
		return cfg;
	};

	/** 把「当前已加载」的懒加载插件翻转为懒加载模式：持久化禁用 + 会话内保持运行 */
	const flipToLazy = (pluginId: string): void => {
		if (!isPluginLoaded(pluginId)) return;
		const pm = pluginsAPI();
		pm.disablePluginAndSave(pluginId);
		pm.enablePlugin(pluginId);
	};

	const start = (): void => {
		if (!plugin.settings.lazyLoadEnabled) return;
		for (const [pluginId, cfg] of Object.entries(plugin.settings.lazyLoadPlugins)) {
			if (!cfg.enabled || cfg.delay <= 0 || !isManaged(pluginId)) continue;
			if (isPluginLoaded(pluginId)) {
				flipToLazy(pluginId);
			} else {
				scheduleEnable(pluginId, cfg.delay);
			}
		}
	};

	const restore = (): void => {
		for (const [pluginId, cfg] of Object.entries(plugin.settings.lazyLoadPlugins)) {
			if (!cfg.enabled || cfg.delay <= 0 || !isManaged(pluginId)) continue;
			cancelTimer(pluginId);
			const pm = pluginsAPI();
			if (isPluginLoaded(pluginId)) pm.disablePlugin(pluginId);
			enableNow(pluginId, true);
		}
	};

	const setEnabled = async (pluginId: string, enabled: boolean): Promise<void> => {
		const cfg = getConfig(pluginId);
		cfg.enabled = enabled;
		if (plugin.settings.lazyLoadEnabled && isManaged(pluginId)) {
			const pm = pluginsAPI();
			if (enabled) {
				if (cfg.delay > 0) {
					// 懒加载：持久化禁用 + 会话内运行（未加载则按延迟调度）
					if (isPluginLoaded(pluginId)) {
						flipToLazy(pluginId);
					} else {
						scheduleEnable(pluginId, cfg.delay);
					}
				} else {
					cancelTimer(pluginId);
					enableNow(pluginId, true);
				}
			} else {
				cancelTimer(pluginId);
				pm.disablePluginAndSave(pluginId);
			}
		}
		await plugin.saveSettings();
	};

	const setDelay = async (pluginId: string, delayMs: number): Promise<void> => {
		const cfg = getConfig(pluginId);
		const previous = cfg.delay;
		const next = Math.max(0, Math.round(delayMs));
		cfg.delay = next;
		if (plugin.settings.lazyLoadEnabled && cfg.enabled && isManaged(pluginId)) {
			if (next === 0) {
				// 取消懒加载 → 恢复持久化启用
				cancelTimer(pluginId);
				enableNow(pluginId, true);
			} else if (previous === 0) {
				// 新启用懒加载
				if (isPluginLoaded(pluginId)) {
					flipToLazy(pluginId);
				} else {
					scheduleEnable(pluginId, next);
				}
			} else if (!isPluginLoaded(pluginId)) {
				// 尚未加载（调度中或外部停用）：按新延迟重新调度
				scheduleEnable(pluginId, next);
			}
			// 已加载时保持现状，新延迟下次启动生效
		}
		await plugin.saveSettings();
	};

	const hasPendingTimer = (pluginId: string): boolean => timers.has(pluginId);

	return { start, restore, setEnabled, setDelay, isPending: hasPendingTimer };
}
