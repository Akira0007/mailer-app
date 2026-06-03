import type {
  CreateDraftFromContactsInput,
  SendQueueEnqueueInput,
  SendQueueListQuery,
  SendQueueSummaryQuery,
  SendJobStatus,
  SendSingleEmailInput,
  SenderAccountCreateInput,
  SenderAccountUpdateInput,
  TestConnectionInput,
  UpdateContactTagsInput,
  UpdateMailDraftInput,
} from './types.js';
import { MAIL_DRAFT_DEFAULTS, SEND_QUEUE_LIMITS } from './constants.js';
import { SEND_JOB_STATUS } from './types.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function isValidEmailFormat(email: string): boolean {
  return EMAIL_RE.test(email);
}

export type EmailValidationResult =
  | {
      ok: true;
      email: string;
      normalized: string;
    }
  | {
      ok: false;
      code: 'EMPTY_EMAIL' | 'INVALID_EMAIL';
      message: string;
    };

export function validateEmail(email: string): EmailValidationResult {
  const normalized = normalizeEmail(email);

  if (normalized.length === 0) {
    return {
      ok: false,
      code: 'EMPTY_EMAIL',
      message: 'Email is required.',
    };
  }

  if (!isValidEmailFormat(normalized)) {
    return {
      ok: false,
      code: 'INVALID_EMAIL',
      message: 'Email format is invalid.',
    };
  }

  return {
    ok: true,
    email,
    normalized,
  };
}

function trimRequiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${field} is required.`);
  }

  return normalized;
}

function validateSmtpPort(port: number): number {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP port must be an integer between 1 and 65535.');
  }

  return port;
}

function normalizeAndValidateEmail(email: string): string {
  const emailResult = validateEmail(email);
  if (!emailResult.ok) {
    throw new Error(emailResult.message);
  }

  return emailResult.normalized;
}

export function validateSenderAccountCreateInput(
  input: SenderAccountCreateInput,
): SenderAccountCreateInput {
  return {
    name: trimRequiredText(input.name, 'Sender name'),
    email: normalizeAndValidateEmail(input.email),
    host: trimRequiredText(input.host, 'SMTP host').toLowerCase(),
    port: validateSmtpPort(input.port),
    username: trimRequiredText(input.username, 'SMTP username'),
    password: trimRequiredText(input.password, 'SMTP password'),
    useTls: Boolean(input.useTls),
  };
}

export function validateSenderAccountUpdateInput(
  input: SenderAccountUpdateInput,
): SenderAccountUpdateInput {
  const result: SenderAccountUpdateInput = { id: trimRequiredText(input.id, 'Sender account id') };

  if (input.name !== undefined) {
    result.name = trimRequiredText(input.name, 'Sender name');
  }
  if (input.email !== undefined) {
    result.email = normalizeAndValidateEmail(input.email);
  }
  if (input.host !== undefined) {
    result.host = trimRequiredText(input.host, 'SMTP host').toLowerCase();
  }
  if (input.port !== undefined) {
    result.port = validateSmtpPort(input.port);
  }
  if (input.username !== undefined) {
    result.username = trimRequiredText(input.username, 'SMTP username');
  }
  if (input.password !== undefined) {
    result.password = trimRequiredText(input.password, 'SMTP password');
  }
  if (input.useTls !== undefined) {
    result.useTls = Boolean(input.useTls);
  }

  return result;
}

export function validateTestConnectionInput(
  input: TestConnectionInput,
): TestConnectionInput {
  return {
    host: trimRequiredText(input.host, 'SMTP host').toLowerCase(),
    port: validateSmtpPort(input.port),
    username: trimRequiredText(input.username, 'SMTP username'),
    password: trimRequiredText(input.password, 'SMTP password'),
    useTls: Boolean(input.useTls),
  };
}

export function validateSendSingleEmailInput(
  input: SendSingleEmailInput,
): SendSingleEmailInput {
  const accountId = trimRequiredText(input.accountId, 'Sender account id');
  const toResult = validateEmail(input.to);
  if (!toResult.ok) {
    throw new Error(`Recipient email invalid: ${toResult.message}`);
  }

  const subject = trimRequiredText(input.subject, 'Email subject');
  const body = trimRequiredText(input.body, 'Email body');

  return {
    accountId,
    to: toResult.normalized,
    subject,
    body,
  };
}

const SEND_JOB_STATUS_SET = new Set<SendJobStatus>(
  Object.values(SEND_JOB_STATUS),
);

export function validateSendQueueEnqueueInput(
  input: SendQueueEnqueueInput,
): SendQueueEnqueueInput {
  const draftId = trimRequiredText(input.draftId, 'Draft id');

  const rawMaxAttempts = input.maxAttempts ?? SEND_QUEUE_LIMITS.defaultMaxAttempts;
  if (!Number.isInteger(rawMaxAttempts)) {
    throw new Error('Max attempts must be an integer.');
  }

  const maxAttempts = Math.min(
    SEND_QUEUE_LIMITS.maxMaxAttempts,
    Math.max(1, rawMaxAttempts),
  );

  return {
    draftId,
    maxAttempts,
  };
}

export function validateSendQueueListQuery(
  input: SendQueueListQuery,
): SendQueueListQuery {
  const statusRaw = input.status ?? 'all';
  if (statusRaw !== 'all' && !SEND_JOB_STATUS_SET.has(statusRaw)) {
    throw new Error(`Unsupported queue status: ${statusRaw}`);
  }

  const limitRaw = input.limit ?? 50;
  if (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 500) {
    throw new Error('Queue list limit must be an integer between 1 and 500.');
  }

  return {
    status: statusRaw,
    limit: limitRaw,
    draftId: normalizeOptionalText(input.draftId) ?? undefined,
  };
}

export function validateSendQueueSummaryQuery(
  input: SendQueueSummaryQuery | undefined,
): SendQueueSummaryQuery {
  return {
    draftId: normalizeOptionalText(input?.draftId) ?? undefined,
  };
}

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of tags) {
    const trimmed = String(tag).trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(trimmed);
  }

  return normalized;
}

export function validateUpdateContactTagsInput(
  input: UpdateContactTagsInput,
): UpdateContactTagsInput {
  return {
    contactId: trimRequiredText(input.contactId, 'Contact id'),
    tags: normalizeTags(Array.isArray(input.tags) ? input.tags : []),
  };
}

export function validateCreateDraftFromContactsInput(
  input: CreateDraftFromContactsInput,
): CreateDraftFromContactsInput {
  if (!Array.isArray(input.contactIds) || input.contactIds.length === 0) {
    throw new Error('At least one contact must be selected.');
  }

  const contactIds = input.contactIds
    .map((item) => String(item).trim())
    .filter((item) => item.length > 0);

  if (contactIds.length === 0) {
    throw new Error('At least one contact must be selected.');
  }

  return {
    contactIds: [...new Set(contactIds)],
    title: normalizeOptionalText(input.title) ?? MAIL_DRAFT_DEFAULTS.title,
  };
}

export function validateUpdateMailDraftInput(
  input: UpdateMailDraftInput,
): UpdateMailDraftInput {
  const draftId = trimRequiredText(input.draftId, 'Draft id');
  const result: UpdateMailDraftInput = { draftId };

  if (input.title !== undefined) {
    result.title = trimRequiredText(input.title, 'Draft title');
  }
  if (input.subject !== undefined) {
    result.subject = input.subject.trim();
  }
  if (input.htmlBody !== undefined) {
    result.htmlBody = input.htmlBody.trim();
  }
  if (input.textBody !== undefined) {
    result.textBody = input.textBody.trim();
  }

  return result;
}
