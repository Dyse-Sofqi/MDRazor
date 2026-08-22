# MDRazor 开发日志（DEBUGLOG）

记录功能构建与错误修复的技术细节：根因、架构决策、排查过程。面向开发者。

---

## 2.4.9 (2026-08-23)

### 左功能区/状态栏/右键菜单：统一命令管理与隐藏

**需求：** 左功能区、状态栏、右键菜单复用「自定义命令 + 隐藏命令」；并检测 Obsidian 原生/插件注册的现有命令。

**实现位置：**
- `src/controller/ribbon-manager/ribbon-manager.ts`
- `src/controller/command-surface/command-surface.ts`
- `src/view/ribbon-customization.ts`、`src/view/command-surface-view.ts`
- `src/view/ribbon-command-wizard.ts`
- `src/model/settings.ts`

**避坑记录：**

1. **功能区检测勿用 DOM 类名扫描** — 左功能区真实数据源是 `app.workspace.leftRibbon.items`（`{icon,title,buttonEl}`），`querySelector('.ribbon-item')` 扫不到 Obsidian 原生/插件条目。
2. **状态栏检测须用 `app.statusBar.containerEl`** — `app.statusBar.containerEl` 才是状态栏真实容器，扫描 `.status-bar` 会漏掉原生/插件状态栏命令；其子元素类名为 `.status-bar-item`。
3. **右键菜单是临时构建，没有常驻 DOM** — 通过包装 `Menu.prototype.addItem` 在菜单构建时记录原生/插件菜单项，并读取 `item.dom` / `data-section` 捕获 section 层级。
4. **包装 `Menu.addItem` 必须保留实例 `this`** — 曾把原方法 `bind(Menu.prototype)` 后调用，导致菜单内部 `this` 错误、右键菜单完全无法呼出。正确写法是 `originalAddItem.call(this, ...)`，修复后菜单正常。
5. **隐藏状态重启/拖拽失效** — 仅设置变更时应用隐藏不够：Obsidian 会在重启后补载、拖拽后重建功能区/状态栏 DOM。需配合 `workspace.onLayoutReady()`、1 秒兜底刷新与 `MutationObserver`（回调延迟到下一轮，等 `leftRibbon.items`/状态栏容器同步后再应用）。
6. **图标列表要读取当前版本全量** — 低版本静态列表不完整；Obsidian 1.7.3+ 应使用官方 `getIconIds()`，旧版本保留完整静态回退列表。
7. **内置菜单项勿重复统计** — 右键菜单记录器会捕获「展开/折叠同级列表或标题」，而隐藏命令又显式添加同一条内置项；需在展示层按标题去重。
8. **隐藏状态用 `setCssProps` 而非直接 `element.style`** — 新增代码遇到 `no-static-styles-assignment` lint；动态 CSS 用 Obsidian `setCssProps` 或 CSS 类。


## 2.4.8 (2026-08-20)

### 懒加载延迟输入框内联样式 lint 修复

**需求：** 消除 settings-tab.ts 中 `no-static-styles-assignment` lint 报错（延迟输入框宽度）。

**实现位置：** `src/view/settings-tab.ts`（renderLazyPluginList）+ `styles.css`（`.mdrazor-lazy-grid .setting-item .mdrazor-lazy-delay-input`）。

**避坑记录：**

1. **静态内联样式触发 obsidianmd lint 规则 `no-static-styles-assignment`** — 直接用 `element.style.width='60px'` 或 `style.flex='0 0 auto'` 给元素赋固定样式被 eslint-plugin-obsidianmd 拦截。正确做法是 `el.addClass('mdrazor-lazy-delay-input')`，再把对应 rule（`width:60px;flex:0 0 auto`）写进 styles.css，选择器带上 `.mdrazor-lazy-grid .setting-item` 前缀限定作用域。
2. **lint 只报静态赋值** — 若样式值会根据运行时状态动态计算，仍可走 `style.*`；固定值一律 CSS 类。

---

## 2.4.7 (2026-08-20)

### 懒加载启动耗时统计（loadingPluginId 轮询）

**需求：** 精确测量各懒加载社区插件从触发加载到完成（含 onload）的启动耗时，供「立即检查」弹窗按「延迟 x s，启动耗时 x ms」展示；仅统计已启用且延迟>0 的插件。

