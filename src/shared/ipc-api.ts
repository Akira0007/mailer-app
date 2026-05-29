import type {
  Contact,
  ContactQuery,
  ContactsImportCommitInput,
  ContactsImportPreviewInput,
  EnrichContactInput,
  EnrichContactResult,
  ImportPreviewResult,
  ImportResult,
  PaginatedResult,
  Product,
  ProductImportRow,
  SenderAccountCreateInput,
  SenderAccountUpdateInput,
  SenderAccountView,
  TestConnectionInput,
  TestConnectionResult,
} from './types.js';

export const IPC_CHANNELS = {
  appPing: 'app:ping',
  contactsList: 'contacts:list',
  contactsImportPreview: 'contacts:import:preview',
  contactsImportCommit: 'contacts:import:commit',
  contactsEnrich: 'contacts:enrich',
  smtpAccountsList: 'smtpAccounts:list',
  smtpAccountsCreate: 'smtpAccounts:create',
  smtpAccountsUpdate: 'smtpAccounts:update',
  smtpAccountsDelete: 'smtpAccounts:delete',
  smtpAccountsTestConnection: 'smtpAccounts:testConnection',
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
}

export interface SmtpAccountsIpcApi {
  list(): Promise<SenderAccountView[]>;
  create(input: SenderAccountCreateInput): Promise<SenderAccountView>;
  update(input: SenderAccountUpdateInput): Promise<SenderAccountView>;
  delete(id: string): Promise<void>;
  testConnection(input: TestConnectionInput): Promise<TestConnectionResult>;
}

export interface ProductsIpcApi {
  list(): Promise<Product[]>;
  importCsv(rows: ProductImportRow[]): Promise<{ inserted: number }>;
}

export interface IpcApi {
  app: AppIpcApi;
  contacts: ContactsIpcApi;
  smtpAccounts: SmtpAccountsIpcApi;
  products: ProductsIpcApi;
}
