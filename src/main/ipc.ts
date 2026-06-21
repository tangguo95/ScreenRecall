import { BrowserWindow, desktopCapturer, dialog, ipcMain, screen } from 'electron';
import type { CaptureCommand, CaptureSourceInfo, CaptureState, CreateCaptureEventInput } from '../shared/types';
import { ActiveAppService } from './services/ActiveAppService';
import { ConfigService } from './services/ConfigService';
import { LibraryService } from './services/LibraryService';
import { OcrService } from './services/OcrService';

export interface IpcContext {
  configService: ConfigService;
  activeAppService: ActiveAppService;
  libraryService: LibraryService;
  ocrService: OcrService;
  getCaptureState: () => CaptureState;
  setCaptureState: (state: Partial<CaptureState>) => CaptureState;
  broadcastCaptureCommand: (command: CaptureCommand) => void;
}

export function registerIpcHandlers(context: IpcContext): void {
  ipcMain.handle('settings:get', () => context.configService.getSettings());
  ipcMain.handle('settings:update', async (_event, patch) => {
    const settings = await context.configService.updateSettings(patch);
    broadcastSettingsChanged(settings);
    return settings;
  });

  ipcMain.handle('dialog:selectDirectory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    });

    return {
      canceled: result.canceled,
      path: result.filePaths[0]
    };
  });

  ipcMain.handle('capture:start', async () => {
    const state = context.setCaptureState({ status: 'capturing', error: undefined });
    context.broadcastCaptureCommand({ action: 'start' });
    broadcastSettingsChanged(await context.configService.updateSettings({ captureEnabled: true }));
    return state;
  });

  ipcMain.handle('capture:pause', async () => {
    const state = context.setCaptureState({ status: 'paused', error: undefined });
    context.broadcastCaptureCommand({ action: 'pause' });
    broadcastSettingsChanged(await context.configService.updateSettings({ captureEnabled: false }));
    return state;
  });

  ipcMain.handle('capture:resume', async () => {
    const state = context.setCaptureState({ status: 'capturing', error: undefined });
    context.broadcastCaptureCommand({ action: 'resume' });
    broadcastSettingsChanged(await context.configService.updateSettings({ captureEnabled: true }));
    return state;
  });

  ipcMain.handle('capture:stop', async () => {
    const state = context.setCaptureState({ status: 'idle', error: undefined });
    context.broadcastCaptureCommand({ action: 'stop' });
    broadcastSettingsChanged(await context.configService.updateSettings({ captureEnabled: false }));
    return state;
  });

  ipcMain.handle('capture:getStatus', () => context.getCaptureState());
  ipcMain.handle('capture:setStatus', (_event, patch) => context.setCaptureState(patch));

  ipcMain.handle('desktop:getPrimarySource', async (): Promise<CaptureSourceInfo | undefined> => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 }
    });
    const currentDisplayId = String(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id);
    const primaryDisplayId = String(screen.getPrimaryDisplay().id);
    const primary =
      sources.find((source) => source.display_id === currentDisplayId) ??
      sources.find((source) => source.display_id === primaryDisplayId) ??
      sources[0];

    if (!primary) {
      return undefined;
    }

    return {
      id: primary.id,
      name: primary.name,
      displayId: primary.display_id
    };
  });

  ipcMain.handle('desktop:getActiveApp', () => context.activeAppService.getActiveApp());

  ipcMain.handle('library:listEvents', () => context.libraryService.listEvents());
  ipcMain.handle('library:createEvent', async (_event, input: CreateCaptureEventInput) => {
    const settings = await context.configService.getSettings();
    return context.libraryService.createEvent(input, settings, (imagePath, language) =>
      context.ocrService.recognizeImage(imagePath, language)
    );
  });
  ipcMain.handle('library:openEvent', (_event, id: string) => context.libraryService.openEvent(id));
  ipcMain.handle('library:deleteEvent', (_event, id: string) => context.libraryService.deleteEvent(id));
  ipcMain.handle('library:readImage', (_event, id: string) => context.libraryService.readImageDataUrl(id));
  ipcMain.handle('library:readVideo', (_event, id: string) => context.libraryService.readVideo(id));
}

function broadcastSettingsChanged(settings: unknown): void {
  BrowserWindow.getAllWindows().forEach((window) => window.webContents.send('settings:changed', settings));
}
