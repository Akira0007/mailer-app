import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import type { Database as SqlJsDatabase } from 'sql.js';

type SqlValue = number | string | Uint8Array | null;
type BindParams = SqlValue[] | Record<string, SqlValue> | null;

import {
  DEFAULT_CONTACT_PAGE,
  DEFAULT_CONTACT_PAGE_SIZE,
  MAX_CONTACT_PAGE_SIZE,
} from '../shared/constants.js';
import type {
  Contact,
  ContactEnrichment,
  EnrichmentEmailDraft,
  EnrichmentProductMatch,
  ContactImportCandidate,
  ContactQuery,
  PaginatedResult,
  UpdateContactTagsInput,
} from '../shared/types.js';
import { ENRICHMENT_STATUS } from '../shared/types.js';
import { normalizeTags } from '../shared/validation.js';
import type { ContactsRepository } from './contacts-repository.js';

type ContactRow = {
  id: string;
  email: string;
  email_normalized: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  tags_json: string | null;
  enrichment_json: string | null;
  created_at: number;
  updated_at: number;
};

const SORT_BY_COLUMN: Record<ContactQuery['sortBy'], string> = {
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  emailNormalized: 'email_normalized',
};

function normalizeTagsJson(raw: string | null): string[] {
  if (!raw) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return normalizeTags(parsed.map((item) => String(item)));
}

function normalizeEnrichment(raw: string | null): ContactEnrichment | null {
  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const data = parsed as Partial<ContactEnrichment> & {
    matchedProducts?: unknown;
    emailDraft?: unknown;
  };

  const matchedProducts: EnrichmentProductMatch[] = Array.isArray(data.matchedProducts)
    ? data.matchedProducts
      .filter((item): item is EnrichmentProductMatch => (
        typeof item === 'object'
        && item !== null
        && typeof (item as EnrichmentProductMatch).productId === 'string'
        && typeof (item as EnrichmentProductMatch).productName === 'string'
        && typeof (item as EnrichmentProductMatch).matchReason === 'string'
        && typeof (item as EnrichmentProductMatch).confidence === 'number'
      ))
      .map((item) => ({
        productId: item.productId,
        productName: item.productName,
        matchReason: item.matchReason,
        confidence: Math.min(Math.max(item.confidence, 0), 1),
      }))
    : [];

  let emailDraft: EnrichmentEmailDraft | null = null;
  if (
    data.emailDraft
    && typeof data.emailDraft === 'object'
    && typeof (data.emailDraft as EnrichmentEmailDraft).subject === 'string'
    && typeof (data.emailDraft as EnrichmentEmailDraft).body === 'string'
  ) {
    const candidate = data.emailDraft as Partial<EnrichmentEmailDraft>;
    emailDraft = {
      subject: candidate.subject?.trim() ?? '',
      body: candidate.body?.trim() ?? '',
      generatedAt: typeof candidate.generatedAt === 'number' ? candidate.generatedAt : Date.now(),
    };
  }

  return {
    websiteUrl: typeof data.websiteUrl === 'string' ? data.websiteUrl : null,
    companyName: typeof data.companyName === 'string' ? data.companyName : null,
    industry: typeof data.industry === 'string' ? data.industry : null,
    mainProducts: Array.isArray(data.mainProducts)
      ? data.mainProducts.filter((item): item is string => typeof item === 'string')
      : [],
    businessType: typeof data.businessType === 'string' ? data.businessType : null,
    targetMarkets: Array.isArray(data.targetMarkets)
      ? data.targetMarkets.filter((item): item is string => typeof item === 'string')
      : [],
    possibleNeeds: Array.isArray(data.possibleNeeds)
      ? data.possibleNeeds.filter((item): item is string => typeof item === 'string')
      : [],
    disqualifiedReasons: Array.isArray(data.disqualifiedReasons)
      ? data.disqualifiedReasons.filter((item): item is string => typeof item === 'string')
      : [],
    matchedProducts,
    emailDraft,
    confidence: typeof data.confidence === 'number' ? data.confidence : 0,
    status: (
      data.status === ENRICHMENT_STATUS.PENDING
      || data.status === ENRICHMENT_STATUS.IN_PROGRESS
      || data.status === ENRICHMENT_STATUS.DONE
      || data.status === ENRICHMENT_STATUS.FAILED
    )
      ? data.status
      : ENRICHMENT_STATUS.PENDING,
    errorMessage: typeof data.errorMessage === 'string' ? data.errorMessage : null,
    enrichedAt: typeof data.enrichedAt === 'number' ? data.enrichedAt : null,
  };
}

