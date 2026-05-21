import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS, type IpcApi } from '../shared/ipc-api.js';

const api: IpcApi = {
  app: {
    ping: () => ipcRenderer.invoke(IPC_CHANNELS.appPing),
  },
};

contextBridge.exposeInMainWorld('api', api);
