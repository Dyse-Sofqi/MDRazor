/**
 * MDRazor — 发版脚本（GitHub REST API 主链 + Gitee 镜像）
 *
 * 用法：`npm run release -- <版本号>`（例：`npm run release -- 2.6.9`）
 *
 * 设计目标：把「发版流程」从散文固化成可执行链路——agent 与人都只跑这一条命令，
 * 不再手工拼 API 调用（2026-10-07 的 2.6.9 发布中，正是手工拼调用 + 验收过松
 * 导致 GitHub 上只落成草稿还误报成功）。
 *
 * 硬性规则（脚本内建，无法绕过）：
 *   - **不推 git tag、不单独建 tag**：tag 由 release API 自动创建（无 v 前缀）；
 *   - **验收只用「草稿不可寻址」的两个端点**：`GET /releases/tags/<ver>` 与
 *     `GET /releases/latest`，两者都返回该版本且 draft=false 才算成功；
 *     `GET /releases`（列表）在本机网络路径上会命中陈旧缓存，禁止用于判断；
 *   - 写接口（POST/PATCH/uploads）遇到 5xx / TLS / EOF 一律退避重试；
 *     422 already_exists 转「校验并补发布」分支，不另起炉灶。
 *
 * 步骤：
 *   0. 预检：版本四处一致 + CHANGELOG 有对应版本节 + 工作区干净 +
 *      远端 main == 本地 HEAD（可 --push 自动推）+ 三件套产物存在（默认先 build）
 *   1. GitHub：创建/校验 release → 草稿则补发布 → 上传缺失资产 → 双端点验收
 *   2. Gitee 镜像（GITEE_TOKEN 存在时；可 --skip-gitee）：推 main → 建 release
 *      （令牌走 query 参数、payload 走临时文件——两条实证过的坑）→ 传附件 → 验收
 *
 * git 通道回退（2026-10-08 补：2.7.0 发版时 github.com:443 被阻断）：
 *   `github.com:443` 时段性阻断时 `git push` / `git ls-remote` 全挂，但
 *   `api.github.com` 通常仍可用。此时预检改经 API 读远端 main，--push 改走
 *   REST API（blobs → tree → commit → PATCH ref，见 pushViaApi）；commit 用
 *   本地提交元数据重建（SHA 与本地逐字节相同），并以「tree / commit 与本地
 *   一致」两道闸门把关，不过就停 —— 绝不发错东西。
 *
 * 任何一步失败都会打印「已完成到哪一步」并非零退出；脚本幂等，可反复运行。
 * 本文件是开发/发版工具，不参与插件构建（esbuild 只打包 src/main.ts），
 * 不进 main.js、不是发布资产，与 Obsidian 社区插件审核无关。
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ────────────────────────── 基础工具 ────────────────────────── */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const done = [];
let tmpDir = null;

function log(msg) {
	console.log(msg);
}
function step(n, msg) {
	log(`\n── ${n}. ${msg}`);
}
function ok(msg) {
	log(`   ✓ ${msg}`);
}
function mark(text) {
	done.push(text);
}
function fail(msg) {
	log(`\n✗ ${msg}`);
	if (done.length) log(`已完成步骤：\n  - ${done.join('\n  - ')}`);
	cleanup();
	process.exit(1);
}
function cleanup() {
	if (tmpDir) {
		try {
			rmSync(tmpDir, { recursive: true, force: true });
		} catch {
			/* 尽力而为 */
		}
	}
}
function tmpFile(name, content) {
	tmpDir ??= mkdtempSync(join(tmpdir(), 'mdrazor-release-'));
	const p = join(tmpDir, name);
	writeFileSync(p, content, 'utf8');
	return p;
}

