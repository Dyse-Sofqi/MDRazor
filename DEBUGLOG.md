# MDRazor 开发日志（DEBUGLOG）

记录功能构建与错误修复的技术细节：根因、架构决策、排查过程。面向开发者。

---

## 2.7.1 (2026-10-08)

### 左功能区「清理失联图片」开关：关闭后按钮未真正注销（用户报告）

**现象：** 设置 → 左功能区 → 关闭「清理失联图片」后，左侧功能区的垃圾桶按钮没有消失（或闪一下又回来），点击仍能触发清理；「隐藏命令」列表里也仍然列着它。

**实现位置：** `src/controller/orphan-image-cleaner/orphan-image-cleaner.ts`（`removeRibbon` 新增 `leftRibbon.removeRibbonAction(id)`）、`src/controller/ribbon-manager/ribbon-manager.ts`（`getRibbonItems` 跳过无 `buttonEl` 的条目）、`src/view/settings-tab.ts`（开关切换后重绘下方列表）；新增离线回归 `scripts/verify-ribbon-lifecycle.mjs`（`npm run verify:ribbon`，24 项）。

1. **根因：`addRibbonIcon` 不只是「返回一个元素」** —— asar 实证（obsidian 1.13.7 的 app.js）：`addRibbonIcon(icon, title, cb)` 会算出 `id = manifest.id + ":" + title`，调 `workspace.leftRibbon.addRibbonItemButton(id, icon, title, cb)` 登记条目，再 `this.register(() => { removeRibbonAction(id); el.detach() })`。原 `removeRibbon()` 只做了 `el.remove()`，没做 `removeRibbonAction(id)`。
2. **为什么「只摘 DOM」不够 —— 本插件自己的功能区管理器会把它装回去** —— `ribbon-manager` 的 `applyRibbonOrder()` 在每次 `refresh()` 时会把 `leftRibbon.items` 里**所有**带 `buttonEl` 的条目 `appendChild` 回容器（它需要这样做来同步拖拽排序）。而 `removeRibbonAction` 的真实语义是**只** `delete item.buttonEl; delete item.callback`，**不从 `items` 里 splice**（asar 实证，且这是宿主有意为之：条目留着才能保住位置、重新注册时按 id 复用）—— 所以正确注销后条目仍在数组里但不再可渲染；反之只摘 DOM 时 `buttonEl` 还在，下一次 `refresh()` 就把它挂了回来。设置面板的 onChange 恰好就是「`removeRibbon` → `saveSettings` → `ribbonManager.refresh()`」这个顺序，于是按钮「立刻又回来了」。
3. **第二处缺口：列表仍列出该条目** —— `getRibbonItems()` 原先无条件遍历 `leftRibbon.items`，注销后的条目（无 `buttonEl`）仍会被列出（`name` 取 `item.title`，照样有名字、有图标）。补 `if (!item.buttonEl) continue;`。
4. **第三处：设置面板不重绘** —— 开关 onChange 里没有重绘下方的「自定义命令 / 隐藏命令」列表，即使数据已更新用户仍看到旧列表。补一次 `renderRibbonCustomization(...)`（容器引用先 `let` 声明、后赋值，以保住「开关在上、列表在下」的 DOM 顺序，同时避免在闭包里引用尚未声明的 `const`）。
5. **回归与 A/B** —— `scripts/verify-ribbon-lifecycle.mjs` 用**照抄 asar 语义**的 leftRibbon 桩（`addRibbonItemButton` / `removeRibbonAction` / `onChange` 三个方法逐条对齐，含「只 delete 不 splice」这个关键细节），把 `registerOrphanImageCleaner` 与 `registerRibbonManager` 的真实实现接上去跑 24 项断言。**A/B 实测**：把 `orphan-image-cleaner.ts` 回退到修复前 → 15 通过 / 9 失败（失败项全是「按钮复活 / 列表仍列出 / 回调未解除」）；只回退 `ribbon-manager.ts` → 22 / 2 失败（只剩列表项）；两处都在 → 24 / 0。夹具内另留一条**反例守卫**（只 detach 不注销 → 断言按钮必然复活），保证这条回归对原 bug 敏感、不会变成假绿。
6. **写 DOM 桩的两个坑** —— ① 桩里的 `appendChild` 必须实现 **DOM 的「移动」语义**（先从前一个父节点摘除、再插到当前父节点末尾），否则 `applyRibbonOrder` 的重复 append 会在桩里堆出重复子节点，计数类断言全歪（本次先踩后修，4 项失败即由此而来）。② Node 22 的 `globalThis.navigator` 是**只读 getter**（直接赋值抛 `Cannot set property navigator`），`tr()` 的语言要固定就走桩里的 `requireApiVersion`/`getLanguage`，别去写 `navigator`。

### 自定义命令的命令 id 失效：静默失效与守卫（用户报告：左功能区「Style Tuner」按钮点了没反应）

**现象：** 库里左功能区的「Style Tuner」按钮点了没有任何反应，也没有任何提示。

**根因：** 该按钮**不是** style-tuner 自带的 ribbon 图标（style-tuner 全程没调过 `addRibbonIcon`），而是 MDRazor 的自定义命令（`customRibbonCommands`），存的 `commandId` 是 `style-tuner:show-style-tuner-leaf`；而 style-tuner 在 **1.1.x 把命令 id 规范化成了 `show-view`**（作者 CHANGELOG 原文：「命令 id 规范化 — `show-style-tuner-leaf` → `show-view`」），库里装的 1.2.2 只注册 `show-view` → 命令不存在。**asar 实证**：`findCommand(id)` 是纯 id 查表（`this.commands[e]`），`executeCommandById` 对不存在的 id **返回 `false` 且不抛错**；而原 `executeCommand()` 只 `catch` 抛错 → `false` 被静默吞掉，无提示、无日志。

**实现位置：** `src/controller/ribbon-manager/ribbon-manager.ts` 与 `src/controller/command-surface/command-surface.ts` 的 `executeCommand()`；回归 `scripts/verify-ribbon-lifecycle.mjs` 第 ⑦ 组（7 项）。

1. **不能只看 `executeCommandById` 的返回值** —— 宿主在**回调抛错**时同样返回 `false`（asar：`executeCommand` 内部 `try{a5(e)}catch(t){…return!1}`），只看返回值会把「命令不存在」与「命令执行失败」混为一谈（第一版就是这么写的，被回归用例③当场打回）。正解：先用 `findCommand` 判定存在性，再执行；`false` 才归为「执行命令失败」。
2. **命令 id 失效是「插件改名 / 卸载」的必然结果**，MDRazor 侧无法预知；能做的是**让失效可见** —— 提示里带上命令 id，用户一眼能看出是哪个插件改了名。同一守卫在功能区 / 状态栏 / 右键菜单三处共用。
3. **回归的三种情形** —— 命令缺失（1 条提示且含 id）/ 命令正常（回调执行、0 条提示）/ 回调抛错（1 条「执行命令失败」）。Notice 桩把消息记进 `globalThis.__mdrazorNotices`，`makeCommands()` 按 asar 语义实现 `findCommand` + `executeCommandById`。

### 首行缩进：回车新建的空行不缩进（用户报告）

**现象：** 开启「首行缩进」后按回车，光标停在未缩进处；键入任意字符后光标与文字才一起跳到缩进位。

**根因：** 缩进由 CM6 行装饰驱动，而段落首行判定只认 `text` 行 —— **空行是 `blank`**（`classifyLines` 的 `BLANK_RE` 分支），于是回车新建的空行**根本没挂装饰**；键入字符后该行变成 `text`，装饰才补上。**与 `text-indent` 本身无关。**

**实现位置：** `src/controller/general/first-line-indent-rules.ts`（`findIndentableParagraphStarts` 纳入 `blank`）、`src/controller/general/first-line-indent.ts`（新增 `FIRST_LINE_INDENT_EMPTY_LINE_CLASS`，空行走另一套装饰类）、`styles.css`（空行改用透明左边框位移）；回归 `scripts/verify-first-line-indent.mjs`；机制页 `scripts/fixtures/first-line-indent-caret.html`、`first-line-indent-empty-line-shift.html`。

1. **空行的判定沿用正文行的规则** —— 等价于问「这一行若变成正文行，会不会是段落首行」：非严格换行（Obsidian 默认）下每行都是一段，故**所有空行都缩进**（这正是「回车后光标对齐缩进」要的）；严格换行下只有「上一行不是正文行」的空行才算段落首行（回车是软换行，新行属同段续行，不缩进）。围栏代码块 / 数学块 / 注释块 / HTML 块**内部**的空行不受影响 —— 它们在 `classifyLines` 里已被块状态分支吃掉，类型不是 `blank`。
2. **`text-indent` 修不了这个 bug（实测）** —— 无头 Chrome 153 量（`first-line-indent-caret.html`）：空行里唯一的子元素 `<br>` 已被 `text-indent` 推到 x=38px，但**内容盒左边界仍是 6px**；光标锚在行首时按内容盒定位，所以停在 6px。要修必须移动**内容盒本身**。
3. **四种位移方案的实测对比（`first-line-indent-empty-line-shift.html`）** —— 目标：内容盒到 38px、行盒（背景盒）保持 0、高度不变。

   | 方案 | 内容盒（光标基准） | 行盒 / 背景左边界 | 高度 |
   |---|---|---|---|
   | `text-indent: 2em`（原） | 6px ✗ | 0 ✓ | 25.59 ✓ |
   | `margin-inline-start: 2em` | 38px ✓ | **32px ✗**（当前行高亮缺一角） | 25.59 ✓ |
   | `padding-inline-start: 2em` | **32px ✗**（覆盖而非累加基础 padding） | 0 ✓ | 25.59 ✓ |
   | `border-inline-start: 2em solid transparent` | 38px ✓ | 0 ✓ | 25.59 ✓ |

   取**透明左边框**：内容盒右移、行盒不动、边框**累加**在既有 padding 之外（不依赖宿主把 `.cm-line` 的 padding 设成多少 —— Obsidian 归零、CM6 基础主题是 `0 2px 0 6px`）。弃用 padding 的第二个理由：CM6 的 `posAtCoords`（`rectanglesForRange`）会读「首个 `.cm-line` 的 `paddingLeft`」当文本区左边界，对 `text-indent` 取 `Math.min(0, x)` 故无副作用 —— padding 会污染该基准（表现为多行选择的背景左边界偏移）。
4. **无头环境测不了「光标画在哪」** —— 折叠 range 的 `getBoundingClientRect()` 在空行里返回空矩形（`left=0, width=0`；`document.hasFocus()` 为 true、且锚在文本节点内时能正常返回，故不是焦点问题），`--screenshot` 连文字都不渲染（整图全白，539 字节）。故本次用**可测的代理量**（内容盒左边界 / `<br>` 左边界 / 高度）作判据，并明确记录「光标绘制位置」这一项是**推断**（内容盒已右移，光标锚在内容盒内）。**待用户在真实 Obsidian 里复验。**
5. **夹具断言的写法调整** —— 空行是第 5 类刻意偏离（参考实现里空行不产出 `Paragraph`），逐行手写期望值会非常脆，故夹具那一层改成**性质断言**：参考实现判定过的行一个都不能丢、新增的只能落在空行上、非严格结果包含严格结果。内联用例仍逐条给精确期望值（含本 bug 的回归：`'甲段\n'` 在非严格换行下必须是 `[1, 2]`）。
6. **无头浏览器可用性（本机实测）** —— `msedge.exe` 在本会话里完全跑不出输出（`--version` 都是空的，`--screenshot` 不产文件）；改用 Playwright 缓存的
   `C:\Users\Administrator\AppData\Local\ms-playwright\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe`
   可正常 `--dump-dom` 跑页面内测量脚本（`Google Chrome for Testing 153`）。另外本机 pip 装不了包（Pillow 失败），需要解析 PNG 时用纯 Python + `zlib` 手写解码。

---

## 2.7.0 (2026-10-08)

### Callout 增强：可折叠 callout 单击标题区域切换折叠/展开

**需求：** 设置 → 通用 → Callout 增强（默认开启）下，可折叠 callout（`[!type]+` / `[!type]-`）在实时预览里单击**标题区域**（图标 / 标题文字）即切换折叠 / 展开；前提是不能遮挡「编辑这个区块」按钮。

**实现位置：** `src/controller/general/callout-enhancer.ts`（`tryToggleCalloutFold` + `handleClick` 新分支 + `handleMouseDown` 记录 mousedown 坐标 + `lastMouseDownPos` / `TITLE_FOLD_SLOP_PX` / `CALLOUT_TITLE_SELECTOR` / `CALLOUT_FOLD_SELECTOR` 四个新常量）、`scripts/verify-callout-title-fold.mjs`（新增离线回归，34 项）；README 中英、设置项说明中英、CHANGELOG 中英同步。**styles.css 零改动**（见第 8 条）。

1. **标题区原本是死区** — 两股力量把它夹死了：Obsidian 原生只给标题行内的折叠箭头（`.callout-fold`）挂折叠行为，标题其余位置单击不折叠；而本模块为「单击不退回纯文本」（2.6.5 需求 1）在捕获阶段把标题区的点击整体 `preventDefault + stopPropagation`。于是补的只能是「拦截后自己触发折叠」。
2. **重放合成 click，而不是自己切类名 / 写状态** — Obsidian 把折叠状态存在哪（`.callout` 上的类、aria 属性、图标旋转）是内部实现，本机无 Obsidian 安装可解包实证（本次改动在无 Obsidian 的环境完成），不猜。做法：拦下真实点击后 `foldEl.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}))` —— 与「真实点击箭头」走**同一条代码路径**（事件目标、冒泡路径完全一致，唯一差别是 `isTrusted`），对这些内部细节零假设。而箭头点击的原生行为本模块本就放行（INTERACTIVE_SELECTOR 含 `.callout-fold`，2.6.5 第 4 条），该路径确定可用。`bubbles: true` 保证无论 Obsidian 的处理器挂在箭头本身、标题行还是更上层都可可达；`cancelable: true` 避免它 preventDefault 时抛「非可取消事件」告警。合成 click 重新经过本模块自己的捕获处理器时，目标命中 `.callout-fold` → `interactiveInside` 放行 → 不会二次重放（回归用例③锁定）。
3. **「不遮挡编辑按钮」靠分支顺序，不靠条件判断** — 用户的前提要求落实到 `handleClick` 的语句顺序上：编辑按钮（原生 `.edit-block-button`）→ 触屏编辑按钮 → `interactiveInside` 放行 → **新分支** → 常规拦截。前两条分流在任何情况下都先于折叠分支执行，回归用例②用真实处理器断言「点编辑按钮不产生合成 click 且走编辑分支」。触屏按钮挂在 widget 上而非标题行内，天然不与标题区重叠；原生按钮虽悬浮在 widget 右上角，但点击目标命中按钮本身即被最前面的分流接走。
4. **可折叠判定 = 标题行内有 `.callout-fold`** — Obsidian 只为可折叠 callout 渲染折叠箭头（不可折叠的标题行只有图标 + 标题文字），故「标题行内查询不到 `.callout-fold`」即不可折叠，直接放行常规「保持渲染」路径（回归用例⑤）。不额外解析源码折叠标记：浮动 callout 的源码映射本就可能失败（2.6.5 已知限制），DOM 判定不受影响；且箭头元素被片段 `display:none` 时 `dispatchEvent` 依然可达处理器。
5. **拖拽选择不算单击** — 标题文本可拖选是 2.6.5 第 15 条起既有的交互，而「在标题内拖拽后抬起」浏览器会在最近公共祖先（`.callout-title`）上补发 `click` —— 不设门槛会把「选择文本」误判成「折叠」。`handleMouseDown` 记录视口坐标，click 分支要求位移 ≤ 5px（`TITLE_FOLD_SLOP_PX`）；超过则交回常规拦截路径：不切换、仍保持渲染、选择照常（回归用例④，含 2px 抖动与 40px 拖拽两端）。
6. **就地编辑会话进行中不切换（复查时补的守卫）** — 编辑期间标题行内是标题输入框，但其**左侧图标**仍在标题行内：点图标会走到新分支，而 `is-collapsed` 加上去没有任何视觉反馈（正文已被编辑态隐藏），且「取消」走 `closeSession(false)` **不重建 widget**、Obsidian 的 `is-collapsed` 类不会随会话拆除移除 —— 取消编辑后 callout 会停在折叠态。故 `tryToggleCalloutFold` 首行 `if (session) return false;`：编辑期间标题区保持既有行为（常规「保持渲染」拦截）。此时可点的标题区必在**编辑中的那个 callout** 内——点别处已在 mousedown 阶段被 `onOutsidePointer`（document 捕获）提交并关闭会话，故该守卫不会误伤别的 callout。回归用例⑨用桩 view 跑通真实 `openEditor` 全流程后锁定：会话中点图标不切换、取消后恢复切换。
7. **嵌套 callout 只切换最近一层** — 标题元素从 `target.closest('.callout-title')` 取（而非从 widget 侧正查），折叠箭头在同一标题行内 `querySelector`：点内层标题落内层箭头、点外层落外层，互不串扰（回归用例⑥）。`widget.contains(titleEl)` 防的是几何判定路径把别处的标题误认。
8. **刻意不加光标提示（styles.css 零改动）** — 原生可折叠 callout 的标题没有指针光标（Obsidian 原生标题点击也不折叠），本可以给可折叠标题行加 `cursor: pointer` 做 affordance，但最终**刻意保持 Obsidian 默认外观**：不加光标、不为这一个手势加任何额外交互提示（用户明确要求）。可折叠的视觉线索原生已有（标题行内的折叠箭头），不为它改变宿主既有的鼠标反馈语义。故本次改动**不碰 styles.css**。
9. **验证手法：最小 DOM 桩 + 真实处理器** — 无 Obsidian 环境，参照 verify-list-integration.mjs 的做法把 obsidian / @codemirror/view 打成桩模块（`EditorView.findFromDOM` 返回经 globalThis 注入的桩 view，含 posAtDOM / posAtCoords / state.doc），自建最小 DOM 桩复现实时预览 widget 的 DOM 结构与事件传播（捕获 → 目标 → 冒泡，`registerDomEvent` 的 capture 处理器、元素自身监听、挂在 document 上的 onOutsidePointer 都参与；Obsidian DOM 助手 createEl/createDiv/setText/addClass/setCssProps 等一并桩掉），把 `registerCalloutEnhancer` 注册的**真实** mousedown/click 处理器接上去跑 34 项断言：分支顺序（编辑按钮 / 触屏按钮 / 箭头 / 链接）、三个门（标题行内、有折叠箭头、非拖拽）、编辑会话守卫、嵌套两层、正文区与右侧空白不误触、普通文本行不过度抑制、mousedown 阶段箭头放行标题阻断。**待用户在真实 Obsidian 里复验的只剩一点：合成 click 触发原生折叠后 callout 是否保持渲染**（理论上真实箭头点击在原生 Obsidian 里本就不退纯文本，否则原生折叠在实时预览里就是坏的；本模块的拦截只可能更稳）。

