import { useEffect, useMemo, useRef, useState } from 'react';
import type { Index } from '../engine/data';
import { grade, worst, type GradeResult } from '../engine/grader';
import { newProgress, planToday, transition, USER_ID, type CardTask } from '../engine/scheduler';
import { store } from '../engine/storage';
import type { Attempt, Outcome, Session, Settings } from '../engine/types';
import { QuestionView, type AnswerPayload } from '../components/QuestionView';
import { WordCard, highlight } from '../components/WordCard';
import { speak } from '../engine/speech';

interface Task extends CardTask { retry: number }
interface Feedback { res: GradeResult; explanation: string }

const LABEL: Record<Outcome, string> = {
  correct: '정답', slow_correct: '정답 (8초 초과 → 단계 유지)', near_miss: '아깝다! 한 글자 차이', wrong: '오답', ungraded: '완료',
};

export function Study({ index, settings, today, mode, onExit }: {
  index: Index; settings: Settings; today: string; mode: 'all' | 'review'; onExit: () => void;
}) {
  const policy = index.ds.policies[0];
  const initial = useMemo(() => {
    const plan = planToday(index.ds, store.progress(), settings, today);
    const tasks: Task[] = [...plan.reviews, ...(mode === 'all' ? plan.news : [])].map((t) => ({ ...t, retry: 0 }));
    return tasks;
  }, []);

  const [queue, setQueue] = useState<Task[]>(initial);
  const [pos, setPos] = useState(0);
  const [step, setStep] = useState<number>(-1); // -1 = 소개 카드(신규) 또는 시작 전
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [chosen, setChosen] = useState<string | undefined>();
  const outcomes = useRef<Outcome[]>([]);
  const stats = useRef({ correct: 0, wrong: 0, newDone: 0, reviewDone: 0 });
  const session = useRef<Session | null>(null);
  const nextAttemptId = useRef((store.attempts().at(-1)?.id ?? 0) + 1);

  const advanceRef = useRef<() => void>(() => {});
  const task = queue[pos];
  const done = pos >= queue.length;

  // Enter로 다음
  useEffect(() => {
    if (!feedback) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); advanceRef.current(); } };
    const t = setTimeout(() => window.addEventListener('keydown', h), 150);
    return () => { clearTimeout(t); window.removeEventListener('keydown', h); };
  }, [feedback]);

  // 세션 행 생성 / 종료
  useEffect(() => {
    const sessions = store.sessions();
    const s: Session = {
      id: (sessions.at(-1)?.id ?? 0) + 1, user_id: USER_ID, study_date: today,
      started_at: new Date().toISOString(), ended_at: null, new_count: 0, review_count: 0,
    };
    session.current = s;
    store.saveSessions([...sessions, s]);
    return () => closeSession();
  }, []);

  function closeSession() {
    const s = session.current; if (!s) return;
    s.ended_at = new Date().toISOString();
    s.new_count = stats.current.newDone; s.review_count = stats.current.reviewDone;
    store.saveSessions(store.sessions().map((x) => (x.id === s.id ? s : x)));
  }

  // 신규 카드는 소개 카드부터, 복습 카드는 바로 시험
  useEffect(() => {
    if (!task) return;
    outcomes.current = [];
    setFeedback(null);
    setStep(task.isNew && task.retry === 0 ? -1 : 0);
  }, [pos, queue.length === 0]);

  if (!initial.length) {
    return (
      <div className="page center">
        <h2>오늘 할 학습이 없어요 🎉</h2>
        <p className="muted">내일 다시 만나요. 단어장에서 미리 훑어봐도 좋아요.</p>
        <button className="primary" onClick={onExit}>홈으로</button>
      </div>
    );
  }

  if (done) {
    const s = stats.current;
    return (
      <div className="page center">
        <h2>오늘 학습 완료!</h2>
        <div className="summary">
          <div><b>{s.newDone}</b><span>새 단어</span></div>
          <div><b>{s.reviewDone}</b><span>복습</span></div>
          <div><b>{s.correct}</b><span>정답</span></div>
          <div><b>{s.wrong}</b><span>오답</span></div>
        </div>
        <button className="primary" onClick={() => { closeSession(); onExit(); }}>홈으로</button>
      </div>
    );
  }

  const item = index.item.get(task.itemId)!;
  const format = step >= 0 ? task.formats[step] : null;
  const q = format ? index.q(task.itemId, format) : undefined;

  function startNew() {
    const all = store.progress();
    if (!all[task.itemId]) {
      all[task.itemId] = newProgress(task.itemId, policy, today);
      store.saveProgress(all);
    }
    setStep(0);
  }

  function answer(a: AnswerPayload) {
    if (!q || feedback) return;
    setChosen(a.choice);
    const res = grade(q, { choice: a.choice, text: a.text, responseMs: a.responseMs });
    const stageBefore = store.progress()[task.itemId]?.state.stage ?? 0;
    const target = item.title.toLowerCase();
    const row: Attempt = {
      id: nextAttemptId.current++, user_id: USER_ID, question_id: q.id, session_id: session.current!.id,
      grade_status: 'graded', outcome: res.outcome, score: res.score,
      response: a.transcript !== undefined ? { transcript: a.transcript } : a.choice ? { choice: a.choice } : { text: a.text },
      grade_detail: {
        stage_before: stageBefore, stage_after: null, is_retry: task.retry > 0, study_date: today,
        ...(a.transcript !== undefined ? { target_word_hit: a.transcript.toLowerCase().includes(target.split(' ')[0]) } : {}),
      },
      response_ms: a.responseMs, created_at: new Date().toISOString(),
    };
    outcomes.current.push(res.outcome);
    if (res.outcome === 'correct' || res.outcome === 'slow_correct') stats.current.correct++;
    else if (res.outcome !== 'ungraded') stats.current.wrong++;

    const isLast = step === task.formats.length - 1;
    let stageAfter: number | null = null;
    if (isLast && task.retry === 0) stageAfter = finalizeCard();
    row.grade_detail.stage_after = stageAfter;
    store.appendAttempts([row]);

    if (res.outcome === 'ungraded') { advance(); return; }
    const exp = index.explanation.get(q.id)?.map((e) => e.body).join(' ') ?? '';
    setFeedback({ res, explanation: exp });
    if (res.outcome === 'correct' && q.answer_type === 'choice') setTimeout(() => advanceRef.current(), 900);
  }

  /** 단계 판정 (마지막 시험 직후 1회). 반환: stage_after */
  function finalizeCard(): number {
    const all = store.progress();
    const p = all[task.itemId] ?? newProgress(task.itemId, policy, today);
    const result = worst(outcomes.current);
    const next = transition(p, result, policy, settings, today, new Date());
    all[task.itemId] = next;
    store.saveProgress(all);
    if (task.isNew) stats.current.newDone++; else stats.current.reviewDone++;
    return next.state.stage;
  }

  function advance() {
    setFeedback(null);
    if (step < task.formats.length - 1) { setStep(step + 1); return; }
    // 카드 끝: 틀린 카드는 세션 끝에 재출제 (단계 변동 없음, 최대 2회)
    const w = worst(outcomes.current);
    if ((w === 'wrong' || w === 'near_miss') && task.retry < 2) {
      const graded = task.formats.filter((f) => index.q(task.itemId, f)?.answer_type !== 'ungraded');
      setQueue((qq) => [...qq, { ...task, isNew: false, formats: graded.length ? graded : task.formats, retry: task.retry + 1 }]);
    }
    setPos((x) => x + 1);
  }
  advanceRef.current = advance;

  const primary = item.note.examples.find((e) => e.role === 'primary')!;
  const ok = feedback && (feedback.res.outcome === 'correct' || feedback.res.outcome === 'slow_correct');

  return (
    <div className="page study">
      <div className="study-top">
        <button className="ghost sm" onClick={() => { closeSession(); onExit(); }}>✕ 그만하기</button>
        <div className="progress-bar"><div style={{ width: `${(pos / queue.length) * 100}%` }} /></div>
        <span className="muted sm">{pos + 1} / {queue.length}</span>
      </div>
      <div className="badges">
        {task.isNew && task.retry === 0 && <span className="badge new">새 단어</span>}
        {!task.isNew && task.retry === 0 && <span className="badge">복습 · {policy.params.stages[task.stage].label}</span>}
        {task.retry > 0 && <span className="badge warn">다시 풀기</span>}
        {store.progress()[task.itemId]?.state.is_leech && <span className="badge danger">난적</span>}
      </div>

      {step === -1 ? (
        <div className="intro">
          <WordCard item={item} ttsRate={settings.tts_rate} />
          <button className="primary block" onClick={startNew} autoFocus>외웠어요, 문제 풀기</button>
        </div>
      ) : q ? (
        <>
          <QuestionView q={q} ttsRate={settings.tts_rate} onAnswer={answer} disabled={!!feedback} chosen={chosen} />
          {feedback && (
            <div className={`feedback ${ok ? 'ok' : feedback.res.outcome === 'near_miss' ? 'near' : 'bad'}`}>
              <div className="fb-title">{LABEL[feedback.res.outcome]}</div>
              {!ok && <div className="fb-answer">정답: <b>{feedback.res.expected}</b></div>}
              <div className="fb-exp">{feedback.explanation}</div>
              <div className="fb-ex">
                <button className="icon-btn sm" onClick={() => speak(primary.en, settings.tts_rate)} aria-label="예문 듣기">🔊</button>
                <span>{highlight(primary.en, primary.blank)}</span>
              </div>
              <button className="primary block" onClick={() => advanceRef.current()}>다음 (Enter)</button>
            </div>
          )}
        </>
      ) : (
        <div className="page center"><p>문제를 찾을 수 없어요 ({format})</p><button onClick={advance}>건너뛰기</button></div>
      )}
    </div>
  );
}
