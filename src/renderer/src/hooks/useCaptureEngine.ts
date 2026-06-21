import { useCallback, useEffect, useRef, useState } from 'react';
import {
  analyzeImageData,
  describeLocalTextSignal,
  evaluateKeyFrame,
  type FrameSignal
} from '@shared/captureAnalysis';
import { SimilarityDedupe } from '@shared/dedupe';
import { TimeRingBuffer } from '@shared/ringBuffer';
import type { AppSettings, CaptureEvent, CaptureSourceInfo } from '@shared/types';

interface UseCaptureEngineOptions {
  settings: AppSettings | undefined;
  onEventCreated: (event: CaptureEvent) => void;
}

interface RecordedChunk {
  startedAt: number;
  endedAt: number;
  blob: Blob;
}

interface PendingCapture {
  triggerTime: number;
  imageDataUrl: string;
  signal: FrameSignal;
  reasons: string[];
  sourceName: string;
}

interface CaptureEngineState {
  sourceName?: string;
  error?: string;
}

const RING_RETENTION_MS = 15_000;
const LIVE_BEFORE_MS = 5_000;
const LIVE_AFTER_MS = 5_000;
const ANALYSIS_INTERVAL_MS = 1_000;
const DEDUPE_WINDOW_MS = 30_000;

export function useCaptureEngine({ settings, onEventCreated }: UseCaptureEngineOptions) {
  const [engineState, setEngineState] = useState<CaptureEngineState>({});
  const streamRef = useRef<MediaStream>();
  const imageCaptureRef = useRef<ImageCapture>();
  const recorderRef = useRef<MediaRecorder>();
  const recordingCleanupRef = useRef<() => void>();
  const sourceNameRef = useRef<string>();
  const analysisTimerRef = useRef<number>();
  const pendingTimerRef = useRef<number>();
  const previousSignalRef = useRef<FrameSignal>();
  const chunksRef = useRef(new TimeRingBuffer<RecordedChunk>(RING_RETENTION_MS));
  const pendingRef = useRef<PendingCapture[]>([]);
  const dedupeRef = useRef(new SimilarityDedupe(DEDUPE_WINDOW_MS, 8));
  const savingRef = useRef(false);
  const startingRef = useRef(false);
  const settingsRef = useRef(settings);
  const onEventCreatedRef = useRef(onEventCreated);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    onEventCreatedRef.current = onEventCreated;
  }, [onEventCreated]);

  const stop = useCallback(() => {
    window.clearInterval(analysisTimerRef.current);
    window.clearInterval(pendingTimerRef.current);
    recordingCleanupRef.current?.();
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());

    analysisTimerRef.current = undefined;
    pendingTimerRef.current = undefined;
    recordingCleanupRef.current = undefined;
    recorderRef.current = undefined;
    streamRef.current = undefined;
    imageCaptureRef.current = undefined;
    sourceNameRef.current = undefined;
    previousSignalRef.current = undefined;
    pendingRef.current = [];
    chunksRef.current.clear();
    updateCaptureDebug({ streamActive: false, pendingCount: 0 });
  }, []);

  const savePendingCaptures = useCallback(async () => {
    if (savingRef.current || !settingsRef.current) {
      return;
    }

    const now = Date.now();
    const waitMs = settingsRef.current.livePhotoEnabled ? LIVE_AFTER_MS : 0;
    const ready = pendingRef.current.filter((pending) => now - pending.triggerTime >= waitMs);
    if (ready.length === 0) {
      return;
    }

    savingRef.current = true;
    pendingRef.current = pendingRef.current.filter((pending) => now - pending.triggerTime < waitMs);

    try {
      for (const pending of ready) {
        const activeSettings = settingsRef.current;
        const chunks = activeSettings.livePhotoEnabled
          ? chunksRef.current.getRange(pending.triggerTime - LIVE_BEFORE_MS, pending.triggerTime + LIVE_AFTER_MS)
          : [];
        const videoBlob = chunks.length > 0 ? new Blob(chunks.map((chunk) => chunk.blob), { type: 'video/webm' }) : undefined;
        const videoBuffer = videoBlob ? await videoBlob.arrayBuffer() : undefined;

        const event = await window.screenRecall.library.createEvent({
          imageDataUrl: pending.imageDataUrl,
          videoBuffer,
          videoMimeType: videoBlob?.type,
          ocrText: describeLocalTextSignal(pending.signal),
          triggerReasons: pending.reasons,
          similarityHash: pending.signal.hash,
          language: activeSettings.language,
          sourceName: pending.sourceName
        });

        onEventCreatedRef.current(event);
      }
    } finally {
      savingRef.current = false;
    }
  }, []);

  const analyzeFrame = useCallback(async () => {
    const imageCapture = imageCaptureRef.current;
    const settingsValue = settingsRef.current;
    if (!imageCapture || !settingsValue) {
      updateCaptureDebug({
        skippedFrames: getCaptureDebugNumber('skippedFrames') + 1,
        hasImageCapture: Boolean(imageCapture)
      });
      return;
    }

    const bitmap = await grabFrame(imageCapture);
    const width = 320;
    const height = Math.max(180, Math.round((bitmap.height / Math.max(1, bitmap.width)) * width));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      bitmap.close();
      return;
    }

    context.drawImage(bitmap, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    const signal = analyzeImageData(imageData, Date.now(), previousSignalRef.current);
    const evaluation = evaluateKeyFrame(signal, previousSignalRef.current);
    updateCaptureDebug({
      analyzedFrames: getCaptureDebugNumber('analyzedFrames') + 1,
      lastSignal: signal,
      lastEvaluation: evaluation,
      frameWidth: bitmap.width,
      frameHeight: bitmap.height
    });
    previousSignalRef.current = signal;

    if (!evaluation.shouldTrigger || !dedupeRef.current.canAccept(signal.hash, signal.capturedAt)) {
      updateCaptureDebug({ lastSkipReason: evaluation.shouldTrigger ? 'dedupe' : 'low_score' });
      bitmap.close();
      return;
    }

    if (settingsValue.excludedApps.length > 0) {
      const activeApp = await window.screenRecall.desktop.getActiveApp();
      if (isExcludedApp(activeApp?.appName, settingsValue.excludedApps)) {
        updateCaptureDebug({ lastSkipReason: 'excluded_app', activeApp });
        bitmap.close();
        return;
      }
    }

    dedupeRef.current.record(signal.hash, signal.capturedAt);
    const imageDataUrl = captureCoverImageFromBitmap(bitmap);
    bitmap.close();
    pendingRef.current.push({
      triggerTime: signal.capturedAt,
      imageDataUrl,
      signal,
      reasons: evaluation.reasons,
      sourceName: sourceNameRef.current ?? 'Primary screen'
    });
    updateCaptureDebug({ lastTriggerAt: new Date(signal.capturedAt).toISOString(), pendingCount: pendingRef.current.length });

    if (!settingsValue.livePhotoEnabled) {
      void savePendingCaptures();
    }
  }, [savePendingCaptures]);

  const start = useCallback(async () => {
    if (streamRef.current || startingRef.current) {
      return;
    }

    try {
      startingRef.current = true;
      const source = await window.screenRecall.desktop.getPrimarySource();
      if (!source) {
        throw new Error('No screen source was found.');
      }

      const stream = await createDesktopStream(source);
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      if (!track) {
        throw new Error('No video track was returned for the selected screen.');
      }

      const imageCapture = new ImageCapture(track);
      imageCaptureRef.current = imageCapture;
      sourceNameRef.current = source.name;
      updateCaptureDebug({ trackSettings: track.getSettings() });
      setEngineState({ sourceName: source.name });
      await window.screenRecall.capture.setStatus({ status: 'capturing', sourceName: source.name, error: undefined });

      let chunkStartedAt = Date.now();
      const recordingSource = createCanvasRecordingSource(imageCapture, track.getSettings());
      recordingCleanupRef.current = recordingSource.stop;
      const recorder = startMediaRecorder(recordingSource.stream, (event) => {
        if (event.data.size <= 0) {
          return;
        }

        const endedAt = Date.now();
        chunksRef.current.push({
          startedAt: chunkStartedAt,
          endedAt,
          blob: event.data
        });
        updateCaptureDebug({ chunkCount: chunksRef.current.length, lastChunkSize: event.data.size });
        chunkStartedAt = endedAt;
      });
      recorderRef.current = recorder;
      updateCaptureDebug({ streamActive: true, recorderMimeType: recorder.mimeType, sourceName: source.name });

      analysisTimerRef.current = window.setInterval(() => {
        void analyzeFrame().catch((error) => {
          updateCaptureDebug({ lastError: error instanceof Error ? error.message : String(error) });
        });
      }, ANALYSIS_INTERVAL_MS);
      pendingTimerRef.current = window.setInterval(savePendingCaptures, 500);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Capture failed.';
      updateCaptureDebug({ lastError: message });
      setEngineState({ error: message });
      await window.screenRecall.capture.setStatus({
        status: message.toLowerCase().includes('permission') ? 'permission_required' : 'error',
        error: message
      });
      stop();
    } finally {
      startingRef.current = false;
    }
  }, [analyzeFrame, savePendingCaptures, stop]);

  const pause = useCallback(async () => {
    stop();
    await window.screenRecall.capture.setStatus({ status: 'paused', error: undefined });
  }, [stop]);

  useEffect(() => {
    const unsubscribe = window.screenRecall.capture.onCommand((command) => {
      if (command.action === 'start' || command.action === 'resume') {
        void start();
      }

      if (command.action === 'pause') {
        void pause();
      }

      if (command.action === 'stop') {
        stop();
      }
    });

    return () => {
      unsubscribe();
      stop();
    };
  }, [pause, start, stop]);

  return {
    engineState,
    start,
    pause,
    stop
  };
}