---

## 2.6.9 (2026-10-07)

### 实时预览：空行内代码「光标被隐藏区间盖住」导致字符倒序、跑到标记外（用户报告）

*现象（两轮反馈）：* ① 实时预览里在**行首**键入 `` ` ``（Obsidian 自动配对插入一对、光标居中）、接着键入 `123456`，渲染显示 `654321`（倒序），源码视图里字符跑到了两个反引号**之后**；符号边界提示持续显示 `` `|` ``。② 用户补充：字符实际是加到了**第二个反引号之后**、tooltip 一直停在 `` `|` ``；且**只在行首**发生 —— 行中键入 `` ` `` 只出现一个反引号（不配对）。

*根因（结论）：* 光标落在**一条隐藏区间内部**。行首键入 `` ` `` 时 `autoPairMarkdown` 插入 `` `` `` 并把光标放在两个反引号中间（asar 实证：`u.push("*","_","`","```")`），而解析器把**整个反引号段**建成一条节点（插件注释与实现即按整段处理：`doc.sliceString(node.from,node.to).match(/^`+/)`，「支持 `、``、``` 可变长度」），插件随之把 `[0,2)` 整段隐藏 —— 光标（状态位置 1）就在这条隐藏区间内部。replace 隐藏把标记从 DOM 抹掉后，`[0,2)` 只剩一个占位元素，DOM 里**没有任何文本**能承载光标：Chromium 把 DOM 光标规范化到占位元素之后，CM6 状态光标却停在 1 不动，两者分叉。此后每个键入字符都由浏览器插到那个固定的 DOM 位置（映射回文档 = 位置 2），于是字符逐键堆在标记之后形成**倒序**（` ``321 `），而符号边界提示读的是状态光标、便一直显示 `` `|` ``。用户「只在行首发生」是**入口差异**：行中键入反引号不触发配对，就没有空的一对、也就没有「光标在隐藏区间内部」这个状态。同类退化位置还有「光标夹在两条相邻隐藏区间之间」（空格式单元被拆成两条标记时，如 `**` 的两条加粗标记）。

*排查过程（按证据顺序，含一次方向性误判）：*

1. **实验台优先。** esbuild 打包仓库里的真实 `@codemirror/view`/`state` 到静态页（import map 走 `node_modules`），复刻装饰形状（逐条 `Decoration.replace({})`、`Prec.high`、每帧重建），输入走浏览器真实路径（真实键盘事件、`execCommand('insertText')`），可跑完整位置矩阵。
2. **排除插件自身的输入路径。** 逐个读 `inline-code-enhancer`（只读文档）、`list-integration`（原子区间只覆盖列表标记/勾选框）、`typewriter`（只滚动）、`position-persistence`（只在空文档/整档替换误触发恢复）、`click-sync`，确认没有在文档变化时派发插入/选区事务的代码。
3. **asar 实证 Obsidian 的真实机制**：实时预览装饰器对标记有 reveal 分支（光标与标记相交时不生成隐藏装饰）；另有插件（`v8`）在无 docChanged 的选区变化时把光标**吸附出隐藏区间**（`Math.min(rangeFrom, pos)`）—— 两条合起来说明「原生默认光标所在处不存在隐藏区间」；`autoPairMarkdown` 的配对列表含 `` ` `` 与 ` ``` `（同字符配对走 pair 分支）。
4. **⚠️ 第一次误判（方向错了）：** 实验台把空跨度 `` `` `` 的语法树建成了**两条单字符节点**（`[0,1)` + `[1,2)`，来自先入为主地按提示弹框的显示反推），于是复现出的是「两条相邻区间的**接缝**」这一形态，据此只修了接缝（`seam-reveal.ts`，放开 `to === 光标 === from` 的两条）。用户实测反馈**问题依旧**，并补充了决定性线索（字符在第二个反引号之后、tooltip 一直 `` `|` ``、只在行首）—— 这三点共同指向「一条覆盖整段的区间 + 光标在其内部」，接缝规则自然不会命中。
5. **修正实验台形状后一次复现。** 按「每个最大反引号段 = 一条节点」重建语法树（未闭合段同样成节点并被隐藏），立刻复现用户全部表征：`doc="``" pos=1` → `buffers=2`（整段一条占位），`exec 1/2/3` → `"``1"`/`"``21"`/`"``321"`、**head 恒为 1**、提示恒为 `` `|` ``；行中同形状（`doc="ab``" pos=3`）同样触发。
6. **A/B 验证修法。** 修复版：`buffers=0`（整段放开）、真实键盘与 `execCommand` 两条路径键入 `123456` 均得到 `` `123456` ``、光标 2→7 逐一推进、提示消失；非空行内代码的 0/1/3/4 各位置与「段尾贴邻」位置全部与修复前一致（零回归）。

*修法：* `format-hider` 在收集装饰后、排序前增加一步「光标可见性保护」：折叠光标**被隐藏区间盖住**（`from < 光标 < to`）或**夹住**（`A.to === 光标 === B.from`）时，去掉全部「盖住 / 夹住光标」的条目（`from <= 光标 <= to`）。规则抽成纯函数层 `src/controller/format-hider/caret-reveal.ts`（`isCaretObscured` / `revealCaretRanges`，无 CM6 依赖）。语义边界：
- **只对折叠光标生效**：有选区时插入由「替换选区」事务决定，不属于本 bug 路径（不扩大变更面）。
- **只放开盖住 / 夹住光标的条目**：单侧贴邻、区间端点、行首/行尾、非空格式单元内的各位置全部原样，与 2.6.8 行为一致；首个字符插入后标记与光标不再重叠，下一帧即恢复隐藏（实测 `exec` 之后 `buffers` 由 0 回到 4）。
- **放开后与原生同态**：原生在光标与标记相交时本就不隐藏（asar 实证），故此处放开只是把插件「始终隐藏」在退化位置暂时让位；提示弹框读同一份装饰集，光标处已无隐藏标记、自然不弹。
- 回归：`scripts/verify-caret-reveal.mjs`（`npm run verify:caret`，20 项：区间内部、相邻夹缝、端点/单侧贴邻原样、非折叠选区、泛型保留 `spec`、无遮盖零分配）。

*避坑（三条）：*

1. **实验台的语法树形状必须与真实解析器对齐，且要写进断言。** 本次返工的直接原因就是把「一个反引号段」拆成了两条单字符节点 —— 形状一错，复现出的是另一个（相邻夹缝）问题，修法自然打偏。教训：实验台的输入模型（树形状）要么取自 asar 实证、要么取自插件自身实现的读取方式（此处 `match(/^`+/)` 明示了「一条节点可含多个反引号」），并在实验记录里写明依据。
2. **CM6 的 DOM 观察者 flush 是异步的**：`execCommand` 之后同步读 `view.state` 会看到「文档没变」，容易误判成「文档与 DOM 发散」。真实状态是变更已被记录（`view.observer.pendingRecords().length === 1`），微任务/帧内才落进文档；实验台里必须 `flush()` 或另起一次 evaluate 再读。
3. **无头实验里的聚焦与会话断言**：页面刚加载时的第一次点击可能落空；编辑器没拿到焦点时 CM6 不画 DOM 选区，输入会落到行首/容器 —— 与真正的 bug 表征相似但成因不同。断言必须带 `document.activeElement` / `document.getSelection()` 校验，并用元素实测边界盒点击。

---

## 2.6.8 (2026-10-04)

### Callout 编辑器：触屏不可达 / 空正文 / 无取消路径（iPad 用户报告）

一位 iPad（iPadOS + Magic Keyboard）用户在 2.6.7 上试用的第一天反馈了四个问题，前三个属实并已修复，第四个（float 浮动 callout 的几何映射失效）是已知限制、报告者本人也只是备注，未改动。

**问题 1：编辑按钮在触屏设备上不可见（主问题），且用户 CSS 救不回来**

*现象：* 就地编辑器唯一入口是 Obsidian 原生的 `.edit-block-button`，只在悬停时出现；iPad 没有悬停，按钮永远不可见——但仍可点击（盲点 callout 右上角能打开编辑器）。报告者尝试用自定义片段强制显示：对 `.edit-block-button` 写 `opacity: 1 !important`、`display/visibility/background: red !important` 全部无效（对照组规则正常生效），结论「没有任何文档 CSS 能碰到这个按钮」。

*根因（asar 实证 app.css）：* 按钮挂在 `.embed-actions` 容器上，容器默认 **`opacity: 0`**（`.markdown-source-view.mod-cm6 .embed-actions`），仅悬停恢复。两个细节让报告者的现象完全自洽：① opacity 作用于**容器**，对子元素（按钮）写 `opacity: 1` 救不回来——父级 opacity: 0 把整个子树绘制成全透明，`background: red` 也看不见；② opacity 不参与 hit-testing 排除，所以按钮「看不见却摸得着」。他改错了元素，但无从知晓——没有 devtools 的话这确实无法定位。

*修法：* 插件自有的编辑按钮（`mdrazor-callout-touch-edit-button`，铅笔图标 `setIcon(btn, 'pencil')`），由 `MutationObserver` 增量注入到 callout widget（widget 会被 Obsidian 频繁重建，新增节点里出现就补，幂等；`node.instanceOf(Element)` 跨 realm 安全判定）。显示交给 CSS 媒体查询：`@media (hover: none) and (pointer: coarse)` 才 `display: flex`（iPad/手机成立；桌面触屏本 primary pointer 是鼠标、不成立）——桌面悬停环境零变化，原生按钮照常。位置与原生按钮一致（widget 右上角内侧，widget 由核心设 `position: relative` 可作定位锚；按钮整体在 widget 盒内，不受核心 `contain: paint` 裁剪影响）。点击统一走 `handleClick` 捕获分支（新增插件按钮分支，须排在 `interactiveInside` 放行之前——按钮是 `button` 元素会被交互元素选择器命中）；`handleMouseDown` 同步排除该按钮，否则 CM6 会把光标放进 widget 源码区间触发重建。按钮不挂任何监听器（全靠捕获分支），无清理负担。开关切换不会触发 DOM 变化，故 `syncConfig()` 里显式调 `refreshTouchEditButtons()` 全量补/摘；对应新增设置项「Callout 触屏编辑按钮」（`calloutTouchEditButton`，默认开启）。

**问题 2：特定 callout 的编辑面板打开成空正文**

*现象：* 标题/类型解析正确、正文文本域为空；其他 callout 正常。提交空正文不会删掉源码正文（`parseCalloutFromWidget` 找不到正文时区间收窄到标题行），但「打开的编辑器与源码不符」本身很误导。

*根因：* 解析用 `^\s*>` 判定引用行、扩展 callout 源码区间。JS 的 `\s` **不含** ZWSP（U+200B）、ZWNJ、ZWJ、word joiner（U+2060）、软连字符（U+00AD）这一族——从网页复制的正文行首混入后，该行不再被认作引用行，区间扩展与正文收集提前终止，正文静默丢失；而 Obsidian 的渲染管线不受影响，块仍带正文渲染。报告者猜的就是这个（「an invisible character (e.g. zero-width space) at the start of the body line」）。

*修法：* 行文本级判定/剥离抽成纯函数层 `src/controller/general/callout-parse.ts`（`CALLOUT_HEADER_RE` / `QUOTE_LINE_RE` / `isQuoteLine` / `stripQuotePrefix`），行首统一容忍 `\p{Cf}`（Unicode 格式字符类，零宽一族全覆盖，还天然包含 LRM/RLM 等同类隐形污染）。用属性转义而非 `[\u200b\u200c\u200d…]` 枚举：裸 ZWJ 在字符类里会触发 eslint `no-misleading-character-class`（防 emoji 组合误配的规则，此处语义恰恰要匹配裸字符），`\p{Cf}` 既准确又无误报。语义边界全部保持：`>` 后至多剥一个字符（`>   foo` 仍保留缩进对齐）、正文零宽字符原样保留不吞、头部 `prefix` 捕获组含零宽字符时提交按原样写回。新回归 `scripts/verify-callout-parse.mjs`（28 项：普通/缩进/紧凑引用行、六种行首污染形态、剥前缀边界、头部各捕获组）。

**问题 3：没有任何取消路径**

*现象：* 「完成」按钮、点击面板外、Esc 全部提交（`closeSession(true)`），改错了无法不写回地退出。

*修法：* 编辑面板新增「取消」按钮（次要样式，`closeSession(false)` 拆面板不写回），Esc 同步改为取消——Esc 作为「退出」键与取消同义，「完成」按钮与点击面板外保持提交路径不变（就地编辑的「点外部顺手保存」语义保留）。

**避坑记录：**

1. **「CSS 打不动」先查作用元素是不是它自己** —— 报告者的三条规则全都打在按钮上，而透明化的是父容器。opacity 是 paint 层属性：父级 0，子级任何显式值都无效；同时 opacity 不像 `visibility`/`display` 那样参与 hit-testing 的排除。「看得见的按钮点不到 / 看不见的按钮点得到」两类症状都能由父级 opacity 造出来，排查时先一层层向上找 opacity/visibility，再怀疑选择器优先级。
2. **`\s` 不含零宽一族是 JS 的真实缺口** —— `\s` 覆盖 U+2000–U+200A 与 U+FEFF，却不含 U+200B–U+200D/U+2060/软连字符，而这三类恰是网页复制最常见的污染。「按空白剪裁」的逻辑（正则、`trim`、split）遇到它们都会漏，涉及「识别结构行」的判定应统一用 `\p{Cf}` 宽容化。
3. **`\p{Cf}` 属性转义是零宽字符类的正解** —— 枚举裸 ZWJ 会撞 no-misleading-character-class（对字面量正则**和** `new RegExp` 的字符串参数都生效，换动态构造躲不掉），disable 注释三处又啰嗦；`\p{Cf}` 一并覆盖同性质的 LRM/RLM/双向隔离符，语义上「容忍隐形格式字符」本就该是全集。
4. **编辑器内注入 UI 的两处既有约束**：`node.instanceOf(Element)` 而非 `instanceof`（popout 跨 realm）；插件按钮在 `handleClick` 里必须排在 `interactiveInside` 之前分流（`button` 会被交互元素选择器命中而提前放行）。

### 列一体化：列表标记后的多余空格被误判为「格式的一部分」（← 退不回、退格连删）

**现象：** 用户实测，列表标记 `- ` 或 `1. ` 后面直接接若干空格时，这些空格也会被判断为列表格式的一部分——按 ← 光标无法退回空格左边（卡死在所有空格之后），按退格则连列表标记和全部空格一并清除。

**根因：** HyperMD 的 `formatting-list` 节点会把标记之后的**全部连续空白**一并吞进节点（`-   foo` 的节点覆盖 `-   ` 而不止 `- `）。`buildAtomicRanges` 原样取 `node.from → node.to` 作原子区间，于是多余空格进了原子单元：

1. **← 卡死** — 光标纠正把区间内（含左端点）的光标一律推到区间右端点，而 ← 移动落点落在区间内即被推回（2.6.6 已记录「← 在原子区间右边界是死键」的设计）。单空格时死键区就是 `- ` 本身；多空格时**所有多余空格都被并入死键区**，光标退不过任何一个空格。
2. **退格连删** — 空白前缀前推分支与 `expandDeletion` 都以区间右端点为删除终点，一次退格扩展成「行首缩进 + 标记 + 全部空格」整体删除；「退格提升层级」的提升链也在这个（被撑大的）右端点上误触。

判据对照：asar 实证的原生任务行正则 `^([>\s]*)(([*+-] |(\d+)([.)] ))(?:\[(.)\] )?)?` 给出的「格式」边界是**标记 + 恰好一个空格**——多余空白在原生语义里就是普通文本，不该被原子单元吞并。

**修法（`src/model/shared.ts`）：**

1. 新增 `shrinkListMarkerRange`：`formatting-list` 区间若确为「标记本体 + ≥2 个空白」（正则 `^([-*+]|\d+[.)])([ \t]+)$`），收缩到「标记 + 1 个空白」；无尾随空白（空列表项 `-`）与解析异常原样保留。收缩后多余空格退回普通文本：← 可逐格左移到 `- |`（标记本体仍不可进入，与单空格行为一致），退格逐格删空格、到 `- |` 才触发整体删除或提升链。
2. 勾选框合并条件从「标记与勾选框之间允许空白」收紧为**紧邻**（`r.to === node.from`）。否则 `-   [ ] foo` 会把多余空白吞回合并区间、复现同款问题——而该写法下原生任务行正则匹配不到勾选框组（`]` 前的空格链破坏 `([*+-] )(\[(.)\] )` 的衔接），Obsidian 本就不渲染复选框 widget；不合并后中间空格可正常编辑，勾选框区间的「← 选中状态字符」手势照常可用。

**连锁推演与避坑记录：**

1. **六个消费方逐个过了一遍**：光标纠正（多余空格不再强制推光标，正是修复目标）、`expandDeletion`（光标在多余空格间退格不再与区间相交，走原生逐格删）、`resolveBoundaryAction`（只在收缩后的 `r.to` 命中，不再被多余空格撑大误触）、`selectCheckboxStatusChar`（合并区间构造不变）、Delete 键（区间后是内容首字符，本就不相交）、空白前缀前推分支（`delTo = r.to` 跟随收缩值；该分支的常规触发路径本就不可达——光标纠正含左端点后，光标停不到「缩进与标记之间」，此处属防御性代码）。`nudgeOutOfAtomicRanges` 是无调用方的死代码未动；`enter-soft-break` 直接读语法树不经原子区间，不受影响。
2. **多空格空列表项 `-   ` 的退格语义**：不再是一次归并上行，而是逐格删空格、到 `- |` 触发整体删除并归并——与「多余空格是普通文本」的语义自洽，也与单空格空项的路径一致。
3. **回归脚本（`scripts/verify-list-integration.mjs`）用手工语法树桩跑 `buildAtomicRanges`**：Obsidian 的语法树来自内置 HyperMD 流式解析器、离线不可得，按 asar 实证的节点形态（formatting-list 从标记字符起、吞全部尾随空白；formatting-task 为 `[·]` 三字符）构造最小 `iterate` 桩。打包时用 esbuild 插件把 `@codemirror/language`/`@codemirror/view` 换成桩模块——**esbuild 会摇掉宿主未引用的具名导出**，桩模块里的注入函数要走 `globalThis` 而不是具名导出，否则测试脚本拿不到。
4. 夹具踩坑：`1.   foo` 的节点区间是 `[0,5)`（标记 2 字符 + 3 空格），首版夹具误写 `[0,6)` 导致两例有序标记的期望值对不上——「节点吞全部尾随空白」的区间端点要用字符位置数出来，不能目测。

---

## 2.6.7 (2026-10-01)

### 阅读视图：后续行比首行多缩进一点点 —— markdown-it 的 `'<br>\n'` 被占位元素挤离行首

**现象：** 用户截图反馈「阅读视图后续的缩进没对齐第一行缩进，是因为没考虑到字体大小的关系吗？」——后续行比首行**多**出约 0.3~0.4 个字符宽。

**根因（实测确认）：** markdown-it 渲染软换行输出的是 **`'<br>\n'`** —— `<br>` 后面跟一个换行符，它会被 HTML 解析器并进紧随其后的文本节点开头（DOM 形如 `"\n乙段内容"`）。上一轮我把占位元素直接插在 `<br>` 与该文本节点之间，这段前导空白**不再位于行首**，于是不被「行首空白丢弃」规则吃掉，而是塌缩成**一个空格**，把该行多推一个空格宽。首行没有前置 `<br>`，因此不受影响 —— 差值恰好是一个空格宽（CJK 字体约 0.25~0.5em），与截图量级一致。

**修法：** 占位元素插到**前导空白之后**：从 `<br>` 往右扫，跳过整段皆空白的文本节点与已插入的占位元素；遇到以空白开头的文本节点就 `splitText` 切开，把前导空白留在 `<br>` 之后、占位元素插在切开后的内容之前。幂等判定同时改在这一次扫描里完成（扫到占位元素 = 已处理）。

**避坑记录：**

1. **别用「手写 HTML」复现 Obsidian 的渲染** —— 我前两轮自建夹具时手写的是 `<br><span class="spacer"></span>乙…`，**漏了 markdown-it 那个 `\n`**，于是怎么量都「首行与后续行完全相等」，反而把真正的原因排除掉了。复现宿主渲染必须照抄它的 HTML 输出形状（markdown-it 的 softbreak 规则是 `options.breaks ? '<br>\n' : '\n'`），或者直接抓真实 DOM。
2. **量行首要用「逐节点」而不是「Range 聚合 + 按 top 取 min」** —— 零高占位元素、空白文本节点的 rect 会污染按行分组的 min 值，前两轮我因此两次得出错误结论（先是误判「`br::after` 伪元素不渲染」，后是误判「两行完全对齐」）。逐文本节点 `selectNode` + `getClientRects()` 才可信。
3. **差值 4.73px @ 16px 字号 = 0.3em，正是一个空格宽** —— 这个量级本身就是线索：它不是字体度量差异（`em` 与字形无关），而是「多了一个字符」。
4. 反证与正证都在无头实测台里跑过：旧插入位置 → 首行 40、后续行 **[44.73, 44.73]**；修复后 → 首行 40、后续行 **[40, 40]**。

### 首行缩进：阅读视图的逐行缩进（`<br>` 之后补空 inline-block 占位元素）

**现象：** 实时预览的单回车换行缩进正常了，但**阅读视图**对应位置没跟上。

**根因：** 阅读视图里单个回车只是 `<p>` 内的一个 `<br>`（Obsidian 用 markdown-it 的 `breaks: !strictLineBreaks`），而 `text-indent` 只作用于**块级容器的首行** —— `<br>` 之后的文本属于同一个块，拿不到缩进。上一轮实测排除了四种 CSS 做法（`br{display:block}`、`br::after` 伪元素不渲染、`<p>` 改纵向 flex 容器、`<span style="display:block">` 切匿名块盒 —— 匿名块盒也不应用 `text-indent`），当时结论是「只能改写宿主 DOM，不建议」；本轮用户明确要求跟上，遂按**最小侵入**做。

**修法：** 新增 `src/controller/general/first-line-indent-reading.ts`，在正文段落里每个 `<br>` 之后插入一个**空的 inline-block 占位元素**（`.mdrazor-indent-spacer`）把该行撑右：

- 空节点 → 不进文本内容，**选中复制不受影响**；不搬动任何原有节点；
- `display:inline-block; width:<n>em; height:0` → 段落高度与插入前**逐像素一致**（实测 76.78 = 76.78），不撑高行距；宽度走 `--mdrazor-first-line-indent`，**改宽度无需重插**；
- 撤销只需删掉带类名的节点。

**避坑记录：**

1. **插入时机靠 MutationObserver，且 `apply()` 必须幂等** —— 阅读视图的 DOM 由 Obsidian 每次渲染重建。对每个 `.markdown-reading-view` 挂观察器（`childList+subtree`），回调用 rAF 合并成一次重新应用；`apply()` 只在「需要补而没补 / 需要摘而没摘」时动 DOM，因此自己插入的节点不会自激成死循环（多跑一轮即收敛）。观察器用 WeakSet 去重，避免重复挂。
2. **占位元素只在「功能开启 且 非严格换行」时插** —— 严格换行下 `<br>` 只可能来自**显式硬换行**（行尾两空格 / `\`），那在 CommonMark 里仍属同一段落，不该缩进（与实时预览侧「同段续行不缩进」一致）。`config-changed` 里筛 `strictLineBreaks` 时除重绘编辑器外也要重新应用阅读视图。
3. **排除容器与 styles.css 保持一致** —— 用 `p.closest('li, blockquote, .callout, td, th, figcaption, .markdown-embed, .markdown-embed-content')` 判定「不是正文段落」，与样式表的排除项同源；另外 `<br>` 是段落最后一个节点时（后面没内容）不插。
4. **作用域同样要收**（承接上一轮 Glimpse 提词器的问题）—— 只处理 `.markdown-reading-view .markdown-preview-view` 里的段落，提词器那种「借 `markdown-preview-view` 类但没有 `.markdown-reading-view` 祖先」的容器不受影响。
5. **端到端实测（真实浏览器 + 真实模块）** —— 无头实测台里搭了阅读视图 mock（正文段落 / 列表项 / callout / 尾随 `<br>` / 提词器风格容器各一），实测：正文段落 **2** 个占位、其余全 **0**；三行文本左边界 **[40, 40, 40]**（修前是 [40, 8, 8]）；严格换行时占位 **0**、切回非严格 **2**、卸载后 **0**。静态夹具 `scripts/fixtures/first-line-indent-mechanism.html` 也补了 E 组（手工放占位元素的等价形态）作为可肉眼核对的留档。

### 首行缩进：作用域收窄到真正的正文区域（修 Glimpse 提词器被误缩进）

**现象：** 用户反馈「这种缩进能否局限在正文区域，现在我 glimpse 插件的提词器也被影响了」。

**根因：** 两条作用域都过宽：
- **阅读视图侧**用了 `.markdown-preview-view p`。而 `markdown-preview-view` / `markdown-rendered` 常被第三方视图借去复用主题样式 —— Glimpse 提词器的内容容器就是 `glimpse-tp-content markdown-rendered markdown-preview-view`（见 `Glimpse/src/teleprompter.ts:408`，注释里写明是刻意挂的）。于是提词器里的 `<p>` 也吃到了 `text-indent`。
- **编辑器侧**没设门。扩展经 `registerEditorExtension` 注册，会挂到工作区里**所有** CM6 编辑器上，包括第三方视图自建的编辑区与画布文本节点。

**修法：**
- 阅读视图规则前缀加 `.markdown-reading-view`（asar 实证：app.css 里有 `.markdown-reading-view > .markdown-preview-view`，即阅读视图的规范结构），排除项同步加前缀。
- 编辑器侧在 `build()` 里加 `view.dom.closest('.markdown-source-view')` 判定（与 format-hider 同款），把范围收回到 Obsidian 自己的 Markdown 编辑器（源码模式与实时预览共用该容器）。

**避坑记录：**

1. **借类复用主题样式会让别人的按类规则外溢** —— 第三方视图把 `markdown-preview-view` / `markdown-rendered` 挂到自己容器上是常见做法（能白拿主题排版），代价是**任何**按这两个类写的插件 CSS 都会命中它。所以自己的规则不能只按这两个类选，必须再收一层到 Obsidian 的正文容器（阅读视图 `.markdown-reading-view`、编辑器 `.markdown-source-view`）。这两条都是 asar 实证过的规范结构。
2. **作用域两侧都要收，不能只改 CSS** —— 编辑器侧是 JS 加的行装饰，光改样式表拦不住（装饰会照样挂到第三方编辑器的行上）。
3. **验证用同一个夹具页做对照** —— `scripts/fixtures/first-line-indent-mechanism.html` 扩成四组：A 纯 CSS 双行都缩进（46/46）、B 插件只缩首行（46/14）、C 阅读视图正文缩进（40）、**D 提词器风格容器（有 `markdown-preview-view` 类、无 `.markdown-reading-view` 祖先）左边界 8 = 不缩进**。编辑器侧另在无头实测台加了一个「裸 CM6 编辑器」反例，实测 `bareEditorMarks: []`。

### 首行缩进：段落边界改为跟随 Obsidian 的「严格换行」设置

**现象：** 用户反馈「非严格换行，也即单回车，不会被当作是新行，从而遗漏了缩进」——按单回车分段时，只有整段第一行缩进，后续行齐左。

**根因：** 判定段落边界时按 CommonMark 语义处理（连续 `text` 行 = 同一段落，只有第一行是首行）。但 Obsidian 的**默认设置就是非严格换行**（asar 实证：默认设置表 `ME` 里 `strictLineBreaks: false`），此时单个换行在渲染中就是一次硬换行 —— 阅读视图里 `甲\n乙` 渲染成 `<p>甲<br>乙</p>`，实时预览里更是每行一个 `.cm-line`。用户按单回车写段落时，「一行即一段」，所以每个正文行都该缩进。

**修法：** 读 `app.vault.getConfig('strictLineBreaks')`（未进 typings，经类型收窄访问；取不到时按 Obsidian 默认值 false 处理）：
- **非严格（默认）**：每个 `text` 行都是段落首行，都缩进；
- **严格**：保持原行为，同段续行不缩进。
`config-changed` 事件里筛 `strictLineBreaks` 触发一次重绘（否则要等下次编辑才刷新）；段落判定缓存键加上该标志位。

**避坑记录：**

1. **阅读视图的固有差异改不了，已实测三种 CSS 方案全失败** —— 非严格换行下单个回车在 HTML 里只是 `<p>` 内的一个 `<br>`（`markdown-it` 的 `breaks: !strictLineBreaks`），而 `<br>` 之后的文本**拿不到 `text-indent`**：① `br{display:block}` 无效；② `br::after{content:"　　"}` 伪元素在 `<br>` 上根本不渲染；③ 把 `<p>` 改成 `flex-direction:column` 容器让 `<br>` 成为独立 flex 项也无效。另外用 `<span style="display:block">` 验证了**匿名块盒不会应用 `text-indent`**（Chromium 实测，量 `Range.getClientRects()` 的行框左边界）。结论：阅读视图只能缩进「CommonMark 段落」的首行 —— 这与它把整组单回车行渲染成**一个** `<p>` 的事实一致，已在设置项说明与 styles.css 注释里写明。
2. **回归用例要覆盖两种模式，且非严格模式的期望值没有第三方参考实现可对拍** —— 严格模式仍以 `@codemirror/lang-markdown` 的 `Paragraph` 为准；非严格模式是 Obsidian 的渲染选择（CommonMark 里没有这个概念），期望值只能来自渲染语义，脚本里已注明这一层「无参考实现」。另加了一条夹具不变量：**非严格结果必然是严格结果的超集**，多出来的必须全是同段续行（夹具里正是 L11 / L101 / L112 三处）。
3. **无头实测台要能切「严格换行」** —— 把 `obsidian` 桩扩成带 `stubVault.getConfig()` 的假 App，并走真实入口 `registerFirstLineIndent()`；同时给宿主补 `Element.prototype.setCssProps` 与 `window.activeDocument` 两个 Obsidian 全局（后者顺带发现 `window-scope.ts` 对 `activeDocument` 缺 `typeof` 守卫，已补）。实测结果：非严格 = 标记 `[0,1,5,20]`（硬换行续行**也**缩进，正是本次要修的）、严格 = `[0,5,20]`、关闭 = `[]`，来回切换即时生效。

### 设置开关「改了要重启才生效」：先证链路是通的，再修 4 处真实缺口

**现象：** 用户反馈「MDRazor 很多开关状态改变后，必须重启 Obsidian 才生效」。

**排查（四层证据，先证明链路本身没问题，再找缺口）：**

1. **静态审计 64 个设置键的消费点** —— 全部有实时路径：CM6 模块读 `syncConfig()` 写入的模块级配置对象；DOM / 事件模块读 `() => settings.X` 取值器；按钮 / 图标类开关在 `onChange` 里显式增删；body 类走 `apply*` 函数。
2. **机械审计设置面板的 38 个 `Setting` 块** —— 凡带 `addToggle` / `addSlider` 的一律调用了 `saveSettings()`，**0 处遗漏**。
3. **CM6 源码核实「空事务重绘」这条路** —— `view.dispatch({})` 产生的 `ViewUpdate.empty` 为 **false**（`get empty() { return this.flags == 0 && this.transactions.length == 0 }`，而 transactions 长度为 1）→ `EditorView.update()` 照常调 `updatePlugins()` → 各 `ViewPlugin.update()` 执行 → 随后 `DocView.update()` 重新收集装饰。所以 `repaintAllEditors()` 是有效的。
4. **端到端实测（真实 CM6 实跑，非推理）** —— 把真实的 `createFirstLineIndentExtension()` 塞进真实 CM6 实例（esbuild 打包 + `obsidian` 桩提供 `editorLivePreviewField` + Edge headless + CDP），关 → 开 → 关分别得到 **0 / 3 / 0** 个行装饰，且只落在 3 个正文段落上（硬换行续行、标题、列表、代码块、表格、引用全部排除）。**结论：开关 → 即时生效的链路本身是通的。**

**本次修掉的 4 处真实缺陷（症状与用户反馈一致）：**

1. **传播链可被单点异常静默掐断** — `saveSettings()` 里 `syncConfig()` → `repaintAllEditors()` → `dirFileCountRefresher.forceRefresh()` 顺序直连，任一步抛错后面全不执行且无日志 —— 表现正是「设置已保存、插件毫无反应、重启才生效」（重启走 onload，绕过了这条链）。现在逐段 try/catch + `console.error`，`dirFileCountRefresher?.`。
2. **body 运行态只挂 `activeDocument`（多窗口缺口）** — body 开关类与 CSS 变量原先只挂**当前活动窗口**的 document，popout / 悬浮编辑器窗口里的编辑器拿不到样式 → 那些窗口里「开关没生效」。新增 `src/controller/general/window-scope.ts` 的 `forEachDocument(app, fn)`（主窗口 + 各 leaf 的 ownerDocument，按 document 去重；用 `node.ownerDocument ?? node` 判定 —— popout 的 document 来自另一个 realm，`instanceof Document` 会失败），四个 body 类模块（当前行高亮 / 鼠标行高亮 / 首行缩进 / 光标行列表折叠）全部改为**全窗口应用**。
3. **重绘用 `instanceof MarkdownView`（跨 realm 失效）** — popout 的视图来自另一个 realm，`instanceof` 为假 → 那些编辑器不会被重绘。改为鸭子判定（`view.editor?.cm` 且 `dispatch` 是函数），并给单个编辑器加 try/catch 隔离（一个编辑器恰好处于一次更新中时不应连累其余）。
4. **`符号边界提示` 关掉后弹框不消失** — 它的 `update()` 只在 `selectionSet || docChanged || geometryChanged` 时走 `updateHint()`，而设置面板改开关只派发**空事务** → 已显示的弹框要等下次光标移动才消失。补一个「开关翻转」判定并清掉位置缓存。

**新增自愈点：** `applyRuntimeClasses()`（幂等、逐项异常隔离）统一由三处调用 —— `saveSettings()`、`workspace.on('layout-change')`（新开 popout / 悬浮窗口时补挂运行态）、设置面板 `display()`（打开面板即自愈）。

**后续排查判据：** 某个开关「改了没反应」时，先看控制台有没有 `[MDRazor] 应用「X」运行态失败`；没有报错则多半是**运行中的实例还是旧构建** —— Obsidian 只在插件 enable 时重读 `main.js` / `styles.css`（`loadPlugin` → `loadCSS` 每次都重读并注入新 `<style>`，旧的在 unload 时 detach），热重载没生效时表现就是「必须重启」。判断当前跑的是哪一版：看设置里有没有本次新增的项。

### 首行缩进：纯 CSS 做不到（浏览器实测），改由行分类器判定段落边界

**需求：** 通用设置页新增「首行缩进」开关（默认关闭）+ 宽度滑块（1~2 个中文字符），为**正文段落**首行缩进，排除标题 / 表格 / 列表 / callout / 引用 / 代码块等一切非正文块。

**实现位置：** `src/controller/general/first-line-indent-rules.ts`（纯函数行分类器）+ `src/controller/general/first-line-indent.ts`（CM6 行装饰 + body 开关类）+ `styles.css`（编辑器行与阅读视图 `<p>` 共用 `--mdrazor-first-line-indent`）+ 设置页通用区。

**避坑记录：**

1. **纯 CSS 无法实现「只缩段落首行」——这是本功能存在的唯一理由，已实测** — CodeMirror 里没有「段落」元素，一段硬换行的正文就是一串兄弟 `.cm-line`（CM6 基础主题 `.cm-line { display: block; padding: 0 2px 0 6px }`），而 `text-indent` 作用于**块级元素的首行**。用真实浏览器量 `Range.getClientRects()` 的首个左边界（探针页 `scripts/fixtures/first-line-indent-mechanism.html`，Edge headless + CDP，窗口 520×600 / 16px 字体 / 2em = 32px）：**给所有 `.cm-line` 写 `text-indent` → 两行左边界都是 46px（每一行都缩进）；只给段落首行挂类 → 首行 46px、续行 14px（齐左）**。基线 14px = body padding 8 + `.cm-line` padding-left 6。所以缩进位置必须由 JS 判定。阅读视图则相反：正文是真正的 `<p>`，纯 CSS + 排除项就够（本模块的样式表部分）。
2. **不要指望 Obsidian 的语法树给出段落节点（asar 实证，别再试第二次）** — 手工解包 `obsidian-1.13.7.asar` 的 `app.js`：Obsidian 的 markdown 语言是 **HyperMD 流式模式的 CM6 移植**（`StreamLanguage` + 自定义 `createParse`，见 `parseLine`）。它的节点类型由 token 串现造：`Ep(token, isLineClass)` → `NodeType.define({ name: token.replace(/ /g,'_'), props:[Sp|Mp] })`，即**节点名 = token 串把空格换成下划线**（`formatting_formatting-strong`、`HyperMD-header_HyperMD-header-1`）。而 `parseLine` **只为「带行类 token 的行」emit 一个覆盖整行的节点**，纯文本行（CM5 内联模式返回 null）**不产出任何节点** —— 整棵树里根本没有 `Paragraph` / `BulletList` 这类块级节点（`ATXHeading`/`FencedCode` 在整个 asar 里都不存在，`FencedCode` 那 3 处命中在 `lib/codemirror/markdown.js`，与 CM6 无关）。结论：**块结构只能自己判**，本项目其它模块用 `syntaxTree` 找 `formatting-*` 内联 token 的做法在这里不适用。
3. **自研行分类器要用参考实现对拍，别靠手感** — `first-line-indent-rules.ts` 是纯函数（不 import obsidian / CM6），用 esbuild 打进 Node 直接跑。期望值取自 **`@codemirror/lang-markdown`（@lezer/markdown，CommonMark+GFM 参考实现）对同一份夹具的 `Paragraph`（父节点为 `Document`）行号**，不是从本实现反推。夹具 `scripts/fixtures/first-line-indent.md` 覆盖 12 种块结构，跑 `npm run verify:indent` 回归（已做变异验证：去掉「续行不算段落首行」判定后夹具与内联用例双双变红）。**四处刻意偏离**已在脚本 `KNOWN_DEVIATIONS` 里逐条写明理由：属性区（参考实现不认 frontmatter）、`^block-id` 独占行、`%%注释%%` 独占行、表格末尾紧跟的不含 `|` 行（Obsidian 的 hypermd 表格在行式不匹配时 `wU()` 复位表格）。
4. **Setext 下划线必须早于分割线判定** — `HR_RE`（`(?:[-*_]\s*){3,}`）同样匹配 `---`，排在前面就会把 `段落\n---` 抢成「段落 + 分割线」，段落首行被误缩进（首版即此 bug，夹具里的多行 Setext 用例与内联用例同时抓到）。另需两个配套：**下划线行的判定要最先做**（上一行已按「下一行是下划线」改判为标题时置 `pendingSetextUnderline`，本行直接归为 heading），以及**多行段落 + 下划线要整段回溯改判**（连续 `text` 行全部改 heading），否则多行段落的第一行仍会被当成段落首行。
5. **表格行式复刻 Obsidian 而非 GFM** — Obsidian 的表格有两种模式：表头行有前导 `|` 为 NORMAL（此后每行须 `fU = /^\|/`），无前导 `|` 为 SIMPLE（此后每行须 `pU = /^\s*[^\|].*\|/`）；行式不匹配即 `wU()` 复位、表格结束。这与 @lezer/markdown 不同（后者会把不含 `|` 的后续行并进 Table 节点）。表格结束的那一行必须**继续走后续块判定**（不能 `continue`），否则会被整行吞掉。
6. **缩进只在实时预览 + 阅读视图生效，源码模式刻意不生效** — 缩进由行装饰（`editorLivePreviewField` 为真才建）驱动；源码模式下缩进会把源码本身推右，看起来像误输入的空格。判定逻辑本身与模式无关（源码模式的硬换行段落同样能正确识别），所以以后若要放开，删掉那一行 gate 即可。
7. **`text-indent` 不破坏 CM6 的光标定位** — CM6 的 `posAtCoords` 走 `caretPositionFromPoint` / `caretRangeFromPoint`（布局感知），`getClientRects` 也包含 `text-indent` 造成的偏移，故点击落点与选区矩形都自动跟随（`@codemirror/view` 里没有任何针对 `text-indent` 的特判，源码确认）。
8. **性能：段落判定按文档对象缓存** — 行分类是 O(行数) 的全篇扫描，只在 `doc` 对象变化（即文档真的改了）时重算，纯光标移动/滚动复用上次结果；装饰只给 `visibleRanges` 内的段落首行建，与空格可视化/打字机同量级。

## 2.6.6 (2026-09-28)

### 勾选框键盘编辑（← 选中状态字符）+ 任务判定对齐原生（asar 实证）

**实现位置：** `src/controller/list-enhancer/list-integration.ts`（`selectCheckboxStatusChar` + keydown ArrowLeft 分支）+ `src/controller/list-enhancer/enter-soft-break.ts`（勾选框继承判定 `/^\s*\[.\] /`）。

**避坑记录：**

1. **任务行判定以核心 `bO` 正则为准绳（asar 实证，勿再自行发明 `[xX]` 白名单）** — 手工解包 `resources/obsidian.asar` 里的 `app.js`（Node 解析 asar 头：偏移 12 处 u32 是 JSON 头长度，`files['app.js'].offset` 是**字符串**须 `Number()` 转换，数据区起点 = `16 + jsonSize + offset`），拿到三处铁证：任务行正则 `bO = /^([>\s]*)(([*+-] |(\d+)([.)] ))(?:\[(.)\] )?)?/` —— 方括号内**任意单字符**均算任务，且 **`]` 后必须紧跟空格**；复选框 widget 勾选态 = `" " !== content`（任意非空格字符都算已勾选）；`toggleCheckbox` 用 `\[.\]` 定位状态字符。用户反馈「`[-]`/`[z]` 回车续写退化」的根因即插件侧硬编码 `[xX]`，与核心判定不一致。
2. **← 在原子区间右边界是死键** — 单光标 ← 移入区间即被 `correctCursorPosition` 推回 `r.to`，净效果为零（卡住）。给这类「被纠正软禁」的边界加键盘编辑能力，做法是拦截 ← 改派发**选区**：选区（anchor ≠ head）天然被纠正逻辑跳过，不会被推回。
3. **选区触碰标记区间即拆 widget，与光标同权** — 复选框 widget 的拆除条件是「光标或选区与 `formatting-task` 区间重叠」，← 派发的选区因此自然退回原文渲染（状态字符高亮），无需自写渲染切换；列表符号区间未被选区触碰，照常渲染。键入替换选区后光标落回区间内，纠正链自动复位到 `r.to`、widget 恢复——「复位 + 恢复渲染」全程零新增代码。
4. **「取消选区回右边界」不要额外拦截** — 原生 ← / → 对选区的塌缩端点（左/右端）仍落在原子区间内，纠正链自动复位到 `r.to`，与期望行为完全一致；多写一层拦截反而要自己处理塌缩方向（head/anchor 哪端）与方向键语义分叉。
5. **压缩产物里搜正则字面量的转义坑** — app.js 正则字面量原样保留，但检索时 bash 双引号会把 `\\[` 吃成 `\[`、JS 字符串字面量又会把 `\]` 求值成 `]`，两层转义叠加导致 needle 静默变样（搜了个不存在的东西还以为搜过）。用 `String.fromCharCode(92)` 拼 needle 或写临时脚本文件，别在 `node -e "..."` 里裸写反斜杠。

### （并入 2.6.6）同日改动

### Callout 编辑面板：类型/元数据候选改用自带下拉（超屏 + 滚动不跟随）

**需求：** 类型候选下拉列表太长超出屏幕；滚动页面时下拉不跟随输入框、随页面滚走（用户实测反馈，首版实现为原生 `datalist`）。

**实现位置：** `src/controller/general/callout-enhancer.ts`（`addField` 重写 + 冒泡拦截清单补 `paste`/`drop`）、`styles.css`

**避坑记录：**

1. **原生 `datalist` 弹层不可控是两个症状的共同根因** — 弹层由浏览器绘制：①尺寸/样式不可控，类型候选 70 项（内置 30+ ∪ 片段扫描 ∪ 文档在用）直接超屏；②按**屏幕坐标**定位且由浏览器管理，Chromium 对嵌套滚动容器里的锚点不会重定位，编辑器一滚弹层留在原地。换自带下拉后两症状一并消失，且获得过滤/键盘导航/翻转方向等原生弹层给不了的控制权。
2. **滚动跟随选「in-scroller 绝对定位」而非「fixed + scroll 监听」** — 下拉 `position: absolute` 挂在字段内（字段 `position: relative`），与编辑器内容同处一个滚动上下文，跟随是**结构保证**的；fixed 方案要在 document 上捕获 scroll 重定位，合成器平滑滚动期可能滞后一帧（本项目行高亮已为 `:hover` 滞后付出过显式标记类的代价），还要处理多滚动容器。绝对定位唯一的风险是被祖先裁剪，见第 3 条。
3. **祖先裁剪有两类，`overflow` 只是一类（用户实测复现：下拉仍被关在 callout 显示域里）** — 本库 Callout.css 片段给 `.callout` 设了 `overflow: hidden`（圆角裁切用，grep 片段目录实证），核心 `.callout` 同款、核心 `.cm-embed-block:hover` 也有 —— 这类用编辑态 `overflow: visible !important` 解除。但首版修复后用户实测下拉仍被截断，从 asar 里解出核心 app.css 才找到真凶：**`.markdown-source-view.mod-cm6 .cm-content > [contenteditable=false] { contain: paint !important }`** —— callout 块 widget 正是 `.cm-content` 的直接子节点且 `contenteditable=false`，`contain: paint` 把**所有后代**的绘制裁在 widget 盒内，且 `overflow: visible` 对它无效。修法：编辑态对 widget 补 `contain: none !important`（特异性 (0,6,0)+!important 压过核心 (0,4,0)+!important）。**教训：「浮层被裁」要查两道闸 —— `overflow` 之外还有 `contain: paint`（以及 filter/clip-path 等），只解前者可能白改。**
4. **解除 `contain: paint` 必须补 `isolation: isolate`，否则编辑态配色突变** — 渲染态 widget 的 paint 隔离顺带**中和**了 callout 的 `mix-blend-mode`：本库主题 Ethereal 经 `--callout-blend-mode` → `--highlight-mix-blend-mode` 传入 **darken**（theme.css 实证）。contain 在时，callout 对着隔离组的透明底混合 = 无效，外观即普通 alpha 合成；只解除 contain 的话，darken 会突然作用于真实页面背景，编辑态配色与渲染态不一致。`isolation: isolate` 提供等价的混合隔离但**不裁剪绘制**，正好补位。另补 `z-index: 1`：下拉伸出 widget 后要盖过排在后面的兄弟 embed-block（核心给它们设了 `position: relative`，按 DOM 序会绘制在下拉之上）。
5. **pointerdown preventDefault 与 2026-09-23 第 13 条同坑同解** — 在下拉容器上对 pointerdown preventDefault（保住输入框焦点：否则 mousedown 默认行为让输入框失焦，blur 先一步收起下拉、条目根本点不到）会连带取消后续兼容鼠标事件（mousedown/click），所以**选中逻辑必须直接挂条目的 pointerdown**，不能依赖 click。
6. **Esc/Enter 的层级：下拉开着时先只动下拉** — 面板级 keydown（挂在 `.callout` 上）对 Escape 是「提交并关闭会话」、对 Enter（标题框）是「跳正文」。下拉展开时这两键必须在 input 自己的 keydown（target 阶段先于面板级冒泡）里 preventDefault + stopPropagation；下拉关闭时放行冒泡，维持面板原有行为。
7. **过滤用「不区分大小写子串」，零匹配必须收起** — 空串显示全部；每次输入重建条目（70 项重建成本可忽略）。`open()` 里零匹配若只提前 return 不 `close()`，`is-open` 还挂着，会留下一个空白弹层。
8. **向上翻只在展开时算一次** — 按「输入框到 `.cm-scroller` 底/顶的剩余空间」与下拉实际高度（+4px 展开间隙）比较决定 `is-up`；此后滚动由绝对定位天然跟随，无需重算。滚动容器选 `.cm-scroller` 而非 viewport：编辑器视口裁剪来自它（比 viewport 更紧，中间层已由第 3 条解除）。
9. **`overscroll-behavior: contain`** — 下拉内部滚到底后继续滚，滚动链会交给编辑器滚动容器，正在挑候选时整个编辑器跟着滚。contain 把链截断在下拉内。
10. **顺带堵掉的潜伏 bug：`paste`/`drop` 此前不在冒泡拦截清单里** — 正文文本域有自己的 paste 处理器（preventDefault + stopPropagation），但类型/元数据输入框没有：粘贴事件一路冒泡进 CM6，若 CM 选区恰位于 callout 源码行首（很可能 —— 用户正对着这个 callout 编辑），粘贴兜底扩展会 preventDefault 并把内容写进文档 → widget 重建 → **编辑面板连同未提交内容当场销毁**。drop 同理。两者纳入 `swallowedEvents` 后，面板内任何输入路径都不再可能触碰文档。
11. **字段监听器零清理负担** — 自带下拉的所有监听都挂在面板自有节点（input / dropdown / 条目）上，面板随会话销毁即被 GC，没有任何 doc/window 级监听，无需 dispose（对比：挂在 `.callout` 上的监听必须清理，因为 `closeSession(false)` 后 callout 仍留在 DOM 里）。


### （并入 2.6.6）同日改动

### Callout 编辑面板：正文文本域高度随内容自适应增高

**需求：** 「编辑这个区块」面板的正文文本域高度应随输入自适应变大，而不是内容超出固定高度后用滚动条代替（用户实测反馈，附截图：文本域右侧出现滚动条与 resize 手柄）。

**实现位置：** `src/controller/general/callout-enhancer.ts`（`fitBodyHeight` + 监听接线）、`styles.css`

**避坑记录：**

1. **先置 `height: auto` 再按 `scrollHeight` 设值，顺序不能反** — `scrollHeight` 以**当前布局**计算：不先重置高度，内容删减后 `clientHeight` 仍是旧的大高度，而 `scrollHeight ≥ clientHeight`，测不出变矮，高度只会涨不会回落。置 auto 后 client 塌到 CSS 的 `min-height: 5em` 下限，空内容时 `scrollHeight = clientHeight` 稳定在 5em，不抖动。
2. **首测必须量在挂上「解除限宽」类之后** — 渲染态 callout widget 被主题限宽在 200px（见 2026-09-23 第 14 条），`WIDGET_EDITING_CLASS` 挂上后才是全宽。若在挂类前测量，按 200px 折行，首测高度虚高，面板一打开就多出一段空白。故 `openEditor` 里的首测放在 `addClass(WIDGET_EDITING_CLASS)` 之后。
3. **宽度变化必须由 ResizeObserver 兜底，否则滚动条换个时机卷土重来** — 高度适配只挂在 input/粘贴上；窗口缩放、侧栏开合会改文本域宽度 → 折行数变化 → 内容变高但高度没动 → 滚动条重现（正是本次要消灭的东西）。ResizeObserver 挂在文本域自身上：初次 observe 必回调一次，兜住挂载后的最终宽度（与 openEditor 的首测重复，但高度已一致时写回不改变布局，不形成回调循环——fit 是幂等的）。ResizeObserver 在 iOS WKWebView / Android WebView 均可用（iOS 13.4+），移动端无兼容问题。
4. **粘贴是程序化赋值，不触发 `input` 事件** — `insertIntoTextarea` 直接改 `value` 并 `setSelectionRange`，浏览器不为程序化赋值派发 input，故粘贴路径单独调一次 `fitBodyHeight`。IME 组合输入（中文输入法）期间 input 照常派发且组合文本计入 value，增高跟随组合内容，无需专门处理。
5. **`resize: vertical` 与自适应互相矛盾，去手柄** — 自适应后每次输入都重设高度，用户拖大的尺寸在下一次按键即被抹掉；留着手柄只会制造「拖了又缩回去」的怪异感。`min-height: 5em` 保留为下限。不采用 CSS `field-sizing: content`：WKWebView 尚未支持，移动端会退化，scrollHeight 方案全平台一致。
6. **动态样式必须走 `setCssProps`，不能 `el.style.height = ...` 直赋** — 审核环境的 `eslint-plugin-obsidianmd` 0.4.x 有 `no-static-styles-assignment`（error 级），直赋直接 lint 红。`setCssProps` 内部就是逐键 `style.setProperty`，对标准属性同样有效（`{ height: '85px' }`）；两次调用之间读 `scrollHeight` 会强制同步布局，测量准确。


### （并入 2.6.6）同日改动

### 鼠标/滚轮行高亮：排除代码块

**需求：** 取消「鼠标/滚轮移动时行高亮」在代码块上的悬停高亮——代码块自身已有底色，叠加后把语法高亮配色盖掉、块的左右边界也糊成一团。随后追加：代码块内的**光标**也改回原生（不再被本功能的「箭头光标」兜底覆盖）。

**实现位置：** `src/controller/general/mouse-line-highlight.ts`、`styles.css`

**避坑记录：**

1. **两条高亮入口必须成对改，只改一处必漏** — 本功能有两条并列路径（见文件头与 styles.css 注释）：鼠标**物理移动**走 CSS `:hover`（浏览器原生 hit-test，不经过 JS），滚动帧走 JS `elementFromPoint` + `.mdrazor-line-highlight` 标记类。**凡调整「哪些行参与高亮」，CSS 与 JS 都得改**：只改 JS，鼠标悬停照旧亮；只改 CSS，滚动帧仍会挂类（无视觉差异，但 DOM 写次数与语义不对）。
2. **代码块在 CM6 有两种形态，要分别排除** — ①源码态：`.cm-line.HyperMD-codeblock`（含 `-begin`/`-end`/`-bg` 变体），首尾两行围栏也在内；②实时预览未激活态：整个块被替换成一个块级 widget `.cm-preview-code-block`。同族 widget 的 DOM 已在本文件 2026-09-23 第 1 条记过：callout widget 是 `.cm-content` 的**直接子节点**、`.cm-line` 的兄弟 —— 即 widget **不在任何 `.cm-line` 内**，`:hover` 本就命中不到它。故 CSS 的 `:not(:has(.cm-preview-code-block))` 是**防御性**写法（万一某版本把它放进行内），真正必须的是 `.HyperMD-codeblock` 那条。
3. **「命中代码块」与「指针不在行上」必须区分，否则会走到中心回退** — `findLineUnderPointer()` 有一条为滚动条拖拽保留的回退：指针不在任何行上时用 `editorCenter()` 取编辑器中心那一行，保证滚动高亮不中断。而代码块 widget 不属于任何行（`closest('.cm-line')` 为 null），**天然会被误判成「指针不在行上」** → 回退中心 → 鼠标停在代码块上滚动时高亮跳到编辑器正中那一行（与鼠标位置毫无关系）。修法：先判 `isCodeBlockHit(hit)`（`closest('.HyperMD-codeblock, .cm-preview-code-block')`），命中即 `return null` **且不进入回退分支**；回退路径（中心点）同样补了这道判据。
4. **用 `:not()` 链而非 `:not(:is(...))`** — 写作 `.cm-line:not(.HyperMD-codeblock):not(:has(.cm-preview-code-block))`：两条 `:not()` 是 AND 关系、语义直观，而把 `:has()` 嵌进 `:is()` 里可读性明显更差。
5. **CM5 变体（`.CodeMirror-linebackground`）未同步排除** — 那两个选择器是旧版兼容分支，CM5 里行背景层自身不带 `HyperMD-codeblock`（该类挂在 `pre.CodeMirror-line` 上），加 `:not()` 不生效；且 Obsidian 1.6+ 全为 CM6，该分支实际是死代码，不值得为它绕路。
6. **「光标改回原生」要动两条规则，且不能只靠给 `*` 加 `:not()`** — 光标改写有两处：①`body.mdrazor-mouse-line-highlight-enabled .cm-line:hover`（**静止**悬停期生效，加 `:not()` 即可）；②`body.mdrazor-mouse-moving .markdown-source-view.mod-cm6 *`（**移动期**的「全编辑器加固」，`*` 通配 + `!important` 把所有后代一网打尽，代码块也被吃掉）。只改①，移动期代码块仍是箭头——而移动期恰恰是本功能的主要工作期，用户一移鼠标就能看到。②的修法不是给 `*` 加 `:not(.HyperMD-codeblock *)`（`:not()` 里塞带后代组合子的复杂选择器，兼容性与可读性都不划算），而是在它**之后**追加一条**更高特异性**的还原规则：`body.mdrazor-mouse-moving .markdown-source-view.mod-cm6 .HyperMD-codeblock` = `(0,4,1)`，压过加固规则的 `(0,3,1)`，同样 `!important`。
7. **还原用 `cursor: auto`，不用 `cursor: text`** — `.cm-line` 在 `.cm-content`（contenteditable）内，`auto` 由 UA 解析为 I-beam，正是原生；而实时预览未激活代码块的块级 widget **不在** contenteditable 内，`auto` 正好回到它自己的原生光标。一条 `auto` 同时覆盖两种形态，写成 `text` 反而会把 widget 内的光标也强行变成 I-beam（与原生不符）。

---

## 2.6.5 (2026-09-27)

### Callout 增强：单击不退回纯文本 + 就地编辑纯文本 + 粘贴自动补 `>`

**需求：** 设置 → 通用新增「Callout 增强」（默认开启）：实时预览下单击 callout 不使其退回纯文本；点「编辑这个区块」按钮时，在 callout 正常渲染的外观里就地编辑标题/正文纯文本；粘贴多行文本自动补全换行后的 `>` 并校验。

**实现位置：** `src/controller/general/callout-enhancer.ts`（新增）、`src/model/settings.ts`、`src/view/settings-tab.ts`、`src/controller/main.ts`、`styles.css`

**避坑记录：**

1. **实时预览的 callout 是 Obsidian 自己的 CM6 块级 replace widget，不是「带样式的引用行」** — 读本机 `obsidian-1.13.7.asar` 的 app.js/app.css 实证：DOM 为 `.cm-content` → `.cm-embed-block.cm-callout` → `.markdown-rendered` → `.callout`；`.cm-embed-block.cm-callout` 是 `.cm-content` 的**直接子节点**（`.cm-line` 的兄弟，不在任何 `.cm-line` 内），且渲染态下 `.callout-content` 里**没有** `.cm-line`/`.HyperMD-quote` —— 源码被整体替换掉了。`.HyperMD-quote` 只在**未渲染**（源码态）才出现。判据：渲染态查 `.callout-content .cm-line` 数量为 0。
2. **「单击就退回纯文本」的根因是选区重叠守卫，不是类切换** — Obsidian 只在「没有任何选区与 callout 源码区间重叠」时才发出该 widget：`m = t.hasFocus ? d.selection.ranges : []`、`if(!b(K,G)) C.push(w({widget:o,side:1,block:!0},K,G))`，其中 `IL(e,t,n){ return e.from<=n && e.to>=t }` —— **选区触碰区间边界也算重叠**。而单击会触发 Obsidian 自己的 `hookClickHandler` → `selectElement()`，后者派发**覆盖整个 callout 源码区间**的选区，widget 随即被撤掉。判据：点 callout 后若 `.cm-embed-block.cm-callout` 消失、`.cm-line.HyperMD-quote` 出现，即是这条链。
3. **捕获阶段 `preventDefault()` 即可阻断该选区派发，但必须同时拦 mousedown** — `Gm()` 挂的 click 监听器在 `event.defaultPrevented` 时直接跳过，故在 `workspace.containerEl` 上以 capture 监听 click 并 preventDefault 就能让 callout 保持渲染；然而 CM6 自己的 mousedown 处理器会把光标放进 widget 区间（边界也算重叠），widget 会在 click 之前就被撤掉，click 处理器那时已拿不到 widget —— 两者缺一不可。
4. **必须放行交互元素，否则会砸掉 callout 内的正常操作** — 一刀切拦截会连带屏蔽 callout 里的链接、折叠箭头（`.callout-fold`）、嵌入块。故除「编辑这个区块」按钮外，命中 `a / button / input / textarea / select / [contenteditable] / .callout-fold / .internal-link / .external-link / .markdown-embed / .interactive-child` 的点击一律放行原生行为。代价：在这些元素上点击仍可能触发原生退回纯文本，属可接受取舍。
5. **「保持官方 widget + 就地编辑那段源码」不可能，两者互斥** — widget 把源码替换掉了。故采用「**保留官方 `.callout` 外观容器、临时替换其内容**」：编辑期间给 `.callout` 加 `.mdrazor-callout-editing`，用 CSS 隐藏 `.callout-title`/`.callout-content`，并在同一个 `.callout` 内插入编辑面板（图标从原 `.callout-icon` 克隆，配色沿用 `rgb(var(--callout-color))`），边框/底色/圆角/主题变量全部照旧 → 外观与官方渲染一致。提交时把「标题 + 正文行」重建为 `> [!type] title` + `> body` 写回，widget 随即重新渲染。
6. **编辑期间绝不改文档** — 一旦派发事务，Obsidian 会重建 widget、把编辑面板连同焦点一起销毁，输入直接断掉。故只在提交时派发一次；代价是编辑期间若 widget 被外部重建，未提交内容会丢失（`isConnected` 为假即放弃该会话）。
7. **编辑面板位于 `.cm-content` 内部，事件会冒泡进 CM6** — keydown/input/paste 等若不拦截，CM6 会同时改文档（光标乱跳、内容被改）。故对面板内 `keydown / keypress / keyup / beforeinput / input / cut / copy / mousedown / mouseup / click / dblclick / pointerdown / pointerup / focusin / focusout` 一律 `stopPropagation`。**「完成」按钮必须在 `closeSession` 之前 `stopPropagation`**：closeSession 会把面板（连同其上的监听器）从文档摘除，而事件传播路径在派发时已确定，之后仍会继续冒泡到 `.cm-content`。
8. **`closeSession` 必须早于抓取 DOM 引用** — 提交上一个会话会触发重渲染；若先抓 `calloutEl` 再提交，新面板会被建到已脱离文档的节点上（不可见）。
9. **`posAtDOM` 不足以定位 widget 区间** — 块级 replace widget 的 `posAtDOM` 在不同 CM6 版本可能落在区间起点、终点或紧邻位置。故同时用「DOM 映射 + 坐标映射」取候选，各自再试 ±1 偏移，取第一个能解析出 callout 的结果；解析不出即返回 null（宁可不打开面板，也不误伤普通引用块）。
10. **粘贴自动补 `>` 与校验** — 正文文本域粘贴时先规范化（CRLF/CR → LF、剥掉粘贴内容里已有的 `>`/`> ` 前缀以免出现 `> >`、去行尾空白），提交时每行统一补 `>`（空行补 `>` 本身）。另注册一个保守的 CM6 粘贴兜底：仅当光标位于 callout 源码**行首**且粘贴内容为多行时才按 `>` 前缀展开，其余一律放行原生粘贴。
11. **`createEl('input'|'textarea')` 已由 obsidian.d.ts 的泛型重载推断出元素类型** — 再写 `as HTMLInputElement` 会被 `@typescript-eslint/no-unnecessary-type-assertion` 判错（`npm run lint` 全量必跑才看得到）。
12. **`target.closest(交互选择器)` 会向上匹配到编辑器自身 —— 抑制逻辑「永不执行」的真凶（用户实测复现）** — 首版放行交互元素时直接写 `target.closest(INTERACTIVE_SELECTOR)`，而该选择器含 `[contenteditable="true"]`：编辑器自身的 `.cm-content` 正是 `contenteditable="true"`，且是 callout widget 的**祖先**。于是**编辑器内任何点击**（含点 callout）都命中「交互元素」→ 提前 return → 既不 preventDefault 也不 stopPropagation → 单击 callout 照旧退回纯文本。**修法：判定必须限定在 widget 内部** —— `hit !== widget && widget.contains(hit)`；祖先（`.cm-content`）不满足 `contains`，故不再误判，而 widget 内的链接/折叠箭头/嵌入块仍正确放行。**教训：凡用 `closest()` 做「这个元素是不是我关心的那类」判定，都要再问一句「它会不会顺着祖先链匹配到我自己的容器」。**
13. **不要顺手拦 `pointerdown`** — 拦 `mousedown` + `click` 已足够（CM6 的选区放置走 `mousedown`，Obsidian 的 `selectElement` 走 `click`）；而对 `pointerdown` 调 `preventDefault()` 会让浏览器**不再派发兼容鼠标事件**（mousedown/mouseup/click），反而把本模块自己的 click 处理一起干掉。另注：对 `mousedown` 调 `preventDefault()` 不会取消后续的 `click`，两者互不冲突。

14. **callout widget 的宽度由主题决定，其右侧同一行的空白区不属于 widget（用户实测反馈）** — 本库 `Callout.css` 用 `width: fit-content` + `min-width: 200px`，实测 widget 盒 **200px 宽**、而 `.cm-content` **900px** 宽；`elementFromPoint(widget.right + 40, 行中线)` 返回 **`DIV.cm-content`** 本身（`closest('.cm-embed-block.cm-callout')` 为 null）。于是点这块空白照样退回纯文本。修法：`resolveCalloutWidget()` 在 DOM 祖先链未命中时退回**几何判定** —— 点击落在 `.cm-content` 矩形内、且 Y 落在某个 widget 的垂直带内、X 在其左边界之后，即认定属于该 callout。普通文本行的 Y 不会与 callout 垂直带重叠，故不误伤（已实测对照）。
15. **「保持渲染」与「可选中文本」可以并存，关键是 mousedown 只 stopPropagation、不 preventDefault** — 首版在 mousedown 上 preventDefault，顺带把浏览器原生文本选择也堵死了（用户实测反馈「希望能选中渲染后 callout 里的文本」）。改为只 `stopPropagation()`（阻断 CM6 的 MouseSelection 放置光标），把默认行为留给浏览器。**实测（obsidian 1.13.7）在 widget 内建立 DOM 选区后 widget 依然渲染**（`widgetStillRendered: true`、`.HyperMD-quote` 行数 0、CM6 选区不动）—— 即 **CM6 不同步落在 widget 内的 DOM 选区**，故不 preventDefault 是安全的。另在 `styles.css` 给 widget 加 `user-select: text`（可继承）确保文本可选。
16. **验证手法：用 window 冒泡探针判断「抑制是否执行」** — 我们的处理器在 `.workspace` 捕获阶段 `stopPropagation()`，事件**不会**到达 document/window 的冒泡监听器。因此不能用「读下游 `defaultPrevented`」判断，正确判据是**探针是否触发**：`probeFired === false` ⇒ 抑制执行了；`true` ⇒ 未执行。实测四例：点 callout 本体（`probeFired:false`，widget 保持）、点其右侧空白（`probeFired:false`，widget 保持）、点普通文本行（`probeFired:true`，光标正常移动到 L18，无过度抑制）、在 callout 内建 DOM 选区（widget 保持）。

17. **编辑态外观：不要隐藏官方 `.callout-title`，也不要重画标题行（用户实测反馈「非常丑，除了背景其他都没还原」）** — 首版用 `display: none` 把官方 `.callout-title` 和 `.callout-content` 一起隐藏，另起一行自画「图标克隆 + 类型徽标 + 输入框」。结果官方标题行的**图标、配色、字号、间距全被丢掉**，只剩 `.callout` 的底色像 callout。修法：**尽量不重画** ——
    - 标题输入框**插进官方 `.callout-title` 行内**（只隐藏 `.callout-title-inner` 的文字），于是 `color`、`font-size: var(--callout-title-size)`、`line-height`、`gap`、`padding` 全部从官方标题行**原样继承**；
    - 图标根本不碰（它是官方 DOM，本来就在）；
    - 删掉自造的类型徽标 `[!type]`（官方渲染不显示它，属多余 chrome）。
    实测对齐结果（同一 callout，编辑态 vs 渲染态）：标题行高 **34px = 34px**、`padding 4px 12px` 一致、`color rgb(218,218,218)` 一致、`font-size 20px` 一致、图标 **18×18 / `rgb(138,92,245)` / display:flex** 一致、`.callout` 的 `backgroundColor`（`oklch(0.603458 0.21722 292.49 / 0.1)`）/ `borderLeftColor` / `borderRadius` / `mixBlendMode` 全部一致。
18. **`input` 的固有高度会把标题行撑高 4px** — 输入框设 `padding: 0; border: none` 后实测仍比官方标题文字高 4px（30 vs 26），导致标题行 38px vs 渲染态 34px。修法：显式 `height: 1.3em`（随字号缩放），并把下划线从 `border-bottom` 换成 **`box-shadow: inset 0 -1px 0 0 color-mix(...)`** —— box-shadow 不参与布局，改后标题行回到 **34px**、输入框 26px。
19. **复刻内边距要读官方元素的「计算值」，不要信 CSS 变量** — 首版用 `padding: var(--callout-content-padding)`，实测本库该变量解析为 **0**（官方 `.callout-content` 的真实计算内边距是 `0px 12px`，来自主题/片段的直接声明），文本域因此贴边。修法：打开面板时读 `getComputedStyle(contentEl).padding` 与 `.backgroundColor`，经 `setCssProps()` 以自定义属性（`--mdrazor-callout-content-padding` / `--mdrazor-callout-content-bg`）下发到文本域。改后 `0px/12px` 与官方一致。**通用教训：主题/片段可以用直接声明覆盖掉变量，跨主题取样式时「读计算值」比「读变量」可靠。**
20. **编辑态必须解除主题对 widget 的限宽（用户实测反馈「文本区域被限宽」）** — 本库 `Callout.css` 用 `width: fit-content` + `min-width: 200px`，实测渲染态 widget 仅 **200px**（长 callout 351px），直接放文本域窄到不可用。修法：编辑期间给 **widget 本身**（不只是 `.callout`）挂 `mdrazor-callout-widget-editing`，CSS 对 widget 与 `.callout` 同时 `width: 100% !important; max-width: 100%`。实测编辑态 widget 与文本域均为 **900px**（= `.cm-content` 宽）。

21. **表单控件在 `:hover` 下会被核心规则改底色（用户实测反馈「文本区域鼠标悬停导致背景色被覆盖」）** — Obsidian 核心有
    `@media (hover:hover){ textarea:hover{ background-color: var(--background-modifier-form-field-hover); border-color: var(--background-modifier-border-hover) } }`，
    其特异性 `(0,1,1)` **高于**裸类名 `.mdrazor-callout-editor-body` 的 `(0,1,0)`，只写基础态时鼠标一悬停就被换成表单字段底色。同类规则还有 `input[type='text']:hover`、`select:hover`（同样命中类型/元数据/折叠控件）。
    修法（双保险）：① 选择器加 `.callout.mdrazor-callout-editing` 前缀把特异性提到 `(0,3,0)` 并逐一列出 `:hover/:active/:focus`；② 对面板自己的控件直接在 `background`/`border`/`box-shadow` 上加 `!important` —— **合成事件无法触发真实 `:hover`**（浏览器不把合成 mousemove 当作指针悬停），故不能靠实测验证，只能靠锁死声明消除不确定性。标题输入框当初侥幸没事，只因它的选择器本身就是 `(0,4,0)`。
22. **callout 头部的完整语法是 `> [!type|metadata]+ title`** — `|metadata` 在方括号内、折叠标记 `+`/`-` 在方括号之后。Obsidian 自身**不解释** metadata，只写进 `data-callout-metadata` 供主题/片段选择器使用。故「居中」这类能力不是核心语法，而是片段约定：本库 `MCL Multi Column.css` 用 `[data-callout-metadata*="center"]{ text-align:center }` 实现，笔记里则在用 `[!note|notitle]`。**判据：`[!type|metadata]` 中 `|` 前是类型、后是元数据，重建源码时顺序不能颠倒**（实测写回 `>[!warning|notitle]- ddd` 正确）。
23. **候选值要三个来源合并，只扫样式表会漏** — 首版只扫已加载样式表的 `data-callout` / `data-callout-metadata` 选择器：类型捞到 38 个（含本库自定义的 kanban/timeline/def），但**元数据捞到 0 个** —— 因为 `MCL Multi Column.css` 片段**并未启用**（未启用的片段不进入 `document.styleSheets`），而笔记里实际在用的 `notitle` 也没定义在任何已加载片段里。修法：合并三源 —— ① 内置类型列表；② 样式表扫描；③ **当前文档正文**里已出现的 `[!type|metadata]` 取值。改后元数据候选为 `caption / center / no-icon / notitle`。**通用教训：样式表扫描只能反映「已启用」的主题/片段，用户实际在用的语法还得从文档里捞。** 另注意跨域样式表读 `cssRules` 会抛错，须逐表 try/catch。缓存按 `css-change` 失效。

24. **`data-callout` 是类型、`data-callout-metadata` 才是 `|` 之后的内容（用户报「自定义 Callout.css 没生效」的真因）** — 实测（本机 obsidian 1.13.7，`Obsidian教程.md` 的 `>[!note|notitle]`）：
    ```
    data-callout="note"      data-callout-metadata="notitle"
    .callout[data-callout*="notitle"]            -> False   （用户原写法，不匹配）
    .callout[data-callout-metadata*="notitle"]   -> True    （正确写法）
    ```
    Obsidian 把方括号里 `|` **之前**的放 `data-callout`、**之后**的放 `data-callout-metadata`。用户三条规则因此全不生效（`display_titleInner` 实测仍是 `block`）。另两条同类问题：① `[!tips]` 是**自定义**类型（内置只有 `tip` 单数），故 `.callout[data-callout="tip"]` 匹配不到 `>[!tips]`（本库 `测试.md` 用 `tips`、`鸿音.md` 用 `tip`，两者并存）；② 想按「空标题/无标题」隐藏标题行，要选 `data-callout-metadata` 而不是 `data-callout`。**判据：调试 callout 样式前先读元素上的 `data-callout` / `data-callout-metadata` 实际取值，别按源码里的 `[!x|y]` 直接推选择器。**
25. **不预置任何元数据候选值（用户指出「原生不支持居中语法，删掉」）** — 首版预置了 `notitle / center / no-icon / caption`，但元数据完全是主题/片段的扩展点，**Obsidian 自身不存在「原生支持的元数据」**：`center` 依赖的 `MCL Multi Column.css` 片段并未启用（`appearance.json` 的 `enabledCssSnippets` 只有 `Highlight / TableStyle / Style-settings-style / Callout`），实测整个样式表里 `data-callout-metadata` 取值**一个都没有**。预置这类值会让用户以为选中即生效、实际什么都不做。改为**只从「当前文档实际在用」+「已加载样式表真正定义」两个来源取候选**（实测在 `Obsidian教程.md` 里正确得出 `["notitle"]`）。类型则仍保留内置列表（那是官方文档所列、真实存在的类型）。
26. **片段可能整行隐藏 `.callout-title`，会把插在该行内的标题输入框一起藏掉** — 编辑面板的标题输入框寄生在官方 `.callout-title` 行内（见第 17 条），而片段可以写 `.callout[data-callout-metadata*="empty"] .callout-title{display:none}`。那样编辑时标题框不可见、无法改标题。修法：编辑态强制 `.callout.mdrazor-callout-editing > .callout-title{display:flex !important}` —— 只在编辑期间生效，其余时候完全尊重片段设置。实测编辑态 `titleRowDisplay` 为 `flex`。

**实测进展（全部在运行中的 Obsidian 1.13.7 里验证）：** 首版**失败**（单击仍退回纯文本，根因即第 12 条）→ 修复后点本体通过；用户复测又发现右侧空白区仍退回（第 14 条）→ 修复；用户要求可选中文本（第 15 条）→ 修复；用户反馈编辑态外观（第 17~20 条）→ 按实测逐项对齐；用户反馈悬停底色 + 要求类型/元数据/折叠可编辑（第 21~23 条）→ 已实现并实测；用户要求删掉非原生的居中语法并排查自定义片段失效（第 24~26 条）→ 已删除预置元数据、实测定位到 `data-callout-metadata` 选择器问题、并加固编辑态标题行。当前实测：面板含 2 个带候选下拉的输入框 + 3 选项折叠框；类型候选 38 项（内置 + 本库片段自定义），元数据候选按文档实测得出 `["notitle"]`；写回 `>[!tips] ddd` → `>[!warning|notitle]- ddd` 正确且幂等。**编辑面板的粘贴补 `>` 与 IME 输入仍待人工复验** —— 合成事件触达不到受信任行为；悬停底色同理（第 21 条已改用 `!important` 锁死）。

**本地迭代环境（重要）：** pjeby 的 hot-reload 只在**自身加载时**扫描 `.hotreload` 标记，事后补建不会被发现；**执行一次「Reload app without saving」**（或重启应用）让它重新扫描后，改 `main.js` 即 1s 内自动重载（已实测：探针 1s 内触发），可自服务迭代、无需再麻烦用户。注意 `.hotreload` 未被 `.gitignore` 覆盖，提交前需自行决定是否忽略。

**诊断脚本追加进 `main.js` 的编码坑（曾导致插件加载失败，务必避免）：** 用 `Get-Content $f -Raw | Add-Content -Path main.js -Encoding UTF8` 追加**含中文**的脚本会炸 —— Windows PowerShell 5.1 的 `Get-Content` 默认按**系统 ANSI（本机 GBK）**读取，UTF-8 中文被误解码成乱码，其中某个字符被 JS 当作**行终止符**，使 `//` 注释提前结束、后半行变成代码，报 `SyntaxError: Unexpected token 'function'`。正确做法：`[System.IO.File]::ReadAllText($src, [Text.UTF8Encoding]::new($false))` 读、`[System.IO.File]::AppendAllText($dst, $body, [Text.UTF8Encoding]::new($false))` 写；**且追加后必须 `node --check main.js` 验证**（本次事故的直接原因就是漏了这一步）。临时诊断脚本一律写成**纯 ASCII** 最稳。

