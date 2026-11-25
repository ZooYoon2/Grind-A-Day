# 영단어 SRS (임시 웹)

정식 서비스 전에 한 달 동안 쓸 영단어 간격 반복 학습 사이트입니다.
서버 없이 **정적 JSON + 브라우저 localStorage**로 동작하고, 데이터 모양은 설계해 둔 서비스 스키마
(`items`, `questions`, `question_items`, `explanations`, `study_policies`, `user_progress`, `attempts`)와 같습니다.
그래서 나중에 DB로 옮길 때 파일을 거의 그대로 INSERT 할 수 있습니다.

- 1단계 기초 어휘 900개 (Day 1~30, 하루 30개)
- 단어당 문제 9개 = 총 8,100문제
- 하루 새 단어 12개, 복습 상한 80개 (설정에서 변경)

## 실행

```bash
npm install
npm run data     # content/vocab_raw.json → public/data/*.json 변환 + 검증
npm test         # 채점·단계 전이·학습일 계산 테스트
npm run dev      # http://localhost:5173
npm run build    # dist/ 생성
```

## GitHub Pages 배포

1. 이 폴더를 저장소로 push (`main` 브랜치)
2. 저장소 **Settings → Pages → Source**를 **GitHub Actions**로 설정
3. 이후 `main`에 push할 때마다 `.github/workflows/deploy.yml`이 변환 → 테스트 → 빌드 → 배포

`vite.config.ts`의 `base: './'` 덕분에 `https://<id>.github.io/<repo>/` 하위 경로에서도 그대로 동작합니다.

## 폴더 구조

```
content/vocab_raw.json      단어 원본 (사람이 고치는 유일한 파일)
scripts/build-data.mjs      원본 → 스키마 JSON 변환 + 검증 (출제 형태 9개를 여기서 생성)
scripts/selftest.ts         엔진 테스트
public/data/                변환 결과 (앱이 읽는 파일)
  items.json                = items            (단어 + 학습 노트: 뜻, 연어, 예문 2개, 팁)
  questions.json            = questions        (format, answer_type, prompt=공개, answer_key=정답)
  question_items.json       = question_items
  explanations.json         = explanations
  study_policies.json       = study_policies   (기존 stage_rule / stage_test 가 params 로)
  collections.json          = collections      (Day 묶음)
  collection_items.json     = collection_items
  meta.json                 생성 시각, 개수
src/engine/                 화면과 무관한 로직 (나중에 서버로 옮길 부분)
  grader.ts                 Grader: answer_type별 채점, 오타 1글자 = near_miss, 8초 초과 = slow_correct
  scheduler.ts              Scheduler: 단계 전이, 오늘 큐 (복습 상한, 신규 한도, 밀린 복습 중단, 난적 상한)
  dates.ts                  학습일 계산 (Asia/Seoul, 새벽 4시 전은 전날)
  storage.ts                localStorage (user_settings / user_progress / attempts / study_sessions)
  data.ts                   JSON 로드 + 인덱스
  speech.ts                 브라우저 TTS·음성 인식 (음성 파일 없음)
src/components/QuestionView.tsx   Renderer: format별 문제 화면
src/pages/                  홈, 학습, 단어장, 기록, 설정
```

## 단계와 출제 형태

| 단계 | 간격 | 시험 | 오답 시 | 오타 시 |
|---|---|---|---|---|
| 0 당일 | 0 | 영→한 선택, 한→영 선택 | 0 | 0 |
| 1 | +1일 | 영→한 선택, 듣고 고르기 | 1 | 1 |
| 2 | +3일 | 철자 (첫 글자 힌트) | 1 | 1 |
| 3 | +7일 | 예문 빈칸 | 1 | 2 |
| 4 | +14일 | 철자 (힌트 없음), 연어 소리 내어 읽기 | 2 | 3 |
| 5 | +30일 | 새 예문 빈칸, 한 문장 말하기 | 3 | 4 |
| 6 | +60일 | 새 예문 빈칸 → 통과 시 장기 기억 | 4 | 5 |

숫자를 바꾸려면 `scripts/build-data.mjs`의 `POLICY`를 고치고 `npm run data`.
한 단계에 시험이 여러 개면 가장 나쁜 결과로 판정합니다 (wrong > near_miss > slow_correct > correct). 말하기는 채점하지 않습니다.
세션 안에서 틀린 카드는 끝에 다시 나오지만(최대 2번) 단계는 바뀌지 않습니다.

## 단어 고치기 · 추가

`content/vocab_raw.json`의 항목을 고치고 `npm run data`를 실행하면 검증(예문 길이, 빈칸이 예문에 있는지, 오답 보기 중복·정답 포함 여부, 단어 중복)을 통과해야만 변환됩니다.

```json
{"day": 1, "word": "reserve", "pos": "verb", "meaning_ko": "예약하다", "topic": "restaurant",
 "category": "basic", "level": 1,
 "collocation": "reserve a table", "collocation_ko": "테이블을 예약하다",
 "example_en": "...", "example_ko": "...", "example_blank": "reserved",
 "fresh_en": "...", "fresh_ko": "...", "fresh_blank": "reserve",
 "distractors_ko": ["...", "...", "..."], "distractors_en": ["...", "...", "..."],
 "tip_ko": "..."}
```

> 주의: item id는 원본 순서(Day → 파일 순서)로 매겨지고 question id = item id × 10 + 형태 번호(1~9)입니다.
> 학습을 시작한 뒤에는 **중간에 단어를 끼워 넣거나 지우지 말고 맨 뒤에 추가**하세요. 순서가 바뀌면 기존 학습 기록이 다른 단어를 가리키게 됩니다.

## 학습 기록

기록은 그 브라우저의 localStorage에만 있습니다. **설정 → 백업 내보내기**로 JSON을 받아 두세요.
백업 파일의 `user_progress`, `attempts`, `study_sessions`, `user_settings`는 서비스 테이블과 같은 모양이라,
정식 서비스로 옮길 때 그대로 넣으면 됩니다 (`attempts.grade_detail`에 stage_before / stage_after / is_retry / study_date 포함).

## 정식 서비스로 옮길 때

- `public/data/*.json` → 같은 이름의 테이블로 INSERT (id 유지)
- `src/engine/grader.ts`, `scheduler.ts` → 서버 채점·스케줄 로직으로 이동 (순수 함수라 그대로 사용 가능)
- 지금은 `answer_key`가 정적 파일에 들어 있어 브라우저에서 보입니다. 서비스에서는 API가 `answer_key`를 내려주지 않고 서버에서 채점하세요.
