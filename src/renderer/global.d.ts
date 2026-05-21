import type { IpcApi } from '../shared/ipc-api.js';

declare global {
  interface Window {
    api: IpcApi;
  }
}

export {};
