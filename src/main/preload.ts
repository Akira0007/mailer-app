import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS, type IpcApi } from '../shared/ipc-api.js';

const api: IpcApi = {
  app: {
    ping: () => ipcRenderer.invoke(IPC_CHANNELS.appPing),
  },
  contacts: {
    list: (query) => ipcRenderer.invoke(IPC_CHANNELS.contactsList, query),
    importPreview: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.contactsImportPreview, input),
    importCommit: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.contactsImportCommit, input),
    enrich: (input) => ipcRenderer.invoke(IPC_CHANNELS.contactsEnrich, input),
    updateTags: (input) => ipcRenderer.invoke(IPC_CHANNELS.contactsUpdateTags, input),
  },
  mailDrafts: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.mailDraftsList),
    get: (draftId) => ipcRenderer.invoke(IPC_CHANNELS.mailDraftsGet, draftId),
    createFromContacts: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.mailDraftsCreateFromContacts, input),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.mailDraftsUpdate, input),
    removeRecipient: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.mailDraftsRemoveRecipient, input),
  },
  smtpAccounts: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.smtpAccountsList),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.smtpAccountsCreate, input),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.smtpAccountsUpdate, input),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.smtpAccountsDelete, id),
    testConnection: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.smtpAccountsTestConnection, input),
    sendSingle: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.smtpAccountsSendSingle, input),
  },
  sendQueue: {
    enqueue: (input) => ipcRenderer.invoke(IPC_CHANNELS.sendQueueEnqueue, input),
    list: (query) => ipcRenderer.invoke(IPC_CHANNELS.sendQueueList, query),
    summary: (query) => ipcRenderer.invoke(IPC_CHANNELS.sendQueueSummary, query),
    start: () => ipcRenderer.invoke(IPC_CHANNELS.sendQueueStart),
    pause: () => ipcRenderer.invoke(IPC_CHANNELS.sendQueuePause),
    resume: () => ipcRenderer.invoke(IPC_CHANNELS.sendQueueResume),
  },
  products: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.productsList),
    importCsv: (rows) => ipcRenderer.invoke(IPC_CHANNELS.productsImportCsv, rows),
  },
};

contextBridge.exposeInMainWorld('api', api);
