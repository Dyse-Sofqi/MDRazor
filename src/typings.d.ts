/**
 * MDRazor — 模块声明（typings）
 *
 * 声明 esbuild 自定义 loader 处理的文件类型，使 TypeScript 类型检查通过。
 */

/** CHANGELOG.md 经 esbuild text loader 以字符串形式打包进 main.js */
declare module '*.md' {
	const content: string;
	export default content;
}
