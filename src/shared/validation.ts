import type {
  SenderAccountCreateInput,
  SenderAccountUpdateInput,
  TestConnectionInput,
} from './types.js';

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
