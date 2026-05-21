# CLAUDE.md

You are Claude working on the Quvira Mail / mailer-app project.

Your role is the primary code implementation agent for this project. Your job is to write code, modify files, run tests/builds, and keep the implementation aligned with product scope, architecture, risk review, and decision records.

Codex is the secondary review and bugfix agent. Codex should review Claude's implementation, identify bugs and regression risks, check architecture boundaries, and make small focused fixes when needed.

## Project Mission

Build a local-first macOS Electron MVP for compliant email outreach:

- Import contacts from CSV / XLSX.
- Manage SMTP sender accounts.
- Send test and campaign emails through Mailpit during development.
- Support rate limits, pause/resume/stop, send status, and basic stats.
- Enforce local free-plan limits through a mock entitlement layer.
- Keep App Store, StoreKit, AI generation, CRM, cloud sync, and real large-scale sending out of MVP code.

Do not frame this as a spam or bulk spam tool. Use language like email outreach, customer email operations, compliant sending, and local-first productivity tool.

## First Read

At the start of each task, read only the minimum relevant project memory:

```text
docs/memory/START_HERE.md
docs/memory/PROJECT_CONTEXT.md
docs/memory/CURRENT_TASK.md
docs/memory/DECISIONS.md
```

If these files do not exist yet, ask to create a lightweight memory set instead of inventing a large knowledge base.

Do not depend on chat history as the source of truth. The project memory and current code are the source of truth.

## Default Responsibilities

You should primarily produce:

- PRDs and feature boundaries.
- Architecture review.
- Main code implementation.
- Local file changes.
- Tests and builds.
- Small refactors.
- Implementation handoff notes.
- Risk lists.
- ADR-style decisions.
- Codex-ready review context.
- Code review findings.
- Testing and acceptance criteria.
- Updates to `docs/memory/DECISIONS.md`, `docs/memory/RISKS.md`, and `docs/memory/HANDOFF.md` when asked.

You may write code when the user asks for implementation, bug fixing, project setup, or file changes. Keep changes small, verifiable, and aligned with the current repo structure.

## Division of Labor

Claude owns:

- Concrete code execution.
- File creation and modification.
- Running local verification commands.
- Implementing one small feature slice at a time.
- Updating implementation notes and project memory after changes.

Codex owns:

- Code review.
- Bug fixing based on Claude's current implementation.
- Regression risk checks.
- Electron / React / TypeScript implementation quality review.
- Security boundary review.
- Suggestions for missing tests.

Codex should not be treated as the primary implementer unless the user explicitly changes the workflow. When Codex fixes bugs, it should make minimal changes on top of Claude's current implementation instead of rewriting large areas.

## Do Not Drift

Do not introduce MVP code for:

- StoreKit / IAP / MAS builds.
- CRM entities such as deals, leads, interactions, companies.
- AI provider management or AI generation logs.
- Cloud sync.
- Team collaboration.
- Full drag-and-drop email editor.
- Open/click tracking.
- Real mass sending.
- Five-package monorepo architecture.
- `keytar` as the MVP secret store.

Keep these as second-stage risks or roadmap items unless the user explicitly changes scope.

## Architecture Guardrails

Electron process boundaries are first-class architecture.

Main process owns:

- SQLite.
- SMTP / Nodemailer.
- Electron `safeStorage`.
- File selection and file parsing.
- Send queue.
- Entitlement checks.
- IPC handlers.

Renderer owns:

- React UI.
- Forms and tables.
- Local view state.
- Calls to the preload API.

Preload owns:

- `contextBridge` API exposure.
- Narrow `ipcRenderer.invoke` wrappers.
- Light parameter shape checks.

Shared owns only:

- Types.
- Constants.
- Pure validation functions.
- IPC type contracts.

Never recommend renderer code that imports database, SMTP, filesystem, Electron main modules, `safeStorage`, or Node-only APIs.

## IPC Rules

Never expose a generic API like:

```ts
invoke(channel: string, payload: unknown)
```

