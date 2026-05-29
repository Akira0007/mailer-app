import { randomUUID } from 'node:crypto';

import Database from 'better-sqlite3';

import {
  DEFAULT_CONTACT_PAGE,
  DEFAULT_CONTACT_PAGE_SIZE,
  MAX_CONTACT_PAGE_SIZE,
} from '../shared/constants.js';
import type {
  Contact,
  ContactEnrichment,
  ContactImportCandidate,
  ContactQuery,
  PaginatedResult,
} from '../shared/types.js';
import type { ContactsRepository } from './contacts-repository.js';

type ContactRow = {
  id: string;
  email: string;
  email_normalized: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  enrichment_json: string | null;
  created_at: number;
  updated_at: number;
};

const SORT_BY_COLUMN: Record<ContactQuery['sortBy'], string> = {
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  emailNormalized: 'email_normalized',
};

function toContact(row: ContactRow): Contact {
  return {
    id: row.id,
    email: row.email,
    emailNormalized: row.email_normalized,
    firstName: row.first_name,
    lastName: row.last_name,
    company: row.company,
    enrichment: row.enrichment_json ? JSON.parse(row.enrichment_json) as ContactEnrichment : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ContactsSqliteRepository implements ContactsRepository {
  private readonly db: Database.Database;

  constructor(dbFilePath: string) {
    this.db = new Database(dbFilePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.createSchema();
  }

  createSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        email_normalized TEXT NOT NULL UNIQUE,
        first_name TEXT,
        last_name TEXT,
        company TEXT,
        enrichment_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );
    `);

    // migration: add enrichment_json if missing (safe re-run)
    try {
      this.db.exec(`ALTER TABLE contacts ADD COLUMN enrichment_json TEXT;`);
    } catch {
      // column already exists — ignore
    }
  }

  list(query: ContactQuery): PaginatedResult<Contact> {
    const page = Math.max(DEFAULT_CONTACT_PAGE, query.page ?? DEFAULT_CONTACT_PAGE);
    const pageSize = Math.min(
      MAX_CONTACT_PAGE_SIZE,
      Math.max(1, query.pageSize ?? DEFAULT_CONTACT_PAGE_SIZE),
    );
    const keyword = (query.keyword ?? '').trim().toLowerCase();
    const offset = (page - 1) * pageSize;
    const sortBy = SORT_BY_COLUMN[query.sortBy] ?? SORT_BY_COLUMN.createdAt;
    const sortOrder = query.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const likeKeyword = `%${keyword}%`;

    const whereSql = `
      deleted_at IS NULL
      AND (
        ? = ''
        OR email_normalized LIKE ?
        OR lower(coalesce(first_name, '')) LIKE ?
        OR lower(coalesce(last_name, '')) LIKE ?
        OR lower(coalesce(company, '')) LIKE ?
      )
    `;

    const totalRow = this.db
      .prepare(
        `
          SELECT count(1) AS total
          FROM contacts
          WHERE ${whereSql}
        `,
      )
      .get(keyword, likeKeyword, likeKeyword, likeKeyword, likeKeyword) as { total: number };

    const rows = this.db
      .prepare(
        `
          SELECT
            id,
            email,
            email_normalized,
            first_name,
            last_name,
            company,
            enrichment_json,
            created_at,
            updated_at
          FROM contacts
          WHERE ${whereSql}
          ORDER BY ${sortBy} ${sortOrder}
          LIMIT ?
          OFFSET ?
        `,
      )
      .all(
        keyword,
        likeKeyword,
        likeKeyword,
        likeKeyword,
        likeKeyword,
        pageSize,
        offset,
      ) as ContactRow[];

    return {
      items: rows.map(toContact),
      total: totalRow.total,
      page,
      pageSize,
      hasNext: offset + pageSize < totalRow.total,
    };
  }

  findExistingNormalizedEmails(emailNormalizedList: string[]): Set<string> {
    if (emailNormalizedList.length === 0) {
      return new Set<string>();
    }

    const placeholders = emailNormalizedList.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `
          SELECT email_normalized
          FROM contacts
          WHERE email_normalized IN (${placeholders})
        `,
      )
      .all(...emailNormalizedList) as Array<{ email_normalized: string }>;

    return new Set(rows.map((item) => item.email_normalized));
  }

  importCandidates(candidates: ContactImportCandidate[]) {
    const insertStmt = this.db.prepare(`
      INSERT INTO contacts (
        id,
        email,
        email_normalized,
        first_name,
        last_name,
        company,
        created_at,
        updated_at,
        deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `);

    const insertMany = this.db.transaction((rows: ContactImportCandidate[]) => {
      rows.forEach((row) => {
        const now = Date.now();
        insertStmt.run(
          randomUUID(),
          row.email,
          row.emailNormalized,
          row.firstName,
          row.lastName,
          row.company,
          now,
          now,
        );
      });
    });

    insertMany(candidates);
  }

  findById(id: string): Contact | undefined {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            email,
            email_normalized,
            first_name,
            last_name,
            company,
            enrichment_json,
            created_at,
            updated_at
          FROM contacts
          WHERE id = ? AND deleted_at IS NULL
        `,
      )
      .get(id) as ContactRow | undefined;

    return row ? toContact(row) : undefined;
  }

  updateEnrichment(id: string, enrichment: ContactEnrichment): Contact {
    const now = Date.now();
    this.db
      .prepare(
        `
          UPDATE contacts
          SET enrichment_json = ?, updated_at = ?
          WHERE id = ? AND deleted_at IS NULL
        `,
      )
      .run(JSON.stringify(enrichment), now, id);

    const updated = this.findById(id);
    if (!updated) {
      throw new Error(`Contact not found: ${id}`);
    }

    return updated;
  }
}
