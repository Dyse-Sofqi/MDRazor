/**
 * MDRazor — 懒加载（移植自 Plugin Manager / plugin-manager）
 *
 * 为每个社区插件维护懒加载配置 { delay, active? }：
 *   - delay > 0 且接管中（active !== false）的插件在启动时不随 Obsidian
 *     立即加载，而是由本模块在设定 delay（毫秒）后用
 *     app.plugins.enablePlugin() 补加载 —— 插件之间的相对 delay
 *     即构成它们的启动先后顺序。
 *   - 被懒加载的插件持久化状态保持「禁用」（disablePluginAndSave），
 *     使 Obsidian 下次启动不会自动加载；会话内用 enablePlugin 保持运行。
 *   - 配置休眠（2.5.4）：在第三方插件设置中停用接管中的插件时，
 *     轮询检测到后仅标记 active=false，配置与延迟值保留；用户重新启用
 *     该插件后，轮询检测到即恢复 active，下次启动懒加载生效，
 *     无需重新设置延迟。休眠期间不调度、不补载、不参与 flip / restore。
 *   - 总开关关闭或本插件被卸载时，restore() 把全部接管中的懒加载插件
 *     恢复为持久化「启用」（enablePluginAndSave），下次启动自然加载，
 *     避免锁死用户；休眠条目不动（用户主动停用的插件不擅自启动）。
 *
 * 相对原版 Plugin Manager 的优化：
 *   - 用显式方法（setDelay）替代 Proxy set 拦截，行为可控；
 *   - 仅管理社区插件（按 manifest 是否带 version 判断），不碰核心插件；
 *   - 记录并统一清理 setTimeout 句柄，恢复/卸载时取消未触发的调度；
 *   - 修改已懒加载插件的延迟（delay 从非 0 改为另一非 0 值）不重载
 *     正在运行的插件，仅对仍未加载的插件按新延迟重新调度；新延迟
 *     在下一次启动时生效。
 *
 * 外部停用同步（轮询判据，逆向自 Obsidian 1.13.7；2.5.4 动作由
 * 「删除配置」改为「标记休眠」）：
 *   Obsidian「设置 → 第三方插件」的开关状态 = 插件是否已加载（面板以
 *   app.plugins.plugins 是否含实例为准），关闭动作调用内部
 *   disablePluginAndSave。该动作无任何事件可监听，因此本模块轮询
 *   plugins 实例表：接管中的插件在会话中被实例移除时，判定为被外部
 *   停用，标记 active=false 休眠（配置保留）；休眠条目重新出现实例
 *   （用户重新启用）时恢复 active=true。
 *   防误报规则（避免把启动/加载瞬间、安全模式、应用关闭误判为外部关闭）：
 *     - 连续 WATCH_REQUIRED_STREAK 次轮询缺席（跨过加载窗口的瞬时抖动）；
 *     - 插件必须在本会话中被观测到加载过（「本就未被加载」的歧义态不改）；
 *     - 「可启用但已加载过、当前却未加载」的批量哨兵（安全模式与应用关闭
 *       走 disablePlugin 不持久化、仍在 enabledPlugins 中），哨兵存在则
 *       本轮不判定，避免把整批关闭误判为逐插件关闭。
 *   恢复接管同样走 streak 计数（恢复比误停用后果轻，但连续两轮确认
 *   可避免在 Obsidian 自身的加载窗口内反复翻转标记）。
 *   标记翻转（休眠/恢复）时回调 onConfigChange，供设置界面即时同步
 *   条目的休眠视觉状态（降透明度/恢复可编辑）。
 *   enabledPlugins 在本模块仅用于批量哨兵的只读判断：被管理插件的
 *   持久化开关恒为停用（本模块 disablePluginAndSave 的结果），该集合
 *   无法区分「懒加载常态」与「用户停用」，不可作为接管/休眠判据。
 */

import type { Plugin, PluginManifest } from 'obsidian';
import type MDRazorPlugin from '../main';
import type { LazyLoadPluginConfig } from '../../model/settings';