**实现位置：** `src/controller/lazy-load/startup-check.ts`（`StartupTimingRecorder` + `StartupCheckModal`）、`src/controller/lazy-load/lazy-load.ts`（`enableNow`）、`src/controller/main.ts`（onload 先建 recorder 再 `registerLazyLoad(this,(id)=>this.startupTimings.trackLoad(id))`）。

**避坑记录：**

1. **勿轮询 `app.plugins.plugins[id]` 测加载耗时** — Obsidian 的 `plLoadPlugin` 里 `this.plugins[e]=n` 发生在 `await n.load()`（即 onload）**之前**，轮询 plugins 只能量到 bundle 解析+实例化，各插件实测都约 105ms、与插件实际工作量无关、不可信。应轮询 `app.plugins.loadingPluginId`：它在 enablePlugin→loadPlugin 全程保持当前正在加载的插件 id（**含 onload**），加载完成后置 null。trackLoad 在 enablePlugin 前打 baseStart，然后 ~20ms 轮询，捕捉 loadingPluginId 出现→消失即真实含 onload 的加载窗口。
2. **极快加载会错过窗口** — 若插件在首个轮询间隔内就完成（loadingPluginId 已回 null 且插件实例已出现），退化为 baseStart→plugins[id] 出现的近似值。
3. **打点必须在 enableNow 内触发而非 onload begin()** — 原实现 recorder 在 onload 后创建、采样器对已加载插件统一用 `now-startTs` 计算，导致所有插件显示同一耗时（此前都显示 951ms）的根因。改为由 `enableNow(pluginId)` 在 `enablePlugin` 之前先 `onEnable?.(id)` 打点，仅对 MDRazor 触发加载的插件计算真实耗时，自然加载插件显示「未测量/随启动加载」。
4. **超时与资源释放** — 轮询用 `window.setInterval` 并经 `plugin.registerInterval` 注册，Obsidian 卸载时自动清理；单插件追踪设 60s 超时兜底，避免计时器泄漏。interval 句柄类型用 `ReturnType<typeof window.setInterval>`。
5. **Modal 类型无 addButton** — 当前 obsidian.d.ts 的 `Modal` 未声明 `addButton`（TS2339）。改用 `this.modalEl.createDiv({cls:'modal-button-container'})` + `new ButtonComponent(...).setClass('mod-secondary')` 手工构建底部「复制」/「完成」按钮；复制走 `navigator.clipboard?.writeText` + `new Notice('已复制')`。
6. **访问内部 API 的类型断言** — `app.plugins.plugins/manifests/loadingPluginId` 均未在 obsidian.d.ts 声明，用 `as unknown as` 断言自定义接口（`PluginManagerView{plugins,manifests,loadingPluginId?}`）；遍历时 `manifests[id]` 可能 undefined，先 `const m=...` 缓存再判空，避免 TS2345。
7. **setTooltip 提升 minAppVersion** — 「立即检查」按钮用 `addExtraButton(...).setTooltip(...)`，`setTooltip` 需 Obsidian ≥1.1.0（lint no-unsupported-api），故 minAppVersion 由 1.0.0 提至 1.1.0。

### 懒加载列表 UI

**需求：** 删插件简介、两栏网格、插件名垂直居中美化、内边距 4→12px、启用开关移到延迟框右侧、延迟输入框统一 60px 宽。

**实现位置：** `src/view/settings-tab.ts`（buildLazyLoadSection / renderLazyPluginList）+ `styles.css`（`.mdrazor-lazy-grid` 等）。

**避坑记录：**

1. **两栏网格窄屏要回退** — `.mdrazor-lazy-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 16px;align-items:start}`，`@media(max-width:600px)` 回退 `grid-template-columns:1fr`。
2. **插件名长名防溢出** — `.setting-item-name` 用 `overflow-wrap:anywhere;overflow:hidden;text-overflow:ellipsis`；`.setting-item-info{display:flex;align-items:center;min-width:0;flex:1 1 auto}` 保证列内垂直居中与收缩。
3. **行内边距是`padding:8px 4px`→改`12px`** —— 初始 4px 太贴边，扩大到 12px 防贴边且不破坏网格对齐。

---

## 2.4.3 (2026-08-13)

### 位置持久化：缓存读写格式不一致 + 文件夹重命名同步

**需求：** 1) 位置缓存跨会话恢复失效（每次启动清空）；2) 文件列表文件夹重命名时同步 position-cache.json 中旧路径。

**实现位置：** `src/controller/tab-enhancer/position-persistence.ts` — `loadCache` 读端兼容、`rewriteFolderPrefix` 新增、`registerPositionPersistence` 注册 `vault.on('rename')`。

