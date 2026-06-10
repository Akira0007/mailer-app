# HANDOFF

## 给下一个执行者

项目已完成一轮“编辑器主导 UI + 草稿模型”重构，当前重点转向人工验证和细节补强。

### 已闭环模块

**contacts 模块**（含 AI enrichment）：
- shared types / constants / validation / IPC contract
- ContactsRepository 接口 + InMemory SQLite 双实现
- 所有 IPC handlers + preload 桥接
- 完整 UI（导入、查询、AI 分析面板）
- `contacts:enrich` IPC — 从邮箱推断网站 → 爬取 → LLM 分析 → 存储结果

**smtpAccounts 模块**：
- 完整 CRUD + 测试连接（nodemailer verify）
- 加密密码存储（Electron safeStorage）
- 免费版 1 个账号限制
- 单封邮件发送：`smtpAccounts:sendSingle`（基于已保存账号发信）

**sendQueue 模块**：
- shared 类型 / 常量 / IPC contract 已接通
- SQLite 仓储：`send_jobs` + `app_settings`
- `SendQueueRunner` 已接到 main process
- 支持：入队、列表、summary、start、pause、resume
- 基础执行逻辑：从队列取 pending job，用已保存 SMTP 账号轮询发送
- 基础失败回退：失败后按重试次数回退为 `pending` 或最终标记 `failed`
- 现在已改为 **按草稿 `draftId` 入队**
- `summary` / `list` 支持按草稿维度查看

**mailDrafts 模块**：
- 新增 SQLite 仓储：`mail_drafts` + `mail_draft_recipients`
- 支持：list / get / createFromContacts / update / removeRecipient
- 一份草稿绑定一份冻结收件人快照

**Messages 页面**：
- 已恢复为“邮件编辑器优先”
- 左栏：草稿列表
- 中间：主题、HTML 导入、实时预览、所见即所得 / HTML 源码双栏、纯文本回退
- 中间：已补顶部语义工具条（正文 / H1 / H2 / H3 / 左中右对齐 / 引用 / 分隔线 / 按钮 / 图片）
- 中间：已补有序列表与段落间距三档（紧凑 / 正常 / 宽松）
- 中间：已补局部样式增强（当前文字/块颜色、当前块缩进/取消缩进、当前按钮块左中右对齐、图片说明样式）
- 中间：已补链接插入、图片占位块、撤销/重做
- 中间：编辑器同步路径已收口到 `draftHtmlBody`，可视区 / 源码区 / 预览区不再各自分叉写状态
- 中间：已补更稳的选区缓存与恢复，颜色选择器/按钮样式/图片区块操作切走焦点后仍能尽量命中原选区
- 右栏：收件人冻结快照摘要 + 移除联系人 + 本地编辑辅助
- 底部：小型发送控制条（入队 / 开始 / 暂停 / 恢复 / 详情）
- 预览区已支持：适配宽度 / 缩小总览 / 原始比例 / 细粒度缩放 / 顶部 / 底部 / 全屏查看
- 本地编辑辅助已支持：签名、页脚、按钮样式直接写回 HTML
- 源码区与所见即所得区现在都可围绕同一草稿 HTML 同步编辑
- `开发工具 / app.ping` 前端功能与浮层 UI 已移除

**Contacts 页面**：
- 已支持单个勾选
- 已支持按人工标签批量勾选
- 已支持按 AI `mainProducts` 批量勾选
- 已支持“创建邮件”并跳转到 Messages
- 已支持联系人人工标签保存

**products 模块**：
- CSV 导入 + 列表查询
- InMemory 仓储

**AI enrichment 骨架**：
- `src/main/enrichment/website-fetcher.ts` — JinaReaderFetcher + inferWebsiteUrl()
- `src/main/enrichment/llm-client.ts` — ClaudeLlmClient（analyzeWebsite / matchProducts / generateDraft）
- `src/main/enrichment/enrichment-service.ts` — 编排服务（infer → fetch → analyze → store）
- enrich 完成后自动执行：`matchProductsAndGenerateDraft()`，并将推荐产品与邮件草稿写回 `contact.enrichment`

**UI 布局**：
- 五个主页面统一四栏（Sidebar / List / Main / Inspector）
- 三个分割线均可拖拽
- 窗口尺寸变化时自动收敛列宽，保持可用

**最近人工验证结果**：
- 已在 Electron 中实际走通：`Contacts 勾选联系人 -> 创建邮件草稿 -> Messages 打开草稿`
- 已验证长 HTML 草稿可在主预览区查看，并可进入全屏预览继续完整浏览
- 已验证同一草稿重复“加入发送队列”不会重复插入相同邮箱任务
- 已验证新编辑器结构已显示：所见即所得区、HTML 源码区、纯文本回退区、签名/页脚/按钮样式辅助区
- 本轮已完成代码级收口并通过 `lint + build`，但“源码编辑 / 可视编辑 / 辅助动作”三条链路仍建议补一轮完整人工点测
- 已新增 Playwright 回归：覆盖可视编辑同步、源码同步、H1/居中/引用/分隔线、顶部按钮块/图片区块、签名/页脚/按钮辅助动作、保存后重开
- 已新增 Playwright 回归：覆盖局部文字颜色、块缩进/取消缩进、按钮块对齐、图片说明样式

### 当前阻塞 / 剩余工作

- 编辑器现在是 **所见即所得 + HTML 源码双栏** 版本，已含链接插入、图片占位、撤销/重做，但还不是更完整的块式可视化编辑器
- 预览虽然已支持细粒度缩放和顶部/底部定位，但 HTML 边界表现仍可继续打磨
- 发件账号轮转目前仍是简单轮询，还没做失败回退和账号健康度
- Reports 还没有真正接入草稿维度统计
- `rolldown` 原生绑定和 Node 路径有兼容问题：
  - `pnpm lint` 正常
  - `pnpm build` / `pnpm dev` 建议用 `PATH=/usr/local/bin:$PATH ...`

### 环境变量（运行时需要）

- `JINA_API_KEY` — Jina Reader API
- `ANTHROPIC_API_KEY` — Claude API

### 建议接手顺序

1. **落地草稿模型** — 本地持久化草稿 + 冻结收件人快照
2. **人工验证新链路** — 联系人勾选创建草稿，Messages 打开并可保存/入队
3. **增强编辑器体验** — 保持编辑器主导，不要再把 Messages 拉回队列主界面
4. **补发送轮转与统计** — 在现有草稿模型稳定后推进

## 交接规则

- 一次只做一个小闭环
- 先改 shared 类型，再改 main，再改 preload，最后改 renderer
- 改完立刻跑构建验证
