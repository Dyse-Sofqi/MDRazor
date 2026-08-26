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
 */

import { type Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, type MDRazorSettings } from '../model/settings';

/** 设置文件名（位于 .obsidian 配置目录；带插件命名空间避免与其他插件冲突） */
const SETTINGS_FILE = 'md-razor-settings.json';
/** 旧版设置文件名（Obsidian 默认插件 data.json，仅用于迁移） */
const FALLBACK_FILE = 'data.json';

let adapterRef: Plugin['app']['vault']['adapter'] | null = null;
/** 当前写入目标（新位置或迁移失败时的旧位置） */
let filePathRef = '';

/** 插件目录 data.json 的完整路径 */
function resolveFallbackPath(plugin: Plugin): string {
	const pluginDir =
		plugin.manifest.dir ?? `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}`;
	return `${pluginDir}/${FALLBACK_FILE}`;
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
			rawData = JSON.parse(await adapterRef.read(vaultFile)) as unknown;
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

	if (rawData !== null && typeof rawData === 'object' && !Array.isArray(rawData)) {
		const raw = rawData as Record<string, unknown>;
		// Migration: enhancedListMarkers → enterSoftBreak
		if ('enhancedListMarkers' in raw && !('enterSoftBreak' in raw)) {
			raw.enterSoftBreak = raw.enhancedListMarkers;
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
): Promise<void> {
	if (!adapterRef || !filePathRef) {
		// 未经过 loadPluginSettings（理论上不会发生）：走 Obsidian 默认 data.json
		await plugin.saveData(settings);
		return;
	}
	await adapterRef.write(filePathRef, JSON.stringify(settings, null, 2));
}
