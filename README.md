<div align="center">

# MDRazor

像剃刀一样精准打磨你的 Markdown 编辑体验。

[![GitHub Release](https://img.shields.io/github/v/release/Dyse-Sofqi/MDRazor?style=flat-square&logo=github&color=%2342b883)](https://github.com/Dyse-Sofqi/MDRazor/releases) [![License](https://img.shields.io/github/license/Dyse-Sofqi/MDRazor?style=flat-square&color=%2342b883)](LICENSE) [![Obsidian Min App](https://img.shields.io/badge/Obsidian-%5E1.0.0-%234a7ec1?style=flat-square&logo=obsidian&logoColor=%234a7ec1)](https://obsidian.md) [![GitHub Stars](https://img.shields.io/github/stars/Dyse-Sofqi/MDRazor?style=flat-square&logo=github&color=%23e4b341)](https://github.com/Dyse-Sofqi/MDRazor)

</div>

---

> 🇬🇧 **English**: scroll down to view the English README.

📜 完整更新记录见 [CHANGELOG](https://github.com/Dyse-Sofqi/MDRazor/blob/main/CHANGELOG.md)。插件更新到新版本后，首次启动会自动弹出本次更新的更新日志。

### 简介

MDRazor 是一款 Obsidian 插件，专注于提升 Markdown 编辑体验。
目前提供**通用**、**隐藏样式**、**列表增强**、**标签页**、**状态栏**、**左功能区**、**右键菜单**和**懒加载**八大功能模块，更多功能正在开发中。

MDRazor is an Obsidian plugin dedicated to honing your Markdown editing experience — like a razor. It ships **eight feature modules** — **General**, **Hidden Styling**, **List Enhancement**, **Tabs**, **Status Bar**, **Left Ribbon**, **Context Menu** and **Lazy Loading** — each independently toggleable in the settings panel, with more features under development.

### 关键词 / Keywords

- 隐藏格式标记 · 列表一体化（列一体化 / 勾选框一体化 / 退格提升层级）· 活动行列表符号折叠 · 回车软换行 · 选项聚焦 · 折叠同级列表/标题 · 目录聚焦 · 垂直标签页 · 打字机模式 · 自动保存工作区 · 自动清理失联图片 · 鼠标/滚轮移动时行高亮 · 当前行高亮 · 编辑器测量守护（行高表陈旧点击偏移根治）· 点击同步（点击/拖拽选错行根治，含 mouseup 最终纠错）· callout 之后行点击/拖拽错位根治（块 widget 行盒空隙并入测量）· 批量删除空行（Markdown 感知）
- 懒加载 · 配置休眠（停用不丢延迟）· 启动耗时统计 · 全局加载队列 · 自定义命令 · 隐藏命令 · 状态栏命令 · 右键菜单命令 · 图标选择 · 拖拽排序 · 符号边界提示 · 空格可视化 · 数据镜像兑底 · 中英文 i18n
- Hidden formatting marks · List integration (List Integration / Checkbox Integration / Backspace Level Promotion) · Fold via list bullet on the active line · Enter soft break · Focus list item · Fold sibling lists/headings · Folder focus · Vertical tabs · Typewriter mode · Workspace autosave · Orphan image cleanup · Mouse/wheel line highlight · Current line highlight · Editor measure guard (root-cure for stale line-height click offsets) · Click sync (root-cure for click/drag landing on the wrong line, incl. mouseup final correction) · Callout-following-row click/drag offset cure (block-widget line-box gap folded into measurement) · Batch empty-line deletion (Markdown-aware)
- Lazy loading · Dormant plugin configs (delays survive disabling) · Startup timing stats · Global load queue · Custom commands · Hidden commands · Status-bar commands · Context-menu commands · Icon picker · Drag-and-drop ordering · Symbol boundary hint · Whitespace visualization · Data mirror fallback · English/Chinese i18n


### 功能

功能按设置面板的八大区域组织，每项均可在设置面板中独立开关。

---

#### 🧰 通用

通用编辑体验设置，提供以下独立开关：

- **鼠标/滚轮移动时行高亮**（默认开启） — 鼠标移动或滚轮滚动时，鼠标所在行显示跟随高亮；鼠标/滚轮静止 300ms 后高亮自动熄灭。样式与「行高亮跟随鼠标」一致：半透明主题色背景（`--activeline-background`）+ 8px 圆角 + 22px 外扩光晕（box-shadow 外扩 + clip-path 圆角回收），滚动期间指针保持箭头样式不闪烁。滚动期间高亮与内容同步跟随（滚动捕获监听 + `elementFromPoint` 逐帧标记鼠标下方行），平滑滚动也不滞后。

- **当前行高亮**（默认关闭） — 编辑光标所在行常驻高亮（跟随编辑光标、与鼠标无关），仅编辑器聚焦时显示，失焦（如点击侧边栏）自动取消。不启用 Custom.css 时也能独立保持当前行高亮。默认关闭：与 Custom.css 的 `activeline-highlight` 效果一致，避免重复叠加。样式为半透明主题色背景 + 8px 圆角 + 22px 外扩光晕。

- **点击同步**（默认开启） — 修复点击/拖拽落到错误行：在行盒下半部点击时，浏览器 caret 会吸附到下一行行首（Chrome 已知行为；列表行首 `.list-bullet` 等元素节点会打断 CM6 的误吸附检测），导致点击不动、拖拽从下一行起选。本插件在点击与拖拽的全周期用真实 DOM 行映射校正光标/选区，原生结果正确时零干预。2.6.0 起补强两处：① **mouseup 最终纠错**——按下前已存在非空选区时，原生 MouseSelection 会在抬起时用最后一次移动坐标重发选区、覆盖逐帧纠错结果，现于同一抬起事件内补最后一次纠错，保证最终可见选区与 DOM 真值一致；② **callout 后行几何根因修复**——callout 块 widget 的匿名行盒在盒底之下多出约半个行高的空隙（CM6 行高表只量 widget 盒，导致其后每一行实际位置低 10px），现把空隙并入 widget 测量（`vertical-align: bottom` + 透明 `padding-bottom` 补偿，视觉逐像素不变），根治 callout 之后每一行下半部点击/拖拽错位到下一行的问题（该空隙由旧版 `display: inline-block` 核心样式复刻引发，插件侧已统一补偿，可与该类片段并存）。无需设置。

- **MD文档光标和滚轴位置持久化** — 设置入口在本模块（功能详见「标签页」节）。
- **清理本地持久化数据** — 设置入口在本模块（功能详见「数据存储」节；由原「清理本地数据」改名而来）。

---

#### ✂️ 隐藏样式

隐藏 Markdown 标记符号，光标移入时自动显示。更干净的实时预览，零干扰。

以下每种格式可独立开关：

- **隐藏加粗符号** — 隐藏 `**` 加粗标记符号
- **隐藏斜体符号** — 隐藏 `*` 斜体标记符号
- **隐藏高亮符号** — 隐藏 `==` 高亮标记符号
- **隐藏删除线符号** — 隐藏 `~~` 删除线标记符号
- **隐藏行内代码符号** — 隐藏 `` ` `` 行内代码标记符号
- **隐藏转义符号** — 隐藏 `\` 转义符号
- **隐藏标题符号** — 隐藏 `#` 标题标记符号（支持 H1-H6），`#` 后无空格时不隐藏
- **隐藏双链符号** — 隐藏 `[[` 和 `]]` 双链格式标记
- **隐藏 HTML 颜色标签** — 在实时预览中隐藏 `<font color="#c00000">` 和 `</font>` 等 Hex 颜色标签对
- **隐藏 HTML 下划线符号** — 在实时预览中隐藏 `<u>` 和 `</u>` 下划线 HTML 标签对
- **隐藏 HTML 行标签** — 在实时预览中隐藏 `<span>` 和 `</span>` HTML 标签对，涵盖带任意属性（如 `style="color:var(--color-yellow)"`、`style="color:#b58900"`、`style="background-color:rgba(...)"`、`style="text-decoration:underline"`）的开标签。围栏代码块、行内代码及数学公式内的 `<span>` 视为字面文本，自动跳过不隐藏
- **HTML 标签成对隐藏** — `<font>`/`<u>`/`<span>` 三类标签仅当开标签与闭标签成对出现时才隐藏；只检测到单边（如 `<u>` 后缺 `</u>`，或孤立 `</u>`）时该标签不隐藏，原文保持可见，便于发现未闭合标签

所有隐藏格式共享以下特性：

- 由于格式符号被隐藏，可以根据光标经过时光标的闪烁判断光标途径的距离。
- **健壮性** — 兼容数学公式（`$..$`）与格式标记（`**..**` 等）共存的行内内容。即使 Obsidian 解析器在此类行上产生异常语法树，也不会导致编辑器崩溃，公式正文绝不会被误当作格式标记隐藏。

👁️ **空格可视化** — 以半透明 `·` 标记显示空格位置，一目了然看清缩进和对齐。基于 CM6 视图范围迭代，仅处理可视行，性能开销极低。半透明样式不干扰编辑。已隐藏格式符号（如 `<span style="...">` HTML 标签）内的空格一并隐藏，不残留 `·`。作为隐藏样式区域中的一项独立开关。

🔍 **符号边界提示** — 光标处于格式标识符与文本内容边界时，在光标下方弹出小框，展示光标与隐藏标识符的位置关系（左/右两侧符号）。弹框原样展示完整隐藏标记（含组合标记如加粗+斜体的 `***`），不截断、不重复；空格可视化开启时弹框内空格同样以 `·` 展示。使用 CM6 `showTooltip` 系统，自动跟随光标位置、响应滚动和编辑器销毁生命周期。在隐藏样式设置区独立开关。

---

#### 🗑️ 左功能区

- **清理失联图片** — 在设置中启用后，左侧 ribbon 功能区出现垃圾桶图标按钮（trash-2）。点击后扫描库中所有 Markdown 笔记，提取四种图片引用语法（`![[path]]`、`[[path]]`、`![](path)`、`<img src>`），找出未被任何笔记引用过的图片文件（jpg/jpeg/png/gif/svg），弹出多选确认框（列表含勾选、路径、状态与缩略图，默认全选）供确认后移入系统回收站。确认时未勾选的图片记入白名单，下次弹框自动保持未勾选并置底显示，可重新勾选解除白名单。

- **自定义命令** — 在左功能区设置页可把 Obsidian 原生命令或插件命令添加为功能区图标：从命令列表选择 → 确认名称 → 选择 Lucide 图标（支持筛选）。列表项可删除、拖拽排序，顺序双向同步到左侧功能区。
- **隐藏命令** — 自动统计功能区现有命令（自定义 / 插件注册 / Obsidian 原生），以 eye / eye-off 按钮切换隐藏与显示；可拖拽排序并持久化，重启或功能区 DOM 重建后自动恢复。


---

#### 📝 列表增强

列表编辑体验优化，提供以下独立开关：

- **列一体化** — 将列表标记（`-`、`1.`、`*`）视为原子单元：光标定位跳过标记（点击 / Home / 方向键 / 程序化移动均不驻留标记区），退格键一次删除整个标记。光标永不驻留列表标记区，列表符号（圆点 / 自定义符号 / 折叠箭头）在光标所在行始终显示，不会退化为原始 `- ` 标记。编辑体验更接近所见即所得。

- **勾选框一体化** — 将任务项标记 `- [ ]`（含 `[ ]` 内的状态字符）视为原子单元：光标定位跳过、退格键一次整体删除标记；与「列一体化」同时开启时合并为一个整体区间（`- [ ]` 视为一个整体），只开勾选框一体化时 `[ ]` 单独作为一个原子单元。勾选框样式（复选框 widget）在光标所在行始终显示，不会退化为原始 `[ ]`；点击勾选框切换任务状态不受影响。

- **退格提升层级** — 光标位于一体化列表标记的右边界（`- |` 或 `- [ ] |`，即列一体化把光标推到的内容起点）时按 Backspace，不再整体删除标记，改为渐进退链：任务项先剥离勾选框（`- [ ] |` → `- |`，层级、缩进与内容不动）；再逐级提升——每按一次退格提升一级，整行缩进替换为父级缩进，内容保留、子树随行（其后的原同级项会因缩进关系成为其子项，与 Obsidian 原生 Shift+Tab 的行级语义一致），含内容的项同样提升；无更浅缩进的父级列表行（视为一级）时直接删除列表格式——移除行首缩进与标记，内容保留。有序任务项剥离勾选框后保留有序标记（`1. [ ] ` → `1. `）。需配合「列一体化」开启；「勾选框一体化」关闭时任务项无合并边界，退格链从 `- |` 位置才开始生效。

- **光标行列表符号折叠** — 实时预览中光标所在列表行（活动行）原本悬停列表符号不显示折叠箭头、点击列表符号也无法折叠/展开列表（Obsidian 原生在活动行禁用的机制）；开启后恢复与非活动行一致的折叠行为：悬停箭头正常显现、点击列表符号照常折叠/展开。任务行沿用原生规则。设置变更即时生效，无需重启。

- **回车软换行** — 在列表项内按 Enter 仅插入换行、缩进及两个空格（等效原生 `Shift+Enter` 行为），不新建列表项。需要新建列表项时，再按一次 Enter 即可，也就是连续回车新建列表项。适合多行列表项。任务项的勾选框继承：所属列表项带勾选框（`- [ ] ` / `- [x] `）时，连续回车新建的列表项同样以勾选框起头（默认未勾选，与 Obsidian 原生行为一致）。

- **选项聚焦** — 光标移入列表项时，自动折叠所有非直属内容（兄弟、父兄弟等），仅展开焦点链（当前项、其祖先、及其子孙）。深度嵌套列表导航不再眼花缭乱。鼠标未弹起时不触发折叠，避免拖选过程中闪烁。

  - **二级子项最大展开数** — 选项聚焦的子设置（滑块 1-9 + 开关）。开启后，一级项的第二级子项数量 ≤ 设定值时该一级项展开。仅影响一级项，其后代仍受选项聚焦影响。选项聚焦关闭时此设置自动禁用。

- **滚轴同步** — 选项聚焦的子开关（默认开启）。选项聚焦触发折叠/展开时，自动将光标所在行滚动至视口 25% 处，避免长列表伸缩使光标跑出视图外。选项聚焦关闭时此开关自动禁用。

- **上下键默认不跳过被折叠的列表/标题项** — 按下/上键时，若目标行是被折叠的列表项或标题内容，主动展开该折叠块并进入目标行（保持目标列），而非像 CodeMirror 原生那样整块跳过。光标连续导航不被折叠块阻断。**上键同级回跳（任意层级）**：按 ↑ 时若光标所在行是列表项、且上一行（或其续行）所属列表项的层级比当前更低（更深——如位于前一同级项子树末尾的深层项），光标直接跳转到上一个与当前层级相同的列表项所在行（被折叠挡住时同样展开进入），而非落入上一行所属的更深子树。适用于全部层级：二级遇三/四级及以上跳上一个二级，三级遇四级及以上跳上一个三级，依此类推；扫描跳过续行、遇空行/段落/标题等块边界即止，不跨列表块跳转。

- **展开/折叠同级列表或标题（命令）** — 以光标所在列表项/标题的折叠状态为基准，统一折叠或展开光标所在行自身及全文档所有同层级的列表项或标题（同为某级标题、或同为某缩进层级的列表项）：当前行已折叠则全部展开，未折叠则全部折叠。完成后弹出提示，告知实际折叠/展开了多少个同级标题或列表。在命令面板中触发，可在「设置 → 快捷键」中绑定快捷键（无需开关，常驻可用）。同时可在「设置 → 右键菜单」中开启右键菜单同名菜单项。

- **目录聚焦** — 点击文件列表中的文件夹名称时，仅展开该文件夹及其祖先链，同时折叠所有无关分支（同级、父同级、祖父同级等），专注当前目录结构。点击文件夹名称（非折叠箭头）触发，触发后再次点击同一个文件夹仅触发折叠状态的改变。若首次点击时目录已处于聚焦后的展开结构（无关分支均已折叠），则直接切换该文件夹的折叠状态，效果等同连续点击两次。折叠箭头可正常独立控制单层展开/折叠。

  - 🖱️ **空白区域展开** — 与目录聚焦共用开关（目录聚焦开启时可用）。点击文件列表空白区域时，展开所有一级文件夹，快速浏览全局目录结构。点击排序/筛选等操作区域不会误触。

- **显示目录文件数量** — 在文件浏览器的每个文件夹标题右侧显示直接子项（子文件夹 + 文件）数量，不递归统计子文件夹内的内容。数量随文件创建/删除实时更新。基于 Obsidian vault 事件监听，创建或删除文件后 200ms 自动刷新。字体大小与文件夹名称一致。

---

#### 📑 标签页

文件标签页管理，提供以下独立开关：

- **默认新标签页打开** — 单击文件目录中的文件时，若标签页已存在则跳转到该标签页，否则打开新标签页。右键菜单新建文件时同样在新标签页中打开。避免重复标签页，文件导航更高效。Ctrl/Meta+ 点击时恢复 Obsidian 原生行为（在新标签页中打开）；Shift+ 点击保留原生范围多选。

- **新标签页打开双链** — 在文档内点击双链（包括普通双链 `[[page]]`、别名双链 `[[page|alias]]`、块引用双链 `[[page#^blockid]]`）时，自动检测目标文档是否已存在标签页：若已存在则跳转到该标签页并定位到对应块位置（块引用时），否则在新标签页中打开。Ctrl/Meta+ 点击时恢复 Obsidian 原生行为。

- **新标签页打开书签** — 点击 Obsidian 核心插件「书签」视图中的文件书签时，自动检测目标文件是否已存在标签页：若已存在则跳转到该标签页，否则在新标签页中打开。Ctrl/Meta/Shift+ 点击时恢复 Obsidian 原生行为。

- **🗂️ 垂直标签页** — 在文件列表中为已打开的文件提供标签页管理。顶部添加切换按钮（`arrow-left-right` 图标），一键切换「仅标签页」视图，隐藏未打开的文件和空文件夹；已打开的文件标题右侧显示关闭按钮。支持「仅标签页」与「完整目录」两种视图切换。标签页视图下隐藏未打开的文件和空文件夹，专注当前工作文件。关闭按钮显示在标题右侧，一目了然。关闭当前激活标签页时自动聚焦上一个标签页，与原生标签栏行为一致。顶部「切换标签页视图」按钮可独立隐藏（见「展示/隐藏切换标签页视图按钮」开关），隐藏后仍可通过命令面板命令或快捷键切换视图。

- **目录展开关联标签页** — 开启后，从垂直标签页视图切换回文件列表时，仅展开包含已打开标签页的文件夹；关闭后，切换时恢复文件列表原来的展开结构。

- **MD文档光标和滚轴位置持久化** — 自动记录 Markdown 文档的光标与滚动位置，重新打开文档时还原上次位置。位置变更停止 250ms 后一次性记录最终位置（连续变更只记一次），关闭标签页时立即保存末位，性能开销低。位置记录保存在 Obsidian 配置目录（默认 `.obsidian/`）的 `md-razor-position-cache.json`，卸载重装插件后仍保留；旧版插件目录缓存（`position-cache.json`）首次加载时自动迁移。设置入口已移至「通用」模块。

- **打字机模式** — 开启后聚焦中部阅读带：视口高度分为顶部 1/8、中部 3/4、底部 1/8，死区（12.5%~87.5%）之外（顶部/底部 1/8）的行按「死区外的不透明度」淡化显示，死区内与当前行保持明亮。光标跨行时维持视觉位置：落入顶部 1/8 → 滚回死区上沿（12.5%）；落入底部 1/8 → 默认滚回死区下沿（87.5%）。子设置项「死区外的不透明度」为 0-100 数值拉杆（默认 50），100 为完全不淡化；子开关「允许文档头部留存空白区域」（默认开启）开启后在文档顶部预留视口高度 1/8 的空白，使光标位于文档第一行时也能滚入中部区域；子开关「死区下沿跳转上沿」（默认关闭）开启后，光标跨过死区下沿时跳到上沿（12.5%）而非滚回下沿。子设置项仅模式开启时显示。命令「开启/关闭打字机模式」（`mdrazor-toggle-typewriter`）可绑定快捷键，与设置开关双向同步。

---

#### 🖥️ 状态栏

状态栏功能，提供以下独立开关：

- **工作区切换** — 右下角状态栏显示工作区切换按钮：0-1 个工作区不显示、2 个工作区点击直接切换、3+ 个弹出浮层列表选切。切换后自动记录当前工作区名称。
- **自动更新工作区布局** — 切换或加载工作区时自动保存当前工作区布局，与 Obsidian 原生「加载工作区」功能及本插件工作区切换联动。
- **侧边栏伸缩按钮** — 状态栏最左侧显示按钮，点击一键折叠/展开左右侧边栏。
- **隐藏样式启闭按钮** — 状态栏最左侧显示「标识」按钮，一键开启/关闭所有格式隐藏样式（加粗、斜体、高亮、删除线、行内代码、转义符号、标题符号、双链符号、HTML 颜色标签、HTML 下划线符号、HTML 行标签），不影响空格可视化。按钮图标与设置面板中隐藏样式开关双向同步。命令面板命令 `mdrazor-toggle-formatting` 可绑定快捷键。

- **自定义命令** — 将任意命令添加为状态栏按钮（图标 + 名称），点击执行；支持删除与拖拽排序。
- **隐藏命令** — 检测状态栏中的 Obsidian 原生 / 插件注册 / 自定义命令，用 eye / eye-off 切换显示隐藏，支持排序并持久化。


---

#### 🖱️ 右键菜单

编辑器右键菜单增强，提供以下独立开关：

- **展开/折叠同级列表或标题** — 开启后，Markdown 编辑器右键菜单中显示同名菜单项（默认开启）。点击执行与命令面板命令完全相同的逻辑：以光标所在列表项/标题的折叠状态为基准，统一折叠或展开光标所在行自身及全文档所有同层级的列表项或标题（同为某级标题、或同为某缩进层级的列表项），完成后弹出提示告知实际折叠/展开了多少个同级标题或列表。关闭后右键菜单不再显示该项，命令面板命令与快捷键不受影响。

- **批量删除空行** — 开启后，Markdown 编辑器右键菜单中显示同名菜单项（默认开启）。有选中文本时删除选中范围内的所有空行，无选中时删除当前文档的所有空行；经编辑器替换执行，可 Ctrl/Cmd+Z 撤销。**Markdown 感知**：标题、分割线、表格、列表、引用块、代码块前后的空行，以及代码块内部、两个独立表格之间的空行会被保留（连续空行折叠为一个），仅删除段落之间、文档首尾、列表项与列表项之间、表格行与行之间的空行——避免破坏 表格/列表 等结构（粘贴复制的网页内容常带表格行间空行，删除后可正常渲染）。命令「批量删除空行」随插件注册、不受此开关影响，关闭菜单项后仍可通过命令面板或绑定快捷键触发。

- **自定义命令** — 将任意命令添加为编辑器右键菜单项（图标 + 名称），点击执行；支持删除与拖拽排序。
- **隐藏命令** — 捕获 Obsidian 原生 / 插件注册的自定义右键菜单项，用 eye / eye-off 切换显示隐藏，支持拖拽排序；菜单项按 section 以可折叠小标题分组展示。


---

#### 🚀 懒加载

控制社区插件启动时机，优化 Obsidian 冷启动体验，提供以下开关：

- **启用懒加载** — 总开关。开启后按下方的插件延迟列表逐个控制社区插件的启动；关闭则所有插件恢复 Obsidian 自然加载。总线前提供「立即检查」按钮。
- **立即检查** — 「启用懒加载」开关前的计时器按钮（tooltip「立即检查」）。点击弹出启动耗时检查弹窗：以「延迟 x s，启动耗时 x ms」单列合并展示所有已启用且延迟启动插件的实测加载耗时（含 onload）与配置延迟及加载状态（未开始/加载中/已完成/未测量），环境栏展示仓库文件数与社区插件数，弹窗底部可一键复制全文。因 Obsidian 原生「立即检查」弹窗不对外暴露，故复刻其按钮外观并自实现等效统计。
- **插件延迟列表** — 对范围内每个社区插件设置「延迟（秒）」输入框：延迟 > 0 即懒加载，0 即恢复即时加载；各插件延迟相对大小即构成启动顺序。插件启停由「设置 → 第三方插件」管理：**停用某插件时其延迟配置休眠保留**（条目变暗显示，延迟值不丢），重新启用后自动恢复接管，下次启动懒加载照常生效，无需重新设置；插件卸载时自动移除其配置。

> 说明：懒加载作用范围仅限社区插件；关闭总开关或插件卸载时自动恢复自然加载（已休眠的插件保持停用，不会被擅自启动）。

### 设置

在 Obsidian 设置 → 第三方插件 → MDRazor 中配置：

- **通用** — 2 个开关：鼠标/滚轮移动时行高亮、当前行高亮（「MD文档光标和滚轴位置持久化」与「清理本地持久化数据」的设置入口亦在本模块）
- **隐藏样式** — 13 个开关：加粗、斜体、高亮、删除线、行内代码、转义符号、标题符号、双链符号、HTML 颜色标签、HTML 下划线符号、HTML 行标签、空格可视化、符号边界提示
- **列表增强** — 12 个开关 + 1 个滑块：列一体化、勾选框一体化、退格提升层级、光标行列表符号折叠、回车软换行、选项聚焦（含二级子项最大展开数、滚轴同步）、上下键默认不跳过被折叠的列表/标题项、目录聚焦、显示目录文件数量（含仅显示直接子项数量）
- **标签页** — 9 个开关 + 1 个滑块：默认新标签页打开、垂直标签页、展示/隐藏切换标签页视图按钮、新标签页打开双链、新标签页打开书签、目录展开关联标签页、打字机模式（含死区外的不透明度、允许文档头部留存空白区域、死区下沿跳转上沿）
- **状态栏** — 4 个开关：工作区切换、自动更新工作区布局、侧边栏伸缩按钮、隐藏样式启闭按钮
- **左功能区** — 1 个开关：清理失联图片（启用后 ribbon 显示垃圾桶图标，扫描未引用图片）
- **右键菜单** — 2 个开关：展开/折叠同级列表或标题、批量删除空行（在编辑器右键菜单中添加同名菜单项；命令始终注册不受开关影响）
- **懒加载** — 1 个总开关 + 每插件延迟设置：启用懒加载、立即检查弹窗、社区插件延迟列表（逐插件延迟秒数；插件启停交给第三方插件设置管理，停用插件延迟配置休眠保留，重新启用自动恢复）
- **标签页切换** — 上述八大模块以标签页形式展示，避免设置列表过长；激活标签页在插件生命周期内记忆

---

### 数据存储

MDRazor 的两份数据文件保存在 Obsidian 配置目录（默认 `.obsidian/`）下，**不随插件卸载删除**，重装后可继续沿用：

- `.obsidian/md-razor-settings.json` — 全部设置：开关状态、自定义命令、隐藏命令、排序、懒加载延迟等
- `.obsidian/md-razor-position-cache.json` — 各文档的光标与滚轴位置记录

每次落盘时会在插件目录同步维护一份只读镜像（`data.json` / `position-cache.json` 命名）：配置目录下的主文件丢失或损坏时，从镜像自动恢复；主文件完好时镜像不参与读取。适用于同步盘 / 清理工具误删 `.obsidian` 下非标准文件的场景。

旧版本的数据文件（插件目录 `data.json` / `position-cache.json` 作为主文件的格式）在新版本首次加载时自动迁移，迁移后不再读写。卸载前如不再需要数据，可在 **设置 → 通用 → 清理本地持久化数据** 中清除（两个数据项默认不勾选 = 保留；勾选确认后即时生效）。

### 安装

#### 通过社区插件市场安装（推荐）

1. 打开 Obsidian → 设置 → 第三方插件 → 社区插件市场
2. 搜索 **MDRazor** 并安装
3. 在已安装插件列表中启用

#### 通过 BRAT 安装（预览版）

1. 安装 [BRAT](https://obsidian.md/plugins?id=obsidian42-brat) 插件
2. 在 BRAT 设置中添加 `Dyse-Sofqi/MDRazor`
3. 手动启用 MDRazor 插件

---

## 🇬🇧 English

### Introduction

MDRazor is an Obsidian plugin focused on polishing the Markdown editing experience. It ships **eight feature modules** — **General**, **Hidden Styling**, **List Enhancement**, **Tabs**, **Status Bar**, **Left Ribbon**, **Context Menu** and **Lazy Loading** — each independently toggleable in the settings panel. More features are under development.

Full release history: [CHANGELOG](https://github.com/Dyse-Sofqi/MDRazor/blob/main/CHANGELOG.en.md). After updating, the changelog for the new version pops up automatically on first launch.

### Features

Features are organized into the eight settings-panel areas; every item has its own toggle.

#### 🧰 General

- **Mouse/wheel line highlight** (on by default) — the row under the pointer highlights while the mouse moves or the wheel scrolls, fading out 300 ms after they rest. Translucent theme-color background + 8 px rounded corners + 22 px outer glow; stays in sync during smooth scrolling.
- **Current line highlight** (off by default) — persistent highlight of the edited line (follows the caret, shown only while the editor is focused). Off by default to avoid stacking with the `activeline-highlight` Custom.css snippet.
- **Click sync** (always on, no toggle) — fixes clicks/drags landing on the wrong line: in the lower half of a line box Chrome's caret snaps to the next line's start (leading element nodes such as `.list-bullet` break CM6's snap-suspicion check). The plugin corrects the caret/selection against true DOM row mappings across the whole click & drag cycle and does nothing when the native result is already correct. Since 2.6.0 two more gaps are closed: ① a **mouseup final correction** — when a non-empty selection exists before mousedown, the native MouseSelection re-dispatches the selection from the last mousemove position on mouseup and would clobber the per-move fix, so a last correction now runs in the same mouseup event, keeping the visible final selection true to the DOM; ② the **callout row-geometry root cure** — a callout block widget's anonymous line box hangs roughly half a line-height below its own box (the height map only measures the widget, so every following row sits ~10px lower than the map claims), and the gap is now folded into the widget's measurement (`vertical-align: bottom` + transparent `padding-bottom`, pixel-identical), curing clicks in the lower band / rightward drags on rows after callouts that selected the next row (the gap stems from legacy `display: inline-block` copies of an old core rule; the plugin compensates centrally, so such snippets can coexist unchanged).
- **Cursor & scroll position persistence** and **Clear local persisted data** — settings entries live here (see Tabs / Data storage).

#### ✂️ Hidden Styling

Hide Markdown mark symbols, revealed automatically as the cursor passes. Cleaner Live Preview, zero distraction. Independent toggles for: bold `**`, italic `*`, highlight `==`, strikethrough `~~`, inline code `` ` ``, escape `\`, heading `#` (H1–H6, hidden only when followed by a space), wikilink `[[ ]]`, HTML hex color tags, HTML underline `<u>`, and HTML line tags `<span>` (any attributes; literal inside code blocks/math). **Paired hiding**: `<font>`/`<u>`/`<span>` hide only when their closing tag exists — unclosed tags stay visible so you can spot them. Shared robustness: inline content mixing math (`$..$`) with formatting never crashes the editor, and math bodies are never hidden as marks.

- 👁️ **Whitespace visualization** — spaces shown as translucent `·`, view-range based, near-zero cost; also hides spaces inside already-hidden HTML tags.
- 🔍 **Symbol boundary hint** — a tooltip under the cursor shows which side of a hidden marker the cursor is on (left/right symbol, complete combined marks like `***` never truncated), via the CM6 `showTooltip` system.

#### 🗑️ Left Ribbon

- **Orphan image cleanup** — a trash ribbon button scans all Markdown notes, extracts four image reference syntaxes (`![[path]]`, `[[path]]`, `![](path)`, `<img src>`) and lists images never referenced (jpg/jpeg/png/gif/svg) in a multi-select confirm dialog (checkboxes, paths, status, thumbnails; all selected by default) before moving them to the system trash. Unchecked images are whitelisted and pinned to the bottom next time.
- **Custom commands** — pin any Obsidian/plugin command as a ribbon icon (pick command → confirm name → choose a Lucide icon with filtering); delete and drag-reorder, order synced both ways.
- **Hidden commands** — auto-detects existing ribbon commands (custom / plugin / native), toggles them with eye / eye-off; drag-reorder persists across restarts and ribbon DOM rebuilds.

#### 📝 List Enhancement

- **List Integration** — the list marker (`-`, `1.`, `*` plus its trailing space) becomes an atomic unit: the cursor (click / Home / arrow keys / programmatic moves) never rests inside it, Backspace removes the whole marker at once, and bullets/fold arrows keep rendering on the active line.
- **Checkbox Integration** — same treatment for the task marker: merged with the list marker into one atomic range (`- [ ]` as a whole) when both toggles are on; the checkbox widget never degrades to raw `[ ]` on the active line, and clicking the checkbox still toggles the task.
- **Backspace Level Promotion** (on by default) — at the right boundary of the integrated marker (`- |` or `- [ ] |`, exactly where List Integration parks the cursor), Backspace no longer deletes the marker wholesale but unwinds progressively, one step per press: ① task items lose their checkbox first (`- [ ] |` → `- |`; ordered tasks keep `1. `); ② the item is then promoted level by level — the whole line's indent is replaced with the parent indent each press, content and subtree carried along (items with content promote too; a following former sibling becomes its child, matching Obsidian's native Shift+Tab line-level semantics); ③ with no shallower list line above (treated as top level) the list format is removed outright — leading indent and marker deleted, content kept. Requires List Integration; checkbox stripping requires Checkbox Integration.
- **Fold via list bullet on the active line** — restores hover arrow and click-to-fold on the line the cursor occupies (Obsidian disables this on active lines).
- **Enter Soft Break** — Enter inside a list item inserts a soft line break (newline + continuation indentation) instead of a new item; pressing Enter again on the blank continuation line creates the next list item. New items inherit the checkbox: after a soft break inside a task item, the created item starts with a checkbox too (always unchecked, matching Obsidian's native behavior).
- **Focus list item** — moving into an item folds everything outside the focus chain (current item, ancestors, descendants); sub-settings: max second-level children to expand (slider 1–9 + toggle) and scroll sync (scrolls the focused row to 25% of the viewport after folding).
- **Arrow keys don't skip folded items** — ↓/↑ expand a folded list/headline block and enter it, keeping the column; plus an ↑ sibling jump-back at any depth when the previous line's item is deeper.
- **Expand/collapse sibling lists or headings (command)** — folds or unfolds the current row and every same-level list item/heading document-wide; reports the affected count. Bindable in Hotkeys; optional context-menu item.
- **Folder focus** — clicking a folder name in the file explorer expands only it and its ancestor chain, collapsing unrelated branches; clicking blank space expands all top-level folders. Sub-feature of the same toggle.
- **Show folder file count** — shows the number of direct children (subfolders + files) next to each folder title, refreshing within 200 ms of file events.

#### 📑 Tabs

- **Open in new tab by default** — clicking a file in the explorer jumps to its existing tab or opens a new one (context-menu created files too); Ctrl/Meta+click restores native behavior, Shift+click keeps native range multi-select.
- **Wikilinks in new tab** — clicking `[[page]]`, `[[page|alias]]` or `[[page#^blockid]]` reuses an existing tab and jumps to the block, otherwise opens a new tab.
- **Bookmarks in new tab** — same behavior for file bookmarks in the core Bookmarks view.
- **🗂️ Vertical tabs** — tab management inside the file list: a toolbar button toggles a tabs-only view (hiding unopened files), open files show close buttons, closing the active tab focuses the previous one; the toggle button can be hidden on its own.
- **Folder expansion follows tabs** — returning from the tabs-only view expands only folders containing open tabs (off: restores the previous expansion).
- **Cursor & scroll position persistence** — remembers each Markdown document's caret and scroll position (250 ms debounce, saved on tab close), stored in `.obsidian/md-razor-position-cache.json`, surviving plugin reinstalls; legacy plugin-folder caches migrate automatically.
- **Typewriter mode** — keeps the caret row in the middle band (viewport thirds: top 1/8 dim, middle 3/4 bright, bottom 1/8 dim by a configurable opacity slider); sub-options: head padding so line 1 can also center, and bottom-edge → top-edge jumping. Command `mdrazor-toggle-typewriter` stays in sync with the toggle.

#### 🖥️ Status Bar

- **Workspace switcher** — a button when 2+ workspaces exist (direct switch for 2, popup list for 3+), remembering the last workspace.
- **Auto-update workspace layout** — saves the current layout when switching/loading workspaces, working with Obsidian's native loader.
- **Sidebar toggle** — leftmost button collapses/expands both sidebars at once.
- **Formatting toggle** — leftmost「Identifier」button flips all format-hiding styles at once (synced with the settings toggles; command `mdrazor-toggle-formatting`).
- **Custom / hidden commands** — add any command as a status-bar button (icon + name); detect and eye/eye-off native & plugin commands, with persistent ordering.

#### 🖱️ Context Menu

- **Expand/collapse sibling lists or headings** — the same logic as the command, as a right-menu item (default on; the command/hotkey always work).
- **Batch delete empty lines** — removes all empty lines in the selection or document, Markdown-aware: blank lines around headings/rules/tables/lists/quotes and inside code blocks are preserved (runs collapsed to one), so table and list structures survive pasted web content. Undoable via Ctrl/Cmd+Z.
- **Custom / hidden commands** — add commands as menu items (icon + name); capture native/plugin menu entries with eye/eye-off, grouped by section with collapsible headers.

#### 🚀 Lazy Loading

- **Enable lazy loading** — master switch: community plugins start per their configured delays instead of all at once.
- **Check now** — opens a startup-timing dialog listing every delayed plugin's measured load time vs its delay and status, plus environment counts; copyable.
- **Per-plugin delay list** — a delay (seconds) input per community plugin; relative values define startup order. **Dormancy**: disabling a plugin in Community plugins keeps its delay config dimmed but intact — re-enabling resumes control automatically; uninstalling removes the entry.

> Lazy loading covers community plugins only; disabling the master switch or uninstalling restores natural loading (dormant plugins stay disabled — never force-started).

### Settings

Configure in Obsidian → Settings → Community plugins → MDRazor. The eight modules appear as tabs (active tab remembered for the plugin's lifetime): General (2 toggles), Hidden Styling (13), List Enhancement (12 toggles + 1 slider), Tabs (9 toggles + 1 slider), Status Bar (4), Left Ribbon (1), Context Menu (2), Lazy Loading (1 master + per-plugin delays).

### Data storage

Two data files live in the Obsidian config directory (default `.obsidian/`) and survive uninstall/reinstall: `md-razor-settings.json` (all settings) and `md-razor-position-cache.json` (cursor/scroll positions). Read-only mirrors (`data.json` / `position-cache.json` in the plugin folder) are maintained on every save and auto-restore the main files if they are lost or corrupted — useful against sync tools wiping non-standard files in `.obsidian`. Legacy plugin-folder data files migrate automatically on first load; clear them anytime under **Settings → General → Clear local persisted data**.

### Installation

- **Community plugins (recommended)** — Obsidian → Settings → Community plugins → search **MDRazor** → Install → Enable.
- **BRAT (pre-release)** — install [BRAT](https://obsidian.md/plugins?id=obsidian42-brat), add `Dyse-Sofqi/MDRazor`, enable MDRazor.

---

## 赞助

如果这个插件对你有帮助，欢迎扫码赞助 ❤️

![赞助](https://raw.githubusercontent.com/Dyse-Sofqi/MDRazor/main/zanshang.jpg)

## License

[0-BSD](LICENSE)

---

<div align="center">

# MDRazor

Designed to refine your writing experience with precision like a razor.

[![GitHub Release](https://img.shields.io/github/v/release/Dyse-Sofqi/MDRazor?style=flat-square&logo=github&color=%2342b883)](https://github.com/Dyse-Sofqi/MDRazor/releases) [![License](https://img.shields.io/github/license/Dyse-Sofqi/MDRazor?style=flat-square&color=%2342b883)](LICENSE) [![Obsidian Min App](https://img.shields.io/badge/Obsidian-%5E1.0.0-%234a7ec1?style=flat-square&logo=obsidian&logoColor=%234a7ec1)](https://obsidian.md) [![GitHub Stars](https://img.shields.io/github/stars/Dyse-Sofqi/MDRazor?style=flat-square&logo=github&color=%23e4b341)](https://github.com/Dyse-Sofqi/MDRazor)

[🇨🇳 中文](README.md) · [🇬🇧 English](#introduction)

</div>

---

📜 Full changelog at [CHANGELOG](https://github.com/Dyse-Sofqi/MDRazor/blob/main/CHANGELOG.en.md). After updating to a new version, the changelog for that release is shown automatically on first launch.

### Introduction

MDRazor is an Obsidian plugin focused on improving the Markdown editing experience.
Currently provides **General**, **Style Hiding**, **List Enhancements**, **Tabs**, **Statusbar**, **Left Ribbon**, **Context Menu**, and **Lazy Load** — eight feature modules, with more in development.

### Keywords

- Hide formatting markers · List integration (list marks / checkboxes) · List fold on active line · Enter soft break · List focus · Sibling fold · Dir focus · Vertical tabs · Typewriter mode · Auto save workspace · Orphan image cleaner · Mouse/scroll line highlight · Current line highlight · Measure guard for the stale CM6 height map (click offset) · Click sync (click/drag misplacement heal, incl. mouseup final correction) · Callout-following-row click/drag offset cure (block-widget line-box gap folded into measurement) · Delete empty lines (Markdown-aware)
- Lazy Load · Config dormancy (delays survive disabling) · Startup time stats · Serialized load queue · Custom Commands · Hidden Commands · Status Bar Commands · Context Menu Commands · Icon Picker · Drag Reorder · Symbol Boundary Hint · Space Visualization · Mirror data fallback · i18n (Chinese/English)


### Features

Features are organized by the eight settings-panel sections. Each toggle is independently switchable in settings.

---

#### 🧰 General

General editing-experience settings, each independently toggleable:

- **Highlight Line on Mouse Move / Scroll** (default on) — while the mouse moves or the wheel scrolls, the line under the pointer is highlighted; the highlight fades out 300ms after input settles. Styling mirrors the "cursor line highlight follows mouse" snippet: translucent theme-color background (`--activeline-background`) + 8px rounding + 22px outward glow (box-shadow spread + clip-path rounded inset); the pointer stays an arrow without flicker during scrolling. The highlight tracks the content while scrolling (scroll capture + per-frame `elementFromPoint` line marking), so it never lags during smooth scrolling.

- **Highlight Current Line** (default off) — the line holding the editing cursor is persistently highlighted (follows the cursor, independent of the mouse); shown only while the editor is focused and auto-cleared on blur (e.g. clicking the sidebar), so the activeline highlight works standalone without enabling the Custom.css snippet. Default off: identical effect to Custom.css `activeline-highlight`, avoiding double-highlighting. Styling: translucent theme-color background + 8px rounding + 22px outward glow.

- **Click Sync** (on by default) — heals clicks/drags that land on the wrong line: in the lower half of a line box, browser caret snapping moves the position to the next line's start (a known Chrome behavior; line-leading element nodes such as `.list-bullet` break CM6's suspicious-result detection), so a click does nothing and a drag selects from the next line. This plugin corrects the cursor/selection against the real DOM line mapping across the whole click+drag cycle, with zero intervention when the native result is correct. Since 2.6.0: ① a **mouseup final correction** stops the native `MouseSelection` re-select (when a non-empty selection existed before mousedown) from clobbering the corrected final selection — a last correction runs in the same mouseup event, keeping the visible result true to the DOM; ② the **callout row-geometry root cure** folds a callout block widget's anonymous line-box gap (≈half a line-height below the widget box; the CM6 height map only measured the box, putting every following row ~10px lower than the map) into the widget's own measurement (`vertical-align: bottom` + transparent `padding-bottom`, pixel-identical layout) — rows after callouts no longer map clicks in their bottom band / drags onto the next row (the gap is caused by legacy `.cm-callout { display: inline-block }` snippet copies of an old core rule; the plugin compensates centrally, so such snippets can stay). No settings needed.

- **MD Document Cursor & Scroll Position Persistence** — settings entry lives here (feature described under Tabs).
- **Clear Local Persisted Data** — settings entry lives here (feature described under Data Storage; renamed from "Clear Local Data").

---

#### ✂️ Style Hiding

Hide Markdown formatting markers; markers reappear when the cursor enters the range. Cleaner live preview, zero distraction.

Each format below can be toggled independently:

- **Bold** — hides `**` bold markers
- **Italic** — hides `*` italic markers
- **Highlight** — hides `==` highlight markers
- **Strikethrough** — hides `~~` strikethrough markers
- **Inline Code** — hides `` ` `` inline code markers
- **Escape** — hides `\` escape character markers
- **Heading** — hides `#` heading markers (H1–H6); standalone `#` without trailing space is not hidden
- **Wiki Link Brackets** — hides `[[` and `]]` wiki link formatting markers
- **HTML Color Tags** — hides `<font color="#c00000">` and `</font>` Hex color tag pairs
- **HTML Underline Tags** — hides `<u>` and `</u>` HTML underline tag pairs in live preview
- **HTML Inline Tags** — hides `<span>` and `</span>` HTML tag pairs in live preview, covering opening tags with arbitrary attributes (e.g. `style="color:var(--color-yellow)"`, `style="color:#b58900"`, `style="background-color:rgba(...)"`, `style="text-decoration:underline"`). `<span>` inside fenced code blocks, inline code, and math is treated as literal text and skipped
- **Paired HTML Tags Only** — `<font>`/`<u>`/`<span>` are hidden only when the opening and closing tags appear as a pair; a lone tag (e.g. `<u>` without `</u>`, or a stray `</u>`) stays visible, making unclosed tags easy to spot

All hidden formats share these behaviors:

- Since markers are hidden, cursor movement distance can be inferred from the cursor blink trail
- **Robustness** — Compatible with inline content where math (`$..$`) coexists with formatting markers (`**..**`, etc.). Even when Obsidian's parser produces an anomalous syntax tree on such lines, the editor never crashes and math content is never mistaken for a hidden marker.

👁️ **Space Visualization** — Display spaces as translucent `·` markers, making indentation and alignment visible at a glance. Based on CM6 viewport iteration — only visible lines are processed, minimal performance overhead. Translucent style won't interfere with editing. Spaces inside hidden format markers (e.g. `<span style="...">` HTML tags) are hidden along with the tag, leaving no stray dots. Listed as an independent toggle within the Style Hiding section.

🔍 **Symbol Boundary Hint** — When the cursor is at the boundary between a formatting marker and content, a small tooltip appears below the cursor displaying the hidden markers on either side. The tooltip shows the complete hidden marker verbatim (including combined markers such as bold+italic `***`) — no truncation, no duplication; with space visualization enabled, tooltip spaces also render as `·`. Built on CM6's `showTooltip` system — automatically tracks cursor position, follows scrolling, and cleans up on editor destroy. Independent toggle under the Style Hiding section.

---

#### 🗑️ Left Ribbon

- **Orphan Image Cleaner** — Enable in settings to show a trash-2 ribbon icon. Click it to scan all Markdown notes in the vault for image references via four syntaxes (`![[path]]`, `[[path]]`, `![](path)`, `<img src>`). Finds unreferenced image files (jpg/jpeg/png/gif/svg) and shows a multi-select confirm dialog (columns for checkbox, path, status, and thumbnail; all checked by default) before moving the selected ones to the system recycle bin. Images left unchecked are added to a whitelist — on subsequent dialogs they stay unchecked and are pinned to the bottom of the list; re-checking them removes them from the whitelist.

- **Custom Commands** — Add any native or plugin command to the left ribbon: pick a command → confirm its name → choose a Lucide icon (with filtering). Items can be deleted, drag-reordered, and the order syncs back to the ribbon.
- **Hidden Commands** — Lists all current ribbon commands (custom / plugin-registered / Obsidian native). Toggle visibility with the eye / eye-off buttons, drag to reorder, and the state persists across restarts and ribbon DOM rebuilds.


---

#### 📝 List Enhancements

Optimized list editing experience with the following independent toggles:

- **List Integration** — Treats list markers (`-`, `1.`, `*`) as atomic units: cursor navigation skips the marker (clicks / Home / arrow keys / programmatic moves never rest inside the marker range) and Backspace removes the entire marker at once. The cursor never rests inside the marker, so the list bullet (dot / custom marker / fold arrow) always stays visible on the current line — it never degrades back to the raw `- ` text. Editing experience closer to WYSIWYG.

- **Checkbox Integration** — Treats task markers `- [ ]` (including the status character in `[ ]`) as atomic units: cursor navigation skips them and Backspace removes the whole marker at once. With List Integration on, the list marker and the checkbox merge into a single atomic range (`- [ ]` as one unit); with only Checkbox Integration on, `[ ]` is its own unit. The checkbox widget always stays visible on the current line instead of degrading to raw `[ ]`; clicking the checkbox to toggle its state is unaffected.

- **List Fold on Active Line** — In live preview, the currently edited (active) list line normally shows no fold arrow on hover, and clicking the bullet does not fold the list (Obsidian deliberately disables this on active lines). When enabled, the active line folds exactly like inactive lines: the hover arrow appears and clicking the bullet collapses/expands the list. Task lines keep the native behavior. Takes effect immediately, no restart needed.

- **Enter Soft Break** — Pressing Enter inside a list item inserts a line break, indentation, and two trailing spaces (equivalent to native `Shift+Enter` behavior), without creating a new list item. Press Enter again to create a new list item — consecutive Enter presses create new items. Ideal for multi-line list items.

- **List Focus Option** — When the cursor enters a list item, automatically expand all its descendants and collapse all non-directly-related content (siblings, parent siblings, etc.). Only the focus chain (itself + ancestors + descendants) stays visible. Deeply nested list navigation no longer overwhelming. Fold is deferred until mouse button release to prevent flicker during selection drag.

  - **Second-level Max Expand Count** — Sub-setting of List Focus Option (slider 1-9 + toggle). When enabled, top-level items with ≤ threshold second-level children will be expanded during focus. Affects top-level items only; descendants still follow normal focus-fold behavior. Disabled when List Focus Option is off.

- **Scroll Sync** — Sub-toggle of List Focus Option (default on). When Option Focus folds/unfolds, the cursor's line is scrolled to 25% of the viewport height so it never leaves the viewport on long-list relayout. Disabled when List Focus Option is off.

- **Up/Down Do Not Skip Folded List/Heading Items** — When the target line is a folded list item or heading content, ↑/↓ actively unfold that block and land on the target line (goal column preserved) instead of CodeMirror's native whole-block skip. Continuous cursor navigation is never blocked by folded blocks. **Up-key same-level rewind (any depth)**: when ↑ is pressed while the cursor is on a list item and the line above (or its continuation) belongs to a lower-level (deeper) item — typically the deep tail of the previous same-level item's subtree — the cursor jumps straight to the previous list item at the current level (unfolding it if blocked by a fold) instead of landing inside that deeper subtree. Works at every depth: a level-2 item rewinds to the previous level-2 item when the line above is level 3/4+, a level-3 item to the previous level-3 when facing level 4+, and so on. The backward scan skips continuation lines and stops at block boundaries (blank lines, paragraphs, headings), so jumps never cross list blocks.

- **Directory Focus** — Click a folder name in the file explorer to automatically expand its entire descendant tree and ancestor chain, while collapsing all unrelated branches (siblings, parent siblings, grandparent siblings, etc.). Focus on the current directory structure. Clicking the folder name (not the collapse chevron) triggers focus; clicking the same folder again toggles its collapse state. If the tree is already in the focused shape (all unrelated branches collapsed) on first click, the folder's collapse state toggles directly — the same effect as clicking twice. The chevron still works independently for normal single-level toggle.

  - 🖱️ **Blank-area Expand** — Shares toggle with Directory Focus (available when Directory Focus is enabled). Click empty area in the file list to expand all top-level folders. Quickly browse the full directory structure. Won't trigger on sort/filter buttons or other interactive areas.

- **Directory File Count** — Displays the count of direct children (sub-folders + files) right-aligned on each folder title in the file explorer. Does NOT recurse into sub-folders. Counts update in real-time as files are created or deleted. Live updates via Obsidian vault events, debounced at 200ms. Font size matches the folder name.

---

#### 📑 Tabs

File tab management with the following independent toggles:

- **Default New Tab Open** — Click a file in the file explorer: if a tab for that file already exists, switch to it; otherwise open a new tab. Prevents duplicate tabs for more efficient file navigation. Ctrl/Meta+click restores native Obsidian behavior (open in new tab); Shift+click preserves native range multi-select.

- **Open Wiki Link in New Tab** — Click a wiki link in a document (including plain `[[page]]`, aliased `[[page|alias]]`, and block references `[[page#^blockid]]`): if the target file already has an open tab, switch to it with block-level scroll positioning; otherwise open in a new tab. Ctrl/Meta+click bypasses to native behavior.

- **Open Bookmark in New Tab** — Click a file bookmark in Obsidian's core Bookmarks view: if the target file already has an open tab, switch to it; otherwise open in a new tab. Ctrl/Meta/Shift+click bypasses to native behavior.

- **🗂️ Vertical Tabs** — Tab management in the file explorer. Toggle button (`arrow-left-right` icon) in nav buttons switches to a "tabs-only" view that hides inactive files and empty folders; close buttons on open file titles. Supports "tabs-only" and "full directory" view toggle. Tabs-only view hides unopened files and empty folders, focuses on active files. Close button displayed on the right of each open file title. Closing the active tab auto-focuses the previous tab, matching native tab bar behavior. The nav toggle button can be hidden independently (see the "Show/Hide the Toggle Tab View Button" toggle); once hidden, the command-palette command or a hotkey still switches the view.

- **Tab Expansion Associated Folders** — When enabled, switching back from the vertical tabs view to the file list expands only folders containing open tabs; when disabled, the original expanded structure is restored.

- **MD Document Cursor & Scroll Position Persistence** — Automatically records each Markdown document's cursor and scroll position and restores them when the document is reopened. Positions are saved once, 250ms after changes settle (continuous changes batch into a single write); the final position is flushed immediately when a tab closes, keeping overhead low. Records are stored in `md-razor-position-cache.json` inside the Obsidian config folder (default `.obsidian/`) and survive plugin uninstall/reinstall; the legacy plugin-dir cache (`position-cache.json`) is migrated automatically on first load. The settings entry has moved to the General section.

- **Typewriter Mode** — When enabled, focuses the middle reading band: the viewport is split into a top eighth, a middle 3/4, and a bottom eighth; lines outside the dead zone (12.5%–87.5%, i.e. the top/bottom eighth) are dimmed per the "Outside Dead-Zone Opacity" sub-setting, while lines inside the dead zone and the current line stay bright. The cursor's visual position is maintained across lines: entering the top eighth scrolls it back to the dead zone's top edge (12.5%); entering the bottom eighth scrolls it back to the bottom edge (87.5%) by default. The sub-setting is a 0-100 opacity slider (default 50); 100 means no dimming. The "Allow Blank Area at Document Top" sub-toggle (default on) reserves blank space of 1/8 viewport height above the document so the cursor can reach the middle band even on the very first line. The "Dead-Zone Bottom Edge Jump to Top Edge" sub-toggle (default off) makes the cursor jump to the top edge (12.5%) when it crosses the bottom edge, instead of scrolling back to the bottom edge. Sub-settings appear only while the mode is on. The command "Toggle Typewriter Mode" (`mdrazor-toggle-typewriter`) can be bound to a hotkey and stays bidirectionally in sync with the settings toggle.

---

#### 🖥️ Statusbar

Status bar enhancements with the following independent toggles:

- **Workspace Switch** — Shows a workspace-switch button in the bottom-right status bar: no button for 0-1 workspaces, direct switch for 2, popup list for 3+. Tracks and highlights the current workspace name.
- **Auto-save Workspace Layout** — Automatically saves the current workspace layout when switching to or loading another workspace. Integrates with Obsidian's native "Load Workspace" and the plugin's workspace switch.
- **Sidebar Toggle Button** — Shows a button at the leftmost position of the status bar to collapse/expand both sidebars with one click.
- **Format Toggle Button** — Shows a "标识" button at the leftmost position of the status bar to toggle all format hiding styles (bold, italic, highlight, strikethrough, inline code, escape, heading, wiki link brackets, HTML color tags, HTML underline tags, HTML inline tags) at once; space visualization is excluded. The button icon stays bidirectionally in sync with the Style Hiding switches in settings. The command `mdrazor-toggle-formatting` can be bound to a hotkey.

- **Custom Commands** — Add any command as a status bar button (icon + name); click to execute. Supports delete and drag reorder.
- **Hidden Commands** — Detects Obsidian native / plugin-registered / custom status bar commands, toggles visibility with eye / eye-off, and persists ordering.


---

#### 🖱️ Context Menu

Editor right-click menu enhancements with the following independent toggles:

- **Expand/Collapse Sibling Lists or Headings** — When enabled (default), a same-named item appears in the Markdown editor's right-click menu. Clicking it runs exactly the same logic as the command-palette command: based on the folded state of the list item / heading at the cursor, it uniformly collapses or expands the current line plus every list item or heading at the same level across the whole document (the same heading level, or the same indentation level of list items), then notifies how many sibling headings/lists were collapsed or expanded. Disabling removes the item from the right-click menu; the command-palette command and hotkey binding are unaffected.

- **Delete Empty Lines** — When enabled (default), a same-named item appears in the Markdown editor's right-click menu. With a selection it removes all empty lines within the selection; without a selection it removes all empty lines in the document. The replacement goes through the editor, so Ctrl/Cmd+Z undoes it. **Markdown-aware**: blank lines before/after headings, horizontal rules, tables, lists, blockquotes and code blocks, plus blank lines inside code blocks and between two separate tables, are preserved (consecutive blanks collapse to one); only blank lines between paragraphs, at document edges, between list items and between table rows are removed — keeping table/list structures intact (pasted web content often carries blank lines between table rows that break rendering; removing them restores it). The "Delete Empty Lines" command is always registered regardless of this toggle, so it stays available from the command palette or a hotkey.

- **Custom Commands** — Add any command to the editor context menu (icon + name); click to execute. Supports delete and drag reorder.
- **Hidden Commands** — Captures Obsidian native / plugin-registered context menu items, toggles visibility with eye / eye-off, supports drag reorder, and groups items into collapsible section headings.


---

#### 🚀 Lazy Load

Control when community plugins start up to optimize Obsidian cold-start, with the following toggles:

- **Enable Lazy Load** — Master switch. When on, each community plugin is launched according to the plugin delay list below; when off, all plugins restore Obsidian's natural loading. A "Check Now" button sits in front of the master switch.
- **Check Now** — The timer button before the "Enable Lazy Load" switch (tooltip "Check Now"). Opens a startup-time inspection modal that lists, as a single column formatted like "delay x s, startup x ms", the measured load time (including onload) of every enabled and delayed plugin together with its configured delay and load state (not started / loading / done / not measured). The environment bar shows the vault's file count and community plugin count, and a "copy" button at the bottom copies the full text. Because Obsidian's native "Check Now" modal is not exposed to plugins, its button appearance is reproduced and an equivalent measurement is implemented internally.
- **Plugin Delay List** — For each in-scope community plugin, sets a "Delay (seconds)" input: a delay > 0 defers its startup, 0 restores immediate loading (relative delays define the startup order). Plugin enable/disable is managed by Obsidian's Settings → Community Plugins: **disabling a plugin puts its delay config to dormant** (the entry dims, the delay value is kept); re-enabling restores managed state automatically and lazy loading applies again on the next start — no need to re-enter the delay. Uninstalling a plugin removes its configuration.

> Note: Lazy Load applies to community plugins only; turning off the master switch or uninstalling MDRazor restores natural loading (dormant plugins stay disabled and are never started on their own).

### Settings

Configure in Obsidian Settings → Community Plugins → MDRazor:

- **General** — 2 toggles: Highlight Line on Mouse Move / Scroll, Highlight Current Line (settings entries for MD Document Cursor & Scroll Position Persistence and Clear Local Persisted Data also live here)
- **Style Hiding** — 13 toggles: Bold, Italic, Highlight, Strikethrough, Inline Code, Escape, Heading, Wiki Link Brackets, HTML Color Tags, HTML Underline Tags, HTML Inline Tags, Space Visualization, Symbol Boundary Hint
- **List Enhancements** — 11 toggles + 1 slider: List Integration, Checkbox Integration, List Fold on Active Line, Enter Soft Break, List Focus Option (with Second-level Max Expand Count, Scroll Sync), Up/Down Do Not Skip Folded List/Heading Items, Directory Focus, Directory File Count (with Direct Children Count)
- **Tabs** — 9 toggles + 1 slider: Default New Tab Open, Vertical Tabs, Show/Hide the Toggle Tab View Button, Open Wiki Link in New Tab, Open Bookmark in New Tab, Tab Expansion Associated Folders, Typewriter Mode (with Outside Dead-Zone Opacity, Allow Blank Area at Document Top, Dead-Zone Bottom Edge Jump to Top Edge)
- **Statusbar** — 4 toggles: Workspace Switch, Auto-save Workspace Layout, Sidebar Toggle Button, Format Toggle Button
- **Left Ribbon** — 1 toggle: Orphan Image Cleaner (trash-2 ribbon icon, scans unreferenced images)
- **Context Menu** — 2 toggles: Expand/Collapse Sibling Lists or Headings, Delete Empty Lines (adds same-named items to the editor right-click menu; the Delete Empty Lines command is always registered regardless of the toggle)
- **Lazy Load** — 1 master toggle + per-plugin delay settings: Enable Lazy Load, Check Now modal, Community Plugin Delay List (per-plugin delay in seconds; plugin enable/disable is handled by the community plugins settings; disabling a plugin keeps its delay config dormant and re-enabling restores it automatically)
- **Tabbed sections** — the eight modules above are shown as tabs to keep the settings list short; the active tab is remembered for the plugin's lifetime

---

### Data Storage

MDRazor keeps two data files inside the Obsidian config folder (default `.obsidian/`). They are **not deleted when the plugin is uninstalled** and are reused after reinstalling:

- `.obsidian/md-razor-settings.json` — all settings: toggles, custom commands, hidden commands, ordering, lazy-load delays, etc.
- `.obsidian/md-razor-position-cache.json` — cursor & scroll position records per document

Every disk write also maintains a read-only mirror inside the plugin folder (named `data.json` / `position-cache.json`): if the main file under the config dir is lost or corrupted, it is restored from the mirror; a healthy main file always wins. This covers cases where sync clients / cleanup tools mistakenly remove non-standard files under `.obsidian`.

Legacy data files (the plugin-dir `data.json` / `position-cache.json` as the primary format) are migrated automatically on the first load of a new version and are no longer read or written afterwards. To wipe the data before fully dropping the plugin, use **Settings → General → Clear Local Persisted Data** (both items default to unchecked = keep; clearing takes effect immediately).

### Installation

#### Via Community Plugins (Recommended)

1. Open Obsidian → Settings → Community plugins → Browse
2. Search for **MDRazor** and install
3. Enable in Installed plugins list

#### Via BRAT (Preview builds)

1. Install [BRAT](https://obsidian.md/plugins?id=obsidian42-brat) plugin
2. Add `Dyse-Sofqi/MDRazor` in BRAT settings
3. Enable MDRazor manually

## Sponsorship

If this plugin helps you, feel free to scan the QR code to sponsor ❤️

[PayPal](https://paypal.me/Sofqi)

## License

[0-BSD](LICENSE)
