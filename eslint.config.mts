import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

// 用 ESLint 核心的 defineConfig 而非已废弃的 tseslint.config
// （obsidianmd 的 recommended 已内含 eslint 与 typescript-eslint 的 recommended）
export default defineConfig([
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
]);
