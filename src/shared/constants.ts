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
