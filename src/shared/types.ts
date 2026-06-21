export type Language = 'en-US' | 'zh-CN';

export type CaptureStatus =
  | 'idle'
  | 'capturing'
  | 'paused'
  | 'permission_required'
  | 'error';

export interface AppSettings {
  imageSaveDir: string;
  videoSaveDir: string;
  livePhotoEnabled: boolean;
  language: Language;
  captureEnabled: boolean;
  excludedApps: string[];
}

export interface CaptureState {
  status: CaptureStatus;
  sourceName?: string;
  error?: string;
  updatedAt: string;
}

export interface CaptureSourceInfo {
  id: string;
  name: string;
  displayId: string;
}

export interface ActiveAppInfo {
  appName: string;
  windowTitle: string;
}

export interface CaptureEvent {
  id: string;
  createdAt: string;
  imagePath: string;
  videoPath?: string;
  ocrText: string;
  triggerReasons: string[];
  similarityHash: string;
  language: Language;
  sourceName: string;
}

export interface CreateCaptureEventInput {
  imageDataUrl: string;
  videoBuffer?: ArrayBuffer;
  videoMimeType?: string;
  ocrText: string;
  triggerReasons: string[];
  similarityHash: string;
  language: Language;
  sourceName: string;
}

export interface CaptureCommand {
  action: 'start' | 'pause' | 'resume' | 'stop';
}

export interface DirectorySelection {
  canceled: boolean;
  path?: string;
}
