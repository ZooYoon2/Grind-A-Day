// localStorage 저장소. 키별로 서비스 테이블과 같은 모양으로 저장한다.
// 내보내기 JSON은 나중에 DB 이관(user_progress / attempts / study_sessions / user_settings)에 그대로 쓴다.
import type { Attempt, Progress, Session, Settings } from './types';

const K = {
  settings: 'vsrs.user_settings',
  progress: 'vsrs.user_progress',
  attempts: 'vsrs.attempts',
  sessions: 'vsrs.study_sessions',
};

export const DEFAULT_SETTINGS: Settings = {
  timezone: 'Asia/Seoul',
  day_start_hour: 4,
  daily_new_limit: 12,
  review_cap: 80,
  backlog_stop: 100,
  no_new_weekday: null,
  leech_threshold: 3,
  leech_daily_cap: 5,
  tts_rate: 0.9,
};

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.error('저장 실패', e); }
}

export const store = {
  settings: (): Settings => ({ ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(K.settings, {}) }),
  saveSettings: (s: Settings) => write(K.settings, s),

  progress: (): Record<number, Progress> => read(K.progress, {}),
  saveProgress: (p: Record<number, Progress>) => write(K.progress, p),

  attempts: (): Attempt[] => read(K.attempts, []),
  appendAttempts: (rows: Attempt[]) => write(K.attempts, [...read<Attempt[]>(K.attempts, []), ...rows]),

  sessions: (): Session[] => read(K.sessions, []),
  saveSessions: (s: Session[]) => write(K.sessions, s),

  exportAll() {
    return {
      exported_at: new Date().toISOString(),
      schema_version: 1,
      user_settings: store.settings(),
      user_progress: Object.values(store.progress()),
      attempts: store.attempts(),
      study_sessions: store.sessions(),
    };
  },
  importAll(data: any) {
    if (!data || data.schema_version !== 1) throw new Error('지원하지 않는 백업 파일이에요');
    write(K.settings, data.user_settings ?? {});
    const map: Record<number, Progress> = {};
    for (const p of data.user_progress ?? []) map[p.item_id] = p;
    write(K.progress, map);
    write(K.attempts, data.attempts ?? []);
    write(K.sessions, data.study_sessions ?? []);
  },
  resetProgress() {
    for (const k of [K.progress, K.attempts, K.sessions]) localStorage.removeItem(k);
  },
};
