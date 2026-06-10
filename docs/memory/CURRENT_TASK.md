# CURRENT_TASK

## 当前任务

Phase 2 进行中：将 `Messages` 从队列主导重构为编辑器主导，同时保留底部发送控制条。

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
- **smtpAccounts 模块**：单封邮件发送闭环（账号选择 + 收件人 + 主题 + 正文）✅
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
- **AI enrichment 闭环**：分析完成后自动执行产品匹配 + 邮件草稿生成，并回写 enrichment ✅
- **UI 布局**：Messages / Contacts / SMTP / Products / Reports 统一为四栏可拖拽，自适应宽度 ✅
- **sendQueue 模块**：shared 类型、常量、IPC 合同 ✅
- **sendQueue 模块**：SQLite 仓储（send_jobs + app_settings）✅
- **sendQueue 模块**：main runner（暂停/恢复、轮询取任务、基础重试）✅
- **sendQueue 模块**：已改为从 `draftId` 入队，并支持按草稿查询 summary / jobs ✅
- **mailDrafts 模块**：本地持久化草稿 + 冻结收件人快照（SQLite）✅
- **contacts 模块**：人工标签字段 + 标签保存 IPC / SQLite 持久化 ✅
- **Contacts 页面**：支持单个勾选、按标签批量勾选、按主营产品批量勾选、创建草稿 ✅
- **Messages 页面**：已恢复为编辑器主导（左草稿列表 / 中间编辑器 / 右侧收件人快照 / 底部发送条）✅
- **Messages 页面**：邮件预览已支持适配宽度 / 缩小总览 / 原始比例 / 全屏查看 ✅
- **Messages 页面**：HTML 编辑区已升级为“所见即所得 + 源码双栏”，并保留纯文本回退 ✅
- **Messages 页面**：预览区已支持顶部 / 底部定位、细粒度缩放档位 ✅
- **Messages 页面**：右侧已接入本地编辑辅助（签名 / 页脚 / 按钮样式）✅
- **Messages 页面**：已补链接插入、图片占位块、撤销 / 重做体验 ✅
- **Messages 页面**：编辑器同步路径已收口到 `draftHtmlBody`，可视区 / 源码区 / 预览区围绕同一状态更新 ✅
- **Messages 页面**：顶部语义工具条已增强（正文 / H1 / H2 / H3 / 左中右对齐 / 引用 / 分隔线 / 按钮 / 图片）✅
- **Messages 页面**：顶部语义工具条已补有序列表与段落间距三档（紧凑 / 正常 / 宽松）✅
- **Messages 页面**：顶部工具条已补局部样式增强（当前文字/块颜色、当前块缩进/取消缩进、当前按钮块左中右对齐、图片说明样式）✅
- **Messages 页面**：可视编辑选区缓存已加强，颜色选择/按钮样式/图片区块操作切走焦点后仍能恢复目标选区 ✅
- **Messages 页面**：`开发工具 / app.ping` 前端功能与 UI 已移除 ✅
- **sendQueue 模块**：同一草稿下按邮箱去重入队（`draft_id + to_email` 唯一约束）✅
- 构建验证：TypeScript 编译通过（两个配置均通过）
- 构建验证：`pnpm lint` 通过 ✅
- 构建验证：`PATH=/usr/local/bin:$PATH pnpm build` 通过 ✅
- 自动化验证：`tests/e2e/messages-sync.spec.ts` 已覆盖顶部语义工具条与编辑器同步主链路 ✅
- 自动化验证：`tests/e2e/messages-sync.spec.ts` 已覆盖局部文字颜色、块缩进、按钮块对齐、图片说明样式 ✅
- UI 启动验证：`PATH=/usr/local/bin:$PATH pnpm dev` 可启动 Vite + Electron 进程 ✅
- UI 人工验证：`Contacts 勾选 -> 创建草稿 -> Messages 预览 -> 全屏预览 -> 队列去重` 已实际走通 ✅

## 下一步

1. **继续补编辑器能力**：从当前双栏编辑器继续往更完整的块式编辑体验推进
   当前已具备：链接插入、图片占位、源码撤销/重做、可视编辑撤销/重做
2. **补发送策略**：多账号轮转失败回退、账号健康度、限速策略
3. **补统计**：按草稿 / 账号 / 状态沉淀 Reports 所需数据
4. **继续做 UI 人工验证**：重点回归 HTML 导入、辅助块插入、源码/可视区同步、预览全屏与发送链路

## 环境变量

需要启动时设置：
- `JINA_API_KEY` — Jina Reader API（网站爬取）
- `ANTHROPIC_API_KEY` — Claude API（业务分析 + 产品匹配 + 草稿生成）

## 注意

- 一次只做一个小闭环
- 先改 shared，再改 main，再改 preload，最后改 renderer
- 改完立刻跑构建验证
- 当前构建环境对 Node 路径敏感：
  - `pnpm lint` 直接可跑
  - `pnpm build` / `pnpm dev` 建议使用 `PATH=/usr/local/bin:$PATH ...`
