// content/vocab_raw.json (단어 원본) → public/data/*.json (서비스 스키마 구조)
// 실행: npm run data
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const RAW = path.join(ROOT, 'content', 'vocab_raw.json');
const OUT = path.join(ROOT, 'public', 'data');

const raw = JSON.parse(fs.readFileSync(RAW, 'utf8'));
const errors = [];
const err = (w, msg) => errors.push(`[Day ${w.day}] ${w.word}: ${msg}`);

// ---------- 출제 형태 (stage_test 시드와 동일) ----------
const FORMATS = [
  'mc_en_ko', 'mc_ko_en', 'listen_pick', 'spell_hint', 'cloze_typed',
  'spell_nohint', 'cloze_fresh', 'speak_read', 'speak_sentence',
];
const TIME_LIMIT = 8000;

const POLICY = {
  id: 1,
  name: 'vocab_srs_v1',
  policy_type: 'srs_stage',
  params: {
    // interval = 직전 성공 복습일로부터 간격(일). stage 6 통과 → mastered
    stages: [
      { stage: 0, label: '당일',             interval: 0,  on_wrong: 0, on_near_miss: 0, tests: ['mc_en_ko', 'mc_ko_en'] },
      { stage: 1, label: '+1일',             interval: 1,  on_wrong: 1, on_near_miss: 1, tests: ['mc_en_ko', 'listen_pick'] },
      { stage: 2, label: '+3일',             interval: 3,  on_wrong: 1, on_near_miss: 1, tests: ['spell_hint'] },
      { stage: 3, label: '+7일',             interval: 7,  on_wrong: 1, on_near_miss: 2, tests: ['cloze_typed'] },
      { stage: 4, label: '+14일',            interval: 14, on_wrong: 2, on_near_miss: 3, tests: ['spell_nohint', 'speak_read'] },
      { stage: 5, label: '+30일(습득 시험)', interval: 30, on_wrong: 3, on_near_miss: 4, tests: ['cloze_fresh', 'speak_sentence'] },
      { stage: 6, label: '+60일(생존 확인)', interval: 60, on_wrong: 4, on_near_miss: 5, tests: ['cloze_fresh'] },
    ],
    slow_ms: TIME_LIMIT,
    leech_threshold: 3,
  },
};

// ---------- 유틸 ----------
function hash(str) {
  let h = 2166136261;
  for (const c of str) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let s = seed || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}
