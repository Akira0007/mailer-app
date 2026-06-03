import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { app, BrowserWindow, ipcMain } from 'electron';
import type { Database as SqlJsDatabase } from 'sql.js';

import {
  IPC_CHANNELS,
  type AppPingResult,
} from '../shared/ipc-api.js';
import type {
  CreateDraftFromContactsInput,
  ContactImportCandidate,
  ContactsImportCommitInput,
  ContactsImportPreviewInput,
  ImportErrorCode,
  ImportPreviewResult,
  ImportResult,
  RemoveDraftRecipientInput,
  ProductImportRow,
  SendQueueEnqueueInput,
  SendQueueListQuery,
  SendQueueSummaryQuery,
  SendSingleEmailInput,
  SenderAccountCreateInput,
  SenderAccountUpdateInput,
  TestConnectionInput,
  UpdateContactTagsInput,
  UpdateMailDraftInput,
} from '../shared/types.js';
import {
  normalizeOptionalText,
  validateCreateDraftFromContactsInput,
  validateSendQueueSummaryQuery,
  validateSendQueueEnqueueInput,
  validateSendQueueListQuery,
  validateSendSingleEmailInput,
  validateTestConnectionInput,
  validateUpdateContactTagsInput,
  validateUpdateMailDraftInput,
  validateEmail,
} from '../shared/validation.js';
import {
  InMemoryContactsRepository,
  type ContactsRepository,
} from './contacts-repository.js';
import {
  InMemorySmtpAccountsRepository,
  type SmtpAccountsRepository,
} from './smtp-accounts-repository.js';
import { SafeStorageCredentialStore, type CredentialStore } from './credential-store.js';
import { sendSingleEmail, testSmtpConnection } from './smtp-connection.js';
import {
  InMemoryProductsRepository,
  type ProductsRepository,
} from './products-repository.js';
import { EnrichmentService } from './enrichment/enrichment-service.js';
import { JinaReaderFetcher } from './enrichment/website-fetcher.js';
import { ClaudeLlmClient } from './enrichment/llm-client.js';
import {
  SendQueueSqliteRepository,
  type SendQueueRepository,
} from './send-queue-repository-sqlite.js';
import { SendQueueRunner } from './send-queue-runner.js';
import {
  SqliteMailDraftsRepository,
  type MailDraftsRepository,
} from './mail-drafts-repository.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const preloadPath = path.join(currentDir, 'preload.js');
const rendererIndexPath = path.join(currentDir, '../../dist/index.html');
let contactsRepo: ContactsRepository | null = null;
let smtpAccountsRepo: SmtpAccountsRepository | null = null;
let smtpCredentialStore: CredentialStore | null = null;
let productsRepo: ProductsRepository | null = null;
let sendQueueRepo: SendQueueRepository | null = null;
let sendQueueRunner: SendQueueRunner | null = null;
let mailDraftsRepo: MailDraftsRepository | null = null;
let enrichmentService: EnrichmentService | null = null;
let enrichmentDisabledReason: string | null = null;

function getContactsRepo(): ContactsRepository {
  if (!contactsRepo) {
    throw new Error('Contacts repository not initialized.');
  }

  return contactsRepo;
}

function getSmtpAccountsRepo(): SmtpAccountsRepository {
  if (!smtpAccountsRepo) {
    throw new Error('SMTP accounts repository not initialized.');
  }

  return smtpAccountsRepo;
}

function getSmtpCredentialStore(): CredentialStore {
  if (!smtpCredentialStore) {
    throw new Error('SMTP credential store not initialized.');
  }

  return smtpCredentialStore;
}

function getProductsRepo(): ProductsRepository {
  if (!productsRepo) {
    throw new Error('Products repository not initialized.');
  }

  return productsRepo;
}

function getSendQueueRepo(): SendQueueRepository {
  if (!sendQueueRepo) {
    throw new Error('Send queue repository not initialized.');
  }

  return sendQueueRepo;
}

function getSendQueueRunner(): SendQueueRunner {
  if (!sendQueueRunner) {
    throw new Error('Send queue runner not initialized.');
  }

  return sendQueueRunner;
}

