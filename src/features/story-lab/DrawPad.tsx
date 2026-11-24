// Story picture pad (legacy js/canvas.js, Nigel's layer only): five pens,
// undo, clear. Strokes are kept in 0–1 coordinates so a resize redraws them
// in place. One finger at a time; a second touch (a palm) is ignored.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import clsx from 'clsx';

export const PEN_COLORS = ['#0a0b2e', '#ec4899', '#14b8d4', '#22c55e', '#f59e0b'];
const PEN = 0.012;            // line width as a share of the pad's width
type Pt = [number, number];
interface Stroke { color: string; pts: Pt[] }
export interface DrawPadHandle { hasInk: () => boolean; toPNG: (maxW?: number) => string | null; clear: () => void }

export const DrawPad = forwardRef<DrawPadHandle, { className?: string; onInk?: (has: boolean) => void }>(function DrawPad({ className, onInk }, ref) {
  const wrap = useRef<HTMLDivElement>(null); const cv = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]); const live = useRef<{ id: number; s: Stroke } | null>(null);
  const [color, setColor] = useState(PEN_COLORS[0]); const [count, setCount] = useState(0);

  const paint = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, list: Stroke[]) => {
    ctx.clearRect(0, 0, w, h); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, w * PEN);
    for (const s of list) {
      ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.beginPath();
      s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
      if (s.pts.length === 1) { ctx.arc(s.pts[0][0] * w, s.pts[0][1] * h, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); } else ctx.stroke();
    }
  }, []);
  const redraw = useCallback(() => {
    const c = cv.current, el = wrap.current; if (!c || !el) return;
    const dpr = window.devicePixelRatio || 1; const w = el.clientWidth, h = el.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint(ctx, w, h, live.current ? [...strokes.current, live.current.s] : strokes.current);
  }, [paint]);

  useEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(redraw); ro.observe(el); redraw(); return () => ro.disconnect(); }, [redraw]);
  useEffect(() => { onInk?.(count > 0); }, [count, onInk]);

  const pos = (e: React.PointerEvent): Pt => { const r = cv.current!.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  const down = (e: React.PointerEvent) => {
    if (live.current) return; // palm or second finger
    cv.current!.setPointerCapture(e.pointerId); live.current = { id: e.pointerId, s: { color, pts: [pos(e)] } }; redraw();
  };
  const move = (e: React.PointerEvent) => { if (live.current?.id !== e.pointerId) return; live.current.s.pts.push(pos(e)); redraw(); };
  const up = (e: React.PointerEvent) => {
    if (live.current?.id !== e.pointerId) return;
    strokes.current = [...strokes.current, live.current.s]; live.current = null; setCount(strokes.current.length); redraw();
  };
  const undo = () => { strokes.current = strokes.current.slice(0, -1); setCount(strokes.current.length); redraw(); };
  const clear = () => { strokes.current = []; setCount(0); redraw(); };

  useImperativeHandle(ref, () => ({
    hasInk: () => strokes.current.length > 0,
    clear,
    // White background, scaled down so 30 saved stories still fit in the iPad's storage.
    toPNG: (maxW = 640) => {
      const el = wrap.current; if (!el || !strokes.current.length) return null;
      const w = Math.min(maxW, el.clientWidth), h = Math.round(w * (el.clientHeight / el.clientWidth));
      const off = document.createElement('canvas'); off.width = w; off.height = h;
      const ctx = off.getContext('2d'); if (!ctx) return null;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); paint(ctx, w, h, strokes.current);
      return off.toDataURL('image/png');
    },
  }));

  return (
    <div className={clsx('flex flex-col gap-2', className)}>
      <div className="shrink-0 flex items-center gap-2">
        <p className="mr-auto text-[14px] font-extrabold leading-snug">🎨 Draw a picture for your story — it will save with it.</p>
        {PEN_COLORS.map((c) => (
          <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Pen colour ${c}`} aria-pressed={color === c}
            className={clsx('tap h-16 w-16 shrink-0 rounded-2xl grid place-items-center border-2 bg-card', color === c ? 'border-ink' : 'border-line')}>
            <span className="h-9 w-9 rounded-full" style={{ background: c, boxShadow: color === c ? `0 0 0 4px ${c}33` : undefined }} />
          </button>
        ))}
        <button type="button" onClick={undo} disabled={!count} className="tap h-16 w-16 shrink-0 rounded-2xl border-2 border-line bg-card text-[13px] font-extrabold leading-tight disabled:opacity-40">↶<br />Undo</button>
        <button type="button" onClick={clear} disabled={!count} className="tap h-16 w-16 shrink-0 rounded-2xl border-2 border-line bg-card text-[13px] font-extrabold leading-tight disabled:opacity-40">🧽<br />Clear</button>
      </div>
      <div ref={wrap} className="relative flex-1 min-h-[96px] rounded-[20px] border-2 border-dashed border-line bg-white overflow-hidden touch-none">
        <canvas ref={cv} className="absolute inset-0 h-full w-full" aria-label="Drawing pad"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
        {count === 0 && <span className="pointer-events-none absolute inset-0 grid place-items-center text-[15px] font-bold text-muted/70">Draw here with your finger ✏️</span>}
      </div>
    </div>
  );
});