**避坑记录：**

1. **落盘与载入格式必须同源** — `flushDisk` 直接 `JSON.stringify(cache)`（`Record<path, record>` 平铺），`loadCache` 原读 `data.positions`（期望 `{positions:{}}` 包裹）。写平铺读包裹 → 每次加载 `cache={}`：跨会话全失效、prune 不跑、后续重命名改写也空转。修读端兼容两格式（`'positions' in raw` 探测），不动写端。
2. **前缀改写拼接必须补回分隔符** — 前缀用 `oldPath + '/'`，`key.slice(prefix.length)` 取到不含 `/` 的后缀，拼回必须 `newPath + '/' + suffix`。原实现 `newPath + suffix` 直接丢分隔符（`test1/2234` + `MDRazor简介.md` → 脏键 `test1/2234MDRazor简介.md`）。Obsidian 同名重命名（旧=新）也触发 rename 事件，须 `oldPath === newPath` 提前 return。
3. **TS noUncheckedIndexedAccess** — `cache[key]` 类型 `T | undefined`，先 `const rec = cache[key]; if (!rec) continue;` 再赋值，否则 TS2322。
4. **脏键自愈无需额外逻辑** — `loadCache` 的 prune 遍历删掉 vault 中不存在的路径，重载后自动清掉脏键（如 `test1/2234MDRazor简介.md`）。
5. **重命名事件模型** — 文件夹重命名触发 folder 事件 + 子树各文件 rename 事件。处理器只认 `file instanceof TFolder`，子文件 TFile 事件跳过；folder 事件一次改写整个子树，天然无重复处理。
6. **前缀匹配勿误伤同名前缀** — 用 `key.startsWith(oldPath + '/')` 而非 `key.startsWith(oldPath)`，`test1/2234x/...` 不会被 `test1/2234` 的改写波及。

### 滚轴同步（选项聚焦滚动居中）

**需求：** 选项聚焦折叠/展开后，光标所在行滚动至屏幕中央，避免长列表伸缩把光标带出视图。

**实现位置：** `src/controller/list-enhancer/focus-options.ts` — `recomputeFolds` / `applyFolds`。

**避坑记录：**

1. **折叠未变化时勿滚动** — 光标在同结构内移动（折叠集合无 diff）不滚动，否则每按一次方向键都居中，剧烈跳动。`applyFolds` 返回 `effects.length > 0` 判断是否实际变化，仅变化时追加滚动。
2. **滚动与折叠同一次 dispatch** — `effects.push(EditorView.scrollIntoView(pos, { y: 'center' }))` 与 foldEffect/unfoldEffect 一起派发，避免二次 update 循环。
3. **TS 数组类型** — `scrollIntoView` 返回 `StateEffect<unknown>`，foldEffect 返回 `StateEffect<DocRange>`，effects 数组须声明为 `Array<StateEffect<unknown>>`，否则 TS2345。

### 上下键进入折叠块（主动展开）

**需求：** CM6 折叠语义下 ↓/↑ 会整块跳过折叠区，光标进不到被折叠的列表项/标题行。改为主动展开折叠块并进入目标行，保持目标列。

**实现位置：** `src/controller/list-enhancer/fold-navigation.ts` — capture 阶段 DOM keydown 拦截（与 enter-soft-break 同模式）。

**避坑记录：**

1. **CM6 垂直移动用 posAtCoords，永不进入 replaced（折叠）范围** — 折叠块被当作单个单位跳过。折叠锚点行（widget 在行末，如列表项折叠 `{from: 项行末, to: 子树末}`）同样被吞。要在目标行满足"折叠锚点落在行内 OR 目标行位于折叠隐藏内容内"时主动拦截。
2. **资格限定列表/标题** — 折叠范围来自 `foldedRanges(state)`（含 Obsidian 原生标题折叠 + 代码块折叠 + 本插件列表折叠）。须过滤：折叠起点所在行（或上一行）是列表项/标题行才处理，代码块折叠保持原生跳过。
3. **目标列** — 用 `sel.goalColumn`（无则当前行字符偏移），新选区经 `EditorSelection.cursor(pos, assoc, bidiLevel, goalColumn)` 写入 goalColumn，后续方向键延续列位。
4. **修饰键不拦截** — Shift（扩展选区）/Alt（移动行）/Ctrl/Meta 组合键 return false 交还原生。
5. **与选项聚焦联动** — 主动展开列表折叠 + 光标落到锚点行后，`recomputeFolds` 以光标为焦点链自然维持展开，无需重复逻辑。

