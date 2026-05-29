import { randomUUID } from 'node:crypto';

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

function toLowerSafe(value: string | null): string {
  if (value == null) {
    return '';
  }

  return value.toLowerCase();
}

function sortContacts(items: Contact[], query: ContactQuery): Contact[] {
  return [...items].sort((a, b) => {
    const left = a[query.sortBy];
    const right = b[query.sortBy];

    if (left === right) {
      return 0;
    }

    const direction = query.sortOrder === 'asc' ? 1 : -1;
    return left > right ? direction : -direction;
  });
}

export interface ContactsRepository {
  list(query: ContactQuery): PaginatedResult<Contact>;
  findExistingNormalizedEmails(emailNormalizedList: string[]): Set<string>;
  importCandidates(candidates: ContactImportCandidate[]): void;
  findById(id: string): Contact | undefined;
  updateEnrichment(id: string, enrichment: ContactEnrichment): Contact;
}

export class InMemoryContactsRepository implements ContactsRepository {
  private readonly contactsStore: Contact[] = [];

  list(query: ContactQuery): PaginatedResult<Contact> {
    const page = Math.max(DEFAULT_CONTACT_PAGE, query.page ?? DEFAULT_CONTACT_PAGE);
    const pageSize = Math.min(
      MAX_CONTACT_PAGE_SIZE,
      Math.max(1, query.pageSize ?? DEFAULT_CONTACT_PAGE_SIZE),
    );

    const keyword = (query.keyword ?? '').trim().toLowerCase();
    const filtered = this.contactsStore.filter((contact) => {
      if (keyword.length === 0) {
        return true;
      }

      return (
        contact.emailNormalized.includes(keyword)
        || toLowerSafe(contact.firstName).includes(keyword)
        || toLowerSafe(contact.lastName).includes(keyword)
        || toLowerSafe(contact.company).includes(keyword)
      );
    });

    const sorted = sortContacts(filtered, query);
    const total = sorted.length;
    const offset = (page - 1) * pageSize;
    const items = sorted.slice(offset, offset + pageSize);

    return {
      items,
      total,
      page,
      pageSize,
      hasNext: offset + pageSize < total,
    };
  }

  findExistingNormalizedEmails(emailNormalizedList: string[]): Set<string> {
    const requestSet = new Set(emailNormalizedList);

    return new Set(
      this.contactsStore
        .filter((item) => requestSet.has(item.emailNormalized))
        .map((item) => item.emailNormalized),
    );
  }

  importCandidates(candidates: ContactImportCandidate[]) {
    candidates.forEach((candidate) => {
      const now = Date.now();
      this.contactsStore.push({
        id: randomUUID(),
        email: candidate.email,
        emailNormalized: candidate.emailNormalized,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        company: candidate.company,
        enrichment: null,
        createdAt: now,
        updatedAt: now,
      });
    });
  }

  findById(id: string): Contact | undefined {
    return this.contactsStore.find((item) => item.id === id);
  }

  updateEnrichment(id: string, enrichment: ContactEnrichment): Contact {
    const index = this.contactsStore.findIndex((item) => item.id === id);
    if (index < 0) {
      throw new Error(`Contact not found: ${id}`);
    }

    const updated: Contact = {
      ...this.contactsStore[index],
      enrichment,
      updatedAt: Date.now(),
    };
    this.contactsStore[index] = updated;
    return updated;
  }
}
