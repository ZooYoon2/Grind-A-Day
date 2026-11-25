// Grader: answer_type별 채점 (서버로 옮길 때 그대로 재사용할 순수 함수)
import type { Outcome, Question } from './types';

export interface GradeInput { choice?: string; text?: string; responseMs: number }
export interface GradeResult { outcome: Outcome; score: number | null; expected: string }

export function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').replace(/[.!?,]+$/, '');
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

export function grade(q: Question, input: GradeInput): GradeResult {
  const limit: number | undefined = q.prompt.time_limit_ms;
  const timed = (ok: Outcome): Outcome => (ok === 'correct' && limit && input.responseMs > limit ? 'slow_correct' : ok);

  if (q.answer_type === 'ungraded') return { outcome: 'ungraded', score: null, expected: '' };

  if (q.answer_type === 'choice') {
    const correct: string[] = q.answer_key.correct;
    const expected = correct.map((k) => q.prompt.choices[k]).join(', ');
    const ok = input.choice !== undefined && correct.includes(input.choice);
    const outcome = ok ? timed('correct') : 'wrong';
    return { outcome, score: ok ? 1 : 0, expected };
  }

  // exact_text
  const accepted: string[] = q.answer_key.accepted;
  const allowTypo: number = q.answer_key.allow_typo ?? 0;
  const given = normalize(input.text ?? '');
  const expected = accepted[0];
  if (!given) return { outcome: 'wrong', score: 0, expected };
  if (accepted.some((a) => normalize(a) === given)) {
    const outcome = timed('correct');
    return { outcome, score: 1, expected };
  }
  // 1글자 오타 = near_miss (단, 3글자 이하 단어는 오타 허용 안 함)
  const near = accepted.some((a) => normalize(a).length > 3 && levenshtein(normalize(a), given) <= allowTypo);
  return { outcome: near ? 'near_miss' : 'wrong', score: near ? 0.5 : 0, expected };
}

const RANK: Record<Outcome, number> = { correct: 0, ungraded: 0, slow_correct: 1, near_miss: 2, wrong: 3 };

/** 한 단계 안 여러 시험 결과 중 가장 나쁜 것 */
export function worst(outcomes: Outcome[]): Outcome {
  const graded = outcomes.filter((o) => o !== 'ungraded');
  if (!graded.length) return 'correct';
  return graded.reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
}
