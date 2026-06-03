import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import type { Database as SqlJsDatabase } from 'sql.js';

import { MAIL_DRAFT_DEFAULTS } from '../shared/constants.js';
import type {
  Contact,
  CreateDraftFromContactsInput,
  DraftRecipient,
  DraftSendSummary,
  DraftQueueStatus,
  MailDraft,
  MailDraftId,
  MailDraftListItem,
  RemoveDraftRecipientInput,
  UpdateMailDraftInput,
} from '../shared/types.js';

type SqlValue = number | string | Uint8Array | null;
type BindParams = SqlValue[] | Record<string, SqlValue> | null;

type DraftRecipientRow = {
  draft_id: string;
  contact_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  tags_json: string | null;
  main_products_json: string | null;
  position_index: number;
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

function normalizeStringArray(raw: string | null): string[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
  } catch {
    return [];
  }
}

function toDraftRecipient(row: DraftRecipientRow): DraftRecipient {
  return {
    contactId: row.contact_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    company: row.company,
    tags: normalizeStringArray(row.tags_json),
    mainProducts: normalizeStringArray(row.main_products_json),
  };
}

function deriveDraftQueueStatus(summary: DraftSendSummary): DraftQueueStatus {
  if (summary.total === 0) {
    return 'idle';
  }

  if (summary.sending > 0) {
    return 'sending';
  }

  if (summary.pending > 0) {
    return 'queued';
  }

  if (summary.failed > 0) {
    return 'failed';
  }

  if (summary.sent > 0) {
    return 'sent';
  }

  return 'idle';
}

export interface MailDraftsRepository {
  list(): MailDraftListItem[];
  get(draftId: MailDraftId): MailDraft | null;
  createFromContacts(input: CreateDraftFromContactsInput, contacts: Contact[]): MailDraft;
  update(input: UpdateMailDraftInput): MailDraft;
  removeRecipient(input: RemoveDraftRecipientInput): MailDraft;
}

