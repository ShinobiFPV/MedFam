import { contextBridge, ipcRenderer } from 'electron';

const api = {
  getServerAddress: (): Promise<string> => ipcRenderer.invoke('server-address:get'),
  setServerAddress: (address: string): Promise<void> => ipcRenderer.invoke('server-address:set', address),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke('app:check-for-updates'),
};

contextBridge.exposeInMainWorld('medfam', api);

export type MedfamApi = typeof api;
