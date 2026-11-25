import type { Item } from '../engine/types';
import { speak } from '../engine/speech';

/** 새 단어 소개 카드 + 단어장 상세에서 공통 사용 */
export function WordCard({ item, ttsRate, showFresh = false }: { item: Item; ttsRate: number; showFresh?: boolean }) {
  const n = item.note;
  const ex = n.examples.find((e) => e.role === 'primary')!;
  const fresh = n.examples.find((e) => e.role === 'fresh');
  return (
    <div className="word-card">
      <div className="wc-head">
        <span className="wc-word">{item.title}</span>
        <button className="icon-btn" onClick={() => speak(item.title, ttsRate)} aria-label="발음 듣기">🔊</button>
        <span className="pos">{n.pos}</span>
      </div>
      <div className="wc-meaning">{n.meaning_ko}</div>
      <div className="wc-row">
        <span className="label">연어</span>
        <span>{n.collocation} <span className="muted">· {n.collocation_ko}</span></span>
      </div>
      <div className="wc-ex">
        <button className="icon-btn sm" onClick={() => speak(ex.en, ttsRate)} aria-label="예문 듣기">🔊</button>
        <div>
          <div>{highlight(ex.en, ex.blank)}</div>
          <div className="muted">{ex.ko}</div>
        </div>
      </div>
      {showFresh && fresh && (
        <div className="wc-ex">
          <button className="icon-btn sm" onClick={() => speak(fresh.en, ttsRate)} aria-label="예문 듣기">🔊</button>
          <div>
            <div>{highlight(fresh.en, fresh.blank)}</div>
            <div className="muted">{fresh.ko}</div>
          </div>
        </div>
      )}
      {n.tip_ko && <div className="tip">💡 {n.tip_ko}</div>}
    </div>
  );
}

export function highlight(sentence: string, blank: string) {
  const i = sentence.toLowerCase().indexOf(blank.toLowerCase());
  if (i < 0) return sentence;
  return (
    <>
      {sentence.slice(0, i)}<mark>{sentence.slice(i, i + blank.length)}</mark>{sentence.slice(i + blank.length)}
    </>
  );
}
