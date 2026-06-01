# DECISIONS

## D-001

采用安全版重构：

- 保留现有 Vite + 手动 Electron 编译方式
- 迁移到 `src/main`、`src/renderer`、`src/shared`
- 先跑通开发与构建，再逐步加业务模块

## D-002

Claude 负责具体代码执行。

Codex 负责 review、bug 修复和风险检查。

## D-003

MVP 阶段不引入：

- App Store / IAP / MAS
- CRM
- 云同步
- 大规模真实群发

## D-004

第一个最小闭环选择 `app.ping` typed IPC，用来验证 main、preload 和 renderer 的通信链路。

## D-005

当前 Electron 窗口使用 `sandbox: false`，正式说明见 [docs/adr/0001-sandbox-false-for-ipc-ping.md](/Users/raul/Project/mailer-app/docs/adr/0001-sandbox-false-for-ipc-ping.md)。

## D-006

联系人 enrichment 完成后自动触发产品匹配与邮件草稿生成，结果存入 `Contact.enrichment`：

- `matchedProducts[]`
- `emailDraft`

这样先形成“分析→推荐→草稿”的最小业务闭环，再进入发送队列阶段。
