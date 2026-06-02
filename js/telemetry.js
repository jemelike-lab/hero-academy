/**
 * Hero Academy \u2014 client-side telemetry.
 *
 * Thin wrapper around the SECURITY DEFINER RPCs in Supabase
 * (ha_start_session, ha_record_attempt, ha_end_session, ha_unlock_character).
 * Anon role is permitted to EXECUTE these, so the calls run client-side
 * with the publishable key. Tables themselves remain locked down.
 *
 * Auto-init:
 *   On DOMContentLoaded, looks up the current zone from the URL and starts
 *   a session. On pagehide / visibilitychange=hidden, ends the session via
 *   fetch keepalive so the row gets sealed even on iPad tab close.
 *
 * Usage from game code:
 *   HeroAcademy.Telemetry.recordAttempt(true,  prompt, expected, given);
 *   HeroAcademy.Telemetry.recordAttempt(false, prompt, expected, given);
 *
 * All calls are fire-and-forget; failures are logged to console (warn) and
 * never block the UI. The library is safe to load on any page \u2014 if the URL
 * doesn\u2019t map to a known zone, startSession is skipped.
 *
 * Manual override (if a page wants a non-default zone/topic/game):
 *   HeroAcademy.Telemetry.startSession('number-lab', 'cauldron-cafe', 'add_within_10');
 */