**质量门：** `tsc -noEmit -skipLibCheck`、`eslint .`（0 error，1 条既有 warning：settings-tab 未实现 `getSettingDefinitions()`）、`node esbuild.config.mjs production` 全通过；已确认 `main.js` 含 `mdrazor-callout-editor` / `mdrazor-callout-editing` / `calloutEnhancer` 等新符号。

### 热重载本插件 → 懒加载接管中的插件被无谓 flip（Glimpse 音乐面板被拆到右栏新分栏）

**现象：** 用户报告「右侧边栏莫名其妙弹了个 notice，然后音乐标签页跑到右栏下半区」。18:00 前后的文件时间戳链条：`MDRazor/main.js` 18:00:07（开发期重建）→ `md-razor-position-cache.mirror.json` 18:00:08（本插件卸载时镜像落盘）→ `community-plugins.json` 18:00:12 → `workspace.json` 18:00:13 → `Glimpse/data.json` 18:00:17。Obsidian 进程自 10:40 起未重启（排除「应用重启丢布局」）。

**根因（两条链）：**

1. hot-reload 检测到 `main.js` 变化 → `disablePlugin('md-razor')` → 本插件 `onload` 重跑 → `lazyLoadManager.start()`。旧 `start()` 对「当前已加载」的懒加载条目一律延迟 3s `flipToLazy()`；Glimpse 是唯一 `delay > 0` 且未休眠的条目（`md-razor-settings.json`：`glimpse: { delay: 500 }`）→ `disablePluginAndSave('glimpse')`（写 `community-plugins.json`，Glimpse 因此从持久化启用集合中消失）→ `enablePlugin('glimpse')`。
2. Glimpse 被卸载时 Obsidian 销毁其视图（该插件 `onunload` 明确不 `detachLeavesOfType`，清理交给 Obsidian）；重载后 `restoreLastPlayed()` → `ensureViewLoaded()` 发现音乐面板叶子已不存在 → 用 `getRightLeaf(true)` 重新挂载 —— 该参数是「新建标签组」而非「新建标签」，于是面板落在右栏新分栏里（Glimpse 侧同批修复）。

