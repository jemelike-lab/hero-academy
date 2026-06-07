/**
 * Hero Academy — Explorer's Hall expedition state machine (v128b).
 *
 * Consumes an expedition payload (the `payload` jsonb from ha_expeditions)
 * and walks Nigel through:
 *
 *    hook  →  discovery  →  wonder 1  →  wonder 2  →  wonder 3  →
 *    connection  →  reflection  →  completion (stamp)
 *
 * Each phase renders its own HTML into a single mount node, speaks
 * Humphrey's narration via /api/humphrey/tts, and fires a
 * fire-and-forget ha_record_expedition_event telemetry call.
 *
 * Stamping uses HeroAcademy.Telemetry.rpc('ha_record_stamp', ...).
 *
 * The reflection moment in v128b is multiple-choice (the
 * fallback_question from the payload). Voice recall ships in v128c.
 *
 * Usage:
 *   const exp = new HeroAcademy.Expedition({
 *     mount: document.getElementById('expeditionRoot'),
 *     humphreyTab: { tab: '#humphreyTab', hint: '#humphreyHint', bubble: '#humphreyBubble' },
 *     expeditionId: '6a87b69a-...',
 *     payload: { schema_version:1, hook:{...}, discovery:{...}, wonders:[...], ... },
 *     stamped: false,
 *     onComplete: ({ wasNewStamp }) => { ... },
 *   });
 *   exp.start();
 */