### 设置界面标签页化

**需求：** 四大模块设置过长，改标签页切换；清理失联图片独立为「功能区增强」第五模块。

**实现位置：** `src/view/settings-tab.ts`（`createTabbedSection` + 五个 `build*Section`）+ `styles.css`（`.mdrazor-settings-tabs` 等）。

**避坑记录：**

1. **标签页激活态用 `toggleClass('is-active', ...)`** — Obsidian HTMLElement 扩展，勿手写 classList 替换。
2. **activeTabIndex 实例字段记忆** — `display()` 每次重建 DOM，激活页须存字段而非局部变量，否则重开设置面板跳回第一页。
3. **hideToggles 引用跨标签页仍有效** — 隐藏页 `display:none` 但 DOM 未销毁，状态栏启闭按钮 `syncHideTogglesFromSettings` 反向刷新不受影响。
4. **CSS Safari** — `user-select` 需配 `-webkit-user-select` 前缀，且前缀在前。

---

## 2.4.2 (2026-08-12)

### MD 文档光标和滚轴位置持久化

**需求：** 记录 MD 文档光标+滚动位置，重开文档还原；位置变更 250ms 防抖一次性落盘。

**实现位置：** `src/controller/tab-enhancer/position-persistence.ts` — CM6 ViewPlugin（追踪光标/滚动）+ workspace 叶子定位（路径解析）+ vault adapter 写独立缓存文件 position-cache.json。

**避坑记录：**

1. **路径解析勿依赖 DOM `data-path` 属性** — 该属性归属元素跨 Obsidian 版本不稳定，首版用 `closest('.view-content')` 读 data-path 恒为 null，跟踪/恢复全空转（缓存文件都不生成）。改 `app.workspace.getLeavesOfType('markdown')` 遍历，找 `contentEl.contains(view.dom)` 的叶子读 `view.file.path`，官方 API 可靠。
2. **`manifest.id` ≠ 插件目录名** — id=`md-razor`、目录=`MDRazor`。用 `configDir/plugins/${id}` 拼写路径报 ENOENT。必须用 `plugin.manifest.dir`（文件夹 vault 相对路径）。
3. **恢复时机不可只靠 constructor / docChanged** — Obsidian 常把文档内容直接写进 CM6 初始 state（无 docChanged 事务），`update()` 不触发；叶子复用切换文件时 ViewPlugin 不重建、constructor 不跑。解法：constructor 后 rAF 补一次恢复（此时 DOM 已挂载、路径可解析）+ `update()` 整档替换检测（`isFullDocReplace`，比较变更是否覆盖整篇旧文档）兜底切换场景。
4. **叶子视图切换瞬间 view 不完整** — `leaf.view.contentEl` 可能 undefined，直接 `.contains` 抛 `Cannot read properties of undefined (reading 'contains')`。`instanceof MarkdownView` + 可选链 + try/catch 三连防崩。
5. **滚动恢复需重试** — 长文档布局分帧完成，直接设 `scrollDOM.scrollTop` 会被后续测量覆盖。rAF 校验未到位则重试（≤8 帧）。
6. **路径每次现取** — 同一 ViewPlugin 实例会因叶子复用切换文件，`this.path` 固化会写错记录。每次 `saveNow` 现解析路径。

### 移除：隐藏标记边界点击光标推出

- 删 `format-hider.ts` 的 `correctCursorAfterClick` + `adjustCursor` 及装饰 spec 的 `markerType` 字段（仅该功能在用）。随之清理 3 处无用 `isClose` 解构。
- 不影响：边界提示 tooltip（`getHiddenRanges`）、list-enhancer 各自的独立光标修正。

---

## 2.4.1 (2026-08-10)

### 目录聚焦：首击快捷折叠

**需求：** 二击（同文件夹二次点击）仅 toggle 该文件夹折叠。现新增：首击时若目录折叠状态已与聚焦目标一致，直接执行二击动作（toggle 本文件夹），不再全量规范。

**实现位置：** `src/controller/list-enhancer/dir-focus.ts` — handler else 分支（首击/不同文件夹）。

**流程：**

