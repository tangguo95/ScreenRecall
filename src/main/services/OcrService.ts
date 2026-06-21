import { app } from 'electron';
import { copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { Language } from '../../shared/types';

type TesseractModule = typeof import('tesseract.js');
type TesseractWorker = Awaited<ReturnType<TesseractModule['createWorker']>>;

interface TessdataPackage {
  code: string;
  langPath: string;
}

const requirePackage = createRequire(__filename);

export class OcrService {
  private worker: TesseractWorker | undefined;
  private readonly tessdataDir = join(app.getPath('userData'), 'tessdata');
  private initializePromise: Promise<TesseractWorker> | undefined;

  async recognizeImage(imagePath: string, language: Language): Promise<string> {
    try {
      const worker = await this.getWorker(language);
      const result = await worker.recognize(imagePath);
      return result.data.text.trim();
    } catch (error) {
      console.warn('Local OCR failed:', error);
      return '';
    }
  }

  private async getWorker(language: Language): Promise<TesseractWorker> {
    if (this.worker) {
      return this.worker;
    }

    if (!this.initializePromise) {
      this.initializePromise = this.initializeWorker(language);
    }

    this.worker = await this.initializePromise;
    return this.worker;
  }

  private async initializeWorker(language: Language): Promise<TesseractWorker> {
    await this.prepareTessdata();
    const { createWorker } = requirePackage('tesseract.js') as TesseractModule;
    const languages = ['eng', 'chi_sim'];

    return createWorker(languages, 1, {
      langPath: this.tessdataDir,
      cacheMethod: 'none',
      logger: () => undefined
    });
  }

  private async prepareTessdata(): Promise<void> {
    await mkdir(this.tessdataDir, { recursive: true });
    await Promise.all([this.copyLanguageData('@tesseract.js-data/eng'), this.copyLanguageData('@tesseract.js-data/chi_sim')]);
  }

  private async copyLanguageData(packageName: string): Promise<void> {
    const dataPackage = requirePackage(packageName) as TessdataPackage;
    const source = join(dataPackage.langPath, `${dataPackage.code}.traineddata.gz`);
    const target = join(this.tessdataDir, `${dataPackage.code}.traineddata.gz`);

    if (!existsSync(target)) {
      await copyFile(source, target);
    }
  }
}
