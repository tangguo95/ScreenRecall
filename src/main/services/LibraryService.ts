import { app, shell } from 'electron';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { AppSettings, CaptureEvent, CreateCaptureEventInput } from '../../shared/types';

export class LibraryService {
  private readonly indexPath: string;

  constructor() {
    this.indexPath = join(app.getPath('userData'), 'events.json');
  }

  async listEvents(): Promise<CaptureEvent[]> {
    return this.readIndex();
  }

  async createEvent(
    input: CreateCaptureEventInput,
    settings: AppSettings,
    recognizeImage?: (imagePath: string, language: AppSettings['language']) => Promise<string>
  ): Promise<CaptureEvent> {
    const createdAt = new Date();
    const day = createdAt.toISOString().slice(0, 10);
    const stamp = createdAt.toISOString().replace(/[:.]/g, '-');
    const id = `${stamp}-${Math.random().toString(16).slice(2, 8)}`;
    const imageDir = join(settings.imageSaveDir, day);
    const videoDir = join(settings.videoSaveDir, day);
    const imagePath = join(imageDir, `${id}.png`);
    const videoPath = input.videoBuffer ? join(videoDir, `${id}.webm`) : undefined;

    await mkdir(imageDir, { recursive: true });
    await writeFile(imagePath, dataUrlToBuffer(input.imageDataUrl));

    if (videoPath && input.videoBuffer) {
      await mkdir(videoDir, { recursive: true });
      await writeFile(videoPath, Buffer.from(input.videoBuffer));
    }

    const recognizedText = recognizeImage ? await recognizeImage(imagePath, input.language) : '';
    const ocrText = [recognizedText, input.ocrText].filter(Boolean).join('\n\n');

    const event: CaptureEvent = {
      id,
      createdAt: createdAt.toISOString(),
      imagePath,
      videoPath,
      ocrText,
      triggerReasons: input.triggerReasons,
      similarityHash: input.similarityHash,
      language: input.language,
      sourceName: input.sourceName
    };

    const events = await this.readIndex();
    events.unshift(event);
    await this.writeIndex(events);
    return event;
  }

  async deleteEvent(id: string): Promise<CaptureEvent[]> {
    const events = await this.readIndex();
    const target = events.find((event) => event.id === id);

    if (target) {
      await Promise.all([
        rm(target.imagePath, { force: true }),
        target.videoPath ? rm(target.videoPath, { force: true }) : Promise.resolve()
      ]);
    }

    const next = events.filter((event) => event.id !== id);
    await this.writeIndex(next);
    return next;
  }

  async openEvent(id: string): Promise<void> {
    const events = await this.readIndex();
    const event = events.find((item) => item.id === id);
    if (!event) {
      return;
    }

    shell.showItemInFolder(event.videoPath ?? event.imagePath);
  }

  async readImageDataUrl(id: string): Promise<string | undefined> {
    const events = await this.readIndex();
    const event = events.find((item) => item.id === id);
    if (!event) {
      return undefined;
    }

    const image = await readFile(event.imagePath);
    return `data:image/png;base64,${image.toString('base64')}`;
  }

  async readVideo(id: string): Promise<{ buffer: ArrayBuffer; mimeType: string; filename: string } | undefined> {
    const events = await this.readIndex();
    const event = events.find((item) => item.id === id);
    if (!event?.videoPath) {
      return undefined;
    }

    const video = await readFile(event.videoPath);
    return {
      buffer: video.buffer.slice(video.byteOffset, video.byteOffset + video.byteLength),
      mimeType: 'video/webm',
      filename: basename(event.videoPath)
    };
  }

  private async readIndex(): Promise<CaptureEvent[]> {
    try {
      const raw = await readFile(this.indexPath, 'utf8');
      return JSON.parse(raw) as CaptureEvent[];
    } catch {
      await this.writeIndex([]);
      return [];
    }
  }

  private async writeIndex(events: CaptureEvent[]): Promise<void> {
    await mkdir(dirname(this.indexPath), { recursive: true });
    await writeFile(this.indexPath, JSON.stringify(events, null, 2), 'utf8');
  }
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const [, base64] = dataUrl.split(',');
  if (!base64) {
    throw new Error('Invalid image data URL.');
  }

  return Buffer.from(base64, 'base64');
}
