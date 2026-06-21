import { app, BrowserWindow, Menu, Tray, nativeImage, nativeTheme } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CaptureCommand, CaptureState } from '../shared/types';
import { registerIpcHandlers } from './ipc';
import { ActiveAppService } from './services/ActiveAppService';
import { ConfigService } from './services/ConfigService';
import { LibraryService } from './services/LibraryService';
import { OcrService } from './services/OcrService';

let mainWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let isQuitting = false;

const configService = new ConfigService();
const activeAppService = new ActiveAppService();
const libraryService = new LibraryService();
const ocrService = new OcrService();
let captureState: CaptureState = {
  status: 'idle',
  updatedAt: new Date().toISOString()
};

const setCaptureState = (patch: Partial<CaptureState>): CaptureState => {
  captureState = {
    ...captureState,
    ...patch,
    updatedAt: new Date().toISOString()
  };
  BrowserWindow.getAllWindows().forEach((window) => window.webContents.send('capture:statusChanged', captureState));
  rebuildTray();
  return captureState;
};

const broadcastCaptureCommand = (command: CaptureCommand): void => {
  BrowserWindow.getAllWindows().forEach((window) => window.webContents.send('capture:command', command));
};

registerIpcHandlers({
  configService,
  activeAppService,
  libraryService,
  ocrService,
  getCaptureState: () => captureState,
  setCaptureState,
  broadcastCaptureCommand
});

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 680,
    title: 'ScreenRecall',
    icon: getIconPath('app-icon-256.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#101314' : '#f4f7f6',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      sandbox: false
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
};

const createTray = (): void => {
  tray = new Tray(createTrayImage());
  tray.setToolTip('ScreenRecall');
  tray.on('click', () => {
    mainWindow?.show();
  });
  rebuildTray();
};

const rebuildTray = (): void => {
  if (!tray) {
    return;
  }

  const isCapturing = captureState.status === 'capturing';
  const canResume = captureState.status === 'paused' || captureState.status === 'idle';
  const menu = Menu.buildFromTemplate([
    {
      label: 'Show ScreenRecall',
      click: () => mainWindow?.show()
    },
    {
      label: isCapturing ? 'Pause Capture' : canResume ? 'Start Capture' : 'Start Capture',
      click: async () => {
        const action = isCapturing ? 'pause' : 'start';
        setCaptureState({ status: isCapturing ? 'paused' : 'capturing', error: undefined });
        broadcastCaptureCommand({ action });
        const settings = await configService.updateSettings({ captureEnabled: !isCapturing });
        BrowserWindow.getAllWindows().forEach((window) => window.webContents.send('settings:changed', settings));
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(menu);
};

function createTrayImage(): Electron.NativeImage {
  const iconPath = getIconPath('app-icon-32.png');
  if (iconPath) {
    return nativeImage.createFromPath(iconPath);
  }

  const svg = `
    <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="8" fill="#14201f"/>
      <path d="M8 11.5A3.5 3.5 0 0 1 11.5 8h9A3.5 3.5 0 0 1 24 11.5v9a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 8 20.5v-9Z" fill="#f4f7f6"/>
      <path d="M12 14.5h8M12 17.5h6M12 20.5h4" stroke="#1d7f77" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
}

function getIconPath(fileName: string): string | undefined {
  return [
    join(app.getAppPath(), 'assets', 'icons', fileName),
    join(__dirname, '../../assets/icons', fileName),
    join(process.resourcesPath, 'assets', 'icons', fileName)
  ].find((candidate) => existsSync(candidate));
}

app.whenReady().then(async () => {
  await configService.getSettings();
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