```text
首击 folder F：
  focusedFolderPath = F.path
  target = computeCollapseStates(F, allPaths)        // keepExpanded(祖先+点击) 展开，余全折叠
  current = getCurrentCollapseStates(...)            // 逐文件夹读当前态
  isAlreadyNormalized(current, target) 全等
    ├─ 是 → item.setCollapsed(!isCollapsed)          // 等同二击
    └─ 否 → processFocus(...)                        // 原全量规范
```

**读取当前折叠态（getCurrentCollapseStates）— 关键避坑：**

1. **主源 DOM `.is-collapsed` class**（`querySelectorAll('.nav-folder')` 单遍收集 path→collapsed）。与二击 toggle 分支信任同一 class，跨版本可靠。
2. **FileItem `.collapsed` 仅兜底** DOM 缺失的文件夹（obsidian-typings 证实 `FolderTreeItem.collapsed: boolean` 存在，但属内部 API）。
3. **仍未知 → 默认 collapsed（true）**。绝不返回 null / bail。

**踩过的坑（v1 实现失败原因）：** 初版优先读 `item.collapsed`，任一文件夹读不到就返回 null → 判「未规范」→ 退回全量 focus。实测场景 A→B→B折叠→点A：此时 B 已折叠，B/C 的子级全为隐藏文件夹，DOM 不可见且 `item.collapsed` 运行时不可靠 → 判 null → 快捷 toggle 永不触发，仍走全量规范。**bail 即失败。**

**为何隐藏文件夹可默认 collapsed：** 隐藏 ⇒ 祖先已折叠 ⇒ 该文件夹必不在 keepExpanded ⇒ 其聚焦目标态必为折叠。默认 true 与规范树相符，且该假设仅在「此前 focus 已规范全树」的常见路径下生效。

**遗留角例（已知限制）：** 隐藏文件夹内部实际展开时（先 focus 该子级 → 折叠其父级 → 再点其他文件夹），默认折叠会误判相符 → toggle 而非 focus。不可见差异，展开该分支后才显现，可接受。

**其他：** 首击 toggle 分支同样设 `focusedFolderPath = path`，后续点击继续走二击逻辑，与真二击行为一致。`isCollapsed` 在 click handler 同步读（DOM 于拦截后未变），RAF 内仅执行 `setCollapsed`。

---

## 2.4.0 (2026-08-09)

### 清理失联图片改造

- **进度提示** — `new Notice(msg, 0)`（duration 0 = 常驻）+ `notice.setMessage()` 原地刷新，扫描结束 `hide()`。禁止连续 `new Notice()` —— 会堆满右侧。
- **确认弹框** — `Modal` 子类 + `contentEl` 构建列表；确认在按钮 `onClick` 内 `this.close()` 后执行，`await vault.trash(file, true)` 逐文件 try/catch 计数，汇总单条 Notice，勿逐文件弹。
- **白名单** — 存 `plugin.settings.orphanImageWhitelist: string[]`（新增 settings 字段，随 `saveData` 全量持久化）。**签名必须收 `MDRazorPlugin` 而非基类 `Plugin`**，否则 `.settings`/`.saveSettings` 编译报错。每次确认用本次未勾选路径**整体替换**白名单 —— 重新勾选即自动解除。
- **缩略图** — `app.vault.getResourcePath(file)` 生成资源 URL。
- **行点击切换勾选** — `tr` click listener 内 `(e.target as HTMLElement).closest('input')` 守卫，避免点 checkbox 自身双重切换。
- **列首全选** — `allCb.indeterminate` 表达半选态；行 `change` 刷新按钮计数 + 列首状态。

### HTML 标签成对隐藏

- `collectPairedHtmlTags(docStr, tagPattern, exclusions?)`：按出现顺序开闭标签配对（`m[0].charAt(1) === '/'` 判闭），`Math.min(opens.length, closes.length)` 取配，多余单边不返回。font/u/span 三个隐藏块统一走它。
- **避坑**：正则须含 `g` 标志；函数内 `tagPattern.lastIndex = 0` 重置，防复用残留。span 在配对**前**用 `collectSpanExclusions` 过滤代码区字面标签。
- 语义：配对基于全文出现顺序，非 DOM/嵌套匹配；单边标签保持可见（正确性优先，误判只多显示不误删）。

### 设置面板折叠

- 状态栏增强此前漏用 `createCollapsibleSection`，子项直接挂 `containerEl`。统一：标题经 `createCollapsibleSection` 返回 wrapper 再挂子 Setting。`mdrazor-collapsed` CSS 已有（styles.css），无需新增。

