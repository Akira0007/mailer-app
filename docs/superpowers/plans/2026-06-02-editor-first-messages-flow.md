# Editor-First Messages Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `Contacts -> Messages -> Send Queue` flow so `Messages` is draft-editor-first, recipients come only from selected contacts, and the queue becomes a compact bottom control strip.

**Architecture:** Keep queue execution in the main process, but introduce a persistent draft model with frozen draft recipients. `Contacts` becomes the only source of recipients, `Messages` becomes the editor shell for one saved draft at a time, and the queue enqueues from the active draft instead of from freeform recipient input.

**Tech Stack:** Electron, React, TypeScript, sql.js, typed IPC, local main-process persistence

---

### Task 1: Document the UX contract in shared memory

**Files:**
- Modify: `docs/memory/CURRENT_TASK.md`
- Modify: `docs/memory/HANDOFF.md`
- Modify: `docs/memory/DECISIONS.md`

- [ ] Record the agreed UX rules: no manual recipients in `Messages`, draft-first model, frozen recipient snapshot, no template marketplace, queue in bottom strip.
- [ ] Update “next steps” so future agents do not continue the queue-dominant UI direction.

### Task 2: Add shared draft and recipient-selection contracts

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/ipc-api.ts`
- Modify: `src/shared/constants.ts`
- Modify: `src/shared/validation.ts`

- [ ] Add `Contact.tags` as manual tags.
- [ ] Add draft types: `MailDraft`, `DraftRecipient`, `CreateDraftFromContactsInput`, `UpdateDraftInput`, `DraftListItem`, `DraftSendSummary`.
- [ ] Add typed IPC contracts for:
  - `contacts:updateTags`
  - `mailDrafts:list`
  - `mailDrafts:createFromContacts`
  - `mailDrafts:get`
  - `mailDrafts:update`
  - `mailDrafts:removeRecipient`
- [ ] Keep send queue contracts, but prepare them to enqueue from a draft rather than freeform recipient text.

### Task 3: Extend contacts persistence for manual tags

**Files:**
- Modify: `src/main/contacts-repository.ts`
- Modify: `src/main/contacts-repository-sqlite.ts`
- Modify: `src/main/index.ts`

- [ ] Add `tags` to contact read/write models.
- [ ] Add a SQLite migration for a `tags_json` column.
- [ ] Add repository method `updateTags(contactId, tags)`.
- [ ] Register IPC handler for updating contact tags.

### Task 4: Add persistent drafts and frozen draft recipients in main process

**Files:**
- Create: `src/main/mail-drafts-repository.ts`
- Modify: `src/main/index.ts`

- [ ] Add local persistence for:
  - `mail_drafts`
  - `mail_draft_recipients`
- [ ] Store one draft with one frozen recipient snapshot.
- [ ] Support create/list/get/update/remove-recipient.
- [ ] When creating from contacts, copy contact id + email + name + company + tags + enrichment summary needed for display.

### Task 5: Reconnect send queue to drafts

**Files:**
- Modify: `src/main/send-queue-repository-sqlite.ts`
- Modify: `src/main/send-queue-runner.ts`
- Modify: `src/main/index.ts`

- [ ] Add `draftId` to queued jobs so queue rows can be tied back to the active draft.
- [ ] Replace freeform enqueue with `enqueueDraft(draftId)`.
- [ ] Preserve start/pause/resume/summary behavior.
- [ ] Keep current simple round-robin sender selection for now.

### Task 6: Expose new APIs through preload

**Files:**
- Modify: `src/main/preload.ts`
- Modify: `src/renderer/global.d.ts`

- [ ] Expose explicit methods for contact tagging and mail drafts.
- [ ] Keep preload surface explicit; do not add generic invoke helpers.

### Task 7: Add contact selection and batch-pick UI in Contacts

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles/App.css`

- [ ] Add checkbox selection per contact row.
- [ ] Add selected-count state.
- [ ] Add “按标签批量勾选” and “按主营产品批量勾选”, both append-and-dedupe.
- [ ] Add a clear-selection action.
- [ ] Add “创建邮件” action to create a draft from the selected contacts and navigate to `Messages`.
- [ ] Add minimal manual tag editing in contact detail so tag-based selection has a usable source.

### Task 8: Restore Messages to editor-first layout

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles/App.css`

- [ ] Replace queue-job list in the left pane with saved draft list.
- [ ] Keep the editor-focused center pane:
  - subject
  - visual editor shell
  - HTML import entry
- [ ] Replace right pane with:
  - recipient snapshot summary
  - compact recipient list
  - remove-recipient action
  - local editing helper controls only
- [ ] Remove manual-recipient textarea from `Messages`.

### Task 9: Shrink queue UI into a bottom send strip

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles/App.css`

- [ ] Move queue controls to a compact strip at the bottom of the editor area.
- [ ] Show only:
  - start send
  - pause
  - resume
  - summary status
  - sent count / total
  - failed count
  - optional “查看详情” toggle

### Task 10: Verify and update handoff

**Files:**
- Modify: `docs/memory/CURRENT_TASK.md`
- Modify: `docs/memory/HANDOFF.md`

- [ ] Run `pnpm lint`.
- [ ] Run `pnpm build`.
- [ ] Launch `pnpm dev` and confirm:
  - Contacts can select recipients and create a draft
  - Messages opens the saved draft
  - Queue controls still render from the active draft
- [ ] Update handoff notes with any gaps left for the next slice.
