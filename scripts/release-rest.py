#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MDRazor — 发版脚本（GitHub REST API 主链 + Gitee 镜像）

用法：`python scripts/release-rest.py <版本号> [--push] [--dry-run] [--no-build] [--skip-gitee]`
（例：`python scripts/release-rest.py 2.7.1 --push`）

**为什么有 Python 版**：本机（Windows 会话环境）**Node 无法 spawn 任何外部程序**
（`execFileSync('git'|'bash'|'cmd')` 一律 `EBUSY`），而 `scripts/release-rest.mjs`
全程 spawn git/gh/npm → 整条链路必挂。**Python 可以 spawn**，故发版走本文件。
逻辑与 `.mjs` 逐条对齐（含硬性规则与验收判据）；**改一处请同步另一处**。

硬性规则（与 .mjs 一致，无法绕过）：
  - **不推 git tag、不单独建 tag**：tag 由 release API 自动创建（无 `v` 前缀）；
  - **验收只用「草稿不可寻址」的两个端点**：`GET /releases/tags/<ver>` 与
    `GET /releases/latest`，两者都返回该版本且 draft=false 才算成功；
    `GET /releases`（列表）在本机网络路径上会命中陈旧缓存，禁止用于判断；
  - 写接口（POST/PATCH/uploads）遇到 5xx / TLS / EOF 一律退避重试；
    422 already_exists 转「校验并补发布」分支，不另起炉灶。

步骤：
  0. 预检：版本四处一致 + CHANGELOG 有对应版本节 + 工作区干净 +
     远端 main == 本地 HEAD（可 --push 自动推）+ 三件套产物存在（默认先 build）
  1. GitHub：创建/校验 release → 草稿则补发布 → 上传缺失资产 → 双端点验收
  2. Gitee 镜像（GITEE_TOKEN 存在时；可 --skip-gitee）：推 main → 建 release
     （令牌走 query 参数、payload 走临时文件——两条实证过的坑）→ 传附件 → 验收

git 通道回退（github.com:443 时段性阻断时）：
  `github.com:443` 被阻断时 `git push` / `git ls-remote` 全挂，但 `api.github.com`
  通常仍可用。此时预检改经 API 读远端 main，--push 改走 REST API
  （blobs → tree → commit → PATCH ref，见 push_via_api）；commit 用本地提交元数据
  重建（SHA 与本地逐字节相同），并以「tree / commit 与本地一致」两道闸门把关，
  不过就停 —— 绝不发错东西。