### 清理失联图片审核修复

- **内联样式 → CSS 类** — `no-static-styles-assignment` 禁止 `el.style.X = ...`。弹框表格样式全部移入 styles.css（`.mdrazor-orphan-table` / `-col-check` / `-col-status` / `-col-thumb` / `-whitelisted` / `-whitelist-badge` / `-thumb`）。动态差异（白名单行半透明）用 `addClass` 控制，不写 style。
- **setDisabled 版本门槛** — `ButtonComponent.setDisabled` 需 Obsidian v1.2.3，minAppVersion 1.0.0 会被 `no-unsupported-api` 拦截。改 `confirmBtn.buttonEl.disabled = count === 0`（DOM 属性，非样式，不触发规则）。
- **Promise 规范** — 弹框 `onConfirm` 回调类型 `(selected, keptPaths) => void | Promise<void>`；调用处 `void this.onConfirm(...)`。否则 async 回调触发 `no-misused-promises`，未 await 的 Promise 触发 `no-floating-promises`。
- **避坑**：`createEl('tag', { cls, text })` 组合属性。th/td 赋值后不引用会触发 `no-unused-vars` —— 不需持有引用时直接调用不赋值。
- 保留 warning：`prefer-file-manager-trash-file`（`trashFile` 需 1.1.x）——minApp 1.0.0 下必须用 `Vault.trash`，勿换。

---

## 2.3.8 (2026-08-09)

### 新增功能：新标签页打开书签

**模块结构**

| 文件 | 职责 |
|---|---|
| `src/controller/tab-enhancer/open-in-tab.ts` | 共享打开重定向模块：补丁 `WorkspaceLeaf.openFile` 与 `Workspace.openLinkText`，提供 `requestOpenInTab(path)` / `requestOpenAnyInTab()` / `initOpenInTab(plugin)` |
| `src/controller/tab-enhancer/bookmark-opener.ts` | 书签视图点击拦截，`registerBookmarkOpener(plugin, enabled)` |
| `src/controller/tab-enhancer/tab-enhancer.ts` | 文件列表点击，改用共享模块 |

**设计决策：拦截原生 click 还是重定向打开？**

文件列表功能原本在 capture 阶段拦截点击并 `stopImmediatePropagation`，自行打开标签页。但这样会连带阻止 Obsidian 原生选择/锚点更新，破坏 Shift+点击范围多选。改为**不拦截原生点击**：让原生 handler 完整执行（选择、锚点、高亮都保留），再用**作用域补丁**把原生打开调用（`WorkspaceLeaf.openFile` / `Workspace.openLinkText`）重定向到增强目标。

补丁安全模型：模块维护 `pendingPath`（路径匹配）与 `pendingAny`（泛化匹配）两个一次性标记，仅当功能 handler 设置了标记且 `Date.now() - ts < 500ms` 时才重定向；其余 `openFile`/`openLinkText` 调用（双链、快速切换、搜索等）原样透传。卸载时恢复原型方法。

**文件列表点击重定向流程**

```
pointerdown/mousedown/click (capture, 文件列表容器)
  → 识别 .nav-file-title + data-path → requestOpenInTab(path)
  → 不 stopPropagation
  → Obsidian 原生 handler 执行（选择 + 锚点更新）
  → 原生调用 openFile(file)
  → 补丁拦截：pendingPath 匹配 → 已有标签页跳转 / 新建标签页
```

**书签点击识别**

- 定位：`.tree-item-self.bookmark.is-clickable`（`.bookmark` class 是书签视图独有，无需依赖 `[data-type="bookmarks"]`）
- 事件：`pointerdown`/`mousedown`/`click` 三事件 capture 于 `app.workspace.containerEl`（与 link-opener 同模式）
- 修饰键豁免：Ctrl/Meta/Shift + 中键/右键 → 原生

### Bug 修复

#### 1. 默认新标签页打开开关切换后不能即时生效

**根因：** `registerTabEnhancer` 开头 `if (!enabled()) return;`。插件加载时开关为关 → 直接 return，click/contextmenu handler 永不挂载。之后设置里开开关 → 仅 settings 对象更新，handler 不存在 → 功能失效直到重载或 layout-change。

**修复：** 删除早期 return，handler 无条件挂载，事件触发时实时读取 `enabled()`（与 link-opener 一致）。vault.create handler 同样有 `enabled()` 运行时检查，无需改动。

