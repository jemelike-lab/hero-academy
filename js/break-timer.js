/**
 * Hero Academy — Break Timer (v146)
 *
 * A reusable 10-minute break timer that can be embedded on any Today's Mission
 * lesson page. State persists in localStorage so the timer survives navigation
 * between zones — Nigel can start a break in Cauldron, walk over to Word Tower,
 * and the timer is still ticking down in the corner.
 *
 * Tap the floating "🌿 Take a Break" tab to start. While running, the tab shows
 * a live MM:SS countdown. When time's up, Ms. Humphrey announces "Break's over"
 * (if she's loaded — per v145, we never fall back to window.speechSynthesis)
 * and the tab pulses until tapped to dismiss.
 *
 * localStorage keys:
 *   ha_break_end_ts  — timestamp (ms epoch) when the current break ends
 *   ha_break_done    — flag set when expiry has fired (prevents double-announce)
 *
 * No build step. No external deps. Drop the script tag in and it self-mounts.
 */
(function () {
  'use strict';

  if (window.__heroBreakTimer) return; // single-instance guard
  window.__heroBreakTimer = true;

  // --- Config -------------------------------------------------------------
  var BREAK_DURATION_MS = 10 * 60 * 1000; // 10 minutes
  var END_TS_KEY        = 'ha_break_end_ts';
  var EXPIRED_FLAG_KEY  = 'ha_break_done';
  var TICK_INTERVAL_MS  = 1000;

  // --- DOM refs -----------------------------------------------------------
  var rootEl = null;
  var labelEl = null;
  var tickHandle = null;

  // --- State helpers ------------------------------------------------------
  function readEndTs() {
    try {
      var raw = localStorage.getItem(END_TS_KEY);
      var n = raw ? parseInt(raw, 10) : 0;
      return (isNaN(n) || n <= 0) ? 0 : n;
    } catch (_) { return 0; }
  }
  function writeEndTs(ts) {
    try {
      if (!ts) localStorage.removeItem(END_TS_KEY);
      else     localStorage.setItem(END_TS_KEY, String(ts));
    } catch (_) {}
  }
  function readExpiredFlag() {
    try { return localStorage.getItem(EXPIRED_FLAG_KEY) === '1'; }
    catch (_) { return false; }
  }
  function writeExpiredFlag(v) {
    try {
      if (v) localStorage.setItem(EXPIRED_FLAG_KEY, '1');
      else   localStorage.removeItem(EXPIRED_FLAG_KEY);
    } catch (_) {}
  }
  function currentState() {
    var endTs = readEndTs();
    if (!endTs) return readExpiredFlag() ? 'expired' : 'idle';
    var now = Date.now();
    if (now >= endTs) return 'expired';
    return 'running';
  }
  function msRemaining() {
    var endTs = readEndTs();
    if (!endTs) return 0;
    return Math.max(0, endTs - Date.now());
  }
  function formatTime(ms) {
    var s = Math.ceil(ms / 1000);
    var mm = Math.floor(s / 60);
    var ss = s % 60;
    return mm + ':' + (ss < 10 ? '0' + ss : ss);
  }

  // --- Render -------------------------------------------------------------
  function ensureStyles() {
    if (document.getElementById('ha-break-styles')) return;
    var s = document.createElement('style');
    s.id = 'ha-break-styles';
    s.textContent = [
      '.ha-break-tab {',
      '  position: fixed; left: 14px; bottom: 14px; z-index: 9000;',
      '  min-width: 132px; padding: 10px 16px;',
      '  border-radius: 999px; border: none;',
      '  background: linear-gradient(135deg, #1f7a3a, #2ec27e);',
      '  color: #fff; font: 600 14px/1 "Fredoka", system-ui, sans-serif;',
      '  letter-spacing: 0.02em;',
      '  box-shadow: 0 4px 14px rgba(0,0,0,.32), 0 0 0 1px rgba(255,255,255,.06) inset;',
      '  cursor: pointer; user-select: none;',
      '  display: inline-flex; align-items: center; gap: 8px;',
      '  transition: transform .15s ease, box-shadow .15s ease, background .25s ease;',
      '}',
      '.ha-break-tab:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,.4); }',
      '.ha-break-tab:active { transform: translateY(0); }',
      '.ha-break-tab.is-running {',
      '  background: linear-gradient(135deg, #1a4d8a, #3b82d6);',
      '}',
      '.ha-break-tab.is-expired {',
      '  background: linear-gradient(135deg, #c2410c, #f59e0b);',
      '  animation: ha-break-pulse 1.2s ease-in-out infinite;',
      '}',
      '@keyframes ha-break-pulse {',
      '  0%, 100% { box-shadow: 0 4px 14px rgba(0,0,0,.32), 0 0 0 0 rgba(245,158,11,.55); }',
      '  50%      { box-shadow: 0 4px 14px rgba(0,0,0,.32), 0 0 0 14px rgba(245,158,11,0); }',
      '}',
      '@media (max-width: 480px) {',
      '  .ha-break-tab { left: 10px; bottom: 10px; min-width: 116px; padding: 9px 14px; font-size: 13px; }',
      '}',
    ].join('\n');
    document.head.appendChild(s);
  }

  function mount() {
    if (rootEl) return;
    ensureStyles();
    rootEl = document.createElement('button');
    rootEl.type = 'button';
    rootEl.className = 'ha-break-tab';
    rootEl.setAttribute('aria-live', 'polite');
    labelEl = document.createElement('span');
    labelEl.className = 'ha-break-label';
    rootEl.appendChild(labelEl);
    rootEl.addEventListener('click', handleTap);
    document.body.appendChild(rootEl);
  }

  function render() {
    if (!rootEl) mount();
    var phase = currentState();
    rootEl.classList.toggle('is-running', phase === 'running');
    rootEl.classList.toggle('is-expired', phase === 'expired');
    if (phase === 'running') {
      labelEl.textContent = '🌿 Break · ' + formatTime(msRemaining());
      rootEl.setAttribute('aria-label', 'Break in progress, ' + formatTime(msRemaining()) + ' remaining. Tap to end early.');
    } else if (phase === 'expired') {
      labelEl.textContent = "🌿 Break's over!";
      rootEl.setAttribute('aria-label', "Break finished. Tap to dismiss.");
    } else {
      labelEl.textContent = '🌿 Take a Break';
      rootEl.setAttribute('aria-label', 'Start a 10-minute break.');
    }
  }

  // --- Tap handler --------------------------------------------------------
  function handleTap() {
    var phase = currentState();
    if (phase === 'idle') {
      startBreak();
    } else if (phase === 'running') {
      // Confirm end-early so a stray tap doesn't kill an active break.
      if (window.confirm("End your break now? You still have " + formatTime(msRemaining()) + " left.")) {
        endBreak(/*expired*/false);
      }
    } else { // expired
      dismissExpired();
    }
  }

  // --- Lifecycle ----------------------------------------------------------
  function startBreak() {
    var endTs = Date.now() + BREAK_DURATION_MS;
    writeEndTs(endTs);
    writeExpiredFlag(false);
    sayIfAvailable('break-start', "Break time, Nigel. Ten minutes. Stretch, drink some water, come back fresh.");
    render();
    startTicking();
  }

  function endBreak(viaExpiry) {
    writeEndTs(0);
    if (viaExpiry) {
      writeExpiredFlag(true);
      sayIfAvailable('break-over', "Break's done, Nigel. Ready to keep going?");
    } else {
      writeExpiredFlag(false);
    }
    render();
    if (!viaExpiry) stopTicking();
  }

  function dismissExpired() {
    writeExpiredFlag(false);
    render();
    stopTicking();
  }

  function startTicking() {
    stopTicking();
    tickHandle = setInterval(function () {
      var phase = currentState();
      if (phase === 'running') {
        render();
      } else if (phase === 'expired' && !readExpiredFlag()) {
        // Just crossed the boundary — fire the announcement once.
        endBreak(/*expired*/true);
      } else if (phase === 'idle') {
        stopTicking();
        render();
      } else {
        render();
      }
    }, TICK_INTERVAL_MS);
  }

  function stopTicking() {
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
  }

  // --- Humphrey integration ----------------------------------------------
  // Per v145, we never fall back to window.speechSynthesis. If Humphrey isn't
  // loaded the break-over announcement is visual-only (pulsing tab), which is
  // still adequate — the kid sees the orange tab and hears nothing weird.
  function sayIfAvailable(eventKey, text) {
    try {
      var H = window.HeroAcademy && window.HeroAcademy.Humphrey;
      if (H && typeof H.say === 'function') {
        H.say(eventKey, { kidName: 'Nigel', text: text, priority: 'high' });
      }
    } catch (_) {}
  }

  // --- Boot ---------------------------------------------------------------
  function boot() {
    mount();
    render();
    var phase = currentState();
    if (phase === 'running') {
      startTicking();
    } else if (phase === 'expired' && !readExpiredFlag()) {
      // Page loaded after a break already expired without anyone noticing.
      // Surface the visual + announce once.
      endBreak(/*expired*/true);
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 50);
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }

  // --- Public API (for debugging / future zone integration) --------------
  window.HeroAcademy = window.HeroAcademy || {};
  window.HeroAcademy.BreakTimer = {
    start: startBreak,
    end:   function () { endBreak(false); },
    state: currentState,
    remainingMs: msRemaining,
  };
})();
