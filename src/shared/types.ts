export type TimestampMs = number;

export type ContactId = string;

export interface Contact {
  id: ContactId;
  email: string;
  emailNormalized: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  enrichment: ContactEnrichment | null;
  createdAt: TimestampMs;
  updatedAt: TimestampMs;
}

export const ENRICHMENT_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
  FAILED: 'failed',
} as const;

export type EnrichmentStatus = (typeof ENRICHMENT_STATUS)[keyof typeof ENRICHMENT_STATUS];

export interface ContactEnrichment {
  websiteUrl: string | null;
  companyName: string | null;
  industry: string | null;
  mainProducts: string[];
  businessType: string | null;
  targetMarkets: string[];
  possibleNeeds: string[];
  disqualifiedReasons: string[];
  confidence: number;
  status: EnrichmentStatus;
  errorMessage: string | null;
  enrichedAt: TimestampMs | null;
}

export interface EnrichContactInput {
  contactId: string;
}

export interface EnrichContactResult {
  contactId: string;
  enrichment: ContactEnrichment;
}

export interface ContactQuery {
  keyword?: string;
  page: number;
  pageSize: number;
  sortBy: 'createdAt' | 'updatedAt' | 'emailNormalized';
  sortOrder: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}

export type SenderAccountId = string;

export interface SenderAccount {
  id: SenderAccountId;
  name: string;
  email: string;
  host: string;
  port: number;
  username: string;
  encryptedPassword: string;
  useTls: boolean;
  createdAt: TimestampMs;
  updatedAt: TimestampMs;
}

/** Renderer-safe view — no password. */
export interface SenderAccountView {
  id: SenderAccountId;
  name: string;
  email: string;
  host: string;
  port: number;
  username: string;
  useTls: boolean;
  createdAt: TimestampMs;
  updatedAt: TimestampMs;
}

export interface SenderAccountCreateInput {
  name: string;
  email: string;
  host: string;
  port: number;
  username: string;
  password: string;
  useTls: boolean;
}

export interface SenderAccountUpdateInput {
  id: SenderAccountId;
  name?: string;
  email?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  useTls?: boolean;
}

export interface TestConnectionInput {
  host: string;
  port: number;
  username: string;
  password: string;
  useTls: boolean;
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
}

export type ProductId = string;

export interface Product {
  id: ProductId;
  name: string;
  category: string;
  description: string;
  tags: string[];
  sellingPoints: string[];
  targetUseCases: string[];
  url: string | null;
  isActive: boolean;
  createdAt: TimestampMs;
  updatedAt: TimestampMs;
}

export interface ProductImportRow {
  name: string;
  category: string;
  description: string;
  tags: string;
  sellingPoints: string;
  targetUseCases: string;
  url: string;
  isActive: boolean;
}

export type ImportField =
  | 'email'
  | 'firstName'
  | 'lastName'
  | 'company'
  | 'unknown';

export type ImportErrorCode =
  | 'EMPTY_EMAIL'
  | 'INVALID_EMAIL'
  | 'DUPLICATE_IN_FILE'
  | 'DUPLICATE_IN_DB'
  | 'INVALID_ROW';

export interface ImportRowError {
  rowNumber: number;
  field: ImportField;
  code: ImportErrorCode;
  message: string;
}

export interface ContactImportCandidate {
  rowNumber: number;
  email: string;
  emailNormalized: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
}

export interface ImportPreviewResult {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateInFileRows: number;
  duplicateInDbRows: number;
  candidates: ContactImportCandidate[];
  errors: ImportRowError[];
}

export interface ImportResult {
  requestedRows: number;
  insertedRows: number;
  skippedRows: number;
  failedRows: number;
  errors: ImportRowError[];
}

export interface ContactsImportPreviewInput {
  rows: Array<{
    email: string | null | undefined;
    firstName?: string | null | undefined;
    lastName?: string | null | undefined;
    company?: string | null | undefined;
  }>;
}

export interface ContactsImportCommitInput {
  candidates: ContactImportCandidate[];
}