/** 运行命令；返回 { code, stdout, stderr }，不抛异常 */
function run(cmd, args, opts = {}) {
	try {
		const stdout = execFileSync(cmd, args, {
			cwd: ROOT,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			maxBuffer: 32 * 1024 * 1024,
			...opts,
		});
		return { code: 0, stdout: stdout ?? '', stderr: '' };
	} catch (err) {
		return {
			code: err.status ?? 1,
			stdout: String(err.stdout ?? ''),
			stderr: String(err.stderr ?? err.message ?? ''),
		};
	}
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 写接口是否值得重试：服务端 5xx、TLS/连接类错误、gh 的空响应解析错误 */
function retryable(text) {
	return /HTTP\/2(?:\.0)? 5\d\d|HTTP 5\d\d|TLS handshake|TLS connect|SSL|timed out|timeout|EOF|connection (reset|refused)|Failed to connect|RPC failed|unexpected end of JSON input|Internal Server Error/i.test(
		text,
	);
}

/**
 * 带退避重试地执行一次写调用。
 * @param doCall 返回 { code, stdout, stderr } 的函数
 * @param isDone 判断「已成功」的谓词（默认 code === 0）
 */
async function withRetry(label, doCall, isDone = (r) => r.code === 0, attempts = 8) {
	for (let i = 1; i <= attempts; i++) {
		const r = doCall();
		if (isDone(r)) return r;
		const text = `${r.stdout}\n${r.stderr}`;
		if (i < attempts && retryable(text)) {
			const wait = Math.min(15_000 * i, 60_000);
			log(`   … ${label} 第 ${i} 次失败（服务端/网络异常），${wait / 1000}s 后重试`);
			await sleep(wait);
			continue;
		}
		return r;
	}
	const last = doCall();
	return last;
}

/* ────────────────────────── 参数与预检 ────────────────────────── */

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const versionArg = argv.find((a) => !a.startsWith('--'));
const DRY = flags.has('--dry-run');
const NO_BUILD = flags.has('--no-build');
const DO_PUSH = flags.has('--push');
const SKIP_GITEE = flags.has('--skip-gitee');

const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const version = versionArg ?? manifest.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`版本号格式不正确：${version}（应形如 2.6.9）`);

const remoteSlug = (name) => {
	const r = run('git', ['remote', 'get-url', name]);
	if (r.code !== 0) return null;
	const m = /github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/.exec(r.stdout.trim()) ??
		/gitee\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/.exec(r.stdout.trim());
	return m ? `${m[1]}/${m[2]}` : null;
};
const ghSlug = remoteSlug('origin') ?? fail('无法从 origin 远端解析 owner/repo');
const giteeSlug = remoteSlug('gitee');

function readJson(rel) {
	return JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
}

/** 从 CHANGELOG.md 生成 release body（与既有发版惯例一致） */
function buildBody() {
	const s = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
	const start = s.indexOf(`**${version}**`);
	if (start < 0) return null;
	const next = s.indexOf('\n\n**', start + 1);
	const sec = next < 0 ? s.slice(start) : s.slice(start, next);
	let out = sec.replace(/^\*\*(.+?)\*\*/, (_, t) => `## ${t}`);
	out = out.replace(/^\*\*(.+?)\*\*$/gm, (_, t) => `### ${t}`).replace(/\*\*/g, '');
	return `${out.trimEnd()}\n\n---\n\n完整更新记录:[CHANGELOG.md](https://github.com/${ghSlug}/blob/main/CHANGELOG.md) / [CHANGELOG.en.md](https://github.com/${ghSlug}/blob/main/CHANGELOG.en.md)\n`;
}

