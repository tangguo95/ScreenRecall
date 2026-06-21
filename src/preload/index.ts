import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppSettings,
  ActiveAppInfo,
  CaptureCommand,
  CaptureEvent,
  CaptureSourceInfo,
  CaptureState,
  CreateCaptureEventInput,
  DirectorySelection
} from '../shared/types';

const api = {
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    update: (patch: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke('settings:update', patch),
    onChanged: (callback: (settings: AppSettings) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, settings: AppSettings): void => callback(settings);
      ipcRenderer.on('settings:changed', listener);
      return () => ipcRenderer.removeListener('settings:changed', listener);
    }
  },
  capture: {
    start: (): Promise<CaptureState> => ipcRenderer.invoke('capture:start'),
    pause: (): Promise<CaptureState> => ipcRenderer.invoke('capture:pause'),
    resume: (): Promise<CaptureState> => ipcRenderer.invoke('capture:resume'),
    stop: (): Promise<CaptureState> => ipcRenderer.invoke('capture:stop'),
    getStatus: (): Promise<CaptureState> => ipcRenderer.invoke('capture:getStatus'),
    setStatus: (patch: Partial<CaptureState>): Promise<CaptureState> => ipcRenderer.invoke('capture:setStatus', patch),
    onStatusChanged: (callback: (state: CaptureState) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: CaptureState): void => callback(state);
      ipcRenderer.on('capture:statusChanged', listener);
      return () => ipcRenderer.removeListener('capture:statusChanged', listener);
    },
    onCommand: (callback: (command: CaptureCommand) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, command: CaptureCommand): void => callback(command);
      ipcRenderer.on('capture:command', listener);
      return () => ipcRenderer.removeListener('capture:command', listener);
    }
  },
  desktop: {
    getPrimarySource: (): Promise<CaptureSourceInfo | undefined> => ipcRenderer.invoke('desktop:getPrimarySource'),
    getActiveApp: (): Promise<ActiveAppInfo | undefined> => ipcRenderer.invoke('desktop:getActiveApp')
  },
  library: {
    listEvents: (): Promise<CaptureEvent[]> => ipcRenderer.invoke('library:listEvents'),
    createEvent: (input: CreateCaptureEventInput): Promise<CaptureEvent> => ipcRenderer.invoke('library:createEvent', input),
    openEvent: (id: string): Promise<void> => ipcRenderer.invoke('library:openEvent', id),
    deleteEvent: (id: string): Promise<CaptureEvent[]> => ipcRenderer.invoke('library:deleteEvent', id),
    readImage: (id: string): Promise<string | undefined> => ipcRenderer.invoke('library:readImage', id),
    readVideo: (id: string): Promise<{ buffer: ArrayBuffer; mimeType: string; filename: string } | undefined> =>
      ipcRenderer.invoke('library:readVideo', id)
  },
  dialog: {
    selectDirectory: (): Promise<DirectorySelection> => ipcRenderer.invoke('dialog:selectDirectory')
  }
};

contextBridge.exposeInMainWorld('screenRecall', api);

export type ScreenRecallApi = typeof api;
