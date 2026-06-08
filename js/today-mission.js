/**
 * Hero Academy — Today's Mission card (v2 — N steps, all subjects, 72 min).
 *
 * Lives on the home page only. On init:
 *   1. Look for a mission already generated today in localStorage
 *      (ha_mission_v2_<YYYY-MM-DD>). If found, render it.
 *   2. Otherwise POST /api/mission/today with current context and cache.
 *
 * v2 cache key (ha_mission_v2_*) is intentionally different from v1
 * (ha_mission_*) so today's existing 3-step missions get regenerated as
 * 7-step ones immediately after deploy. Old keys are left behind in
 * localStorage; cheap to ignore.
 *
 * Step completion model (unchanged from v1, intentionally generous):
 *   Each step has a baseline zoneProgress recorded at mission-creation time.
 *   A step is "done" when current zoneProgress[zone_id] > baseline OR when
 *   the user has visited that zone today after mission creation
 *   (ha_mission_visited_<YYYY-MM-DD>).
 *
 * Render:
 *   The card shows all steps in mission.steps[] (typically 7), each tagged
 *   with its subject color and emoji. Tap routes to the zone.
 *
 * Back-compat: if a mission lacks `steps[]` (cached pre-v80), the card
 * synthesizes a fake steps array from warmup/stretch/win so it still
 * renders cleanly.
 *
 * Public API:
 *   HeroAcademy.TodayMission.init({ container, state })
 *   HeroAcademy.TodayMission.markVisited(zoneId)    — call from openZoneModal
 *   HeroAcademy.TodayMission.refresh()              — re-render after a state change
 */
