// 서비스 스키마(items / questions / explanations / study_policies / user_progress / attempts)와
// 같은 모양을 유지한다. 나중에 DB로 옮길 때 그대로 INSERT 할 수 있게.

export type Format =
  | 'mc_en_ko' | 'mc_ko_en' | 'listen_pick' | 'spell_hint' | 'cloze_typed'
  | 'spell_nohint' | 'cloze_fresh' | 'speak_read' | 'speak_sentence';

export type AnswerType = 'choice' | 'exact_text' | 'ungraded';
export type Outcome = 'correct' | 'slow_correct' | 'near_miss' | 'wrong' | 'ungraded';

export interface VocabNote {
  pos: string;
  meaning_ko: string;
  collocation: string;
  collocation_ko: string;
  examples: { role: 'primary' | 'fresh'; en: string; ko: string; blank: string }[];
  tip_ko: string;
  category: string;
  level: number;
  topic: string;
}

export interface Item { id: number; item_type: 'vocab'; title: string; note: VocabNote }

export interface Question {
  id: number;
  format: Format;
  answer_type: AnswerType;
  prompt: Record<string, any>;
  answer_key: Record<string, any>;
  difficulty: number;
  status: string;
  version: number;
}

export interface QuestionItem { question_id: number; item_id: number; role: string }
export interface Explanation { id: number; question_id: number; kind: string; target: string | null; body: string; reveal_when: string }

export interface StageDef {
  stage: number; label: string; interval: number;
  on_wrong: number; on_near_miss: number; tests: Format[];
}
export interface StudyPolicy {
  id: number; name: string; policy_type: 'srs_stage';
  params: { stages: StageDef[]; slow_ms: number; leech_threshold: number };
}
export interface Collection { id: number; type: string; day_no: number; title: string; topics: string[] }
export interface CollectionItem { collection_id: number; item_id: number; position: number }

export interface Dataset {
  items: Item[];
  questions: Question[];
  questionItems: QuestionItem[];
  explanations: Explanation[];
  policies: StudyPolicy[];
  collections: Collection[];
  collectionItems: CollectionItem[];
  meta: { schema_version: number; generated_at: string; counts: Record<string, number> };
}

// ---------- 사용자 데이터 (localStorage) ----------
export type CardState = 'learning' | 'review' | 'graduated' | 'mastered' | 'suspended';

export interface ProgressState {
  card_state: CardState;
  stage: number;
  introduced_on: string;
  last_reviewed_at: string | null;
  graduated_on: string | null;
  mastered_on: string | null;
  review_count: number;
  lapse_count: number;
  is_leech: boolean;
  mnemonic?: string;
}

/** = user_progress 행 */
export interface Progress {
  user_id: number;
  item_id: number;
  question_id: null;
  policy_id: number;
  status: 'active' | 'done' | 'suspended';
  due_date: string | null; // YYYY-MM-DD (학습일)
  state: ProgressState;
}

/** = attempts 행 */
export interface Attempt {
  id: number;
  user_id: number;
  question_id: number;
  session_id: number;
  grade_status: 'graded';
  outcome: Outcome;
  score: number | null;
  response: { text?: string; choice?: string; transcript?: string };
  grade_detail: { stage_before: number; stage_after: number | null; is_retry: boolean; study_date: string; target_word_hit?: boolean };
  response_ms: number;
  created_at: string;
}

/** = study_sessions 행 */
export interface Session {
  id: number; user_id: number; study_date: string;
  started_at: string; ended_at: string | null;
  new_count: number; review_count: number;
}

/** = user_settings 행 */
export interface Settings {
  timezone: string;
  day_start_hour: number;
  daily_new_limit: number;
  review_cap: number;
  backlog_stop: number;
  no_new_weekday: number | null; // 0=일요일
  leech_threshold: number;
  leech_daily_cap: number;
  tts_rate: number;
}