**修复：** `start()` / `flipToLazy()` 增加 `enabledPlugins.has(id)` 判据（只转换持久化启用的插件）。

**避坑记录：**

1. **`enablePlugin` / `disablePlugin` 与 `*AndSave` 的区别是判据关键** — 前者不改 `app.plugins.enabledPlugins`（也不写 `community-plugins.json`），后者两者都改。hot-reload 走前者，因此本插件 `onunload` 的恢复守卫 `!enabledPlugins.has(SELF_PLUGIN_ID)` 为假 → `restore()` 不执行；而 `flipToLazy` 走 `disablePluginAndSave` → 接管插件被持久化停用。这正好解释了「`community-plugins.json` 里没有 `glimpse`，但它仍在运行」这一看似矛盾的状态。
2. **`getRightLeaf` 的布尔参数是「新建标签组」** — Obsidian 1.13 运行时 `getSideLeaf(sideSplit, split)`：`split === true` 时向侧栏 `insertChild(-1, new WorkspaceTabs)` 再塞一个叶子（多切一个分栏）；`false` 时取 `children[0]` 后 `insertChild(-1, new WorkspaceLeaf)`（在首个标签组内新建空叶子，不触碰已有叶子、不 `setActiveLeaf`）。想「同组新增标签」必须传 `false`。
3. **判定「本插件是否被重载」的可靠信号** — `md-razor-position-cache.mirror.json` 在卸载时立即落盘（见 `position-persistence`），重建 `main.js` 后 1s 内刷新即证明 hot-reload 生效；再配合 `community-plugins.json` / `workspace.json` 的 mtime 是否被触碰，即可判断这次重载有没有产生跨插件副作用。
4. **本插件的懒加载会让接管插件处于「持久化停用 + 会话内运行」态** — 该状态下 hot-reload 不会重载它（`reload()` 开头 `if (!plugins.enabledPlugins.has(plugin)) return` 静默跳过），所以改 Glimpse 之类被接管插件的源码后，重建 `main.js` 不会在运行中的 Obsidian 里生效，需重启应用或先在第三方插件设置里启用该插件。


