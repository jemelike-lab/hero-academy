/**
 * Hero Academy — Ms. Humphrey Q&A button wiring.
 *
 * Single source of truth for what happens when the user taps the Ms. Humphrey
 * call button (#humphreyBtn). Wires the full Listen → STT → Claude Haiku → TTS
 * loop so she behaves like a real tutor, not a play-prerecorded-line button.
 *
 * Loaded on every page that exposes #humphreyBtn. Auto-wires on DOMContentLoaded.
 *
 * Public API on window.HeroAcademy.QnA:
 *   wireButton()                 -> idempotent; clones the button to drop any
 *                                   prior listeners, then attaches the Q&A handler
 *   setContextProvider(fn)       -> register a () => { activeProblem,
 *                                   activeProblemAnswer } supplier. Lesson pages
 *                                   register their own. Dashboard supplies {}.
 *
 * Dependencies: HeroAcademy.Humphrey (required), .Listener (required for Q&A),
 *               .Chat (required for Q&A). Falls back gracefully when missing.
 *
 * Debug: localStorage.ha_humphrey_debug = '1' enables console + on-screen panel
 * logs (the panel comes from humphrey.js v2).
 */
(function () {
  'use strict';
  var NS = window.HeroAcademy = window.HeroAcademy || {};

  var COOLDOWN_MS = 1200;
  var LISTEN_MAX_MS = 6000;

  var ctxProvider = function () { return {}; };
  var inFlight = false;
  var lastActivation = 0;

  function debugOn() {
    try { return localStorage.getItem('ha_humphrey_debug') === '1'; }
    catch (_) { return false; }
  }

  function debug() {
    if (!debugOn()) return;
    var args = ['[Humphrey QnA]'].concat([].slice.call(arguments));
    try { console.log.apply(console, args); } catch (_) {}
    // Piggyback on humphrey.js debug panel if present so we get tablet visibility
    try {
      var log = document.getElementById('ha-humphrey-debug-log');
      if (!log) return;
      var d = document.createElement('div');
      var t = new Date().toLocaleTimeString('en-US', { hour12: false }) + '.' +
              String(Date.now() % 1000).padStart(3, '0');
      d.textContent = t + ' [QnA] ' + args.slice(1).map(String).join(' ');
      log.appendChild(d);
      while (log.childNodes.length > 60) log.removeChild(log.firstChild);
      log.scrollTop = log.scrollHeight;
    } catch (_) {}
  }

  function setContextProvider(fn) {
    if (typeof fn === 'function') ctxProvider = fn;
  }

  function modules() {
    return {
      H: NS.Humphrey,
      L: NS.Listener,
      C: NS.Chat
    };
  }

  /**
   * Speak a one-off line with overridden text, reusing the 'try-again' catalog
   * event (encouraging expression). The text param wins over catalog text.
   */
  function speakLine(text) {
    var H = NS.Humphrey;
    if (!H || typeof H.say !== 'function') return Promise.resolve();
    return H.say('try-again', { kidName: 'Nigel', text: text });
  }

  function handleClick(btn) {
    if (inFlight) { debug('click ignored: in flight'); return; }
    var now = Date.now();
    if (now - lastActivation < COOLDOWN_MS) {
      debug('click ignored: cooldown', COOLDOWN_MS - (now - lastActivation), 'ms left');
      return;
    }
    lastActivation = now;
    inFlight = true;

    var m = modules();
    if (!m.H) {
      debug('Humphrey missing — abort');
      inFlight = false;
      return;
    }

    var hasListener = m.L && typeof m.L.listen === 'function';
    var hasChat     = m.C && typeof m.C.ask    === 'function';

    btn.classList.add('listening');

    // No mic + no Claude? Fall back to a friendly greeting line.
    if (!hasListener || !hasChat) {
      debug('listener=' + hasListener + ' chat=' + hasChat + ' — fallback line');
      btn.classList.remove('listening');
      btn.classList.add('speaking');
      speakLine('Hi Nigel — I am Ms. Humphrey. Ask me a question and I will answer.')
        .catch(function () {})
        .then(function () {
          setTimeout(function () {
            btn.classList.remove('speaking');
            inFlight = false;
          }, 300);
        });
      return;
    }

    runQnA(btn, m);
  }

  function runQnA(btn, m) {
    debug('mic-on — listening up to', LISTEN_MAX_MS, 'ms');
    m.L.listen({
      maxMs: LISTEN_MAX_MS,
      onStart: function () { debug('mic actually started'); },
      onStop:  function () { debug('mic stopped'); }
    }).then(function (rec) {
      btn.classList.remove('listening');
      debug('listen result: transcript=' + JSON.stringify((rec && rec.transcript) || '') +
            ' err=' + (rec && rec.error) +
            ' empty=' + (rec && rec.empty));

      if (rec && rec.error === 'no-mic') {
        btn.classList.add('speaking');
        return speakLine('I cannot hear yet, Nigel. Tap allow on the microphone and try me again.');
      }
      if (!rec || rec.error || rec.empty || !rec.transcript || !rec.transcript.trim()) {
        btn.classList.add('speaking');
        return speakLine('I did not catch that, Nigel. Tap my button and ask again.');
      }

      // We heard something. Hand it to Claude.
      var transcript = rec.transcript.trim();
      var ctx = {};
      try { ctx = ctxProvider() || {}; } catch (_) {}
      ctx.kidName = 'Nigel';
      ctx.grade   = '2nd grade';
      btn.classList.add('speaking'); // stays through the brief Claude wait + TTS
      debug('Claude ← ', transcript, 'ctx=', JSON.stringify(ctx));
      return m.C.ask(transcript, ctx).then(function (result) {
        debug('Claude → ', (result && result.answer) || '(no answer)',
              'redirected=', result && result.redirected,
              'err=', result && result.error);
        var answer = (result && result.answer) ||
          "Hmm — let me think about that one some more, Nigel. Try me again in a second.";
        return speakLine(answer);
      });
    }).catch(function (err) {
      debug('handler threw:', err && err.message);
      btn.classList.add('speaking');
      return speakLine('Something went sideways, Nigel. Try me again.').catch(function () {});
    }).then(function () {
      setTimeout(function () {
        btn.classList.remove('listening', 'speaking');
        inFlight = false;
      }, 300);
    });
  }

  function wireButton() {
    var btn = document.getElementById('humphreyBtn');
    if (!btn) { debug('no #humphreyBtn on this page'); return false; }
    if (btn.dataset.qnaWired === 'true') { debug('already wired — skipping'); return true; }
    // Clone the button to strip ANY prior listeners (e.g. inline handlers from
    // a previous deploy, or number-lab.js setupHumphrey). The clone preserves
    // markup + attributes, but loses addEventListener-attached handlers.
    var fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.dataset.qnaWired = 'true';
    fresh.addEventListener('click', function () { handleClick(fresh); });
    debug('wired (cloned to strip any prior listeners)');
    return true;
  }

  // Auto-wire as soon as the DOM is parsed
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireButton, { once: true });
  } else {
    wireButton();
  }

  NS.QnA = {
    wireButton: wireButton,
    setContextProvider: setContextProvider
  };
})();
