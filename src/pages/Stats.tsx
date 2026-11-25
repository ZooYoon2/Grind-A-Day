import type { Index } from '../engine/data';
import { addDays } from '../engine/dates';
import { store } from '../engine/storage';

const FORMAT_KO: Record<string, string> = {
  mc_en_ko: '영→한 선택', mc_ko_en: '한→영 선택', listen_pick: '듣고 고르기', spell_hint: '철자(힌트)',
  cloze_typed: '예문 빈칸', spell_nohint: '철자(힌트 없음)', cloze_fresh: '새 예문 빈칸',
};

export function Stats({ index, today }: { index: Index; today: string }) {
  const attempts = store.attempts();
  const progress = Object.values(store.progress());
  const stages = index.ds.policies[0].params.stages;

  // 최근 14일 풀이 수
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const perDay = days.map((d) => attempts.filter((a) => a.grade_detail.study_date === d).length);
  const max = Math.max(1, ...perDay);

  // 출제 형태별 정답률
  const byFormat = Object.keys(FORMAT_KO).map((f) => {
    const rows = attempts.filter((a) => index.question.get(a.question_id)?.format === f && a.outcome !== 'ungraded');
    const ok = rows.filter((a) => a.outcome === 'correct' || a.outcome === 'slow_correct').length;
    return { f, n: rows.length, acc: rows.length ? Math.round((ok / rows.length) * 100) : null };
  });

  // 단계별 카드 수
  const byStage = stages.map((s) => ({
    label: s.label,
    n: progress.filter((p) => p.state.stage === s.stage && p.state.card_state !== 'mastered').length,
  }));
  const mastered = progress.filter((p) => p.state.card_state === 'mastered').length;

  // 7일 예정 복습
  const upcoming = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today, i);
    return { d, n: progress.filter((p) => p.status === 'active' && p.due_date === d).length };
  });

  const leeches = progress.filter((p) => p.state.is_leech).map((p) => index.item.get(p.item_id)!);

  return (
    <div className="page">
      <h3>최근 14일 푼 문제</h3>
      <div className="mini-bars">
        {perDay.map((n, i) => (
          <div key={days[i]} className="mb-col" title={`${days[i]}: ${n}`}>
            <div className="mb-bar" style={{ height: `${(n / max) * 100}%` }} />
            <span>{days[i].slice(8)}</span>
          </div>
        ))}
      </div>

      <h3>앞으로 7일 복습 예정</h3>
      <div className="upcoming">
        {upcoming.map((u) => <div key={u.d}><b>{u.n}</b><span>{u.d.slice(5)}</span></div>)}
      </div>

      <h3>단계별 단어 수</h3>
      <table className="tbl">
        <tbody>
          {byStage.map((s) => <tr key={s.label}><td>{s.label}</td><td className="num">{s.n}</td></tr>)}
          <tr><td>장기 기억</td><td className="num">{mastered}</td></tr>
        </tbody>
      </table>

      <h3>문제 유형별 정답률</h3>
      <table className="tbl">
        <tbody>
          {byFormat.map((r) => (
            <tr key={r.f}><td>{FORMAT_KO[r.f]}</td><td className="num">{r.acc === null ? '–' : `${r.acc}%`}</td><td className="num muted">{r.n}회</td></tr>
          ))}
        </tbody>
      </table>

      {leeches.length > 0 && (
        <>
          <h3>난적 단어</h3>
          <div className="leech-list">{leeches.map((i) => <span key={i.id} className="badge danger">{i.title} · {i.note.meaning_ko}</span>)}</div>
        </>
      )}
    </div>
  );
}
