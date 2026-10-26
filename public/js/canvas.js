/**
 * Hero Academy — drawing canvas.
 *
 * Two-layer setup so Ms. Humphrey's explanatory drawings and Nigel's freehand
 * pen never clobber each other:
 *
 *   humphreyLayer (bottom)   — Ms. Humphrey's programmatic shapes / text /
 *                              animated walkthroughs. Cleared by humphreyClear()
 *                              between problems.
 *   nigelLayer    (top)      — Nigel's pointer-driven pen strokes. Has undo
 *                              and clear of its own. Survives Humphrey re-draws.
 *
 * Public API (HeroAcademy.Canvas):
 *
 *   mount(targetEl, opts)              attach canvas to a container
 *   unmount()                          remove canvas + listeners
 *   isMounted()                        bool
 *   setTool(tool)                      'pen' | 'eraser'
 *   setColor(hex)                      pick a pen color
 *   clearNigelLayer()                  wipe Nigel's drawings only
 *   undoNigel()                        undo last stroke
 *   getDataURL()                       composite PNG data URL (both layers)
 *   loadDataURL(url)                   restore Nigel's drawings
 *
 *   humphreyClear()                    wipe Ms. Humphrey's layer only
 *   humphreyDrawLine(x1,y1,x2,y2,opts) animated line
 *   humphreyDrawCircle(x,y,r,opts)     animated stroked circle
 *   humphreyDrawArrow(x1,y1,x2,y2,opts) line + arrowhead
 *   humphreyDrawText(x,y,text,opts)    static text label (fades in)
 *   humphreyDrawNumberLine(min,max,opts) composite helper for math
 *
 * All Humphrey drawing methods return Promises that resolve when the
 * animation completes, so you can chain them naturally:
 *
 *   await Canvas.humphreyDrawNumberLine(0, 10);
 *   await Canvas.humphreyDrawArrow(800, 100, 300, 100, { color: 'magenta' });
 *
 * Coordinates use a virtual 1000-wide canvas (height proportional to mounted
 * box). This means skill-drawings can be written once and scale across
 * devices.
 */
