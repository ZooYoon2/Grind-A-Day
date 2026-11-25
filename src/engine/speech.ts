// 브라우저 음성 합성(TTS)·인식(STT). 음성 파일 없이 동작.

export function speak(text: string, rate = 0.9) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = rate;
    const voice = synth.getVoices().find((v) => v.lang === 'en-US') ?? synth.getVoices().find((v) => v.lang.startsWith('en'));
    if (voice) u.voice = voice;
    synth.speak(u);
  } catch {
    /* TTS 미지원 */
  }
}

export const canListen = (): boolean =>
  typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

export function listenOnce(onResult: (text: string) => void, onEnd: () => void): () => void {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) { onEnd(); return () => {}; }
  const rec = new SR();
  rec.lang = 'en-US';
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.onresult = (e: any) => {
    const text = Array.from(e.results).map((r: any) => r[0].transcript).join(' ');
    onResult(text);
  };
  rec.onend = onEnd;
  rec.onerror = onEnd;
  rec.start();
  return () => { try { rec.stop(); } catch { /* noop */ } };
}