/** MDRazor 自身 id：不可参与懒加载，避免自我管理 */
export const SELF_PLUGIN_ID = 'md-razor';

/** 外部停用/重新启用的轮询间隔（毫秒）：配合 streak=2，最坏 ~1s 内完成
 *  休眠/恢复判定，设置界面即时跟进。轮询本身仅做 O(条目数) 查表，
 *  微秒级，无性能负担；磁盘写入只在标记翻转时发生，不随频率增加 */
const WATCH_INTERVAL_MS = 500;
/** 判定「外部关闭/重新启用」所需的连续缺席/出现轮询次数 */
const WATCH_REQUIRED_STREAK = 2;

/** obsidian.d.ts 未公开的 app.plugins 内部接口（运行时存在；四个方法均为异步） */
interface PluginManagerAPI {
	plugins: Record<string, Plugin>;
	manifests: Record<string, PluginManifest>;
	/** 持久化启用的社区插件 id 集合（社区插件设置开关的真实数据源） */
	enabledPlugins: Set<string>;
	/** enablePlugin 期间 = 正在加载的插件 id，完成后置 null */
	loadingPluginId?: string | null;
	enablePlugin(id: string): Promise<void>;
	disablePlugin(id: string): Promise<void>;
	enablePluginAndSave(id: string): Promise<void>;
	disablePluginAndSave(id: string): Promise<void>;
}

/** 安全的 own-property 检查（规避 no-prototype-builtins） */
const hasOwn = (obj: object, key: string): boolean =>
	Object.prototype.hasOwnProperty.call(obj, key);