(function () {
  'use strict';

  var NS = window.HeroAcademy = window.HeroAcademy || {};
  if (NS.Canvas) return;

  var VIRTUAL_W = 1000;
  var DEFAULT_PEN_COLORS = ['#0a0b2e', '#ec4899', '#14b8d4', '#22c55e', '#f59e0b'];
  var HUMPHREY_COLOR = '#ec4899';   // Ms. Humphrey writes in magenta by default
  var HUMPHREY_TEXT_FONT = '600 24px Fredoka, system-ui, sans-serif';

  var state = {
    mounted: false,
    container: null,
    humphreyCanvas: null,
    nigelCanvas: null,
    humphreyCtx: null,
    nigelCtx: null,
    dpr: 1,
    width: 0,    // CSS pixels of mounted area
    height: 0,
    scaleX: 1,   // virtual-to-pixel scale factor
    scaleY: 1,
    tool: 'pen',
    color: '#0a0b2e',
    penSize: 4,
    eraserSize: 32,
    drawing: false,
    lastPt: null,
    history: [],    // stack of nigel-layer PNG data URLs (for undo)
    onChange: null,
  };

  // -------------------------------------------------------------------------
  // Mount / unmount
  // -------------------------------------------------------------------------

  function mount(target, opts) {
    if (state.mounted) unmount();
    opts = opts || {};
    var el = (typeof target === 'string') ? document.querySelector(target) : target;
    if (!el) { console.warn('[canvas] mount target not found'); return false; }

    state.container = document.createElement('div');
    state.container.className = 'ha-canvas';
    state.container.innerHTML =
      '<div class="ha-canvas-stage">' +
        '<canvas class="ha-canvas-layer ha-canvas-layer--humphrey"></canvas>' +
        '<canvas class="ha-canvas-layer ha-canvas-layer--nigel"></canvas>' +
      '</div>' +
      (opts.showToolbar === false ? '' :
        '<div class="ha-canvas-toolbar" role="toolbar" aria-label="Drawing tools">' +
          '<div class="ha-canvas-colors" role="group" aria-label="Colors">' +
            DEFAULT_PEN_COLORS.map(function (c, i) {
              return '<button type="button" class="ha-canvas-color' + (i === 0 ? ' is-active' : '') +
                     '" data-color="' + c + '" style="--c:' + c + '" aria-label="Pick color ' + c + '"></button>';
            }).join('') +
          '</div>' +
          '<button type="button" class="ha-canvas-tool ha-canvas-tool--eraser" data-tool="eraser" aria-label="Eraser">🧽</button>' +
          '<button type="button" class="ha-canvas-tool" data-action="undo" aria-label="Undo">↶</button>' +
          '<button type="button" class="ha-canvas-tool" data-action="clear" aria-label="Clear all of your drawings">Clear</button>' +
        '</div>'
      );
    el.appendChild(state.container);

    state.humphreyCanvas = state.container.querySelector('.ha-canvas-layer--humphrey');
    state.nigelCanvas = state.container.querySelector('.ha-canvas-layer--nigel');
    state.humphreyCtx = state.humphreyCanvas.getContext('2d');
    state.nigelCtx = state.nigelCanvas.getContext('2d');
    state.onChange = opts.onChange || null;

    sizeCanvas();
    wirePointerEvents();
    wireToolbar();
    window.addEventListener('resize', sizeCanvas);

    state.mounted = true;
    return true;
  }

  function unmount() {
    if (!state.mounted) return;
    window.removeEventListener('resize', sizeCanvas);
    if (state.container && state.container.parentNode) {
      state.container.parentNode.removeChild(state.container);
    }
    state.mounted = false;
    state.container = null;
    state.humphreyCanvas = null;
    state.nigelCanvas = null;
    state.humphreyCtx = null;
    state.nigelCtx = null;
    state.history = [];
    state.drawing = false;
  }

  function isMounted() { return state.mounted; }

  function sizeCanvas() {
    if (!state.container) return;
    var stage = state.container.querySelector('.ha-canvas-stage');
    var rect = stage.getBoundingClientRect();
    state.width = rect.width;
    state.height = rect.height;
    state.dpr = window.devicePixelRatio || 1;
    state.scaleX = (state.width * state.dpr) / VIRTUAL_W;
    state.scaleY = state.scaleX; // keep aspect — virtual height = width / aspect

    [state.humphreyCanvas, state.nigelCanvas].forEach(function (c) {
      c.width = Math.round(state.width * state.dpr);
      c.height = Math.round(state.height * state.dpr);
      c.style.width = state.width + 'px';
      c.style.height = state.height + 'px';
    });
    // Reset transforms after resize (canvas state is wiped)
    state.humphreyCtx.setTransform(1, 0, 0, 1, 0, 0);
    state.nigelCtx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // -------------------------------------------------------------------------
  // Nigel — freehand pen / eraser
  // -------------------------------------------------------------------------

  function wirePointerEvents() {
    var c = state.nigelCanvas;
    c.addEventListener('pointerdown', onPointerDown);
    c.addEventListener('pointermove', onPointerMove);
    c.addEventListener('pointerup', onPointerUp);
    c.addEventListener('pointercancel', onPointerUp);
    c.addEventListener('pointerleave', onPointerUp);
    c.style.touchAction = 'none';
  }

  function getPos(e) {
    var rect = state.nigelCanvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * state.dpr,
      y: (e.clientY - rect.top) * state.dpr,
    };
  }

  function onPointerDown(e) {
    if (!state.mounted) return;
    e.preventDefault();
    pushHistory();
    state.drawing = true;
    state.lastPt = getPos(e);
    state.nigelCanvas.setPointerCapture(e.pointerId);
    drawSegment(state.lastPt, state.lastPt, true);
  }
  function onPointerMove(e) {
    if (!state.drawing) return;
    var pt = getPos(e);
    drawSegment(state.lastPt, pt, false);
    state.lastPt = pt;
  }
  function onPointerUp(e) {
    if (!state.drawing) return;
    state.drawing = false;
    state.lastPt = null;
    if (state.onChange) try { state.onChange(); } catch (_) {}
  }

  function drawSegment(a, b, isStart) {
    var ctx = state.nigelCtx;
    var size = (state.tool === 'eraser' ? state.eraserSize : state.penSize) * state.dpr;
    if (state.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = state.color;
    }
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (isStart) {
      ctx.arc(a.x, a.y, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = state.color;
      if (state.tool !== 'eraser') ctx.fill();
    } else {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function pushHistory() {
    try {
      state.history.push(state.nigelCanvas.toDataURL('image/png'));
      if (state.history.length > 20) state.history.shift();
    } catch (e) { /* very large canvases may throw; degrade gracefully */ }
  }

  function setTool(tool) {
    state.tool = (tool === 'eraser') ? 'eraser' : 'pen';
    reflectToolbarActive();
  }
  function setColor(c) { state.color = c; state.tool = 'pen'; reflectToolbarActive(); }
  function clearNigelLayer() {
    pushHistory();
    state.nigelCtx.clearRect(0, 0, state.nigelCanvas.width, state.nigelCanvas.height);
    if (state.onChange) try { state.onChange(); } catch (_) {}
  }
  function undoNigel() {
    if (state.history.length === 0) return;
    var prev = state.history.pop();
    var img = new Image();
    img.onload = function () {
      state.nigelCtx.clearRect(0, 0, state.nigelCanvas.width, state.nigelCanvas.height);
      state.nigelCtx.drawImage(img, 0, 0);
      if (state.onChange) try { state.onChange(); } catch (_) {}
    };
    img.src = prev;
  }
  function getDataURL() {
    // Composite both layers into one PNG
    var off = document.createElement('canvas');
    off.width = state.nigelCanvas.width;
    off.height = state.nigelCanvas.height;
    var octx = off.getContext('2d');
    octx.fillStyle = '#ffffff';
    octx.fillRect(0, 0, off.width, off.height);
    octx.drawImage(state.humphreyCanvas, 0, 0);
    octx.drawImage(state.nigelCanvas, 0, 0);
    return off.toDataURL('image/png');
  }
  function loadDataURL(url) {
    if (!url) return Promise.resolve();
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        state.nigelCtx.clearRect(0, 0, state.nigelCanvas.width, state.nigelCanvas.height);
        state.nigelCtx.drawImage(img, 0, 0, state.nigelCanvas.width, state.nigelCanvas.height);
        resolve();
      };
      img.onerror = function () { resolve(); };
      img.src = url;
    });
  }

  function wireToolbar() {
    var tb = state.container.querySelector('.ha-canvas-toolbar');
    if (!tb) return;
    tb.addEventListener('click', function (e) {
      var t = e.target;
      var color = t.dataset && t.dataset.color;
      if (color) { setColor(color); return; }
      var tool = t.dataset && t.dataset.tool;
      if (tool) { setTool(tool); return; }
      var act = t.dataset && t.dataset.action;
      if (act === 'undo') undoNigel();
      if (act === 'clear') clearNigelLayer();
    });
  }
  function reflectToolbarActive() {
    if (!state.container) return;
    state.container.querySelectorAll('.ha-canvas-color').forEach(function (b) {
      b.classList.toggle('is-active', state.tool === 'pen' && b.dataset.color === state.color);
    });
    state.container.querySelectorAll('.ha-canvas-tool--eraser').forEach(function (b) {
      b.classList.toggle('is-active', state.tool === 'eraser');
    });
  }

  // -------------------------------------------------------------------------
  // Coordinate helpers — virtual 1000-wide space → pixel space
  // -------------------------------------------------------------------------

  function vx(x) { return x * state.scaleX; }
  function vy(y) { return y * state.scaleY; }
  function vs(s) { return s * state.scaleX; }

  // -------------------------------------------------------------------------
  // Ms. Humphrey — programmatic drawing API
  // -------------------------------------------------------------------------

  function humphreyClear() {
    if (!state.mounted) return Promise.resolve();
    state.humphreyCtx.clearRect(0, 0, state.humphreyCanvas.width, state.humphreyCanvas.height);
    return Promise.resolve();
  }

  function humphreyDrawLine(x1, y1, x2, y2, opts) {
    if (!state.mounted) return Promise.resolve();
    opts = opts || {};
    var ctx = state.humphreyCtx;
    var color = opts.color || HUMPHREY_COLOR;
    var width = vs(opts.width || 4);
    var duration = (opts.duration == null) ? 500 : opts.duration;
    return animate(duration, function (t) {
      var ex = x1 + (x2 - x1) * t;
      var ey = y1 + (y2 - y1) * t;
      ctx.save();
      // Re-draw fresh each frame to avoid jagged ends from overlapping strokes
      // (we clear only the segment we're animating by redrawing on top of prev)
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(vx(x1), vy(y1));
      ctx.lineTo(vx(ex), vy(ey));
      ctx.stroke();
      ctx.restore();
    });
  }

  function humphreyDrawCircle(cx, cy, r, opts) {
    if (!state.mounted) return Promise.resolve();
    opts = opts || {};
    var ctx = state.humphreyCtx;
    var color = opts.color || HUMPHREY_COLOR;
    var width = vs(opts.width || 4);
    var duration = (opts.duration == null) ? 600 : opts.duration;
    return animate(duration, function (t) {
      var endAngle = t * Math.PI * 2;
      ctx.save();
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(vx(cx), vy(cy), vs(r), -Math.PI / 2, -Math.PI / 2 + endAngle);
      ctx.stroke();
      if (opts.fill) {
        ctx.fillStyle = opts.fill;
        ctx.beginPath();
        ctx.arc(vx(cx), vy(cy), vs(r), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function humphreyDrawArrow(x1, y1, x2, y2, opts) {
    var self = this;
    opts = opts || {};
    return humphreyDrawLine(x1, y1, x2, y2, opts).then(function () {
      // Draw arrowhead
      var ctx = state.humphreyCtx;
      var color = opts.color || HUMPHREY_COLOR;
      var headSize = vs(opts.headSize || 14);
      var ang = Math.atan2(vy(y2) - vy(y1), vx(x2) - vx(x1));
      var tipX = vx(x2), tipY = vy(y2);
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - headSize * Math.cos(ang - 0.45), tipY - headSize * Math.sin(ang - 0.45));
      ctx.lineTo(tipX - headSize * Math.cos(ang + 0.45), tipY - headSize * Math.sin(ang + 0.45));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
  }

  function humphreyDrawText(x, y, text, opts) {
    if (!state.mounted) return Promise.resolve();
    opts = opts || {};
    var ctx = state.humphreyCtx;
    var color = opts.color || HUMPHREY_COLOR;
    var font = opts.font || HUMPHREY_TEXT_FONT;
    var duration = (opts.duration == null) ? 280 : opts.duration;
    return animate(duration, function (t) {
      ctx.save();
      ctx.globalAlpha = t;
      ctx.font = font.replace(/(\d+)px/, function (_, n) { return Math.round(parseInt(n, 10) * state.scaleX) + 'px'; });
      ctx.fillStyle = color;
      ctx.textAlign = opts.align || 'center';
      ctx.textBaseline = opts.baseline || 'middle';
      ctx.fillText(text, vx(x), vy(y));
      ctx.restore();
    });
  }

  /**
   * Compositional helper: draws a horizontal number line with ticks + labels.
   *
   *   humphreyDrawNumberLine(0, 10);
   *   humphreyDrawNumberLine(0, 10, { y: 200 });
   *
   * Returns a Promise resolving when the base line + ticks + labels finish.
   */
  function humphreyDrawNumberLine(min, max, opts) {
    opts = opts || {};
    var yLine = opts.y == null ? 240 : opts.y;
    var leftX = opts.left == null ? 80 : opts.left;
    var rightX = opts.right == null ? 920 : opts.right;
    var count = max - min;
    var step = (rightX - leftX) / count;
    // Expose tick positions so callers can target them by integer value
    var tickX = function (n) { return leftX + (n - min) * step; };
    state.lastNumberLine = { min: min, max: max, yLine: yLine, leftX: leftX, rightX: rightX, step: step, tickX: tickX };

    return humphreyDrawLine(leftX - 20, yLine, rightX + 20, yLine, { duration: 700 })
      .then(function () {
        // Sequentially pop in ticks + labels (small delay between each)
        var p = Promise.resolve();
        for (var n = min; n <= max; n++) {
          (function (i) {
            p = p.then(function () {
              return humphreyDrawLine(tickX(i), yLine - 14, tickX(i), yLine + 14, { duration: 110 })
                .then(function () { return humphreyDrawText(tickX(i), yLine + 44, String(i), { duration: 120 }); });
            });
          })(n);
        }
        return p;
      });
  }

  // Promise-based requestAnimationFrame animation; calls drawFrame(t) where
  // t goes 0→1 across `durationMs`.
  function animate(durationMs, drawFrame) {
    if (durationMs <= 0) { drawFrame(1); return Promise.resolve(); }
    return new Promise(function (resolve) {
      var start = performance.now();
      function frame(now) {
        var t = Math.min(1, (now - start) / durationMs);
        drawFrame(t);
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  // -------------------------------------------------------------------------
  // Expose virtual-coord helpers so skill-drawings can compute layouts
  // -------------------------------------------------------------------------

  function virtualDims() {
    var aspectH = (state.height / state.width) * VIRTUAL_W;
    return { w: VIRTUAL_W, h: aspectH };
  }
  function lastNumberLine() { return state.lastNumberLine || null; }

  NS.Canvas = {
    mount: mount,
    unmount: unmount,
    isMounted: isMounted,
    setTool: setTool,
    setColor: setColor,
    clearNigelLayer: clearNigelLayer,
    undoNigel: undoNigel,
    getDataURL: getDataURL,
    loadDataURL: loadDataURL,
    humphreyClear: humphreyClear,
    humphreyDrawLine: humphreyDrawLine,
    humphreyDrawCircle: humphreyDrawCircle,
    humphreyDrawArrow: humphreyDrawArrow,
    humphreyDrawText: humphreyDrawText,
    humphreyDrawNumberLine: humphreyDrawNumberLine,
    virtualDims: virtualDims,
    lastNumberLine: lastNumberLine,
  };
})();
