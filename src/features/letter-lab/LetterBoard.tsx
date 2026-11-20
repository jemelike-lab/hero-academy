// Letter Lab drawing board (replaces legacy js/canvas.js for this zone).
// One 4:3 board, virtual coordinates 1000 × 750. Nigel's ink layer takes finger
// or Apple Pencil (once a pencil is used, finger touches are ignored so a
// resting palm doesn't draw). Ms. Humphrey's layer replays her strokes at the
// legacy pen speed with a glowing pen tip. toPNG() bakes guides + ink, as the
// legacy getDataURL() composited its layers on white.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import clsx from 'clsx';
import { INK_WIDTH, VIRTUAL_W, guides, planStrokes, type Kind, type Seg } from './engine';

type Pt = { x: number; y: number }; // virtual units
export interface LetterBoardHandle {
  hasInk: () => boolean; undo: () => void; clear: () => void;
  toPNG: (which: 'nigel' | 'humphrey') => string;
  playDemo: (chars: string[], kind: Kind) => Promise<void>;
  clearDemo: () => void;
}

const VH = 750;
const NIGEL_INK = '#1f2d4d';
const NIGEL_W = 13;
const HUMPHREY_INK = '#d6336c';

function paintGuides(ctx: CanvasRenderingContext2D, k: number) {
  const g = guides(VH);
  ctx.save();
  ctx.lineWidth = 3 * k; ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(14,140,140,0.30)'; ctx.beginPath(); ctx.moveTo(40 * k, g.top * k); ctx.lineTo((VIRTUAL_W - 40) * k, g.top * k); ctx.stroke();
  ctx.strokeStyle = 'rgba(14,140,140,0.30)'; ctx.setLineDash([16 * k, 14 * k]); ctx.beginPath(); ctx.moveTo(40 * k, g.mid * k); ctx.lineTo((VIRTUAL_W - 40) * k, g.mid * k); ctx.stroke();
  ctx.setLineDash([]); ctx.lineWidth = 3.5 * k; ctx.strokeStyle = 'rgba(220,80,80,0.45)'; ctx.beginPath(); ctx.moveTo(40 * k, g.base * k); ctx.lineTo((VIRTUAL_W - 40) * k, g.base * k); ctx.stroke();
  ctx.restore();
}
function paintStroke(ctx: CanvasRenderingContext2D, s: Pt[], k: number) {
  if (!s.length) return;
  ctx.strokeStyle = NIGEL_INK; ctx.fillStyle = NIGEL_INK; ctx.lineWidth = NIGEL_W * k; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (s.length === 1) { ctx.beginPath(); ctx.arc(s[0].x * k, s[0].y * k, (NIGEL_W / 2) * k, 0, Math.PI * 2); ctx.fill(); return; }
  ctx.beginPath(); ctx.moveTo(s[0].x * k, s[0].y * k);
  for (let i = 1; i < s.length - 1; i++) { const mx = (s[i].x + s[i + 1].x) / 2, my = (s[i].y + s[i + 1].y) / 2; ctx.quadraticCurveTo(s[i].x * k, s[i].y * k, mx * k, my * k); }
  const l = s[s.length - 1]; ctx.lineTo(l.x * k, l.y * k); ctx.stroke();
}
// Her strokes up to time t (ms into the plan); returns the pen-tip position, if any.
function paintDemo(ctx: CanvasRenderingContext2D, segs: Seg[], t: number, k: number): Pt | null {
  ctx.strokeStyle = HUMPHREY_INK; ctx.lineWidth = INK_WIDTH * k; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  let tip: Pt | null = null;
  for (const s of segs) {
    if (t <= s.start) break;
    const f = Math.min(1, (t - s.start) / s.dur);
    const x = s.x1 + (s.x2 - s.x1) * f, y = s.y1 + (s.y2 - s.y1) * f;
    ctx.beginPath(); ctx.moveTo(s.x1 * k, s.y1 * k); ctx.lineTo(x * k, y * k); ctx.stroke();
    tip = f < 1 || t < s.start + s.dur + 180 ? { x, y } : null; // tip lingers 180 ms after a stroke, like legacy
  }
  return tip;
}

