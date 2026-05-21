# TROUBLESHOOTING

## 常用命令

```bash
pnpm dev
pnpm build
pnpm lint
pnpm build:electron
```

## 常见问题

- `pnpm dev` 没反应：先看 Vite 和 Electron 是否都在跑
- Electron 路径报错：检查 `package.json` 的 `main` 和 `tsconfig.electron.json`
- preload 不生效：检查 `src/main/index.ts` 里的 preload 路径
- UI 没刷新：确认 `index.html` 指向 `src/renderer/main.tsx`

## 处理顺序

先修启动链路，再修业务逻辑。