/** 懒加载控制器对外接口（供设置标签页与主控制器调用） */
export interface LazyLoadControl {
	/** 应用懒加载：调度未加载插件的延迟补载，并把已加载的懒加载插件翻转为持久化禁用；
	 *  仅处理接管中的条目（active !== false），休眠条目不调度 */
	start(): void;
	/** 恢复全部懒加载插件为持久化启用（总开关关闭 / 本插件卸载时调用）；
	 *  仅处理接管中的条目，休眠条目不动（用户主动停用的插件不擅自启动） */
	restore(): void;
	/** 修改某插件启动延迟（毫秒），0 = 取消懒加载（休眠条目归零仅记录延迟） */
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
 *                 enablePluginAndSave / flip 重载）前回调，供启动耗时记录器计时。
 * @param onConfigChange 可选：某条目的休眠/接管标记翻转时回调
 *                 (pluginId, active)，供设置界面刷新条目视觉状态。
 */
export function registerLazyLoad(
	plugin: MDRazorPlugin,
	onEnable?: (pluginId: string) => void,
	onConfigChange?: (pluginId: string, active: boolean) => void,
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

	/**
	 * 是否为接管中的懒加载条目：延迟 > 0、属社区插件、且未被标记休眠。
	 * 判据是配置自身的 active 标记，而非 enabledPlugins —— 被管理插件的
	 * 持久化开关恒为停用（本模块 disablePluginAndSave 的结果），该集合
	 * 无法区分「懒加载常态」与「用户停用」。
	 */
	const isLazyCandidate = (pluginId: string, cfg: LazyLoadPluginConfig): boolean =>
		cfg.delay > 0 && isManaged(pluginId) && cfg.active !== false;

	const cancelTimer = (pluginId: string): void => {
		const handle = timers.get(pluginId);
		if (handle !== undefined) {
			window.clearTimeout(handle);
			timers.delete(pluginId);
		}
	};

	/** 触发加载：如该插件当前未加载且属「延迟启动」的懒加载插件，
	 *  先通知记录器计时，再执行 enable。
	 *
	 *  竞态防御（未测量根因）：定时器等待期间插件可能被 Obsidian 启动序列
	 *  自然加载（休眠恢复路径：重新启用时持久化了启用状态）——此时实例
	 *  已存在，enablePlugin 会静默去重返回，不产生 loadingPluginId 窗口。
	 *  实例已存在时直接让位：不重复计时、不强行重载，持久化状态由后续
	 *  flip 路径统一处理。 */
	const enableNow = (pluginId: string, persist: boolean): void => {
		if (isPluginLoaded(pluginId)) return;
		const cfg = plugin.settings.lazyLoadPlugins[pluginId];
		if (cfg && cfg.delay > 0) {
			onEnable?.(pluginId);
		}
		const pm = pluginsAPI();
		if (persist) {
			pm.enablePluginAndSave(pluginId).catch(() => {});
		} else {
			pm.enablePlugin(pluginId).catch(() => {});
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

	/** 把「当前已加载」的懒加载插件翻转为懒加载模式：持久化禁用 + 会话内保持运行。
	 *
	 *  时序关键点（逆向 app.js 得出）：
	 *    - disablePlugin 内部 unloadPlugin 同步 delete plugins[id]，但 unload()
	 *      的实际清理异步展开；必须 await 完成后再计时重载，否则 trackLoad
	 *      的「实例已存在则忽略」守卫会静默跳过测量；
	 *    - 启动早期调用会被 Obsidian 的启动序列（initialize 按序 enablePlugin
	 *      每个 enabledPlugin）与 requestSaveConfig 节流写盘交错，loadingPluginId
	 *      窗口不按预期开启 —— 因此 start() 在 layout-ready 延迟一拍后再 flip，
	 *      避开启动序列；
	 *    - enablePlugin 可能静默短路（manifest 缺失 / deprecated / 已加载），
	 *      此时 loadingPluginId 不会置位，需由 trackLoad 的兜底分支结算。 */
	const flipToLazy = (pluginId: string): void => {
		if (!isPluginLoaded(pluginId)) return;
		const pm = pluginsAPI();
		void (async () => {
			await pm.disablePluginAndSave(pluginId);
			// 异常防御：卸载未完成（实例仍在）时放弃重载，避免状态混乱
			if (isPluginLoaded(pluginId)) return;
			onEnable?.(pluginId);
			pm.enablePlugin(pluginId).catch(() => {});
		})();
	};

	/** start 用的 flip 延迟（毫秒）：避开 Obsidian 启动序列（initialize 逐个
	 *  enablePlugin + saveConfig 节流写盘），在其结束后的下一拍再翻转，
	 *  保证卸载/重载窗口不被启动序列的同步段插队干扰 */
	const START_FLIP_DELAY_MS = 3000;

	const start = (): void => {
		if (!plugin.settings.lazyLoadEnabled) return;
		for (const [pluginId, cfg] of Object.entries(plugin.settings.lazyLoadPlugins)) {
			if (!isLazyCandidate(pluginId, cfg)) continue;
			if (isPluginLoaded(pluginId)) {
				// 已被 Obsidian 自然加载（含休眠恢复路径：重新启用时持久化了启用
				// 状态）→ flip 延迟一拍避开启动序列；先建立计时，flip 的重载窗口
				// 结束后由 trackLoad 结算真实 onload 耗时（自然加载的这次不计）
				onEnable?.(pluginId);
				window.setTimeout(() => flipToLazy(pluginId), START_FLIP_DELAY_MS);
			} else {
				scheduleEnable(pluginId, cfg.delay);
			}
		}
	};

	const restore = (): void => {
		for (const [pluginId, cfg] of Object.entries(plugin.settings.lazyLoadPlugins)) {
			if (!isLazyCandidate(pluginId, cfg)) continue;
			cancelTimer(pluginId);
			const pm = pluginsAPI();
			if (isPluginLoaded(pluginId)) {
				// 同 flipToLazy：等待异步卸载完成再启用，避免 enable 在旧实例
				// 尚在卸载时空操作（插件停在本会话未加载态）
				void (async () => {
					await pm.disablePlugin(pluginId);
					enableNow(pluginId, true);
				})();
			} else {
				enableNow(pluginId, true);
			}
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
				// 取消懒加载：恢复持久化启用（此前被本模块持久化禁用的插件）。
				// 休眠条目（active === false）不在此列：插件本就停用，不应启动。
				cancelTimer(pluginId);
				if (cfg.active !== false) enableNow(pluginId, true);
			} else if (previous === 0 && next > 0 && loaded) {
				// 新设置为懒加载且插件正在运行：持久化禁用 + 会话内保持运行。
				// 同时恢复接管（用户手动设置延迟即接管意图）。
				cfg.active = true;
				flipToLazy(pluginId);
			}
			// 其余情况仅记录延迟，本模块不擅自启动插件：
			//   - previous === 0 且未运行（插件在第三方插件设置中停用）→
			//     延迟视为意图，条目保持休眠（active 缺省/不变），待插件
			//     重新启用后由轮询恢复接管；
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
	// 休眠条目连续出现实例的轮询计数（恢复接管判定）
	const presentStreak = new Map<string, number>();

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

		// 总开关关闭期间轮询照常运行（仅做休眠/恢复标记，不调度加载）：
		// 否则关开关期间停用的插件会残留接管状态，重开开关后被误启动（2.5.3 缺口）。
		// 3. 逐候选判定：接管中 → 检测外部停用；休眠中 → 检测重新启用
		for (const [pluginId, cfg] of Object.entries(plugin.settings.lazyLoadPlugins)) {
			// 非候选（延迟归零）或整批卸载中：清除缺席计数防泄漏，不判定
			if (cfg.delay <= 0 || !isManaged(pluginId) || bulkTeardown) {
				absentStreak.delete(pluginId);
				presentStreak.delete(pluginId);
				continue;
			}

			const loaded = isPluginLoaded(pluginId) || pm.loadingPluginId === pluginId;

			if (cfg.active !== false) {
				// 接管中：已加载 / 正被调度 → 正常，不在缺席计
				if (loaded || timers.has(pluginId)) {
					absentStreak.delete(pluginId);
					continue;
				}
				// 本会话从未观测到加载 ⇒ 歧义态（可能本就未加载），不修正。
				// 例：接管中但本次启动未加载且无调度 —— 理论上不应发生
				//（start 会为未加载的接管插件建立调度），防御性跳过。
				if (!wasLoadedOnce.has(pluginId)) continue;
				const streak = (absentStreak.get(pluginId) ?? 0) + 1;
				if (streak < WATCH_REQUIRED_STREAK) {
					absentStreak.set(pluginId, streak);
					continue;
				}
				// 连续缺席达成：判定为第三方插件设置中被外部停用 ——
				// 标记休眠（配置与延迟值保留），不调度、不补载。
				cfg.active = false;
				cancelTimer(pluginId);
				absentStreak.delete(pluginId);
				void plugin.saveSettings();
				onConfigChange?.(pluginId, false);
			} else {
				// 休眠中：插件重新出现实例（用户在第三方插件设置中重新启用）
				if (!loaded) {
					presentStreak.delete(pluginId);
					continue;
				}
				const streak = (presentStreak.get(pluginId) ?? 0) + 1;
				if (streak < WATCH_REQUIRED_STREAK) {
					presentStreak.set(pluginId, streak);
					continue;
				}
				// 连续出现达成：恢复接管，下次启动懒加载生效，无需重设延迟。
				// 已在运行的实例不动（本会话不翻转其持久化状态，避免打扰
				// 用户刚启用的插件；其持久化态由本模块下次 flip 时自然接管）。
				cfg.active = true;
				presentStreak.delete(pluginId);
				absentStreak.delete(pluginId);
				void plugin.saveSettings();
				onConfigChange?.(pluginId, true);
			}
		}
	};

	// 常驻轮询：观察插件实例表；registerInterval 随插件卸载自动清理
	plugin.registerInterval(window.setInterval(watchTick, WATCH_INTERVAL_MS));

	return { start, restore, setDelay, isPending: hasPendingTimer };
}
