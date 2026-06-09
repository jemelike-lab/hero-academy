// js/class-time-board.js
// Two-canvas board: Humphrey's teaching board (left) + Nigel's drawing canvas (right).
// Implements 8 client tools (drawNumber, drawDots, drawTenFrame, writeWord, writeLetter,
// drawEquation, showVisual, clearBoard) and Nigel canvas capture for auto-vision.
(function(){
  'use strict';
  const NS = window.HeroAcademy = window.HeroAcademy || {};

  const COLORS = {
    pen:'#7c3aed',          // magenta-purple for Humphrey strokes
    accent:'#ec4899',
    correct:'#16a34a',
    nigel:'#1e293b'          // dark for Nigel drawing
  };

  // v157: board mode tracking — so see-board vision can be told what
  // kind of board it's looking at (drawing / image / mixed).
  // - 'drawing'  → only canvas strokes from teaching tools
  // - 'image'    → a reference photo is up (showLiveImage / showVisual)
  // - 'mixed'    → both an image AND canvas strokes are visible
  // Mode is set automatically by which tool is called last; we never expose
  // an explicit setter to the ConvAI agent for v157. clearBoard resets.
  let currentMode = 'drawing';
  let currentImageUrl = '';
  let currentImageCaption = '';
  let currentImageEl = null; // cached HTMLImageElement for capture composition
  function escalateToMixed(){
    if (currentMode === 'image') currentMode = 'mixed';
  }


  // ---------- Canvas setup helpers ----------
  function fitCanvas(canvas){
    const host = canvas.parentElement;
    const r = host.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.max(1, Math.floor(r.width * dpr));
    canvas.height = Math.max(1, Math.floor(r.height * dpr));
    canvas.style.width = r.width + 'px';
    canvas.style.height = r.height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function clearCanvas(canvas){
    const ctx = canvas.getContext('2d');
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function getSize(canvas){
    const r = canvas.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }

  // ---------- Animation primitives ----------
  function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

  function animate(durationMs, frame, done){
    const t0 = performance.now();
    function tick(now){
      const t = Math.min(1, (now - t0) / durationMs);
      frame(easeOutCubic(t), t);
      if (t < 1) requestAnimationFrame(tick);
      else if (done) done();
    }
    requestAnimationFrame(tick);
  }

  // ---------- Humphrey board (left) ----------
  let humphreyCanvas, humphreyCtx, humphreyHint, visualAid, visualSvg, visualLabel;
  let boardState = 'idle'; // idle | drawing
  let activeAnimations = 0;

  function showHint(show){ if (humphreyHint) humphreyHint.style.display = show ? 'flex' : 'none'; }
  function setBoardActive(){ showHint(false); escalateToMixed(); }

  function drawNumber(n){
    setBoardActive();
    if (!humphreyCtx) return;
    clearCanvas(humphreyCanvas);
    const { w, h } = getSize(humphreyCanvas);
    const text = String(n);
    const fontSize = Math.min(h * 0.65, w * 0.6);
    const ctx = humphreyCtx;
    activeAnimations++;
    animate(450, (e) => {
      ctx.save();
      ctx.clearRect(0, 0, w, h);
      ctx.font = `bold ${fontSize}px "Comic Sans MS","Marker Felt","Caveat",cursive`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COLORS.pen;
      ctx.globalAlpha = e;
      ctx.translate(w/2, h/2);
      ctx.scale(0.7 + 0.3 * e, 0.7 + 0.3 * e);
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }, () => { activeAnimations--; });
  }

  function drawDots(count){
    setBoardActive();
    if (!humphreyCtx) return;
    clearCanvas(humphreyCanvas);
    const { w, h } = getSize(humphreyCanvas);
    const ctx = humphreyCtx;
    const n = Math.max(0, Math.min(20, parseInt(count,10)||0));
    if (n === 0) return;

    // Grid layout
    const cols = Math.min(n, 5);
    const rows = Math.ceil(n / cols);
    const radius = Math.min(w / (cols + 2), h / (rows + 2)) * 0.32;
    const cellW = w / (cols + 1);
    const cellH = h / (rows + 1);

    let drawn = 0;
    activeAnimations++;
    function placeNext(){
      if (drawn >= n) { activeAnimations--; return; }
      const i = drawn;
      const r = Math.floor(i / cols);
      const c = i % cols;
      const cx = (c + 1) * cellW;
      const cy = (r + 1) * cellH;
      animate(180, (e) => {
        ctx.save();
        ctx.fillStyle = COLORS.pen;
        ctx.globalAlpha = e;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * e, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
      drawn++;
      setTimeout(placeNext, 130);
    }
    placeNext();
  }

  function drawTenFrame(filled){
    setBoardActive();
    if (!humphreyCtx) return;
    clearCanvas(humphreyCanvas);
    const { w, h } = getSize(humphreyCanvas);
    const ctx = humphreyCtx;
    const n = Math.max(0, Math.min(10, parseInt(filled,10)||0));

    // 5x2 grid frame
    const margin = Math.min(w, h) * 0.08;
    const gridW = w - margin * 2;
    const gridH = Math.min(gridW * 0.4, h - margin * 2);
    const cell = gridW / 5;
    const startX = margin;
    const startY = (h - gridH) / 2;

    ctx.save();
    ctx.strokeStyle = COLORS.pen;
    ctx.lineWidth = 4;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let r = 0; r < 2; r++){
      for (let c = 0; c < 5; c++){
        const x = startX + c * cell;
        const y = startY + r * cell;
        ctx.beginPath();
        ctx.rect(x, y, cell, cell);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();

    // Animate counters in (left-to-right, top-to-bottom)
    let drawn = 0;
    activeAnimations++;
    function placeNext(){
      if (drawn >= n) { activeAnimations--; return; }
      const i = drawn;
      const r = Math.floor(i / 5);
      const c = i % 5;
      const cx = startX + c * cell + cell / 2;
      const cy = startY + r * cell + cell / 2;
      const radius = cell * 0.34;
      animate(200, (e) => {
        ctx.save();
        ctx.fillStyle = COLORS.accent;
        ctx.globalAlpha = e;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * e, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
      drawn++;
      setTimeout(placeNext, 150);
    }
    placeNext();
  }

  function writeText(text, opts){
    setBoardActive();
    if (!humphreyCtx) return;
    clearCanvas(humphreyCanvas);
    const { w, h } = getSize(humphreyCanvas);
    const ctx = humphreyCtx;
    opts = opts || {};
    const fontSize = opts.fontSize || Math.min(h * 0.5, w * 0.85 / Math.max(1, text.length * 0.6));
    activeAnimations++;
    animate(450, (e) => {
      ctx.save();
      ctx.clearRect(0, 0, w, h);
      ctx.font = `bold ${fontSize}px "Caveat","Comic Sans MS",cursive`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COLORS.pen;
      ctx.globalAlpha = e;
      // Write character-by-character feel
      const total = text.length;
      const showChars = Math.max(1, Math.floor(e * total + 0.5));
      const visible = text.slice(0, showChars);
      ctx.fillText(visible, w/2, h/2);
      ctx.restore();
    }, () => { activeAnimations--; });
  }

  function writeWord(word){ writeText(String(word||''), {}); }
  function writeLetter(letter){
    setBoardActive();
    if (!humphreyCtx) return;
    clearCanvas(humphreyCanvas);
    const { w, h } = getSize(humphreyCanvas);
    const ctx = humphreyCtx;
    const txt = String(letter||'').charAt(0);
    const fontSize = Math.min(h * 0.7, w * 0.6);
    activeAnimations++;
    animate(500, (e) => {
      ctx.save();
      ctx.clearRect(0, 0, w, h);
      ctx.font = `bold ${fontSize}px "Marker Felt","Caveat","Comic Sans MS",cursive`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COLORS.pen;
      ctx.globalAlpha = e;
      ctx.translate(w/2, h/2);
      ctx.scale(0.6 + 0.4 * e, 0.6 + 0.4 * e);
      ctx.fillText(txt, 0, 0);
      // Lowercase ghost underneath
      if (/[A-Za-z]/.test(txt)) {
        ctx.font = `bold ${fontSize * 0.45}px "Marker Felt","Caveat",cursive`;
        ctx.fillStyle = 'rgba(124,58,237,0.45)';
        ctx.fillText(txt.toLowerCase() === txt ? txt.toUpperCase() : txt.toLowerCase(), fontSize * 0.6, fontSize * 0.05);
      }
      ctx.restore();
    }, () => { activeAnimations--; });
  }

  function drawEquation(text){
    setBoardActive();
    if (!humphreyCtx) return;
    clearCanvas(humphreyCanvas);
    const { w, h } = getSize(humphreyCanvas);
    const ctx = humphreyCtx;
    const txt = String(text||'').trim();
    // Sized to fit
    const fontSize = Math.min(h * 0.5, w * 0.9 / Math.max(1, txt.length * 0.55));
    activeAnimations++;
    animate(550, (e) => {
      ctx.save();
      ctx.clearRect(0, 0, w, h);
      ctx.font = `bold ${fontSize}px "Marker Felt","Caveat","Comic Sans MS",cursive`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COLORS.pen;
      ctx.globalAlpha = e;
      // Reveal char-by-char
      const total = txt.length;
      const showChars = Math.max(1, Math.floor(e * total + 0.5));
      ctx.fillText(txt.slice(0, showChars), w/2, h/2);
      ctx.restore();
    }, () => { activeAnimations--; });
  }

  function showVisual(topic){
    if (!visualAid) return;
    // v142: accept either a string topic or an object {topic} for backward compat
    const t = (typeof topic === 'object' && topic !== null) ? (topic.topic ?? topic.subject ?? '') : topic;
    const key = String(t || '').toLowerCase();
    const NSV = (window.HeroAcademy && window.HeroAcademy.ClassTimeVisuals) || null;
    const svg = NSV && NSV.has(key) ? NSV.get(key) : null;
    if (!svg) {
      // Fallback: write the topic as text
      writeWord(key);
      return;
    }
    setBoardActive();
    if (visualSvg) visualSvg.innerHTML = svg;
    if (visualLabel) visualLabel.textContent = key;
    visualAid.classList.add('active');
    // v157: mark mode for downstream vision calls
    currentMode = 'image';
    currentImageUrl = '';      // SVG, no URL to capture from
    currentImageCaption = key;
    currentImageEl = null;
  }

  // v142: render a live image (e.g. Wikipedia thumbnail) into the visual aid
  // popup. Used by the new showVisual client-tool path when the API returns
  // a real photo for "George Washington", "monarch butterfly", etc.
  function showLiveImage({ url, caption, attribution }){
    if (!visualAid || !url) return;
    setBoardActive();
    if (visualSvg){
      // Replace SVG slot with an <img>. Constraint: object-fit so very tall/wide
      // photos still display proportionally in the popup area.
      const safeUrl = String(url).replace(/"/g, '%22');
      const safeAlt = String(caption || '').replace(/"/g, '&quot;').slice(0, 200);
      visualSvg.innerHTML = `<img src="${safeUrl}" alt="${safeAlt}" loading="eager" style="max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;border-radius:8px;background:#fff;">`;
    }
    if (visualLabel){
      const cap = String(caption || '').slice(0, 200);
      const attr = String(attribution || '').slice(0, 40);
      visualLabel.textContent = attr ? `${cap} — ${attr}` : cap;
    }
    visualAid.classList.add('active');
    // v157: mark mode + preload a CORS-friendly copy for capture compositing.
    currentMode = 'image';
    currentImageUrl = String(url);
    currentImageCaption = String(caption || '');
    // Pre-load with crossOrigin so toDataURL won't taint the canvas later.
    // Wikimedia upload.wikimedia.org sends CORS headers, so this works in
    // practice. If it fails, captureHumphreyBoardDataUrl will fall back
    // gracefully (image won't be in the snapshot, but canvas strokes will).
    try {
      const preload = new Image();
      preload.crossOrigin = 'anonymous';
      preload.onload = () => { currentImageEl = preload; };
      preload.onerror = () => { currentImageEl = null; };
      preload.src = currentImageUrl;
    } catch(_) { currentImageEl = null; }
  }

  function clearBoard(){
    if (visualAid) visualAid.classList.remove('active');
    // v157: reset mode tracking
    currentMode = 'drawing';
    currentImageUrl = '';
    currentImageCaption = '';
    currentImageEl = null;
    if (humphreyCanvas) {
      const { w, h } = getSize(humphreyCanvas);
      const ctx = humphreyCanvas.getContext('2d');
      // Fade out
      animate(280, (e) => {
        const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        ctx.save();
        ctx.setTransform(1,0,0,1,0,0);
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = `rgba(0,0,0,${0.04 + 0.06 * e})`;
        ctx.fillRect(0, 0, humphreyCanvas.width, humphreyCanvas.height);
        ctx.restore();
        ctx.setTransform(dpr,0,0,dpr,0,0);
      }, () => {
        clearCanvas(humphreyCanvas);
        showHint(true);
      });
    }
  }

  // ---------- Nigel canvas (right) — drawable ----------
  let nigelCanvas, nigelCtx, nigelHint;
  let drawing = false;
  let lastPt = null;
  let strokeCount = 0;
  let nigelHasContent = false;
  const drawingListeners = new Set();

  function emitDrawingActivity(kind){
    drawingListeners.forEach(fn => {
      try { fn(kind); } catch(e){ console.error('[ct-board] listener err', e); }
    });
  }

  function getEventPt(e){
    const r = nigelCanvas.getBoundingClientRect();
    const point = e.touches && e.touches[0] ? e.touches[0] : (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : e;
    return { x: point.clientX - r.left, y: point.clientY - r.top };
  }

  function nigelStart(e){
    e.preventDefault();
    if (nigelHint) nigelHint.style.display = 'none';
    drawing = true;
    lastPt = getEventPt(e);
    nigelHasContent = true;
    strokeCount++;
    emitDrawingActivity('start');
  }

  function nigelMove(e){
    if (!drawing) return;
    e.preventDefault();
    const pt = getEventPt(e);
    if (!lastPt) { lastPt = pt; return; }
    nigelCtx.strokeStyle = COLORS.nigel;
    nigelCtx.lineWidth = 4;
    nigelCtx.lineCap = 'round';
    nigelCtx.lineJoin = 'round';
    nigelCtx.beginPath();
    nigelCtx.moveTo(lastPt.x, lastPt.y);
    nigelCtx.lineTo(pt.x, pt.y);
    nigelCtx.stroke();
    lastPt = pt;
    emitDrawingActivity('move');
  }

  function nigelEnd(e){
    if (!drawing) return;
    drawing = false;
    lastPt = null;
    emitDrawingActivity('end');
  }

  function clearNigelCanvas(){
    if (!nigelCanvas) return;
    clearCanvas(nigelCanvas);
    nigelHasContent = false;
    strokeCount = 0;
    if (nigelHint) nigelHint.style.display = 'flex';
    emitDrawingActivity('clear');
  }

  function captureNigelCanvasDataUrl(maxDim){
    if (!nigelCanvas) return null;
    if (!nigelHasContent) return null;
    // Downscale to a sane max dimension for vision (default 512px on longer side)
    const target = maxDim || 512;
    const w = nigelCanvas.width, h = nigelCanvas.height;
    const scale = Math.min(1, target / Math.max(w, h));
    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.round(w * scale));
    off.height = Math.max(1, Math.round(h * scale));
    const offCtx = off.getContext('2d');
    // White background so vision model sees lines on white
    offCtx.fillStyle = '#ffffff';
    offCtx.fillRect(0, 0, off.width, off.height);
    offCtx.drawImage(nigelCanvas, 0, 0, off.width, off.height);
    return off.toDataURL('image/jpeg', 0.78);
  }

  function isCanvasBlank(){ return !nigelHasContent; }
  function getStrokeCount(){ return strokeCount; }
  function onDrawingActivity(fn){ drawingListeners.add(fn); return () => drawingListeners.delete(fn); }

  // ---------- v157: Humphrey board snapshot ----------
  // Composites currently-visible image (if any) + canvas strokes into a
  // single JPEG data URL that the see-board vision endpoint can read.
  // Returns null if the board is empty.
  function loadImagePromise(url){
    return new Promise(function(resolve, reject){
      try {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function(){ resolve(img); };
        img.onerror = function(e){ reject(e); };
        img.src = url;
      } catch(e){ reject(e); }
    });
  }

  function humphreyHasContent(){
    if (currentMode === 'image' || currentMode === 'mixed') return true;
    if (!humphreyCanvas) return false;
    // Sniff: peek at a small downscaled pixel sample to detect non-blank canvas.
    try {
      var off = document.createElement('canvas');
      off.width = 32; off.height = 32;
      off.getContext('2d').drawImage(humphreyCanvas, 0, 0, 32, 32);
      var px = off.getContext('2d').getImageData(0, 0, 32, 32).data;
      for (var i = 3; i < px.length; i += 4) {
        if (px[i] > 8) return true; // any non-trivial alpha
      }
    } catch(_) {}
    return false;
  }

  async function captureHumphreyBoardDataUrl(maxDim){
    if (!humphreyCanvas) return null;
    if (!humphreyHasContent()) return null;
    var target = maxDim || 640;
    var hostR = humphreyCanvas.parentElement.getBoundingClientRect();
    var w = hostR.width, h = hostR.height;
    var scale = Math.min(1, target / Math.max(w, h));
    var off = document.createElement('canvas');
    off.width = Math.max(1, Math.round(w * scale));
    off.height = Math.max(1, Math.round(h * scale));
    var ctx = off.getContext('2d');
    // Match Humphrey board background
    ctx.fillStyle = '#fefce8';
    ctx.fillRect(0, 0, off.width, off.height);
    // Image layer (if mode is image/mixed and we have a URL)
    if ((currentMode === 'image' || currentMode === 'mixed') && currentImageUrl){
      try {
        var img = currentImageEl;
        if (!img || !img.complete) img = await loadImagePromise(currentImageUrl);
        currentImageEl = img;
        // object-fit: contain with 5% padding
        var pad = 0.05;
        var maxW = off.width * (1 - 2*pad);
        var maxH = off.height * (1 - 2*pad);
        var ir = img.width / img.height;
        var dr = maxW / maxH;
        var dw, dh;
        if (ir > dr){ dw = maxW; dh = dw / ir; }
        else { dh = maxH; dw = dh * ir; }
        var dx = (off.width - dw) / 2;
        var dy = (off.height - dh) / 2;
        ctx.drawImage(img, dx, dy, dw, dh);
      } catch(e){
        console.warn('[ct-board] image draw failed, snapshot will exclude image (likely CORS):', e);
      }
    }
    // Canvas strokes on top
    try {
      ctx.drawImage(humphreyCanvas, 0, 0, off.width, off.height);
    } catch(e){
      console.warn('[ct-board] canvas overlay failed:', e);
    }
    try {
      return off.toDataURL('image/jpeg', 0.78);
    } catch(e){
      console.warn('[ct-board] toDataURL failed (canvas tainted?):', e);
      return null;
    }
  }

  // Side-by-side dispatcher — 'humphrey' (default), 'nigel', or 'both'.
  async function captureBoardDataUrl(opts){
    opts = opts || {};
    var which = String(opts.which || 'humphrey').toLowerCase();
    var max = opts.maxDim || 640;
    if (which === 'nigel') return captureNigelCanvasDataUrl(max);
    if (which === 'humphrey') return await captureHumphreyBoardDataUrl(max);
    if (which === 'both'){
      var hUrl = await captureHumphreyBoardDataUrl(max);
      var nUrl = captureNigelCanvasDataUrl(max);
      if (!hUrl && !nUrl) return null;
      if (!hUrl) return nUrl;
      if (!nUrl) return hUrl;
      try {
        var hi = await loadImagePromise(hUrl);
        var ni = await loadImagePromise(nUrl);
        var off = document.createElement('canvas');
        var H = Math.max(hi.height, ni.height);
        off.width = hi.width + ni.width + 8; // 8px gutter
        off.height = H;
        var ctx = off.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, off.width, off.height);
        ctx.drawImage(hi, 0, 0);
        ctx.drawImage(ni, hi.width + 8, 0);
        return off.toDataURL('image/jpeg', 0.78);
      } catch(e){
        console.warn('[ct-board] both-composite failed, returning humphrey-only:', e);
        return hUrl;
      }
    }
    return await captureHumphreyBoardDataUrl(max);
  }

  function getBoardMeta(){
    return {
      mode: currentMode,
      image_url: currentImageUrl,
      image_caption: currentImageCaption,
      humphrey_has_content: humphreyHasContent(),
      nigel_has_content: nigelHasContent
    };
  }

  // ---------- Mount ----------
  function mount(opts){
    opts = opts || {};
    humphreyCanvas = document.getElementById('humphrey-canvas');
    nigelCanvas = document.getElementById('nigel-canvas');
    humphreyHint = document.getElementById('humphrey-hint');
    nigelHint = document.getElementById('nigel-hint');
    visualAid = document.getElementById('visual-aid');
    visualSvg = document.getElementById('visual-svg');
    visualLabel = document.getElementById('visual-label');

    if (humphreyCanvas) humphreyCtx = fitCanvas(humphreyCanvas);
    if (nigelCanvas) nigelCtx = fitCanvas(nigelCanvas);

    if (nigelCanvas){
      nigelCanvas.addEventListener('pointerdown', nigelStart, {passive:false});
      nigelCanvas.addEventListener('pointermove', nigelMove, {passive:false});
      nigelCanvas.addEventListener('pointerup', nigelEnd, {passive:false});
      nigelCanvas.addEventListener('pointercancel', nigelEnd, {passive:false});
      // Touch fallbacks (some Android browsers)
      nigelCanvas.addEventListener('touchstart', nigelStart, {passive:false});
      nigelCanvas.addEventListener('touchmove', nigelMove, {passive:false});
      nigelCanvas.addEventListener('touchend', nigelEnd, {passive:false});
    }

    const clearBtn = document.getElementById('nigel-clear-btn');
    if (clearBtn) clearBtn.addEventListener('click', clearNigelCanvas);

    // Resize handling — debounce, preserve as much as we can (Humphrey board is ephemeral)
    let rt;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        if (humphreyCanvas) humphreyCtx = fitCanvas(humphreyCanvas);
        if (nigelCanvas) nigelCtx = fitCanvas(nigelCanvas);
      }, 250);
    });
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        if (humphreyCanvas) humphreyCtx = fitCanvas(humphreyCanvas);
        if (nigelCanvas) nigelCtx = fitCanvas(nigelCanvas);
      }, 400);
    });
  }

  // ---------- Public API ----------
  NS.ClassTimeBoard = {
    mount,
    // Tools (each accepts a single object payload from ConvAI)
    // v154: maximally permissive parameter extraction — the agent may use
    // any of: filled, count, n, number, value, dots, etc.
    drawNumber:    (p) => drawNumber((p && (p.n ?? p.number ?? p.value ?? p.count)) ?? 0),
    drawDots:      (p) => drawDots((p && (p.count ?? p.n ?? p.dots ?? p.value ?? p.number)) ?? 0),
    drawTenFrame:  (p) => drawTenFrame((p && (p.filled ?? p.n ?? p.count ?? p.value ?? p.number)) ?? 0),
    writeWord:     (p) => writeWord((p && (p.word ?? p.text ?? p.value)) ?? ''),
    writeLetter:   (p) => writeLetter((p && (p.letter ?? p.text ?? p.char ?? p.value)) ?? ''),
    drawEquation:  (p) => drawEquation((p && (p.text ?? p.equation ?? p.eq ?? p.value)) ?? ''),
    showVisual:    (p) => showVisual((p && (p.topic ?? p.subject ?? p.text ?? p.value)) ?? ''),
    showLiveImage: (p) => showLiveImage(p || {}),
    clearBoard:    () => clearBoard(),
    // Nigel canvas
    clearNigelCanvas,
    captureNigelCanvasDataUrl,
    isCanvasBlank,
    getStrokeCount,
    onDrawingActivity,
    // v157: Humphrey board snapshot + mode metadata for see-board vision
    captureHumphreyBoardDataUrl,
    captureBoardDataUrl,
    getBoardMeta
  };
})();