(function () {
  'use strict';
  var NS = window.HeroAcademy = window.HeroAcademy || {};
  if (NS.TodayMission) return;

  var ZONE_ROUTES = {
    'word-tower':  'word-tower.html',
    'story-time':  'story-time.html',
    'number-lab':  'cauldron-cafe.html',  // v88: route to themed Phaser game
    'discovery':   'discovery-dome.html',
    'explorer':    'explorers-hall.html',
    'writing':     'story-lab.html',
    'hero-hall':   'hero-hall.html',
    'letter-lab':  'letter-lab.html',     // v99: letter practice with Humphrey vision
  };

  var ZONE_EMOJI = {
    'word-tower': '\ud83d\udcd6',
    'story-time': '\ud83d\udcda',
    'number-lab': '\ud83d\udd22',
    'discovery':  '\ud83d\udd2c',
    'explorer':   '\ud83c\udf0d',
    'writing':    '\u270d\ufe0f',
    'hero-hall':  '\ud83c\udfc6',
    'letter-lab': '\u270d\ufe0f',       // v99: same pencil glyph as writing
  };

  // Subject → presentation. Used for the colored subject badge per step.
  var SUBJECT_META = {
    'reading': { label: 'Reading', color: '#14b8d4', emoji: '\ud83d\udcd6' },
    'math':    { label: 'Math',    color: '#ff8b3d', emoji: '\ud83d\udd22' },
    'writing': { label: 'Writing', color: '#a855f7', emoji: '\u270d\ufe0f' },
    'science': { label: 'Science', color: '#2ec27e', emoji: '\ud83d\udd2c' },
    'social':  { label: 'World',   color: '#ec4899', emoji: '\ud83c\udf0d' },
    'trophy':  { label: 'Win',     color: '#ffd147', emoji: '\ud83c\udfc6' },
  };
  function subjectMeta(subject) {
    return SUBJECT_META[subject] || { label: '', color: '#ffd147', emoji: '\u2728' };
  }

  // Reward characters for the celebration overlay.
  var REWARD_CHARACTERS = {
    'carlo':           { name: 'Captain Carlo',       emoji: '\ud83e\udda6', color: '#ef4444', tag: 'Cosmic Plumber' },
    'aurora':          { name: 'Aurora the Aviator',  emoji: '\ud83e\udd89', color: '#14b8d4', tag: 'High Skies Hero' },
    'shellback-squad': { name: 'The Shellback Squad', emoji: '\ud83d\udc22', color: '#ff8b3d', tag: 'Ralphie\u2019s Cousins' },
    'webly':           { name: 'Webly Quickfoot',     emoji: '\ud83d\udd77\ufe0f', color: '#a855f7', tag: 'The Web-Slinger' },
    'toybox-team':     { name: 'The Toybox Team',     emoji: '\ud83e\uddf8', color: '#ec4899', tag: 'Living Toys' },
  };
  function rewardChar(key) {
    return REWARD_CHARACTERS[key] || REWARD_CHARACTERS['aurora'];
  }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function readJSON(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  var ctx = { container: null, state: null };

  function readAppState() {
    try {
      var raw = localStorage.getItem('hero_academy_state_v1');
      var parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : { zoneProgress: {} };
    } catch (e) { return { zoneProgress: {} }; }
  }

  function init(opts) {
    opts = opts || {};
    ctx.container = opts.container || document.getElementById('todayMissionCard');
    ctx.state = opts.state || readAppState();
    if (!ctx.container) return;
    loadOrGenerate().then(render).catch(function (e) {
      ctx.container.hidden = true;
      console.warn('[mission] init failed:', e && e.message || e);
    });
  }

  // v2 cache key — keeps us isolated from any v1 mission still in storage.
  function cacheKey() { return 'ha_mission_v2_' + todayKey(); }

  function loadOrGenerate() {
    var key = cacheKey();
    var cached = readJSON(key);
    if (cached && isValidCachedMission(cached)) {
      if (!cached.db_persisted) persistMissionToDb(cached);
      return Promise.resolve(cached);
    }
    return generateForToday().then(function (m) {
      // Normalize: ensure we have a steps[] array even from old API responses.
      m = normalizeMission(m);
      // Snapshot zone progress at creation time so we can detect deltas.
      m.baseline = {};
      var zp = (ctx.state && ctx.state.zoneProgress) || {};
      m.steps.forEach(function (s) {
        if (s && s.zone_id) m.baseline[s.zone_id] = zp[s.zone_id] || 0;
      });
      m.created_at = new Date().toISOString();
      writeJSON(key, m);
      persistMissionToDb(m);
      return m;
    });
  }

  // A cached mission is valid if it has a non-empty steps[] (new shape) OR
  // the legacy warmup/stretch/win triplet (we'll synthesize steps from those).
  function isValidCachedMission(m) {
    if (!m) return false;
    if (Array.isArray(m.steps) && m.steps.length > 0) return true;
    return !!(m.warmup && m.stretch && m.win);
  }

  // Ensure mission has a steps[] array. If only legacy anchors exist, build
  // a 3-step steps array from them (back-compat path).
  function normalizeMission(m) {
    if (!m) return m;
    if (Array.isArray(m.steps) && m.steps.length > 0) return m;
    // Legacy: synthesize steps from warmup/stretch/win.
    var steps = [];
    if (m.warmup)  steps.push(Object.assign({ slot: 'warmup',  subject: subjectForZone(m.warmup.zone_id) }, m.warmup));
    if (m.stretch) steps.push(Object.assign({ slot: 'math',    subject: subjectForZone(m.stretch.zone_id) }, m.stretch));
    if (m.win)     steps.push(Object.assign({ slot: 'win',     subject: subjectForZone(m.win.zone_id) }, m.win));
    m.steps = steps;
    if (!m.total_minutes) {
      m.total_minutes = steps.reduce(function (sum, s) { return sum + (s.minutes || 0); }, 0);
    }
    return m;
  }
  function subjectForZone(zoneId) {
    var map = {
      'word-tower': 'reading', 'story-time': 'reading',
      'number-lab': 'math',
      'discovery':  'science',
      'explorer':   'social',
      'writing':    'writing',
      'letter-lab': 'writing',
      'hero-hall':  'trophy',
    };
    return map[zoneId] || 'reading';
  }

  // v99: Inject a Letter Lab step into today's mission on Mon/Wed/Fri.
  // Server-side mission generator doesn't know about letter-lab yet — this
  // keeps the rotation working immediately without a DB migration. The step
  // sits in position 2 (right after the warmup) so it's done early while
  // Nigel's focus is fresh. Idempotent: if letter-lab already exists in the
  // mission, do nothing.
  function injectLetterLabIfDueToday(m) {
    if (!m || !Array.isArray(m.steps)) return m;
    var alreadyHas = m.steps.some(function (s) { return s && s.zone_id === 'letter-lab'; });
    if (alreadyHas) return m;
    var dow = new Date().getDay(); // 0=Sun, 1=Mon, ... 5=Fri, 6=Sat
    var letterDays = [0, 1, 2, 3, 4, 5, 6];    // every day
    if (letterDays.indexOf(dow) === -1) return m;
    var step = {
      zone_id: 'letter-lab',
      slot:    'writing',
      subject: 'writing',
      title:   'Letter Lab',
      blurb:   'Practice letters and numbers with Ms. Humphrey on the drawing board.',
      minutes: 5,
    };
    // Insert after the first step so the warmup still leads.
    var newSteps = m.steps.slice();
    newSteps.splice(1, 0, step);
    return Object.assign({}, m, {
      steps: newSteps,
      total_minutes: (m.total_minutes || 0) + step.minutes,
    });
  }

  function persistMissionToDb(m) {
    // Fire-and-forget. localStorage remains the source of truth for UI.
    try {
      var T = (window.HeroAcademy && window.HeroAcademy.Telemetry) || null;
      if (!T || typeof T.rpc !== 'function') return;
      // Pack the full steps array into p_warmup.all_steps so the parent
      // dashboard (which reads via ha_parent_dashboard) can see all 7 steps
      // without a DB schema migration. The RPC just stores the JSONB as-is.
      var warmupAnchor = m.warmup || (m.steps && m.steps[0]) || null;
      var warmupWithSteps = warmupAnchor
        ? Object.assign({}, warmupAnchor, { all_steps: m.steps || [] })
        : { all_steps: m.steps || [] };
      T.rpc('ha_record_mission', {
        p_child_id:             T.childId(),
        p_mission_date:         todayKey(),
        p_warmup:               warmupWithSteps,
        p_stretch:              m.stretch || (m.steps && m.steps[Math.floor((m.steps.length - 1) / 2)]) || null,
        p_win:                  m.win     || (m.steps && m.steps[m.steps.length - 1]) || null,
        p_total_minutes:        m.total_minutes || 72,
        p_reward_character_key: m.reward_character_key || 'aurora',
        p_unlock_hint:          m.unlock_hint || '',
      }).then(function (r) {
        if (r && r.ok) {
          var key = cacheKey();
          var stored = readJSON(key);
          if (stored) { stored.db_persisted = true; writeJSON(key, stored); }
        }
      }).catch(function () { /* offline-safe */ });
    } catch (e) { /* never break the UI for telemetry */ }
  }

  function generateForToday() {
    var d = new Date();
    var zp = (ctx.state && ctx.state.zoneProgress) || {};
    var dayNum = d.getDay();
    var dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var recent = Object.keys(zp).sort(function (a, b) { return (zp[b] || 0) - (zp[a] || 0); }).slice(0, 3);

    // Homework signal mirrors js/app.js _haIsHomeworkDay
    var homeworkDue = (dayNum === 2 || dayNum === 4);
    var homeworkTopic = null;
    try {
      var hwRaw = localStorage.getItem('ha_homework_' + todayKey());
      if (hwRaw) {
        var hw = JSON.parse(hwRaw);
        homeworkTopic = hw && hw.topic || null;
        if (hw && hw.completed_count >= hw.target) homeworkDue = false;
      }
    } catch (e) {}

    var body = {
      day_of_week: dayNum,
      day_name: dayNames[dayNum],
      zone_progress: zp,
      recent_zones: recent,
      homework_due: homeworkDue,
      homework_topic: homeworkTopic,
    };

    return fetch('/api/mission/today', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function stepDone(step, mission) {
    if (!step || !step.zone_id) return false;
    // v99: letter-lab tracks completion via its own localStorage flag.
    if (step.zone_id === 'letter-lab') {
      return !!readJSON('ha_letter_lab_' + todayKey());
    }
    // v151: universal completion flag — set by each zone page on session
    // finish. Fixes the "zoneProgress at cap 100 == baseline" bug where
    // the checkmark never appeared for kids who'd played many sessions.
    var doneFlags = readJSON('ha_zone_done_' + todayKey()) || {};
    if (doneFlags[step.zone_id]) return true;

    var zp = (ctx.state && ctx.state.zoneProgress) || {};
    var base = (mission.baseline && mission.baseline[step.zone_id]) || 0;
    var cur = zp[step.zone_id] || 0;
    // v89: a step is "done" ONLY when real zoneProgress was made — entering
    // a zone (markVisited) is no longer enough. This prevents the checkmark
    // from appearing the instant a kid taps Enter without actually finishing.
    return cur > base;
  }

  function markVisited(zoneId) {
    if (!zoneId) return;
    var key = 'ha_mission_visited_' + todayKey();
    var visited = readJSON(key) || {};
    visited[zoneId] = true;
    writeJSON(key, visited);
    try {
      var T = (window.HeroAcademy && window.HeroAcademy.Telemetry) || null;
      if (!T || typeof T.rpc !== 'function') return;
      T.rpc('ha_mission_zone_done', {
        p_child_id:     T.childId(),
        p_mission_date: todayKey(),
        p_zone_id:      zoneId,
      }, { keepalive: true })
        .then(function (r) { return r && r.ok ? r.json() : null; })
        .then(function (result) {
          if (!result) return;
          if (result.just_completed) {
            writeJSON('ha_mission_just_completed_' + todayKey(), {
              reward_character_key: result.reward_character_key || 'aurora',
              at: Date.now(),
            });
          }
        }).catch(function () { /* offline-safe */ });
    } catch (e) {}
  }

  function refresh() {
    ctx.state = readAppState();
    var cached = readJSON(cacheKey());
    if (cached) render(cached);
  }

  function render(mission) {
    if (!ctx.container) return;
    mission = normalizeMission(mission);
    mission = injectLetterLabIfDueToday(mission);
    var steps = Array.isArray(mission.steps) ? mission.steps : [];
    if (steps.length === 0) {
      ctx.container.hidden = true;
      return;
    }

    var doneCount = 0;
    steps.forEach(function (s) { if (stepDone(s, mission)) doneCount++; });
    var allDone = doneCount === steps.length;

    var stepsHtml = steps.map(function (step, idx) {
      var done = stepDone(step, mission);
      var meta = subjectMeta(step.subject);
      var emoji = ZONE_EMOJI[step.zone_id] || meta.emoji || '\u2728';
      // v94: All pending steps render as a target. Slot-specific icons
      // (star for win, lightning for warmup) were confusing — they looked
      // like completion markers. Check now strictly means "actually done."
      var slotIcon = done ? '\u2705' : '\ud83c\udfaf';
      var blurb = step.blurb || '';
      return [
        '<li class="tm-step' + (done ? ' tm-step--done' : '') + '" data-zone="' + escapeAttr(step.zone_id) + '" data-slot="' + escapeAttr(step.slot || '') + '">',
        '  <span class="tm-step-icon" aria-hidden="true">' + slotIcon + '</span>',
        '  <div class="tm-step-body">',
        '    <div class="tm-step-meta">',
        '      <span class="tm-step-badge" style="--badge:' + meta.color + '">' + meta.emoji + ' ' + escapeHtml(meta.label) + '</span>',
        '      <span class="tm-step-time">' + (step.minutes || 0) + ' min</span>',
        '    </div>',
        '    <div class="tm-step-title">' + emoji + ' ' + escapeHtml(step.title || '') + '</div>',
        (blurb ? '    <div class="tm-step-blurb">' + escapeHtml(blurb) + '</div>' : ''),
        '  </div>',
        '</li>',
      ].join('');
    }).join('');

    var headlineIcon = allDone ? '\ud83c\udf89' : '\ud83c\udfaf';
    var headline = allDone
      ? 'Mission complete \u2014 amazing work, Nigel!'
      : 'Today\u2019s Mission';
    var subhead = allDone
      ? 'Come back tomorrow for a new mission.'
      : ('All subjects \u2022 ' + doneCount + ' of ' + steps.length + ' done');
    var hint = allDone ? '' : (mission.unlock_hint || '');

    ctx.container.hidden = false;
    ctx.container.innerHTML =
      '<div class="tm-card' + (allDone ? ' tm-card--complete' : '') + '">' +
        '<div class="tm-head">' +
          '<div class="tm-head-left">' +
            '<div class="tm-eyebrow">' + headlineIcon + ' ' + escapeHtml(headline) + '</div>' +
            '<div class="tm-subhead">' + escapeHtml(subhead) + '</div>' +
          '</div>' +
          '<span class="tm-total">' + (mission.total_minutes || 72) + ' min</span>' +
        '</div>' +
        '<ol class="tm-steps">' + stepsHtml + '</ol>' +
        (hint ? '<div class="tm-hint">' + escapeHtml(hint) + '</div>' : '') +
      '</div>';

    // Wire taps on each step → route to that zone's page. v85: Humphrey
    // announces the step before navigating, giving Nigel a confirmation moment
    // and bridging the transition with her voice. We strip the visual emoji
    // prefix so the spoken intro sounds natural ("Math time" not "🔢 Math time").
    Array.prototype.forEach.call(ctx.container.querySelectorAll('.tm-step'), function (el) {
      el.addEventListener('click', function () {
        var zoneId = el.getAttribute('data-zone');
        var url = ZONE_ROUTES[zoneId];
        if (!url) return;
        markVisited(zoneId);

        var titleEl = el.querySelector('.tm-step-title');
        var blurbEl = el.querySelector('.tm-step-blurb');
        var rawTitle = (titleEl && titleEl.textContent) || '';
        var rawBlurb = (blurbEl && blurbEl.textContent) || '';
        // Strip any leading emoji + whitespace
        var title = rawTitle.replace(/^[\uD83C-\uDBFF\uDC00-\uDFFF\u2600-\u27BF\uFE0F\u200D]+\s*/, '').trim();
        var blurb = rawBlurb.trim();

        var H = (window.HeroAcademy && window.HeroAcademy.Humphrey) || null;
        if (H && typeof H.say === 'function' && (!H.isMuted || !H.isMuted())) {
          try {
            H.say('mission_step_tap', {
              text: title + (blurb ? '. ' + blurb : '.'),
              expression: 'encouraging',
              priority: 'high',
            });
          } catch (e) {}
          // Delay navigation so the announcement can start playing before the
          // page unloads. 550ms is enough for the first word or two; the zone
          // page's own Humphrey welcome picks up after arrival.
          setTimeout(function () { window.location.href = url; }, 550);
        } else {
          window.location.href = url;
        }
      });
    });

    // Celebration overlay — fires when all steps done, once per day.
    if (allDone) {
      var celebKey = 'ha_mission_celebrated_' + todayKey();
      if (!localStorage.getItem(celebKey)) {
        var stashed = readJSON('ha_mission_just_completed_' + todayKey());
        var rewardKey = (stashed && stashed.reward_character_key) ||
                        mission.reward_character_key || 'aurora';
        try { localStorage.setItem(celebKey, String(Date.now())); } catch (e) {}
        setTimeout(function () { showCelebration(rewardKey); }, 250);
      }
    }
  }

  function showCelebration(rewardKey) {
    if (document.getElementById('tmCelebrate')) return;
    var ch = rewardChar(rewardKey);

    var overlay = document.createElement('div');
    overlay.id = 'tmCelebrate';
    overlay.className = 'tm-celebrate';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Mission complete');
    overlay.innerHTML = [
      '<div class="tm-celebrate__backdrop"></div>',
      '<div class="tm-celebrate__card" style="--reward-color:' + ch.color + '">',
      '  <div class="tm-celebrate__burst" aria-hidden="true">',
      '    <span>\u2728</span><span>\ud83c\udf89</span><span>\u2b50</span><span>\ud83c\udf86</span>',
      '    <span>\ud83c\udf1f</span><span>\u2728</span>',
      '  </div>',
      '  <div class="tm-celebrate__emoji" aria-hidden="true">' + ch.emoji + '</div>',
      '  <div class="tm-celebrate__eyebrow">Mission Complete!</div>',
      '  <div class="tm-celebrate__headline">You crushed every subject today, Nigel!</div>',
      '  <div class="tm-celebrate__unlock">',
      '    <span class="tm-celebrate__unlock-label">Cheering you on today</span>',
      '    <span class="tm-celebrate__unlock-name">' + escapeHtml(ch.name) + '</span>',
      '    <span class="tm-celebrate__unlock-tag">' + escapeHtml(ch.tag) + '</span>',
      '  </div>',
      '  <button type="button" class="tm-celebrate__cta">Awesome!</button>',
      '</div>',
    ].join('');
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('tm-celebrate--in'); });

    function close() {
      overlay.classList.remove('tm-celebrate--in');
      setTimeout(function () { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 280);
    }
    overlay.querySelector('.tm-celebrate__cta').addEventListener('click', close);
    overlay.querySelector('.tm-celebrate__backdrop').addEventListener('click', close);

    try {
      var H = (window.HeroAcademy && window.HeroAcademy.Humphrey) || null;
      if (H && typeof H.say === 'function') {
        H.say('mission_complete', {
          text: 'Wow, Nigel \u2014 you finished every subject in today\u2019s mission! ' +
                'Reading, math, writing, science, and social studies \u2014 a full hero day. ' +
                'I\u2019m so proud of you. Come back tomorrow and we\u2019ll start a fresh one.',
          expression: 'cheering',
        });
      }
    } catch (e) {}
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escapeAttr(s) { return escapeHtml(s); }

  NS.TodayMission = {
    init: init,
    markVisited: markVisited,
    refresh: refresh,
  };
})();
