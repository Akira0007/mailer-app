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

## 目前优先级

1. 先把最小的 typed IPC 做出来
2. 再补联系人导入、SMTP、发送队列
3. 后面再考虑模板、签名、AI 和付费能力