async function preflight() {
	step(0, `预检（版本 ${version}${DRY ? '，dry-run' : ''}）`);

	// 版本四处一致
	const lock = readFileSync(join(ROOT, 'package-lock.json'), 'utf8');
	const lockCount = (lock.match(new RegExp(`"version": "${version.replace(/\./g, '\\.')}"`, 'g')) ?? []).length;
	const versions = readJson('versions.json');
	const checks = [
		['manifest.json', manifest.version === version],
		['package.json', readJson('package.json').version === version],
		['package-lock.json（根 + packages."" 两处）', lockCount === 2],
		[`versions.json 含 "${version}"`, version in versions],
	];
	for (const [name, pass] of checks) {
		if (!pass) fail(`版本号未对齐：${name}（四处必须全部为 ${version}）`);
		ok(`版本对齐：${name}`);
	}

	// CHANGELOG 有对应版本节
	const body = buildBody();
	if (!body) fail(`CHANGELOG.md 中找不到 "**${version}**" 版本节（先把「未发布」归档为该版本）`);
	ok('CHANGELOG.md 有对应版本节');

	// 工作区干净
	const status = run('git', ['status', '--porcelain']).stdout.trim();
	if (status) fail(`工作区不干净，先提交：\n${status}`);
	ok('工作区干净');

	// 远端 main == 本地 HEAD（发版必须基于已推送的提交）
	// git 通道（github.com:443）时段性阻断时，回退到 api.github.com 读引用
	const head = run('git', ['rev-parse', 'HEAD']).stdout.trim();
	const lsRemote = run('git', ['ls-remote', 'origin', 'refs/heads/main']);
	let remoteMain = lsRemote.code === 0 ? (lsRemote.stdout.trim().split(/\s+/)[0] ?? '') : '';
	if (!remoteMain) {
		remoteMain = remoteBranchSha('main') ?? '';
		if (remoteMain) ok(`git 通道不可用，经 API 读到远端 main = ${remoteMain.slice(0, 7)}`);
	}
	if (remoteMain !== head) {
		if (DO_PUSH && !DRY) {
			log('   远端 main 与本地不一致，--push 生效：推送 main…');
			// gh 凭据助手一次性覆盖（普通 push 会挂在 GCM 交互上）
			const pushed = run(
				'git',
				[
					'-c',
					'credential.helper=',
					'-c',
					'credential.helper=!gh auth git-credential',
					'push',
					'origin',
					'main',
				],
				{ env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
			);
			if (pushed.code === 0) {
				ok('已推送 main（git 通道）');
			} else {
				// github.com:443 被阻断 → 整条推送改走 REST API（blobs → tree → commit → PATCH ref）
				const why = (pushed.stderr || pushed.stdout).trim().split('\n').pop() ?? '';
				log(`   git push 失败（${why.slice(0, 120)}），改走 GitHub REST API…`);
				pushViaApi('main');
				ok('已推送 main（REST API：blobs → tree → commit → PATCH ref）');
			}
			mark('推送 main');
		} else {
			fail(
				`远端 main(${remoteMain.slice(0, 7) || '空'}) 与本地 HEAD(${head.slice(0, 7)}) 不一致。\n` +
					'   先推送（或加 --push）：GIT_TERMINAL_PROMPT=0 git -c credential.helper= -c "credential.helper=!gh auth git-credential" push origin main',
			);
		}
	} else {
		ok(`远端 main == 本地 HEAD（${head.slice(0, 7)}）`);
	}

	// 三件套产物
	if (!NO_BUILD && !DRY) {
		log('   重建产物（npm run build）…');
		const b = run('npm', ['run', 'build'], { shell: process.platform === 'win32' });
		if (b.code !== 0) fail(`构建失败：\n${b.stdout}\n${b.stderr}`);
		ok('构建通过（tsc + esbuild）');
		mark('构建');
	}
	for (const f of ['main.js', 'manifest.json', 'styles.css']) {
		if (!existsSync(join(ROOT, f))) fail(`缺少发布资产：${f}`);
	}
	ok('三件套产物存在（main.js / manifest.json / styles.css）');

	return body;
}

/* ────────────────────────── GitHub 主链 ────────────────────────── */

/** gh api → 解析 JSON（失败返回 null）。
 *  注意：调用方一律不传 --jq —— jq 过滤器里的 \(...) 在 JS 字符串中反斜杠会被
 *  吃掉，过滤器变为非法且 gh 静默失败（探测已存在资产时踩过：会导致重复上传同名资产）。 */
function ghJsonParse(args) {
	const r = run('gh', ['api', ...args]);
	if (r.code !== 0) return null;
	try {
		return JSON.parse(r.stdout);
	} catch {
		return null;
	}
}

/* ── GitHub REST API 回退通道（github.com:443 时段性阻断时）───────────
 * git 通道（push / ls-remote）走 github.com，一旦被阻断整条发版链路就瘫掉；
 * 而 api.github.com 通常仍可用。故这里补两个纯 API 实现：
 *   - remoteBranchSha()：读远端分支 sha（git ls-remote 的替代）；
 *   - pushViaApi()：blobs → tree → commit → PATCH ref（git push 的替代）。
 * 关键：commit 用**本地提交自己的元数据**（author/committer 含时区偏移、
 * message 原文）重建，SHA 与本地逐字节相同；并以「API tree == 本地 tree」
 * 「API commit == 本地 HEAD」两道闸门把关 —— 不一致就停，宁可失败不发错东西。 */

/** gh api 调用（失败抛错；payload 走临时文件，避免中文/引号被 shell 拆坏） */
function ghApi(method, path, payload) {
	const args = ['api', '-X', method, `repos/${ghSlug}/${path}`];
	if (payload !== undefined) {
		const p = tmpFile(`api-${Math.random().toString(36).slice(2)}.json`, JSON.stringify(payload));
		args.push('--input', p);
	}
	const r = run('gh', args);
	if (r.code !== 0) {
		throw new Error(`gh api ${method} ${path} 失败：${(r.stdout + r.stderr).trim().slice(0, 300)}`);
	}
	try {
		return JSON.parse(r.stdout || '{}');
	} catch {
		throw new Error(`gh api ${method} ${path} 返回不可解析：${(r.stdout || '').slice(0, 200)}`);
	}
}

/** 读远端分支 sha（api.github.com；git ls-remote 的替代），失败返回 null */
function remoteBranchSha(branch) {
	try {
		return ghApi('GET', `git/ref/heads/${branch}`)?.object?.sha ?? null;
	} catch {
		return null;
	}
}

/** 经 REST API 把本地 HEAD 推到远端分支（git push 的替代） */
function pushViaApi(branch) {
	const g = (fmt) => run('git', ['log', '-1', `--format=${fmt}`]).stdout.trim();
	const headSha = run('git', ['rev-parse', 'HEAD']).stdout.trim();
	const parentSha =
		remoteBranchSha(branch) ?? run('git', ['rev-parse', `origin/${branch}`]).stdout.trim();
	if (!parentSha) throw new Error(`无法确定远端 ${branch} 的父提交`);

	// 改动文件（父提交 → HEAD）；父提交对象不在本地时退化为「本地提交自身的改动」
	let files = run('git', ['diff', '--name-only', parentSha, headSha])
		.stdout.trim()
		.split('\n')
		.filter(Boolean);
	if (!files.length) {
		const prev = run('git', ['rev-parse', 'HEAD~1']).stdout.trim();
		files = run('git', ['diff', '--name-only', prev, headSha])
			.stdout.trim()
			.split('\n')
			.filter(Boolean);
	}
	if (!files.length) throw new Error('没有可上传的改动文件');

	// 行尾：以仓库（索引）里的行尾为准（`i/` 列），只把 i/lf 的工作区 CRLF 归一。
	// ⚠️ `--eol` 输出用**制表符**分隔，正则必须用 \s（按空格写会静默解析出 0 条）。
	const eolMap = new Map();
	for (const line of run('git', ['ls-files', '--eol', ...files]).stdout.split('\n')) {
		const m = /^(i\/\S+)\s+w\/\S+\s+\S+\s+(.+)$/.exec(line);
		if (m) eolMap.set(m[2], m[1]);
	}

	const entries = [];
	for (const f of files) {
		const bytes = readFileSync(join(ROOT, f));
		const isBinary = bytes.includes(0);
		const repoEol = eolMap.get(f) ?? 'i/lf';
		let content = bytes;
		if (!isBinary && repoEol === 'i/lf' && bytes.includes(13)) {
			content = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
		}
		const blob = ghApi('POST', 'git/blobs', { content: content.toString('base64'), encoding: 'base64' });
		entries.push({ path: f, mode: '100644', type: 'blob', sha: blob.sha });
	}

	const parentTree = ghApi('GET', `git/commits/${parentSha}`)?.tree?.sha;
	if (!parentTree) throw new Error(`读不到父提交 ${parentSha.slice(0, 7)} 的 tree`);
	const tree = ghApi('POST', 'git/trees', { base_tree: parentTree, tree: entries });
	const localTree = run('git', ['rev-parse', 'HEAD^{tree}']).stdout.trim();
	if (tree.sha !== localTree) {
		throw new Error(`tree 闸门未过（API ${tree.sha} ≠ 本地 ${localTree}）—— 行尾/文件集不一致，已停止，未推送`);
	}

	const commit = ghApi('POST', 'git/commits', {
		message: run('git', ['log', '-1', '--format=%B']).stdout.replace(/\n+$/, ''),
		tree: tree.sha,
		parents: [parentSha],
		author: { name: g('%an'), email: g('%ae'), date: g('%aI') },
		committer: { name: g('%cn'), email: g('%ce'), date: g('%cI') },
	});
	if (commit.sha !== headSha) {
		throw new Error(`commit 闸门未过（API ${commit.sha} ≠ 本地 ${headSha}）—— 提交元数据不一致，已停止，未推送`);
	}

	ghApi('PATCH', `git/refs/heads/${branch}`, { sha: commit.sha, force: false });
	// 本地 origin/<branch> 同步到该提交（github.com 不通，无法 fetch）
	run('git', ['update-ref', `refs/remotes/origin/${branch}`, commit.sha]);
}

/** 分页拉全量 release（列表接口可能命中缓存，仅用于「找草稿」这类修复性分支） */
function listAllReleases(maxPages = 4) {
	const all = [];
	for (let page = 1; page <= maxPages; page++) {
		const arr = ghJsonParse([`repos/${ghSlug}/releases?per_page=100&page=${page}`]);
		if (!Array.isArray(arr)) break;
		all.push(...arr);
		if (arr.length < 100) break;
	}
	return all;
}

/** 查询 release（草稿不可按 tag 寻址，故 tag 查询失败时在列表中找草稿） */
function findReleaseByTag() {
	const byTag = ghJsonParse([`repos/${ghSlug}/releases/tags/${version}`]);
	if (byTag?.id) return { id: String(byTag.id), draft: byTag.draft === true };
	for (const rel of listAllReleases()) {
		if (rel.tag_name === version) return { id: String(rel.id), draft: rel.draft === true };
	}
	return null;
}

async function githubRelease(body) {
	step(1, `GitHub release（api.github.com，tag=${version}，无 v 前缀）`);

	let rel = findReleaseByTag();
	if (rel) {
		ok(`已存在 release（id=${rel.id}${rel.draft ? '，草稿' : '，已发布'}）`);
	} else if (DRY) {
		ok(`（dry-run）将创建 release：tag=${version} target=main draft=false`);
	} else {
		const payload = tmpFile(
			'release.json',
			JSON.stringify({ tag_name: version, target_commitish: 'main', name: version, body, draft: false }, null, 1),
		);
		const r = await withRetry(
			'创建 release',
			() => ghJson(['-X', 'POST', `repos/${ghSlug}/releases`, '--input', payload]),
			(res) => res.code === 0 || /already_exists/.test(res.stdout + res.stderr),
		);
		const text = r.stdout + r.stderr;
		if (r.code !== 0 && !/already_exists/.test(text)) fail(`创建 release 失败：${text.trim()}`);
		if (/already_exists/.test(text)) ok('POST 返回 already_exists —— 转入校验/补发布分支');
		else ok('release 已创建（tag 由 API 自动创建）');
		mark('GitHub 创建 release');
		rel = findReleaseByTag();
	}

	// 草稿 → 补发布（2.6.9 曾出现「带 published_at 却仍是草稿」的半发布）
	if (rel?.draft) {
		if (DRY) {
			ok('（dry-run）release 是草稿，将 PATCH draft=false 补发布');
		} else {
			const payload = tmpFile('publish.json', JSON.stringify({ name: version, body, draft: false, prerelease: false }, null, 1));
			const r = await withRetry('发布 release', () =>
				ghJson(['-X', 'PATCH', `repos/${ghSlug}/releases/${rel.id}`, '--input', payload]),
			);
			if (r.code !== 0) fail(`补发布失败：${(r.stdout + r.stderr).trim()}`);
			ok('草稿已发布（PATCH draft=false）');
			mark('GitHub 补发布草稿');
		}
	}

	// 资产：缺失才上传（幂等）；尺寸一致视为已就绪
	if (rel) {
		const assets = ghJsonParse([`repos/${ghSlug}/releases/${rel.id}/assets?per_page=100`]) ?? [];
		const existing = new Set(assets.map((a) => `${a.name}:${a.size}`));
		for (const f of ['main.js', 'manifest.json', 'styles.css']) {
			const size = String(readFileSync(join(ROOT, f)).length);
			if (existing.has(`${f}:${size}`)) {
				ok(`资产已就绪：${f} (${size})`);
				continue;
			}
			if (DRY) {
				ok(`（dry-run）将上传资产：${f} (${size})`);
				continue;
			}
			const up = await withRetry(`上传 ${f}`, () =>
				run('gh', [
					'api',
					'-X',
					'POST',
					'-H',
					'Content-Type: application/octet-stream',
					`https://uploads.github.com/repos/${ghSlug}/releases/${rel.id}/assets?name=${f}`,
					'--input',
					join(ROOT, f),
				]),
			);
			if (up.code !== 0) fail(`上传 ${f} 失败：${(up.stdout + up.stderr).trim()}`);
			ok(`已上传资产：${f} (${size})`);
			mark(`GitHub 上传 ${f}`);
		}
	}

	// 双端点验收（唯一可信判据）
	step(2, '验收（仅用草稿不可寻址的两个端点）');
	if (DRY) {
		log('   （dry-run 跳过在线验收；正式运行会断言 by-tag 与 latest 均为该版本且 draft=false）');
		return;
	}
	const published = (rel) => rel?.tag_name === version && rel.draft === false;
	let byTag = null;
	for (let i = 1; i <= 4; i++) {
		byTag = ghJsonParse([`repos/${ghSlug}/releases/tags/${version}`]);
		if (published(byTag)) break;
		if (i < 4) {
			log(`   … 验收 by-tag 第 ${i} 次未就绪，重试`);
			await sleep(5000 * i);
		}
	}
	if (!published(byTag)) {
		fail(`验收失败：/releases/tags/${version} 未返回已发布状态（${byTag ? `draft=${byTag.draft}` : '查询失败'}）`);
	}
	ok(`by-tag ${version}：已发布 ✓`);
	let latest = null;
	for (let i = 1; i <= 4; i++) {
		latest = ghJsonParse([`repos/${ghSlug}/releases/latest`]);
		if (published(latest)) break;
		if (i < 4) {
			log(`   … 验收 latest 第 ${i} 次未就绪，重试`);
			await sleep(5000 * i);
		}
	}
	if (!published(latest)) {
		fail(`验收失败：/releases/latest 返回 ${latest?.tag_name ?? '（查询失败）'}（应为 ${version}，草稿不计）`);
	}
	ok(`latest ${version}：已发布 ✓`);
	mark('GitHub 双端点验收通过');
	log(`   ${`https://github.com/${ghSlug}/releases/tag/${version}`}`);
}

/* ────────────────────────── Gitee 镜像（可选） ────────────────────────── */

async function giteeMirror(body) {
	const token = process.env.GITEE_TOKEN;
	if (SKIP_GITEE || !token || !giteeSlug) {
		step(3, 'Gitee 镜像：跳过');
		log(
			SKIP_GITEE
				? '   （--skip-gitee）'
				: !giteeSlug
					? '   （未配置 gitee 远端）'
					: '   （未设置 GITEE_TOKEN 环境变量；设好后重跑本脚本即可补发布镜像）',
		);
		return;
	}
	step(3, `Gitee 镜像（${giteeSlug}）`);
	if (DRY) {
		ok('（dry-run）将推送 main → 建 release → 传三件套 → 验收');
		return;
	}
	const authed = `https://${giteeSlug.split('/')[0]}:${token}@gitee.com/${giteeSlug}.git`;

	const push = await withRetry('Gitee 推送 main', () =>
		run('git', ['-c', 'credential.helper=', 'push', authed, 'main:main'], {
			env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
		}),
	);
	if (push.code !== 0) fail(`Gitee 推送 main 失败：${(push.stdout + push.stderr).replaceAll(token, '***').trim()}`);
	ok('main 已推送');
	mark('Gitee 推送 main');

	// payload 走临时文件 + 令牌走 query —— 两条实证过的坑（见 DEBUGLOG / 记忆）
	const api = `https://gitee.com/api/v5/repos/${giteeSlug}`;
	const giteeJson = (args) => {
		try {
			return JSON.parse(run('curl', ['-s', ...args]).stdout || '{}');
		} catch {
			return {};
		}
	};

	// 幂等：已存在则跳过创建，只补缺失附件
	let exist = giteeJson([`${api}/releases/tags/${version}?access_token=${token}`]);
	let releaseId = exist?.id ? String(exist.id) : null;
	if (releaseId) {
		ok(`Gitee release 已存在（id=${releaseId}），跳过创建`);
	} else {
		const payload = tmpFile('gitee.json', JSON.stringify({ tag_name: version, name: version, body, target_commitish: 'main' }));
		const created = await withRetry(
			'Gitee 建 release',
			() =>
				run('curl', [
					'-s',
					'-X',
					'POST',
					`${api}/releases?access_token=${token}`,
					'-H',
					'Content-Type: application/json',
					'--data-binary',
					`@${payload}`,
				]),
			(r) => r.code === 0 && /"id"\s*:/.test(r.stdout),
		);
		try {
			exist = JSON.parse(created.stdout || '{}');
		} catch {
			exist = {};
		}
		if (exist?.message) fail(`Gitee 建 release 失败：${exist.message}（令牌须走 query 参数）`);
		if (!exist?.id) fail(`Gitee 建 release 返回不可解析：${(created.stdout || created.stderr).slice(0, 160)}`);
		releaseId = String(exist.id);
		ok(`release 已创建（id=${releaseId}）`);
		mark('Gitee 创建 release');
	}

	const have = new Set((exist.assets ?? []).map((a) => a.name));
	for (const f of ['main.js', 'manifest.json', 'styles.css']) {
		if (have.has(f)) {
			ok(`附件已就绪：${f}`);
			continue;
		}
		const upRaw = await withRetry(
			`Gitee 上传 ${f}`,
			() =>
				run('curl', [
					'-s',
					'-X',
					'POST',
					`${api}/releases/${releaseId}/attach_files?access_token=${token}`,
					'-F',
					`file=@${join(ROOT, f)}`,
				]),
			(r) => r.code === 0 && /"name"\s*:/.test(r.stdout),
		);
		let up = {};
		try {
			up = JSON.parse(upRaw.stdout || '{}');
		} catch {
			up = {};
		}
		if (!up.name) fail(`Gitee 上传 ${f} 失败：${(upRaw.stdout || upRaw.stderr).slice(0, 160)}`);
		ok(`已上传附件：${up.name}`);
		mark(`Gitee 上传 ${f}`);
	}

	const verify = run('curl', ['-s', `${api}/releases/tags/${version}?access_token=${token}`]);
	const vj = JSON.parse(verify.stdout);
	if (vj.tag_name !== version) fail(`Gitee 验收失败：${verify.stdout.slice(0, 160)}`);
	ok(`Gitee 验收通过：tag=${vj.tag_name} target=${(vj.target_commitish ?? '').slice(0, 7)}`);
	mark('Gitee 验收通过');
}

/* ────────────────────────── 主流程 ────────────────────────── */

try {
	const body = await preflight();
	await githubRelease(body);
	await giteeMirror(body);
	step('完成', `MDRazor ${version} 发布流程结束${DRY ? '（dry-run）' : ''}`);
	if (!DRY) log(`   已完成：\n   - ${done.join('\n   - ')}`);
	cleanup();
} catch (err) {
	fail(`未预期错误：${err?.stack ?? err}`);
}
