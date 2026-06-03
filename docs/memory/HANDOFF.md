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
- 中间：主题、HTML 导入、实时预览、HTML / 纯文本编辑
- 右栏：收件人冻结快照摘要 + 移除联系人
- 底部：小型发送控制条（入队 / 开始 / 暂停 / 恢复 / 详情）
- 预览区已支持：适配宽度 / 缩小总览 / 原始比例 / 全屏查看
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

### 当前阻塞 / 剩余工作

- 编辑器现在是 **HTML 导入 + 实时预览** 版本，还不是更完整的块式可视化编辑器
- 预览虽然已可完整查看，但缩放/滚动体验还有继续打磨空间
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
4. **之后再做轮转补强和统计**

## 交接规则

- 一次只做一个小闭环
- 先改 shared 类型，再改 main，再改 preload，最后改 renderer
- 改完立刻跑构建验证