### （并入 2.6.5）同日改动

### callout 补偿的前提消失：片段侧 `inline-block` → `block + width: fit-content`

**现象：** 用户反馈「鼠标按住当前行的**上半部分**向右平移，选区落到**上一行**相应位置」（与 2.6.0 修复的「下半部落到下一行」方向相反），在 MDRazor简介.md 稳定复现，且同一块内软换行的续行不受影响。排查确认主因在 Ethereal 主题的连续标题规则（见避坑记录 1、2）；复核 callout 补偿时又发现它的前提本身也是同一族结构性问题，且片段侧已有等价、几何原生的写法（见避坑记录 3~5）。

**实现位置：** `styles.css`（注释改写；两条声明保留为兜底）

**避坑记录：**

1. **判据：逐行量「border-box 高度 vs 行进距」** — CM6 的行高表只累加每个行级子元素的 `getBoundingClientRect().height`（`measureVisibleLineHeights`，**不含 margin**），Y→行映射全靠它。所以任何让「盒高 ≠ 行进距」的写法都会让行高表与 DOM 位置产生**结构性**偏差，偏差带 = |盒高 − 行进距|，且 `view.measure()` / `requestMeasure()` 重测无效（重测读的还是同一个盒高）。方向判据：行高表偏低 → 每行**顶部**若干像素映射到**上一行**；行高表偏高 → 每行**底部**映射到**下一行**。块内软换行的续行不受影响（偏差只在元素顶部），这正是用户「同一块内换行不出问题」观察的由来。
2. **本次主因：Ethereal 主题连续标题规则的负 margin** — `.cm-line.HyperMD-header + .cm-line:not(.HyperMD-header):has(>br:only-child) + .cm-line.HyperMD-header { padding-top: var(--p-spacing); margin-top: calc(var(--p-spacing) * -1) !important }`（`--p-spacing` = 1rem = 20px）。它让盒高 = 内容高 + 20、行进距 = 内容高 → 行高表从该行起整体低 20px。真实编辑器实测（Obsidian 1.13.7 / Chrome 150，MDRazor简介.md）：该行起每一行 delta = **−20.00px**；**396 个探测点中 205 个**（每行顶部 dy=2/6/10/14/18）`posAtCoords`（precise true/false 均然）落到上一行；同点 `elementFromPoint` 与 `caretPositionFromPoint` 都指向**本行** → 排除 DOM 重叠与 caret 异常，确认是行高表选块错行（列仍由 caret 提供，故表现为「上一行**相应位置**」）。该规则的**真实目的**是：H3 标识（`::before`，`bottom: 60%` 定位）要贴在高亮带上沿、不向下压到折叠箭头，同时把两标题的高亮带拉近到 16px。主题侧已改为等价写法——保留标题 `padding-top: var(--p-spacing)`，改由**压缩中间空行高度**收紧间距（`line-height: calc(var(--line-height-main, 1.8) * 1em - var(--p-spacing))`，36 → 16px，且必须带 `:has(+ .cm-line.HyperMD-header)` 以免误伤「标题+空行+正文」）：实测标题盒（271.74 / 54.77）、正文位置、后续行位置**逐像素不变**，各行 delta 全 0，301 个探测点 0 个真实错行（仅 3 个落在视口外 `.cm-gap` 占位处，其 map 与映射一致，属 CM6 虚拟化正常行为）。
3. **补偿的哪一半在起作用（本次实测更正）** — 四组运行时注入对比（保留/去掉 `vertical-align` 与 `padding-bottom`）：**`vertical-align: bottom` 才是消除结构空隙的那一半**（widget 盒底对齐行盒底 → 行盒高 = widget 盒高 → 表一致；实测仅保留它、去掉 `padding-bottom` 时各行 delta 仍为 0）；`padding-bottom: 10px` 只是把原来那段 10px 空隙**留成视觉间距**（删掉仅少 10px 空白）。此前「两者都必需」的说法不准确：真正会出错的是**纯 inline-block 基线对齐**（只有片段、无任何补偿），即 2.6.0 记录的那个 10px bug。
4. **`fit-content` 就是 inline-block 的 shrink-to-fit** — 片段侧新写法 `display: block + width: fit-content`：宽度自适应逐像素一致（实测长/短 callout 350.88px / 86.34px，与 `inline-block` 完全相同；高度同为 120px），而块级 = Obsidian 原生几何（widget 自身即一行，无匿名行盒与 strut descent）→ 行高表天然一致（实测各行 delta 全 0）。**收益：结构性正确性回到 CSS 侧，不再依赖本插件**；本插件两条声明因此降级为兜底（对块级无效/仅视觉间距，对旧片段仍是关键）。
5. **`min-width: min(200px, 100%)` 的包含块陷阱** — 百分比的基准是**包含块**：加在**内层 `.callout`** 上时包含块是 widget 自身（自适应后仅 86px）→ `min(200px, 86px)` = 86px 自我抵消（实测短 callout 正是只有 86.34px）；**加在 widget（`.cm-callout`）上**时包含块是 `.cm-content`（整行宽）→ 取 200px 生效（实测短 callout 86.34 → **200.00px**，长 callout 350.88px 不变，几何仍全 0）。
6. **`:has()` 的开销实测（为保留精确选择器提供依据）** — 匹配范围极小：渲染中的 `.cm-line` 33 个、其中空行 7 个、其后跟标题的 **4** 个（CM6 只渲染视口；文档共 119 行）。style recalc 基准（切换一个行类 + 强制重算，µs/轮，5 次中位数）：baseline 59.5、**+20 份**旧选择器 `:has(>br:only-child)` 49.0、**+20 份**新选择器 `:has(+ .cm-line.HyperMD-header)` 51.9、**+20 份**无 `:has` 对照 46.9 —— 20 份复制体的差异与样本抖动（±10µs）同量级且符号为负（首次运行吃 JIT 预热），即单份规则边际开销 ≪ 1µs/次重算。原因：最右端先被 `.cm-line`、`:not(.HyperMD-header)` 廉价条件筛掉，`>br:only-child` 只对 7 个空行求值、`+ 标题` 只对其中 4 个求值；`:has()` 的失效传播是**兄弟范围**（改一行的类只重算自身与相邻兄弟），不是全文档。结论：值得为精度保留该选择器。
7. **验证方式（可复用）** — 把诊断脚本追加到 `main.js` 末尾（不改 `src/`），hot-reload 会在 1~2 秒内重载插件，随后把「逐行几何 + `posAtCoords` 落点 + `elementAtHeight`/`lineBlockAtHeight` 对照」写成 JSON 到库内；测完用原始 `main.js` 覆盖即可。两个坑：① 改主题后必须**强制重载主题**再测（`app.customCss.setTheme(app.customCss.theme)` + `requestMeasure()`），否则量到的是旧几何；② 探测点若落在视口外，`elementFromPoint`/caret 返回空、`posAtCoords(precise)` 返回 null，属 `.cm-gap` 虚拟化占位，不要当成错行。

