import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Camera,
  CirclePause,
  CirclePlay,
  FolderOpen,
  Languages,
  Library,
  MonitorUp,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Video
} from 'lucide-react';
import type { AppSettings, CaptureEvent, CaptureState, Language } from '@shared/types';
import { createTranslator } from './i18n/dictionaries';
import { useCaptureEngine } from './hooks/useCaptureEngine';

type View = 'library' | 'settings';

export function App() {
  const [settings, setSettings] = useState<AppSettings>();
  const [captureState, setCaptureState] = useState<CaptureState>({
    status: 'idle',
    updatedAt: new Date().toISOString()
  });
  const [events, setEvents] = useState<CaptureEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>();
  const [view, setView] = useState<View>('library');
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [videoUrl, setVideoUrl] = useState<string>();

  const t = useMemo(() => createTranslator(settings?.language ?? 'en-US'), [settings?.language]);
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? events[0];

  const refreshEvents = useCallback(async () => {
    const nextEvents = await window.screenRecall.library.listEvents();
    setEvents(nextEvents);
    setSelectedEventId((current) => current ?? nextEvents[0]?.id);
  }, []);

  const { start, pause } = useCaptureEngine({
    settings,
    onEventCreated: (event) => {
      setEvents((current) => [event, ...current]);
      setSelectedEventId(event.id);
    }
  });

  useEffect(() => {
    void Promise.all([
      window.screenRecall.settings.get().then(setSettings),
      window.screenRecall.capture.getStatus().then(setCaptureState),
      refreshEvents()
    ]);

    const unsubscribeSettings = window.screenRecall.settings.onChanged(setSettings);
    const unsubscribeStatus = window.screenRecall.capture.onStatusChanged(setCaptureState);
    return () => {
      unsubscribeSettings();
      unsubscribeStatus();
    };
  }, [refreshEvents]);

  useEffect(() => {
    if (settings?.captureEnabled) {
      void start();
    }
  }, [settings?.captureEnabled, start]);

  useEffect(() => {
    events.slice(0, 12).forEach((event) => {
      if (!previews[event.id]) {
        void window.screenRecall.library.readImage(event.id).then((dataUrl) => {
          if (dataUrl) {
            setPreviews((current) => ({ ...current, [event.id]: dataUrl }));
          }
        });
      }
    });
  }, [events, previews]);

  useEffect(() => {
    let objectUrl: string | undefined;
    setVideoUrl(undefined);

    if (selectedEvent?.videoPath) {
      void window.screenRecall.library.readVideo(selectedEvent.id).then((video) => {
        if (!video) {
          return;
        }

        objectUrl = URL.createObjectURL(new Blob([video.buffer], { type: video.mimeType }));
        setVideoUrl(objectUrl);
      });
    }

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [selectedEvent?.id, selectedEvent?.videoPath]);

  const updateSettings = async (patch: Partial<AppSettings>) => {
    setSettings(await window.screenRecall.settings.update(patch));
  };

  const chooseDirectory = async (key: 'imageSaveDir' | 'videoSaveDir') => {
    const result = await window.screenRecall.dialog.selectDirectory();
    if (!result.canceled && result.path) {
      await updateSettings({ [key]: result.path });
    }
  };

  const deleteEvent = async (id: string) => {
    const nextEvents = await window.screenRecall.library.deleteEvent(id);
    setEvents(nextEvents);
    setSelectedEventId(nextEvents[0]?.id);
  };

  return (
    <main className="app-shell">
      <aside className="side-rail">
        <div className="brand-mark">
          <MonitorUp size={24} />
        </div>
        <button className={view === 'library' ? 'rail-button active' : 'rail-button'} onClick={() => setView('library')} title={t('library')}>
          <Library size={22} />
        </button>
        <button className={view === 'settings' ? 'rail-button active' : 'rail-button'} onClick={() => setView('settings')} title={t('settings')}>
          <Settings size={22} />
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{t('liveMemory')}</p>
            <h1>{t('appName')}</h1>
          </div>
          <div className={`status-pill status-${captureState.status}`}>
            <span />
            {t(captureState.status)}
          </div>
        </header>

        <section className="command-strip">
          <div className="metric">
            <span>{t('source')}</span>
            <strong>{captureState.sourceName ?? t('noSource')}</strong>
          </div>
          <div className="metric">
            <span>{t('localOnly')}</span>
            <strong>{t('liveWindow')}</strong>
          </div>
          <div className="actions">
            {captureState.status === 'capturing' ? (
              <button className="primary-action danger" onClick={() => void pauseCapture()}>
                <CirclePause size={18} />
                {t('pause')}
              </button>
            ) : (
              <button className="primary-action" onClick={() => void startCapture()}>
                <CirclePlay size={18} />
                {captureState.status === 'paused' ? t('resume') : t('start')}
              </button>
            )}
          </div>
        </section>

        {captureState.status === 'permission_required' && <p className="permission-note">{t('permissionHint')}</p>}

        {view === 'library' ? (
          <LibraryView
            t={t}
            events={events}
            selectedEvent={selectedEvent}
            selectedEventId={selectedEvent?.id}
            previews={previews}
            videoUrl={videoUrl}
            onSelect={setSelectedEventId}
            onOpen={(id) => void window.screenRecall.library.openEvent(id)}
            onDelete={(id) => void deleteEvent(id)}
          />
        ) : (
          settings && (
            <SettingsView
              t={t}
              settings={settings}
              onChange={updateSettings}
              onChooseDirectory={chooseDirectory}
              onStart={start}
              onPause={pause}
            />
          )
        )}
      </section>
    </main>
  );

  async function startCapture() {
    writeAppDebug({ uiStartClickedAt: new Date().toISOString() });
    await start();
    writeAppDebug({ uiLocalStartReturnedAt: new Date().toISOString() });
    await window.screenRecall.capture.start();
    writeAppDebug({ uiMainStartReturnedAt: new Date().toISOString() });
  }

  async function pauseCapture() {
    writeAppDebug({ uiPauseClickedAt: new Date().toISOString() });
    await pause();
    await window.screenRecall.capture.pause();
    writeAppDebug({ uiPauseReturnedAt: new Date().toISOString() });
  }
}

function writeAppDebug(patch: Record<string, unknown>) {
  const debugWindow = window as Window & { __screenRecallDebug?: Record<string, unknown> };
  debugWindow.__screenRecallDebug = {
    ...(debugWindow.__screenRecallDebug ?? {}),
    ...patch,
    updatedAt: new Date().toISOString()
  };
}

interface SharedViewProps {
  t: ReturnType<typeof createTranslator>;
}

interface LibraryViewProps extends SharedViewProps {
  events: CaptureEvent[];
  selectedEvent?: CaptureEvent;
  selectedEventId?: string;
  previews: Record<string, string>;
  videoUrl?: string;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

function LibraryView({
  t,
  events,
  selectedEvent,
  selectedEventId,
  previews,
  videoUrl,
  onSelect,
  onOpen,
  onDelete
}: LibraryViewProps) {
  return (
    <section className="library-layout">
      <div className="event-list">
        <h2>{t('latestEvents')}</h2>
        {events.length === 0 && <p className="empty-state">{t('emptyEvents')}</p>}
        {events.map((event) => (
          <button
            key={event.id}
            className={event.id === selectedEventId ? 'event-card active' : 'event-card'}
            onClick={() => onSelect(event.id)}
          >
            <img src={previews[event.id]} alt="" />
            <div>
              <strong>{new Date(event.createdAt).toLocaleString()}</strong>
              <span>{event.sourceName}</span>
            </div>
          </button>
        ))}
      </div>

      <article className="event-detail">
        {selectedEvent ? (
          <>
            <div className="preview-stage">
              {videoUrl ? (
                <video src={videoUrl} controls poster={previews[selectedEvent.id]} />
              ) : (
                <img src={previews[selectedEvent.id]} alt="" />
              )}
            </div>
            <div className="detail-toolbar">
              <button onClick={() => onOpen(selectedEvent.id)}>
                <FolderOpen size={17} />
                {t('openLocation')}
              </button>
              <button className="ghost-danger" onClick={() => onDelete(selectedEvent.id)}>
                <Trash2 size={17} />
                {t('delete')}
              </button>
            </div>
            <dl className="detail-grid">
              <div>
                <dt>{t('ocrText')}</dt>
                <dd>{selectedEvent.ocrText}</dd>
              </div>
              <div>
                <dt>{t('triggerReasons')}</dt>
                <dd>{selectedEvent.triggerReasons.join(', ')}</dd>
              </div>
              <div>
                <dt>{t('imagePath')}</dt>
                <dd>{selectedEvent.imagePath}</dd>
              </div>
              {selectedEvent.videoPath && (
                <div>
                  <dt>{t('videoPath')}</dt>
                  <dd>{selectedEvent.videoPath}</dd>
                </div>
              )}
            </dl>
          </>
        ) : (
          <div className="detail-empty">
            <Camera size={42} />
            <p>{t('emptyEvents')}</p>
          </div>
        )}
      </article>
    </section>
  );
}

interface SettingsViewProps extends SharedViewProps {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => Promise<void>;
  onChooseDirectory: (key: 'imageSaveDir' | 'videoSaveDir') => Promise<void>;
  onStart: () => Promise<void>;
  onPause: () => Promise<void>;
}

function SettingsView({ t, settings, onChange, onChooseDirectory }: SettingsViewProps) {
  const updateExcludedApps = (value: string) => {
    void onChange({
      excludedApps: value
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean)
    });
  };

  return (
    <section className="settings-layout">
      <div className="settings-panel">
        <h2>{t('captureSettings')}</h2>
        <label className="field">
          <span>{t('imageSaveDir')}</span>
          <div className="path-row">
            <input value={settings.imageSaveDir} onChange={(event) => void onChange({ imageSaveDir: event.target.value })} />
            <button onClick={() => void onChooseDirectory('imageSaveDir')}>{t('browse')}</button>
          </div>
        </label>
        <label className="field">
          <span>{t('videoSaveDir')}</span>
          <div className="path-row">
            <input value={settings.videoSaveDir} onChange={(event) => void onChange({ videoSaveDir: event.target.value })} />
            <button onClick={() => void onChooseDirectory('videoSaveDir')}>{t('browse')}</button>
          </div>
        </label>
        <label className="switch-row">
          <span>
            <Video size={18} />
            {t('livePhotoEnabled')}
          </span>
          <input
            type="checkbox"
            checked={settings.livePhotoEnabled}
            onChange={(event) => void onChange({ livePhotoEnabled: event.target.checked })}
          />
        </label>
        <label className="field">
          <span>
            <Languages size={18} />
            {t('language')}
          </span>
          <select value={settings.language} onChange={(event) => void onChange({ language: event.target.value as Language })}>
            <option value="en-US">English</option>
            <option value="zh-CN">简体中文</option>
          </select>
        </label>
        <label className="field">
          <span>{t('excludedApps')}</span>
          <textarea
            value={settings.excludedApps.join('\n')}
            placeholder={t('excludedAppsPlaceholder')}
            onChange={(event) => updateExcludedApps(event.target.value)}
          />
        </label>
      </div>

      <div className="principles">
        <div>
          <ShieldCheck size={22} />
          <strong>{t('localOnly')}</strong>
          <p>{t('localOnlyCopy')}</p>
        </div>
        <div>
          <Sparkles size={22} />
          <strong>{t('textDense')}</strong>
          <p>{t('textDenseCopy')}</p>
        </div>
        <div>
          <Video size={22} />
          <strong>{t('liveWindow')}</strong>
          <p>{t('liveWindowCopy')}</p>
        </div>
      </div>
    </section>
  );
}
