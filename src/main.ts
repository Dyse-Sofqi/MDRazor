/**
 * MDRazor — Plugin entry point
 *
 * Thin re-export for esbuild bundling.
 * Obsidian loads main.js and expects the default export to be the Plugin class.
 *
 * Architecture: MVC
 *   - model/     Data structures & shared state
 *   - view/      Settings UI
 *   - controller/ Plugin lifecycle & CM6 extensions
 */
export { default } from './controller/main';