## 2.6.4 (2026-09-16)

### 符号边界提示：弹框内 `|` 与光标对齐（CM6 的定位机制）

**现象：** 用户反馈「提示显示在光标的右侧」，希望框内的 `|` 与光标对齐——这样光标在标记内左右移动时，`|` 压住光标不动、只有弹框轮廓在动。实测改动前 `|` 与光标的距离随弹框内容长短在 10.6~39.2px 之间变化。

**实现位置：** `src/controller/format-hider/cursor-boundary-hint.ts`（`barAlignOffset()` + `Tooltip` 的 `create()`）

**避坑记录：**

1. **「弹框在光标右侧」是 CM6 的设计，不是 bug** — `tooltip.ts` 的 `writeMeasure` 里：
   `let left = ltr ? Math.max(space.left, Math.min(pos.left + offset.x, space.right - width)) : ...`
   即把弹框**左边缘**对齐到 `coordsAtPos(pos).left`，整框向右展开。而 `|` 又在左边缘再往右 `d = 描边 + 左内边距 + 左侧文本宽度 + | 字宽/2` 处。所以对齐只能靠 `offset` 反向补偿，不能指望 CM6 居中。
2. **`TooltipView.offset` 就是官方为此预留的钩子** — 注释原文 "Adjust the position of the tooltip relative to its anchor position"。注意它被包在 `Math.max/min` 内部，是「先叠加再裁剪」。
3. **在 `mount()` 里写 offset，而不是 `positioned()`** — `createTooltip()` 的顺序是：设 `position` / `top: Outside` / `left: 0px` → `container.insertBefore(dom)` → `mount(view)`，而真正的定位发生在之后的 `requestMeasure` 读写阶段。所以在 `mount` 里写好的 offset 首次定位即生效；`positioned(space)` 则是「定位之后」回调，在那里改 offset 得多一轮 measure 才生效（还要防抖收敛）。
4. **量的是框内相对量，因此与弹框当前屏幕位置无关** — `mount` 时弹框被临时摆在 `left: 0px; top: -10000px`，直接量绝对坐标没有意义；但量 `|` 字形中心 − 弹框左边缘不受影响，所以可以放心在这一刻测。
5. **`d` 用实测而不是字宽公式** — 公式版需要跟着 `--font-monospace`、字号、内边距（未来改样式）一起维护，且弹框字号（13px）与编辑器正文字号本来就不同。实测版自动适配。实测值与解析式吻合，可作交叉校验：`d = 7 + 左侧字数 × 7.15 + 3.57`（13px Consolas）。
6. **`create` 必须是新闭包** — `TooltipViewManager.update()` 用 `other.create == tip.create` 判断能否复用 tooltipView。若把 `create` 提成稳定引用以「省一次重建」，`mount` 就不再重跑，内容变化后偏移不会重测 —— 对齐会悄悄失效。这条与既有实现（每次新闭包）方向一致，别顺手优化掉。
7. **负偏移不会被左边界裁剪** — 取决于 `tooltipSpace`。CM6 默认 `windowSpace`（`{top:0, left:0, bottom:clientHeight, right:clientWidth}`），且从 Obsidian 的 `app.js` 里核对过 `cs`（该处实际生效的实现）就是 `windowSpace`，Obsidian 未自定义 `tooltipSpace`。所以 `space.left = 0`，`pos.left` 只要有十几像素就不会被裁 —— 否则光标贴近编辑器左缘时对齐会被裁掉。
8. **缩放/字体变化要重测，但别挂到 `viewportChanged`** — 偏移是按当前字号量的，缩放后失准。改挂 `geometryChanged`：核对了 CM6 `UpdateFlag.Geometry` 的**全部**赋值处（scaleX/scaleY 变化、padding 变化、`editorWidth` 变化、contentDOM 尺寸/高度变化、字符宽刷新），**滚动不在其中**（滚动只更新 `scrollTop`/`scrollAnchorHeight`），所以不会出现「每帧重建弹框」。强制重建复用「空格可视化开关翻转」那条既有路径。
9. **RTL 有意不处理** — RTL 分支公式是镜像的（`pos.left - width + offset.x`，以右边缘对齐锚点），同样的负偏移会推向反方向。故按 `view.textDirection !== Direction.LTR` 直接返回 0，保持原行为，不做想当然的镜像推导（无环境可验证）。

