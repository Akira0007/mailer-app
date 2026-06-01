# HANDOFF

## 给下一个执行者

项目已正常启动。Phase 1（AI 客户分析赋能）已收尾，下一阶段进入发送队列与轮转。

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

### 当前阻塞

- 发送队列尚未实现（目前还没有真正的批量发送执行闭环）
- 发件账号轮转策略尚未实现
- 单封发送目前是纯文本正文（未接 HTML 模板）
- `rolldown` 原生绑定签名问题偶发（当前构建可通过）

### 环境变量（运行时需要）

- `JINA_API_KEY` — Jina Reader API
- `ANTHROPIC_API_KEY` — Claude API

### 建议接手顺序

1. **发送队列** — SQLite 持久化 + 可暂停/恢复
2. **发件账号轮转** — 多账号权重/轮询策略
3. **发送执行器** — 队列任务消费 + SMTP 发信 + 重试
4. **基础统计落库** — 为 Reports 提供真实数据

## 交接规则

- 一次只做一个小闭环
- 先改 shared 类型，再改 main，再改 preload，最后改 renderer
- 改完立刻跑构建验证