export class SqliteMailDraftsRepository implements MailDraftsRepository {
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
      console.error('[mail-drafts] failed to persist database:', error);
    }
  }

  private createSchema() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS mail_drafts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        subject TEXT NOT NULL,
        html_body TEXT NOT NULL,
        text_body TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS mail_draft_recipients (
        draft_id TEXT NOT NULL,
        contact_id TEXT NOT NULL,
        email TEXT NOT NULL,
        first_name TEXT,
        last_name TEXT,
        company TEXT,
        tags_json TEXT,
        main_products_json TEXT,
        position_index INTEGER NOT NULL,
        PRIMARY KEY (draft_id, contact_id)
      );
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_mail_drafts_updated_at
      ON mail_drafts(updated_at DESC);
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_mail_draft_recipients_draft_id
      ON mail_draft_recipients(draft_id, position_index);
    `);
  }

  list(): MailDraftListItem[] {
    const rows = queryAll(
      this.db,
      `SELECT
        d.id, d.title, d.subject, d.html_body, d.text_body, d.created_at, d.updated_at,
        count(r.contact_id) AS recipient_count
      FROM mail_drafts d
      LEFT JOIN mail_draft_recipients r ON r.draft_id = d.id
      WHERE d.deleted_at IS NULL
      GROUP BY d.id, d.title, d.subject, d.html_body, d.text_body, d.created_at, d.updated_at
      ORDER BY d.updated_at DESC`,
    );

    return rows.map((row) => {
      const draftId = String(row.id);
      const sendSummary = this.getDraftSendSummary(draftId);
      return {
        id: draftId,
        title: String(row.title),
        subject: String(row.subject),
        recipientCount: Number(row.recipient_count ?? 0),
        queueStatus: deriveDraftQueueStatus(sendSummary),
        sendSummary,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
      };
    });
  }

  get(draftId: MailDraftId): MailDraft | null {
    const row = queryOne(
      this.db,
      `SELECT id, title, subject, html_body, text_body, created_at, updated_at
       FROM mail_drafts
       WHERE id = ? AND deleted_at IS NULL`,
      [draftId],
    );

    if (!row) {
      return null;
    }

    const recipients = queryAll(
      this.db,
      `SELECT
        draft_id, contact_id, email, first_name, last_name, company,
        tags_json, main_products_json, position_index
       FROM mail_draft_recipients
       WHERE draft_id = ?
       ORDER BY position_index ASC`,
      [draftId],
    ).map((recipient) => toDraftRecipient(recipient as unknown as DraftRecipientRow));

    const sendSummary = this.getDraftSendSummary(draftId);
    return {
      id: String(row.id),
      title: String(row.title),
      subject: String(row.subject),
      htmlBody: String(row.html_body),
      textBody: String(row.text_body),
      recipients,
      queueStatus: deriveDraftQueueStatus(sendSummary),
      sendSummary,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  createFromContacts(input: CreateDraftFromContactsInput, contacts: Contact[]): MailDraft {
    if (contacts.length === 0) {
      throw new Error('At least one contact must be selected.');
    }

    const draftId = randomUUID();
    const now = Date.now();
    const title = input.title?.trim() || this.deriveDraftTitle(contacts);
    const firstDraft = contacts.find((contact) => contact.enrichment?.emailDraft);
    const subject = firstDraft?.enrichment?.emailDraft?.subject ?? MAIL_DRAFT_DEFAULTS.subject;
    const textBody = firstDraft?.enrichment?.emailDraft?.body ?? MAIL_DRAFT_DEFAULTS.textBody;

    this.db.run('BEGIN TRANSACTION');
    try {
      this.db.run(
        `INSERT INTO mail_drafts (
          id, title, subject, html_body, text_body, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
        [
          draftId,
          title,
          subject,
          MAIL_DRAFT_DEFAULTS.htmlBody,
          textBody,
          now,
          now,
        ],
      );

      contacts.forEach((contact, index) => {
        this.db.run(
          `INSERT INTO mail_draft_recipients (
            draft_id, contact_id, email, first_name, last_name, company,
            tags_json, main_products_json, position_index
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            draftId,
            contact.id,
            contact.email,
            contact.firstName,
            contact.lastName,
            contact.company,
            JSON.stringify(contact.tags),
            JSON.stringify(contact.enrichment?.mainProducts ?? []),
            index,
          ],
        );
      });

      this.db.run('COMMIT');
      this.save();
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }

    const draft = this.get(draftId);
    if (!draft) {
      throw new Error(`Draft not found after creation: ${draftId}`);
    }
    return draft;
  }

  update(input: UpdateMailDraftInput): MailDraft {
    const existing = this.get(input.draftId);
    if (!existing) {
      throw new Error(`Draft not found: ${input.draftId}`);
    }

    const now = Date.now();
    this.db.run(
      `UPDATE mail_drafts
       SET title = ?, subject = ?, html_body = ?, text_body = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [
        input.title ?? existing.title,
        input.subject ?? existing.subject,
        input.htmlBody ?? existing.htmlBody,
        input.textBody ?? existing.textBody,
        now,
        input.draftId,
      ],
    );
    this.save();

    const updated = this.get(input.draftId);
    if (!updated) {
      throw new Error(`Draft not found: ${input.draftId}`);
    }
    return updated;
  }

  removeRecipient(input: RemoveDraftRecipientInput): MailDraft {
    const existing = this.get(input.draftId);
    if (!existing) {
      throw new Error(`Draft not found: ${input.draftId}`);
    }

    this.db.run(
      `DELETE FROM mail_draft_recipients
       WHERE draft_id = ? AND contact_id = ?`,
      [input.draftId, input.contactId],
    );

    const now = Date.now();
    this.db.run(
      `UPDATE mail_drafts
       SET updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [now, input.draftId],
    );
    this.save();

    const updated = this.get(input.draftId);
    if (!updated) {
      throw new Error(`Draft not found: ${input.draftId}`);
    }
    return updated;
  }

  private deriveDraftTitle(contacts: Contact[]): string {
    if (contacts.length === 1) {
      return contacts[0].company?.trim() || contacts[0].email;
    }

    return `${contacts[0].company?.trim() || contacts[0].email} 等 ${contacts.length} 位联系人`;
  }

  private getDraftSendSummary(draftId: MailDraftId): DraftSendSummary {
    const rows = queryAll(
      this.db,
      `SELECT status, count(1) AS total
       FROM send_jobs
       WHERE draft_id = ?
       GROUP BY status`,
      [draftId],
    );

    const byStatus: Record<string, number> = {};
    for (const row of rows) {
      byStatus[String(row.status)] = Number(row.total ?? 0);
    }

    const total = Number(
      queryOne(
        this.db,
        'SELECT count(1) AS total FROM send_jobs WHERE draft_id = ?',
        [draftId],
      )?.total ?? 0,
    );

    const paused = String(
      queryOne(this.db, 'SELECT value FROM app_settings WHERE key = ?', ['send_queue_paused'])?.value ?? '0',
    ) === '1';

    const summary: DraftSendSummary = {
      paused,
      pending: byStatus.pending ?? 0,
      sending: byStatus.sending ?? 0,
      sent: byStatus.sent ?? 0,
      failed: byStatus.failed ?? 0,
      total,
      status: 'idle',
    };
    summary.status = deriveDraftQueueStatus(summary);
    return summary;
  }
}
