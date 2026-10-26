/**
 * Hero Academy — Manipulatives.
 *
 * Provides interactive math manipulatives that Nigel taps/drags to build
 * numbers visually. Sits alongside the Humphrey-drawn canvas so Nigel can
 * EITHER watch Humphrey explain on the whiteboard OR build the answer
 * himself with concrete objects on screen.
 *
 * V1 ships:
 *   - tenFrame  — 2×5 grid of cells; tap to toggle a counter. Anchors
 *                 make-10 / add-within-20 / subtract-from-10 strategies.
 *
 * Public API (under window.HeroAcademy.Manipulatives.tenFrame):
 *
 *   mount(host, opts?) -> { unmount(), set(n), value(), demoFill(n, opts?) }
 *
 *     opts = {
 *       initial:    number   // starting value (default 0)
 *       max:        10       // cap (default 10)
 *       onChange:   fn(n)    // fires after every change
 *       readonly:   bool     // if true, ignore taps (for Humphrey demos)
 *     }
 *
 *   demoFill(n, { fromZero=true, durationPerDot=180 })
 *      Animates filling cells one at a time. Returns Promise.
 *
 *   The manipulative is intentionally framework-free vanilla JS so it can
 *   mount inside any zone container without React/build overhead.
 */
(function () {
  'use strict';

  var NS = window.HeroAcademy = window.HeroAcademy || {};
  if (NS.Manipulatives && NS.Manipulatives.tenFrame) return;

  // ============================================================
  // Ten-Frame
  // ============================================================

  function mountTenFrame(host, opts) {
    opts = opts || {};
    var initial  = clamp(opts.initial || 0, 0, opts.max || 10);
    var max      = opts.max || 10;
    var onChange = typeof opts.onChange === 'function' ? opts.onChange : function () {};
    var readonly = !!opts.readonly;

    if (!host) { console.warn('[manipulatives] mount: no host'); return null; }

    // Clear any prior content
    host.innerHTML = '';
    host.classList.add('mp-tenframe-host');

    var root = document.createElement('div');
    root.className = 'mp-tenframe';
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Ten frame counter');

    var grid = document.createElement('div');
    grid.className = 'mp-tenframe__grid';

    var cells = [];
    for (var i = 0; i < max; i++) {
      var cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'mp-tenframe__cell';
      cell.setAttribute('aria-pressed', 'false');
      cell.setAttribute('aria-label', 'Cell ' + (i + 1));
      cell.dataset.index = String(i);
      grid.appendChild(cell);
      cells.push(cell);
    }
    root.appendChild(grid);

    var readout = document.createElement('div');
    readout.className = 'mp-tenframe__readout';
    readout.innerHTML =
      '<span class="mp-tenframe__count" id="mpTenFrameCount">0</span>' +
      '<span class="mp-tenframe__label">filled</span>';
    root.appendChild(readout);

    var controls = document.createElement('div');
    controls.className = 'mp-tenframe__controls';
    controls.innerHTML =
      '<button type="button" class="mp-tenframe__btn mp-tenframe__btn--clear" aria-label="Clear all">Clear</button>';
    root.appendChild(controls);

    host.appendChild(root);

    // ---- State -------------------------------------------------------------
    var state = { filled: 0, dragging: false, dragSetTo: null };
    var countEl = root.querySelector('#mpTenFrameCount');

    function applyCount(n, fromUser) {
      n = clamp(n, 0, max);
      state.filled = n;
      for (var i = 0; i < cells.length; i++) {
        var on = i < n;
        cells[i].classList.toggle('is-filled', on);
        cells[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      countEl.textContent = String(n);
      // Visual color pulse when value changes
      countEl.classList.remove('is-pulse');
      // Re-flow then re-add to restart animation
      // eslint-disable-next-line no-unused-expressions
      countEl.offsetHeight;
      countEl.classList.add('is-pulse');
      if (fromUser) onChange(n);
    }

    // ---- Tap behaviour -----------------------------------------------------
    function cellAtPoint(x, y) {
      var el = document.elementFromPoint(x, y);
      if (!el) return null;
      var c = el.closest && el.closest('.mp-tenframe__cell');
      return c && cells.indexOf(c) >= 0 ? c : null;
    }

    function onCellTap(cell) {
      if (readonly) return;
      var idx = parseInt(cell.dataset.index, 10);
      // Smart fill: tap an empty cell → fill up to and including it
      //            tap a filled cell → clear from that cell on (so the count drops)
      var wasFilled = cell.classList.contains('is-filled');
      var nextCount = wasFilled ? idx : (idx + 1);
      applyCount(nextCount, true);
    }

    // Wire each cell
    cells.forEach(function (cell) {
      cell.addEventListener('click', function () { onCellTap(cell); });
    });

    // Drag-to-fill (touch + mouse): set dragSetTo on first cell, then
    // any cell entered while dragging gets that state too.
    function onPointerDown(e) {
      if (readonly) return;
      var x = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX);
      var y = e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY);
      var c = cellAtPoint(x, y);
      if (!c) return;
      state.dragging = true;
      var idx = parseInt(c.dataset.index, 10);
      var wasFilled = c.classList.contains('is-filled');
      state.dragSetTo = !wasFilled;
      // Don't preventDefault — the click event still fires for accessibility
    }
    function onPointerMove(e) {
      if (!state.dragging || readonly) return;
      var x = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX);
      var y = e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY);
      var c = cellAtPoint(x, y);
      if (!c) return;
      var idx = parseInt(c.dataset.index, 10);
      // While dragging, fill all cells up to idx if dragSetTo=true, else
      // clear all cells from idx on. Smart-fill semantics keep things sane.
      if (state.dragSetTo) applyCount(Math.max(state.filled, idx + 1), true);
      else                 applyCount(Math.min(state.filled, idx), true);
    }
    function onPointerUp() { state.dragging = false; state.dragSetTo = null; }

    grid.addEventListener('mousedown',  onPointerDown);
    grid.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('mousemove',  onPointerMove);
    window.addEventListener('touchmove',  onPointerMove, { passive: true });
    window.addEventListener('mouseup',    onPointerUp);
    window.addEventListener('touchend',   onPointerUp);
    window.addEventListener('touchcancel', onPointerUp);

    // Clear button
    var clearBtn = root.querySelector('.mp-tenframe__btn--clear');
    clearBtn.addEventListener('click', function () { applyCount(0, true); });

    // Initial value
    applyCount(initial, false);

    // ---- Demo fill (animated, for Humphrey walkthroughs) -------------------
    function demoFill(n, demoOpts) {
      demoOpts = demoOpts || {};
      var dur = demoOpts.durationPerDot || 180;
      var start = demoOpts.fromZero === false ? state.filled : 0;
      if (demoOpts.fromZero !== false) applyCount(0, false);
      n = clamp(n, 0, max);
      return new Promise(function (resolve) {
        var i = start;
        function step() {
          if (i >= n) return resolve();
          i += 1;
          applyCount(i, false);
          setTimeout(step, dur);
        }
        step();
      });
    }

    // ---- Unmount -----------------------------------------------------------
    function unmount() {
      window.removeEventListener('mousemove',  onPointerMove);
      window.removeEventListener('touchmove',  onPointerMove);
      window.removeEventListener('mouseup',    onPointerUp);
      window.removeEventListener('touchend',   onPointerUp);
      window.removeEventListener('touchcancel', onPointerUp);
      host.classList.remove('mp-tenframe-host');
      host.innerHTML = '';
    }

    return {
      unmount:  unmount,
      set:      function (n) { applyCount(n, false); },
      value:    function () { return state.filled; },
      demoFill: demoFill,
      root:     root,
    };
  }

  // ============================================================
  // Helpers
  // ============================================================
  function clamp(n, lo, hi) {
    n = (typeof n === 'number' && isFinite(n)) ? n : 0;
    if (n < lo) return lo;
    if (n > hi) return hi;
    return Math.round(n);
  }

  // ============================================================
  // Expose
  // ============================================================
  NS.Manipulatives = NS.Manipulatives || {};
  NS.Manipulatives.tenFrame = { mount: mountTenFrame };
})();
