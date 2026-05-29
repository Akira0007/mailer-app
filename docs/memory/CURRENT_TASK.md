# CURRENT_TASK

## 当前任务

Phase 1 收尾：AI 客户分析赋能层骨架已完成，下一步连接产品匹配 + 邮件草稿生成。

## 已完成

- 项目脚手架（Electron + TypeScript + Vite）
- 三层目录结构（main / renderer / shared）
- docs/memory/ 全套文档
- `app.ping` typed IPC 已接通
- **contacts 模块**：shared 三件套（types / constants / validation）✅
- **contacts 模块**：IPC 合同（shared + preload）✅
- **contacts 模块**：IPC handler 注册（InMemory + SQLite 双实现）✅
- **contacts 模块**：UI 完整（导入预览 + 提交导入 + 列表查询）✅
- **contacts 模块**：CSV / XLSX 文件导入解析（renderer）✅
- **smtpAccounts 模块**：shared 类型、常量、IPC 合同 ✅
- **smtpAccounts 模块**：main/preload/UI 骨架接通 ✅
- **smtpAccounts 模块**：输入校验 + 免费版 1 个账号限制 ✅
- **smtpAccounts 模块**：测试连接升级为 `nodemailer.verify()` ✅
- **products 模块**：shared 类型、IPC 合同 ✅
- **products 模块**：InMemory 仓储（导入产品列表）✅
- **products 模块**：main/preload/UI 骨架（CSV 导入 + 表格展示）✅
- **AI enrichment 骨架**：website-fetcher.ts（JinaReaderFetcher + inferWebsiteUrl）✅
- **AI enrichment 骨架**：llm-client.ts（ClaudeLlmClient 分析/匹配/草稿）✅
- **enrichment-service.ts**：编排服务（infer → fetch → analyze → store）✅
- **Contact enrichment 字段**：ContactEnrichment 类型 + Contact.enrichment ✅
- **IPC 通道**：`contacts:enrich` 已注册 + preload 桥接 ✅
- **ContactsRepository**：findById() + updateEnrichment() 双实现（InMemory + SQLite）✅
- **UI**：联系人详情中 AI 分析面板（含查看/触发/重新分析按钮）✅
- 构建验证：TypeScript 编译通过（两个配置均通过）

## 下一步

1. **产品匹配 + 草稿生成**：在 enrichment-service.ts 中添加 `matchProductsAndGenerateDraft()`，由 enrichContact() 完成后自动触发
2. **发送队列**：SQLite 持久化 + 可暂停/恢复队列
3. **发件账号轮转**：多账号权重/轮询策略
4. **解决 `better-sqlite3`** Electron 原生模块编译问题

## 环境变量

需要启动时设置：
- `JINA_API_KEY` — Jina Reader API（网站爬取）
- `ANTHROPIC_API_KEY` — Claude API（业务分析 + 产品匹配 + 草稿生成）

## 注意

- 一次只做一个小闭环
- 先改 shared，再改 main，再改 preload，最后改 renderer
- 改完立刻跑构建验证