**验证方式（真实 CM6 实跑，非推理）：** 把真实的 `createCursorBoundaryHintExtension()` 塞进真实 CM6 实例，走 **HTML 下划线标签**这条纯正则路径产出真实隐藏装饰（不需要 Obsidian 的 markdown 解析器，其节点名 `formatting-*` 与 `@codemirror/lang-markdown` 完全不同，装 lang-markdown 也没用），并伪造 `.markdown-source-view.is-live-preview.mod-cm6` 祖先与 Obsidian 的 `createDiv`/`createSpan` 全局助手。9 个光标位置（含左/右为空、闭标签、长前缀）实测偏差全部 **0.00px**。

### 夜间模式弹框不可见（黑投影的幅度与背景亮度成正比）

**现象：** 白天模式的符号边界提示有边框+阴影、清晰可见；夜间模式几乎看不到弹框，只剩三个字符浮在半空。

**实现位置：** `styles.css`（`.theme-dark .mdrazor-boundary-hint.mdrazor-boundary-hint`）

**避坑记录：**

1. **别只盯描边，先算对比度** — 暗色描边 `--background-modifier-border`(#333) 对画布 `#1C1C1C` 是 **1.35:1**，反而略高于亮色 `#e4e4e4` 对白底的 **1.27:1**。所以「白天明显、夜间不可见」的锅不在描边，而在**阴影**：`rgba(0,0,0,0.15)` 的作用幅度与背景亮度成正比 —— 白底上压掉约 38 个色阶（`#fff`→`#D9D9D9`，一圈明显暗环），`#1C1C1C` 上只剩约 4 个（28→24），再被 8px 模糊摊开就没了。近黑区域没有「可压暗的余量」。
2. **填充与画布同色是另一半根因** — `background: var(--background-primary)` 与编辑器底色**完全一致**，层次感 100% 靠阴影。亮色下阴影顶得住，暗色下就塌了。
3. **暗色「提亮面」不要照抄 `--background-secondary`** — 在暗色下它通常比画布亮一档（Obsidian 默认色阶 base-20 > base-00；Ethereal 未覆盖、同样成立），但这是**约定而非合约**：实测 Blue Topaz 把它定成 `#151515`，比画布 `#202020` **更暗**，照用会让弹框变成下沉的凹面。改用 `color-mix(in srgb, var(--text-normal) 8%, var(--background-primary))` 从画布自身推导，「更亮」方向才在任意主题上稳定。
4. **`color-mix` 可用性** — Chromium 111 起支持；`minAppVersion` 1.6.6 → Electron ≥25 → Chromium ≥114，且 Obsidian 自己的 `app.css` 也在用（`--background-modifier-message: color-mix(in oklch, ...)`）。故未额外写降级声明（那会是不可达的死代码）。
5. **写解析脚本时注意序列化形式** — `getComputedStyle` 把 `color-mix()` 结果序列化成 `color(srgb 0.16 0.16 0.16)` 而非 `rgb(...)`，按 `rgb()` 匹配的解析器会拿到 null。另外探针 `body` 要同时带 `theme-dark` 与 `css-settings-manager` 两个类，Ethereal 的注入值块用的是 `body.theme-dark.css-settings-manager.theme-dark` 这种高特异性选择器。
6. **特异性** — `.theme-dark .mdrazor-boundary-hint.mdrazor-boundary-hint` = `(0,3,0)`，压过原有 `(0,2,0)` 规则，**无需 `!important`**（原规则当初就是为躲覆盖才写成双类）。白天模式零影响。
7. **取主题真实值的方法（可复用）** — 用 Obsidian 的 `app.css` + 主题 `theme.css` 在无头 Chromium 里做级联，再 `getComputedStyle(body).getPropertyValue('--x')` 读**解析后**的值（自定义属性的计算值会完成 `var()` 替换），比手读主题源码可靠。

### 无头验证环境的两个坑（可复用）

1. **`--virtual-time-budget` 下 rAF 只投递 1 帧**（实测 `frames=1`，定时器正常）。所以等待 CM6 的 measure 必须用 `setTimeout`，用「嵌套 rAF」会永久挂住；好在 CM6 的 measure 由那一帧驱动，定时器等它就够了。
2. **截图时把结果文本放在页面底部** — 若把结果写进页面顶部的 `<pre>`，写完会撑高页面，而弹框是 `position: fixed`（按写入前的布局定位），截图里看起来就整体错位，容易被误判成对齐失败。

---

## 2.6.3 (2026-09-15)

### 插件审核报错：屏蔽 obsidianmd 规则不被允许（本地绿、审核红的根因）

**现象：** 提交社区插件审核后收到
`Error: Disabling 'obsidianmd/prefer-file-manager-trash-file' is not allowed.`
（`src/controller/orphan-image-cleaner/orphan-image-cleaner.ts:295`）。而本地 `npm run lint` 一直是零输出。

**实现位置：** `src/controller/orphan-image-cleaner/orphan-image-cleaner.ts`、`package.json`、`manifest.json`、`eslint.config.mts`

**避坑记录：**

1. **根因是本地 lint 插件版本落后** — 本地 `eslint-plugin-obsidianmd` 是 **0.3.0**（2026-05-12），审核方用的是 **0.4.2**（2026-08-24）。0.4.x 新增依赖 `@eslint-community/eslint-plugin-eslint-comments`，并在推荐集里启用了 `eslint-comments/no-restricted-disable` —— **任何 obsidianmd 规则都不允许用 `eslint-disable` 屏蔽**。所以「本地全绿」不能代表审核能过，**必须把 lint 插件版本对齐审核环境**。
2. **0.4.x 还新开了两条会报警告的规则**（0.3.0 里都没有）：`prefer-create-el`（16 处 `createElement`）、`settings-tab/prefer-setting-definitions`。升级后一次暴露，趁这次一起清掉，免得下一轮审核再被挑。
3. **`no-unsupported-api` 会校验 minAppVersion** — 改用 `FileManager.trashFile()`（Obsidian ≥1.6.6）后立刻报
   `'FileManager.trashFile' requires Obsidian v1.6.6, but minAppVersion is 1.1.0`。manifest 的 `minAppVersion` 必须同步提到 1.6.6（`versions.json` 新条目也用 1.6.6）。**这条规则是把「声明的最低版本」变成硬约束的关键**：换 API 时不能只改代码。
4. **无法用「保留原行为 + 屏蔽规则」两全** — 原实现刻意用 `vault.trash(file, true)` 强制系统回收站（批量删除保证可恢复）。规则既然不可屏蔽，只能改用 `fileManager.trashFile()`（遵循用户「删除文件」偏好）。补偿手段是把删除方式写进弹框说明，让用户在勾选前知道会走哪条路径 —— **把「不可见的强制」换成「可见的告知」**，而不是默默降级。
5. **游离节点与已知父节点的转换方式不同** — `createDiv()` / `createSpan()` 是 `declare global` 里的**全局函数**（`import { createDiv } from 'obsidian'` 会 TS2305 报「没有导出该成员」），语义是「建一个游离节点」；而 `someEl.createDiv({cls, text})` 是 Node 上的方法，**会直接把新节点挂到 someEl 上**，因此原来紧跟的 `appendChild` 要一并删掉。注意：`doc.win.createDiv()` / `activeWindow.createDiv()` 是 lint 规则给出的建议，但**当前 typings 里 Window 没有这些助手**（`Window` 上只有 `activeWindow`/`activeDocument`/`sleep`/`nextFrame`），照抄会编译不过 —— 用编译器实测确认过，别照抄规则建议。
6. **顺带**：`eslint.config.mts` 的 `tseslint.config` 已废弃，改用 ESLint 核心的 `defineConfig`（官方 README 的写法：`defineConfig([globalIgnores([...]), {...}, ...obsidianmd.configs.recommended])`）。

---

## 2.6.2 (2026-09-15)

### 发布工作流幂等化：`Create release` 撞名导致的连续红叉

**现象：** `Release` 工作流在 2.5.15 / 2.5.16 / 2.6.0 / 2.6.1 连续四个版本红叉，失败步骤固定是 `Create release`（`Build plugin` 一直是 success）。

**实现位置：** `.github/workflows/release.yml`

**避坑记录：**

1. **根因是「先 API 建 release、再建 tag」这个顺序** — 工作流最后一步执行 `gh release create "$GITHUB_REF_NAME" main.js manifest.json styles.css`，而 release 已经由 REST API 建好了，同名必然报错。
2. **实测推翻了一条经验：API 建的 tag 照样会触发 `on: push: tags` 工作流** — 2.6.1 的 tag 是 `POST /git/refs` 建的，`actions/runs` 里照样出现 `Release #95`，`head_branch=2.6.1`、`event=push`。（此前在别的仓库观察到「API 建 tag 不触发工作流」，所以这条不能当结论用。）**判据是建完 tag 立刻查 `actions/runs` 看 `head_branch`**，别等也别猜。
3. **修法：探测式幂等** — `if gh release view "$TAG" >/dev/null 2>&1; then 打印现状并跳过; else gh release create ...; fi`。两条发版路径（API 优先 / 只推 tag 让工作流发版）从此都能收敛，不会再有一条必然红叉。
4. **已存在的 release 不覆盖资产** — 没有选择「存在则 `gh release upload --clobber`」：API 流程上传的三件套已按 digest 逐项核对过，让 CI 产物再覆盖一遍会把已核对的文件悄悄换掉（CI 与本地构建理论上一致，但不值得用「已校验」换「理论一致」）。
5. **排查顺序** — 这类红叉先看失败步骤名：`Create release` 失败 ≠ 构建失败，不必去查代码或依赖。

### 工作区切换菜单改用 Obsidian DOM 助手

**实现位置：** `src/controller/status-bar-enhancer/status-bar-enhancer.ts`

**避坑记录：**

1. **`prefer-create-el` 规则不在 recommended 配置里** — 官方 eslint 插件的 `document.createElement` → `createEl/createDiv` 规则存在且有 autofix，但 `recommended` 未启用，所以全量 lint 不会报它；它属「官方取向」而非硬门槛，顺手改掉即可。
2. **不要图省事写 `doc.createDiv()`** — `doc` 是 `Document`；该规则只把助手声明在 `Node` 接口上，而官方文档只承诺「每个 HTMLElement 都有 createEl」。把宿主换成**确定的 HTMLElement**（此处的 `statusBarEl` 与建好的 `menuEl`）才是有保证的写法，同时仍然建在正确的文档里（popout 兼容）。
3. **`createDiv` 会直接把节点挂到宿主上** — 因此 `menuEl.appendChild(item)` 要一并删掉；菜单最后仍用 `doc.body.appendChild(menuEl)` 整体移到 body（对已有父节点的元素是移动而非复制）。整段同步执行，不会出现「空菜单先闪一帧」。

---

## 2.6.1 (2026-09-15)

### 位置持久化在 CM6 更新周期内派发事务：报错 + 插件实例被静默销毁

**现象：** 用户库（learning-records，2.5.16）控制台报
`Error: Calls to EditorView.update are not allowed while an update is in progress`，
栈为 `restorePosition → onDocumentLoaded → ViewPlugin.update → EditorView.updatePlugins → EditorView.update → dispatchTransactions`。

**实现位置：** `src/controller/tab-enhancer/position-persistence.ts`

**避坑记录：**

1. **机制（读 `@codemirror/view/dist/index.js` 确认，不是猜）** — `EditorView.update()` 先 `this.updateState = Updating`，**之后**才 `this.updatePlugins(update)` 遍历 `PluginInstance.update()` 回调各插件的 `update()`；`updateState` 在 `finally` 里复位 Idle。因此插件 `update()` 内的任何 `view.dispatch()` 必然抛错 —— 栈里同时出现 `updatePlugins` 与 `plugin:<id>` 两帧即是判据。
2. **后果不止是控制台报错** — `PluginInstance.update()` 的 catch 会 `logException(..., "CodeMirror plugin crashed")` → `value.destroy()` → `deactivate()`（`spec` / `value` 置空）。该编辑器的光标/滚动追踪与恢复因此**永久失效**，直到视图重建；判定方式：`view.plugin(spec)` 变 `null`。排查「功能静默失效」时这是必查项。
3. **不是每次编辑都会踩到** — 只有 update 内真走到 dispatch 的分支才抛，即 `isFullDocReplace` 为真：`startState.doc.length === 0` 的首次加载，或 from 0 覆盖到全文的整档替换。所以「本机测试库怎么点都没事、用户那个库必现」的差别通常在**那个库装着会整档替换的插件**（Linter 全文件格式化、obsidian-git 自动拉取后重载、regex-replace 等）—— learning-records 的 `community-plugins.json` 里这三个都在。
4. **修法** — 判定（读 `update.startState` / `update.changes`）留在 `update()` 内，派发用 `queueMicrotask` 推迟到本轮更新之后：更新周期是同步的，微任务在本轮同步代码结束、浏览器渲染前执行，光标不会先落在映射后的位置再跳一帧（rAF 也能避开，但会晚一帧）。另补 `pendingRestore` 去重（同一轮内同一路径只派发一次）与 `destroyed` 标志（销毁后不再触碰视图）。仓库内既有约定已如此：`focus-options.ts` 顶部注释、`cursor-boundary-hint.ts`、`typewriter.ts` 都用 queueMicrotask，本文件是唯一遗漏处 —— 顺带审计了全部 ViewPlugin，其余只重建 decorations 或已推迟。
5. **验证（无头浏览器复现，不开 Obsidian）** — esbuild 以 `format: 'iife'` 打包「一个 ViewPlugin + 一次整档替换」的最小场景并**内联进 `file://` 页面**（`<script type="module">` 在 file:// 下会被 CORS 拦，内联成经典脚本就不用起本地服务），走 CDP 跑三种写法：现网写法 → 抛错且 `view.plugin(spec) === null`、光标未恢复；自行捕获写法 → 错误文本与用户栈逐帧一致；修复写法 → 派发成功、实例存活、光标恢复到目标位置。Windows 两个坑：`esbuild --alias:<pkg>=<path>` 在 Git Bash 里会被 MSYS 改写成 `/f/...` 导致解析失败（改用 JS API + `nodePaths`）；CDP 脚本要用 `env -u http_proxy -u https_proxy` 跑，否则 Node 的 `fetch` 到 `127.0.0.1` 会被代理拦掉。

### 按 Obsidian 审核规范复查：直接设样式等 14 项

**实现位置：** `styles.css`、`src/controller/command-surface/command-surface.ts`、`ribbon-manager.ts`、`status-bar-enhancer.ts`、`format-toggle.ts`、`link-opener.ts`、`vertical-tabs.ts`、`dir-file-count.ts`、`click-sync.ts`、`view/settings-tab.ts`

**避坑记录：**

1. **`no-static-styles-assignment` 只查字面量** — `el.style.color = 'red'` 报错，而 `el.style.width = myWidth`、含表达式的模板字符串不报。本插件 5 处赋值恰好都是条件表达式 / 模板字符串，`npm run lint` 因此一直是绿的；但人工审核看的是模式本身，故照改：布尔显隐 → `toggleClass('mdrazor-hidden', ...)`（`.mdrazor-hidden { display: none !important }`，`!important` 用于压过 `.status-bar-item` / `.setting-item` 等核心同优先级的 `display`）；动态定位 → `setCssProps({ '--mdrazor-menu-bottom': ... })`，定位规则收进 `styles.css`。注意该规则的白名单也只认自定义属性：`setCssProps({ color: 'blue' })` 同样会被报。
2. **必须跑全量 `eslint .`** — 此前只对改动文件跑 eslint，全量实际有 13 error + 1 warning：`instanceof HTMLElement`（跨窗口不安全）、async 事件回调、`activeLeaf` 已废弃、裸 `setTimeout`、`any` 遍历工作区分屏树、`caretRangeFromPoint` 废弃、多余类型断言。这也意味着 `lint.yml` 工作流此前一直在失败。
3. **两处有意保留** — ① `caretRangeFromPoint` 是 Chromium < 128（旧版 Electron 的 Obsidian）唯一可用的 caret 接口，经 `LegacyCaretDocument` 类型收窄保留兜底路径，不直接引用废弃成员，也不丢旧版兼容；② 失联图片清理仍用 `vault.trash(file, true)` 强制系统回收站（一次性批量删除，误勾选代价高，可恢复优先），加 eslint-disable 注明理由。

---

## 2.6.0 (2026-09-13)

### callout 之后的列表行下半部点击/拖拽选错行：callout 块 widget 行盒空隙被高度表漏测

**需求：** 测试.md 中「callout 语法之后的列表」上，点击行下半部光标落对行，但按住向右拖拽时选区从下一行同一列向右选中（callout 之前的列表无此问题）。

**实现位置：** `styles.css`（根因修复）、`src/controller/general/click-sync.ts`（mouseup 最终纠错兜底）

**避坑记录：**

1. **根因不是 Chrome caret 吸附（2.5.12 已治、失效），而是行高表结构性短测 10px** — 逐块实测（`.cm-content` 子级 DOM rect vs `view.lineBlockAt`/`elementAtHeight` 高度表）：callout 被 Obsidian 渲染为**块级 widget**（`.cm-embed-block.cm-callout`，`display: inline-block`，基线对齐），widget 盒（本主题 167..277，110px）**之下**还有约 10px 匿名行盒 strut descent 空隙才接下一行；CM6 高度表只按 widget 盒测量 → callout 之后每一行在 DOM 中的实际位置都比高度表低 10px（每个后续 block 的 deltaBottom = +10，之前的行为 0）。点击行下半部（底部 10px 带）→ `elementAtHeight` 选到下一块 → `posAtCoords`（precise true/false 均然）给下一行；拖拽每次 mousemove 重走同一映射 → 选区整段落下一行。`view.measure()` 同步重测**无效**（结构性差异，不是陈旧表）。
2. **修复 = 把空隙装进 widget 盒** — `vertical-align: bottom`（widget 盒底对齐所在行盒底，空隙消失）+ `padding-bottom: 10px`（把原空隙转成 widget 自身透明 padding）：视觉排版逐像素不变，widget 盒 120px 被高度表测量，deltaBottom 全部归零。实测装完后 posAtCoords 双精度均与 DOM 真值一致，点击同步全程零干预。
3. **click-sync 逐帧纠错之外的 mouseup 覆写洞（2.5.12–2.5.16 遗留）** — 强制复原坏几何复验时发现：原生 `MouseSelection.up()` 在 `this.dragging == null` 时用**最后一次 mousemove 坐标**重算并重发选区（`select(this.lastEvent)`），覆盖逐帧纠错的最终结果。dragging 为 null 的条件 = 按下瞬间 `isInPrimarySelection` 为真（状态选区非空且 DOM selection 为空 —— CM6 选区层不写 DOM selection，故**按下前存在任何非空选区**即命中），实测终态精确复现 `(start.pos, queryPos(lastEvent))` = 下一行同列。修复：click-sync 的 document mouseup 监听器（注册晚于原生 up() 的监听器，同一事件内后执行）在清空 activeDrag 之前，按 `correctedOnce` 门控再跑一次 `dragCorrection` —— 仅当本次拖拽确已发生过纠错才运行；内容拖拽（HTML5 dnd 期间无 mousemove 纠错、correctedOnce 恒 false）零干预。
4. **验证（本机自动化）** — SendInput 真实鼠标事件 + 事件级几何/选区日志：修复前点击行 23 下半部 → posTrue/posFalse 均 L24、拖拽终态 anchor L24；修复后同点 → posTrue/posFalse 均 L23、拖拽终态 anchor 252(L23)/head 263(L23)，与 callout 前控制行完全一致。强制坏几何 + 预置非空选区复验 mouseup 洞：修复前终态 (335 L25, 352 L25)，修复后终态 (252 L23, 263 L23)。
5. **样式注入时序** — Obsidian 在插件 enable 后**异步**注入 styles.css（实测约 1.5s 后才出现在 styleSheets），CM6 视图创建早于注入；注入瞬间会先量出「无 padding」的瞬时几何，随后 CM6 geometryChanged 自动重测恢复一致。用户正常启动顺序（插件 enable 先于编辑器打开）不受影响；查询「样式是否生效」须在 enable 后延迟探测，勿读视图构造时快照。

---

## 2.5.16 (2026-09-11)

### 失联图片清理：接入 Canvas 画布引用

**需求：** 清理失联图片时，Canvas 画布（`.canvas`）中引用的图片必须被识别为「已引用」，避免画布专属素材被当作失联图片误删。

**实现位置：** `src/controller/orphan-image-cleaner/orphan-image-cleaner.ts`

**避坑记录：**

1. **根因：扫描范围写死 `.md`** — 原实现 `allFiles.filter(f => f.extension === 'md')` 只读 Markdown，`.canvas` 从不进入 `vault.read()`，画布引用的图片 100% 落入失联集合；叠加弹窗默认全选 + `vault.trash()`，用户点一次确认即静默误删。这是数据丢失风险，不是「漏识别」。
2. **Canvas 必须按 JSON 结构解析，不能靠文本正则** — Canvas 是 JSON，主引用形式 `{"type":"file","file":"assets/a.png"}` 的 `file` 字段不在任何 Markdown 正则覆盖内；只有文本节点里手写的 `![[a.png]]` 会被正则误打误撞抓到。正确做法是遍历 `nodes`：`type==='file'` 取 `node.file`，`type==='text'` 把 `node.text` 交给既有提取，`type==='link'` 忽略（外部 URL）。
3. **解析失败必须退化而非跳过** — 被外部工具改坏的画布会让 `JSON.parse` 抛错，若直接跳过则又成新盲区。退化为「文本正则 + JSON 路径字段兜底」（`"file"\s*:\s*"..."` 与「以图片扩展名结尾的字符串值」）。
4. **路径解析改用官方 API，且各方式取并集** — 手写 `path.endsWith(normalized)` / `f.name === bareName` 在重名文件与相对路径场景会**漏算**，而漏算方向正是误删。新增 `metadataCache.getFirstLinkpathDest(ref, sourcePath)` 作为首选解析，并保留原有宽松匹配，**取并集而非短路返回**——多算只少删几张，漏算会删掉在用图片。
5. **JSON 转义斜杠** — Canvas 里路径可能写成 `assets\/a.png`，需在解析前 `.replace(/\\\//g, '/')` 还原。
6. **frontmatter 与松散文本载体是另外两个盲区** — 属性写法 `cover: "[[a.png]]"` 与 `cover: "assets/a.png"` 都要计入（递归遍历字符串 / 数组 / 嵌套对象，裸路径仅在以图片扩展名结尾时才认）；`.base` / `.excalidraw` / `.html` / `.txt` 无固定链接语法，需「语法正则 + 图片路径兜底」双管，单文件超 2 MB 跳过。
7. **模块级 `g` 正则要复位 `lastIndex`** — 复用带 `g` 的模块级正则跨文件调用时需显式 `pattern.lastIndex = 0`，并加零宽匹配防御，避免跨文件残留导致漏匹配。
8. **取舍：md 正文保持精确，不外扩路径兜底** — 笔记正文里「提到」文件名（散文中的 `a.png`）不算引用，否则清理功能会因日常提及而大量失效；只有松散载体（`.base` 等）才用路径兜底。外部 URL 仍保留同名兜底（保守）。删除前额外复查文件是否仍在库中，规避弹窗期间文件已被移走的竞态。
9. **架构决策：修复方是 MDRazor，不是 Trefoil** — 破坏性操作谁执行谁就要掌握完整引用图；让 Trefoil「主动适应」等于让 MDRazor 的正确性依赖另一个插件的存在与启用状态。且 `.canvas` 是 Obsidian 核心格式（`minAppVersion` 已 1.1.0），与由哪个插件打开无关。

**验证：** 用 esbuild 打包真实模块 + obsidian 桩，端到端跑 `cleanOrphanImages`：canvas 文件节点 / 文本节点 / 转义斜杠、损坏 canvas 兜底、`../` 相对路径、frontmatter 三种写法、`.base` 路径、外部 URL 保守兜底均命中；md 正文里的散文提及仍正确判为失联。

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
