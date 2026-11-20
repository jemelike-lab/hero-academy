// Handwriting paper for Writing Time. Primary-school ruled rows (top line,
// dashed middle, baseline), finger or Apple Pencil. When a pencil has been
// used, finger touches are ignored so a resting palm doesn't draw.
// toPNG() bakes the lines and his writing into one image for the parents.
// `fill` makes the paper take its parent's height and fit as many rows of at
// least MIN_ROW_H as there is room for (up to MAX_ROWS), so a sentence fits.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import clsx from 'clsx';

type Pt = { x: number; y: number }; // 0..1 of the pad's width/height
export interface HandwritingPadHandle { toPNG: () => string; clear: () => void; undo: () => void; hasInk: () => boolean }

const ROW_H = 150;       // css px per writing row
const PAD_Y = 14;
const MIN_ROW_H = 150;   // fill mode: never squeeze a row below this
const MAX_ROWS = 4;
const INK = '#1f2d4d';

function drawGuides(ctx: CanvasRenderingContext2D, w: number, h: number, rows: number, scale: number) {
  const rowH = (h - PAD_Y * 2 * scale) / rows;
  for (let r = 0; r < rows; r++) {
    const top = PAD_Y * scale + r * rowH + rowH * 0.12;
    const base = PAD_Y * scale + r * rowH + rowH * 0.78;
    const mid = (top + base) / 2;
    ctx.lineWidth = 2 * scale;
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(14,140,140,0.55)';
    ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(w, top); ctx.stroke();
    ctx.strokeStyle = 'rgba(220,80,80,0.6)';
    ctx.beginPath(); ctx.moveTo(0, base); ctx.lineTo(w, base); ctx.stroke();
    ctx.strokeStyle = 'rgba(14,140,140,0.4)';
    ctx.setLineDash([10 * scale, 10 * scale]);
    ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawStroke(ctx: CanvasRenderingContext2D, s: Pt[], w: number, h: number, scale: number) {
  if (!s.length) return;
  ctx.strokeStyle = INK; ctx.fillStyle = INK;
  ctx.lineWidth = 5 * scale; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (s.length === 1) { ctx.beginPath(); ctx.arc(s[0].x * w, s[0].y * h, 2.6 * scale, 0, Math.PI * 2); ctx.fill(); return; }
  ctx.beginPath();
  ctx.moveTo(s[0].x * w, s[0].y * h);
  for (let i = 1; i < s.length - 1; i++) {
    const mx = ((s[i].x + s[i + 1].x) / 2) * w, my = ((s[i].y + s[i + 1].y) / 2) * h;
    ctx.quadraticCurveTo(s[i].x * w, s[i].y * h, mx, my);
  }
  const last = s[s.length - 1]; ctx.lineTo(last.x * w, last.y * h);
  ctx.stroke();
}

const HandwritingPad = forwardRef<HandwritingPadHandle, { rows?: number; fill?: boolean; onInk?: (has: boolean) => void; disabled?: boolean; className?: string }>(
  function HandwritingPad({ rows: fixedRows = 1, fill = false, onInk, disabled, className }, ref) {
    const wrap = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const strokes = useRef<Pt[][]>([]);
    const live = useRef<{ id: number; pts: Pt[] } | null>(null);
    const penSeen = useRef(false);
    const [width, setWidth] = useState(0);
    const [boxH, setBoxH] = useState(0);
    const fillH = Math.max(MIN_ROW_H + PAD_Y * 2, boxH);
    const avail = fillH - PAD_Y * 2;
    // Two slightly shorter rows beat one tall one on a small tablet.
    const rows = fill ? Math.min(MAX_ROWS, Math.max(avail >= 260 ? 2 : 1, Math.floor(avail / MIN_ROW_H))) : fixedRows;
    const height = fill ? fillH : rows * ROW_H + PAD_Y * 2;

    const redraw = useCallback(() => {
      const c = canvas.current; if (!c || !width) return;
      const dpr = window.devicePixelRatio || 1;
      const ctx = c.getContext('2d'); if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.scale(dpr, dpr);
      drawGuides(ctx, width, height, rows, 1);
      for (const s of strokes.current) drawStroke(ctx, s, width, height, 1);
      if (live.current) drawStroke(ctx, live.current.pts, width, height, 1);
    }, [width, height, rows]);

    useEffect(() => {
      const el = wrap.current; if (!el) return;
      const measure = () => { setWidth(Math.floor(el.clientWidth)); setBoxH(Math.floor(el.clientHeight)); };
      const ro = new ResizeObserver(measure);
      ro.observe(el); measure();
      return () => ro.disconnect();
    }, []);

    useEffect(() => {
      const c = canvas.current; if (!c || !width) return;
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(width * dpr); c.height = Math.round(height * dpr);
      c.style.width = `${width}px`; c.style.height = `${height}px`;
      redraw();
    }, [width, height, redraw]);

    const notify = () => onInk?.(strokes.current.length > 0);

    useImperativeHandle(ref, () => ({
      hasInk: () => strokes.current.length > 0,
      clear: () => { strokes.current = []; live.current = null; redraw(); notify(); },
      undo: () => { strokes.current.pop(); redraw(); notify(); },
      toPNG: () => {
        const outW = Math.min(1400, Math.max(600, Math.round(width * 1.5)));
        const scale = outW / Math.max(1, width);
        const outH = Math.round(height * scale);
        const off = document.createElement('canvas'); off.width = outW; off.height = outH;
        const ctx = off.getContext('2d')!;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, outW, outH);
        drawGuides(ctx, outW, outH, rows, scale);
        for (const s of strokes.current) drawStroke(ctx, s, outW, outH, scale);
        return off.toDataURL('image/png');
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [width, height, rows, redraw]);

    const point = (e: React.PointerEvent): Pt => {
      const r = canvas.current!.getBoundingClientRect();
      return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
    };
    const onDown = (e: React.PointerEvent) => {
      if (disabled) return;
      if (e.pointerType === 'pen') penSeen.current = true;
      if (penSeen.current && e.pointerType === 'touch') return; // palm
      if (live.current) return;
      e.preventDefault();
      canvas.current?.setPointerCapture(e.pointerId);
      live.current = { id: e.pointerId, pts: [point(e)] };
      redraw();
    };
    const onMove = (e: React.PointerEvent) => {
      const l = live.current; if (!l || l.id !== e.pointerId) return;
      e.preventDefault();
      const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() || [];
      if (evs.length) {
        const r = canvas.current!.getBoundingClientRect();
        for (const ce of evs) l.pts.push({ x: (ce.clientX - r.left) / r.width, y: (ce.clientY - r.top) / r.height });
      } else l.pts.push(point(e));
      redraw();
    };
    const onUp = (e: React.PointerEvent) => {
      const l = live.current; if (!l || l.id !== e.pointerId) return;
      strokes.current.push(l.pts); live.current = null;
      redraw(); notify();
    };

    return (
      <div ref={wrap} className={clsx('w-full rounded-xl2 bg-white border-2 border-line overflow-hidden select-none', fill && 'h-full', disabled && 'opacity-60', className)}
        style={fill ? undefined : { height }}>
        <canvas ref={canvas} aria-label="Writing paper" role="img"
          style={{ touchAction: 'none', display: 'block' }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      </div>
    );
  },
);

export default HandwritingPad;