function getMailDraftsRepo(): MailDraftsRepository {
  if (!mailDraftsRepo) {
    throw new Error('Mail drafts repository not initialized.');
  }

  return mailDraftsRepo;
}

function getEnrichmentService(): EnrichmentService {
  if (enrichmentDisabledReason) {
    throw new Error(enrichmentDisabledReason);
  }

  if (!enrichmentService) {
    throw new Error('Enrichment service not initialized (unknown reason).');
  }

  return enrichmentService;
}

function buildImportError(
  rowNumber: number,
  code: ImportErrorCode,
  message: string,
) {
  return {
    rowNumber,
    field: 'email' as const,
    code,
    message,
  };
}

function previewContactsImport(
  input: ContactsImportPreviewInput,
): ImportPreviewResult {
  const candidates: ContactImportCandidate[] = [];
  const errors: ImportPreviewResult['errors'] = [];
  const seenInFile = new Set<string>();
  const previewValidatedRows = input.rows
    .map((row, index) => {
      const rowNumber = index + 1;
      const rawEmail = String(row.email ?? '');
      const validated = validateEmail(rawEmail);

      return {
        row,
        rowNumber,
        validated,
      };
    });
  const normalizedEmails = previewValidatedRows
    .flatMap((item) => (
      item.validated.ok ? [item.validated.normalized] : []
    ));
  const existingEmails = getContactsRepo().findExistingNormalizedEmails(normalizedEmails);

  previewValidatedRows.forEach(({ row, rowNumber, validated }) => {

    if (!validated.ok) {
      errors.push(buildImportError(rowNumber, validated.code, validated.message));
      return;
    }

    if (seenInFile.has(validated.normalized)) {
      errors.push(
        buildImportError(
          rowNumber,
          'DUPLICATE_IN_FILE',
          'Duplicate email found in current import file.',
        ),
      );
      return;
    }

    if (existingEmails.has(validated.normalized)) {
      errors.push(
        buildImportError(
          rowNumber,
          'DUPLICATE_IN_DB',
          'Email already exists in contacts database.',
        ),
      );
      return;
    }

    seenInFile.add(validated.normalized);
    candidates.push({
      rowNumber,
      email: validated.email,
      emailNormalized: validated.normalized,
      firstName: normalizeOptionalText(row.firstName),
      lastName: normalizeOptionalText(row.lastName),
      company: normalizeOptionalText(row.company),
    });
  });

  return {
    totalRows: input.rows.length,
    validRows: candidates.length,
    invalidRows: errors.length,
    duplicateInFileRows: errors.filter((item) => item.code === 'DUPLICATE_IN_FILE').length,
    duplicateInDbRows: errors.filter((item) => item.code === 'DUPLICATE_IN_DB').length,
    candidates,
    errors,
  };
}

function commitContactsImport(input: ContactsImportCommitInput): ImportResult {
  const existingEmails = getContactsRepo().findExistingNormalizedEmails(
    input.candidates.map((candidate) => candidate.emailNormalized),
  );
  const seenInCommit = new Set<string>();
  const errors: ImportResult['errors'] = [];
  const toInsert: ContactImportCandidate[] = [];
  let insertedRows = 0;
  let skippedRows = 0;

  input.candidates.forEach((candidate) => {
    if (seenInCommit.has(candidate.emailNormalized)) {
      errors.push(
        buildImportError(
          candidate.rowNumber,
          'DUPLICATE_IN_FILE',
          'Duplicate email found in import payload.',
        ),
      );
      skippedRows += 1;
      return;
    }

    if (existingEmails.has(candidate.emailNormalized)) {
      errors.push(
        buildImportError(
          candidate.rowNumber,
          'DUPLICATE_IN_DB',
          'Email already exists in contacts database.',
        ),
      );
      skippedRows += 1;
      return;
    }

    seenInCommit.add(candidate.emailNormalized);
    existingEmails.add(candidate.emailNormalized);
    toInsert.push(candidate);
  });

  if (toInsert.length > 0) {
    getContactsRepo().importCandidates(toInsert);
    insertedRows = toInsert.length;
  }

  return {
    requestedRows: input.candidates.length,
    insertedRows,
    skippedRows,
    failedRows: 0,
    errors,
  };
}

