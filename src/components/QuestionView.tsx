// Renderer: questions.format별 화면. 답을 받으면 onAnswer 호출.
import { useEffect, useRef, useState } from 'react';
import type { Question } from '../engine/types';
import { canListen, listenOnce, speak } from '../engine/speech';

export interface AnswerPayload { choice?: string; text?: string; transcript?: string; responseMs: number }

const TITLE: Record<string, string> = {
  mc_en_ko: '뜻을 고르세요',
  mc_ko_en: '영어 단어를 고르세요',
  listen_pick: '듣고 단어를 고르세요',
  spell_hint: '철자를 쓰세요 (첫 글자 힌트)',
  cloze_typed: '빈칸에 들어갈 말을 쓰세요',
  spell_nohint: '철자를 쓰세요',
  cloze_fresh: '새 문장의 빈칸을 채우세요',
  speak_read: '소리 내어 읽어 보세요',
  speak_sentence: '이 단어로 한 문장 말해 보세요',
};

export function QuestionView({ q, ttsRate, onAnswer, disabled, chosen }: {
  q: Question; ttsRate: number; disabled: boolean; onAnswer: (a: AnswerPayload) => void; chosen?: string;
}) {
  const started = useRef(performance.now());
  const [text, setText] = useState('');
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const stopRef = useRef<() => void>(() => {});
  const p = q.prompt;
  const elapsed = () => Math.round(performance.now() - started.current);

  useEffect(() => {
    started.current = performance.now();
    setText(''); setTranscript('');
    if (q.format === 'listen_pick') setTimeout(() => speak(p.tts_text, ttsRate), 250);
    setTimeout(() => inputRef.current?.focus(), 50);
    return () => stopRef.current();
  }, [q.id]);

  // 숫자키 1~4로 보기 선택
  useEffect(() => {
    if (q.answer_type !== 'choice' || disabled) return;
    const keys = Object.keys(p.choices);
    const h = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= keys.length) onAnswer({ choice: keys[n - 1], responseMs: elapsed() });
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [q.id, disabled]);

  const submitText = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (disabled || !text.trim()) return;
    onAnswer({ text, responseMs: elapsed() });
  };

  const record = () => {
    if (listening) { stopRef.current(); return; }
    setListening(true);
    stopRef.current = listenOnce((t) => setTranscript(t), () => setListening(false));
  };

  return (
    <div className="question">
      <div className="q-kind">{TITLE[q.format]}</div>

      {/* ---------- 문제 본문 ---------- */}
      {q.format === 'mc_en_ko' && (
        <div className="stem">
          <span className="stem-word">{p.stem}</span>
          <button className="icon-btn" onClick={() => speak(p.stem, ttsRate)} aria-label="발음 듣기">🔊</button>
          <div className="pos">{p.pos}</div>
        </div>
      )}
      {(q.format === 'mc_ko_en' || q.format === 'spell_hint' || q.format === 'spell_nohint') && (
        <div className="stem">
          <span className="stem-ko">{p.stem}</span>
          <div className="pos">{p.pos}</div>
          {q.format === 'spell_hint' && (
            <div className="hint">{p.pattern}</div>
          )}
        </div>
      )}
      {q.format === 'listen_pick' && (
        <div className="stem">
          <button className="listen-btn" onClick={() => speak(p.tts_text, ttsRate)}>🔊 다시 듣기</button>
        </div>
      )}
      {(q.format === 'cloze_typed' || q.format === 'cloze_fresh') && (
        <div className="stem cloze">
          <div className="sentence">{p.sentence}</div>
          <div className="sentence-ko">{p.sentence_ko}</div>
          {p.hint && <div className="hint-label">첫 글자 <span className="hint">{p.hint}</span></div>}
        </div>
      )}
      {q.format === 'speak_read' && (
        <div className="stem">
          <div className="speak-text">{p.text}</div>
          <div className="sentence-ko">{p.text_ko}</div>
          <button className="ghost" onClick={() => speak(p.text, ttsRate)}>🔊 원어민 발음</button>
        </div>
      )}
      {q.format === 'speak_sentence' && (
        <div className="stem">
          <div className="speak-text">{p.word} <span className="muted">· {p.meaning_ko}</span></div>
          <div className="sentence-ko">{p.instruction}</div>
          <details className="model"><summary>예시 문장 보기</summary>{p.model}</details>
        </div>
      )}

      {/* ---------- 답 입력 ---------- */}
      {q.answer_type === 'choice' && (
        <div className="choices">
          {Object.entries(p.choices as Record<string, string>).map(([k, v], i) => (
            <button key={k} disabled={disabled}
              className={`choice ${disabled && q.answer_key.correct?.includes(k) ? 'right' : ''} ${disabled && chosen === k && !q.answer_key.correct?.includes(k) ? 'picked-wrong' : ''}`}
              onClick={() => onAnswer({ choice: k, responseMs: elapsed() })}>
              <span className="key">{i + 1}</span>{v}
            </button>
          ))}
        </div>
      )}

      {q.answer_type === 'exact_text' && (
        <form className="type-form" onSubmit={submitText}>
          <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} disabled={disabled}
            autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false} placeholder="영어로 입력" />
          <button type="submit" className="primary" disabled={disabled || !text.trim()}>확인</button>
        </form>
      )}

      {q.answer_type === 'ungraded' && (
        <div className="speak-box">
          {canListen() && (
            <button className={listening ? 'danger' : 'ghost'} onClick={record} disabled={disabled}>
              {listening ? '■ 멈추기' : '🎙 말하고 인식해 보기'}
            </button>
          )}
          {transcript && <div className="transcript">“{transcript}”</div>}
          <button className="primary" disabled={disabled}
            onClick={() => { stopRef.current(); onAnswer({ transcript, responseMs: elapsed() }); }}>
            말했어요
          </button>
        </div>
      )}
    </div>
  );
}
