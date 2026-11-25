import type { Index } from '../engine/data';
import { planToday } from '../engine/scheduler';
import { store } from '../engine/storage';
import type { Settings } from '../engine/types';

export function Home({ index, settings, today, onStart }: {
  index: Index; settings: Settings; today: string; onStart: (mode: 'all' | 'review') => void;
}) {
  const progress = store.progress();
  const plan = planToday(index.ds, progress, settings, today);
  const rows = Object.values(progress);
  const total = index.ds.items.length;
  const count = (f: (s: (typeof rows)[number]) => boolean) => rows.filter(f).length;

  const learning = count((p) => p.state.card_state === 'learning' || p.state.card_state === 'review');
  const graduated = count((p) => p.state.card_state === 'graduated');
  const mastered = count((p) => p.state.card_state === 'mastered');
  const leech = count((p) => p.state.is_leech);
  const seen = rows.length;

  const nextDay = (() => {
    const ci = [...index.ds.collectionItems].sort((a, b) => a.collection_id - b.collection_id || a.position - b.position)
      .find((c) => !progress[c.item_id]);
    return ci?.collection_id ?? null;
  })();

  const todayAttempts = store.attempts().filter((a) => a.grade_detail.study_date === today);
  const graded = todayAttempts.filter((a) => a.outcome !== 'ungraded');
  const acc = graded.length ? Math.round((graded.filter((a) => a.outcome === 'correct' || a.outcome === 'slow_correct').length / graded.length) * 100) : null;
  const totalTasks = plan.reviews.length + plan.news.length;

  return (
    <div className="page">
      <div className="hero">
        <div className="muted sm">{today} 학습일</div>
        <h1>오늘의 학습</h1>
        <div className="today-grid">
          <div className="stat-tile"><b>{plan.reviews.length}</b><span>복습할 단어</span></div>
          <div className="stat-tile"><b>{plan.news.length}</b><span>새 단어{nextDay ? ` · Day ${nextDay}` : ''}</span></div>
          <div className="stat-tile"><b>{todayAttempts.length}</b><span>오늘 푼 문제{acc !== null ? ` · ${acc}%` : ''}</span></div>
        </div>
        {plan.newBlockedReason && <div className="notice">{plan.newBlockedReason}</div>}
        {plan.backlog > plan.reviews.length && (
          <div className="notice">밀린 복습 {plan.backlog}개 중 오늘 상한 {settings.review_cap}개만 보여요</div>
        )}
        <button className="primary block lg" disabled={!totalTasks} onClick={() => onStart('all')}>
          {totalTasks ? `학습 시작 (${totalTasks}개)` : '오늘 할 학습을 모두 마쳤어요'}
        </button>
        {plan.reviews.length > 0 && plan.news.length > 0 && (
          <button className="ghost block" onClick={() => onStart('review')}>복습만 하기 ({plan.reviews.length}개)</button>
        )}
      </div>

      <h3>전체 진행</h3>
      <div className="bar-total" title={`${seen}/${total}`}>
        <div className="seg mastered" style={{ width: `${(mastered / total) * 100}%` }} />
        <div className="seg graduated" style={{ width: `${(graduated / total) * 100}%` }} />
        <div className="seg learning" style={{ width: `${(learning / total) * 100}%` }} />
      </div>
      <div className="legend">
        <span><i className="dot learning" />학습 중 {learning}</span>
        <span><i className="dot graduated" />습득 {graduated}</span>
        <span><i className="dot mastered" />장기 기억 {mastered}</span>
        <span className="muted">안 본 단어 {total - seen}</span>
        {leech > 0 && <span className="danger-text">난적 {leech}</span>}
      </div>
    </div>
  );
}
