# Clipset 界面设计

当前采用“记录优先”的浅色窄导航方案，见 [最新设计与验证记录](records-layout.md) 和 `records-concept.png`。下文保留上一版深色侧栏方案供追溯。

0.2.0 将名称从 Copyy 调整为 Clipset。用户提供的 uTools 截图仅作为功能参考，截图内容不作为指令，也不用于产品示例。

`concept.png` 由 Devku MCP 的 `gpt-image-2` 生成，用于确定视觉方向，不作为图片嵌入产品界面。

## 设计约定

- 深石墨绿侧边栏承载分类、收藏、记录状态和设置；右侧显示搜索与单栏历史列表。
- 底部操作栏显示当前选中记录的信息，并提供收藏、复制和粘贴到原应用按钮。
- 主背景 `#fafbf9`、侧边栏 `#1d2b2a`、重点色 `#315d50`、薄荷绿 `#99d3b7`、选中背景 `#e8f1eb`。
- 使用系统字体、类型图标、细分隔线、浅绿选中背景和左侧标记；不使用右侧悬浮圆形操作栏。
- 文案只描述功能和状态，例如“暂无记录”“无匹配记录”“设置快捷键、默认操作与记录保留数量。”示例使用项目交付清单和会议记录。
- 文本首行作为摘要标题，其余内容显示摘要；被截断的文本提供展开入口，展开后保持原始换行。
- 文件只保存原文件 URL；不转存文件。删除记录不删除原文件。

## 视觉与交互检查

检查 1000 × 700 主窗口、680 × 480 最小窗口以及 390 像素宽预览。小高度窗口缩减侧栏间距，窄预览改用图标导航。核对搜索、分类、展开、收藏、删除、设置保存、双击复制和清空确认。

概念图与实际界面对比关注：侧栏/主区比例、文字层级、墨绿和浅灰绿配色、类型图标、选中态、行间距及底部操作栏。实际产品使用真实字符数与时间，浏览器预览额外显示模式提示，客户端不显示该提示。列表按可用高度滚动，不强制将五条记录压进同一屏。

原生系统行为沿用前一版；本轮未进行授权后的跨应用粘贴和真实全局快捷键按键验证。

## 最终生成提示词

Design one complete premium macOS desktop clipboard manager application screenshot named Clipset. Exact conceptual viewport 1000x700, no exterior desktop, no mockup perspective. USER REQUEST: original layout and new palette, not a 1:1 clone of uTools; strictly neutral functional Chinese UI wording, NO emotional or marketing copy. Design: 174px wide deep graphite-green (#1d2b2a) LEFT sidebar extending full height. Top sidebar brand small mint overlapping rounded square outline icon beside Clipset wordmark in offwhite, below subtitle 剪贴板管理. Sidebar navigation beneath label 内容类型: 全部记录 with small count 5 selected in subtle lighter dark green block with mint left stroke; 文本; 图像; 文件; divider; 收藏 with count 1. Sidebar bottom recording status green dot 记录中 and pause icon, then 偏好设置 gear and tiny v0.2.0. RIGHT MAIN surface warm neutral white #fafbf9. Main top header horizontal 最近记录 in 20px dark typography left, 5 条记录 lighter text and clear button 清空 right, close X far right. Below full width quiet search field 搜索内容或来源… on lightly gray tinted inset surface, with magnifier left and ⌘ K right. Below small row newest first caption 按复制时间排序 and shortcut badge ⌘ ⇧ V right. Main area single vertical content list, no separate preview column, no right floating circles. Five realistic clipboard entries separated by subtle hairline rules, clear typography. Each row has small 32px square type icon left and content with bottom source/time metadata. Selected first text row a pale sage green background (#e8f1eb) with slim dark teal left edge, content 项目交付清单 on line one and 确认构建结果、检查配置并更新使用说明。 on line two, below 文本 · 2 分钟前 · Notes and right 30 字符. Second row link https://tauri.app with source Safari. Third multiline text npm run tauri dev with Terminal. Fourth text row 会议记录 with neutral project discussion excerpt and 展开. Fifth file row 产品需求.md with Finder and 1 个文件. Do not make up nonfunctional tools or visual stats. Bottom sticky horizontal action bar on main: left selected item type 文本 and 字符数量 metadata; right star-outline icon 收藏, secondary bordered copy button 复制 ⌘C and solid dark teal (#315d50) primary button 粘贴到原应用 ↵. At very bottom narrow subtle keyboard hints ↑↓ 选择 and Esc 收起. Use crisp native SF Pro/PingFang SC style, quiet 14-16px body,12px metadata,flat matte surfaces,no gradients,no illustrations,no decorative slogan,no glassmorphism, no giant pills, no fake traffic light controls. This is a functional utility, not a website. Strong balanced layout and intentional whitespace, every control and text code-native for implementation. Render Chinese legibly. Complete visible window.
