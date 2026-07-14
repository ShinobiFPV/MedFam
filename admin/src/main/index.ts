import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { join } from 'path';
// electron-updater is CommonJS; its named exports aren't reliably detected
// under ESM interop, so import the default and destructure instead.
import electronUpdater from 'electron-updater';
import { getServerAddress, setServerAddress } from './store';

const { autoUpdater } = electronUpdater;

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}

function checkForUpdates(): void {
  // No-op (rejects silently) until a real GitHub Release exists, or when
  // offline — neither should ever be user-visible as an error.
  autoUpdater.checkForUpdatesAndNotify().catch(() => {});
}

app.whenReady().then(() => {
  ipcMain.handle('server-address:get', () => getServerAddress());
  ipcMain.handle('server-address:set', (_event, address: string) => setServerAddress(address));
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:check-for-updates', () => checkForUpdates());

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  checkForUpdates();
  setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS).unref();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
