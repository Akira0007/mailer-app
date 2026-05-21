# mailer-app

一个本地优先的 macOS Electron 邮件客户端 MVP。

## 当前状态

- 已完成安全版重构。
- 代码结构已拆成 `src/main`、`src/renderer`、`src/shared`。
- 已接通 `app.ping` 的 typed IPC 最小闭环。
- `pnpm dev`、`pnpm build`、`pnpm lint` 已验证可用。
- 当前仓库已推送到 GitHub。

## 技术栈

- Electron
- React
- TypeScript
- Vite
- pnpm

## 开发启动

```bash
pnpm install
pnpm dev
```

## 构建

```bash
pnpm build
```

## 目录结构

```text
src/
  main/       Electron 主进程和 preload
  renderer/   React UI
  shared/     共享类型和纯函数
docs/memory/  项目记忆和协作上下文
```

## 协作方式

- Claude 负责具体代码执行。
- Codex 负责 review、bug 修复和风险检查。
- Google AI Studio 负责 UI 视觉方向。

## 说明

这是邮件群发客户端的早期 MVP，不包含 App Store、IAP、CRM、云同步和大规模真实群发。