function toContact(row: ContactRow): Contact {
  return {
    id: row.id,
    email: row.email,
    emailNormalized: row.email_normalized,
    firstName: row.first_name,
    lastName: row.last_name,
    company: row.company,
    tags: normalizeTagsJson(row.tags_json),
    enrichment: normalizeEnrichment(row.enrichment_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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

export class ContactsSqliteRepository implements ContactsRepository {
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
      console.error('[contacts-sqlite] failed to persist database:', error);
    }
  }

  createSchema() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        email_normalized TEXT NOT NULL UNIQUE,
        first_name TEXT,
        last_name TEXT,
        company TEXT,
        tags_json TEXT,
        enrichment_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );
    `);

    // migration: add enrichment_json if missing (safe re-run)
    try {
      this.db.run('ALTER TABLE contacts ADD COLUMN enrichment_json TEXT;');
    } catch {
      // column already exists — ignore
    }

    try {
      this.db.run('ALTER TABLE contacts ADD COLUMN tags_json TEXT;');
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

    const whereClause = `
      deleted_at IS NULL
      AND (
        ? = ''
        OR email_normalized LIKE ?
        OR lower(coalesce(first_name, '')) LIKE ?
        OR lower(coalesce(last_name, '')) LIKE ?
        OR lower(coalesce(company, '')) LIKE ?
      )
    `;

    const totalRow = queryOne(
      this.db,
      `SELECT count(1) AS total FROM contacts WHERE ${whereClause}`,
      [keyword, likeKeyword, likeKeyword, likeKeyword, likeKeyword],
    );
    const total = totalRow?.total as number ?? 0;

    const rows = queryAll(
      this.db,
      `SELECT
        id, email, email_normalized, first_name, last_name, company, tags_json,
        enrichment_json, created_at, updated_at
      FROM contacts
      WHERE ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?`,
      [keyword, likeKeyword, likeKeyword, likeKeyword, likeKeyword, pageSize, offset],
    );

    return {
      items: rows.map((r) => toContact(r as unknown as ContactRow)),
      total,
      page,
      pageSize,
      hasNext: offset + pageSize < total,
    };
  }

  findExistingNormalizedEmails(emailNormalizedList: string[]): Set<string> {
    if (emailNormalizedList.length === 0) {
      return new Set<string>();
    }

    const placeholders = emailNormalizedList.map(() => '?').join(', ');
    const rows = queryAll(
      this.db,
      `SELECT email_normalized FROM contacts WHERE email_normalized IN (${placeholders})`,
      emailNormalizedList,
    );

    return new Set(rows.map((r) => r.email_normalized as string));
  }

  importCandidates(candidates: ContactImportCandidate[]) {
    for (const candidate of candidates) {
      const now = Date.now();
      this.db.run(
        `INSERT INTO contacts (
          id, email, email_normalized, first_name, last_name, company,
          tags_json, created_at, updated_at, deleted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        [
          randomUUID(),
          candidate.email,
          candidate.emailNormalized,
          candidate.firstName,
          candidate.lastName,
          candidate.company,
          JSON.stringify([]),
          now,
          now,
        ],
      );
    }
    this.save();
  }

  findById(id: string): Contact | undefined {
    const row = queryOne(
      this.db,
      `SELECT
        id, email, email_normalized, first_name, last_name, company, tags_json,
        enrichment_json, created_at, updated_at
      FROM contacts
      WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );

    return row ? toContact(row as unknown as ContactRow) : undefined;
  }

  updateEnrichment(id: string, enrichment: ContactEnrichment): Contact {
    const now = Date.now();
    this.db.run(
      'UPDATE contacts SET enrichment_json = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      [JSON.stringify(enrichment), now, id],
    );
    this.save();

    const updated = this.findById(id);
    if (!updated) {
      throw new Error(`Contact not found: ${id}`);
    }

    return updated;
  }

  updateTags(input: UpdateContactTagsInput): Contact {
    const now = Date.now();
    this.db.run(
      'UPDATE contacts SET tags_json = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      [JSON.stringify(input.tags), now, input.contactId],
    );
    this.save();

    const updated = this.findById(input.contactId);
    if (!updated) {
      throw new Error(`Contact not found: ${input.contactId}`);
    }

    return updated;
  }
}
