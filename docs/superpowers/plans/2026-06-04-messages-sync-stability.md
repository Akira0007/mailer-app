# Messages Sync Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize `Messages` so the WYSIWYG editor, HTML source editor, and preview all stay in sync through one canonical `htmlBody` flow.

**Architecture:** Keep the current editor-first UI and existing draft model. Concentrate the sync behavior in `src/renderer/App.tsx` so all edit surfaces and helper actions update one canonical draft HTML value, then derive the preview and companion surfaces from that value. Avoid IPC, schema, or queue changes in this slice.

**Tech Stack:** React, TypeScript, Electron renderer, existing draft IPC APIs, existing CSS module structure

---

### Task 1: Audit the current sync paths and lock the single-source-of-truth design

**Files:**
- Modify: `/Users/raul/Project/mailer-app/src/renderer/App.tsx`
- Modify: `/Users/raul/Project/mailer-app/docs/memory/CURRENT_TASK.md`
- Modify: `/Users/raul/Project/mailer-app/docs/memory/HANDOFF.md`

- [ ] **Step 1: Locate all current HTML mutation paths**

Read and catalog the functions that currently mutate draft HTML or rehydrate editor surfaces:

```ts
// Expected focus areas in App.tsx
setDraftHtmlBody(...)
setDraftTextBody(...)
setSelectedDraft(...)
insertLinkAtCursor()
insertImagePlaceholderBlock()
applySignatureBlock()
applyFooterBlock()
applyButtonStyle()
saveDraftChanges()
```

- [ ] **Step 2: Identify split-brain risks and write the target rules inline as comments**

Add brief comments near the shared editor state in `App.tsx` to make the intended flow explicit:

```ts
// `draftHtmlBody` is the only editable source of truth for the current draft HTML.
// Visual editor, source editor, and preview must all rehydrate from this value.
const [draftHtmlBody, setDraftHtmlBody] = useState('');
```

- [ ] **Step 3: Update the memory docs before code changes**

Append one short note to both memory files describing the slice:

```md
- 当前小闭环：收敛 Messages 编辑器同步逻辑，确保可视区 / 源码区 / 预览区围绕同一份 htmlBody 工作
```

- [ ] **Step 4: Commit the planning checkpoint**

Run:

```bash
cd /Users/raul/Project/mailer-app
git add docs/memory/CURRENT_TASK.md docs/memory/HANDOFF.md docs/superpowers/plans/2026-06-04-messages-sync-stability.md
git commit -m "docs: plan messages sync stability"
```

Expected: one commit that records the plan and current intent.

### Task 2: Centralize all HTML updates behind one renderer-side update path

**Files:**
- Modify: `/Users/raul/Project/mailer-app/src/renderer/App.tsx`
- Test: manual renderer verification in running Electron/Vite app

- [ ] **Step 1: Introduce one helper for canonical HTML updates**

Create one narrow helper in `App.tsx` for all HTML mutations:

```ts
function updateDraftHtmlBody(nextHtml: string) {
  setDraftHtmlBody(nextHtml);
  setSelectedDraft((current) => {
    if (!current) {
      return current;
    }

    return {
      ...current,
      htmlBody: nextHtml,
    };
  });
}
```

- [ ] **Step 2: Add a helper for DOM-based transform updates**

Add a second helper to keep helper actions from editing multiple surfaces independently:

```ts
function transformDraftHtmlBody(transformer: (document: Document, body: HTMLElement) => void) {
  const parser = new DOMParser();
  const document = parser.parseFromString(draftHtmlBody || DEFAULT_TEMPLATE_HTML, 'text/html');
  const body = document.body;

  transformer(document, body);
  updateDraftHtmlBody(document.documentElement.outerHTML);
}
```

- [ ] **Step 3: Replace direct HTML writes with the helper**

Refactor the existing actions so they no longer call `setDraftHtmlBody(...)` directly:

```ts
function handleSourceHtmlChange(nextHtml: string) {
  updateDraftHtmlBody(nextHtml);
}

function applySignatureBlock() {
  transformDraftHtmlBody((document, body) => {
    // existing signature block mutation logic
  });
}
```

- [ ] **Step 4: Rehydrate the visual editor only from canonical HTML**

Keep the `contentEditable` surface synchronized by hydrating it from `draftHtmlBody` in one place and guarding against redundant resets:

```ts
if (visualEditorRef.current && visualEditorRef.current.innerHTML !== normalizedVisualHtml) {
  visualEditorRef.current.innerHTML = normalizedVisualHtml;
}
```

