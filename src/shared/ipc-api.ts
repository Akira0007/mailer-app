export const IPC_CHANNELS = {
  appPing: 'app:ping',
} as const;

export type AppPingResult = {
  message: 'pong';
  receivedAt: number;
};

export interface AppIpcApi {
  ping(): Promise<AppPingResult>;
}

export interface IpcApi {
  app: AppIpcApi;
}
