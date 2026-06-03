export const DEFAULT_CONTACT_PAGE = 1;
export const DEFAULT_CONTACT_PAGE_SIZE = 50;
export const MAX_CONTACT_PAGE_SIZE = 200;

export const FREE_PLAN_LIMITS = {
  contacts: 500,
  smtpAccounts: 1,
  dailyEmails: 500,
  templates: 5,
} as const;

export const CONTACT_IMPORT_LIMITS = {
  maxRowsPerImport: 5000,
} as const;

export const SMTP_DEFAULTS = {
  port: 587,
  useTls: true,
} as const;

export const SMTP_PORTS = [25, 465, 587, 2525] as const;

export const PRODUCT_LIMITS = {
  maxPerFreePlan: 200,
} as const;

export const MAIL_DRAFT_DEFAULTS = {
  title: '未命名草稿',
  subject: '',
  htmlBody: '<p>Hello,</p><p>Write your message here.</p>',
  textBody: 'Hello,\n\nWrite your message here.',
} as const;

export const SEND_QUEUE_LIMITS = {
  maxRecipientsPerEnqueue: 2000,
  defaultMaxAttempts: 3,
  maxMaxAttempts: 5,
  retryBackoffMs: [30_000, 120_000, 300_000] as const,
} as const;