async function createDesktopStream(source: CaptureSourceInfo): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      // Electron exposes this Chromium desktop source constraint.
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: source.id,
        minWidth: 640,
        maxWidth: 1920,
        minHeight: 360,
        maxHeight: 1080,
        maxFrameRate: 30
      }
    } as MediaTrackConstraints
  });
}

function captureCoverImageFromBitmap(bitmap: ImageBitmap): string {
  const maxWidth = 1600;
  const scale = Math.min(1, maxWidth / Math.max(1, bitmap.width));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    return '';
  }

  context.drawImage(bitmap, 0, 0, width, height);
  return canvas.toDataURL('image/png');
}

function getSupportedMimeType(): string | undefined {
  return ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'].find((mimeType) =>
    MediaRecorder.isTypeSupported(mimeType)
  );
}

function startMediaRecorder(stream: MediaStream, onChunk: (event: BlobEvent) => void): MediaRecorder {
  const preferredMimeType = getSupportedMimeType();
  const optionCandidates: Array<MediaRecorderOptions | undefined> = [
    preferredMimeType ? { mimeType: preferredMimeType } : undefined,
    { mimeType: 'video/webm' },
    undefined
  ];
  const errors: string[] = [];

  for (const options of optionCandidates) {
    try {
      const recorder = new MediaRecorder(stream, options);
      recorder.ondataavailable = onChunk;
      recorder.start(1_000);
      return recorder;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(`MediaRecorder could not start with WebM settings: ${errors.join(' | ')}`);
}

function createCanvasRecordingSource(
  imageCapture: ImageCapture,
  trackSettings: MediaTrackSettings
): { stream: MediaStream; stop: () => void } {
  const canvas = document.createElement('canvas');
  const maxWidth = 1280;
  const sourceWidth = trackSettings.width ?? 1280;
  const sourceHeight = trackSettings.height ?? 720;
  const scale = Math.min(1, maxWidth / Math.max(1, sourceWidth));
  canvas.width = Math.max(640, Math.round(sourceWidth * scale));
  canvas.height = Math.max(360, Math.round(sourceHeight * scale));
  const context = canvas.getContext('2d');
  let timer: number | undefined;
  let stopped = false;

  const draw = async () => {
    if (stopped) {
      return;
    }

    if (context) {
      try {
        const bitmap = await grabFrame(imageCapture);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
      } catch (error) {
        updateCaptureDebug({ lastRecordingFrameError: error instanceof Error ? error.message : String(error) });
      }
    }
    timer = window.setTimeout(draw, 1000 / 12);
  };

  draw();
  const stream = canvas.captureStream(12);

  return {
    stream,
    stop: () => {
      stopped = true;
      if (timer) {
        window.clearTimeout(timer);
      }
      stream.getTracks().forEach((track) => track.stop());
    }
  };
}

function isExcludedApp(appName: string | undefined, excludedApps: string[]): boolean {
  if (!appName) {
    return false;
  }

  const normalized = appName.toLowerCase();
  return excludedApps.some((entry) => normalized.includes(entry.toLowerCase()));
}

function grabFrame(imageCapture: ImageCapture): Promise<ImageBitmap> {
  return (imageCapture as unknown as { grabFrame: () => Promise<ImageBitmap> }).grabFrame();
}

interface WindowWithCaptureDebug extends Window {
  __screenRecallDebug?: Record<string, unknown>;
}

function updateCaptureDebug(patch: Record<string, unknown>): void {
  const debugWindow = window as WindowWithCaptureDebug;
  debugWindow.__screenRecallDebug = {
    ...(debugWindow.__screenRecallDebug ?? {}),
    ...patch,
    updatedAt: new Date().toISOString()
  };
}

function getCaptureDebugNumber(key: string): number {
  const value = (window as WindowWithCaptureDebug).__screenRecallDebug?.[key];
  return typeof value === 'number' ? value : 0;
}
