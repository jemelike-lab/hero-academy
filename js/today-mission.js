/**
 * Hero Academy \u2014 Today\u2019s Mission card.
 *
 * Lives on the home page only. On init:
 *   1. Look for a mission already generated today in localStorage
 *      (ha_mission_<YYYY-MM-DD>). If found, render it.
 *   2. Otherwise POST /api/mission/today with current context and cache the
 *      response under today\u2019s key.
 *
 * Step completion model (V1, intentionally generous):
 *   Each step has a baseline zoneProgress recorded at mission-creation time.
 *   A step is \"done\" when current zoneProgress[zone_id] > baseline OR when the
 *   user has visited that zone today after mission creation (tracked via
 *   ha_mission_visited_<YYYY-MM-DD>).
 *
 * The first step Nigel hasn\u2019t finished gets the gold \"Start\" button.
 *
 * Public API:
 *   HeroAcademy.TodayMission.init({ container, state })
 *   HeroAcademy.TodayMission.markVisited(zoneId)    \u2014 call from openZoneModal
 *   HeroAcademy.TodayMission.refresh()              \u2014 re-render after a state change
 */
(function () {
  'use strict';
  var NS = window.HeroAcademy = window.HeroAcademy || {};
  if (NS.TodayMission) return;

  var ZONE_ROUTES = {
    'word-tower':  'word-tower.html',
    'story-time':  'story-time.html',
    'number-lab':  'number-lab.html',
    'discovery':   'discovery-dome.html',
    'explorer':    'diner-lanes.html',
    'writing':     'story-lab.html',
    'hero-hall':   'hero-hall.html',
  };

  var ZONE_EMOJI = {
    'word-tower': '\ud83d\udcd6',
    'story-time': '\ud83d\udcda',
    'number-lab': '\ud83d\udd22',
    'discovery':  '\ud83d\udd2c',
    'explorer':   '\ud83c\udf0d',
    'writing':    '\u270d\ufe0f',
    'hero-hall':  '\ud83c\udfc6',
  };

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
      // On total failure, hide the card rather than show broken UI
      ctx.container.hidden = true;
      console.warn('[mission] init failed:', e && e.message || e);
    });
  }

  function loadOrGenerate() {
    var key = 'ha_mission_' + todayKey();
    var cached = readJSON(key);
    if (cached && cached.warmup && cached.stretch && cached.win) {
      return Promise.resolve(cached);
    }
    return generateForToday().then(function (m) {
      // Snapshot zone progress at creation time so we can detect deltas
      m.baseline = {};
      var zp = (ctx.state && ctx.state.zoneProgress) || {};
      ['warmup', 'stretch', 'win'].forEach(function (slot) {
        m.baseline[m[slot].zone_id] = zp[m[slot].zone_id] || 0;
      });
      m.created_at = new Date().toISOString();
      writeJSON(key, m);
      return m;
    });
  }

  function generateForToday() {
    var d = new Date();
    var zp = (ctx.state && ctx.state.zoneProgress) || {};
    var dayNum = d.getDay();
    var dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

    // Recent zones = whatever the state remembers from the last 3 days,
    // best-effort. For V1 we just use today\u2019s zone progress to weight things.
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
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  function stepDone(step, mission) {
    if (!step || !step.zone_id) return false;
    var zp = (ctx.state && ctx.state.zoneProgress) || {};
    var base = (mission.baseline && mission.baseline[step.zone_id]) || 0;
    var cur = zp[step.zone_id] || 0;
    if (cur > base) return true;
    var visited = readJSON('ha_mission_visited_' + todayKey()) || {};
    return !!visited[step.zone_id];
  }

  function markVisited(zoneId) {
    if (!zoneId) return;
    var key = 'ha_mission_visited_' + todayKey();
    var visited = readJSON(key) || {};
    visited[zoneId] = true;
    writeJSON(key, visited);
  }

  function refresh() {
    // Re-read state from localStorage so freshly-updated zoneProgress counts.
    ctx.state = readAppState();
    var key = 'ha_mission_' + todayKey();
    var cached = readJSON(key);
    if (cached) render(cached);
  }

  function render(mission) {
    if (!ctx.container) return;
    var slots = ['warmup', 'stretch', 'win'];
    var allDone = slots.every(function (s) { return stepDone(mission[s], mission); });

    var stepsHtml = slots.map(function (slot, idx) {
      var step = mission[slot];
      var done = stepDone(step, mission);
      var emoji = ZONE_EMOJI[step.zone_id] || '\u2728';
      var slotIcon = done ? '\u2705' : (idx === 0 ? '\u26a1' : (idx === 1 ? '\ud83c\udfaf' : '\ud83c\udf1f'));
      return [
        '<li class="tm-step' + (done ? ' tm-step--done' : '') + '" data-zone="' + escapeAttr(step.zone_id) + '" data-slot="' + slot + '">',
        '  <span class="tm-step-icon" aria-hidden="true">' + slotIcon + '</span>',
        '  <div class="tm-step-body">',
        '    <div class="tm-step-title">' + emoji + ' ' + escapeHtml(step.title) + ' <span class="tm-step-time">' + step.minutes + ' min</span></div>',
        '    <div class="tm-step-blurb">' + escapeHtml(step.blurb) + '</div>',
        '  </div>',
        '</li>',
      ].join('');
    }).join('');

    var headlineIcon = allDone ? '\ud83c\udf89' : '\ud83c\udfaf';
    var headline = allDone ? 'Mission complete \u2014 amazing work, Nigel!' : 'Today\u2019s Mission';
    var hint = allDone ? 'Come back tomorrow for a new mission.' : (mission.unlock_hint || '');

    ctx.container.hidden = false;
    ctx.container.innerHTML =
      '<div class="tm-card' + (allDone ? ' tm-card--complete' : '') + '">' +
        '<div class="tm-head">' +
          '<span class="tm-eyebrow">' + headlineIcon + ' ' + escapeHtml(headline) + '</span>' +
          '<span class="tm-total">' + (mission.total_minutes || 25) + ' min</span>' +
        '</div>' +
        '<ol class="tm-steps">' + stepsHtml + '</ol>' +
        (hint ? '<div class="tm-hint">' + escapeHtml(hint) + '</div>' : '') +
      '</div>';

    // Wire taps on each step \u2192 route to that zone\u2019s page
    Array.prototype.forEach.call(ctx.container.querySelectorAll('.tm-step'), function (el) {
      el.addEventListener('click', function () {
        var zoneId = el.getAttribute('data-zone');
        var url = ZONE_ROUTES[zoneId];
        if (!url) return;
        markVisited(zoneId);
        window.location.href = url;
      });
    });
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