const LetterBoard = forwardRef<LetterBoardHandle, { disabled?: boolean; onInk?: (has: boolean) => void; className?: string; label?: string; children?: React.ReactNode }>(
  function LetterBoard({ disabled, onInk, className, label, children }, ref) {
    const wrap = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const strokes = useRef<Pt[][]>([]);
    const live = useRef<{ id: number; pts: Pt[] } | null>(null);
    const penSeen = useRef(false);
    const demo = useRef<{ segs: Seg[]; t: number } | null>(null);
    const raf = useRef(0);
    const [size, setSize] = useState({ w: 0, h: 0 });

    const redraw = useCallback(() => {
      const c = canvas.current; if (!c || !c.width) return;
      const ctx = c.getContext('2d'); if (!ctx) return;
      const s = c.width / VIRTUAL_W;
      ctx.clearRect(0, 0, c.width, c.height);
      paintGuides(ctx, s);
      for (const st of strokes.current) paintStroke(ctx, st, s);
      if (live.current) paintStroke(ctx, live.current.pts, s);
      if (demo.current) {
        const tip = paintDemo(ctx, demo.current.segs, demo.current.t, s);
        if (tip) { // glowing pen tip: outer glow, solid dot, white highlight (legacy look)
          ctx.fillStyle = 'rgba(214,51,108,0.32)'; ctx.beginPath(); ctx.arc(tip.x * s, tip.y * s, 22 * s, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = HUMPHREY_INK; ctx.beginPath(); ctx.arc(tip.x * s, tip.y * s, 12 * s, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc((tip.x - 3) * s, (tip.y - 3) * s, 4 * s, 0, Math.PI * 2); ctx.fill();
        }
      }
    }, []);

    // Fit a 4:3 board inside the wrapper.
    useEffect(() => {
      const el = wrap.current; if (!el) return;
      const fit = () => { const W = el.clientWidth, H = el.clientHeight; const w = Math.floor(Math.min(W, (H * 4) / 3)); setSize({ w, h: Math.floor((w * 3) / 4) }); };
      const ro = new ResizeObserver(fit); ro.observe(el); fit();
      return () => ro.disconnect();
    }, []);
    useEffect(() => {
      const c = canvas.current; if (!c || !size.w) return;
      const dpr = window.devicePixelRatio || 1;
      const r = c.getBoundingClientRect();
      c.width = Math.round((r.width || size.w) * dpr); c.height = Math.round((r.height || size.h) * dpr);
      redraw();
    }, [size, redraw]);
    useEffect(() => () => cancelAnimationFrame(raf.current), []);

    const notify = () => onInk?.(strokes.current.length > 0);

    useImperativeHandle(ref, () => ({
      hasInk: () => strokes.current.length > 0,
      undo: () => { strokes.current.pop(); redraw(); notify(); },
      clear: () => { strokes.current = []; live.current = null; redraw(); notify(); },
      clearDemo: () => { cancelAnimationFrame(raf.current); demo.current = null; redraw(); },
      toPNG: (which) => {
        const W = 900, H = 675, s = W / VIRTUAL_W;
        const off = document.createElement('canvas'); off.width = W; off.height = H;
        const ctx = off.getContext('2d')!;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
        paintGuides(ctx, s);
        if (which === 'nigel') for (const st of strokes.current) paintStroke(ctx, st, s);
        else if (demo.current) paintDemo(ctx, demo.current.segs, Infinity, s);
        return off.toDataURL('image/png');
      },
      playDemo: (chars, kind) => new Promise<void>((resolve) => {
        cancelAnimationFrame(raf.current);
        const { segs, total } = planStrokes(chars, VH, kind);
        demo.current = { segs, t: 0 };
        const t0 = performance.now();
        const frame = (now: number) => {
          if (!demo.current) return resolve();
          demo.current.t = now - t0; redraw();
          if (demo.current.t < total + 200) raf.current = requestAnimationFrame(frame);
          else { demo.current.t = Infinity; redraw(); resolve(); }
        };
        raf.current = requestAnimationFrame(frame);
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [redraw]);

    const point = (cx: number, cy: number): Pt => {
      const r = canvas.current!.getBoundingClientRect();
      return { x: Math.min(VIRTUAL_W, Math.max(0, ((cx - r.left) / r.width) * VIRTUAL_W)), y: Math.min(VH, Math.max(0, ((cy - r.top) / r.height) * VH)) };
    };
    const onDown = (e: React.PointerEvent) => {
      if (disabled) return;
      if (e.pointerType === 'pen') penSeen.current = true;
      if (penSeen.current && e.pointerType === 'touch') return; // palm
      if (live.current) return;
      e.preventDefault();
      canvas.current?.setPointerCapture(e.pointerId);
      live.current = { id: e.pointerId, pts: [point(e.clientX, e.clientY)] };
      redraw();
    };
    const onMove = (e: React.PointerEvent) => {
      const l = live.current; if (!l || l.id !== e.pointerId) return;
      e.preventDefault();
      const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() || [];
      if (evs.length) for (const ce of evs) l.pts.push(point(ce.clientX, ce.clientY)); else l.pts.push(point(e.clientX, e.clientY));
      redraw();
    };
    const onUp = (e: React.PointerEvent) => {
      const l = live.current; if (!l || l.id !== e.pointerId) return;
      strokes.current.push(l.pts); live.current = null; redraw(); notify();
    };

    return (
      <div ref={wrap} className={clsx('relative w-full h-full min-h-0 grid place-items-center', className)}>
        {/* Overlays (children) share the board's exact box and rounded corners. */}
        <div className="relative overflow-hidden rounded-[28px] bg-white shadow-card border-2 border-line" style={{ width: size.w, height: size.h }}>
          <canvas ref={canvas} aria-label={label || 'Drawing board'} role="img"
            className={clsx('block select-none', disabled && 'cursor-default')}
            style={{ width: '100%', height: '100%', touchAction: 'none' }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
          {children}
        </div>
      </div>
    );
  },
);

export default LetterBoard;