任何一步失败都会打印「已完成到哪一步」并非零退出；脚本幂等，可反复运行。
本文件是开发/发版工具，不参与插件构建（esbuild 只打包 src/main.ts），
不进 main.js、不是发布资产，与 Obsidian 社区插件审核无关。
"""

import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DONE = []
TMP_DIR = None
ASSETS = ["main.js", "manifest.json", "styles.css"]


# ────────────────────────── 基础工具 ──────────────────────────


def log(msg):
    print(msg, flush=True)


def step(n, msg):
    log("\n── %s. %s" % (n, msg))


def ok(msg):
    log("   ✓ %s" % msg)


def mark(text):
    DONE.append(text)


def cleanup():
    global TMP_DIR
    if TMP_DIR and os.path.isdir(TMP_DIR):
        shutil.rmtree(TMP_DIR, ignore_errors=True)


def fail(msg):
    log("\n✗ %s" % msg)
    if DONE:
        log("已完成步骤：\n  - %s" % "\n  - ".join(DONE))
    cleanup()
    sys.exit(1)


def tmp_file(name, content, binary=False):
    global TMP_DIR
    if TMP_DIR is None:
        TMP_DIR = tempfile.mkdtemp(prefix="mdrazor-release-")
    path = os.path.join(TMP_DIR, name)
    mode = "wb" if binary else "w"
    kwargs = {} if binary else {"encoding": "utf-8", "newline": ""}
    with open(path, mode, **kwargs) as fh:
        fh.write(content)
    return path


def run(cmd, args, env=None):
    """运行命令；返回 (code, stdout, stderr)，不抛异常。"""
    try:
        proc = subprocess.run(
            [cmd] + args,
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
        )
        return (
            proc.returncode,
            proc.stdout.decode("utf-8", "replace"),
            proc.stderr.decode("utf-8", "replace"),
        )
    except FileNotFoundError as exc:
        return 127, "", str(exc)
    except OSError as exc:
        return 1, "", str(exc)


RETRYABLE_RE = re.compile(
    r"HTTP/2(?:\.0)? 5\d\d|HTTP 5\d\d|TLS handshake|TLS connect|SSL|timed out|timeout|"
    r"EOF|connection (reset|refused)|Failed to connect|RPC failed|"
    r"unexpected end of JSON input|Internal Server Error|Empty reply from server",
    re.I,
)


def retryable(text):
    return bool(RETRYABLE_RE.search(text or ""))


def with_retry(label, do_call, is_done=None, attempts=8):
    """带退避重试地执行一次写调用；do_call() 返回 (code, stdout, stderr)。"""
    if is_done is None:
        is_done = lambda r: r[0] == 0  # noqa: E731
    result = None
    for i in range(1, attempts + 1):
        result = do_call()
        if is_done(result):
            return result
        text = "%s\n%s" % (result[1], result[2])
        if i < attempts and retryable(text):
            wait = min(15 * i, 60)
            log("   … %s 第 %d 次失败（服务端/网络异常），%ds 后重试" % (label, i, wait))
            time.sleep(wait)
            continue
        return result
    return result


def read_text(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        return fh.read()


def read_bytes(rel):
    with open(os.path.join(ROOT, rel), "rb") as fh:
        return fh.read()


def read_json(rel):
    return json.loads(read_text(rel))


# ────────────────────────── 参数与预检 ──────────────────────────


argv = sys.argv[1:]
FLAGS = {a for a in argv if a.startswith("--")}
VERSION_ARG = next((a for a in argv if not a.startswith("--")), None)
DRY = "--dry-run" in FLAGS
NO_BUILD = "--no-build" in FLAGS
DO_PUSH = "--push" in FLAGS
SKIP_GITEE = "--skip-gitee" in FLAGS

MANIFEST = read_json("manifest.json")
VERSION = VERSION_ARG or MANIFEST["version"]
if not re.match(r"^\d+\.\d+\.\d+$", VERSION):
    fail("版本号格式不正确：%s（应形如 2.7.1）" % VERSION)


def remote_slug(name):
    code, out, _ = run("git", ["remote", "get-url", name])
    if code != 0:
        return None
    m = re.search(r"github\.com[:/]([^/]+)/([^/.]+?)(?:\.git)?$", out.strip()) or re.search(
        r"gitee\.com[:/]([^/]+)/([^/.]+?)(?:\.git)?$", out.strip()
    )
    return "%s/%s" % (m.group(1), m.group(2)) if m else None


GH_SLUG = remote_slug("origin") or fail("无法从 origin 远端解析 owner/repo")
GITEE_SLUG = remote_slug("gitee")
GITEE_TOKEN = os.environ.get("GITEE_TOKEN")


def build_body():
    """从 CHANGELOG.md 生成 release body（与既有发版惯例一致）。"""
    s = read_text("CHANGELOG.md")
    start = s.find("**%s**" % VERSION)
    if start < 0:
        return None
    nxt = s.find("\n\n**", start + 1)
    sec = s[start:] if nxt < 0 else s[start:nxt]
    out = re.sub(r"^\*\*(.+?)\*\*", lambda m: "## " + m.group(1), sec, count=1, flags=re.M)
    out = re.sub(r"^\*\*(.+?)\*\*$", lambda m: "### " + m.group(1), out, flags=re.M)
    out = out.replace("**", "")
    return (
        out.rstrip()
        + "\n\n---\n\n完整更新记录:[CHANGELOG.md](https://github.com/%s/blob/main/CHANGELOG.md)"
        " / [CHANGELOG.en.md](https://github.com/%s/blob/main/CHANGELOG.en.md)\n" % (GH_SLUG, GH_SLUG)
    )


# ────────────────────────── GitHub REST API 通道 ──────────────────────────


def gh_api(method, path, payload=None, raw_url=None):
    """gh api 调用（失败抛错；payload 走临时文件，避免中文/引号被 shell 拆坏）。"""
    if raw_url:
        args = ["api", "-X", method, raw_url]
    else:
        args = ["api", "-X", method, "repos/%s/%s" % (GH_SLUG, path)]
    if payload is not None:
        path_json = tmp_file("api-%s.json" % os.urandom(4).hex(), json.dumps(payload, ensure_ascii=False))
        args += ["--input", path_json]
    code, out, err = run("gh", args)
    if code != 0:
        raise RuntimeError("gh api %s %s 失败：%s" % (method, path, (out + err).strip()[:300]))
    try:
        return json.loads(out or "{}")
    except ValueError:
        raise RuntimeError("gh api %s %s 返回不可解析：%s" % (method, path, (out or "")[:200]))


def gh_json_parse(args):
    """gh api → 解析 JSON（失败返回 None）。
    调用方一律不传 --jq —— jq 过滤器里的 \\(...) 在 JS 字符串中反斜杠会被吃掉，
    过滤器变为非法且 gh 静默失败（探测已存在资产时踩过：会导致重复上传同名资产）。"""
    code, out, _ = run("gh", ["api"] + args)
    if code != 0:
        return None
    try:
        return json.loads(out)
    except ValueError:
        return None


def remote_branch_sha(branch):
    try:
        return (gh_api("GET", "git/ref/heads/%s" % branch) or {}).get("object", {}).get("sha")
    except Exception:
        return None


def push_via_api(branch):
    """经 REST API 把本地 HEAD 推到远端分支（git push 的替代）。"""

    def git_out(args):
        return run("git", args)[1].strip()

    head_sha = git_out(["rev-parse", "HEAD"])
    parent_sha = remote_branch_sha(branch) or git_out(["rev-parse", "origin/%s" % branch])
    if not parent_sha:
        raise RuntimeError("无法确定远端 %s 的父提交" % branch)

    files = [f for f in git_out(["diff", "--name-only", parent_sha, head_sha]).split("\n") if f]
    if not files:
        prev = git_out(["rev-parse", "HEAD~1"])
        files = [f for f in git_out(["diff", "--name-only", prev, head_sha]).split("\n") if f]
    if not files:
        raise RuntimeError("没有可上传的改动文件")

    # 行尾：以仓库（索引）里的行尾为准（`i/` 列），只把 i/lf 的工作区 CRLF 归一。
    # ⚠️ `--eol` 输出用**制表符**分隔，正则必须用 \s（按空格写会静默解析出 0 条）。
    eol_map = {}
    for line in run("git", ["ls-files", "--eol"] + files)[1].split("\n"):
        m = re.match(r"^(i/\S+)\s+w/\S+\s+\S+\s+(.+)$", line)
        if m:
            eol_map[m.group(2)] = m.group(1)

    entries = []
    for f in files:
        data = read_bytes(f)
        repo_eol = eol_map.get(f, "i/lf")
        if b"\x00" not in data and repo_eol == "i/lf" and b"\r" in data:
            data = data.replace(b"\r\n", b"\n")
        blob = gh_api("POST", "git/blobs", {"content": base64.b64encode(data).decode("ascii"), "encoding": "base64"})
        entries.append({"path": f, "mode": "100644", "type": "blob", "sha": blob["sha"]})

    parent_tree = (gh_api("GET", "git/commits/%s" % parent_sha) or {}).get("tree", {}).get("sha")
    if not parent_tree:
        raise RuntimeError("读不到父提交 %s 的 tree" % parent_sha[:7])
    tree = gh_api("POST", "git/trees", {"base_tree": parent_tree, "tree": entries})
    local_tree = git_out(["rev-parse", "HEAD^{tree}"])
    if tree["sha"] != local_tree:
        raise RuntimeError(
            "tree 闸门未过（API %s ≠ 本地 %s）—— 行尾/文件集不一致，已停止，未推送" % (tree["sha"], local_tree)
        )

    # `git log -1 --format=%B` 的 stdout 比真实 message 多一个换行（git log 的分隔符）；
    # 真实 message 末尾本身有一个 \n → 只去掉多余的那一个（rstrip 会把真实的也去掉，SHA 不符）
    msg = run("git", ["log", "-1", "--format=%B"])[1]
    if msg.endswith("\n"):
        msg = msg[:-1]

    def g(fmt):
        return git_out(["log", "-1", "--format=" + fmt])

    commit = gh_api(
        "POST",
        "git/commits",
        {
            "message": msg,
            "tree": tree["sha"],
            "parents": [parent_sha],
            "author": {"name": g("%an"), "email": g("%ae"), "date": g("%aI")},
            "committer": {"name": g("%cn"), "email": g("%ce"), "date": g("%cI")},
        },
    )
    if commit["sha"] != head_sha:
        raise RuntimeError(
            "commit 闸门未过（API %s ≠ 本地 %s）—— 提交元数据不一致，已停止，未推送" % (commit["sha"], head_sha)
        )

    gh_api("PATCH", "git/refs/heads/%s" % branch, {"sha": commit["sha"], "force": False})
    # 本地 origin/<branch> 同步到该提交（github.com 不通，无法 fetch）
    run("git", ["update-ref", "refs/remotes/origin/%s" % branch, commit["sha"]])


def list_all_releases(max_pages=4):
    """分页拉全量 release（列表接口可能命中缓存，仅用于「找草稿」这类修复性分支）。"""
    all_rel = []
    for page in range(1, max_pages + 1):
        arr = gh_json_parse(["repos/%s/releases?per_page=100&page=%d" % (GH_SLUG, page)])
        if not isinstance(arr, list):
            break
        all_rel += arr
        if len(arr) < 100:
            break
    return all_rel


def find_release_by_tag():
    """查询 release（草稿不可按 tag 寻址，故 tag 查询失败时在列表中找草稿）。"""
    by_tag = gh_json_parse(["repos/%s/releases/tags/%s" % (GH_SLUG, VERSION)])
    if by_tag and by_tag.get("id"):
        return {"id": str(by_tag["id"]), "draft": by_tag.get("draft") is True}
    for rel in list_all_releases():
        if rel.get("tag_name") == VERSION:
            return {"id": str(rel["id"]), "draft": rel.get("draft") is True}
    return None


def preflight():
    step(0, "预检（版本 %s%s）" % (VERSION, "，dry-run" if DRY else ""))

    lock = read_text("package-lock.json")
    lock_count = len(re.findall(r'"version": "%s"' % re.escape(VERSION), lock))
    versions = read_json("versions.json")
    checks = [
        ("manifest.json", MANIFEST["version"] == VERSION),
        ("package.json", read_json("package.json")["version"] == VERSION),
        ("package-lock.json（根 + packages.\"\" 两处）", lock_count == 2),
        ('versions.json 含 "%s"' % VERSION, VERSION in versions),
    ]
    for name, passed in checks:
        if not passed:
            fail("版本号未对齐：%s（四处必须全部为 %s）" % (name, VERSION))
        ok("版本对齐：%s" % name)

    body = build_body()
    if not body:
        fail('CHANGELOG.md 中找不到 "**%s**" 版本节（先把「未发布」归档为该版本）' % VERSION)
    ok("CHANGELOG.md 有对应版本节")

    status = run("git", ["status", "--porcelain"])[1].strip()
    if status:
        fail("工作区不干净，先提交：\n%s" % status)
    ok("工作区干净")

    head = run("git", ["rev-parse", "HEAD"])[1].strip()
    ls_remote = run("git", ["ls-remote", "origin", "refs/heads/main"])
    remote_main = ""
    if ls_remote[0] == 0:
        parts = ls_remote[1].strip().split()
        remote_main = parts[0] if parts else ""
    if not remote_main:
        remote_main = remote_branch_sha("main") or ""
        if remote_main:
            ok("git 通道不可用，经 API 读到远端 main = %s" % remote_main[:7])
    if remote_main != head:
        if DO_PUSH and not DRY:
            log("   远端 main 与本地不一致，--push 生效：推送 main…")
            pushed = run(
                "git",
                ["-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential", "push", "origin", "main"],
                env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
            )
            if pushed[0] == 0:
                ok("已推送 main（git 通道）")
            else:
                why = (pushed[2] or pushed[1]).strip().split("\n")[-1][:120]
                log("   git push 失败（%s），改走 GitHub REST API…" % why)
                push_via_api("main")
                ok("已推送 main（REST API：blobs → tree → commit → PATCH ref）")
            mark("推送 main")
        else:
            fail(
                "远端 main(%s) 与本地 HEAD(%s) 不一致。\n   先推送（或加 --push）"
                % (remote_main[:7] or "空", head[:7])
            )
    else:
        ok("远端 main == 本地 HEAD（%s）" % head[:7])

    if not NO_BUILD and not DRY:
        log("   重建产物（tsc + esbuild）…")
        node = shutil.which("node") or fail("PATH 里找不到 node，无法构建（可加 --no-build 跳过）")
        tsc = run(node, ["node_modules/typescript/bin/tsc", "-noEmit", "-skipLibCheck"])
        if tsc[0] != 0:
            fail("tsc 未通过：\n%s\n%s" % (tsc[1], tsc[2]))
        build = run(node, ["esbuild.config.mjs", "production"])
        if build[0] != 0:
            fail("构建失败：\n%s\n%s" % (build[1], build[2]))
        ok("构建通过（tsc + esbuild）")
        mark("构建")

    for f in ASSETS:
        if not os.path.exists(os.path.join(ROOT, f)):
            fail("缺少发布资产：%s" % f)
    ok("三件套产物存在（main.js / manifest.json / styles.css）")

    return body


# ────────────────────────── GitHub 主链 ──────────────────────────


def github_release(body):
    step(1, "GitHub release（api.github.com，tag=%s，无 v 前缀）" % VERSION)

    rel = find_release_by_tag()
    if rel:
        ok("已存在 release（id=%s%s）" % (rel["id"], "，草稿" if rel["draft"] else "，已发布"))
    elif DRY:
        ok("（dry-run）将创建 release：tag=%s target=main draft=false" % VERSION)
    else:
        payload = tmp_file(
            "release.json",
            json.dumps(
                {"tag_name": VERSION, "target_commitish": "main", "name": VERSION, "body": body, "draft": False},
                ensure_ascii=False,
            ),
        )
        r = with_retry(
            "创建 release",
            lambda: run("gh", ["api", "-X", "POST", "repos/%s/releases" % GH_SLUG, "--input", payload]),
            lambda res: res[0] == 0 or "already_exists" in (res[1] + res[2]),
        )
        text = r[1] + r[2]
        if r[0] != 0 and "already_exists" not in text:
            fail("创建 release 失败：%s" % text.strip())
        if "already_exists" in text:
            ok("POST 返回 already_exists —— 转入校验/补发布分支")
        else:
            ok("release 已创建（tag 由 API 自动创建）")
        mark("GitHub 创建 release")
        rel = find_release_by_tag()

    if rel and rel["draft"]:
        if DRY:
            ok("（dry-run）release 是草稿，将 PATCH draft=false 补发布")
        else:
            payload = tmp_file(
                "publish.json",
                json.dumps({"name": VERSION, "body": body, "draft": False, "prerelease": False}, ensure_ascii=False),
            )
            r = with_retry(
                "发布 release",
                lambda: run(
                    "gh",
                    ["api", "-X", "PATCH", "repos/%s/releases/%s" % (GH_SLUG, rel["id"]), "--input", payload],
                ),
            )
            if r[0] != 0:
                fail("补发布失败：%s" % (r[1] + r[2]).strip())
            ok("草稿已发布（PATCH draft=false）")
            mark("GitHub 补发布草稿")

    if rel:
        assets = gh_json_parse(["repos/%s/releases/%s/assets?per_page=100" % (GH_SLUG, rel["id"])]) or []
        existing = {"%s:%s" % (a["name"], a["size"]) for a in assets}
        for f in ASSETS:
            size = str(len(read_bytes(f)))
            if "%s:%s" % (f, size) in existing:
                ok("资产已就绪：%s (%s)" % (f, size))
                continue
            if DRY:
                ok("（dry-run）将上传资产：%s (%s)" % (f, size))
                continue
            up = with_retry(
                "上传 %s" % f,
                lambda f=f: run(
                    "gh",
                    [
                        "api",
                        "-X",
                        "POST",
                        "-H",
                        "Content-Type: application/octet-stream",
                        "https://uploads.github.com/repos/%s/releases/%s/assets?name=%s" % (GH_SLUG, rel["id"], f),
                        "--input",
                        os.path.join(ROOT, f),
                    ],
                ),
            )
            if up[0] != 0:
                fail("上传 %s 失败：%s" % (f, (up[1] + up[2]).strip()))
            ok("已上传资产：%s (%s)" % (f, size))
            mark("GitHub 上传 %s" % f)

    step(2, "验收（仅用草稿不可寻址的两个端点）")
    if DRY:
        log("   （dry-run 跳过在线验收；正式运行会断言 by-tag 与 latest 均为该版本且 draft=false）")
        return

    def published(r):
        return bool(r) and r.get("tag_name") == VERSION and r.get("draft") is False

    by_tag = None
    for i in range(1, 5):
        by_tag = gh_json_parse(["repos/%s/releases/tags/%s" % (GH_SLUG, VERSION)])
        if published(by_tag):
            break
        if i < 4:
            log("   … 验收 by-tag 第 %d 次未就绪，重试" % i)
            time.sleep(5 * i)
    if not published(by_tag):
        fail(
            "验收失败：/releases/tags/%s 未返回已发布状态（%s）"
            % (VERSION, "draft=%s" % by_tag.get("draft") if by_tag else "查询失败")
        )
    ok("by-tag %s：已发布 ✓" % VERSION)

    latest = None
    for i in range(1, 5):
        latest = gh_json_parse(["repos/%s/releases/latest" % GH_SLUG])
        if published(latest):
            break
        if i < 4:
            log("   … 验收 latest 第 %d 次未就绪，重试" % i)
            time.sleep(5 * i)
    if not published(latest):
        fail(
            "验收失败：/releases/latest 返回 %s（应为 %s，草稿不计）"
            % ((latest or {}).get("tag_name") or "（查询失败）", VERSION)
        )
    ok("latest %s：已发布 ✓" % VERSION)
    mark("GitHub 双端点验收通过")
    log("   https://github.com/%s/releases/tag/%s" % (GH_SLUG, VERSION))


# ────────────────────────── Gitee 镜像（可选） ──────────────────────────


def gitee_mirror(body):
    token = GITEE_TOKEN
    if SKIP_GITEE or not token or not GITEE_SLUG:
        step(3, "Gitee 镜像：跳过")
        log(
            "   （--skip-gitee）"
            if SKIP_GITEE
            else ("   （未配置 gitee 远端）" if not GITEE_SLUG else "   （未设置 GITEE_TOKEN 环境变量；设好后重跑本脚本即可补发布镜像）")
        )
        return
    step(3, "Gitee 镜像（%s）" % GITEE_SLUG)
    if DRY:
        ok("（dry-run）将推送 main → 建 release → 传三件套 → 验收")
        return

    owner = GITEE_SLUG.split("/")[0]
    authed = "https://%s:%s@gitee.com/%s.git" % (owner, token, GITEE_SLUG)

    pushed = with_retry(
        "Gitee 推送 main",
        lambda: run("git", ["-c", "credential.helper=", "push", authed, "main:main"], env={**os.environ, "GIT_TERMINAL_PROMPT": "0"}),
    )
    if pushed[0] != 0:
        fail("Gitee 推送 main 失败：%s" % (pushed[1] + pushed[2]).replace(token, "***").strip())
    ok("main 已推送")
    mark("Gitee 推送 main")

    api = "https://gitee.com/api/v5/repos/%s" % GITEE_SLUG

    def gitee_json(args):
        code, out, _ = run("curl", ["-s"] + args)
        try:
            return json.loads(out or "{}")
        except ValueError:
            return {}

    # 幂等：已存在则跳过创建，只补缺失附件
    # ⚠️ Gitee 的 GET /releases/tags/<tag> 在 release 不存在时返回 JSON `null`（不是 {}、不是 404）
    exist = gitee_json(["%s/releases/tags/%s?access_token=%s" % (api, VERSION, token)]) or {}
    release_id = str(exist["id"]) if exist.get("id") else None
    if release_id:
        ok("Gitee release 已存在（id=%s），跳过创建" % release_id)
    else:
        payload = tmp_file(
            "gitee.json",
            json.dumps({"tag_name": VERSION, "name": VERSION, "body": body, "target_commitish": "main"}, ensure_ascii=False),
        )
        created = with_retry(
            "Gitee 建 release",
            lambda: run(
                "curl",
                ["-s", "-X", "POST", "%s/releases?access_token=%s" % (api, token), "-H", "Content-Type: application/json", "--data-binary", "@" + payload],
            ),
            lambda r: r[0] == 0 and re.search(r'"id"\s*:', r[1] or ""),
        )
        try:
            exist = json.loads(created[1] or "{}")
        except ValueError:
            exist = {}
        if exist.get("message"):
            fail("Gitee 建 release 失败：%s（令牌须走 query 参数）" % exist["message"])
        if not exist.get("id"):
            fail("Gitee 建 release 返回不可解析：%s" % (created[1] or created[2])[:160])
        release_id = str(exist["id"])
        ok("release 已创建（id=%s）" % release_id)
        mark("Gitee 创建 release")

    have = {a.get("name") for a in (exist.get("assets") or [])}
    for f in ASSETS:
        if f in have:
            ok("附件已就绪：%s" % f)
            continue
        up_raw = with_retry(
            "Gitee 上传 %s" % f,
            lambda f=f: run(
                "curl",
                ["-s", "-X", "POST", "%s/releases/%s/attach_files?access_token=%s" % (api, release_id, token), "-F", "file=@" + os.path.join(ROOT, f)],
            ),
            lambda r: r[0] == 0 and re.search(r'"name"\s*:', r[1] or ""),
        )
        try:
            up = json.loads(up_raw[1] or "{}")
        except ValueError:
            up = {}
        if not up.get("name"):
            fail("Gitee 上传 %s 失败：%s" % (f, (up_raw[1] or up_raw[2])[:160]))
        ok("已上传附件：%s" % up["name"])
        mark("Gitee 上传 %s" % f)

    verify = gitee_json(["%s/releases/tags/%s?access_token=%s" % (api, VERSION, token)]) or {}
    if verify.get("tag_name") != VERSION:
        fail("Gitee 验收失败：%s" % json.dumps(verify, ensure_ascii=False)[:160])
    ok("Gitee 验收通过：tag=%s target=%s" % (verify["tag_name"], (verify.get("target_commitish") or "")[:7]))
    mark("Gitee 验收通过")


# ────────────────────────── 主流程 ──────────────────────────

try:
    BODY = preflight()
    github_release(BODY)
    gitee_mirror(BODY)
    step("完成", "MDRazor %s 发布流程结束%s" % (VERSION, "（dry-run）" if DRY else ""))
    if not DRY:
        log("   已完成：\n   - %s" % "\n   - ".join(DONE))
    cleanup()
except SystemExit:
    raise
except Exception as exc:  # noqa: BLE001
    import traceback

    fail("未预期错误：%s" % traceback.format_exc())
