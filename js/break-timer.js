/**
 * Hero Academy — Break Timer (v151)
 *
 * Floating "🌿 Take a Break" tab on the dashboard AND lesson pages.
 * v151 changes from v146:
 *   - Duration picker: tap → choose 5 / 10 / 15 minutes (was hardcoded 10)
 *   - Alarm chime on expiry via Web Audio API (two-tone pleasant bell)
 *   - Dashboard placement (added to index.html)
 *   - Humphrey announcement preserved (if loaded; silent otherwise per v145)
 *
 * State persists in localStorage so the timer survives page navigation.
 */
(function () {
  'use strict';
  if (window.__heroBreakTimer) return;
  window.__heroBreakTimer = true;

  var END_TS_KEY      = 'ha_break_end_ts';
  var EXPIRED_KEY     = 'ha_break_done';
  var TICK_MS         = 1000;
  var DURATIONS       = [
    { label: '5 min',  ms: 5 * 60 * 1000 },
    { label: '10 min', ms: 10 * 60 * 1000 },
    { label: '15 min', ms: 15 * 60 * 1000 },
  ];

  var rootEl = null, labelEl = null, pickerEl = null, tickHandle = null;

  // --- Storage helpers ---
  function readEndTs() {
    try { var n = parseInt(localStorage.getItem(END_TS_KEY), 10); return isNaN(n) || n <= 0 ? 0 : n; }
    catch (_) { return 0; }
  }
  function writeEndTs(ts) { try { ts ? localStorage.setItem(END_TS_KEY, String(ts)) : localStorage.removeItem(END_TS_KEY); } catch (_) {} }
  function readExpired() { try { return localStorage.getItem(EXPIRED_KEY) === '1'; } catch (_) { return false; } }
  function writeExpired(v) { try { v ? localStorage.setItem(EXPIRED_KEY, '1') : localStorage.removeItem(EXPIRED_KEY); } catch (_) {} }

  function phase() {
    var end = readEndTs();
    if (!end) return readExpired() ? 'expired' : 'idle';
    return Date.now() >= end ? 'expired' : 'running';
  }
  function msLeft() { var e = readEndTs(); return e ? Math.max(0, e - Date.now()) : 0; }
  function fmt(ms) {
    var s = Math.ceil(ms / 1000), mm = Math.floor(s / 60), ss = s % 60;
    return mm + ':' + (ss < 10 ? '0' + ss : ss);
  }

  // --- Alarm (Web Audio API chime) ---
  function playAlarm() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      function tone(freq, start, dur) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = freq;
        g.gain.setValueAtTime(0.35, ctx.currentTime + start);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur);
      }
      // Pleasant two-note chime, repeated 3 times
      for (var i = 0; i < 3; i++) {
        tone(523.25, i * 0.65, 0.3);   // C5
        tone(659.25, i * 0.65 + 0.2, 0.35); // E5
      }
      setTimeout(function () { ctx.close(); }, 3000);
    } catch (_) {}
  }

  // --- DOM ---
  function ensureStyles() {
    if (document.getElementById('ha-break-styles')) return;
    var s = document.createElement('style');
    s.id = 'ha-break-styles';
    s.textContent = [
      '.ha-break-tab { position: fixed; left: 14px; bottom: 14px; z-index: 9000;',
      '  min-width: 132px; padding: 10px 16px; border-radius: 999px; border: none;',
      '  background: linear-gradient(135deg, #1f7a3a, #2ec27e); color: #fff;',
      '  font: 600 14px/1 "Fredoka", system-ui, sans-serif; letter-spacing: .02em;',
      '  box-shadow: 0 4px 14px rgba(0,0,0,.32); cursor: pointer; user-select: none;',
      '  display: inline-flex; align-items: center; gap: 8px;',
      '  transition: transform .15s, box-shadow .15s, background .25s; }',
      '.ha-break-tab:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,.4); }',
      '.ha-break-tab:active { transform: translateY(0); }',
      '.ha-break-tab.is-running { background: linear-gradient(135deg, #1a4d8a, #3b82d6); }',
      '.ha-break-tab.is-expired {',
      '  background: linear-gradient(135deg, #c2410c, #f59e0b);',
      '  animation: ha-bp 1.2s ease-in-out infinite; }',
      '@keyframes ha-bp {',
      '  0%,100%{box-shadow:0 4px 14px rgba(0,0,0,.32),0 0 0 0 rgba(245,158,11,.55)}',
      '  50%{box-shadow:0 4px 14px rgba(0,0,0,.32),0 0 0 14px rgba(245,158,11,0)} }',
      '.ha-break-picker { position: fixed; left: 14px; bottom: 58px; z-index: 9001;',
      '  background: #1a2633; border-radius: 14px; padding: 8px;',
      '  box-shadow: 0 8px 24px rgba(0,0,0,.5); display: flex; flex-direction: column; gap: 6px; }',
      '.ha-break-picker button { background: rgba(255,255,255,.1); color: #fff; border: none;',
      '  border-radius: 10px; padding: 10px 18px; font: 600 14px/1 "Fredoka", sans-serif;',
      '  cursor: pointer; transition: background .15s; white-space: nowrap; }',
      '.ha-break-picker button:hover { background: rgba(46,194,126,.4); }',
      '@media (max-width:480px) {',
      '  .ha-break-tab { left: 10px; bottom: 10px; min-width: 116px; padding: 9px 14px; font-size: 13px; }',
      '  .ha-break-picker { left: 10px; bottom: 52px; } }',
    ].join('\n');
    document.head.appendChild(s);
  }

  function mount() {
    if (rootEl) return;
    ensureStyles();
    rootEl = document.createElement('button');
    rootEl.type = 'button'; rootEl.className = 'ha-break-tab';
    rootEl.setAttribute('aria-live', 'polite');
    labelEl = document.createElement('span');
    rootEl.appendChild(labelEl);
    rootEl.addEventListener('click', handleTap);
    document.body.appendChild(rootEl);
  }

  function render() {
    if (!rootEl) mount();
    var p = phase();
    rootEl.classList.toggle('is-running', p === 'running');
    rootEl.classList.toggle('is-expired', p === 'expired');
    if (p === 'running') {
      labelEl.textContent = '🌿 Break · ' + fmt(msLeft());
      rootEl.setAttribute('aria-label', 'Break: ' + fmt(msLeft()) + ' left. Tap to end early.');
    } else if (p === 'expired') {
      labelEl.textContent = "🌿 Break's over!";
      rootEl.setAttribute('aria-label', "Break finished. Tap to dismiss.");
    } else {
      labelEl.textContent = '🌿 Take a Break';
      rootEl.setAttribute('aria-label', 'Start a break. Tap to choose 5, 10, or 15 minutes.');
    }
  }

  // --- Picker ---
  function showPicker() {
    if (pickerEl) { hidePicker(); return; }
    pickerEl = document.createElement('div');
    pickerEl.className = 'ha-break-picker';
    DURATIONS.forEach(function (d) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = '🌿 ' + d.label;
      b.addEventListener('click', function () { hidePicker(); startBreak(d.ms); });
      pickerEl.appendChild(b);
    });
    document.body.appendChild(pickerEl);
    // Close picker on click outside
    setTimeout(function () {
      document.addEventListener('click', outsideClick, true);
    }, 50);
  }
  function hidePicker() {
    if (pickerEl) { pickerEl.remove(); pickerEl = null; }
    document.removeEventListener('click', outsideClick, true);
  }
  function outsideClick(e) {
    if (pickerEl && !pickerEl.contains(e.target) && e.target !== rootEl) hidePicker();
  }

  // --- Tap handler ---
  function handleTap() {
    var p = phase();
    if (p === 'idle') {
      showPicker();
    } else if (p === 'running') {
      if (window.confirm('End your break now? ' + fmt(msLeft()) + ' left.')) {
        endBreak(false);
      }
    } else {
      dismissExpired();
    }
  }

  // --- Lifecycle ---
  function startBreak(durationMs) {
    writeEndTs(Date.now() + durationMs);
    writeExpired(false);
    var mins = Math.round(durationMs / 60000);
    sayIfAvailable('break-start', mins + '-minute break, Nigel. Stretch, drink some water, come back fresh.');
    render();
    startTicking();
  }

  function endBreak(viaExpiry) {
    writeEndTs(0);
    if (viaExpiry) {
      writeExpired(true);
      playAlarm();
      sayIfAvailable('break-over', "Break's done, Nigel. Ready to keep going?");
    } else {
      writeExpired(false);
    }
    render();
    if (!viaExpiry) stopTicking();
  }

  function dismissExpired() { writeExpired(false); render(); stopTicking(); }

  function startTicking() {
    stopTicking();
    tickHandle = setInterval(function () {
      var p = phase();
      if (p === 'running') { render(); }
      else if (p === 'expired' && !readExpired()) { endBreak(true); }
      else if (p === 'idle') { stopTicking(); render(); }
      else { render(); }
    }, TICK_MS);
  }
  function stopTicking() { if (tickHandle) { clearInterval(tickHandle); tickHandle = null; } }

  function sayIfAvailable(key, text) {
    try {
      var H = window.HeroAcademy && window.HeroAcademy.Humphrey;
      if (H && typeof H.say === 'function') H.say(key, { kidName: 'Nigel', text: text, priority: 'high' });
    } catch (_) {}
  }

  // --- Boot ---
  function boot() {
    mount(); render();
    var p = phase();
    if (p === 'running') startTicking();
    else if (p === 'expired' && !readExpired()) endBreak(true);
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(boot, 50);
  else document.addEventListener('DOMContentLoaded', boot);

  window.HeroAcademy = window.HeroAcademy || {};
  window.HeroAcademy.BreakTimer = { start: startBreak, end: function () { endBreak(false); }, state: phase, remainingMs: msLeft };
})();
