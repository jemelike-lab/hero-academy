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
    skipPrerendered: true,             // pre-rendered MP3s don't exist yet; skip 1.5s wait
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
    'homework-assigned': {
      expression: 'encouraging',
      lines: [
        "Hi {kidName}! Today's homework is {topic}. You've got this!",
        "Ready for today's homework, {kidName}? Let's tackle {topic}.",
        "Homework time, {kidName}! We're working on {topic} today.",
      ],
    },
    'homework-done': {
      expression: 'cheering',
      lines: [
        "You did it, {kidName}! Today's homework is finished!",
        "All done, {kidName}! Great work on your homework!",
        "Homework complete, {kidName}! I'm so proud of you.",
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
    audioUnlocked: false,
    queue: [],
    lastVariantByEvent: {},
    currentAudio: null,
    audioEl: null,                     // single reusable <audio>; warmed in user gesture
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
    // Drain any items that were queued before mount finished (e.g. zone-enter
    // fired from the page's inline init script before DOMContentLoaded). Without
    // this, those items sit in queue forever and pop out on the user's first
    // post-mount say() — playing welcome audio over the first answer response.
    pump();
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
    if (state.currentExpression === expr) return; // no-op: skip jitter on auto-restore
    state.currentExpression = expr;
    state.refs.root.dataset.expression = expr;
    // If an expression-specific image exists, crossfade in. Otherwise keep current.
    const img = state.refs.root.querySelector('.ha-humphrey__img');
    if (!img) return;
    const candidate = `${state.cfg.assetBase}humphrey_${expr}_512.webp`;
    // Probe without disrupting the displayed image if it doesn't exist
    const probe = new Image();
    probe.onload = () => {
      // 200ms crossfade: fade out (100ms) -> swap src -> fade back in (100ms)
      img.style.opacity = '0';
      setTimeout(() => {
        img.src = candidate;
        // rAF lets the browser register opacity:0 before transitioning back
        requestAnimationFrame(() => { img.style.opacity = '1'; });
      }, 100);
    };
    probe.onerror = () => { /* keep current; expression art not yet generated */ };
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

      panelLog('speak gate: audioEnabled=' + state.cfg.audioEnabled +
               ' muted=' + isMuted() + ' unlocked=' + state.audioUnlocked);
      if (!state.cfg.audioEnabled || isMuted() || !state.audioUnlocked) {
        panelLog('SKIP audio (gate failed)');
        return;
      }

      playAudio(utterance).then((played) => {
        if (!played) { panelLog('audio chain returned false (silent fallthrough)'); return; }
        // If audio finishes earlier than display duration, leave the bubble up.
        // If audio runs longer, extend display until audio ends.
      }).catch((err) => { panelLog('playAudio threw: ' + (err && err.message)); });
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
    const prerendered = state.cfg.skipPrerendered
      ? Promise.resolve(false)
      : tryPrerendered(utterance.audioUrl);
    return prerendered.then((played) => {
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
    if (!endpoint || !text) { panelLog('TTS skip: no endpoint or text'); return Promise.resolve(false); }
    panelLog('TTS fetch "' + text.slice(0, 30) + '"');
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
      .then((resp) => {
        panelLog('TTS resp ' + resp.status + ' ct=' + resp.headers.get('content-type'));
        if (!resp.ok) throw new Error('TTS ' + resp.status);
        return resp.blob();
      })
      .then((blob) => {
        panelLog('TTS blob ' + blob.size + 'B');
        return new Promise((resolve) => {
          const blobUrl = URL.createObjectURL(blob);
          // CRITICAL: reuse the single audio element that was warmed during the
          // user gesture in setupAudioUnlock. Android Chrome's autoplay policy
          // tracks media-engagement per element; a brand-new <audio> created
          // here (off the gesture stack) gets silently rejected. The warmed
          // element carries its engagement forward across src changes.
          let audio = state.audioEl;
          if (!audio) {
            // Unlock never ran (programmatic say before any gesture). Best
            // effort: still try, but log loudly so we know this is happening.
            console.warn('[Humphrey] tryTTS: no warmed audioEl — first play may fail on mobile');
            panelLog('NO WARMED ELEM (gesture never fired before say) — making cold one');
            audio = new Audio();
            audio.preload = 'auto';
            state.audioEl = audio;
          }
          // Cancel any current playback on this element before swapping source
          try { audio.pause(); audio.currentTime = 0; } catch(e) {}
          // Reset listeners (avoid accumulation across reuse)
          audio.onended = () => { panelLog('TTS ended naturally'); try { URL.revokeObjectURL(blobUrl); } catch(e){} };
          audio.onerror = () => {
            const e = audio.error;
            console.error('[Humphrey] TTS audio element error:',
              e ? { code: e.code, message: e.message } : '(no detail)');
            panelLog('ELEM ERR ' + (e ? ('code=' + e.code + ' ' + e.message) : '(no detail)'));
            done(false);
          };
          state.currentAudio = audio;
          audio.volume = 1;
          audio.src = blobUrl;
          audio.load();  // commit src on Android Chrome before play()
          panelLog('audio.load called, calling play() — rs=' + audio.readyState);
          let settled = false;
          const done = (ok) => { if (settled) return; settled = true; resolve(ok); };
          const p = audio.play();
          if (p && typeof p.then === 'function') {
            p.then(() => {
              debug('TTS play started ok');
              panelLog('PLAY ✓ playing');
              done(true);
            }).catch((err) => {
              // LOUD: this is the failure mode that's been silent all along.
              console.error('[Humphrey] TTS play rejected:',
                err && err.name, err && err.message,
                '— audioUnlocked=', state.audioUnlocked,
                'audioElPrimed=', !!state.audioEl);
              panelLog('PLAY ✗ ' + (err && err.name) + ': ' + (err && err.message) +
                       ' unlocked=' + state.audioUnlocked + ' primed=' + !!state.audioEl);
              done(false);
            });
          } else {
            panelLog('play() returned no promise');
            done(true);
          }
          setTimeout(() => { if (!settled) panelLog('TTS timeout 8s'); done(false); }, 8000);
        });
      })
      .catch((err) => {
        console.error('[Humphrey] tryTTS failed:', err && err.message ? err.message : err);
        panelLog('TTS FETCH FAIL ' + (err && err.message ? err.message : err));
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
      document.addEventListener('DOMContentLoaded', () => { mount(); ensureDebugPanel(); panelLog('init: mounted'); }, { once: true });
    } else {
      mount();
      ensureDebugPanel();
      panelLog('init: mounted (immediate)');
    }
    setupAudioUnlock();
    panelLog('init: setupAudioUnlock done; waiting for gesture');
  }

  /**
   * Chrome/Safari autoplay policy requires audio.play() to be initiated
   * by a user gesture. Async chains (click → fetch TTS → play blob) break
   * the gesture link. Fix: on first user gesture, play a silent audio
   * synchronously to "unlock" the document. After that, async play() works.
   */
  function setupAudioUnlock() {
    const unlock = (ev) => {
      panelLog('gesture ' + (ev && ev.type) + ' (unlocked=' + state.audioUnlocked + ')');
      if (state.audioUnlocked) return;
      // SYNCHRONOUS gate: flip the flag immediately inside the gesture stack
      // so any speak() in the same click handler passes the check at line ~512.
      state.audioUnlocked = true;
      debug('audio unlocked (synchronous flag set in user gesture)');
      try {
        // Create ONE reusable <audio> element and warm it synchronously inside
        // this gesture. Android Chrome's autoplay policy is tracked per
        // HTMLMediaElement: once an element has been play()'d in-gesture, it
        // can be re-played later with a different src. We keep this element
        // and reuse it for every utterance in tryTTS. This is the fix for
        // "no sound on the tablet" — see HANDOFF.md Issue #1.
        if (!state.audioEl) {
          state.audioEl = new Audio();
          state.audioEl.preload = 'auto';
        }
        const a = state.audioEl;
        const TINY_SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
        a.volume = 0;
        a.src = TINY_SILENCE;
        a.load();
        const p = a.play();
        if (p && p.then) {
          p.then(() => {
            debug('audio unlock primer played ok — element warmed');
            panelLog('PRIMER ✓ element warmed');
            try { a.pause(); a.currentTime = 0; a.volume = 1; } catch (e) {}
          }).catch((err) => {
            console.warn('[Humphrey] audio unlock primer play rejected:',
              err && err.name, err && err.message,
              '— real TTS plays may still work; flag stays set');
            panelLog('PRIMER ✗ ' + (err && err.name) + ' ' + (err && err.message));
            try { a.volume = 1; } catch (e) {}
          });
        } else {
          panelLog('PRIMER: no promise (sync)');
          try { a.volume = 1; } catch (e) {}
        }
      } catch (e) {
        console.error('[Humphrey] audio unlock threw:', e);
        panelLog('UNLOCK THREW ' + (e && e.message));
      }
    };
    ['click', 'touchstart', 'touchend', 'keydown', 'pointerdown'].forEach((ev) => {
      document.addEventListener(ev, unlock, { once: false, capture: true, passive: true });
    });
  }

  // On-screen debug panel. Enabled when localStorage.ha_humphrey_debug === '1'.
  // Lets us diagnose audio failures on devices where we can't open devtools
  // (Android tablets without USB cable, locked-down kiosks, etc).
  function isDebugOn() {
    if (state.cfg.debug) return true;
    try { return localStorage.getItem('ha_humphrey_debug') === '1'; }
    catch (e) { return false; }
  }
  function ensureDebugPanel() {
    if (!isDebugOn()) return null;
    if (state.refs.debugPanel) return state.refs.debugPanel;
    const p = document.createElement('div');
    p.id = 'ha-humphrey-debug';
    p.style.cssText = [
      'position:fixed','top:0','left:0','right:0','z-index:2147483647',
      'background:rgba(0,0,0,0.92)','color:#0f0','font:11px/1.35 ui-monospace,Menlo,Consolas,monospace',
      'padding:6px 8px','max-height:50vh','overflow-y:auto','white-space:pre-wrap',
      'border-bottom:2px solid #0f0','pointer-events:auto'
    ].join(';');
    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;color:#fff;font-weight:bold;border-bottom:1px solid #0f0;padding-bottom:4px;margin-bottom:4px';
    hdr.innerHTML = '<span>Humphrey debug · tap to copy · long-press to clear</span><span id="ha-humphrey-debug-state" style="color:#0f0;font-weight:normal">…</span>';
    const log = document.createElement('div');
    log.id = 'ha-humphrey-debug-log';
    p.appendChild(hdr);
    p.appendChild(log);
    // Tap to copy entire log to clipboard
    let pressTimer = null;
    p.addEventListener('touchstart', () => {
      pressTimer = setTimeout(() => { log.innerHTML = ''; pressTimer = null; }, 800);
    }, { passive: true });
    p.addEventListener('touchend', () => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null;
        const txt = log.innerText;
        try { navigator.clipboard?.writeText(txt); } catch(e){}
        hdr.querySelector('#ha-humphrey-debug-state').textContent = 'COPIED ' + txt.length + 'B';
        setTimeout(() => refreshDebugState(), 1500);
      }
    });
    document.body.appendChild(p);
    state.refs.debugPanel = p;
    state.refs.debugLog = log;
    state.refs.debugState = hdr.querySelector('#ha-humphrey-debug-state');
    refreshDebugState();
    return p;
  }
  function refreshDebugState() {
    if (!state.refs.debugState) return;
    const a = state.audioEl;
    const parts = [
      'unlocked=' + state.audioUnlocked,
      'el=' + (a ? 'Y' : 'N'),
      a ? ('rs=' + a.readyState + ' p=' + a.paused) : '',
      'spk=' + state.speaking,
      'q=' + state.queue.length
    ].filter(Boolean);
    state.refs.debugState.textContent = parts.join(' ');
  }
  function panelLog(line) {
    if (!isDebugOn()) return;
    try {
      ensureDebugPanel();
      const log = state.refs.debugLog;
      if (!log) return;
      const t = new Date().toLocaleTimeString('en-US', { hour12: false }) + '.' +
                String(Date.now() % 1000).padStart(3, '0');
      const div = document.createElement('div');
      div.textContent = t + ' ' + line;
      log.appendChild(div);
      // Cap to last 60 lines
      while (log.childNodes.length > 60) log.removeChild(log.firstChild);
      log.scrollTop = log.scrollHeight;
      refreshDebugState();
    } catch (e) { /* don't let debug code break the page */ }
  }

  function debug(...args) {
    if (state.cfg.debug) { console.log('[Humphrey]', ...args); panelLog(args.map(String).join(' ')); return; }
    try {
      if (localStorage.getItem('ha_humphrey_debug') === '1') {
        console.log('[Humphrey]', ...args);
        panelLog(args.map(String).join(' '));
      }
    } catch (e) { /* private mode etc. */ }
  }

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
