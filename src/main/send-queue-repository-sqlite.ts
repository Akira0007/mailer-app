import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import type { Database as SqlJsDatabase } from 'sql.js';

import { SEND_QUEUE_LIMITS } from '../shared/constants.js';
import { SEND_JOB_STATUS } from '../shared/types.js';
import type {
  MailDraft,
  SendJob,
  SendQueueEnqueueResult,
  SendQueueListQuery,
  SendQueueSummary,
  SendSingleEmailResult,
} from '../shared/types.js';
import { validateEmail } from '../shared/validation.js';

type SqlValue = number | string | Uint8Array | null;
type BindParams = SqlValue[] | Record<string, SqlValue> | null;

type SendJobRow = {
  id: string;
  draft_id: string | null;
  to_email: string;
  subject: string;
  body: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: number;
  last_error: string | null;
  last_account_id: string | null;
  message_id: string | null;
  response: string | null;
  sent_at: number | null;
  created_at: number;
  updated_at: number;
};

function queryAll(db: SqlJsDatabase, sql: string, params: BindParams = []): Record<string, unknown>[] {
  const stmt = db.prepare(sql);
  if (Array.isArray(params) && params.length > 0) {
    stmt.bind(params as never);
  }
  const rows: Record<string, unknown>[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(db: SqlJsDatabase, sql: string, params: BindParams = []): Record<string, unknown> | null {
  const rows = queryAll(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function toSendJob(row: SendJobRow): SendJob {
  return {
    id: row.id,
    draftId: row.draft_id,
    to: row.to_email,
    subject: row.subject,
    body: row.body,
    status: (
      row.status === SEND_JOB_STATUS.PENDING
      || row.status === SEND_JOB_STATUS.SENDING
      || row.status === SEND_JOB_STATUS.SENT
      || row.status === SEND_JOB_STATUS.FAILED
    )
      ? row.status
      : SEND_JOB_STATUS.FAILED,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error,
    lastAccountId: row.last_account_id,
    messageId: row.message_id,
    response: row.response,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface SendQueueRepository {
  enqueueDraft(draft: MailDraft, maxAttempts?: number): SendQueueEnqueueResult;
  list(query: SendQueueListQuery): SendJob[];
  getSummary(draftId?: string): SendQueueSummary;
  claimNextPending(now: number, accountId: string): SendJob | null;
  markSent(id: string, accountId: string, result: SendSingleEmailResult): void;
  markFailure(id: string, accountId: string, errorMessage: string): void;
  resetSendingToPending(): number;
  setPaused(paused: boolean): void;
  isPaused(): boolean;
}

export class SendQueueSqliteRepository implements SendQueueRepository {
  private readonly db: SqlJsDatabase;
  private readonly dbFilePath: string;

  constructor(dbFilePath: string, db: SqlJsDatabase) {
    this.dbFilePath = dbFilePath;
    this.db = db;
    this.db.run('PRAGMA foreign_keys = ON');
    this.createSchema();
  }

  private save() {
    try {
      const data = this.db.export();
      writeFileSync(this.dbFilePath, Buffer.from(data));
    } catch (error) {
      console.error('[send-queue] failed to persist database:', error);
    }
  }

  private createSchema() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS send_jobs (
        id TEXT PRIMARY KEY,
        draft_id TEXT,
        to_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        next_attempt_at INTEGER NOT NULL,
        last_error TEXT,
        last_account_id TEXT,
        message_id TEXT,
        response TEXT,
        sent_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_send_jobs_status_next_attempt
      ON send_jobs(status, next_attempt_at);
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_send_jobs_draft_id
      ON send_jobs(draft_id, created_at);
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    try {
      this.db.run('ALTER TABLE send_jobs ADD COLUMN draft_id TEXT;');
    } catch {
      // column already exists — ignore
    }

    this.removeDuplicateDraftJobs();

    this.db.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_send_jobs_draft_recipient_unique
      ON send_jobs(draft_id, to_email)
      WHERE draft_id IS NOT NULL;
    `);

    this.save();
  }

  private removeDuplicateDraftJobs() {
    this.db.run(`
      DELETE FROM send_jobs
      WHERE rowid IN (
        SELECT rowid
        FROM (
          SELECT
            rowid,
            ROW_NUMBER() OVER (
              PARTITION BY draft_id, to_email
              ORDER BY
                CASE status
                  WHEN 'sending' THEN 4
                  WHEN 'sent' THEN 3
                  WHEN 'pending' THEN 2
                  WHEN 'failed' THEN 1
                  ELSE 0
                END DESC,
                attempt_count DESC,
                updated_at DESC,
                created_at DESC,
                rowid DESC
            ) AS duplicate_rank
          FROM send_jobs
          WHERE draft_id IS NOT NULL
        ) ranked
        WHERE duplicate_rank > 1
      );
    `);

    const row = queryOne(this.db, 'SELECT changes() AS changed');
    if (Number(row?.changed ?? 0) > 0) {
      this.save();
    }
  }

  enqueueDraft(draft: MailDraft, maxAttempts = SEND_QUEUE_LIMITS.defaultMaxAttempts): SendQueueEnqueueResult {
    const now = Date.now();
    const invalidRecipients: string[] = [];
    const seen = new Set<string>();
    let inserted = 0;
    let skipped = 0;

    this.db.run('BEGIN TRANSACTION');
    try {
      for (const recipient of draft.recipients) {
        const checked = validateEmail(recipient.email);
        if (!checked.ok) {
          invalidRecipients.push(recipient.email);
          skipped += 1;
          continue;
        }

        if (seen.has(checked.normalized)) {
          skipped += 1;
          continue;
        }
        seen.add(checked.normalized);

        this.db.run(
          `INSERT OR IGNORE INTO send_jobs (
            id, draft_id, to_email, subject, body, status,
            attempt_count, max_attempts, next_attempt_at,
            last_error, last_account_id, message_id, response, sent_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
          [
            randomUUID(),
            draft.id,
            checked.normalized,
            draft.subject,
            draft.textBody,
            SEND_JOB_STATUS.PENDING,
            maxAttempts,
            now,
            now,
            now,
          ],
        );

        const result = queryOne(this.db, 'SELECT changes() AS changed');
        if (Number(result?.changed ?? 0) > 0) {
          inserted += 1;
        } else {
          skipped += 1;
        }
      }
      this.db.run('COMMIT');
      this.save();
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }

    return {
      inserted,
      skipped,
      invalidRecipients,
    };
  }

  list(query: SendQueueListQuery): SendJob[] {
    const status = query.status ?? 'all';
    const limit = Math.min(500, Math.max(1, query.limit ?? 50));
    const draftId = query.draftId ?? '';
    const rows = queryAll(
      this.db,
      `SELECT
        id, draft_id, to_email, subject, body, status,
        attempt_count, max_attempts, next_attempt_at,
        last_error, last_account_id, message_id, response, sent_at, created_at, updated_at
      FROM send_jobs
      WHERE (? = '' OR draft_id = ?)
        AND (? = 'all' OR status = ?)
      ORDER BY created_at DESC
      LIMIT ${limit}`,
      [draftId, draftId, status, status],
    );
    return rows.map((row) => toSendJob(row as unknown as SendJobRow));
  }

  getSummary(draftId?: string): SendQueueSummary {
    const normalizedDraftId = draftId ?? '';
    const rows = queryAll(
      this.db,
      `SELECT status, count(1) AS total
       FROM send_jobs
       WHERE (? = '' OR draft_id = ?)
       GROUP BY status`,
      [normalizedDraftId, normalizedDraftId],
    );
    const byStatus: Record<string, number> = {};
    for (const row of rows) {
      byStatus[String(row.status)] = Number(row.total ?? 0);
    }

    const total = queryOne(
      this.db,
      'SELECT count(1) AS total FROM send_jobs WHERE (? = \'\' OR draft_id = ?)',
      [normalizedDraftId, normalizedDraftId],
    );
    return {
      paused: this.isPaused(),
      pending: byStatus[SEND_JOB_STATUS.PENDING] ?? 0,
      sending: byStatus[SEND_JOB_STATUS.SENDING] ?? 0,
      sent: byStatus[SEND_JOB_STATUS.SENT] ?? 0,
      failed: byStatus[SEND_JOB_STATUS.FAILED] ?? 0,
      total: Number(total?.total ?? 0),
    };
  }

  claimNextPending(now: number, accountId: string): SendJob | null {
    this.db.run('BEGIN TRANSACTION');
    try {
      const row = queryOne(
        this.db,
        `SELECT
          id, draft_id, to_email, subject, body, status,
          attempt_count, max_attempts, next_attempt_at,
          last_error, last_account_id, message_id, response, sent_at, created_at, updated_at
        FROM send_jobs
        WHERE status = ?
          AND next_attempt_at <= ?
        ORDER BY created_at ASC
        LIMIT 1`,
        [SEND_JOB_STATUS.PENDING, now],
      );

      if (!row) {
        this.db.run('COMMIT');
        return null;
      }

      const job = toSendJob(row as unknown as SendJobRow);
      this.db.run(
        `UPDATE send_jobs
         SET status = ?, attempt_count = ?, last_account_id = ?, updated_at = ?
         WHERE id = ?`,
        [
          SEND_JOB_STATUS.SENDING,
          job.attemptCount + 1,
          accountId,
          now,
          job.id,
        ],
      );
      this.db.run('COMMIT');
      this.save();

      return {
        ...job,
        status: SEND_JOB_STATUS.SENDING,
        attemptCount: job.attemptCount + 1,
        lastAccountId: accountId,
        updatedAt: now,
      };
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }
  }

  markSent(id: string, accountId: string, result: SendSingleEmailResult) {
    const now = Date.now();
    this.db.run(
      `UPDATE send_jobs
       SET status = ?, last_account_id = ?, message_id = ?, response = ?, sent_at = ?,
           last_error = NULL, updated_at = ?
       WHERE id = ?`,
      [
        SEND_JOB_STATUS.SENT,
        accountId,
        result.messageId,
        result.response,
        now,
        now,
        id,
      ],
    );
    this.save();
  }

  markFailure(id: string, accountId: string, errorMessage: string) {
    const now = Date.now();
    const row = queryOne(
      this.db,
      'SELECT attempt_count, max_attempts FROM send_jobs WHERE id = ?',
      [id],
    );
    const attemptCount = Number(row?.attempt_count ?? 0);
    const maxAttempts = Number(row?.max_attempts ?? SEND_QUEUE_LIMITS.defaultMaxAttempts);
    const hasMore = attemptCount < maxAttempts;
    const backoffIndex = Math.max(0, Math.min(attemptCount - 1, SEND_QUEUE_LIMITS.retryBackoffMs.length - 1));
    const nextAttemptAt = now + SEND_QUEUE_LIMITS.retryBackoffMs[backoffIndex];

    this.db.run(
      `UPDATE send_jobs
       SET status = ?, next_attempt_at = ?, last_error = ?, last_account_id = ?, updated_at = ?
       WHERE id = ?`,
      [
        hasMore ? SEND_JOB_STATUS.PENDING : SEND_JOB_STATUS.FAILED,
        hasMore ? nextAttemptAt : now,
        errorMessage,
        accountId,
        now,
        id,
      ],
    );
    this.save();
  }

  resetSendingToPending(): number {
    const now = Date.now();
    this.db.run(
      `UPDATE send_jobs
       SET status = ?, updated_at = ?
       WHERE status = ?`,
      [SEND_JOB_STATUS.PENDING, now, SEND_JOB_STATUS.SENDING],
    );
    const row = queryOne(this.db, 'SELECT changes() AS changed');
    const changed = Number(row?.changed ?? 0);
    if (changed > 0) {
      this.save();
    }
    return changed;
  }

  setPaused(paused: boolean) {
    const now = Date.now();
    this.db.run(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ['send_queue_paused', paused ? '1' : '0', now],
    );
    this.save();
  }

  isPaused(): boolean {
    const row = queryOne(this.db, 'SELECT value FROM app_settings WHERE key = ?', ['send_queue_paused']);
    return String(row?.value ?? '0') === '1';
  }
}
