// 채점·단계 전이·학습일 계산 자가 테스트. 실행: npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { grade, worst } from '../src/engine/grader';
import { addDays, studyDate } from '../src/engine/dates';
import { newProgress, planToday, transition } from '../src/engine/scheduler';
import { DEFAULT_SETTINGS } from '../src/engine/storage';
import type { Dataset, Question, StudyPolicy } from '../src/engine/types';

const policy: StudyPolicy = JSON.parse(fs.readFileSync('public/data/study_policies.json', 'utf8'))[0];
const S = DEFAULT_SETTINGS;
const now = new Date();

// --- 학습일: 서울 03:59 → 전날, 04:00 → 당일
assert.equal(studyDate(new Date('2026-11-24T18:59:00Z'), 'Asia/Seoul', 4), '2026-11-24'); // KST 11-25 03:59
assert.equal(studyDate(new Date('2026-11-24T19:00:00Z'), 'Asia/Seoul', 4), '2026-11-25'); // KST 11-25 04:00
assert.equal(addDays('2026-12-31', 1), '2027-01-01');

// --- 채점
const spell: Question = { id: 1, format: 'spell_nohint', answer_type: 'exact_text', prompt: { time_limit_ms: 8000 }, answer_key: { accepted: ['reduce'], allow_typo: 1 }, difficulty: 1, status: 'approved', version: 1 };
assert.equal(grade(spell, { text: ' Reduce ', responseMs: 3000 }).outcome, 'correct');
assert.equal(grade(spell, { text: 'reduse', responseMs: 3000 }).outcome, 'near_miss');
assert.equal(grade(spell, { text: 'remove', responseMs: 3000 }).outcome, 'wrong');
assert.equal(grade(spell, { text: 'reduce', responseMs: 9000 }).outcome, 'slow_correct');
const short: Question = { ...spell, answer_key: { accepted: ['go'], allow_typo: 1 } };
assert.equal(grade(short, { text: 'do', responseMs: 1000 }).outcome, 'wrong');
const mc: Question = { ...spell, format: 'mc_en_ko', answer_type: 'choice', prompt: { choices: { A: 'x', B: 'y' }, time_limit_ms: 8000 }, answer_key: { correct: ['B'] } };
assert.equal(grade(mc, { choice: 'B', responseMs: 100 }).outcome, 'correct');
assert.equal(grade(mc, { choice: 'A', responseMs: 100 }).outcome, 'wrong');
assert.equal(worst(['correct', 'ungraded', 'slow_correct']), 'slow_correct');
assert.equal(worst(['ungraded']), 'correct');

// --- 단계 전이: 전부 정답이면 0→1→…→6→mastered, 누적 간격 1+3+7+14+30+60
let day = '2026-11-24';
let p = newProgress(1, policy, day);
const dues: string[] = [];
for (let i = 0; i < 7; i++) {
  p = transition(p, 'correct', policy, S, day, now);
  dues.push(p.due_date ?? 'null');
  if (p.due_date) day = p.due_date;
}
assert.deepEqual(dues, ['2026-11-25', '2026-11-28', '2026-12-05', '2026-12-19', '2027-01-18', '2027-03-19', 'null']);
assert.equal(p.state.card_state, 'mastered');

// 오답: stage 4 → on_wrong 2, lapse +1 / 3번 틀리면 난적
let q = { ...newProgress(2, policy, day), state: { ...newProgress(2, policy, day).state, stage: 4, card_state: 'review' as const } };
q = transition(q, 'wrong', policy, S, day, now);
assert.equal(q.state.stage, 2); assert.equal(q.state.lapse_count, 1);
q = transition(q, 'wrong', policy, S, day, now);
q = transition(q, 'wrong', policy, S, day, now);
assert.equal(q.state.is_leech, true);
// stage 0 오답은 lapse 없음, 오늘 다시
let r = transition(newProgress(3, policy, day), 'wrong', policy, S, day, now);
assert.equal(r.state.stage, 0); assert.equal(r.due_date, day); assert.equal(r.state.lapse_count, 0);
// near_miss stage 3 → 2
r = { ...r, state: { ...r.state, stage: 3 } };
assert.equal(transition(r, 'near_miss', policy, S, day, now).state.stage, 2);

// --- 오늘 계획: 신규 한도, 밀린 복습 중단
const ds = {
  policies: [policy],
  collectionItems: Array.from({ length: 30 }, (_, i) => ({ collection_id: 1, item_id: i + 1, position: i + 1 })),
} as unknown as Dataset;
assert.equal(planToday(ds, {}, S, day).news.length, 12);
const many: Record<number, any> = {};
for (let i = 1; i <= 100; i++) many[1000 + i] = { ...newProgress(1000 + i, policy, '2026-01-01'), due_date: '2026-01-02' };
const plan = planToday(ds, many, S, day);
assert.equal(plan.news.length, 0); assert.equal(plan.reviews.length, 80);

console.log('selftest OK');
