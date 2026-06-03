import type {
  Contact,
  ContactQuery,
  ContactsImportCommitInput,
  ContactsImportPreviewInput,
  CreateDraftFromContactsInput,
  EnrichContactInput,
  EnrichContactResult,
  ImportPreviewResult,
  ImportResult,
  MailDraft,
  MailDraftListItem,
  PaginatedResult,
  Product,
  ProductImportRow,
  RemoveDraftRecipientInput,
  SendJob,
  SendQueueControlResult,
  SendQueueEnqueueInput,
  SendQueueEnqueueResult,
  SendQueueListQuery,
  SendQueueSummary,
  SendQueueSummaryQuery,
  SendSingleEmailInput,
  SendSingleEmailResult,
  SenderAccountCreateInput,
  SenderAccountUpdateInput,
  SenderAccountView,
  TestConnectionInput,
  TestConnectionResult,
  UpdateContactTagsInput,
  UpdateMailDraftInput,
} from './types.js';

export const IPC_CHANNELS = {
  appPing: 'app:ping',
  contactsList: 'contacts:list',
  contactsImportPreview: 'contacts:import:preview',
  contactsImportCommit: 'contacts:import:commit',
  contactsEnrich: 'contacts:enrich',
  contactsUpdateTags: 'contacts:updateTags',
  mailDraftsList: 'mailDrafts:list',
  mailDraftsGet: 'mailDrafts:get',
  mailDraftsCreateFromContacts: 'mailDrafts:createFromContacts',
  mailDraftsUpdate: 'mailDrafts:update',
  mailDraftsRemoveRecipient: 'mailDrafts:removeRecipient',
  smtpAccountsList: 'smtpAccounts:list',
  smtpAccountsCreate: 'smtpAccounts:create',
  smtpAccountsUpdate: 'smtpAccounts:update',
  smtpAccountsDelete: 'smtpAccounts:delete',
  smtpAccountsTestConnection: 'smtpAccounts:testConnection',
  smtpAccountsSendSingle: 'smtpAccounts:sendSingle',
  sendQueueEnqueue: 'sendQueue:enqueue',
  sendQueueList: 'sendQueue:list',
  sendQueueSummary: 'sendQueue:summary',
  sendQueueStart: 'sendQueue:start',
  sendQueuePause: 'sendQueue:pause',
  sendQueueResume: 'sendQueue:resume',
  productsList: 'products:list',
  productsImportCsv: 'products:importCsv',
} as const;

export type AppPingResult = {
  message: 'pong';
  receivedAt: number;
};

export interface AppIpcApi {
  ping(): Promise<AppPingResult>;
}

export interface ContactsIpcApi {
  list(query: ContactQuery): Promise<PaginatedResult<Contact>>;
  importPreview(input: ContactsImportPreviewInput): Promise<ImportPreviewResult>;
  importCommit(input: ContactsImportCommitInput): Promise<ImportResult>;
  enrich(input: EnrichContactInput): Promise<EnrichContactResult>;
  updateTags(input: UpdateContactTagsInput): Promise<Contact>;
}

export interface MailDraftsIpcApi {
  list(): Promise<MailDraftListItem[]>;
  get(draftId: string): Promise<MailDraft | null>;
  createFromContacts(input: CreateDraftFromContactsInput): Promise<MailDraft>;
  update(input: UpdateMailDraftInput): Promise<MailDraft>;
  removeRecipient(input: RemoveDraftRecipientInput): Promise<MailDraft>;
}

export interface SmtpAccountsIpcApi {
  list(): Promise<SenderAccountView[]>;
  create(input: SenderAccountCreateInput): Promise<SenderAccountView>;
  update(input: SenderAccountUpdateInput): Promise<SenderAccountView>;
  delete(id: string): Promise<void>;
  testConnection(input: TestConnectionInput): Promise<TestConnectionResult>;
  sendSingle(input: SendSingleEmailInput): Promise<SendSingleEmailResult>;
}

export interface SendQueueIpcApi {
  enqueue(input: SendQueueEnqueueInput): Promise<SendQueueEnqueueResult>;
  list(query: SendQueueListQuery): Promise<SendJob[]>;
  summary(query?: SendQueueSummaryQuery): Promise<SendQueueSummary>;
  start(): Promise<SendQueueControlResult>;
  pause(): Promise<SendQueueControlResult>;
  resume(): Promise<SendQueueControlResult>;
}

export interface ProductsIpcApi {
  list(): Promise<Product[]>;
  importCsv(rows: ProductImportRow[]): Promise<{ inserted: number }>;
}

export interface IpcApi {
  app: AppIpcApi;
  contacts: ContactsIpcApi;
  mailDrafts: MailDraftsIpcApi;
  smtpAccounts: SmtpAccountsIpcApi;
  sendQueue: SendQueueIpcApi;
  products: ProductsIpcApi;
}
