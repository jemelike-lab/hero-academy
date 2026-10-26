// Ms. Humphrey's voice. ElevenLabs via /api/humphrey/tts with a browser
// speechSynthesis fallback. One utterance at a time; a new say() stops the
// previous one. Resolves when playback ends or on the safety timeout.
const SAFETY_MS = 35000;

type Listener = (speaking: boolean) => void;
const listeners = new Set<Listener>();
let current: { audio?: HTMLAudioElement; resolve?: () => void } | null = null;
let muted = false;

export function onSpeaking(fn: Listener) { listeners.add(fn); return () => { listeners.delete(fn); }; }
function emit(v: boolean) { listeners.forEach((l) => l(v)); }

export function setMuted(v: boolean) { muted = v; if (v) stop(); }
export function isMuted() { return muted; }

export function stop() {
  if (current?.audio) { try { current.audio.pause(); } catch { /* noop */ } }
  try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
  const r = current?.resolve; current = null; emit(false); r?.();
}

async function viaElevenLabs(text: string): Promise<boolean> {
  const r = await fetch('/api/humphrey/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  if (!r.ok) return false;
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  await new Promise<void>((resolve) => {
    current = { audio, resolve };
    audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
    audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
    audio.play().catch(() => resolve());
  });
  return true;
}

function viaBrowser(text: string): Promise<void> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.92; u.pitch = 1.05;
    current = { resolve };
    u.onend = () => resolve(); u.onerror = () => resolve();
    synth.speak(u);
  });
}

export async function say(text: string): Promise<void> {
  const t = String(text || '').trim();
  if (!t || muted) return;
  stop();
  emit(true);
  let done = false;
  const safety = new Promise<void>((res) => setTimeout(() => { if (!done) { stop(); res(); } }, SAFETY_MS));
  const play = (async () => {
    try { if (await viaElevenLabs(t)) return; } catch { /* fall through */ }
    await viaBrowser(t);
  })();
  await Promise.race([play, safety]);
  done = true; current = null; emit(false);
}

export function pause(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }
