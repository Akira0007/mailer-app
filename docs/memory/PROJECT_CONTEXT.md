# PROJECT_CONTEXT

## 目标

做一个本地优先的 macOS Electron 邮件客户端 MVP，用于联系人导入、SMTP 发信、发送队列、基础统计和后续扩展。

## 当前技术路线

- Electron + React + TypeScript + Vite
- 本地优先
- 主进程负责数据库、SMTP、队列、文件和密钥
- Renderer 只负责 UI
- Shared 只放类型、常量和纯函数

## 当前结构

```text
src/main/
src/renderer/
src/shared/
docs/memory/
```

## 当前状态

- 安全版重构已完成
- `pnpm dev` 已验证可用
- `pnpm build` 已验证可用
- `pnpm lint` 已验证可用
- Contacts / SMTP / Products / Reports 基础模块已接通
- AI enrichment 已接通到“网站分析 → 产品匹配 → 邮件草稿”
- 五个主页面统一四栏可拖拽布局

## 目前优先级

1. 发送队列（持久化、暂停/恢复）
2. 多 SMTP 账号轮转策略
3. 真实发送执行与结果落库
4. 再扩展模板编辑、统计、付费能力
