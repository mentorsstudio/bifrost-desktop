// A voz do « OK Bifrost »: MP3 da ElevenLabs quando vem, senão a voz do sistema
// no idioma da resposta, senão a nativa (speech-dispatcher/espeak) via Rust.

import { FlowBridge } from "../core/flow";

export interface Say { id: number; text: string; lang: string | null; audio: string | null; gender: "female" | "male" }

const FEMALE = /(female|woman|zira|hortense|julie|denise|aria|jenny|samantha|amelie|eloise|francisca|maria|luciana)/i;
const MALE = /(male|man\b|david|paul|guy|henri|claude|mark|thomas|antonio|daniel)/i;

export interface VoiceLike { name: string; lang: string }

/** Escolhe a voz: idioma exato primeiro, depois o mesmo idioma-base; o gênero pedido quando há. */
export function pickVoice<V extends VoiceLike>(voices: readonly V[], lang: string | null, gender: string, fallbackLang: string): V | null {
  const want = (lang ?? fallbackLang).toLowerCase();
  const base = want.split(/[-_]/)[0];
  const norm = (v: V) => v.lang.toLowerCase();
  const exact = voices.filter((v) => norm(v) === want);
  const sameBase = voices.filter((v) => norm(v) !== want && norm(v).split(/[-_]/)[0] === base);
  const pool = [...exact, ...sameBase];
  const match = pool.find((v) => (gender === "male" ? MALE.test(v.name) && !FEMALE.test(v.name) : FEMALE.test(v.name)));
  return match ?? pool[0] ?? null;
}

async function voicesReady(synth: SpeechSynthesis): Promise<void> {
  if (synth.getVoices().length) return;
  await new Promise<void>((r) => { synth.addEventListener("voiceschanged", () => r(), { once: true }); setTimeout(r, 600); });
}

async function speakSystem(text: string, lang: string | null, gender: string): Promise<void> {
  const synth = window.speechSynthesis;
  if (synth) await voicesReady(synth);
  if (!synth || !synth.getVoices().length) { await FlowBridge.sayNative(text, lang); return; }
  await new Promise<void>((done) => {
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(synth.getVoices(), lang, gender, navigator.language);
    if (v) u.voice = v;
    u.lang = v?.lang ?? lang ?? navigator.language;
    u.onend = u.onerror = () => done();
    synth.cancel();
    synth.speak(u);
  });
}

async function playMp3(b64: string): Promise<boolean> {
  try {
    const a = new Audio(`data:audio/mpeg;base64,${b64}`);
    await a.play();
    await new Promise<void>((done) => { a.onended = a.onerror = () => done(); });
    return true;
  } catch { return false; }
}

/** Fala e avisa o Rust ao terminar; `onSpeaking` liga/desliga a onda das barras. */
export async function speak(s: Say, onSpeaking: (on: boolean) => void): Promise<void> {
  onSpeaking(true);
  try {
    const ok = s.audio ? await playMp3(s.audio) : false;
    if (!ok) await speakSystem(s.text, s.lang, s.gender);
  } finally {
    onSpeaking(false);
    void FlowBridge.voiceDone(s.id);
  }
}