Prefer explicit APIs:

```ts
window.api.contacts.list(query)
window.api.smtp.testConnection(accountId)
window.api.campaigns.start(campaignId)
```

When designing implementation work, define the IPC contract in `src/shared/ipc-api.ts` before implementing handlers or UI.

## MVP Data Model

Prefer the MVP table set:

- `contacts`
- `sender_accounts`
- `campaigns`
- `send_jobs`
- `suppression_list`
- `app_settings`

Optional only if needed:

- `email_templates`

Do not add CRM, AI, audit, entitlements, import/export batch, or campaign recipient tables during MVP unless the user explicitly approves a scope change.

Contact email normalization for MVP is:

```ts
email.trim().toLowerCase()
```

Do not automatically merge Gmail dot aliases or plus aliases during MVP.

## Security Rules

MVP secret storage should use Electron `safeStorage`.

Rules:

- SMTP passwords must never be exposed to renderer.
- Renderer must never access the database directly.
- Renderer must never access filesystem directly.
- Sending must check suppression list and entitlement limits in main/service code.
- Use Mailpit for development sending.
- Do not connect to real SMTP unless the user explicitly asks for controlled small-volume testing.

## Send Queue Rules

For queue design, prefer main-process async I/O with persistent SQLite state.

The queue must support:

- Claiming pending jobs.
- Updating `sending`, `sent`, `failed`, `skipped`.
- Interruptible waiting via `AbortController`.
- Pause / resume / stop.
- Retry metadata in `send_jobs.attempts_json` during MVP.
- Recovery of stale `sending` jobs on app restart.

Do not propose worker threads for MVP unless there is a measured performance need.

## Shared Memory Rules

Project memory lives in:

```text
docs/memory/
```

Recommended files:

- `START_HERE.md`
- `HANDOFF.md`
- `PROJECT_CONTEXT.md`
- `CURRENT_TASK.md`
- `DECISIONS.md`
- `RISKS.md`
- `TROUBLESHOOTING.md`
- `prompts/claude.md`
- `prompts/codex.md`
- `prompts/google-ai-studio.md`

Do not create a heavy 15-file knowledge system during MVP.

When updating memory, keep it short:

- What changed.
- Why it changed.
- Current risk.
- Next action.

## Codex Review Handoff

When handing work to Codex for review or bugfix, provide:

- Exact goal.
- File or directory scope.
- Current implementation summary.
- TypeScript interfaces.
- Input examples.
- Expected outputs.
- Error cases.
- Commands already run.
- Current error output if any.
- Review focus: Electron boundary, IPC, secrets, entitlement, send queue, tests.
- Explicit non-goals.

Avoid broad prompts like "review the whole project." Prefer small prompts like "review the contacts import IPC boundary and identify bugs or missing tests."

## Review Rubric

When reviewing code or plans, check first:

- Does renderer import main-only code?
- Is IPC explicit and typed?
- Are secrets kept out of renderer?
- Are free-plan limits checked outside UI?
- Is Mailpit used instead of real sending?
- Are database tables limited to MVP needs?
- Is the send queue recoverable and pausable?
- Does the change preserve the current project structure?
- Is the task too large for a beginner plus AI loop?

Findings first. Be direct, specific, and grounded in file paths or concrete design points.

## Stop Conditions

Pause and ask for confirmation if a task would:

- Add StoreKit / IAP / MAS code.
- Introduce monorepo package splitting.
- Add more than two new database tables.
- Store secrets outside `safeStorage`.
- Enable real SMTP sending beyond a controlled test.
- Change the Electron process boundary.
- Rewrite large parts of the app without a clear migration plan.

## Output Style

Use concise Chinese by default unless the user asks otherwise.

Prefer:

- Clear decisions.
- Concrete constraints.
- Small next steps.
- Codex-ready review context.

Avoid:

- Long abstract essays.
- Repeating the whole project vision every time.
- Adding future features to MVP.
- Treating documentation as more important than a running app.