#### 2. 文件列表 Shift+点击多选失效

**根因：** 拦截原生 click 时 `stopImmediatePropagation` 把 Obsidian 原生选择逻辑一并阻断，Shift+点击范围多选的锚点（最近一次普通点击的文件）永不更新，范围选取错误或空选。

**修复：** 架构级改动（见上方设计决策）——不再拦截点击，改用 `openFile` 补丁重定向。锚点由原生维护，Shift+点击天然恢复。

**排查记录：** 曾尝试在 click handler 中加 `e.shiftKey` 放行，但锚点本身已损坏，放行无效。最终确认必须让原生普通点击完整执行，而非只放行 Shift。

#### 3. 书签拦截失效（两次排查）

**第一次假设：** 视图类型字符串 `[data-type="bookmarks"]` 可能不对、书签项无 `data-path`、原生不走 `openFile`。遂改为 `.bookmark` class 直接定位 + 同时补丁 `openLinkText`。

**诊断（控制台日志定位）：**

```
[MDRazor-bookmark] pointerdown item= tree-item-self bookmark is-clickable dataPath= 《阅读你的症状》 enabled= true
[MDRazor-openFile] 《阅读你的症状》.md pendingPath= null pendingAny= null
```

**真正根因：** 书签项 `data-path` 存的是**笔记标题**（文件名去扩展名，`《阅读你的症状》`），不是文件路径。`app.vault.getAbstractFileByPath('《阅读你的症状》')` 解析失败（无 `.md`）→ handler 返回未设 pending → 原生 openFile 时 pending 为 null → 不重定向。

**修复：** 改用 `metadataCache.getFirstLinkpathDest(linkText, '')`（wikilink 解析器，link-opener 同款）把标题解析为真实文件路径。诊断同时确认：handler 触发正常、顺序正常（pointerdown 设 pending → 原生 click 才 openFile）、原生确实走 `openFile`。

**额外收获：** 诊断证实原生书签点击走 `WorkspaceLeaf.openFile`，openFile 补丁足以覆盖；openLinkText 补丁保留作为防御。移除泛化降级 `requestOpenAnyInTab` 的书签调用，避免 stale pending 在 500ms 窗口内误伤后续无关打开。

### 待验证 / 已知限制

- 书签 `getFirstLinkpathDest` 解析：同名笔记位于多个文件夹时取第一个匹配，存在歧义
- 补丁依赖原生打开走 `openFile`/`openLinkText`；若未来 Obsidian 变更打开路径，需跟进
- 无自动化测试框架，上述行为经 Obsidian 手动验证

---

## 2.4.5 (2026-08-15)

### 打字机模式：死区淡化 + 滚动位置维持

**需求：** 打字机模式从「光标行垂直居中」重构为「死区（12.5%~87.5%）外淡化 + 光标跨死区边缘时滚动维持视觉位置」，新增「允许文档头部留存空白区域」「死区下沿跳转上沿」两个子开关，并修多个稳定性问题。

**实现位置：** `src/controller/typewriter/typewriter.ts`（CM6 ViewPlugin + scroll 事件监听）+ `styles.css`（`.mdrazor-typewriter-top-padding`）。

**避坑记录：**

