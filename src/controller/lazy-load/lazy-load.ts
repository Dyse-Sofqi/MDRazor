/**
 * MDRazor — 懒加载（移植自 Plugin Manager / plugin-manager）
 *
 * 为每个社区插件维护懒加载配置 { delay }：
 *   - delay > 0 的插件在启动时不随 Obsidian 立即加载，
 *     而是由本模块在设定 delay（毫秒）后用 app.plugins.enablePlugin() 补加载 ——
 *     插件之间的相对 delay 即构成它们的启动先后顺序。
 *   - 被懒加载的插件持久化状态保持「禁用」（disablePluginAndSave），
 *     使 Obsidian 下次启动不会自动加载；会话内用 enablePlugin 保持运行。
 *   - 插件是否启用（启停）完全由「设置 → 第三方插件」管理，本模块不越权：
 *     delay > 0 即懒加载意图；延迟归 0 时恢复常规加载（enablePluginAndSave）。
 *   - 总开关关闭或本插件被卸载时，restore() 把全部懒加载插件恢复为
 *     持久化「启用」（enablePluginAndSave），下次启动自然加载，避免锁死用户。
 *
 * 相对原版 Plugin Manager 的优化：
 *   - 用显式方法（setDelay）替代 Proxy set 拦截，行为可控；
 *   - 仅管理社区插件（按 manifest 是否带 version 判断），不碰核心插件；
 *   - 记录并统一清理 setTimeout 句柄，恢复/卸载时取消未触发的调度；
 *   - 修改已懒加载插件的延迟（delay 从非 0 改为另一非 0 值）不重载
 *     正在运行的插件，仅对仍未加载的插件按新延迟重新调度；新延迟
 *     在下一次启动时生效；
 *   - 移除逐插件「启用开关」：插件启停完全交给第三方插件设置管理，
 *     懒加载列表只负责启动拦阻与延迟调度。
 *
 * 外部停用同步（对 Obsidian 1.13.7 app.js 逆向后设计）：
 *   Obsidian「设置 → 第三方插件」的开关状态 = 插件是否已加载（面板以
 *   app.plugins.plugins 是否含实例为准），关闭动作调用内部
 *   disablePluginAndSave。该动作无任何事件可监听，因此本模块轮询
 *   plugins 实例表：当某懒加载插件（delay > 0）在会话中被实例移除时，
 *   判定为在第三方插件设置中被外部关闭，自动取消其懒加载配置
 *   （删除条目并持久化）—— 下次启动不再补加载（修复：重启后 MDRazor
 *   主动启动用户已关闭的插件）。
 *   防误报规则（避免把启动/加载瞬间、安全模式、应用关闭误判为外部关闭）：
 *     - 连续 WATCH_REQUIRED_STREAK 次轮询缺席（跨过加载窗口的瞬时抖动）；
 *     - 插件必须在本会话中被观测到加载过（「本就未被加载」的歧义态不改）；
 *     - 「可启用但已加载过、当前却未加载」的批量哨兵（安全模式与应用关闭
 *       走 disablePlugin 不持久化、仍在 enabledPlugins 中），哨兵存在则
 *       本轮不判定，避免把整批关闭误判为逐插件关闭。
 */

import type { Plugin, PluginManifest } from 'obsidian';
import type MDRazorPlugin from '../main';
import type { LazyLoadPluginConfig } from '../../model/settings';

/** MDRazor 自身 id：不可参与懒加载，避免自我管理 */
export const SELF_PLUGIN_ID = 'md-razor';

/** 外部停用同步的轮询间隔（毫秒） */
const WATCH_INTERVAL_MS = 2000;
/** 判定「外部关闭」所需的连续缺席轮询次数（两次缺席间隔 ≥ 2×轮询间隔） */
const WATCH_REQUIRED_STREAK = 2;

