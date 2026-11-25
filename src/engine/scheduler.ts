// Scheduler (policy_type = 'srs_stage'): 단계 전이 + 오늘 큐 만들기
import { addDays, weekday } from './dates';
import type { Dataset, Format, Outcome, Progress, Settings, StudyPolicy } from './types';

export const USER_ID = 1;

export function newProgress(itemId: number, policy: StudyPolicy, today: string): Progress {
  return {
    user_id: USER_ID, item_id: itemId, question_id: null, policy_id: policy.id,
    status: 'active', due_date: today,
    state: {
      card_state: 'learning', stage: 0, introduced_on: today, last_reviewed_at: null,
      graduated_on: null, mastered_on: null, review_count: 0, lapse_count: 0, is_leech: false,
    },
  };
}

/** 한 단계의 시험을 모두 마친 뒤 1회 호출. 새 Progress를 돌려준다. */
export function transition(p: Progress, result: Outcome, policy: StudyPolicy, settings: Settings, today: string, now: Date): Progress {
  const stages = policy.params.stages;
  const s = p.state.stage;
  const rule = stages[s];
  const st = { ...p.state };
  let next: number;

  if (result === 'correct' || result === 'ungraded') next = s + 1;
  else if (result === 'slow_correct') next = s;
  else if (result === 'near_miss') next = rule.on_near_miss;
  else {
    next = rule.on_wrong;
    if (s >= 1) st.lapse_count += 1;
  }

  let due: string | null;
  let status: Progress['status'] = 'active';
  if (next > 6) {
    st.card_state = 'mastered'; st.mastered_on = today; due = null; status = 'done'; next = 6;
  } else if (next === 0) {
    st.card_state = 'learning'; due = today;
  } else if (next === 6) {
    st.card_state = 'graduated'; st.graduated_on = st.graduated_on ?? today; due = addDays(today, stages[6].interval);
  } else {
    st.card_state = 'review'; due = addDays(today, stages[next].interval);
  }
  // slow_correct로 같은 단계에 머무르면 그 단계 간격만큼 뒤에 다시 (stage 0은 다음 날)
  if (result === 'slow_correct' && next === s) due = addDays(today, Math.max(1, stages[s].interval));

  st.stage = next;
  if (st.lapse_count >= settings.leech_threshold) st.is_leech = true;
  st.review_count += 1;
  st.last_reviewed_at = now.toISOString();
  return { ...p, state: st, due_date: due, status };
}

export interface CardTask {
  itemId: number;
  isNew: boolean;
  stage: number;
  formats: Format[];
}

export interface TodayPlan {
  backlog: number;
  reviews: CardTask[];
  news: CardTask[];
  newBlockedReason: string | null;
  newIntroducedToday: number;
}

/** 오늘 큐: 핵심 쿼리 [A][B][C] + 규칙 3·5·11 */
export function planToday(ds: Dataset, progress: Record<number, Progress>, settings: Settings, today: string): TodayPlan {
  const policy = ds.policies[0];
  const active = Object.values(progress).filter((p) => p.status === 'active' && p.due_date !== null);

  // [A] 밀린 복습 수
  const due = active.filter((p) => p.due_date! <= today);
  const backlog = due.length;

  // [B] 복습 큐: 기한 오래된 순 → 낮은 단계 순, 상한 review_cap, 난적은 leech_daily_cap까지
  const sorted = [...due].sort((a, b) => (a.due_date! < b.due_date! ? -1 : a.due_date! > b.due_date! ? 1 : a.state.stage - b.state.stage));
  const reviews: CardTask[] = [];
  let leeches = 0;
  for (const p of sorted) {
    if (reviews.length >= settings.review_cap) break;
    if (p.state.is_leech) { if (leeches >= settings.leech_daily_cap) continue; leeches++; }
    reviews.push({ itemId: p.item_id, isNew: false, stage: p.state.stage, formats: policy.params.stages[p.state.stage].tests });
  }

  // [C] 신규 큐 (규칙 2, 5)
  const newIntroducedToday = Object.values(progress).filter((p) => p.state.introduced_on === today).length;
  let newBlockedReason: string | null = null;
  if (backlog >= settings.backlog_stop) newBlockedReason = `밀린 복습이 ${backlog}개라 오늘은 새 단어를 쉬어요`;
  else if (settings.no_new_weekday !== null && weekday(today) === settings.no_new_weekday) newBlockedReason = '오늘은 복습만 하는 날이에요';

  const news: CardTask[] = [];
  if (!newBlockedReason) {
    const room = Math.max(0, settings.daily_new_limit - newIntroducedToday);
    const order = [...ds.collectionItems].sort((a, b) => a.collection_id - b.collection_id || a.position - b.position);
    for (const ci of order) {
      if (news.length >= room) break;
      if (progress[ci.item_id]) continue;
      news.push({ itemId: ci.item_id, isNew: true, stage: 0, formats: policy.params.stages[0].tests });
    }
  }
  return { backlog, reviews, news, newBlockedReason, newIntroducedToday };
}
