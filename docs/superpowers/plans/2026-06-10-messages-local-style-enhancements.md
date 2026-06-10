# Messages Local Style Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local editor-only styling controls for current text/block color, current block indent, current CTA alignment, current image caption styling, and strengthen visual selection stability.

**Architecture:** Keep `Messages` editor centered on the existing `draftHtmlBody` single source of truth. Extend the current visual-toolbar command path in `src/renderer/App.tsx`, add only the smallest CSS needed in `src/renderer/styles/App.css`, and expand the existing Playwright regression file instead of creating a new test surface.

**Tech Stack:** React, TypeScript, Electron renderer, Playwright, existing contentEditable editor

---

### Task 1: Extend the regression to describe the new local-style behaviors

**Files:**
- Modify: `/Users/raul/Project/mailer-app/tests/e2e/messages-sync.spec.ts`

- [ ] Add checks for block-level text color application, indent/outdent, CTA alignment, and image caption style using the existing `Sync QA Draft` flow.
- [ ] Keep the assertions focused on observable output in `.newsletter-preview-html` and `.html-source-textarea`.

### Task 2: Implement local style controls in the visual editor

**Files:**
- Modify: `/Users/raul/Project/mailer-app/src/renderer/App.tsx`
- Modify: `/Users/raul/Project/mailer-app/src/renderer/styles/App.css`

- [ ] Add minimal state and helpers for local text color, visual selection snapshot/restore, local indent/outdent, selected CTA alignment, and image caption style application.
- [ ] Add the smallest toolbar additions needed to trigger those helpers without changing the page structure.
- [ ] Keep every mutation flowing back through `draftHtmlBody` so source editor and preview keep syncing from the same state.

### Task 3: Refresh docs and verify end-to-end

**Files:**
- Modify: `/Users/raul/Project/mailer-app/docs/memory/CURRENT_TASK.md`
- Modify: `/Users/raul/Project/mailer-app/docs/memory/HANDOFF.md`

- [ ] Update memory docs with the new editor capabilities and regression coverage.
- [ ] Run:
  - `PATH=/usr/local/bin:$PATH pnpm exec playwright test tests/e2e/messages-sync.spec.ts --reporter=line --output=/tmp/pw-output`
  - `pnpm lint`
  - `PATH=/usr/local/bin:$PATH pnpm build`
