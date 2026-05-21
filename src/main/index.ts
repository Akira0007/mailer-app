import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { IPC_CHANNELS, type AppPingResult } from '../shared/ipc-api.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const preloadPath = path.join(currentDir, 'preload.js');
const rendererIndexPath = path.join(currentDir, '../../dist/index.html');

function registerIpcHandlers() {
  ipcMain.handle(IPC_CHANNELS.appPing, (): AppPingResult => {
    return {
      message: 'pong',
      receivedAt: Date.now(),
    };
  });
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

app.whenReady().then(() => {
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