1. **CM6 update 内禁止 dispatch 与读布局** — `ViewPlugin.update()` 里 `view.dispatch()` 抛 "Calls to EditorView.update are not allowed while an update is in progress"；`coordsAtPos` 等读布局抛 "Reading the editor layout isn't allowed during an update"。滚动派发 / 坐标读取一律 `queueMicrotask` / `requestAnimationFrame` 延迟到 update 之外。
2. **空 dispatch 不触发 viewportChanged** — `dispatch({})` 只产生一次 update，`visibleRanges` 不重算 → 装饰不重建。**装饰必须在每次 update 无条件重建**（不能只响应 `viewportChanged`）；纯滚动无事务，靠 scroll 事件里 rAF 后 `dispatch({})` 重建。
3. **pixelViewport / viewportLines 滞后一帧** — scroll 事件里读它们是旧值，须等 CM6 measure（rAF）后才新鲜。读几何的合法时机：constructor / scroll 事件 / rAF，绝不在 update 里。
4. **scrollMargins 不产生可滚动空间** — 它只避开固定面板遮挡，不能实现「文档顶部留白」。可滚动留白用 `.cm-sizer` 的 `padding-top`（CSS 变量 + `.cm-editor` 类切换），留白随内容滚动、仅文档顶部可见；视口尺寸读 `view.scrollDOM.clientHeight`。
5. **留白重算会强制回流 → 闪烁** — 每次 update 读布局算留白导致闪烁。用 `topPaddingDirty` 标志，仅配置/几何（窗口、面板缩放）变化时重算。
6. **点空白区编辑器失焦** — CM6 事件处理器只挂在 `.cm-content`，点 `.cm-scroller` 空白处 blur 编辑器、顶部留白失效。capture 阶段在 editor DOM 上监听 mousedown，目标不在 `.cm-content` 内 → `preventDefault`。
7. **淡化与 ↑↓ 跳转判定必须共用同一几何** — 分别用「缓存边界」和「实时 scrollTop」会差约一行，淡化边界与跳转触发错位。统一：`lineBlockAt(head)` + `dimGeo = {staticOffsetPx, viewportHeightPx}`（布局允许的上下文缓存），边界 = `scrollTop − staticOffsetPx + ratio × viewportHeightPx`；`scrollIntoView` 的 `yMargin = 0.125 × scrollDOM.clientHeight`。
8. **跳转触发勿用行号门限** — 只比较行号变化会漏掉软换行长行（视觉位置跨死区但行号未变）。改为每次 selectionSet / docChanged 都调度检查。
9. **鼠标按压期间不滚动** — pointerdown/pointerup 标记拖选状态，按压中跳过滚动派发、松开后才触发，避免拖选时视口跳动。

### 滚轴同步：滚动目标 12.5% → 25%

- 选项聚焦的滚轴同步目标改为视口 25%（`scrollIntoView(pos, { y: 'start', yMargin: 0.25 × viewportHeight })`），与打字机死区上沿 12.5% 解耦——两个功能各自维护自己的目标比例，勿合并。
- 滚动随折叠/展开同一次 dispatch 派发（`effects.push(scrollIntoView(...))`），避免二次 update 循环。

### 更新日志弹窗（更新后首次启动弹出 CHANGELOG）

**实现位置：** `src/view/changelog-modal.ts`（Modal）+ `src/controller/main.ts`（`maybeShowChangelog`）+ `esbuild.config.mjs`（`loader: { '.md': 'text' }`）+ `src/typings.d.ts`。

**避坑记录：**

1. **社区市场安装只有三个文件** — Obsidian 社区市场安装仅分发 main.js/manifest.json/styles.css，插件目录里没有 CHANGELOG.md。绝不能读 vault 文件，必须把 CHANGELOG.md 在构建时打进 main.js（esbuild text loader + `import changelogText from '../../CHANGELOG.md'`），否则社区用户永远看不到弹窗。
2. **TS 识别 .md 模块** — 需 `src/typings.d.ts` 声明 `declare module '*.md' { const content: string; export default content; }`，否则 TS2307。
3. **弹窗频率控制** — settings 新增 `lastSeenVersion`（随 data.json 持久化）；`manifest.version !== lastSeenVersion` 才弹窗。**先写 `lastSeenVersion` 再弹窗**，弹窗失败/被跳过也不反复打扰；持久化用 `saveData` 直写，勿走 `saveSettings()`（后者触发 repaintAllEditors + forceRefresh，onload 阶段不必要且 dirFileCountRefresher 可能尚未初始化）。
4. **弹窗只显示最新版本条目** — 从全文提取首个 `**x.y.z**` 标题到第二个标题之间；解析失败（无版本标题）回退全文。
5. **弹窗内容必须渲染 Markdown，勿用 pre 展示原文** — `MarkdownRenderer.render(app, text, el, '', this)`（Modal 自身即 Component）。CHANGELOG 里 `[[path]]`、`![[path]]` 均在行内代码内，渲染后是代码而非链接，无需担心被解析。
6. **已读版本必须先落盘成功再弹窗** — `void saveData()` 不等待写入：弹窗一出现用户立即重载/重启 Obsidian，写入被丢弃 → lastSeenVersion 停留在旧值 → 每次加载都弹。必须 `await saveData`（onload 中 `await maybeShowChangelog()`）再 `new ChangelogModal().open()`；落盘失败 try/catch 兜底，不阻断弹窗（下次加载补记）。
7. **「重载也弹」先查 data.json 脏值** — 若 data.json 的 `lastSeenVersion` 与 manifest.version 不一致（历史写入丢失/手动改动），每次加载都算「新版本」。修复版首次加载会补弹一次并收敛，属预期。
