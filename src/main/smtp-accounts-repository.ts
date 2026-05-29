import { randomUUID } from 'node:crypto';

import type {
  SenderAccount,
  SenderAccountCreateInput,
  SenderAccountUpdateInput,
  SenderAccountView,
} from '../shared/types.js';
import { FREE_PLAN_LIMITS } from '../shared/constants.js';
import {
  validateSenderAccountCreateInput,
  validateSenderAccountUpdateInput,
} from '../shared/validation.js';
import type { CredentialStore } from './credential-store.js';

function toView(account: SenderAccount): SenderAccountView {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    host: account.host,
    port: account.port,
    username: account.username,
    useTls: account.useTls,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

export interface SmtpAccountsRepository {
  list(): SenderAccountView[];
  findById(id: string): SenderAccount | undefined;
  create(input: SenderAccountCreateInput): SenderAccountView;
  update(input: SenderAccountUpdateInput): SenderAccountView;
  delete(id: string): boolean;
}

export class InMemorySmtpAccountsRepository implements SmtpAccountsRepository {
  private readonly store: Map<string, SenderAccount> = new Map();
  private readonly credentialStore: CredentialStore;

  constructor(credentialStore: CredentialStore) {
    this.credentialStore = credentialStore;
  }

  list(): SenderAccountView[] {
    return [...this.store.values()].map(toView);
  }

  findById(id: string): SenderAccount | undefined {
    return this.store.get(id);
  }

  create(input: SenderAccountCreateInput): SenderAccountView {
    if (this.store.size >= FREE_PLAN_LIMITS.smtpAccounts) {
      throw new Error(
        `Free plan only allows ${FREE_PLAN_LIMITS.smtpAccounts} SMTP account(s).`,
      );
    }

    const validated = validateSenderAccountCreateInput(input);
    const now = Date.now();
    const account: SenderAccount = {
      id: randomUUID(),
      name: validated.name,
      email: validated.email,
      host: validated.host,
      port: validated.port,
      username: validated.username,
      encryptedPassword: this.credentialStore.encrypt(validated.password),
      useTls: validated.useTls,
      createdAt: now,
      updatedAt: now,
    };

    this.store.set(account.id, account);
    return toView(account);
  }

  update(input: SenderAccountUpdateInput): SenderAccountView {
    const validated = validateSenderAccountUpdateInput(input);
    const existing = this.store.get(validated.id);

    if (!existing) {
      throw new Error(`Sender account not found: ${validated.id}`);
    }

    const updated: SenderAccount = {
      ...existing,
      ...(validated.name !== undefined ? { name: validated.name } : {}),
      ...(validated.email !== undefined ? { email: validated.email } : {}),
      ...(validated.host !== undefined ? { host: validated.host } : {}),
      ...(validated.port !== undefined ? { port: validated.port } : {}),
      ...(validated.username !== undefined ? { username: validated.username } : {}),
      ...(validated.useTls !== undefined ? { useTls: validated.useTls } : {}),
      ...(validated.password !== undefined
        ? { encryptedPassword: this.credentialStore.encrypt(validated.password) }
        : {}),
      updatedAt: Date.now(),
    };

    this.store.set(updated.id, updated);
    return toView(updated);
  }

  delete(id: string): boolean {
    return this.store.delete(id);
  }
}