/** obsidian.d.ts 未公开的 app.plugins 内部接口（运行时存在） */
interface PluginManagerAPI {
	plugins: Record<string, Plugin>;
	manifests: Record<string, PluginManifest>;
	/** 持久化启用的社区插件 id 集合（社区插件设置开关的真实数据源） */
	enabledPlugins: Set<string>;
	/** enablePlugin 期间 = 正在加载的插件 id，完成后置 null */
	loadingPluginId?: string | null;
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
 * @param onExternalDisable 可选：当检测到某懒加载插件在第三方插件设置中被
 *                 （外部）关闭、懒加载配置已自动取消时回调，供设置界面刷新列表。
 */
export function registerLazyLoad(
	plugin: MDRazorPlugin,
	onEnable?: (pluginId: string) => void,
	onExternalDisable?: (pluginId: string) => void,
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

	/** 触发加载：如该插件当前未加载且属「延迟启动」的懒加载插件，
	 *  先通知记录器计时，再执行 enable */
	const enableNow = (pluginId: string, persist: boolean): void => {
		if (!isPluginLoaded(pluginId)) {
			const cfg = plugin.settings.lazyLoadPlugins[pluginId];
			if (cfg && cfg.delay > 0) {
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
			if (cfg.delay <= 0 || !isManaged(pluginId)) continue;
			if (isPluginLoaded(pluginId)) {
				flipToLazy(pluginId);
			} else {
				scheduleEnable(pluginId, cfg.delay);
			}
		}
	};

	const restore = (): void => {
		for (const [pluginId, cfg] of Object.entries(plugin.settings.lazyLoadPlugins)) {
			if (cfg.delay <= 0 || !isManaged(pluginId)) continue;
			cancelTimer(pluginId);
			const pm = pluginsAPI();
			if (isPluginLoaded(pluginId)) pm.disablePlugin(pluginId);
			enableNow(pluginId, true);
		}
	};

	const setDelay = async (pluginId: string, delayMs: number): Promise<void> => {
		const cfg = getConfig(pluginId);
		const previous = cfg.delay;
		const next = Math.max(0, Math.round(delayMs));
		cfg.delay = next;
		if (plugin.settings.lazyLoadEnabled && isManaged(pluginId)) {
			const loaded = isPluginLoaded(pluginId);
			if (next === 0 && previous > 0) {
				// 取消懒加载 → 恢复持久化启用（此前被本模块持久化禁用的插件）
				cancelTimer(pluginId);
				enableNow(pluginId, true);
			} else if (previous === 0 && next > 0 && loaded) {
				// 新设置为懒加载且插件正在运行：持久化禁用 + 会话内保持运行
				flipToLazy(pluginId);
			} else if (!loaded && timers.has(pluginId)) {
				// 已有延迟调度在途：按新延迟重新调度
				scheduleEnable(pluginId, next);
			}
			// 其余情况仅记录延迟，本模块不擅自启动插件：
			//   - previous === 0 且未运行（插件在第三方插件设置中停用）→
			//     延迟视为意图，待用户在第三方插件设置中启用后于下次启动生效；
			//   - 已加载（previous > 0）→ 保持现状，新延迟下次启动生效。
		}
		await plugin.saveSettings();
	};

	const hasPendingTimer = (pluginId: string): boolean => timers.has(pluginId);

	// ---- 外部停用同步（轮询判据见文件头注释） ----
	// 本会话中观测到「已加载」的插件 id 集合：区分「被外部关闭」与「从未加载」的歧义态
	const wasLoadedOnce = new Set<string>();
	// 各候选插件连续缺席的轮询计数（达到 WATCH_REQUIRED_STREAK 才判定）
	const absentStreak = new Map<string, number>();

	// 注册时播种：注册前就已加载的插件，即使在下一次轮询前被关闭也应被判定
	for (const id of Object.keys(pluginsAPI().plugins)) wasLoadedOnce.add(id);

	const watchTick = (): void => {
		const pm = pluginsAPI();
		// 1. 记录当前已加载的插件（含被本模块 flip 回加载的插件）
		for (const id of Object.keys(pm.plugins)) wasLoadedOnce.add(id);

		// 2. 批量哨兵：enabledPlugins 中「已加载过、当前却未加载」的插件存在 ⇒ 发生了
		//    整批卸载（安全模式等走 disablePlugin，不修改 enabledPlugins），本轮不判定，
		//    避免把「整批关闭」误判为「逐插件外部关闭」。
		let bulkTeardown = false;
		for (const id of pm.enabledPlugins) {
			if (
				isManaged(id) &&
				!hasOwn(pm.plugins, id) &&
				pm.loadingPluginId !== id &&
				wasLoadedOnce.has(id)
			) {
				bulkTeardown = true;
				break;
			}
		}

		// 3. 逐候选判定
		for (const [pluginId, cfg] of Object.entries(plugin.settings.lazyLoadPlugins)) {
			// 非候选（延迟归零）或整批卸载中：清除缺席计数防泄漏，不判定
			if (cfg.delay <= 0 || !isManaged(pluginId) || bulkTeardown) {
				absentStreak.delete(pluginId);
				continue;
			}
			// 已加载，或正被调度 / 正处于加载窗口 ⇒ 正常，不在缺席计
			if (
				isPluginLoaded(pluginId) ||
				timers.has(pluginId) ||
				pm.loadingPluginId === pluginId
			) {
				absentStreak.delete(pluginId);
				continue;
			}
			// 本会话从未观测到加载 ⇒ 歧义态（可能本就未加载），不修正
			if (!wasLoadedOnce.has(pluginId)) continue;

			const streak = (absentStreak.get(pluginId) ?? 0) + 1;
			if (streak < WATCH_REQUIRED_STREAK) {
				absentStreak.set(pluginId, streak);
				continue;
			}
			// 连续缺席达成：判定为第三方插件设置中被外部关闭 ——
			// 取消其懒加载配置（删除条目并持久化），下次启动不再补加载。
			const cur = plugin.settings.lazyLoadPlugins[pluginId];
			if (cur && cur.delay > 0) {
				delete plugin.settings.lazyLoadPlugins[pluginId];
				cancelTimer(pluginId);
				absentStreak.delete(pluginId);
				onExternalDisable?.(pluginId);
				void plugin.saveSettings();
			} else {
				absentStreak.delete(pluginId);
			}
		}
	};

	// 常驻轮询：观察插件实例表；registerInterval 随插件卸载自动清理
	plugin.registerInterval(window.setInterval(watchTick, WATCH_INTERVAL_MS));

	return { start, restore, setDelay, isPending: hasPendingTimer };
}