function registerIpcHandlers() {
  ipcMain.handle(IPC_CHANNELS.appPing, (): AppPingResult => {
    return {
      message: 'pong',
      receivedAt: Date.now(),
    };
  });

  ipcMain.handle(
    IPC_CHANNELS.contactsList,
    (_event, query) => getContactsRepo().list(query),
  );

  ipcMain.handle(
    IPC_CHANNELS.contactsImportPreview,
    (_event, input: ContactsImportPreviewInput): ImportPreviewResult => previewContactsImport(input),
  );

  ipcMain.handle(
    IPC_CHANNELS.contactsImportCommit,
    (_event, input: ContactsImportCommitInput): ImportResult => commitContactsImport(input),
  );

  ipcMain.handle(
    IPC_CHANNELS.contactsUpdateTags,
    (_event, input: UpdateContactTagsInput) => {
      const validated = validateUpdateContactTagsInput(input);
      return getContactsRepo().updateTags(validated);
    },
  );

  ipcMain.handle(IPC_CHANNELS.mailDraftsList, () => getMailDraftsRepo().list());

  ipcMain.handle(IPC_CHANNELS.mailDraftsGet, (_event, draftId: string) => {
    return getMailDraftsRepo().get(draftId);
  });

  ipcMain.handle(
    IPC_CHANNELS.mailDraftsCreateFromContacts,
    (_event, input: CreateDraftFromContactsInput) => {
      const validated = validateCreateDraftFromContactsInput(input);
      const contacts = validated.contactIds.map((contactId) => {
        const contact = getContactsRepo().findById(contactId);
        if (!contact) {
          throw new Error(`Contact not found: ${contactId}`);
        }
        return contact;
      });

      return getMailDraftsRepo().createFromContacts(validated, contacts);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.mailDraftsUpdate,
    (_event, input: UpdateMailDraftInput) => {
      const validated = validateUpdateMailDraftInput(input);
      return getMailDraftsRepo().update(validated);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.mailDraftsRemoveRecipient,
    (_event, input: RemoveDraftRecipientInput) => getMailDraftsRepo().removeRecipient(input),
  );

  ipcMain.handle(IPC_CHANNELS.smtpAccountsList, () =>
    getSmtpAccountsRepo().list(),
  );

  ipcMain.handle(
    IPC_CHANNELS.smtpAccountsCreate,
    (_event, input: SenderAccountCreateInput) =>
      getSmtpAccountsRepo().create(input),
  );

  ipcMain.handle(
    IPC_CHANNELS.smtpAccountsUpdate,
    (_event, input: SenderAccountUpdateInput) =>
      getSmtpAccountsRepo().update(input),
  );

  ipcMain.handle(
    IPC_CHANNELS.smtpAccountsDelete,
    (_event, id: string) => {
      getSmtpAccountsRepo().delete(id);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.smtpAccountsTestConnection,
    async (_event, input: TestConnectionInput) => {
      const validated = validateTestConnectionInput(input);
      return testSmtpConnection(validated);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.smtpAccountsSendSingle,
    async (_event, input: SendSingleEmailInput) => {
      const validated = validateSendSingleEmailInput(input);
      const account = getSmtpAccountsRepo().findById(validated.accountId);
      if (!account) {
        throw new Error(`Sender account not found: ${validated.accountId}`);
      }

      const decryptedPassword = getSmtpCredentialStore().decrypt(account.encryptedPassword);
      return sendSingleEmail(account, decryptedPassword, validated);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.sendQueueEnqueue,
    (_event, input: SendQueueEnqueueInput) => {
      const validated = validateSendQueueEnqueueInput(input);
      const draft = getMailDraftsRepo().get(validated.draftId);
      if (!draft) {
        throw new Error(`Draft not found: ${validated.draftId}`);
      }
      return getSendQueueRepo().enqueueDraft(draft, validated.maxAttempts);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.sendQueueList,
    (_event, input: SendQueueListQuery) => {
      const validated = validateSendQueueListQuery(input);
      return getSendQueueRepo().list(validated);
    },
  );

  ipcMain.handle(IPC_CHANNELS.sendQueueSummary, (_event, input?: SendQueueSummaryQuery) => {
    const validated = validateSendQueueSummaryQuery(input);
    return getSendQueueRunner().summary(validated.draftId);
  });
  ipcMain.handle(IPC_CHANNELS.sendQueueStart, () => getSendQueueRunner().start());
  ipcMain.handle(IPC_CHANNELS.sendQueuePause, () => getSendQueueRunner().pause());
  ipcMain.handle(IPC_CHANNELS.sendQueueResume, () => getSendQueueRunner().resume());

  ipcMain.handle(IPC_CHANNELS.productsList, () => getProductsRepo().list());

  ipcMain.handle(
    IPC_CHANNELS.productsImportCsv,
    (_event, rows: ProductImportRow[]) => {
      const inserted = getProductsRepo().importCsv(rows);
      return { inserted };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.contactsEnrich,
    async (_event, input: { contactId: string }) => {
      const contact = getContactsRepo().findById(input.contactId);
      if (!contact) {
        throw new Error(`Contact not found: ${input.contactId}`);
      }
      return getEnrichmentService().enrichContact(contact);
    },
  );
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: preloadPath,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;

  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadURL(
      pathToFileURL(rendererIndexPath).toString(),
    );
  }
}

async function initContactsRepository() {
  const dbPath = path.join(app.getPath('userData'), 'flow-sender.db');
  try {
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();

    let sqlJsDb: SqlJsDatabase;
    if (existsSync(dbPath)) {
      const buffer = readFileSync(dbPath);
      sqlJsDb = new SQL.Database(buffer);
    } else {
      sqlJsDb = new SQL.Database();
    }

    const { ContactsSqliteRepository } = await import('./contacts-repository-sqlite.js');
    contactsRepo = new ContactsSqliteRepository(dbPath, sqlJsDb);
  } catch (error) {
    console.error('[contacts] sqlite init failed, fallback to in-memory repository.', error);
    contactsRepo = new InMemoryContactsRepository();
  }
}

function initSmtpAccountsRepository() {
  const credentialStore = new SafeStorageCredentialStore();
  smtpCredentialStore = credentialStore;
  smtpAccountsRepo = new InMemorySmtpAccountsRepository(credentialStore);
}

function initProductsRepository() {
  productsRepo = new InMemoryProductsRepository();
}

async function initQueueAndDraftRepositories() {
  const queueDbPath = path.join(app.getPath('userData'), 'flow-sender-queue.db');
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();

  let sqlJsDb: SqlJsDatabase;
  if (existsSync(queueDbPath)) {
    const buffer = readFileSync(queueDbPath);
    sqlJsDb = new SQL.Database(buffer);
  } else {
    sqlJsDb = new SQL.Database();
  }

  sendQueueRepo = new SendQueueSqliteRepository(queueDbPath, sqlJsDb);
  mailDraftsRepo = new SqliteMailDraftsRepository(queueDbPath, sqlJsDb);
}

function initSendQueueRunner() {
  sendQueueRunner = new SendQueueRunner(
    getSendQueueRepo(),
    getSmtpAccountsRepo(),
    getSmtpCredentialStore(),
  );
  sendQueueRunner.bootstrap();
}

function initEnrichmentService() {
  const jinaApiKey = process.env.JINA_API_KEY ?? '';
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? '';

  if (!jinaApiKey || !anthropicApiKey) {
    const missing = [];
    if (!jinaApiKey) missing.push('JINA_API_KEY');
    if (!anthropicApiKey) missing.push('ANTHROPIC_API_KEY');
    enrichmentDisabledReason = `AI 分析不可用：缺少环境变量 ${missing.join('、')}。请在启动时设置。`;
    return;
  }

  const websiteFetcher = new JinaReaderFetcher(jinaApiKey);
  const llmClient = new ClaudeLlmClient(anthropicApiKey);
  enrichmentService = new EnrichmentService(
    getContactsRepo(),
    getProductsRepo(),
    websiteFetcher,
    llmClient,
  );
}

app.whenReady().then(async () => {
  await initContactsRepository();
  initSmtpAccountsRepository();
  initProductsRepository();
  await initQueueAndDraftRepositories();
  initSendQueueRunner();
  initEnrichmentService();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