- [ ] **Step 5: Run lint after the sync refactor**

Run:

```bash
cd /Users/raul/Project/mailer-app
pnpm lint
```

Expected: PASS with no new lint errors.

### Task 3: Normalize visual-editor edits and source-editor edits into the same history flow

**Files:**
- Modify: `/Users/raul/Project/mailer-app/src/renderer/App.tsx`
- Modify: `/Users/raul/Project/mailer-app/src/renderer/styles/App.css`
- Test: manual renderer verification in running Electron/Vite app

- [ ] **Step 1: Route visual-editor input through the canonical updater**

Update the visual editor input handler so it derives HTML from the contentEditable surface and commits through `updateDraftHtmlBody(...)`:

```ts
function handleVisualEditorInput() {
  const nextHtml = visualEditorRef.current?.innerHTML ?? '';
  updateDraftHtmlBody(wrapVisualHtml(nextHtml));
}
```

- [ ] **Step 2: Record source undo/redo snapshots only from canonical HTML**

Use the shared `draftHtmlBody` value to manage source history snapshots:

```ts
function commitSourceSnapshot(nextHtml: string) {
  updateDraftHtmlBody(nextHtml);
  pushSourceHistory(nextHtml);
}
```

- [ ] **Step 3: Ensure undo/redo refreshes all surfaces**

After undo or redo, refresh the canonical HTML instead of only updating the source textarea:

```ts
function handleSourceUndo() {
  const previousHtml = getPreviousSourceSnapshot();
  if (!previousHtml) {
    return;
  }

  updateDraftHtmlBody(previousHtml);
}
```

- [ ] **Step 4: Add a small visual guard style for sync state if needed**

If the current editor surfaces need a subtle state hint, keep it tiny and local:

```css
.editor-surface[data-sync-state='dirty'] {
  outline: 1px solid rgba(245, 158, 11, 0.35);
}
```

Only keep this if the state is already available and genuinely improves clarity.

- [ ] **Step 5: Run build after the history/sync changes**

Run:

```bash
cd /Users/raul/Project/mailer-app
PATH=/usr/local/bin:$PATH pnpm build
```

Expected: PASS with the existing large-chunk warning only.

### Task 4: Verify the existing helper actions no longer desynchronize the three surfaces

**Files:**
- Modify: `/Users/raul/Project/mailer-app/src/renderer/App.tsx`
- Modify: `/Users/raul/Project/mailer-app/docs/memory/CURRENT_TASK.md`
- Modify: `/Users/raul/Project/mailer-app/docs/memory/HANDOFF.md`
- Test: manual renderer verification in running Electron/Vite app

- [ ] **Step 1: Keep helper actions on the canonical mutation path**

Ensure these actions all end by updating `draftHtmlBody` exactly once:

```ts
insertLinkAtCursor()
insertImagePlaceholderBlock()
applySignatureBlock()
applyFooterBlock()
applyButtonStyle()
```

- [ ] **Step 2: Manually verify the five sync-critical scenarios**

Run:

```text
1. Edit text in WYSIWYG -> source HTML changes -> preview changes
2. Edit HTML source -> WYSIWYG changes -> preview changes
3. Insert link -> all three surfaces show the new anchor
4. Insert image placeholder -> all three surfaces show the block
5. Apply signature/footer/button styling -> WYSIWYG and preview stay aligned
```

Expected: no stale surface, no duplicate helper block, no one-surface-only updates.

- [ ] **Step 3: Update memory docs with the verified outcome**

Append a short result note:

```md
- Messages 同步稳定性闭环完成：可视区 / 源码区 / 预览区统一围绕 draftHtmlBody 更新
```

- [ ] **Step 4: Commit the implementation**

Run:

```bash
cd /Users/raul/Project/mailer-app
git add src/renderer/App.tsx src/renderer/styles/App.css docs/memory/CURRENT_TASK.md docs/memory/HANDOFF.md
git commit -m "fix: stabilize messages editor sync"
```

Expected: one feature commit for the sync-stability slice.

## Self-Review

- Spec coverage: this plan only covers the approved scope of sync stability across WYSIWYG, source HTML, preview, helper actions, and undo/redo.
- Placeholder scan: no `TODO`, `TBD`, or deferred implementation markers remain.
- Type consistency: the plan consistently uses `draftHtmlBody` as the single source of truth and keeps all sync work in `src/renderer/App.tsx`.