function shuffled(arr, seed) {
  const r = rng(seed); const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const words = (s) => s.trim().split(/\s+/).length;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 문장에서 blank를 찾아 "____"로 바꾸고 실제 표면형을 돌려준다
function makeCloze(sentence, blank) {
  const re = new RegExp(`(?<![A-Za-z'])${esc(blank)}(?![A-Za-z])`, 'i');
  const m = sentence.match(re);
  if (!m) return null;
  return { text: sentence.replace(re, '____'), surface: m[0] };
}
function choiceSet(answer, distractors, seed) {
  const opts = shuffled([answer, ...distractors], seed);
  const keys = ['A', 'B', 'C', 'D'];
  const choices = {}; let correct = '';
  opts.forEach((o, i) => { choices[keys[i]] = o; if (o === answer) correct = keys[i]; });
  return { choices, correct };
}

// ---------- 검증 ----------
const POS = new Set(['verb', 'noun', 'adjective', 'adverb', 'preposition', 'conjunction', 'phrasal verb', 'pronoun', 'determiner', 'interjection']);
const seen = new Set();
for (const w of raw) {
  for (const k of ['day', 'word', 'pos', 'meaning_ko', 'topic', 'collocation', 'collocation_ko', 'example_en', 'example_ko', 'example_blank', 'fresh_en', 'fresh_ko', 'fresh_blank', 'tip_ko']) {
    if (w[k] === undefined || w[k] === '') err(w, `missing ${k}`);
  }
  if (!POS.has(w.pos)) err(w, `bad pos ${w.pos}`);
  const key = String(w.word).toLowerCase();
  if (seen.has(key)) err(w, 'duplicate word'); seen.add(key);
  for (const [k, b] of [['example_en', 'example_blank'], ['fresh_en', 'fresh_blank']]) {
    if (!w[k]) continue;
    const n = words(w[k]);
    if (n < 6 || n > 16) err(w, `${k} has ${n} words`);
    if (!makeCloze(w[k], w[b] ?? '')) err(w, `${b} "${w[b]}" not found in ${k}`);
  }
  if (w.example_en && w.fresh_en && w.example_en.trim() === w.fresh_en.trim()) err(w, 'fresh == example');
  for (const k of ['distractors_ko', 'distractors_en']) {
    const d = w[k];
    if (!Array.isArray(d) || d.length !== 3) { err(w, `${k} must have 3`); continue; }
    const ans = k === 'distractors_ko' ? w.meaning_ko : w.word;
    if (new Set(d.map((x) => x.toLowerCase())).size !== 3) err(w, `${k} duplicated`);
    if (d.some((x) => x.trim().toLowerCase() === String(ans).toLowerCase())) err(w, `${k} contains answer`);
  }
}
if (errors.length) {
  console.error(`검증 실패 ${errors.length}건\n` + errors.slice(0, 60).join('\n'));
  process.exit(1);
}

// ---------- 변환 ----------
const sorted = [...raw].sort((a, b) => a.day - b.day);
const posInDay = {};
const items = [], questions = [], questionItems = [], explanations = [], collections = [], collectionItems = [];

sorted.forEach((w, idx) => {
  const itemId = idx + 1;
  posInDay[w.day] = (posInDay[w.day] ?? 0) + 1;
  const cz1 = makeCloze(w.example_en, w.example_blank);
  const cz2 = makeCloze(w.fresh_en, w.fresh_blank);

  items.push({
    id: itemId,
    item_type: 'vocab',
    title: w.word,
    note: {
      pos: w.pos,
      meaning_ko: w.meaning_ko,
      collocation: w.collocation,
      collocation_ko: w.collocation_ko,
      examples: [
        { role: 'primary', en: w.example_en, ko: w.example_ko, blank: cz1.surface },
        { role: 'fresh', en: w.fresh_en, ko: w.fresh_ko, blank: cz2.surface },
      ],
      tip_ko: w.tip_ko,
      category: w.category ?? 'basic',
      level: w.level ?? 1,
      topic: w.topic,
    },
  });
  collectionItems.push({ collection_id: w.day, item_id: itemId, position: posInDay[w.day] });

  const seed = hash(w.word);
  const enKo = choiceSet(w.meaning_ko, w.distractors_ko, seed);
  const koEn = choiceSet(w.word, w.distractors_en, seed + 1);
  const listen = choiceSet(w.word, w.distractors_en, seed + 2);
  const exact = (accepted) => ({ accepted: [accepted], case_sensitive: false, allow_typo: 1 });
  const hintOf = (s) => s[0];
  // 철자 힌트 모양: 첫 글자 + 나머지 글자는 _ (공백·하이픈은 그대로) 예) wake up → w___ __
  const patternOf = (s) => s[0] + s.slice(1).replace(/[A-Za-z]/g, '_');

  const defs = {
    mc_en_ko:       ['choice',     { stem: w.word, pos: w.pos, choices: enKo.choices, time_limit_ms: TIME_LIMIT }, { correct: [enKo.correct] }],
    mc_ko_en:       ['choice',     { stem: w.meaning_ko, pos: w.pos, choices: koEn.choices, time_limit_ms: TIME_LIMIT }, { correct: [koEn.correct] }],
    listen_pick:    ['choice',     { tts_text: w.word, choices: listen.choices, time_limit_ms: TIME_LIMIT }, { correct: [listen.correct] }],
    spell_hint:     ['exact_text', { stem: w.meaning_ko, pos: w.pos, hint: hintOf(w.word), pattern: patternOf(w.word), time_limit_ms: TIME_LIMIT }, exact(w.word)],
    cloze_typed:    ['exact_text', { sentence: cz1.text, sentence_ko: w.example_ko, hint: hintOf(cz1.surface), time_limit_ms: TIME_LIMIT }, exact(cz1.surface)],
    spell_nohint:   ['exact_text', { stem: w.meaning_ko, pos: w.pos, time_limit_ms: TIME_LIMIT }, exact(w.word)],
    cloze_fresh:    ['exact_text', { sentence: cz2.text, sentence_ko: w.fresh_ko, hint: hintOf(cz2.surface), time_limit_ms: TIME_LIMIT }, exact(cz2.surface)],
    speak_read:     ['ungraded',   { text: w.collocation, text_ko: w.collocation_ko, target: w.word }, {}],
    speak_sentence: ['ungraded',   { word: w.word, meaning_ko: w.meaning_ko, model: w.example_en, instruction: `'${w.word}'를 넣어 나에 대한 문장 하나를 말해 보세요.` }, {}],
  };

  FORMATS.forEach((fmt, fi) => {
    const qid = itemId * 10 + (fi + 1);
    const [answer_type, prompt, answer_key] = defs[fmt];
    questions.push({ id: qid, format: fmt, answer_type, prompt, answer_key, difficulty: 1, status: 'approved', version: 1 });
    questionItems.push({ question_id: qid, item_id: itemId, role: 'tests' });
    if (answer_type !== 'ungraded') {
      explanations.push({
        id: qid, question_id: qid, kind: 'summary', target: null,
        body: `${w.word} (${w.pos}) = ${w.meaning_ko}. ${w.tip_ko}`,
        reveal_when: 'after_attempt',
      });
    }
  });
});

const days = [...new Set(sorted.map((w) => w.day))].sort((a, b) => a - b);
for (const d of days) {
  const topics = [...new Set(sorted.filter((w) => w.day === d).map((w) => w.topic))].slice(0, 3);
  collections.push({ id: d, type: 'day_pack', day_no: d, title: `Day ${d}`, topics });
}

fs.mkdirSync(OUT, { recursive: true });
const write = (name, data) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(data));
write('items.json', items);
write('questions.json', questions);
write('question_items.json', questionItems);
write('explanations.json', explanations);
write('study_policies.json', [POLICY]);
write('collections.json', collections);
write('collection_items.json', collectionItems);
write('meta.json', {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  counts: { items: items.length, questions: questions.length, explanations: explanations.length, days: days.length },
});
console.log(`OK items=${items.length} questions=${questions.length} explanations=${explanations.length} days=${days.length}`);
