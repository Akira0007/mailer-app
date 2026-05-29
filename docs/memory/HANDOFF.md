# HANDOFF

## 给下一个执行者

项目已正常启动。Phase 1（AI 客户分析赋能层骨架）已完成。

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

**products 模块**：
- CSV 导入 + 列表查询
- InMemory 仓储

**AI enrichment 骨架**：
- `src/main/enrichment/website-fetcher.ts` — JinaReaderFetcher + inferWebsiteUrl()
- `src/main/enrichment/llm-client.ts` — ClaudeLlmClient（analyzeWebsite / matchProducts / generateDraft）
- `src/main/enrichment/enrichment-service.ts` — 编排服务（infer → fetch → analyze → store）

### 当前阻塞

- `better-sqlite3` 在 Electron ABI 下未重建成功（运行时已自动降级到 InMemory，不阻塞 UI）
- `rolldown` 原生绑定签名问题（仅影响 Vite 打包，TypeScript 编译正常）

### 环境变量（运行时需要）

- `JINA_API_KEY` — Jina Reader API
- `ANTHROPIC_API_KEY` — Claude API

### 建议接手顺序

1. **产品匹配 + 草稿生成** — 在 enrichment-service.ts 中扩展，匹配后自动邮件草稿
2. **发送队列** — SQLite 持久化 + 可暂停/恢复
3. **发件账号轮转** — 多账号权重/轮询策略
4. **解决原生模块编译** — better-sqlite3 / rolldown

## 交接规则

- 一次只做一个小闭环
- 先改 shared 类型，再改 main，再改 preload，最后改 renderer
- 改完立刻跑构建验证
