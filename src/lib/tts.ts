// Ms. Humphrey's voice: ElevenLabs via /api/humphrey/tts.
//
// iPad Safari only lets a media element play from code (after a fetch, a
// timer, an await) if that same element has already played inside a tap.
// So there is ONE audio element, primed with a silent clip on the first
// tap anywhere in the app (installAudioUnlock, called from main.tsx), and
// every line reuses it. Until that first tap, say() waits instead of
// failing silently; pages show <TapToStart> while audio is still locked.
// This restores what legacy humphrey.js did (v143/v144).
//
// The browser voice is only used by the hosted design preview, which has
// no API. Production stays on ElevenLabs only, as legacy v145 decided:
// each device's system voice sounded like Ms. Humphrey "switching".
import { useSyncExternalStore } from 'react';

const SAFETY_MS = 35000;
// 0.1 s of real silence. A zero-length WAV can leave play() pending forever.
const SILENCE = 'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';
const BROWSER_VOICE = !!import.meta.env.VITE_PREVIEW;

type Listener = (speaking: boolean) => void;
const listeners = new Set<Listener>();
let muted = false;

// Every say() and stop() bumps gen; async work that finds gen moved on is stale.
let gen = 0;
let finish: (() => void) | null = null;      // resolves the say() in flight
let cancelPlayback: (() => void) | null = null;
let el: HTMLAudioElement | null = null;

// ---- unlock state ----
let unlocked = false;
let priming = false;
let installed = false;
const unlockWaiters = new Set<() => void>();
const unlockSubs = new Set<() => void>();
const gestureHooks = new Set<() => void>();

function setUnlocked(v: boolean) {
  if (unlocked === v) return;
  unlocked = v;
  if (v) { unlockWaiters.forEach((w) => w()); unlockWaiters.clear(); }
  unlockSubs.forEach((s) => s());
}
function whenUnlocked(): Promise<void> {
  return unlocked ? Promise.resolve() : new Promise((r) => unlockWaiters.add(r));
}

/** Install once. Every tap primes audio (until it works) and runs gesture hooks (music resume). */
export function installAudioUnlock() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const onGesture = () => {
    gestureHooks.forEach((h) => { try { h(); } catch { /* noop */ } });
    if (unlocked || priming) return;
    priming = true;
    try {
      if (!el) { el = new Audio(); el.preload = 'auto'; el.setAttribute('playsinline', ''); }
      const a = el;
      a.muted = false; // a muted play would succeed without a gesture and prove nothing
      a.src = SILENCE;
      if (BROWSER_VOICE && window.speechSynthesis) {
        try { window.speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch { /* noop */ }
      }
      // Settle on whichever comes first: the play() promise, a 'playing'
      // event, or a 600 ms check. A stalled attempt must never block the
      // next tap from trying again.
      let settled = false;
      const settle = (good: boolean) => {
        if (settled) return; settled = true; priming = false;
        a.removeEventListener('playing', onPlaying);
        if (good) { try { a.pause(); } catch { /* noop */ } setUnlocked(true); }
      };
      const onPlaying = () => settle(true);
      a.addEventListener('playing', onPlaying);
      setTimeout(() => settle(!a.paused), 600);
      const p = a.play();
      if (p && typeof p.then === 'function') p.then(() => settle(true), () => settle(false));
      else settle(true);
    } catch { priming = false; }
  };
  // touchend/click are the events iOS treats as a real activation; pointerdown
  // and keydown cover desktop. capture so nothing can stopPropagation it away.
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach((e) =>
    window.addEventListener(e, onGesture, { capture: true, passive: true }));
}

export function isAudioUnlocked() { return unlocked; }
export function useAudioUnlocked() {
  return useSyncExternalStore(
    (cb) => { unlockSubs.add(cb); return () => { unlockSubs.delete(cb); }; },
    () => unlocked,
    () => false,
  );
}
/** Run fn on every tap (e.g. resume a WebAudio context the iPad suspended while asleep). */
export function onGesture(fn: () => void) { gestureHooks.add(fn); return () => { gestureHooks.delete(fn); }; }

// ---- speaking ----
export function onSpeaking(fn: Listener) { listeners.add(fn); return () => { listeners.delete(fn); }; }
function emit(v: boolean) { listeners.forEach((l) => l(v)); }

export function setMuted(v: boolean) { muted = v; if (v) stop(); }
export function isMuted() { return muted; }

export function stop() {
  gen++;
  if (el) { try { el.pause(); } catch { /* noop */ } }
  try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
  const c = cancelPlayback; cancelPlayback = null; c?.();
  const f = finish; finish = null; f?.();
  emit(false);
}

function playBlob(blob: Blob, my: number): Promise<'done' | 'blocked'> {
  return new Promise((resolve) => {
    if (gen !== my) return resolve('done');
    if (!el) { el = new Audio(); el.preload = 'auto'; }
    const a = el;
    const url = URL.createObjectURL(blob);
    let settled = false;
    const end = (r: 'done' | 'blocked') => {
      if (settled) return; settled = true;
      a.onended = null; a.onerror = null;
      if (cancelPlayback === cancel) cancelPlayback = null;
      try { URL.revokeObjectURL(url); } catch { /* noop */ }
      resolve(r);
    };
    const cancel = () => end('done');
    cancelPlayback = cancel;
    a.onended = () => end('done');
    a.onerror = () => end('done');
    a.muted = false;
    a.src = url;
    a.play().catch((err: unknown) => end((err as { name?: string })?.name === 'NotAllowedError' ? 'blocked' : 'done'));
  });
}

async function viaElevenLabs(text: string, my: number) {
  const r = await fetch('/api/humphrey/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  if (!r.ok) return;
  const blob = await r.blob();
  let result = await playBlob(blob, my);
  if (result === 'blocked' && gen === my) {
    // The iPad took the unlock back (rare: long sleep, audio route change).
    // Show the tap gate again and replay this line on the next tap.
    setUnlocked(false);
    await whenUnlocked();
    if (gen === my) result = await playBlob(blob, my);
  }
}

function viaBrowser(text: string, my: number): Promise<void> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth || gen !== my) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.92; u.pitch = 1.05;
    const prev = cancelPlayback;
    cancelPlayback = () => { prev?.(); resolve(); };
    u.onend = () => resolve(); u.onerror = () => resolve();
    synth.speak(u);
  });
}

/** Speak a line. Resolves when it finishes, is replaced by a newer line, or is stopped. */
export function say(text: string): Promise<void> {
  const t = String(text || '').trim();
  if (!t || muted) return Promise.resolve();
  stop();
  const my = ++gen;
  return new Promise<void>((resolve) => {
    let settled = false;
    const end = () => {
      if (settled) return; settled = true;
      if (finish === end) finish = null;
      if (gen === my) emit(false); // a superseded line must not clear the newer one's state
      resolve();
    };
    finish = end;
    void (async () => {
      await whenUnlocked();
      if (gen !== my) return; // stopped or replaced while waiting for the first tap
      emit(true);
      const safety = setTimeout(() => { if (gen === my) stop(); }, SAFETY_MS);
      try {
        if (BROWSER_VOICE) await viaBrowser(t, my);
        else await viaElevenLabs(t, my);
      } catch { /* a missed line is silent; the bubble still shows it */ }
      clearTimeout(safety);
      end();
    })();
  });
}

export function pause(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }
