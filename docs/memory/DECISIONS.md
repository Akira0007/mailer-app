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

## D-007

发送能力采用分阶段交付：

1. 先完成 SMTP 单封邮件发送（最小可验证闭环）
2. 再把单封发送能力接入发送队列
3. 最后加多账号轮转与统计

## D-008

`Messages` 页改回编辑器优先，而不是队列优先：

- 左侧显示邮件草稿列表
- 中间主区域保持邮件编辑器形态
- 右侧显示本次收件人快照摘要和本地编辑辅助面板
- 发送队列控制台缩到底部，不再占据主内容区

## D-009

收件人只能从 `Contacts` 进入发送流程：

- `Messages` 禁止手工录入收件人
- `Contacts` 勾选联系人后，点击“创建邮件/新建发送任务”
- 生成一份冻结的收件人快照，再跳到 `Messages`

## D-010

邮件草稿采用本地持久化，并且第一版是 `1` 份草稿绑定 `1` 份冻结收件人快照：

- 草稿支持保存后下次继续编辑
- `Messages` 允许查看收件人快照并移除少量联系人
- 不允许在 `Messages` 中重新筛选或新增收件人

## D-011

`Contacts` 第一版的批量勾选能力只支持三类入口：

- 手动勾选单个联系人
- 按人工标签批量勾选
- 按 AI enrichment 的主营产品批量勾选

批量勾选规则为“追加并去重”，不是覆盖当前已选集合。

## D-012

不做模板市场：

- 保留 `HTML` 导入
- 右侧只做本地编辑辅助面板
- 后续可以做签名、样式、AI 内容生成，但不走在线模板商城路线