(function () {
  'use strict';

  var NS = window.HeroAcademy = window.HeroAcademy || {};
  if (NS.Telemetry) return; // idempotent

  // ----- Public Supabase config (anon publishable key is safe in client) -----
  var SUPABASE_URL = 'https://yofqeuguxgujgqnaejmw.supabase.co';
  var SB_KEY = 'sb_publishable_Cigt6z_S1YTSvChOi5E7tA_t1H_nNRI';
  var NIGEL_ID = '2e0e51c5-f120-4152-8aa1-041eeecc8165';

  // ----- URL -> zone/game mapping --------------------------------------------
  // Keys are filename basenames so the page url drives session boot.
  var URL_MAP = {
    'number-lab.html':    { zoneId: 'number-lab',  gameId: 'number-lab' },
    'cauldron-cafe.html': { zoneId: 'number-lab',  gameId: 'cauldron-cafe' },
    'word-tower.html':    { zoneId: 'word-tower',  gameId: 'word-tower' },
    'story-time.html':    { zoneId: 'story-time',  gameId: 'story-time' },
    'discovery-dome.html':{ zoneId: 'discovery',   gameId: 'discovery-dome' },
    'diner-lanes.html':   { zoneId: 'explorer',    gameId: 'diner-lanes' },
    'story-lab.html':     { zoneId: 'writing',     gameId: 'story-lab' },
    'hero-hall.html':     { zoneId: 'hero-hall',   gameId: null },
  };

  // ----- Internal state ------------------------------------------------------
  var state = {
    sessionId: null,
    zoneId: null,
    started: null,
    ended: false,
  };

  function log() {
    if (typeof console === 'undefined' || !console.warn) return;
    var args = ['[telemetry]'];
    for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
    console.warn.apply(console, args);
  }

  function rpc(fn, body, opts) {
    opts = opts || {};
    var init = {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body || {}),
    };
    if (opts.keepalive) init.keepalive = true;
    return fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, init);
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  function startSession(zoneId, gameId, topicId) {
    if (!zoneId) {
      log('startSession called without zoneId; skipping');
      return Promise.resolve(null);
    }
    // If a session is already live for this page, no-op
    if (state.sessionId && !state.ended) return Promise.resolve(state.sessionId);

    state.zoneId = zoneId;
    state.started = Date.now();
    state.ended = false;

    return rpc('ha_start_session', {
      p_child_id: NIGEL_ID,
      p_zone_id: zoneId,
      p_game_id: gameId || null,
      p_topic_id: topicId || null,
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (uuid) {
        // PostgREST returns the scalar UUID as a JSON string ("...")
        state.sessionId = typeof uuid === 'string' ? uuid : (uuid && uuid[0]) || null;
        return state.sessionId;
      })
      .catch(function (e) {
        log('startSession failed:', e && e.message || e);
        return null;
      });
  }

  function recordAttempt(correct, prompt, expected, given, timeToAnswerMs) {
    if (!state.sessionId || state.ended) return Promise.resolve();
    return rpc('ha_record_attempt', {
      p_session_id: state.sessionId,
      p_correct: !!correct,
      p_prompt: prompt != null ? String(prompt).slice(0, 500) : null,
      p_expected: expected != null ? String(expected).slice(0, 200) : null,
      p_given: given != null ? String(given).slice(0, 200) : null,
      p_time_to_answer_ms: typeof timeToAnswerMs === 'number' ? timeToAnswerMs : null,
    }).catch(function (e) {
      log('recordAttempt failed:', e && e.message || e);
    });
  }

  function endSession(completed) {
    if (!state.sessionId || state.ended) return Promise.resolve();
    state.ended = true;
    return rpc(
      'ha_end_session',
      { p_session_id: state.sessionId, p_completed: completed !== false },
      { keepalive: true }
    ).catch(function (e) {
      log('endSession failed:', e && e.message || e);
    });
  }

  function unlockCharacter(characterId, zoneId) {
    if (!characterId) return Promise.resolve();
    return rpc('ha_unlock_character', {
      p_child_id: NIGEL_ID,
      p_character_id: characterId,
      p_zone_id: zoneId || state.zoneId || null,
    }).catch(function (e) {
      log('unlockCharacter failed:', e && e.message || e);
    });
  }

  function currentSessionId() { return state.sessionId; }

  // --------------------------------------------------------------------------
  // Auto-init from URL
  // --------------------------------------------------------------------------

  function pageBasename() {
    try {
      var p = window.location.pathname.split('/').filter(Boolean).pop() || 'index.html';
      // Trim query/hash leftovers if any
      p = p.split('?')[0].split('#')[0];
      // Treat root as home (no telemetry session for home)
      if (!p || p === '' || p === '/') return 'index.html';
      return p;
    } catch (e) {
      return 'index.html';
    }
  }

  function autoStart() {
    var basename = pageBasename();
    var hit = URL_MAP[basename];
    if (!hit) return; // no session for unmapped pages
    startSession(hit.zoneId, hit.gameId, null);
  }

  function onHide() {
    if (state.sessionId && !state.ended) endSession(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoStart);
  } else {
    autoStart();
  }
  window.addEventListener('pagehide', onHide);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') onHide();
  });


  // ---------------------------------------------------------------------------
  // Pool warmup — used to enforce a hard "never twice" guarantee.
  //
  // When unseen-item count is BELOW `blockThreshold` (default 5), the call
  // blocks: it shows a "warming up" overlay after a short delay and awaits
  // the generator endpoint. When unseen is between blockThreshold and
  // asyncThreshold, fires fire-and-forget top-up (no block). When unseen is
  // at or above asyncThreshold, returns immediately.
  //
  // Returns { mode: 'sufficient' | 'async' | 'blocking', success: boolean }.
  // ---------------------------------------------------------------------------
  async function warmupPool(opts) {
    if (!opts || !opts.statusRpc || !opts.generatorPath) {
      return { mode: 'sufficient', success: true };
    }
    var BLOCK = (typeof opts.blockThreshold === 'number') ? opts.blockThreshold : 5;
    var ASYNC = (typeof opts.asyncThreshold === 'number') ? opts.asyncThreshold : 30;
    var TIMEOUT = opts.timeoutMs || 18000;
    var OVERLAY_DELAY = (typeof opts.overlayDelayMs === 'number') ? opts.overlayDelayMs : 1200;

    // 1. Quick pool status check
    var unseen = null;
    try {
      var r = await rpc(opts.statusRpc, opts.statusArgs || {});
      if (r && r.ok) {
        var rows = await r.json();
        var s = Array.isArray(rows) ? rows[0] : rows;
        unseen = (s && typeof s.unseen === 'number') ? s.unseen : null;
      }
    } catch (e) { /* can't check — proceed without block */ }

    if (unseen === null || unseen >= ASYNC) {
      return { mode: 'sufficient', success: true };
    }

    if (unseen >= BLOCK) {
      // Mid-tier: fire async top-up, do not block the kid.
      try {
        fetch(opts.generatorPath, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(opts.generatorBody || {}),
          keepalive: true,
        }).catch(function () {});
      } catch (e) {}
      return { mode: 'async', success: true };
    }

    // Below BLOCK threshold: synchronous warmup.
    var overlay = null;
    var overlayTimer = setTimeout(function () {
      overlay = createWarmupOverlay(opts.warmupText);
    }, OVERLAY_DELAY);

    var controller = (typeof AbortController === 'function') ? new AbortController() : null;
    var abortTimer = setTimeout(function () {
      if (controller) controller.abort();
    }, TIMEOUT);

    var success = false;
    try {
      var fetchOpts = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(opts.generatorBody || {}),
      };
      if (controller) fetchOpts.signal = controller.signal;
      var resp = await fetch(opts.generatorPath, fetchOpts);
      success = !!(resp && resp.ok);
    } catch (e) {
      success = false;
    } finally {
      clearTimeout(overlayTimer);
      clearTimeout(abortTimer);
      if (overlay) removeWarmupOverlay(overlay);
    }
    return { mode: 'blocking', success: success };
  }

  // -- Overlay UI -------------------------------------------------------------
  var WARMUP_STYLE_INSTALLED = false;
  function ensureWarmupStyle() {
    if (WARMUP_STYLE_INSTALLED) return;
    WARMUP_STYLE_INSTALLED = true;
    var st = document.createElement('style');
    st.id = 'haPoolWarmupStyle';
    st.textContent =
      '#haPoolWarmup{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center}' +
      '#haPoolWarmup .hpw-scrim{position:absolute;inset:0;background:rgba(8,6,30,0.78);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}' +
      '#haPoolWarmup .hpw-card{position:relative;background:linear-gradient(135deg,#1a1138,#2a1858);border:2px solid rgba(255,209,71,0.4);border-radius:24px;padding:28px 36px 32px;text-align:center;max-width:320px;box-shadow:0 20px 60px rgba(0,0,0,0.5);animation:hpw-pop 360ms cubic-bezier(0.34,1.56,0.64,1) both}' +
      '#haPoolWarmup .hpw-card img{width:128px;height:128px;display:block;margin:0 auto}' +
      '#haPoolWarmup .hpw-spinner{width:32px;height:32px;border:4px solid rgba(255,209,71,0.2);border-top-color:#ffd147;border-radius:50%;margin:12px auto 14px;animation:hpw-spin 0.9s linear infinite}' +
      '#haPoolWarmup .hpw-text{color:#fff;font-family:Fredoka,system-ui,sans-serif;font-weight:600;font-size:17px;line-height:1.35}' +
      '@keyframes hpw-spin{to{transform:rotate(360deg)}}' +
      '@keyframes hpw-pop{from{transform:scale(0.85);opacity:0}to{transform:scale(1);opacity:1}}';
    document.head.appendChild(st);
  }
  function createWarmupOverlay(customText) {
    ensureWarmupStyle();
    var existing = document.getElementById('haPoolWarmup');
    if (existing) return existing;
    var div = document.createElement('div');
    div.id = 'haPoolWarmup';
    var text = customText || 'Getting fresh problems just for you, Nigel...';
    div.innerHTML =
      '<div class="hpw-scrim"></div>' +
      '<div class="hpw-card">' +
        '<img src="assets/ralphie/ralphie_thinking.webp" alt="" />' +
        '<div class="hpw-spinner"></div>' +
        '<div class="hpw-text">' + text + '</div>' +
      '</div>';
    document.body.appendChild(div);
    return div;
  }
  function removeWarmupOverlay(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  // --------------------------------------------------------------------------
  // Expose
  // --------------------------------------------------------------------------
  NS.Telemetry = {
    startSession: startSession,
    recordAttempt: recordAttempt,
    endSession: endSession,
    unlockCharacter: unlockCharacter,
    currentSessionId: currentSessionId,
    // Exposed so other zones (e.g. Word Tower content bank) can reuse the
    // shared Supabase auth/config without duplicating the publishable key.
    rpc: rpc,
    childId: function () { return NIGEL_ID; },
    warmupPool: warmupPool,
  };
})();
