/**
 * MDRazor — 设置存储（.obsidian/md-razor-settings.json）
 *
 * Obsidian 默认把插件设置（开关状态 / 自定义命令 / 隐藏命令 / 懒加载延迟等
 * 全部 MDRazorSettings）放在插件目录 data.json，随插件卸载一并删除。
 * 本模块将其迁至 .obsidian 配置目录：卸载重装插件后设置不丢失。
 *
 * 载入逻辑与位置缓存一致（见 tab-enhancer/position-persistence.ts）：
 *   - 新位置存在 → 直接沿用，之后所有保存都写该文件；
 *   - 新位置不存在 → 回退读取插件目录 data.json，解析成功后迁移
 *     （写新文件成功即切换；迁移失败则本会话继续读写 data.json，
 *     下次加载再试）；
 *   - 两者都不存在 → 默认设置，写入新位置。
 * 旧文件迁移后保留不再读（卸载插件时随插件目录删除），
 * 单真相源由「新位置存在时优先」保证。
 *
 * 镜像兑底（插件目录 md-razor-settings.mirror.json）：
 *   .obsidian 配置目录下的设置文件可能被同步 / 备份 / 清理工具触碰
 *   （删除、损坏、截断），因此在插件目录保留一份延迟快照：
 *   - 保存成功后节流（≥2 分钟一次）写镜像，允许略旧；
 *   - 载入时主文件正常 → 镜像只补洞（仅填充主文件缺失的键）；
 *   - 主文件缺失 / 损坏 → 用镜像整体恢复并回写主文件自愈；
 *   - 镜像读取失败一律按「无镜像」处理，绝不影响正常加载。
 */

import { type Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, type MDRazorSettings } from '../model/settings';

/** 设置文件名（位于 .obsidian 配置目录；带插件命名空间避免与其他插件冲突） */
const SETTINGS_FILE = 'md-razor-settings.json';
/** 旧版设置文件名（Obsidian 默认插件 data.json，仅用于迁移） */
const FALLBACK_FILE = 'data.json';
/** 镜像文件名（位于插件目录，主文件损坏 / 丢失时的恢复兑底） */
const MIRROR_FILE = 'md-razor-settings.mirror.json';
/** 保存后写镜像的最小间隔（ms）：镜像允许略旧，避免频繁双写 */
const MIRROR_MIN_INTERVAL_MS = 2 * 60 * 1000;

let adapterRef: Plugin['app']['vault']['adapter'] | null = null;
/** 当前写入目标（新位置或迁移失败时的旧位置） */
let filePathRef = '';
/** 上次写镜像时间（节流用；0 = 从未写过 */
let lastMirrorAt = 0;

/** 插件目录 data.json 的完整路径 */
function resolveFallbackPath(plugin: Plugin): string {
	const pluginDir =
		plugin.manifest.dir ?? `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}`;
	return `${pluginDir}/${FALLBACK_FILE}`;
}

/** 插件目录镜像文件完整路径 */
function resolveMirrorPath(plugin: Plugin): string {
	const pluginDir =
		plugin.manifest.dir ?? `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}`;
	return `${pluginDir}/${MIRROR_FILE}`;
}

/** 读取并校验一个 JSON 对象文件；不存在 / 损坏 / 非对象一律返回 null */
async function readJsonObject(
	adapter: NonNullable<Plugin['app']['vault']['adapter']>,
	file: string,
): Promise<Record<string, unknown> | null> {
	try {
		if (!(await adapter.exists(file))) return null;
		const parsed = JSON.parse(await adapter.read(file)) as unknown;
		if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
		return parsed as Record<string, unknown>;
	} catch {
		return null;
	}
}

/**
 * 节流写镜像快照（force 用于必须立即同步镜像的场景）。
 * 写失败仅记日志，不影响主文件的正确性。
 */
async function writeSettingsMirror(
	plugin: Plugin,
	settings: MDRazorSettings,
	force = false,
): Promise<void> {
	if (!adapterRef) return;
	if (!force && Date.now() - lastMirrorAt < MIRROR_MIN_INTERVAL_MS) return;
	lastMirrorAt = Date.now();
	try {
		await adapterRef.write(resolveMirrorPath(plugin), JSON.stringify(settings, null, 2));
	} catch (err) {
		console.error('[MDRazor] 设置镜像写入失败（不影响主文件）', err);
	}
}

/**
 * 从磁盘载入设置并迁移（见文件头注释）。
 *
 * 返回与 DEFAULT_SETTINGS 合并后的完整设置对象；调用方负责后续 syncConfig。
 */
