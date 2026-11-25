import { useState } from 'react';
import { DEFAULT_SETTINGS, store } from '../engine/storage';
import type { Settings } from '../engine/types';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export function SettingsPage({ settings, onChange, meta }: {
  settings: Settings; onChange: (s: Settings) => void; meta: { generated_at: string; counts: Record<string, number> };
}) {
  const [s, setS] = useState(settings);
  const [msg, setMsg] = useState('');
  const num = (k: keyof Settings, min: number, max: number) => (
    <input type="number" min={min} max={max} value={s[k] as number}
      onChange={(e) => setS({ ...s, [k]: Math.max(min, Math.min(max, Number(e.target.value) || 0)) })} />
  );

  const save = () => { store.saveSettings(s); onChange(s); setMsg('저장했어요'); };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(store.exportAll(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vocab-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importData = (f: File) => {
    f.text().then((t) => {
      try { store.importAll(JSON.parse(t)); setMsg('불러왔어요. 새로고침합니다.'); setTimeout(() => location.reload(), 600); }
      catch (e: any) { setMsg(e.message ?? '불러오기 실패'); }
    });
  };

  return (
    <div className="page">
      <h3>학습량</h3>
      <div className="form">
        <label>하루 새 단어 {num('daily_new_limit', 0, 50)}</label>
        <label>하루 복습 상한 {num('review_cap', 10, 500)}</label>
        <label>밀린 복습이 이 이상이면 새 단어 중단 {num('backlog_stop', 10, 1000)}</label>
        <label>새 단어 쉬는 요일
          <select value={s.no_new_weekday ?? ''} onChange={(e) => setS({ ...s, no_new_weekday: e.target.value === '' ? null : Number(e.target.value) })}>
            <option value="">없음</option>
            {WEEK.map((w, i) => <option key={i} value={i}>{w}요일</option>)}
          </select>
        </label>
        <label>난적 판정 오답 횟수 {num('leech_threshold', 1, 20)}</label>
        <label>난적 하루 최대 출제 {num('leech_daily_cap', 0, 50)}</label>
        <label>하루 시작 시각 (이 시각 전은 전날) {num('day_start_hour', 0, 23)}</label>
        <label>발음 속도
          <input type="range" min={0.6} max={1.2} step={0.05} value={s.tts_rate} onChange={(e) => setS({ ...s, tts_rate: Number(e.target.value) })} />
        </label>
      </div>
      <div className="row-btns">
        <button className="primary" onClick={save}>저장</button>
        <button className="ghost" onClick={() => setS(DEFAULT_SETTINGS)}>기본값</button>
      </div>

      <h3>내 학습 기록</h3>
      <p className="muted sm">기록은 이 브라우저에만 저장돼요. 기기를 바꾸거나 캐시를 지우기 전에 백업하세요. 백업 파일은 나중에 서비스 DB(user_progress, attempts)로 그대로 옮길 수 있는 형식이에요.</p>
      <div className="row-btns">
        <button className="ghost" onClick={exportData}>백업 내보내기</button>
        <label className="ghost file-btn">백업 불러오기
          <input type="file" accept="application/json" onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
        </label>
        <button className="danger" onClick={() => { if (confirm('학습 기록을 모두 지울까요? 되돌릴 수 없어요.')) { store.resetProgress(); location.reload(); } }}>기록 초기화</button>
      </div>
      {msg && <div className="notice">{msg}</div>}

      <p className="muted sm footer-meta">데이터: 단어 {meta.counts.items}개 · 문제 {meta.counts.questions}개 · 생성 {meta.generated_at.slice(0, 10)}</p>
    </div>
  );
}
