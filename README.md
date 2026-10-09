<div align="center">

# MDRazor

像剃刀一样精准打磨你的 Markdown 编辑体验。

[![GitHub Release](https://img.shields.io/github/v/release/Dyse-Sofqi/MDRazor?style=flat-square&logo=github&color=%2342b883)](https://github.com/Dyse-Sofqi/MDRazor/releases) [![License](https://img.shields.io/github/license/Dyse-Sofqi/MDRazor?style=flat-square&color=%2342b883)](LICENSE) [![Obsidian Min App](https://img.shields.io/badge/Obsidian-%5E1.6.6-%234a7ec1?style=flat-square&logo=obsidian&logoColor=%234a7ec1)](https://obsidian.md) [![GitHub Stars](https://img.shields.io/github/stars/Dyse-Sofqi/MDRazor?style=flat-square&logo=github&color=%23e4b341)](https://github.com/Dyse-Sofqi/MDRazor)

</div>

---

> 🇬🇧 **English**: scroll down to view the English README.

📜 完整更新记录见 [CHANGELOG](https://github.com/Dyse-Sofqi/MDRazor/blob/main/CHANGELOG.md)。插件更新到新版本后，首次启动会自动弹出本次更新的更新日志。

### 简介

MDRazor 是一款 Obsidian 插件，专注于提升 Markdown 编辑体验 —— 像剃刀一样，把书写过程中多余的部分精准削掉：标记符号该藏的藏、列表该整齐的整齐、点击该落在哪行就落在哪行。

目前提供**通用**、**隐藏样式**、**列表增强**、**标签页**、**状态栏**、**左功能区**、**右键菜单**和**懒加载**八大功能模块，每项均可在设置面板独立开关，更多功能正在开发中。插件完全本地运行、不联网：设置与光标/滚轴位置数据存放在 Obsidian 配置目录，并在插件目录保留只读镜像兜底，主文件丢失或损坏时可自动恢复。

MDRazor is an Obsidian plugin dedicated to honing your Markdown editing experience — like a razor, shaving off whatever gets in the way: formatting marks that should stay hidden, lists that should line up, clicks that should land on the line you aimed at. It ships **eight feature modules** — **General**, **Hidden Styling**, **List Enhancement**, **Tabs**, **Status Bar**, **Left Ribbon**, **Context Menu** and **Lazy Loading** — each independently toggleable in the settings panel, with more features under development. Everything runs locally with no network access: settings and cursor/scroll data live in the Obsidian config directory, with read-only mirrors kept in the plugin folder that restore the main files automatically if they are lost or corrupted.

### 关键词 / Keywords

**中文**

- **编辑体验** — 隐藏格式标记 · 空格可视化 · 符号边界提示（框内 `|` 与光标对齐 · 夜间模式弹框可见）· 鼠标/滚轮移动时行高亮 · 当前行高亮 · 打字机模式 · 点击同步（点击/拖拽选错行根治，含 mouseup 最终纠错）· callout 之后行点击/拖拽错位根治（块 widget 行盒空隙并入测量）· 编辑器测量守护（行高表陈旧点击偏移根治）· Callout 增强（单击保持渲染 · 标题单击折叠/展开 · 就地编辑面板 · 触屏编辑按钮 · 取消/丢弃 · 正文自适应增高 · 候选下拉）· 行内代码双击复制 · 行内代码光标可见性保护（空代码对输入不再倒序/跑出标记） · 首行缩进（排除非正文块 · 跟随「严格换行」· 预览与阅读双端）· 光标与滚轴位置持久化
- **列表与结构** — 列表一体化（列一体化 / 勾选框一体化 / ← 选中勾选框字符 / 退格提升层级）· 回车软换行（任意单字符勾选框继承）· 选项聚焦 · 折叠同级列表/标题 · 活动行列表符号折叠 · 折叠项方向键穿越 · 目录聚焦 · 目录文件计数 · 批量删除空行（Markdown 感知）
- **标签页与导航** — 默认在新标签页打开 · 内链/书签新标签页 · 垂直标签页 · 自动保存工作区
- **命令与外观** — 自定义命令 · 隐藏命令 · 状态栏命令 · 右键菜单命令 · 图标选择 · 拖拽排序 · 左功能区管理 · 自动清理失联图片
- **数据与性能** — 懒加载 · 配置休眠（停用不丢延迟）· 启动耗时统计 · 全局加载队列 · 数据镜像兜底 · 中英文 i18n

**English**

- **Editing experience** — Hidden formatting marks · Whitespace visualization · Symbol boundary hint (tooltip `|` aligned with the caret · visible in dark mode) · Mouse/wheel line highlight · Current line highlight · Typewriter mode · Click sync (click/drag misplacement cure, incl. mouseup final correction) · Callout-following-row offset cure (block-widget line-box gap folded into measurement) · Measure guard (stale height-map click-offset cure) · Callout enhancement (single-click keeps rendering · title-click fold/expand · in-place editor · touch edit button · cancel/discard · auto-growing body · suggestion dropdown) · Inline code double-click copy · Inline-code caret visibility guard (typing in an empty pair never comes out reversed or outside the marks) · First-line indent (non-body blocks excluded · follows "Strict line breaks" · Live Preview + Reading view) · Cursor & scroll position persistence
- **Lists & structure** — List integration (list marks / checkboxes / ← selects checkbox character / backspace level promotion) · Enter soft break (any single-character checkbox inheritance) · Focus list item · Fold sibling lists/headings · Fold via list bullet on the active line · Arrow-key traversal of folded items · Folder focus · Folder file count · Markdown-aware empty-line cleanup
- **Tabs & navigation** — Open in new tab by default · Wikilinks and bookmarks in new tabs · Vertical tabs · Workspace autosave
- **Commands & appearance** — Custom commands · Hidden commands · Status-bar commands · Context-menu commands · Icon picker · Drag-and-drop ordering · Left-ribbon management · Orphan image cleanup
- **Data & performance** — Lazy loading · Dormant configs (delays survive disabling) · Startup timing stats · Global load queue · Data mirror fallback · English/Chinese i18n


### 功能

功能按设置面板的八大区域组织，每项均可在设置面板中独立开关。

---

#### 🧰 通用

通用编辑体验设置，提供以下独立开关：

- **鼠标/滚轮移动时行高亮**（默认开启） — 鼠标移动或滚轮滚动时，鼠标所在行显示跟随高亮；鼠标/滚轮静止 300ms 后高亮自动熄灭。样式与「行高亮跟随鼠标」一致：半透明主题色背景（`--activeline-background`）+ 8px 圆角 + 22px 外扩光晕（box-shadow 外扩 + clip-path 圆角回收），滚动期间指针保持箭头样式不闪烁。滚动期间高亮与内容同步跟随（滚动捕获监听 + `elementFromPoint` 逐帧标记鼠标下方行），平滑滚动也不滞后。代码块不参与高亮：围栏代码块的行与实时预览下未激活代码块的块级 widget 都不高亮，代码块保持自身的底色与语法配色，光标也保持原生（代码块内仍是 I-beam，不套箭头）。

- **当前行高亮**（默认关闭） — 编辑光标所在行常驻高亮（跟随编辑光标、与鼠标无关），仅编辑器聚焦时显示，失焦（如点击侧边栏）自动取消。不启用 Custom.css 时也能独立保持当前行高亮。默认关闭：与 Custom.css 的 `activeline-highlight` 效果一致，避免重复叠加。样式为半透明主题色背景 + 8px 圆角 + 22px 外扩光晕。

- **点击同步**（默认开启） — 修复点击/拖拽落到错误行：在行盒下半部点击时，浏览器 caret 会吸附到下一行行首（Chrome 已知行为；列表行首 `.list-bullet` 等元素节点会打断 CM6 的误吸附检测），导致点击不动、拖拽从下一行起选。本插件在点击与拖拽的全周期用真实 DOM 行映射校正光标/选区，原生结果正确时零干预。2.6.0 起补强两处：① **mouseup 最终纠错**——按下前已存在非空选区时，原生 MouseSelection 会在抬起时用最后一次移动坐标重发选区、覆盖逐帧纠错结果，现于同一抬起事件内补最后一次纠错，保证最终可见选区与 DOM 真值一致；② **callout 后行几何根因修复**——callout 块 widget 的匿名行盒在盒底之下多出约半个行高的空隙（CM6 行高表只量 widget 盒，导致其后每一行实际位置低 10px），现把空隙并入 widget 测量（`vertical-align: bottom` + 透明 `padding-bottom` 补偿，视觉逐像素不变），根治 callout 之后每一行下半部点击/拖拽错位到下一行的问题（该空隙由旧版 `display: inline-block` 核心样式复刻引发，插件侧已统一补偿，可与该类片段并存）。无需设置。

- **Callout 增强**（默认开启） — 实时预览下单击 callout 不再退回 `>` 纯文本源码，保持渲染外观；渲染后的 callout 里仍可用鼠标拖选文本，链接/折叠箭头/嵌入块等交互照常工作。**可折叠 callout（`[!type]+` / `[!type]-`）单击标题区域（图标 / 标题文字）即可折叠 / 展开**——Obsidian 原生只认标题行内的折叠箭头，本插件在保持渲染的前提下补上标题区点击：折叠状态切换走 Obsidian 原生路径（不触碰其内部状态），不遮挡右上角的「编辑这个区块」按钮，在标题上拖拽选择文本也不会触发折叠。点右上角「编辑这个区块」按钮，在保持官方渲染外观（边框/底色/圆角/配色/图标/主题变量全部原样）的前提下就地编辑：标题在官方标题行内输入（字号/颜色/行高逐像素同源），正文复刻 `.callout-content` 的内边距与背景，另有类型/元数据/折叠字段；正文高度随内容自适应增高（窗口缩放等宽度变化自动重算，不再出现滚动条），类型/元数据为「自由输入 + 自带候选下拉」（候选来自内置类型 ∪ 已加载样式表 ∪ 当前文档在用值，限高内部滚动、随编辑器滚动跟随输入框、↑/↓/Enter/Esc 键盘可选）；**关闭路径有三种**：「完成」与点击面板外提交写回，「取消」按钮与 Esc 丢弃修改关闭（改错了可以不写回地退出）；提交时一次事务把「标题 + 正文」重建为 `> [!类型|元数据]折叠标记 标题` 写回，编辑期间不改文档（widget 不重建、输入不打断），源码区间被外部改动则放弃写回并弹提示，绝不误覆盖。正文粘贴多行文本自动规范化（CRLF 统一、剥已有 `>` 前缀避免 `> >`、去行尾空白）并在提交时逐行补 `>`（空行补 `>` 本身）。**触屏编辑按钮**（独立开关，默认开启）：在不具备悬停能力的设备（iPad、手机等）常驻显示 callout 右上角的编辑按钮——原生按钮由容器 `opacity: 0` 控制显隐（仅悬停恢复），触屏上永远不可见且用户 CSS 无法强制显示（透明化的是父容器）；插件按钮仅在 `hover: none` + `pointer: coarse` 环境显示，桌面悬停环境零变化。解析对网页复制的隐形污染宽容：正文行首混入零宽字符（ZWSP 等）不再导致编辑面板静默打开成空正文。

- **行内代码增强**（默认开启） — 双击编辑器中的行内代码（`` `code` ``）时，自动复制其完整内容（不含反引号）到剪贴板，弹出「已复制」提示；原生双击选词等行为完整保留（不 preventDefault、不派发事务），代码内容区间走 CM6 语法树解析（formatting-code 与 inline-code 标记配对，不依赖具体 DOM 结构；语法树未就绪时退回 DOM 边界估算，任何一步失败都放行原生行为）；Shift/Ctrl/Alt/Meta 双击（扩展选词等）、单击与拖选不受影响；围栏代码块天然排除；仅编辑模式（实时预览/源码模式）生效。

- **首行缩进**（默认关闭） — 为**正文段落**的首行添加缩进（宽度 1~2 个中文字符可调，`1em` = 一个中文字符宽），自动排除标题、表格、无序/有序列表、引用与 callout、代码块、数学块、注释、HTML 块、frontmatter、脚注与链接引用定义、独立块 ID、纯图片段落等一切非正文块。**仅实时预览与阅读视图生效，源码模式刻意不生效**（缩进会把源码本身推右，看起来像误输入的空格）。**段落边界跟随 Obsidian 的「严格换行」设置**：非严格（Obsidian 默认，单回车即新行）时每个正文行都是段落首行、都缩进；严格时同段续行不缩进 —— 该设置变化即时生效。作用域收在 Obsidian 自己的正文容器内（编辑器要求 `.markdown-source-view`、阅读视图要求 `.markdown-reading-view`），提词器等借用主题类名的第三方视图不受影响。

- **MD文档光标和滚轴位置持久化** — 设置入口在本模块（功能详见「标签页」节）。
- **清理本地持久化数据** — 设置入口在本模块（功能详见「数据存储」节；由原「清理本地数据」改名而来）。

---

#### ✂️ 隐藏样式

隐藏 Markdown 标记符号：标记默认不可见（含光标在格式单元内编辑时——光标处的隐藏标记由下方「符号边界提示」弹框展示），仅当光标被隐藏区间**盖住或夹住**时在该处短暂显形。更干净的实时预览，零干扰。

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
- **光标可见性保护**（2.6.9）— 光标落在隐藏区间内部或夹在两条隐藏区间之间时（空行内代码 `` `` ``、空加粗 `****` 等「光标两侧没有文本」的退化位置），光标所在处的标记自动显形——输入落点始终落在真实文本上，**不会出现字符倒序或跑到标记之外**（行首键入 `` ` `` 由自动配对产生一对、光标居中时必然触发，现已无此问题）；键入首个字符后标记立即恢复隐藏，提示弹框在光标处无隐藏标记时自然不弹。
- **健壮性** — 兼容数学公式（`$..$`）与格式标记（`**..**` 等）共存的行内内容。即使 Obsidian 解析器在此类行上产生异常语法树，也不会导致编辑器崩溃，公式正文绝不会被误当作格式标记隐藏。

👁️ **空格可视化** — 以半透明 `·` 标记显示空格位置，一目了然看清缩进和对齐。基于 CM6 视图范围迭代，仅处理可视行，性能开销极低。半透明样式不干扰编辑。已隐藏格式符号（如 `<span style="...">` HTML 标签）内的空格一并隐藏，不残留 `·`。作为隐藏样式区域中的一项独立开关。

🔍 **符号边界提示** — 光标处于格式标识符与文本内容边界时，在光标下方弹出小框，展示光标与隐藏标识符的位置关系（左/右两侧符号）。弹框原样展示完整隐藏标记（含组合标记如加粗+斜体的 `***`），不截断、不重复；空格可视化开启时弹框内空格同样以 `·` 展示。**弹框内的 `|` 与光标严格对齐**（实测偏差 0px）：光标在隐藏标记内左右移动时，`|` 始终压在光标上保持不动，只有弹框轮廓随标记长短伸缩，观感上不再「各动各的」；对齐偏移在弹框挂载后按实际字体实测，缩放/改字体/改面板尺寸后自动重新测量。夜间模式下弹框单独取样式（提亮面 + 亮描边 + 加重投影），避免近黑底色上黑投影失效导致弹框「消失」。使用 CM6 `showTooltip` 系统，自动跟随光标位置、响应滚动和编辑器销毁生命周期。在隐藏样式设置区独立开关。

---

#### 🗑️ 左功能区

- **清理失联图片** — 在设置中启用后，左侧 ribbon 功能区出现垃圾桶图标按钮（trash-2）。点击后扫描库中所有 Markdown 笔记，提取四种图片引用语法（`![[path]]`、`[[path]]`、`![](path)`、`<img src>`），找出未被任何笔记引用过的图片文件（jpg/jpeg/png/gif/svg），弹出多选确认框（列表含勾选、路径、状态与缩略图，默认全选）供确认后移入系统回收站。确认时未勾选的图片记入白名单，下次弹框自动保持未勾选并置底显示，可重新勾选解除白名单。

- **自定义命令** — 在左功能区设置页可把 Obsidian 原生命令或插件命令添加为功能区图标：从命令列表选择 → 确认名称 → 选择 Lucide 图标（支持筛选）。列表项可删除、拖拽排序，顺序双向同步到左侧功能区。
- **隐藏命令** — 自动统计功能区现有命令（自定义 / 插件注册 / Obsidian 原生），以 eye / eye-off 按钮切换隐藏与显示；可拖拽排序并持久化，重启或功能区 DOM 重建后自动恢复。


---

#### 📝 列表增强

列表编辑体验优化，提供以下独立开关：

- **列一体化** — 将列表标记（`-`、`1.`、`*`）视为原子单元：光标定位跳过标记（点击 / Home / 方向键 / 程序化移动均不驻留标记区），退格键一次删除整个标记。光标永不驻留列表标记区，列表符号（圆点 / 自定义符号 / 折叠箭头）在光标所在行始终显示，不会退化为原始 `- ` 标记。编辑体验更接近所见即所得。原子单元 = 标记 + 恰好一个空格：标记后多余空格是普通文本，← 可逐格左移、退格逐格删除，到标记右边界才整体删除或触发「退格提升层级」（`-   foo` 不会整块连删）。

- **勾选框一体化** — 将任务项标记 `- [ ]`（含 `[ ]` 内的状态字符）视为原子单元：光标定位跳过、退格键一次整体删除标记；与「列一体化」同时开启时合并为一个整体区间（`- [ ]` 视为一个整体），只开勾选框一体化时 `[ ]` 单独作为一个原子单元。勾选框样式（复选框 widget）在光标所在行始终显示，不会退化为原始 `[ ]`；点击勾选框切换任务状态不受影响。**← 选中勾选框字符**：光标位于内容起点（`- [ ] |`）时按 ← 直接选中 `[]` 内的状态字符——选中期间复选框临时退回原文渲染（状态字符高亮，列表符号不受影响），键入任意字符即替换并恢复复选框渲染、光标自动复位回内容起点（`- [键入值] |`）；← / → 再按取消选区回右边界。配合 Task Collector 等自定义标记插件可全程键盘改写完成状态；实时预览与源码模式均可用。

- **退格提升层级** — 光标位于一体化列表标记的右边界（`- |` 或 `- [ ] |`，即列一体化把光标推到的内容起点）时按 Backspace，不再整体删除标记，改为渐进退链：任务项先剥离勾选框（`- [ ] |` → `- |`，层级、缩进与内容不动）；再逐级提升——每按一次退格提升一级，整行缩进替换为父级缩进，内容保留、子树随行（其后的原同级项会因缩进关系成为其子项，与 Obsidian 原生 Shift+Tab 的行级语义一致），含内容的项同样提升；无更浅缩进的父级列表行（视为一级）时直接删除列表格式——移除行首缩进与标记，内容保留。有序任务项剥离勾选框后保留有序标记（`1. [ ] ` → `1. `）。需配合「列一体化」开启；「勾选框一体化」关闭时任务项无合并边界，退格链从 `- |` 位置才开始生效。

- **光标行列表符号折叠** — 实时预览中光标所在列表行（活动行）原本悬停列表符号不显示折叠箭头、点击列表符号也无法折叠/展开列表（Obsidian 原生在活动行禁用的机制）；开启后恢复与非活动行一致的折叠行为：悬停箭头正常显现、点击列表符号照常折叠/展开。任务行沿用原生规则。设置变更即时生效，无需重启。

- **回车软换行** — 在列表项内按 Enter 仅插入换行、缩进及两个空格（等效原生 `Shift+Enter` 行为），不新建列表项。需要新建列表项时，再按一次 Enter 即可，也就是连续回车新建列表项。适合多行列表项。任务项的勾选框继承：所属列表项带勾选框时，连续回车新建的列表项同样以勾选框起头（默认未勾选，与 Obsidian 原生行为一致）。继承判定对齐 Obsidian 原生任务行规则：方括号内**任意单字符**均算勾选框（`- [ ] `、`- [x] `、Minimal 的 `- [-] `、Tasks 的 `- [/] ` 等），且 `]` 后须紧跟空格（无空格写法原生本就不渲染勾选框）。

- **选项聚焦** — 光标移入列表项时，自动折叠所有非直属内容（兄弟、父兄弟等），仅展开焦点链（当前项、其祖先、及其子孙）。深度嵌套列表导航不再眼花缭乱。鼠标未弹起时不触发折叠，避免拖选过程中闪烁。

  - **二级子项最大展开数** — 选项聚焦的子设置（滑块 1-9 + 开关）。开启后，一级项的第二级子项数量 ≤ 设定值时该一级项展开。仅影响一级项，其后代仍受选项聚焦影响。选项聚焦关闭时此设置自动禁用。

- **滚轴同步** — 选项聚焦的子开关（默认关闭）。选项聚焦触发折叠/展开时，自动将光标所在行滚动至视口 25% 处，避免长列表伸缩使光标跑出视图外。与「滚轴固定」互斥（同时开启时以滚轴固定为准）。选项聚焦关闭时此开关自动禁用。

- **滚轴固定** — 选项聚焦的子开关（默认开启）。选项聚焦触发折叠/展开时，把光标行固定在**触发前的屏幕位置**，使折叠/展开围绕光标所在行进行：页面不大幅跳跃，光标也不落出视口外（光标原本已在视口外时会被拉回可见范围）。与「滚轴同步」互斥（同时开启时以本项为准）。选项聚焦关闭时此开关自动禁用。

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

- **MD文档光标和滚轴位置持久化** — 自动记录 Markdown 文档的光标与滚动位置，重新打开文档时还原上次位置。位置变更停止 250ms 后一次性记录最终位置（连续变更只记一次），关闭标签页时立即保存末位，性能开销低。位置记录保存在 Obsidian 配置目录（默认 `.obsidian/`）的 `md-razor-position-cache.json`，卸载重装插件后仍保留；旧版插件目录缓存（`position-cache.json`）首次加载时自动迁移。设置入口已移至「通用」模块。2.6.1 起，还原光标的事务在本轮 CM6 更新结束之后派发（`queueMicrotask`）：此前它发生在更新周期内，遇到「整档替换」类事务（首次加载、其他插件全文件格式化、外部改动重载）会抛 `Calls to EditorView.update are not allowed while an update is in progress`，并连带让该编辑器的位置追踪被销毁、恢复功能静默失效。

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

- **开启/关闭首行缩进** — 开启后，Markdown 编辑器右键菜单中显示同名菜单项（默认开启）。点击即切换「通用」模块里的**首行缩进**开关（与设置面板开关双向同步，立即生效、无需重载插件）。命令 `mdrazor-toggle-first-line-indent` 随插件注册、不受此开关影响，关闭菜单项后仍可通过命令面板或绑定快捷键触发。

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

- **通用** — 3 个开关 + 1 个滑块：鼠标/滚轮移动时行高亮、当前行高亮、首行缩进（含缩进宽度滑块，1~2 个中文字符；「MD文档光标和滚轴位置持久化」与「清理本地持久化数据」的设置入口亦在本模块）
- **隐藏样式** — 13 个开关：加粗、斜体、高亮、删除线、行内代码、转义符号、标题符号、双链符号、HTML 颜色标签、HTML 下划线符号、HTML 行标签、空格可视化、符号边界提示
- **列表增强** — 13 个开关 + 1 个滑块：列一体化、勾选框一体化、退格提升层级、光标行列表符号折叠、回车软换行、选项聚焦（含二级子项最大展开数、滚轴同步、滚轴固定）、上下键默认不跳过被折叠的列表/标题项、目录聚焦、显示目录文件数量（含仅显示直接子项数量）
- **标签页** — 9 个开关 + 1 个滑块：默认新标签页打开、垂直标签页、展示/隐藏切换标签页视图按钮、新标签页打开双链、新标签页打开书签、目录展开关联标签页、打字机模式（含死区外的不透明度、允许文档头部留存空白区域、死区下沿跳转上沿）
- **状态栏** — 4 个开关：工作区切换、自动更新工作区布局、侧边栏伸缩按钮、隐藏样式启闭按钮
- **左功能区** — 1 个开关：清理失联图片（启用后 ribbon 显示垃圾桶图标，扫描未引用图片）
- **右键菜单** — 3 个开关：展开/折叠同级列表或标题、批量删除空行、开启/关闭首行缩进（在编辑器右键菜单中添加同名菜单项；命令始终注册不受开关影响）
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

MDRazor is an Obsidian plugin focused on polishing the Markdown editing experience — like a razor, shaving off whatever gets in the way: formatting marks that should stay hidden, lists that should line up, clicks that should land on the line you aimed at. It ships **eight feature modules** — **General**, **Hidden Styling**, **List Enhancement**, **Tabs**, **Status Bar**, **Left Ribbon**, **Context Menu** and **Lazy Loading** — each independently toggleable in the settings panel. More features are under development. Everything runs locally with no network access; settings and cursor/scroll data live in the Obsidian config directory with read-only mirrors in the plugin folder as a fallback.

Full release history: [CHANGELOG](https://github.com/Dyse-Sofqi/MDRazor/blob/main/CHANGELOG.en.md). After updating, the changelog for the new version pops up automatically on first launch.

### Features

Features are organized into the eight settings-panel areas; every item has its own toggle.

#### 🧰 General

- **Mouse/wheel line highlight** (on by default) — the row under the pointer highlights while the mouse moves or the wheel scrolls, fading out 300 ms after they rest. Translucent theme-color background + 8 px rounded corners + 22 px outer glow; stays in sync during smooth scrolling. Code blocks are excluded: neither fenced-code-block lines nor the block-level widget of an inactive code block in Live Preview highlights, so a block keeps its own background and syntax colours and its native cursor.
- **Current line highlight** (off by default) — persistent highlight of the edited line (follows the caret, shown only while the editor is focused). Off by default to avoid stacking with the `activeline-highlight` Custom.css snippet.
- **Click sync** (always on, no toggle) — fixes clicks/drags landing on the wrong line: in the lower half of a line box Chrome's caret snaps to the next line's start (leading element nodes such as `.list-bullet` break CM6's snap-suspicion check). The plugin corrects the caret/selection against true DOM row mappings across the whole click & drag cycle and does nothing when the native result is already correct. Since 2.6.0 two more gaps are closed: ① a **mouseup final correction** — when a non-empty selection exists before mousedown, the native MouseSelection re-dispatches the selection from the last mousemove position on mouseup and would clobber the per-move fix, so a last correction now runs in the same mouseup event, keeping the visible final selection true to the DOM; ② the **callout row-geometry root cure** — a callout block widget's anonymous line box hangs roughly half a line-height below its own box (the height map only measures the widget, so every following row sits ~10px lower than the map claims), and the gap is now folded into the widget's measurement (`vertical-align: bottom` + transparent `padding-bottom`, pixel-identical), curing clicks in the lower band / rightward drags on rows after callouts that selected the next row (the gap stems from legacy `display: inline-block` copies of an old core rule; the plugin compensates centrally, so such snippets can coexist unchanged).
- **Callout enhancement** (on by default) — single-clicking a callout in Live Preview no longer falls back to the `>` quote source: the rendered look stays, text remains drag-selectable, and links/fold arrows/embeds keep working. **Collapsible callouts (`[!type]+` / `[!type]-`) fold/expand when their title area (icon or title text) is clicked** — natively only the fold arrow inside the title row responds, so the plugin adds the title-area click while keeping the callout rendered: the fold state is toggled through Obsidian's own native path (its internal state is never touched), the "Edit this block" button is never covered, and dragging to select title text does not trigger a fold. The "edit this block" button opens an in-place editor that preserves the official rendering (border, background, radius, colours, icon and theme variables untouched): the title edits inside the official title row (pixel-identical font/colour/line-height), the body replicates the `.callout-content` padding and background, plus type/metadata/fold fields; the body grows with its content (re-fitted on width changes, no scrollbars), and type/metadata combine free input with a custom suggestion dropdown (candidates from built-in types ∪ loaded stylesheets ∪ values used in the document; height-capped with internal scrolling, follows the editor scroll, ↑/↓/Enter/Esc keyboard navigation). Three ways out: **Done** and tapping outside commit and write back, while the **Cancel** button and Esc discard the changes and close (a mistaken edit can be abandoned without writing anything). Committing writes `> [!type|metadata]fold title` back in a single transaction; nothing is written while editing (the widget is never rebuilt mid-typing), and a changed source range is reported instead of overwritten. Multi-line paste into the body is normalised (CRLF unified, existing `>` prefixes stripped to avoid `> >`, trailing whitespace removed) and every line gets its `>` prefix on commit (blank lines get a bare `>`). **Touch edit button** (separate toggle, on by default): on devices without hover capability (iPad, phones, …) an edit button stays visible at the callout's top-right corner — the native one is driven by a container-level `opacity: 0` (hover-only), permanently invisible on touch and impossible to force visible with user CSS. The plugin button shows only under `hover: none` + `pointer: coarse`; desktop hover environments are pixel-identical. Parsing is tolerant of invisible web-copy pollution: zero-width characters at the start of a body line no longer make the editor open silently with an empty body.

- **Inline code enhancement** (on by default) — double-clicking inline code (`` `code` ``) in the editor copies its full content (without backticks) to the clipboard with a "Copied" notice; native double-click word selection keeps working (no preventDefault, no transactions), the code range is resolved from the CM6 syntax tree (`formatting-code` + `inline-code` mark pairing, no reliance on specific DOM structure; a DOM-boundary fallback when the tree lags, and any failure hands control back to the native behaviour); Shift/Ctrl/Alt/Meta double-clicks, single clicks and drag selections are unaffected; fenced code blocks are excluded naturally; applies in the editor (Live Preview/source mode) only.

- **First-line indent** (off by default) — indents the first line of **body paragraphs** (width adjustable between 1 and 2 CJK characters, `1em` = one CJK character), automatically excluding every non-body block: headings, tables, unordered/ordered lists, blockquotes and callouts, fenced code, math, comments, HTML blocks, frontmatter, footnote and link reference definitions, standalone block IDs, and image-only paragraphs. **Applies to Live Preview and Reading view only; source mode is deliberately excluded** (indenting there pushes the source itself right, looking like stray typed spaces). **Paragraph boundaries follow Obsidian's "Strict line breaks" setting**: in non-strict mode (Obsidian's default, where a single Enter starts a new line) every body line is a paragraph first line and is indented, while strict mode leaves continuation lines of the same paragraph un-indented — changing the setting takes effect immediately. The scope stays inside Obsidian's own body containers (`.markdown-source-view` for the editor, `.markdown-reading-view` for the reading view), so third-party views that borrow the theme's markdown classes (such as a teleprompter) are unaffected.

- **Cursor & scroll position persistence** and **Clear local persisted data** — settings entries live here (see Tabs / Data storage).

#### ✂️ Hidden Styling

Hide Markdown mark symbols: marks stay invisible by default — including while you edit inside a formatted span, where the boundary tooltip below shows the hidden marks at the caret — and reveal only where a hidden range **covers or pinches** the caret. Cleaner Live Preview, zero distraction. Independent toggles for: bold `**`, italic `*`, highlight `==`, strikethrough `~~`, inline code `` ` ``, escape `\`, heading `#` (H1–H6, hidden only when followed by a space), wikilink `[[ ]]`, HTML hex color tags, HTML underline `<u>`, and HTML line tags `<span>` (any attributes; literal inside code blocks/math). **Paired hiding**: `<font>`/`<u>`/`<span>` hide only when their closing tag exists — unclosed tags stay visible so you can spot them. Shared robustness: inline content mixing math (`$..$`) with formatting never crashes the editor, and math bodies are never hidden as marks.

- 👁️ **Whitespace visualization** — spaces shown as translucent `·`, view-range based, near-zero cost; also hides spaces inside already-hidden HTML tags.
- 🎯 **Caret visibility guard** (2.6.9) — when the caret sits inside a hidden range or is pinched between two adjacent hidden ranges (an empty inline code span, an empty bold pair — positions with no text on either side of the caret), the marks at the caret reveal so the insertion point always lands on real text: typing never comes out reversed or outside the marks (pressing `` ` `` at the start of a line auto-pairs into an empty pair with the caret in the middle, which used to trigger exactly this). The marks hide again as soon as the first character is typed, and the boundary tooltip simply does not appear where nothing is hidden.
- 🔍 **Symbol boundary hint** — a tooltip under the cursor shows which side of a hidden marker the cursor is on (left/right symbol, complete combined marks like `***` never truncated), via the CM6 `showTooltip` system. **The `|` inside the tooltip is aligned exactly with the caret** (0px deviation measured): as the caret moves left/right inside a hidden marker the `|` stays pinned to it while only the tooltip's outline grows and shrinks, so the two no longer appear to drift apart. The alignment offset is measured against the real font after the tooltip mounts, and is re-measured automatically after zoom / font / pane-size changes. In dark mode the tooltip takes its own styling (raised surface + brighter border + heavier shadow) so it cannot vanish — a black shadow has no headroom to darken a near-black canvas.

#### 🗑️ Left Ribbon

- **Orphan image cleanup** — a trash ribbon button scans all Markdown notes, extracts four image reference syntaxes (`![[path]]`, `[[path]]`, `![](path)`, `<img src>`) and lists images never referenced (jpg/jpeg/png/gif/svg) in a multi-select confirm dialog (checkboxes, paths, status, thumbnails; all selected by default) before moving them to the system trash. Unchecked images are whitelisted and pinned to the bottom next time.
- **Custom commands** — pin any Obsidian/plugin command as a ribbon icon (pick command → confirm name → choose a Lucide icon with filtering); delete and drag-reorder, order synced both ways.
- **Hidden commands** — auto-detects existing ribbon commands (custom / plugin / native), toggles them with eye / eye-off; drag-reorder persists across restarts and ribbon DOM rebuilds.

#### 📝 List Enhancement

- **List Integration** — the list marker (`-`, `1.`, `*`) becomes an atomic unit: the cursor (click / Home / arrow keys / programmatic moves) never rests inside it, Backspace removes the whole marker at once, and bullets/fold arrows keep rendering on the active line. The atomic unit is the marker plus exactly one space: extra spaces after the marker are ordinary text — ← moves across them one by one, Backspace deletes them one at a time, and only at the marker's right edge does the whole-unit removal (or level promotion) kick in (`-   foo` is never wiped in one stroke).
- **Checkbox Integration** — same treatment for the task marker: merged with the list marker into one atomic range (`- [ ]` as a whole) when both toggles are on; the checkbox widget never degrades to raw `[ ]` on the active line, and clicking the checkbox still toggles the task. **← selects the checkbox character**: with the cursor parked at the content start (`- [ ] |`), ← selects the status character between the brackets — while selected the checkbox temporarily falls back to raw text (status character highlighted, list bullet unaffected), and typing any character replaces it, restores the checkbox rendering and puts the cursor back at the content start (`- [typed] |`); ← / → again cancels the selection back to the right edge. Combined with custom-mark plugins like Task Collector, the completion state can be rewritten entirely from the keyboard; works in Live Preview and source mode alike.
- **Backspace Level Promotion** (on by default) — at the right boundary of the integrated marker (`- |` or `- [ ] |`, exactly where List Integration parks the cursor), Backspace no longer deletes the marker wholesale but unwinds progressively, one step per press: ① task items lose their checkbox first (`- [ ] |` → `- |`; ordered tasks keep `1. `); ② the item is then promoted level by level — the whole line's indent is replaced with the parent indent each press, content and subtree carried along (items with content promote too; a following former sibling becomes its child, matching Obsidian's native Shift+Tab line-level semantics); ③ with no shallower list line above (treated as top level) the list format is removed outright — leading indent and marker deleted, content kept. Requires List Integration; checkbox stripping requires Checkbox Integration.
- **Fold via list bullet on the active line** — restores hover arrow and click-to-fold on the line the cursor occupies (Obsidian disables this on active lines).
- **Enter Soft Break** — Enter inside a list item inserts a soft line break (newline + continuation indentation) instead of a new item; pressing Enter again on the blank continuation line creates the next list item. New items inherit the checkbox: after a soft break inside a task item, the created item starts with a checkbox too (always unchecked, matching Obsidian's native behavior). Inheritance follows Obsidian's native task-line rule — **any single character** between brackets counts (`[ ]`, `[x]`, Minimal's `[-]`, Tasks' `[/]`, …), and a space must follow `]` (space-less spellings never render a checkbox natively).
- **Focus list item** — moving into an item folds everything outside the focus chain (current item, ancestors, descendants); sub-settings: max second-level children to expand (slider 1–9 + toggle), **scroll sync** (off by default; scrolls the focused row to 25% of the viewport after folding) and **pin cursor** (on by default; keeps the cursor row at its on-screen position from just before the fold, so folding/unfolding happens around the cursor row without the page jumping or the cursor leaving the viewport). The two are mutually exclusive — pin cursor wins if both are on.
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
- **Toggle first-line indent** — a menu item that flips the **First-line indent** toggle in General settings (two-way synced with the settings panel, effective immediately without reloading). The command `mdrazor-toggle-first-line-indent` is always registered and stays available from the command palette or a hotkey when the menu item is off.
- **Custom / hidden commands** — add commands as menu items (icon + name); capture native/plugin menu entries with eye/eye-off, grouped by section with collapsible headers.

#### 🚀 Lazy Loading

- **Enable lazy loading** — master switch: community plugins start per their configured delays instead of all at once.
- **Check now** — opens a startup-timing dialog listing every delayed plugin's measured load time vs its delay and status, plus environment counts; copyable.
- **Per-plugin delay list** — a delay (seconds) input per community plugin; relative values define startup order. **Dormancy**: disabling a plugin in Community plugins keeps its delay config dimmed but intact — re-enabling resumes control automatically; uninstalling removes the entry.

> Lazy loading covers community plugins only; disabling the master switch or uninstalling restores natural loading (dormant plugins stay disabled — never force-started).

### Settings

Configure in Obsidian → Settings → Community plugins → MDRazor. The eight modules appear as tabs (active tab remembered for the plugin's lifetime): General (3 toggles + 1 slider), Hidden Styling (13), List Enhancement (13 toggles + 1 slider), Tabs (9 toggles + 1 slider), Status Bar (4), Left Ribbon (1), Context Menu (3), Lazy Loading (1 master + per-plugin delays).

### Data storage

Two data files live in the Obsidian config directory (default `.obsidian/`) and survive uninstall/reinstall: `md-razor-settings.json` (all settings) and `md-razor-position-cache.json` (cursor/scroll positions). Read-only mirrors (`data.json` / `position-cache.json` in the plugin folder) are maintained on every save and auto-restore the main files if they are lost or corrupted — useful against sync tools wiping non-standard files in `.obsidian`. Legacy plugin-folder data files migrate automatically on first load; clear them anytime under **Settings → General → Clear local persisted data**.

### Installation

- **Community plugins (recommended)** — Obsidian → Settings → Community plugins → search **MDRazor** → Install → Enable.
- **BRAT (pre-release)** — install [BRAT](https://obsidian.md/plugins?id=obsidian42-brat), add `Dyse-Sofqi/MDRazor`, enable MDRazor.

---

## 赞助

如果这个插件对你有帮助，欢迎扫码赞助 ❤️

![赞助](https://raw.githubusercontent.com/Dyse-Sofqi/MDRazor/main/zanshang.jpg)

也可通过 [PayPal](https://paypal.me/Sofqi) 赞助。

You can also sponsor via [PayPal](https://paypal.me/Sofqi).

## License

[0-BSD](LICENSE)