export async function loadPluginSettings(plugin: Plugin): Promise<MDRazorSettings> {
	adapterRef = plugin.app.vault.adapter;
	const vaultFile = `${plugin.app.vault.configDir}/${SETTINGS_FILE}`;
	const fallbackFile = resolveFallbackPath(plugin);

	let rawData: unknown = null;
	try {
		if (await adapterRef.exists(vaultFile)) {
			filePathRef = vaultFile;
			const parsed = JSON.parse(await adapterRef.read(vaultFile)) as unknown;
			// 仅接受平面对象；标量 / 数组视为损坏（rawData 保持 null，
			// 让下方镜像恢复介入），解析失败同样进入 catch 兑底。
			if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
				rawData = parsed;
			}
		} else if (await adapterRef.exists(fallbackFile)) {
			// 旧位置存在：解析成功后迁移（写入新文件成功即切换）。
			// 解析失败/迁移失败时保留旧文件原样，本次会话退回 data.json 或默认值。
			let parsed: unknown = null;
			try {
				parsed = JSON.parse(await adapterRef.read(fallbackFile)) as unknown;
			} catch {
				parsed = null;
			}
			if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
				rawData = parsed;
				try {
					await adapterRef.write(vaultFile, JSON.stringify(parsed, null, 2));
					filePathRef = vaultFile;
				} catch (err) {
					console.error('[MDRazor] 设置迁移到配置目录失败，继续使用 data.json', err);
					filePathRef = fallbackFile;
				}
			} else {
				// data.json 无法解析：视为无数据，指向新位置（后续保存会自愈）
				filePathRef = vaultFile;
			}
		} else {
			filePathRef = vaultFile;
		}
	} catch {
		// 新位置存在但读取失败（如文件损坏）：视为无数据，写回时自愈
		filePathRef = vaultFile;
		rawData = null;
	}

	// 镜像兑底（插件目录 md-razor-settings.mirror.json）：
	//   - 主文件正常 → 镜像只补洞（仅填充主文件缺失的键，绝不覆盖已有键）；
	//   - 主文件缺失 / 损坏（含标量 JSON）→ 镜像整体恢复并回写主文件自愈；
	//   - 镜像缺失 / 损坏 → 按「无镜像」处理，绝不影响正常加载。
	// 注意：data.json → 新位置的迁移逻辑保持不变，镜像只在其之后介入。
	// 整块 try 包裹：镜像属于兑底机制，自身任何异常都不允许阻断启动。
	try {
		const mirrorData = await readJsonObject(adapterRef, resolveMirrorPath(plugin));
		if (mirrorData) {
			if (rawData === null) {
				rawData = mirrorData;
				console.warn('[MDRazor] 设置主文件缺失或损坏，已从镜像恢复', vaultFile);
				try {
					await adapterRef.write(vaultFile, JSON.stringify(mirrorData, null, 2));
					filePathRef = vaultFile;
				} catch {
					// 回写失败：本会话先用镜像数据，下次保存再自愈
				}
			} else if (
				typeof rawData === 'object' &&
				!Array.isArray(rawData)
			) {
				// 主文件正常：补洞后回写，让主文件尽快追平镜像
				const main = rawData as Record<string, unknown>;
				let patched = false;
				for (const [key, value] of Object.entries(mirrorData)) {
					if (!(key in main)) {
						main[key] = value;
						patched = true;
					}
				}
				if (patched) {
					try {
						await adapterRef.write(vaultFile, JSON.stringify(main, null, 2));
					} catch {
						// 写回失败不致命：合并结果已在 rawData 生效，下次保存再落盘
					}
				}
			}
		}
	} catch (err) {
		console.error('[MDRazor] 设置镜像兑底异常，已跳过', err);
	}

	if (rawData !== null && typeof rawData === 'object' && !Array.isArray(rawData)) {
		const raw = rawData as Record<string, unknown>;
		// Migration: enhancedListMarkers → enterSoftBreak
		if ('enhancedListMarkers' in raw && !('enterSoftBreak' in raw)) {
			raw.enterSoftBreak = raw.enhancedListMarkers;
		}
		// Migration (2.5.3)：懒加载配置去掉 enabled 字段 —— 插件启停完全交给
		// 「第三方插件」设置管理。旧数据 enabled:false 表示用户已关闭该插件的
		// 懒加载（其插件本身也被置为停用），迁移为「不懒加载」（延迟 0），
		// 避免新逻辑把它当成懒加载意图而重新启动插件。
		if (raw.lazyLoadPlugins instanceof Object && !Array.isArray(raw.lazyLoadPlugins)) {
			const oldPlugins = raw.lazyLoadPlugins as Record<
				string,
				{ delay?: unknown; enabled?: unknown }
			>;
			const normalized: Record<string, { delay: number }> = {};
			for (const [id, entry] of Object.entries(oldPlugins)) {
				if (entry == null || typeof entry !== 'object') continue;
				const rawDelay =
					typeof entry.delay === 'number' && Number.isFinite(entry.delay)
						? Math.max(0, Math.round(entry.delay))
						: 0;
				const delay = entry.enabled === false ? 0 : rawDelay;
				normalized[id] = { delay };
			}
			raw.lazyLoadPlugins = normalized;
		}
		return Object.assign({}, DEFAULT_SETTINGS, raw);
	}
	return { ...DEFAULT_SETTINGS };
}

/**
 * 将设置整体持久化到当前写入目标（默认 .obsidian/md-razor-settings.json）。
 *
 * 写入失败时抛错（与 Obsidian saveData 语义一致），由调用方决定处理。
 */
export async function savePluginSettings(
	plugin: Plugin,
	settings: MDRazorSettings,
	options?: { forceMirror?: boolean },
): Promise<void> {
	if (!adapterRef || !filePathRef) {
		// 未经过 loadPluginSettings（理论上不会发生）：走 Obsidian 默认 data.json
		await plugin.saveData(settings);
		return;
	}
	await adapterRef.write(filePathRef, JSON.stringify(settings, null, 2));
	// 主文件写成功后延迟同步镜像（节流）；清理设置等场景用 forceMirror 跳过节流，
	// 防止「清理后旧设置从镜像复活」。
	void writeSettingsMirror(plugin, settings, options?.forceMirror === true);
}
