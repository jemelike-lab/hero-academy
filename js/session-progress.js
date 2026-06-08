/**
 * Hero Academy — Session Progress Bar (v152)
 *
 * Thin bar at the top of the viewport showing "Step X of Y" with a fill.
 * Any zone calls HeroAcademy.SessionProgress.update(current, total, label?)
 * to advance. Stays out of the way — no layout shift, fixed-position overlay.
 *
 * Usage:
 *   HeroAcademy.SessionProgress.update(2, 5);           // "2 of 5"
 *   HeroAcademy.SessionProgress.update(3, 5, 'Recipe');  // "Recipe 3 of 5"
 *   HeroAcademy.SessionProgress.complete();              // "All done!" flash
 *   HeroAcademy.SessionProgress.hide();                  // remove from view
 */
(function () {
  'use strict';
  var NS = window.HeroAcademy = window.HeroAcademy || {};
  if (NS.SessionProgress) return;

  var barEl = null, fillEl = null, labelEl = null;

  function ensureStyles() {
    if (document.getElementById('ha-sp-css')) return;
    var s = document.createElement('style');
    s.id = 'ha-sp-css';
    s.textContent = [
      '.ha-sp { position:fixed; top:0; left:0; right:0; z-index:8500;',
      '  height:28px; background:rgba(15,23,42,0.88);',
      '  display:flex; align-items:center; gap:10px; padding:0 14px;',
      '  font:600 12px/1 "Fredoka",system-ui,sans-serif; color:#e2e8f0;',
      '  box-shadow:0 2px 8px rgba(0,0,0,0.3); transition:opacity .3s; }',
      '.ha-sp.hidden { opacity:0; pointer-events:none; }',
      '.ha-sp-track { flex:1; height:6px; border-radius:99px;',
      '  background:rgba(255,255,255,0.12); overflow:hidden; }',
      '.ha-sp-fill { height:100%; border-radius:99px;',
      '  background:linear-gradient(90deg,#2ec27e,#4dd99c);',
      '  transition:width .4s ease; }',
      '.ha-sp-label { white-space:nowrap; min-width:72px; text-align:right; letter-spacing:.03em; }',
      '.ha-sp.complete .ha-sp-fill { background:linear-gradient(90deg,#ffd147,#f59e0b); }',
      '@media(max-width:480px){',
      '  .ha-sp { height:24px; padding:0 10px; font-size:11px; }',
      '  .ha-sp-track { height:5px; }',
      '}',
    ].join('\n');
    document.head.appendChild(s);
  }

  function mount() {
    if (barEl) return;
    ensureStyles();
    barEl = document.createElement('div');
    barEl.className = 'ha-sp hidden';
    var track = document.createElement('div');
    track.className = 'ha-sp-track';
    fillEl = document.createElement('div');
    fillEl.className = 'ha-sp-fill';
    fillEl.style.width = '0%';
    track.appendChild(fillEl);
    labelEl = document.createElement('div');
    labelEl.className = 'ha-sp-label';
    barEl.appendChild(track);
    barEl.appendChild(labelEl);
    document.body.appendChild(barEl);
  }

  function update(current, total, label) {
    if (!barEl) mount();
    if (!total || total <= 0) return;
    var pct = Math.min(100, Math.round((current / total) * 100));
    fillEl.style.width = pct + '%';
    var prefix = label ? (label + ' ') : '';
    labelEl.textContent = prefix + current + ' of ' + total;
    barEl.classList.remove('hidden', 'complete');
  }

  function complete() {
    if (!barEl) mount();
    fillEl.style.width = '100%';
    labelEl.textContent = '✓ All done!';
    barEl.classList.remove('hidden');
    barEl.classList.add('complete');
  }

  function hide() {
    if (barEl) barEl.classList.add('hidden');
  }

  NS.SessionProgress = { update: update, complete: complete, hide: hide };
})();
