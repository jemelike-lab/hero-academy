/**
 * Hero Academy — Ms. Humphrey
 * The teacher-in-residence. Ubiquitously summonable from any game/zone.
 *
 *   HeroAcademy.Humphrey.say('correct-answer', { streak: 3, kidName: 'Nigel' });
 *
 * Phase 2 v0.1 — May 30, 2026
 *   - Base portrait + corner widget + speech bubble
 *   - Event catalog with variant phrasings (randomized, non-repeating)
 *   - Expression slot system (graceful fallback to base when art is missing)
 *   - Audio: pre-rendered MP3 → ElevenLabs TTS (Vercel proxy) → Web Speech API → silent (text-only)
 *   - Queue (1 utterance at a time, FIFO)
 *   - Mute state persists in localStorage
 *
 * ElevenLabs voice:
 *   - Voice: Emory — Warm, Smooth and Friendly (voice_id: aNGh7D6DrhhIlad2U6Fg)
 *   - Model: eleven_flash_v2_5
 *   - TTS proxy: /api/humphrey/tts (Vercel serverless, holds API key server-side)
 *   - Set ELEVENLABS_API_KEY env var on Vercel to enable real voice
 */
(function () {
  'use strict';

  const VERSION = '0.1.0';
  const NS = (window.HeroAcademy = window.HeroAcademy || {});
  if (NS.Humphrey) {
    console.warn('[Humphrey] Already loaded, skipping.');
    return;
  }

  // --- Configuration -------------------------------------------------------

  const DEFAULTS = {
    position: 'bottom-right',          // bottom-right | bottom-left | top-right | top-left
    audioEnabled: true,
    enabled: true,
    minDurationMs: 2400,
    msPerCharacter: 55,                // ~16wpm reading speed for a 7yo
    maxDurationMs: 12000,
    assetBase: '/assets/humphrey/',
    ttsEndpoint: '/api/humphrey/tts',    // Vercel serverless → ElevenLabs TTS
    fallbackToWebSpeech: true,
    debug: false,
  };

  const STORAGE_KEY = 'ha_humphrey_v1';

  // --- Event catalog -------------------------------------------------------
  //
  // Each entry: { expression, lines: [variant phrasings], audio?: optional }
  // Tokens in lines: {kidName}, {streak}, {topic}, {character}, {percent}, {zone}
  //
  // Variants get randomized non-repeating per event so she doesn't loop.
  // Keep lines short — kid is 7, this is a sidebar not a lecture.

  const CATALOG = {
    'welcome': {
      expression: 'smile',
      lines: [
        "Hi {kidName}! Ready to learn something new today?",
        "There you are, {kidName}! Let's get started.",
        "Welcome back, {kidName}! I missed you.",
      ],
    },
    'goodbye': {
      expression: 'smile',
      lines: [
        "Great work today, {kidName}. See you tomorrow!",
        "You did wonderfully. Until next time!",
        "Bye for now, {kidName}. Be proud of yourself!",
      ],
    },
    'zone-enter': {
      expression: 'encouraging',
      lines: [
        "Welcome to {zone}! Let's see what's waiting for us.",
        "Oh, {zone}! One of my favorites.",
        "Here we are at {zone}. Time to explore.",
      ],
    },
    'zone-locked': {
      expression: 'concerned',
      lines: [
        "That one's still locked. Let's keep practicing the others first!",
        "Not quite ready for that one yet. Soon!",
      ],
    },
    'level-start': {
      expression: 'encouraging',
      lines: [
        "Okay {kidName}, today we're working on {topic}. You've got this.",
        "Let's practice {topic}. Take your time.",
        "Ready? Today's lesson: {topic}. Deep breath.",
      ],
    },
    'correct-answer': {
      expression: 'cheering',
      lines: [
        "Yes! Exactly right!",
        "Beautiful work, {kidName}!",
        "That's it. You're getting this.",
        "Nice thinking!",
        "Perfect!",
      ],
    },
    'wrong-answer': {
      expression: 'encouraging',
      lines: [
        "Not quite — but good try. Let's look again.",
        "Close! Let's slow down and try one more time.",
        "That's a fair guess. Want another go?",
        "Almost. Take another look — you'll see it.",
      ],
    },
    'streak-3': {
      expression: 'cheering',
      lines: [
        "Three in a row! You're on fire!",
        "Look at you — three right in a row!",
      ],
    },
    'streak-5': {
      expression: 'cheering',
      lines: [
        "Five in a row, {kidName}! Wow!",
        "Five! That's a real streak now.",
      ],
    },
    'streak-10': {
      expression: 'surprised',
      lines: [
        "TEN in a row?! {kidName}, you're amazing!",
        "Ten in a row! I'm so proud of you.",
      ],
    },
    'milestone-reached': {
      expression: 'cheering',
      lines: [
        "That's a milestone, {kidName}! Look at that progress.",
        "You just hit a milestone. Pause and feel good about that.",
      ],
    },
    'mastery-achieved': {
      expression: 'cheering',
      lines: [
        "You've mastered {topic}! That's a big deal.",
        "{topic} — mastered! On to the next one when you're ready.",
        "I'm putting {topic} in the 'you got it' pile. Excellent.",
      ],
    },
    'character-unlocked': {
      expression: 'surprised',
      lines: [
        "Oh! Look who showed up — {character}!",
        "{character} just joined the Squad! Go say hi in Hero Hall.",
        "A new friend! {character} wants to meet you.",
      ],
    },
    'idle-too-long': {
      expression: 'encouraging',
      lines: [
        "Hey {kidName} — still with me?",
        "Take your time. I'm here whenever you're ready.",
        "Need a quick break? That's okay.",
      ],
    },
    'try-again': {
      expression: 'encouraging',
      lines: [
        "Want to try that one again? No rush.",
        "Let's give it another shot.",
        "One more try — I believe in you.",
      ],
    },
    'time-for-break': {
      expression: 'smile',
      lines: [
        "You've worked hard. Let's take a break.",
        "Good time for water and a stretch.",
      ],
    },
    'week-summary': {
      expression: 'smile',
      lines: [
        "What a week, {kidName}! Let me tell you what I noticed.",
      ],
    },
    // Fallback used if an unknown event is fired
    '_default': {
      expression: 'idle',
      lines: ["Hmm, let me think about that one."],
    },
  };

  // --- State ---------------------------------------------------------------

  const state = {
    cfg: { ...DEFAULTS },
    mounted: false,
    speaking: false,
    queue: [],
    lastVariantByEvent: {},
    currentAudio: null,
    currentExpression: 'idle',
    persisted: loadPersisted(),
    idleTimer: null,
    refs: { root: null, portrait: null, bubble: null, bubbleText: null, muteBtn: null },
    listeners: {},
  };

  function loadPersisted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { muted: false };
      return JSON.parse(raw);
    } catch { return { muted: false }; }
  }
  function savePersisted() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.persisted)); }
    catch { /* private mode etc. — non-fatal */ }
  }

  // --- DOM construction ----------------------------------------------------

  function mount() {
    if (state.mounted || !document.body) return;
    const cfg = state.cfg;

    const root = document.createElement('div');
    root.className = `ha-humphrey ha-humphrey--${cfg.position}`;
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-atomic', 'false');
    root.dataset.expression = 'idle';
    root.dataset.speaking = 'false';
    root.innerHTML = `
      <div class="ha-humphrey__bubble" role="status">
        <p class="ha-humphrey__text"></p>
      </div>
      <div class="ha-humphrey__portrait-wrap">
        <button class="ha-humphrey__portrait" type="button"
                aria-label="Tap Ms. Humphrey to hear her again">
          <picture>
            <source type="image/webp"
                    srcset="${cfg.assetBase}humphrey_base_256.webp 1x,
                            ${cfg.assetBase}humphrey_base_512.webp 2x">
            <img src="${cfg.assetBase}humphrey_base_256.png"
                 srcset="${cfg.assetBase}humphrey_base_256.png 1x,
                         ${cfg.assetBase}humphrey_base_512.png 2x"
                 alt="Ms. Humphrey, your teacher"
                 class="ha-humphrey__img"
                 decoding="async">
          </picture>
        </button>
        <button class="ha-humphrey__mute" type="button"
                aria-label="Mute Ms. Humphrey's voice"
                title="Mute voice">
          <span class="ha-humphrey__mute-icon" aria-hidden="true"></span>
        </button>
      </div>
    `;
    document.body.appendChild(root);

    // Cache refs
    state.refs.root = root;
    state.refs.portrait = root.querySelector('.ha-humphrey__portrait');
    state.refs.bubble = root.querySelector('.ha-humphrey__bubble');
    state.refs.bubbleText = root.querySelector('.ha-humphrey__text');
    state.refs.muteBtn = root.querySelector('.ha-humphrey__mute');

    // Wire up controls
    state.refs.portrait.addEventListener('click', onPortraitClick);
    state.refs.muteBtn.addEventListener('click', toggleMute);

    // Reflect initial mute state
    reflectMuteState();

    state.mounted = true;
    emit('mounted');
    debug('Mounted. Position:', cfg.position);
  }

  function unmount() {
    if (!state.mounted) return;
    state.refs.root?.remove();
    state.refs = { root: null, portrait: null, bubble: null, bubbleText: null, muteBtn: null };
    state.mounted = false;
    stopAudio();
    emit('unmounted');
  }

  // --- Public API ----------------------------------------------------------

  /**
   * Trigger Ms. Humphrey to say something.
   *
   * @param {string} event       Key from CATALOG (or arbitrary if you pass options.text)
   * @param {object} [context]   Token substitutions + overrides
   *   context.text         — bypass catalog, use this exact text
   *   context.expression   — force expression
   *   context.audioUrl     — explicit audio file to play
   *   context.duration     — explicit display duration (ms)
   *   context.priority     — 'normal' | 'high'. High clears queue.
   *   context.kidName etc. — token substitutions
   * @returns {Promise<{event, text, expression}>} resolves when she's done speaking
   */
  function say(event, context = {}) {
    if (!state.cfg.enabled) return Promise.resolve({ skipped: 'disabled' });

    const utterance = resolveUtterance(event, context);
    debug('say()', event, '→', utterance.text);

    if (context.priority === 'high') {
      state.queue = [];
      stopAudio();
      state.speaking = false;
    }

    return new Promise((resolve) => {
      utterance._resolve = resolve;
      state.queue.push(utterance);
      pump();
    });
  }

  function show() { if (state.refs.root) state.refs.root.hidden = false; }
  function hide() { if (state.refs.root) state.refs.root.hidden = true; }
  function isMuted() { return !!state.persisted.muted; }

  function toggleMute() {
    state.persisted.muted = !state.persisted.muted;
    savePersisted();
    reflectMuteState();
    if (state.persisted.muted) stopAudio();
    emit('mute-changed', { muted: state.persisted.muted });
  }

  function setExpression(expr) {
    if (!state.refs.root) return;
    state.currentExpression = expr;
    state.refs.root.dataset.expression = expr;
    // If an expression-specific image exists, swap. Otherwise stays on base.
    const img = state.refs.root.querySelector('.ha-humphrey__img');
    if (!img) return;
    const candidate = `${state.cfg.assetBase}humphrey_${expr}_512.png`;
    // Probe without disrupting the displayed base if it doesn't exist
    const probe = new Image();
    probe.onload = () => { img.src = candidate; };
    probe.onerror = () => { /* keep base; expression art not yet generated */ };
    probe.src = candidate;
  }

  function configure(partial) {
    state.cfg = { ...state.cfg, ...partial };
    debug('configure', state.cfg);
  }

  function on(eventName, fn) {
    (state.listeners[eventName] = state.listeners[eventName] || []).push(fn);
    return () => off(eventName, fn);
  }
  function off(eventName, fn) {
    const arr = state.listeners[eventName];
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  }
  function emit(eventName, payload) {
    (state.listeners[eventName] || []).forEach((fn) => {
      try { fn(payload); } catch (e) { console.error('[Humphrey] listener error', e); }
    });
  }

  function startIdleWatcher(thresholdMs = 45000, event = 'idle-too-long') {
    stopIdleWatcher();
    const reset = () => {
      clearTimeout(state.idleTimer);
      state.idleTimer = setTimeout(() => say(event), thresholdMs);
    };
    state._idleResetFn = reset;
    ['pointerdown', 'keydown', 'touchstart'].forEach((evt) =>
      window.addEventListener(evt, reset, { passive: true })
    );
    reset();
  }
  function stopIdleWatcher() {
    if (state._idleResetFn) {
      clearTimeout(state.idleTimer);
      ['pointerdown', 'keydown', 'touchstart'].forEach((evt) =>
        window.removeEventListener(evt, state._idleResetFn)
      );
      state._idleResetFn = null;
    }
  }

  // --- Utterance resolution -----------------------------------------------

  function resolveUtterance(event, context) {
    const entry = CATALOG[event] || CATALOG['_default'];
    const lineIdx = pickVariantIndex(event, entry.lines.length);
    const rawLine = context.text || entry.lines[lineIdx];
    const text = interpolate(rawLine, context);
    return {
      event,
      text,
      expression: context.expression || entry.expression || 'idle',
      audioUrl: context.audioUrl || resolveAudioUrl(event, lineIdx),
      duration: context.duration || computeDuration(text),
      context,
    };
  }

  function pickVariantIndex(event, count) {
    if (count <= 1) return 0;
    let idx;
    let tries = 0;
    do {
      idx = Math.floor(Math.random() * count);
      tries++;
    } while (idx === state.lastVariantByEvent[event] && tries < 4);
    state.lastVariantByEvent[event] = idx;
    return idx;
  }

  function interpolate(template, ctx) {
    return template.replace(/\{(\w+)\}/g, (_, key) => {
      if (key in ctx) return String(ctx[key]);
      // sensible defaults so missing context doesn't leak {tokens}
      if (key === 'kidName') return 'friend';
      if (key === 'topic') return 'this';
      if (key === 'zone') return 'this place';
      if (key === 'character') return 'a new friend';
      return '';
    });
  }

  function computeDuration(text) {
    const c = state.cfg;
    return Math.min(c.maxDurationMs, Math.max(c.minDurationMs, text.length * c.msPerCharacter));
  }

  function resolveAudioUrl(event, variantIdx) {
    // Convention: /assets/humphrey/audio/{event}-{variantIdx+1}.mp3
    // If the file doesn't exist, the audio chain falls through to Web Speech.
    return `${state.cfg.assetBase}audio/${event}-${String(variantIdx + 1).padStart(2, '0')}.mp3`;
  }

  // --- Speaking pipeline ---------------------------------------------------

  function pump() {
    if (state.speaking || state.queue.length === 0 || !state.mounted) return;
    const utterance = state.queue.shift();
    state.speaking = true;
    speak(utterance).then(() => {
      state.speaking = false;
      utterance._resolve?.({
        event: utterance.event,
        text: utterance.text,
        expression: utterance.expression,
      });
      emit('finished-speaking', utterance);
      pump();
    });
  }

  function speak(utterance) {
    return new Promise((resolve) => {
      setExpression(utterance.expression);
      showBubble(utterance.text);
      state.refs.root.dataset.speaking = 'true';
      emit('started-speaking', utterance);

      const finish = () => {
        hideBubble();
        state.refs.root.dataset.speaking = 'false';
        setExpression('idle');
        resolve();
      };

      const displayTimer = setTimeout(finish, utterance.duration);

      if (!state.cfg.audioEnabled || isMuted()) return;

      playAudio(utterance).then((played) => {
        if (!played) return;        // text-only display already running
        // If audio finishes earlier than display duration, leave the bubble up.
        // If audio runs longer, extend display until audio ends.
      }).catch(() => { /* ignore — fallthrough silent */ });
    });
  }

  function showBubble(text) {
    state.refs.bubbleText.textContent = text;
    state.refs.bubble.dataset.visible = 'true';
  }
  function hideBubble() {
    state.refs.bubble.dataset.visible = 'false';
  }

  /** Audio chain: pre-rendered MP3 → ElevenLabs TTS → Web Speech API → silent */
  function playAudio(utterance) {
    return tryPrerendered(utterance.audioUrl).then((played) => {
      if (played) return true;
      return tryTTS(utterance.text);
    }).then((played) => {
      if (played) return true;
      if (state.cfg.fallbackToWebSpeech) return tryWebSpeech(utterance.text);
      return false;
    });
  }

  function tryPrerendered(url) {
    return new Promise((resolve) => {
      if (!url) return resolve(false);
      const audio = new Audio();
      let settled = false;
      const succeed = () => { if (!settled) { settled = true; resolve(true); } };
      const fail = () => { if (!settled) { settled = true; resolve(false); } };
      audio.addEventListener('canplaythrough', () => {
        succeed();
        stopAudio();
        state.currentAudio = audio;
        audio.play().catch(fail);
      }, { once: true });
      audio.addEventListener('error', fail, { once: true });
      // 1.5s timeout — if file not cached / 404, fall back fast
      setTimeout(fail, 1500);
      audio.src = url;
      audio.load();
    });
  }

  /** Hit the Vercel TTS proxy (POST text → ElevenLabs → audio/mpeg) */
  function tryTTS(text) {
    const endpoint = state.cfg.ttsEndpoint;
    if (!endpoint || !text) return Promise.resolve(false);
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
      .then((resp) => {
        if (!resp.ok) throw new Error('TTS ' + resp.status);
        return resp.blob();
      })
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        return new Promise((resolve) => {
          const audio = new Audio();
          audio.addEventListener('canplaythrough', () => {
            stopAudio();
            state.currentAudio = audio;
            audio.play().then(() => resolve(true)).catch(() => resolve(false));
          }, { once: true });
          audio.addEventListener('error', () => resolve(false), { once: true });
          audio.src = blobUrl;
          audio.load();
        });
      })
      .catch((err) => {
        debug('tryTTS failed:', err);
        return false;
      });
  }

  function tryWebSpeech(text) {
    return new Promise((resolve) => {
      if (typeof window.speechSynthesis === 'undefined') return resolve(false);
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 0.95;
        u.pitch = 1.05;
        // Prefer a female voice if available
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v => /female|samantha|karen|tessa|moira|priya|veena|raveena/i.test(v.name))
                       || voices.find(v => /en-/.test(v.lang) && /female/i.test(v.name))
                       || voices.find(v => /en-/.test(v.lang));
        if (preferred) u.voice = preferred;
        u.onend = () => resolve(true);
        u.onerror = () => resolve(false);
        state.currentAudio = { stop: () => window.speechSynthesis.cancel() };
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      } catch {
        resolve(false);
      }
    });
  }

  function stopAudio() {
    if (state.currentAudio) {
      try {
        if (typeof state.currentAudio.pause === 'function') state.currentAudio.pause();
        if (typeof state.currentAudio.stop === 'function') state.currentAudio.stop();
      } catch { /* noop */ }
      state.currentAudio = null;
    }
    try { window.speechSynthesis?.cancel?.(); } catch { /* noop */ }
  }

  // --- UI handlers ---------------------------------------------------------

  function onPortraitClick() {
    // Tapping her replays the last line or fires a friendly default
    const last = state.lastSpoken;
    if (last && !state.speaking) {
      say(last.event, { ...last.context, text: last.text });
    } else if (!state.speaking) {
      say('idle-too-long');
    }
  }

  function reflectMuteState() {
    if (!state.refs.root) return;
    state.refs.root.dataset.muted = String(!!state.persisted.muted);
    state.refs.muteBtn.setAttribute(
      'aria-label',
      state.persisted.muted ? "Unmute Ms. Humphrey's voice" : "Mute Ms. Humphrey's voice"
    );
  }

  // Track last spoken so the tap-to-replay works
  on('started-speaking', (u) => { state.lastSpoken = u; });

  // --- Bootstrap -----------------------------------------------------------

  function init(opts = {}) {
    configure(opts);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }

  function debug(...args) { if (state.cfg.debug) console.log('[Humphrey]', ...args); }

  // Public surface
  NS.Humphrey = {
    VERSION,
    init,
    say,
    show,
    hide,
    toggleMute,
    isMuted,
    setExpression,
    configure,
    startIdleWatcher,
    stopIdleWatcher,
    on,
    off,
    unmount,
    // Inspection helpers (handy in devtools)
    _state: state,
    _catalog: CATALOG,
  };

  // Auto-init if data-attribute opts in. Otherwise the host page calls init().
  if (document.currentScript?.dataset.autoInit === 'true') {
    init();
  }
})();