(function () {
  'use strict';

  var NS = window.HeroAcademy = window.HeroAcademy || {};
  if (NS.Expedition) return; // idempotent

  // ----- Phase constants -----
  var PHASE = {
    HOOK: 'hook',
    DISCOVERY: 'discovery',
    WONDERS: 'wonders',                   // grid of 3 cards
    WONDER_FACT: 'wonder_fact',           // reveal the fact text
    WONDER_QUESTION: 'wonder_question',   // ask the quick-check
    WONDER_FEEDBACK: 'wonder_feedback',   // show correct/incorrect feedback
    CONNECTION: 'connection',
    REFLECTION: 'reflection',
    COMPLETION: 'completion',
  };

  // ----- Helpers -----
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function qs(scope, sel) {
    if (sel && sel.charAt(0) === '#') return scope.getElementById(sel.slice(1));
    return scope.querySelector(sel);
  }

  // ===========================================================================
  // Expedition class
  // ===========================================================================
  function Expedition(opts) {
    this.opts = opts || {};
    this.mount = opts.mount;
    this.payload = opts.payload || {};
    this.expeditionId = opts.expeditionId;
    this.stamped = !!opts.stamped;
    this.onComplete = opts.onComplete || function () {};

    // Humphrey tab DOM refs (provided by the host page)
    var ht = opts.humphreyTab || {};
    this._tabEl = (typeof ht.tab === 'string') ? document.querySelector(ht.tab) : ht.tab;
    this._hintEl = (typeof ht.hint === 'string') ? document.querySelector(ht.hint) : ht.hint;
    this._bubbleEl = (typeof ht.bubble === 'string') ? document.querySelector(ht.bubble) : ht.bubble;

    this.phase = null;
    this.currentWonderIdx = -1;
    this.wonderAnswers = []; // [{ wonderId, correctOptionId, chosenOptionId, correct }]
    this.reflectionAnswer = null;
    this.currentAudio = null;
    this.currentMessage = '';
    this._destroyed = false;
  }

  // -- TTS routing (mirrors v125 Cauldron + v126/127 Explorer's Hall) --------
  Expedition.prototype._tts = function (text) {
    if (!text || this._destroyed) return Promise.resolve(null);
    var self = this;
    // Interrupt any in-flight audio.
    if (this.currentAudio) {
      try { this.currentAudio.pause(); } catch (_) {}
      this.currentAudio = null;
    }
    this._startPulse();
    return fetch('/api/humphrey/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: String(text) }),
    })
      .then(function (r) { if (!r.ok) throw new Error('tts ' + r.status); return r.blob(); })
      .then(function (blob) {
        if (self._destroyed) return null;
        var url = URL.createObjectURL(blob);
        var audio = new Audio(url);
        self.currentAudio = audio;
        audio.addEventListener('ended', function () {
          URL.revokeObjectURL(url);
          if (self.currentAudio === audio) self.currentAudio = null;
          self._stopPulse();
        });
        audio.addEventListener('error', function () {
          URL.revokeObjectURL(url);
          if (self.currentAudio === audio) self.currentAudio = null;
          self._stopPulse();
        });
        return audio.play().catch(function () {
          // Autoplay may be blocked on first paint — keep the pulse so the
          // child knows to tap Humphrey to hear it.
          return null;
        });
      })
      .catch(function () {
        // Network/model error — drop the pulse after a beat so the UI doesn't
        // appear stuck on the very first phase.
        setTimeout(function () { self._stopPulse(); }, 2500);
        return null;
      });
  };

  Expedition.prototype._startPulse = function () {
    if (this._tabEl) this._tabEl.classList.add('pulsing');
    if (this._hintEl) this._hintEl.classList.add('visible');
  };
  Expedition.prototype._stopPulse = function () {
    if (this._tabEl) this._tabEl.classList.remove('pulsing');
    if (this._hintEl) this._hintEl.classList.remove('visible');
  };

  Expedition.prototype._setMessage = function (text) {
    this.currentMessage = text || '';
    if (this._bubbleEl) this._bubbleEl.textContent = this.currentMessage;
  };

  // -- Replay current Humphrey line (when the kid taps her portrait) ---------
  Expedition.prototype.replayCurrent = function () {
    if (this.currentMessage) this._tts(this.currentMessage);
  };

  // -- Telemetry (fire-and-forget) -------------------------------------------
  Expedition.prototype._logEvent = function (eventType, payload) {
    try {
      if (!NS.Telemetry || !NS.Telemetry.rpc) return;
      NS.Telemetry.rpc('ha_record_expedition_event', {
        p_child_id: NS.Telemetry.childId(),
        p_expedition_id: this.expeditionId,
        p_event_type: eventType,
        p_payload: payload || {},
      }).catch(function () { /* ignored */ });
    } catch (_) { /* ignored */ }
  };

  // -- Stamp (real DB write) -------------------------------------------------
  Expedition.prototype._recordStamp = function () {
    var self = this;
    if (!NS.Telemetry || !NS.Telemetry.rpc) {
      return Promise.resolve({ ok: false, was_new: false, error: 'no_telemetry' });
    }
    return NS.Telemetry.rpc('ha_record_stamp', {
      p_child_id: NS.Telemetry.childId(),
      p_expedition_id: self.expeditionId,
    })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('rpc ' + r.status)); })
      .catch(function (e) {
        return { ok: false, was_new: false, error: String(e).slice(0, 200) };
      });
  };

  // -- Render helpers --------------------------------------------------------
  Expedition.prototype._render = function (html) {
    if (!this.mount) return;
    this.mount.innerHTML = html;
  };

  // ===========================================================================
  // PHASES
  // ===========================================================================

  Expedition.prototype.start = function () {
    this._showHook();
  };

  // ---- HOOK -----------------------------------------------------------------
  Expedition.prototype._showHook = function () {
    this.phase = PHASE.HOOK;
    var hook = (this.payload && this.payload.hook) || {};
    var text = hook.text || 'Welcome, explorer.';
    this._setMessage(text);

    this._render([
      '<section class="ex-phase ex-phase-hook" data-phase="hook">',
      '  <div class="ex-eyebrow">Today\'s Expedition</div>',
      '  <p class="ex-hook-text">' + escapeHtml(text) + '</p>',
      '  <button class="ex-primary" data-action="hook-next">',
      '    Let\'s begin <span aria-hidden="true">→</span>',
      '  </button>',
      '</section>',
    ].join(''));

    var self = this;
    this._wire('[data-action="hook-next"]', 'click', function () {
      self._logEvent('hook_played', {});
      self._showDiscovery();
    });

    this._tts(text);
    this._logEvent('expedition_opened', {});
  };

  // ---- DISCOVERY ------------------------------------------------------------
  Expedition.prototype._showDiscovery = function () {
    this.phase = PHASE.DISCOVERY;
    var d = (this.payload && this.payload.discovery) || {};
    var title = d.title || (this.payload && this.payload.topic) || 'Today';
    var subtitle = d.subtitle || '';
    var intro = d.intro || '';
    var kind = d.illustration_kind || 'symbol';

    this._setMessage(intro);

    var loc = this.payload && this.payload.location;
    var locChip = (loc && loc.name)
      ? '<div class="ex-loc-chip">📍 ' + escapeHtml(loc.name) + '</div>'
      : '';

    this._render([
      '<section class="ex-phase ex-phase-discovery" data-phase="discovery">',
      '  <div class="ex-discovery-illust ex-illust-' + escapeHtml(kind) + '">',
      '    <div class="ex-illust-glyph">' + glyphFor(kind, this.payload.theme) + '</div>',
      '  </div>',
      '  <div class="ex-discovery-head">',
      '    <h2 class="ex-discovery-title">' + escapeHtml(title) + '</h2>',
      (subtitle ? '    <p class="ex-discovery-sub">' + escapeHtml(subtitle) + '</p>' : ''),
      '  </div>',
      locChip,
      '  <p class="ex-discovery-intro">' + escapeHtml(intro) + '</p>',
      '  <button class="ex-primary" data-action="discovery-next">',
      '    Explore <span aria-hidden="true">→</span>',
      '  </button>',
      '</section>',
    ].join(''));

    var self = this;
    this._wire('[data-action="discovery-next"]', 'click', function () {
      self._logEvent('discovery_viewed', {});
      self._showWondersGrid();
    });

    this._tts(intro);
  };

  function glyphFor(kind, theme) {
    if (kind === 'portrait_silhouette') return '👤';
    if (kind === 'landmark') return '🏛️';
    if (kind === 'landscape') return '🏞️';
    if (kind === 'map') return '🗺️';
    if (theme === 'maryland_history' || theme === 'us_history') return '📜';
    if (theme === 'us_geography' || theme === 'world_geography') return '🌍';
    if (theme === 'civics') return '⚖️';
    if (theme === 'historical_figures') return '👤';
    if (theme === 'culture_holidays') return '🎉';
    if (theme === 'science_of_place') return '🔬';
    return '✨';
  }

  // ---- WONDERS GRID ---------------------------------------------------------
  Expedition.prototype._showWondersGrid = function () {
    this.phase = PHASE.WONDERS;
    var wonders = (this.payload && this.payload.wonders) || [];
    var self = this;

    var doneCount = this.wonderAnswers.filter(function (a) { return a; }).length;
    var allDone = doneCount >= wonders.length;

    var lead = allDone
      ? 'All three wonders explored. Tap to continue.'
      : 'Tap each wonder to learn more.';
    this._setMessage(lead);

    var cards = wonders.map(function (w, i) {
      var answered = self.wonderAnswers[i];
      var stateClass = answered ? (answered.correct ? 'is-correct' : 'is-attempted') : '';
      return [
        '<button class="ex-wonder-card ' + stateClass + '" data-wonder-index="' + i + '">',
        '  <span class="ex-wonder-icon" aria-hidden="true">' + escapeHtml(w.icon || '✨') + '</span>',
        '  <span class="ex-wonder-title">' + escapeHtml(w.title || ('Wonder ' + (i + 1))) + '</span>',
        '  <span class="ex-wonder-state">' + (answered ? (answered.correct ? '✓' : '↻') : 'Tap to open') + '</span>',
        '</button>',
      ].join('');
    }).join('');

    var continueBtn = allDone
      ? '<button class="ex-primary" data-action="wonders-next">Continue <span aria-hidden="true">→</span></button>'
      : '';

    this._render([
      '<section class="ex-phase ex-phase-wonders" data-phase="wonders">',
      '  <h2 class="ex-phase-head">Three Wonders</h2>',
      '  <p class="ex-phase-lead">' + escapeHtml(lead) + '</p>',
      '  <div class="ex-wonders-grid">' + cards + '</div>',
      continueBtn,
      '</section>',
    ].join(''));

    this.mount.querySelectorAll('[data-wonder-index]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-wonder-index'), 10);
        self._openWonder(idx);
      });
    });
    this._wire('[data-action="wonders-next"]', 'click', function () {
      self._showConnection();
    });

    // No new narration on returning to the grid — keeps it from being chatty.
    if (doneCount === 0) {
      this._tts(lead);
    }
  };

  // ---- INDIVIDUAL WONDER ----------------------------------------------------
  Expedition.prototype._openWonder = function (idx) {
    var wonders = (this.payload && this.payload.wonders) || [];
    var w = wonders[idx];
    if (!w) return;
    this.phase = PHASE.WONDER_FACT;
    this.currentWonderIdx = idx;

    var fact = w.fact || '';
    this._setMessage(fact);

    this._render([
      '<section class="ex-phase ex-phase-wonder" data-phase="wonder-fact">',
      '  <div class="ex-back-row">',
      '    <button class="ex-back-btn" data-action="back-to-wonders">← Back to wonders</button>',
      '  </div>',
      '  <div class="ex-wonder-banner">',
      '    <span class="ex-wonder-banner-icon">' + escapeHtml(w.icon || '✨') + '</span>',
      '    <h2 class="ex-wonder-banner-title">' + escapeHtml(w.title || '') + '</h2>',
      '  </div>',
      '  <p class="ex-wonder-fact">' + escapeHtml(fact) + '</p>',
      '  <button class="ex-primary" data-action="wonder-quiz">',
      '    Quick check <span aria-hidden="true">→</span>',
      '  </button>',
      '</section>',
    ].join(''));

    var self = this;
    this._wire('[data-action="back-to-wonders"]', 'click', function () {
      self._showWondersGrid();
    });
    this._wire('[data-action="wonder-quiz"]', 'click', function () {
      self._showWonderQuestion(idx);
    });

    this._tts(fact);
    this._logEvent('wonder_tap', { wonder_id: w.id, wonder_index: idx });
  };

  Expedition.prototype._showWonderQuestion = function (idx) {
    var wonders = (this.payload && this.payload.wonders) || [];
    var w = wonders[idx];
    if (!w || !w.question) return;
    this.phase = PHASE.WONDER_QUESTION;
    var q = w.question;
    var prompt = q.prompt || '';
    this._setMessage(prompt);

    var optsHtml = (q.options || []).map(function (o) {
      return [
        '<button class="ex-option-btn" data-option-id="' + escapeHtml(o.id) + '">',
        '  <span class="ex-option-text">' + escapeHtml(o.text) + '</span>',
        '</button>',
      ].join('');
    }).join('');

    this._render([
      '<section class="ex-phase ex-phase-question" data-phase="wonder-question">',
      '  <div class="ex-wonder-banner small">',
      '    <span class="ex-wonder-banner-icon">' + escapeHtml(w.icon || '✨') + '</span>',
      '    <h2 class="ex-wonder-banner-title">' + escapeHtml(w.title || '') + '</h2>',
      '  </div>',
      '  <p class="ex-question-prompt">' + escapeHtml(prompt) + '</p>',
      '  <div class="ex-options">' + optsHtml + '</div>',
      '</section>',
    ].join(''));

    var self = this;
    this.mount.querySelectorAll('[data-option-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var chosen = btn.getAttribute('data-option-id');
        self._submitWonderAnswer(idx, chosen);
      });
    });

    this._tts(prompt);
  };

  Expedition.prototype._submitWonderAnswer = function (idx, chosenOptionId) {
    var wonders = (this.payload && this.payload.wonders) || [];
    var w = wonders[idx];
    if (!w || !w.question) return;
    var correctOpt = (w.question.options || []).find(function (o) { return o.correct === true; });
    var correctId = correctOpt ? correctOpt.id : null;
    var isCorrect = chosenOptionId === correctId;
    var feedback = isCorrect ? (w.question.feedback_correct || 'Yes!') : (w.question.feedback_incorrect || '');
    this.wonderAnswers[idx] = {
      wonderId: w.id,
      wonderIndex: idx,
      chosenOptionId: chosenOptionId,
      correctOptionId: correctId,
      correct: isCorrect,
    };
    this._logEvent('wonder_answer', {
      wonder_id: w.id,
      wonder_index: idx,
      chosen: chosenOptionId,
      correct_id: correctId,
      correct: isCorrect,
    });
    this._showWonderFeedback(idx, isCorrect, feedback);
  };

  Expedition.prototype._showWonderFeedback = function (idx, isCorrect, feedback) {
    this.phase = PHASE.WONDER_FEEDBACK;
    this._setMessage(feedback);

    var wonders = (this.payload && this.payload.wonders) || [];
    var allAnswered = wonders.every(function (_, i) { return !!this.wonderAnswers[i]; }, this);
    var nextBtnLabel = allAnswered ? 'Continue' : 'Back to wonders';

    this._render([
      '<section class="ex-phase ex-phase-feedback ' + (isCorrect ? 'is-correct' : 'is-incorrect') + '" data-phase="wonder-feedback">',
      '  <div class="ex-feedback-icon" aria-hidden="true">' + (isCorrect ? '✓' : '↻') + '</div>',
      '  <p class="ex-feedback-text">' + escapeHtml(feedback) + '</p>',
      '  <button class="ex-primary" data-action="feedback-next">',
      '    ' + nextBtnLabel + ' <span aria-hidden="true">→</span>',
      '  </button>',
      '</section>',
    ].join(''));

    var self = this;
    this._wire('[data-action="feedback-next"]', 'click', function () {
      if (allAnswered) self._showConnection();
      else self._showWondersGrid();
    });

    this._tts(feedback);
  };

  // ---- CONNECTION -----------------------------------------------------------
  Expedition.prototype._showConnection = function () {
    this.phase = PHASE.CONNECTION;
    var c = (this.payload && this.payload.connection) || {};
    var text = c.text || '';
    this._setMessage(text);

    this._render([
      '<section class="ex-phase ex-phase-connection" data-phase="connection">',
      '  <div class="ex-eyebrow">A note for you, Nigel</div>',
      '  <p class="ex-connection-text">' + escapeHtml(text) + '</p>',
      '  <button class="ex-primary" data-action="connection-next">',
      '    Continue <span aria-hidden="true">→</span>',
      '  </button>',
      '</section>',
    ].join(''));

    var self = this;
    this._wire('[data-action="connection-next"]', 'click', function () {
      self._logEvent('connection_played', {});
      self._showReflection();
    });

    this._tts(text);
  };

  // ---- REFLECTION (v129a: voice-first via ElevenLabs Conversational AI) ----
  //
  // Auto-starts a Conversation session with the Miss Humphrey agent
  // (agent_5901kssbzjm1e0yvd0kdwxa3r49m) on phase entry. Passes the topic
  // + the 3 wonder facts as dynamic variables so the agent knows what
  // Nigel just learned and can pick up on his actual answer. Overrides
  // the agent's first_message with the reflection prompt so she opens
  // the conversation by asking the right question.
  //
  // 90s client-side hard cap. On disconnect, transcript is logged via
  // ha_record_expedition_event and the flow proceeds to completion.
  //
  // Silent fallback to the MC fallback_question if:
  //   - @elevenlabs/client SDK not loaded
  //   - mic permission denied
  //   - conversation errors / fails to connect
  //   - the agent is unreachable
  Expedition.prototype.AGENT_ID = 'agent_5901kssbzjm1e0yvd0kdwxa3r49m';
  Expedition.prototype.CONVERSATION_CAP_MS = 90000;

  Expedition.prototype._showReflection = function () {
    this.phase = PHASE.REFLECTION;
    var r = (this.payload && this.payload.reflection) || {};
    var prompt = r.prompt || 'Tell Humphrey what you want to remember.';
    var fb = r.fallback_question || {};
    this._setMessage(prompt);
    this._renderReflectionVoice(prompt, fb);
    this._attemptConversation(prompt, r, fb);
  };

  Expedition.prototype._renderReflectionVoice = function (prompt, fb) {
    this._render([
      '<section class="ex-phase ex-phase-reflection" data-phase="reflection">',
      '  <div class="ex-eyebrow">Reflection</div>',
      '  <p class="ex-reflection-prompt">' + escapeHtml(prompt) + '</p>',
      '  <div class="ex-voice-stage" id="exVoiceStage">',
      '    <div class="ex-voice-orb" id="exVoiceOrb" aria-hidden="true">',
      '      <div class="ex-voice-orb-ring"></div>',
      '      <div class="ex-voice-orb-ring delay"></div>',
      '      <div class="ex-voice-orb-core"></div>',
      '    </div>',
      '    <div class="ex-voice-status" id="exVoiceStatus">Connecting to Humphrey…</div>',
      '    <button class="ex-secondary" data-action="end-conversation" id="exVoiceEnd">I\'m done talking</button>',
      '  </div>',
      '  <div class="ex-voice-fallback" id="exVoiceFallback" hidden>',
      '    <p class="ex-reflection-fb-q">' + escapeHtml(fb.prompt || prompt) + '</p>',
      '    <div class="ex-options" id="exVoiceFallbackOpts">' +
      (fb.options || []).map(function (o) {
        return '<button class="ex-option-btn" data-reflect-option="' + escapeHtml(o.id) + '"><span class="ex-option-text">' + escapeHtml(o.text) + '</span></button>';
      }).join('') +
      '    </div>',
      '  </div>',
      '</section>',
    ].join(''));

    var self = this;
    this._wire('[data-action="end-conversation"]', 'click', function () {
      self._endConversationCleanly('user_ended');
    });
  };

  Expedition.prototype._attemptConversation = function (prompt, refl, fb) {
    var self = this;
    var SDK = window.ElevenLabs && window.ElevenLabs.Conversation;
    if (!SDK || typeof SDK.startSession !== 'function') {
      console.warn('[expedition] @elevenlabs/client SDK not loaded — falling back to MC');
      self._fallbackToMc(fb);
      return;
    }

    var topic = (this.payload && this.payload.topic) || "today's expedition";
    var wonderFacts = ((this.payload && this.payload.wonders) || [])
      .map(function (w, i) { return (i + 1) + '. ' + (w.title || '') + ' — ' + (w.fact || ''); })
      .join('\n\n');
    var connectionText = ((this.payload && this.payload.connection) || {}).text || '';

    this._transcript = [];
    this._conversationStarted = Date.now();
    this._conversationCap = setTimeout(function () {
      console.warn('[expedition] 90s conversation cap reached');
      self._endConversationCleanly('time_cap');
    }, this.CONVERSATION_CAP_MS);

    var startOpts = {
      agentId: this.AGENT_ID,
      dynamicVariables: {
        topic: topic,
        wonders_learned: wonderFacts,
        connection_note: connectionText,
      },
      overrides: {
        agent: {
          firstMessage: prompt,
        },
      },
      onConnect: function (info) {
        self._conversationId = info && info.conversationId;
        self._setVoiceStatus('Humphrey is listening…');
      },
      onMessage: function (msg) {
        if (!msg) return;
        var text = msg.message || msg.text || '';
        var source = msg.source || msg.role || 'unknown';
        if (text) self._transcript.push({ role: source, message: text });
      },
      onModeChange: function (mode) {
        var m = mode && (mode.mode || mode);
        var orb = document.getElementById('exVoiceOrb');
        if (m === 'speaking') {
          if (orb) orb.classList.add('is-speaking');
          self._setVoiceStatus('Humphrey is speaking…');
          self._startPulse();
        } else {
          if (orb) orb.classList.remove('is-speaking');
          self._setVoiceStatus('Humphrey is listening…');
          self._stopPulse();
        }
      },
      onDisconnect: function () {
        if (self._conversationCap) { clearTimeout(self._conversationCap); self._conversationCap = null; }
        if (self.phase !== PHASE.REFLECTION) return;
        self._logTranscriptAndProceed();
      },
      onError: function (err) {
        console.warn('[expedition] ElevenLabs conversation error:', err);
        if (self._conversationCap) { clearTimeout(self._conversationCap); self._conversationCap = null; }
        if (self.phase === PHASE.REFLECTION) self._fallbackToMc(fb);
      },
    };

    var startPromise;
    try {
      startPromise = SDK.startSession(startOpts);
    } catch (e) {
      console.warn('[expedition] startSession threw:', e);
      self._fallbackToMc(fb);
      return;
    }
    Promise.resolve(startPromise)
      .then(function (conv) {
        self._conversation = conv;
        // If startSession resolved synchronously without onConnect firing,
        // update the status proactively.
        if (!self._conversationId) self._setVoiceStatus('Humphrey is connecting…');
      })
      .catch(function (e) {
        console.warn('[expedition] startSession rejected:', e);
        if (self._conversationCap) { clearTimeout(self._conversationCap); self._conversationCap = null; }
        self._fallbackToMc(fb);
      });
  };

  Expedition.prototype._setVoiceStatus = function (text) {
    var el = document.getElementById('exVoiceStatus');
    if (el) el.textContent = text;
  };

  Expedition.prototype._endConversationCleanly = function (reason) {
    var self = this;
    this._endReason = reason;
    if (this._conversationCap) { clearTimeout(this._conversationCap); this._conversationCap = null; }
    if (this._conversation && typeof this._conversation.endSession === 'function') {
      try { this._conversation.endSession(); } catch (_) {}
      // onDisconnect will fire shortly and proceed.
      // Safety: if onDisconnect doesn't fire within 2.5s, proceed anyway.
      setTimeout(function () {
        if (self.phase === PHASE.REFLECTION) self._logTranscriptAndProceed();
      }, 2500);
      return;
    }
    this._logTranscriptAndProceed();
  };

  Expedition.prototype._logTranscriptAndProceed = function () {
    if (this.phase !== PHASE.REFLECTION) return; // already advanced
    var transcriptText = (this._transcript || [])
      .map(function (t) { return (t.role || '?') + ': ' + t.message; })
      .join('\n');
    this._logEvent('reflection_voice', {
      transcript: transcriptText,
      turns: (this._transcript || []).length,
      duration_ms: Date.now() - (this._conversationStarted || Date.now()),
      conversation_id: this._conversationId || null,
      end_reason: this._endReason || 'agent_ended',
    });
    this.reflectionAnswer = {
      mode: 'voice',
      transcript: transcriptText,
      turns: (this._transcript || []).length,
    };
    this._showCompletion();
  };

  Expedition.prototype._fallbackToMc = function (fb) {
    var stage = document.getElementById('exVoiceStage');
    var fallback = document.getElementById('exVoiceFallback');
    if (stage) stage.style.display = 'none';
    if (fallback) fallback.hidden = false;
    var self = this;
    this.mount.querySelectorAll('[data-reflect-option]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var chosen = btn.getAttribute('data-reflect-option');
        self._submitReflectionAnswer(chosen);
      });
    });
    // Speak the prompt so it doesn't go silent.
    var prompt = ((this.payload && this.payload.reflection) || {}).prompt;
    if (prompt) this._tts(prompt);
  };

  Expedition.prototype._submitReflectionAnswer = function (chosenOptionId) {
    var r = (this.payload && this.payload.reflection) || {};
    var fb = r.fallback_question || {};
    var correctOpt = (fb.options || []).find(function (o) { return o.correct === true; });
    var correctId = correctOpt ? correctOpt.id : null;
    var isCorrect = chosenOptionId === correctId;
    this.reflectionAnswer = {
      chosenOptionId: chosenOptionId,
      correctOptionId: correctId,
      correct: isCorrect,
    };
    this._logEvent('reflection_answer', {
      mode: 'mc_fallback',
      chosen: chosenOptionId,
      correct_id: correctId,
      correct: isCorrect,
    });
    this._showCompletion();
  };

  // ---- COMPLETION + STAMP --------------------------------------------------
  Expedition.prototype._showCompletion = function () {
    this.phase = PHASE.COMPLETION;
    var c = (this.payload && this.payload.completion) || {};
    var stampLabel = c.stamp_label || 'STAMP';
    var stampSub = c.stamp_subtitle || '';
    var celebrate = c.celebration_line || 'Wonderful work, Nigel.';
    this._setMessage(celebrate);

    this._render([
      '<section class="ex-phase ex-phase-completion" data-phase="completion">',
      '  <div class="ex-eyebrow">Expedition complete</div>',
      '  <div class="ex-stamp-stage">',
      '    <div class="ex-stamp" id="exStamp">',
      '      <div class="ex-stamp-ring"></div>',
      '      <div class="ex-stamp-label">' + escapeHtml(stampLabel) + '</div>',
      (stampSub ? '      <div class="ex-stamp-sub">' + escapeHtml(stampSub) + '</div>' : ''),
      '    </div>',
      '  </div>',
      '  <p class="ex-celebrate">' + escapeHtml(celebrate) + '</p>',
      '  <div class="ex-completion-actions">',
      '    <a class="ex-secondary" href="/passport.html">Open Passport</a>',
      '    <a class="ex-primary" href="/index.html">Back to Hero Hall</a>',
      '  </div>',
      '</section>',
    ].join(''));

    // Trigger the stamp slam animation on the next frame.
    var self = this;
    requestAnimationFrame(function () {
      var el = self.mount.querySelector('#exStamp');
      if (el) el.classList.add('is-slammed');
    });

    this._tts(celebrate);
    this._logEvent('completed', {
      correct_wonders: this.wonderAnswers.filter(function (a) { return a && a.correct; }).length,
      total_wonders: ((this.payload && this.payload.wonders) || []).length,
      reflection_correct: this.reflectionAnswer && this.reflectionAnswer.correct,
    });

    // Write the stamp to Supabase (idempotent — re-completing returns the
    // existing stamp without duplicating).
    this._recordStamp().then(function (res) {
      var wasNew = !!(res && res.was_new);
      self.opts.onComplete({ wasNewStamp: wasNew, result: res });
    });
  };

  // ----- Event wiring helper -----
  Expedition.prototype._wire = function (sel, event, handler) {
    var el = this.mount.querySelector(sel);
    if (el) el.addEventListener(event, handler);
  };

  Expedition.prototype.destroy = function () {
    this._destroyed = true;
    if (this.currentAudio) {
      try { this.currentAudio.pause(); } catch (_) {}
      this.currentAudio = null;
    }
    if (this._conversationCap) { clearTimeout(this._conversationCap); this._conversationCap = null; }
    if (this._conversation && typeof this._conversation.endSession === 'function') {
      try { this._conversation.endSession(); } catch (_) {}
      this._conversation = null;
    }
    this._stopPulse();
  };

  // ----- Public class export -----
  NS.Expedition = Expedition;
  NS.ExpeditionPhase = PHASE;
})();
