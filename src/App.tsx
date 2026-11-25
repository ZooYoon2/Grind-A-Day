import { useEffect, useState } from 'react';
import { Index, loadDataset } from './engine/data';
import { studyDate } from './engine/dates';
import { store } from './engine/storage';
import type { Settings } from './engine/types';
import { Home } from './pages/Home';
import { Study } from './pages/Study';
import { WordList } from './pages/WordList';
import { Stats } from './pages/Stats';
import { SettingsPage } from './pages/SettingsPage';

type Tab = 'home' | 'words' | 'stats' | 'settings';
const TABS: [Tab, string][] = [['home', '홈'], ['words', '단어장'], ['stats', '기록'], ['settings', '설정']];

export default function App() {
  const [index, setIndex] = useState<Index | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('home');
  const [study, setStudy] = useState<null | 'all' | 'review'>(null);
  const [settings, setSettings] = useState<Settings>(store.settings());
  const [tick, setTick] = useState(0);

  useEffect(() => { loadDataset().then((ds) => setIndex(new Index(ds))).catch((e) => setError(String(e.message ?? e))); }, []);

  if (error) return <div className="page center"><h2>데이터를 불러오지 못했어요</h2><p className="muted">{error}</p></div>;
  if (!index) return <div className="page center muted">불러오는 중…</div>;

  const today = studyDate(new Date(), settings.timezone, settings.day_start_hour);

  if (study) {
    return <Study key={tick} index={index} settings={settings} today={today} mode={study}
      onExit={() => { setStudy(null); setTick((t) => t + 1); }} />;
  }

  return (
    <div className="app">
      <header className="top"><span className="logo">영단어 SRS</span><span className="muted sm">1단계 기초 · {index.ds.collections.length} Days</span></header>
      <main key={tick}>
        {tab === 'home' && <Home index={index} settings={settings} today={today} onStart={setStudy} />}
        {tab === 'words' && <WordList index={index} settings={settings} />}
        {tab === 'stats' && <Stats index={index} today={today} />}
        {tab === 'settings' && <SettingsPage settings={settings} onChange={setSettings} meta={index.ds.meta} />}
      </main>
      <nav className="tabs">
        {TABS.map(([t, label]) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{label}</button>
        ))}
      </nav>
    </div>
  );
}
