import { useMemo, useState } from 'react';
import type { Index } from '../engine/data';
import { store } from '../engine/storage';
import type { Progress, Settings } from '../engine/types';
import { WordCard } from '../components/WordCard';
import { speak } from '../engine/speech';

function statusOf(p: Progress | undefined, labels: string[]): { text: string; cls: string } {
  if (!p) return { text: '안 봄', cls: '' };
  if (p.state.card_state === 'mastered') return { text: '장기 기억', cls: 'mastered' };
  if (p.state.card_state === 'graduated') return { text: '습득', cls: 'graduated' };
  return { text: labels[p.state.stage] ?? `단계 ${p.state.stage}`, cls: 'learning' };
}

export function WordList({ index, settings }: { index: Index; settings: Settings }) {
  const days = index.ds.collections;
  const [day, setDay] = useState(days[0]?.day_no ?? 1);
  const [open, setOpen] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const progress = store.progress();
  const labels = index.ds.policies[0].params.stages.map((s) => s.label);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (term) {
      return index.ds.items.filter((i) => i.title.toLowerCase().includes(term) || i.note.meaning_ko.includes(term)).map((i) => i.id);
    }
    return index.ds.collectionItems.filter((c) => c.collection_id === day).sort((a, b) => a.position - b.position).map((c) => c.item_id);
  }, [day, q]);

  return (
    <div className="page">
      <input className="search" placeholder="단어나 뜻 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      {!q && (
        <div className="day-chips">
          {days.map((d) => {
            const ids = index.ds.collectionItems.filter((c) => c.collection_id === d.day_no);
            const seen = ids.filter((c) => progress[c.item_id]).length;
            return (
              <button key={d.id} className={`chip ${d.day_no === day ? 'on' : ''} ${seen === ids.length ? 'full' : ''}`} onClick={() => setDay(d.day_no)}>
                Day {d.day_no}
              </button>
            );
          })}
        </div>
      )}
      {!q && <div className="muted sm topics">{days.find((d) => d.day_no === day)?.topics.join(' · ')}</div>}
      <ul className="word-list">
        {list.map((id) => {
          const item = index.item.get(id)!;
          const st = statusOf(progress[id], labels);
          return (
            <li key={id}>
              <div className="wl-row" onClick={() => setOpen(open === id ? null : id)}>
                <button className="icon-btn sm" onClick={(e) => { e.stopPropagation(); speak(item.title, settings.tts_rate); }} aria-label="발음 듣기">🔊</button>
                <span className="wl-word">{item.title}</span>
                <span className="wl-mean">{item.note.meaning_ko}</span>
                {progress[id]?.state.is_leech && <span className="badge danger">난적</span>}
                <span className={`badge ${st.cls}`}>{st.text}</span>
              </div>
              {open === id && <WordCard item={item} ttsRate={settings.tts_rate} showFresh={!!progress[id] && progress[id].state.stage >= 5} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
