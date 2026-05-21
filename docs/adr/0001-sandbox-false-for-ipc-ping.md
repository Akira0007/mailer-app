# ADR-0001: Use `sandbox: false` for the current Electron window

## Status

Accepted

## Context

The project needs a small, reliable IPC bridge for the first typed `app.ping` loop.

While `contextIsolation: true` and `nodeIntegration: false` stay enabled, the current Electron + ESM preload setup was not consistently exposing `window.api` when `sandbox: true` was enabled.

The immediate goal is to keep the development loop working and keep the IPC seam easy to debug.

## Decision

Set `sandbox: false` on the main `BrowserWindow` for the current MVP phase.

Keep the other security flags in place:

- `contextIsolation: true`
- `nodeIntegration: false`

## Consequences

### Positive

- `preload` can expose `window.api` reliably for the current IPC setup.
- `app.ping` stays simple and testable.
- The first renderer-main bridge becomes stable enough for the next small feature slice.

### Tradeoff

- The window loses the extra sandbox layer for now.

### Follow-up

Revisit this decision after the first few IPC seams are working and the app has a more complete test harness.
If the bridge can be made stable with `sandbox: true` later, switch back.
