/**
 * Hero Academy — Ms. Humphrey Q&A button wiring with multi-turn conversation
 * AND persistent memory (profile + rolling 7-day conversation summaries).
 *
 * On tap: opens a conversation. After her TTS reply, mic auto-re-opens.
 * On convo end: hands the transcript to Memory module which summarizes
 * server-side and stores the result so next time she remembers.
 *
 * Public API on window.HeroAcademy.QnA:
 *   wireButton()                 -> idempotent; clones the button first
 *   setContextProvider(fn)       -> () => { activeProblem, activeProblemAnswer }
 *   endConversation(reason?)     -> force-end (also triggers summarize)
 *
 * Dependencies: HeroAcademy.Humphrey (required), .Listener, .Chat, .Memory
 */
(function () {
  'use strict';
  var NS = window.HeroAcademy = window.HeroAcademy || {};

  var FIRST_LISTEN_MAX_MS    = 9000;
  var FOLLOWUP_LISTEN_MAX_MS = 8000;
  var COOLDOWN_MS            = 800;
  var CONVO_TIMEOUT_MS       = 60000;
  var MAX_HISTORY_MESSAGES   = 10;
  var POST_TTS_GAP_MS        = 350;

  var ctxProvider = function () { return {}; };
  var inFlight = false;
  var lastActivation = 0;

  var convo = {
    active: false,
    history: [],
    silentCount: 0,
    lastTurnAt: 0
  };

  function debugOn() {
    try { return localStorage.getItem('ha_humphrey_debug') === '1'; } catch (_) { return false; }
  }
  function debug() {
    if (!debugOn()) return;
    var args = ['[Humphrey QnA]'].concat([].slice.call(arguments));
    try { console.log.apply(console, args); } catch (_) {}
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

  function setContextProvider(fn) { if (typeof fn === 'function') ctxProvider = fn; }
  function modules() { return { H: NS.Humphrey, L: NS.Listener, C: NS.Chat, M: NS.Memory }; }

  /**
   * Sniff the current page so the chat API knows where Nigel is and what's
   * on his screen. Returns { zoneId, zoneLabel, pageTitle, visibleText } —
   * any field may be empty when we can't determine it.
   *
   * The zone is read from the body's `zone-<id>` class (or a `data-zone`
   * attribute if set). The visible text is read from the largest known
   * problem/card container — we pick whichever element is present so this
   * helper works in every zone without per-zone wiring.
   */
  function sniffPageContext() {
    if (typeof document === 'undefined') return null;
    var out = { zoneId: '', zoneLabel: '', pageTitle: '', visibleText: '' };

    // Zone id — body class `zone-<id>` (zone-discovery-dome, zone-number-lab, etc.)
    // The math/discovery pages reuse `zone-number-lab` as a CSS shim, so we ALSO
    // check pageTitle/url for disambiguation downstream.
    try {
      var body = document.body;
      if (body) {
        if (body.dataset && body.dataset.zone) out.zoneId = String(body.dataset.zone);
        if (!out.zoneId) {
          var m = (body.className || '').match(/zone-([a-z0-9\-]+)/);
          if (m) out.zoneId = m[1];
        }
      }
    } catch (_) {}

    // Disambiguate by URL when the body class is shared
    try {
      var path = (location.pathname || '').toLowerCase();
      if (/discovery-dome/.test(path))   out.zoneId = 'discovery-dome';
      else if (/word-tower/.test(path))  out.zoneId = 'word-tower';
      else if (/number-lab/.test(path))  out.zoneId = 'number-lab';
      else if (/cauldron-cafe/.test(path)) out.zoneId = 'cauldron-cafe';
      else if (/story-lab/.test(path))   out.zoneId = 'story-lab';
      else if (/story-time/.test(path))  out.zoneId = 'story-time';
      else if (/diner-lanes/.test(path)) out.zoneId = 'diner-lanes';
      else if (/explorer/.test(path))    out.zoneId = 'explorers-hall';
      else if (/hero-hall/.test(path))   out.zoneId = 'hero-hall';
      else if (/parent\b/.test(path))    out.zoneId = 'parent-dashboard';
      else if (/^\/?(index\.html)?$/.test(path)) out.zoneId = out.zoneId || 'home';
    } catch (_) {}

    // Human-friendly zone label
    var LABELS = {
      'discovery-dome': 'Discovery Dome (Science)',
      'word-tower': 'Word Tower (Reading & Spelling)',
      'number-lab': 'Number Lab (Math)',
      'cauldron-cafe': 'Cauldron Café (Math)',
      'story-lab': 'Story Lab (Reading Comprehension)',
      'story-time': 'Story Time (Read-Aloud)',
      'diner-lanes': 'Diner Lanes (Social Studies / Bowling)',
      'explorers-hall': "Explorer's Hall (Social Studies)",
      'hero-hall': 'Hero Hall (Trophy Room)',
      'parent-dashboard': 'Parent Co-pilot Dashboard',
      'home': 'Home Map'
    };
    out.zoneLabel = LABELS[out.zoneId] || '';

    // Page title
    try { out.pageTitle = String(document.title || '').replace(/\s+·\s+Hero Academy\s*$/i, '').trim(); } catch (_) {}

    // Visible text — try a sequence of likely containers, take the first that
    // has substantive text. Order matters: problem card first, then story
    // passage, then fact card. Cap to 800 chars so we don't blow the prompt.
    function readText(sel) {
      try {
        var el = document.querySelector(sel);
        if (!el) return '';
        if (el.hidden) return '';
        if (el.offsetParent === null && getComputedStyle(el).display === 'none') return '';
        var t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        return t;
      } catch (_) { return ''; }
    }
    var candidates = [
      '#problemQuestion',          // Number Lab, Discovery Dome (fact + question card)
      '#storyPassage',             // Story Lab / Story Time passages
      '.passage-text',
      '#wordDisplay',              // Word Tower current word
      '.problem-display',
      '#problemCard',
      '#dailyMissionCard',
      '#cardLabel'
    ];
    for (var i = 0; i < candidates.length; i++) {
      var t = readText(candidates[i]);
      if (t && t.length > 4) {
        out.visibleText = t.slice(0, 800);
        break;
      }
    }
    return out;
  }

  function speakLine(text) {
    var H = NS.Humphrey;
    if (!H || typeof H.say !== 'function') return Promise.resolve();
    return H.say('try-again', { kidName: 'Nigel', text: text });
  }

  // -----------------------------------------------------------------------
  // Mic-help panel — surfaced when getUserMedia fails. Audio TTS may not
  // play reliably in this state (the same gesture that would unlock audio
  // is also the one trying to grab the mic), so we put visible guidance on
  // the screen and Josh/Nigel can act on it without sound.
  // -----------------------------------------------------------------------
  function micHelpCopy(detail) {
    // Returns { heading, steps[], speech }. `speech` is the TTS line we'll
    // still try in case audio IS unlocked.
    var isStandalone = false;
    try {
      isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
        || (window.navigator && window.navigator.standalone === true);
    } catch (_) {}

    if (detail === 'denied-permanent') {
      return {
        heading: "I can't reach the microphone — it looks blocked.",
        steps: isStandalone
          ? [
              "Open Android Settings → Apps → Hero Academy → Permissions.",
              "Turn Microphone ON.",
              "Come back here and tap Ms. Humphrey again."
            ]
          : [
              "Tap the lock icon (🔒) next to the address bar in Chrome.",
              "Open Site settings → Microphone → set to Allow.",
              "Reload the page and tap Ms. Humphrey again."
            ],
        speech: "I cannot reach the microphone, Nigel. It looks blocked in your settings. Ask Daddy to turn it on."
      };
    }
    if (detail === 'denied-now') {
      return {
        heading: "I need permission to hear you.",
        steps: [
          "When Chrome asks if Hero Academy can use the microphone, tap Allow.",
          "Then tap Ms. Humphrey again."
        ],
        speech: "Please tap Allow when Chrome asks for the microphone, Nigel."
      };
    }
    if (detail === 'no-device') {
      return {
        heading: "I can't find a microphone on this device.",
        steps: [
          "Check that no other app is using the mic (close any call or recorder).",
          "If you're on a headset, make sure it's plugged in.",
          "Then tap Ms. Humphrey again."
        ],
        speech: "I cannot find a microphone, Nigel. Let's try again in a moment."
      };
    }
    if (detail === 'busy') {
      return {
        heading: "Something else is using the microphone right now.",
        steps: [
          "Close any other app that might be recording (calls, video, voice notes).",
          "Then tap Ms. Humphrey again."
        ],
        speech: "Another app is using the microphone. Let's try again in a moment."
      };
    }
    if (detail === 'unsupported') {
      return {
        heading: "This browser doesn't support microphone input.",
        steps: [
          "Open Hero Academy in Chrome.",
          "Or, if installed as an app, reinstall it from Chrome."
        ],
        speech: "This browser cannot hear me yet, Nigel."
      };
    }
    if (detail === 'security') {
      return {
        heading: "Microphone is blocked for security reasons.",
        steps: [
          "Make sure you're on the https:// version of Hero Academy.",
          "Tap the lock icon → Site settings → Microphone → Allow."
        ],
        speech: "I cannot use the microphone here, Nigel."
      };
    }
    return {
      heading: "I cannot hear yet.",
      steps: [
        "Tap the lock icon next to the address bar → Site settings → Microphone → Allow.",
        "If installed as an app: Android Settings → Apps → Hero Academy → Permissions → Microphone ON.",
        "Then tap Ms. Humphrey again."
      ],
      speech: "I cannot hear yet, Nigel. Tap allow on the microphone and try me again."
    };
  }

  function micHelpSpeechLine(detail) {
    return micHelpCopy(detail).speech;
  }

  function showMicHelp(detail) {
    if (typeof document === 'undefined') return;
    var copy = micHelpCopy(detail);
    var existing = document.getElementById('ha-mic-help');
    if (existing) { try { existing.parentNode.removeChild(existing); } catch (_) {} }

    var wrap = document.createElement('div');
    wrap.id = 'ha-mic-help';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', 'Microphone help');
    wrap.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99998',
      'background:rgba(13,18,38,0.72)',
      'display:flex', 'align-items:center', 'justify-content:center',
      'padding:20px', 'font-family:Fredoka,system-ui,sans-serif'
    ].join(';');

    var card = document.createElement('div');
    card.style.cssText = [
      'background:#fff', 'color:#1a1f3a',
      'border-radius:18px', 'padding:22px 22px 18px',
      'max-width:440px', 'width:100%',
      'box-shadow:0 24px 60px rgba(0,0,0,0.35)',
      'border:3px solid #ffd147'
    ].join(';');

    var h = document.createElement('div');
    h.style.cssText = 'font-size:1.15rem;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:8px;';
    h.innerHTML = '<span aria-hidden="true">🎤</span><span></span>';
    h.lastChild.textContent = copy.heading;
    card.appendChild(h);

    var ol = document.createElement('ol');
    ol.style.cssText = 'margin:6px 0 14px 22px;padding:0;font-size:0.98rem;line-height:1.45;';
    copy.steps.forEach(function (s) {
      var li = document.createElement('li');
      li.style.cssText = 'margin:4px 0;';
      li.textContent = s;
      ol.appendChild(li);
    });
    card.appendChild(ol);

    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;';

    var retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Try again';
    retry.style.cssText = [
      'background:#ec4899', 'color:#fff', 'border:0',
      'border-radius:10px', 'padding:10px 16px',
      'font-weight:700', 'font-size:0.98rem', 'cursor:pointer',
      'font-family:inherit'
    ].join(';');
    retry.addEventListener('click', function () {
      try { wrap.parentNode.removeChild(wrap); } catch (_) {}
      var b = document.getElementById('humphreyBtn');
      if (b) { try { b.click(); } catch (_) {} }
    });

    var close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    close.style.cssText = [
      'background:#eef0f7', 'color:#1a1f3a', 'border:0',
      'border-radius:10px', 'padding:10px 16px',
      'font-weight:600', 'font-size:0.98rem', 'cursor:pointer',
      'font-family:inherit'
    ].join(';');
    close.addEventListener('click', function () {
      try { wrap.parentNode.removeChild(wrap); } catch (_) {}
    });

    row.appendChild(close);
    row.appendChild(retry);
    card.appendChild(row);
    wrap.appendChild(card);

    // Tap-outside-to-close
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap) {
        try { wrap.parentNode.removeChild(wrap); } catch (_) {}
      }
    });

    document.body.appendChild(wrap);
    debug('mic help shown:', detail);
  }

  function isFarewell(transcript) {
    if (!transcript) return false;
    var t = String(transcript).toLowerCase().trim();
    return /\b(bye|goodbye|good ?bye|thank you|thanks|i'?m done|im done|that'?s all|nothing else|stop|nevermind|never mind|see you|cya|cool thanks|got it thanks|talk (?:to you )?(?:later|soon|tomorrow)|catch you later|take care|gotta go|gotta run|i gotta go)\b/.test(t);
  }

  /**
   * Did Ms. Humphrey just sign off? Conservative — only matches strong
   * conversation-closing language, not mid-explanation "let me know" types.
   * Triggers convo end so the mic doesn't re-open into awkward silence.
   */
  function humphreyIsSigningOff(text) {
    if (!text) return false;
    var t = String(text).toLowerCase();
    return /\b(talk to you (?:later|soon|tomorrow)|talk (?:later|soon)|see you (?:later|next time|soon|tomorrow)|until next time|until then|bye for now|good ?bye|catch you later|take care|have a (?:great|good|wonderful|nice) (?:day|afternoon|morning|evening|night|rest of your)|i'?ll see you (?:later|next time|soon|tomorrow)|sleep well|enjoy your (?:day|afternoon|evening))\b/.test(t);
  }
  function farewellLine() {
    var lines = [
      "Okay Nigel, tap me whenever you need me.",
      "Sounds good. I'll be right here if you have another question.",
      "All right then, talk to you in a bit.",
      "Got it. Holler when you need me, Nigel."
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }
  function silentSignoffLine() {
    var lines = [
      "I'll let you think. Tap me when you're ready.",
      "Take your time, Nigel. I'm here when you need me.",
      "Okay, I'll be right here if you have a question."
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  /**
   * End the current conversation. If it had real turns, hand the transcript to
   * the Memory module which will summarize and store it for future sessions.
   */
  function resetConversation(reason) {
    debug('convo reset:', reason, 'had', convo.history.length, 'msgs');
    var historyAtEnd = convo.history.slice();
    convo.active = false;
    convo.history = [];
    convo.silentCount = 0;
    convo.lastTurnAt = 0;
    // Fire-and-forget summarization. Memory module is tolerant of failures.
    try {
      var M = NS.Memory;
      if (M && typeof M.recordConversationEnd === 'function' && historyAtEnd.length >= 2) {
        M.recordConversationEnd(historyAtEnd);
      }
    } catch (_) {}
  }

  function endConversation(opts) {
    opts = opts || {};
    return Promise.resolve().then(function () { resetConversation(opts.reason || 'explicit'); });
  }

  function appendHistory(role, content) {
    if (!content) return;
    convo.history.push({ role: role, content: content });
    if (convo.history.length > MAX_HISTORY_MESSAGES) {
      convo.history = convo.history.slice(-MAX_HISTORY_MESSAGES);
    }
  }

  function setPhase(btn, phase) {
    btn.classList.remove('listening', 'speaking');
    if (phase) btn.classList.add(phase);
  }

  // -----------------------------------------------------------------------
  // Conversation turn
  // -----------------------------------------------------------------------

  function turn(btn, listenMaxMs) {
    var m = modules();
    if (!m.H || !m.L || !m.C) {
      debug('module missing during turn — abort');
      setPhase(btn, null);
      inFlight = false;
      resetConversation('module-missing');
      return;
    }

    setPhase(btn, 'listening');
    debug('listen start maxMs=' + listenMaxMs + ' history=' + convo.history.length);

    m.L.listen({
      maxMs: listenMaxMs,
      onStart: function () { debug('mic on'); },
      onStop:  function () { debug('mic off'); }
    }).then(function (rec) {
      var transcript = (rec && rec.transcript) ? String(rec.transcript).trim() : '';
      var err = rec && rec.error;
      var empty = !!(rec && rec.empty);
      debug('result transcript=' + JSON.stringify(transcript) + ' err=' + err + ' empty=' + empty);

      if (err === 'no-mic') {
        var micDetail = (rec && rec.detail) || '';
        debug('no-mic branch: detail=', micDetail);
        showMicHelp(micDetail);
        setPhase(btn, 'speaking');
        return speakLine(micHelpSpeechLine(micDetail))
          .then(function () {
            resetConversation('no-mic:' + micDetail);
            setPhase(btn, null);
            inFlight = false;
          });
      }
      if (err && err !== 'fetch-failed') {
        debug('listener errored:', err);
        setPhase(btn, 'speaking');
        return speakLine("Hmm, my ears glitched. Tap me and try again, Nigel.")
          .then(function () {
            resetConversation('listener-' + err);
            setPhase(btn, null);
            inFlight = false;
          });
      }

      if (!transcript || empty) {
        convo.silentCount += 1;
        debug('silence #' + convo.silentCount);
        if (convo.silentCount >= 2 || convo.history.length === 0) {
          setPhase(btn, 'speaking');
          return speakLine(silentSignoffLine())
            .then(function () {
              resetConversation('silence');
              setPhase(btn, null);
              inFlight = false;
            });
        }
        setPhase(btn, 'speaking');
        return speakLine("Still there, Nigel? Take your time.")
          .then(function () {
            convo.lastTurnAt = Date.now();
            setTimeout(function () {
              if (!convo.active) { setPhase(btn, null); inFlight = false; return; }
              turn(btn, FOLLOWUP_LISTEN_MAX_MS);
            }, POST_TTS_GAP_MS);
          });
      }

      convo.silentCount = 0;

      if (isFarewell(transcript)) {
        debug('farewell detected');
        appendHistory('user', transcript);  // keep it for the summary
        setPhase(btn, 'speaking');
        return speakLine(farewellLine())
          .then(function () {
            resetConversation('farewell');
            setPhase(btn, null);
            inFlight = false;
          });
      }

      // Build context with memory + active problem
      var ctx = {};
      try { ctx = ctxProvider() || {}; } catch (_) {}
      ctx.kidName = 'Nigel';
      ctx.grade = '2nd grade';
      ctx.history = convo.history.slice();

      // Page-awareness: sniff which zone Nigel is on AND what's currently on
      // his screen, so Humphrey can answer "what is this?" or "read this to
      // me" without guessing. The chat API treats these as advisory context;
      // activeProblem (from ctxProvider) still wins for math problem rules.
      try {
        var pc = sniffPageContext();
        if (pc) {
          if (pc.zoneId)      ctx.zoneId      = pc.zoneId;
          if (pc.zoneLabel)   ctx.zoneLabel   = pc.zoneLabel;
          if (pc.pageTitle)   ctx.pageTitle   = pc.pageTitle;
          if (pc.visibleText) ctx.visibleText = pc.visibleText;
        }
      } catch (_) {}

      // Attach profile + recentSummaries from Memory module if ready
      var memoryReady = m.M && typeof m.M.getContext === 'function'
        ? m.M.getContext()
        : Promise.resolve({ profile: null, recentSummaries: [] });

      appendHistory('user', transcript);

      setPhase(btn, 'speaking');
      debug('Claude ←', transcript, '(', convo.history.length, 'msgs in history)');

      return memoryReady.then(function (mem) {
        if (mem) {
          ctx.profile = mem.profile;
          ctx.recentSummaries = mem.recentSummaries;
          debug('memory attached: profile=' + !!mem.profile + ' summaries=' + (mem.recentSummaries ? mem.recentSummaries.length : 0));
        }
        return m.C.ask(transcript, ctx);
      }).then(function (result) {
        var answer = (result && result.answer) || "Hmm, let me think about that one some more.";
        debug('Claude →', answer.slice(0, 60), 'redirected=', result && result.redirected, 'err=', result && result.error);
        appendHistory('assistant', answer);
        convo.lastTurnAt = Date.now();

        return speakLine(answer).then(function () {
          if (!convo.active) {
            setPhase(btn, null);
            inFlight = false;
            return;
          }
          // If Ms. Humphrey just said a clear sign-off, end the conversation
          // gracefully — don't re-open the mic into awkward silence.
          if (humphreyIsSigningOff(answer)) {
            debug('humphrey signed off — ending convo, no re-listen');
            resetConversation('humphrey-farewell');
            setPhase(btn, null);
            inFlight = false;
            return;
          }
          setTimeout(function () {
            if (!convo.active) { setPhase(btn, null); inFlight = false; return; }
            turn(btn, FOLLOWUP_LISTEN_MAX_MS);
          }, POST_TTS_GAP_MS);
        });
      });
    }).catch(function (err) {
      debug('turn threw:', err && err.message);
      setPhase(btn, 'speaking');
      speakLine("Something went sideways, Nigel. Tap me to try again.").catch(function () {})
        .then(function () {
          resetConversation('exception');
          setPhase(btn, null);
          inFlight = false;
        });
    });
  }

  function handleClick(btn) {
    if (inFlight) { debug('click ignored: in flight'); return; }
    var now = Date.now();
    if (now - lastActivation < COOLDOWN_MS) { debug('click ignored: cooldown'); return; }
    lastActivation = now;

    var staleConvo = convo.active && (now - convo.lastTurnAt > CONVO_TIMEOUT_MS);
    if (!convo.active || staleConvo) {
      resetConversation(staleConvo ? 'timeout-new-tap' : 'first-tap');
      convo.active = true;
    }
    convo.lastTurnAt = now;

    var m = modules();
    if (!m.H) { debug('Humphrey missing'); resetConversation('no-humphrey'); return; }
    var hasFullChain = m.L && typeof m.L.listen === 'function' &&
                       m.C && typeof m.C.ask === 'function';
    if (!hasFullChain) {
      debug('partial chain: listener=' + !!m.L + ' chat=' + !!m.C);
      setPhase(btn, 'speaking');
      inFlight = true;
      speakLine("Hi Nigel — I am Ms. Humphrey. Ask me anything once I am fully hooked up.")
        .catch(function () {})
        .then(function () {
          setPhase(btn, null);
          resetConversation('partial-chain');
          inFlight = false;
        });
      return;
    }

    inFlight = true;
    turn(btn, FIRST_LISTEN_MAX_MS);
  }

  function wireButton() {
    var btn = document.getElementById('humphreyBtn');
    if (!btn) { debug('no #humphreyBtn'); return false; }
    if (btn.dataset.qnaWired === 'true') { debug('already wired'); return true; }
    var fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.dataset.qnaWired = 'true';
    fresh.addEventListener('click', function () { handleClick(fresh); });
    debug('wired (cloned to strip prior listeners)');
    return true;
  }

  // End convo on page unload so the convo gets summarized + stored
  window.addEventListener('beforeunload', function () {
    if (convo.active && convo.history.length >= 2) resetConversation('unload');
  }, { passive: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireButton, { once: true });
  } else {
    wireButton();
  }

  NS.QnA = {
    wireButton: wireButton,
    setContextProvider: setContextProvider,
    endConversation: endConversation,
    _state: convo
  };
})();
