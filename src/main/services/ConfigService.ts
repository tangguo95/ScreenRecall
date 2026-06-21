import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AppSettings, Language } from '../../shared/types';

export class ConfigService {
  private readonly settingsPath: string;

  constructor() {
    this.settingsPath = join(app.getPath('userData'), 'settings.json');
  }

  async getSettings(): Promise<AppSettings> {
    const defaults = this.getDefaultSettings();

    try {
      const raw = await readFile(this.settingsPath, 'utf8');
      return this.normalizeSettings({ ...defaults, ...JSON.parse(raw) });
    } catch {
      await this.saveSettings(defaults);
      return defaults;
    }
  }

  async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    const next = this.normalizeSettings({ ...current, ...patch });
    await this.saveSettings(next);
    return next;
  }

  private async saveSettings(settings: AppSettings): Promise<void> {
    await mkdir(dirname(this.settingsPath), { recursive: true });
    await mkdir(settings.imageSaveDir, { recursive: true });
    await mkdir(settings.videoSaveDir, { recursive: true });
    await writeFile(this.settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  }

  private getDefaultSettings(): AppSettings {
    const saveRoot = join(app.getPath('pictures'), 'ScreenRecall');
    const locale = app.getLocale().toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';

    return {
      imageSaveDir: join(saveRoot, 'Images'),
      videoSaveDir: join(saveRoot, 'Videos'),
      livePhotoEnabled: true,
      language: locale,
      captureEnabled: false,
      excludedApps: []
    };
  }

  private normalizeSettings(settings: AppSettings): AppSettings {
    return {
      imageSaveDir: settings.imageSaveDir,
      videoSaveDir: settings.videoSaveDir,
      livePhotoEnabled: Boolean(settings.livePhotoEnabled),
      language: normalizeLanguage(settings.language),
      captureEnabled: Boolean(settings.captureEnabled),
      excludedApps: Array.isArray(settings.excludedApps) ? settings.excludedApps.filter(Boolean) : []
    };
  }
}

function normalizeLanguage(language: Language | string | undefined): Language {
  return language === 'zh-CN' ? 'zh-CN' : 'en-US';
}
