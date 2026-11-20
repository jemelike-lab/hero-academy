// Cauldron Café (Number Lab). Layout from 21st take "Cauldron centre-stage"
// (project 5f488453…, take 1): recipe strip across the top, ten-frames over
// the kitchen on the left, Ms. Humphrey and the question card on the right.
// Fitted to 1194×834 (iPad) and 1280×712 (Galaxy Tab in Chrome) with no
// scrolling: on the serve step the keypad sits beside the answer box.
// Game logic in useCauldron / engine.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { useCauldron, type TileState } from './useCauldron';
import { NumberPad, TenFrames, Veg } from './parts';
import { SERVE_TRIES_BEFORE_MOVE_ON, type Recipe } from './engine';
import { onSpeaking } from '@/lib/tts';
import HumphreyPortrait, { useHumphrey } from '@/components/HumphreyPortrait';
import RalphiePortrait from '@/components/RalphiePortrait';
import { KID_NAME } from '@/lib/child';

const press = 'active:translate-y-[2px] active:shadow-none';

export default function CauldronPage() {
  const C = useCauldron();
  const s = C.state; const r = C.recipe; const step = C.step;
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => onSpeaking(setSpeaking), []);
  const humphrey = useHumphrey(s.phase === 'complete' ? 'cheering' : s.mood);
  const inPot = s.filled.reduce((a, b) => a + b, 0);
  const frames = r ? r.ingredients.reduce((n, i) => n + Math.ceil(i.count / 10), 0) : 0;
  const activeIng = step && step.kind !== 'serve' ? (step.kind === 'cross' ? step.ing + 1 : step.ing) : -1;

  return (
    <div className="h-full flex flex-col gap-3 px-5 pt-3 pb-4 max-w-[1280px] mx-auto w-full select-none">
      <header className="shrink-0 flex items-center justify-between gap-4">
        <Link to="/" className={clsx('tap h-16 min-w-[132px] rounded-2xl border-2 border-line bg-card px-5 shadow-tile flex items-center justify-center gap-2 font-display text-[18px] font-semibold', press)}>
          <span className="text-[22px] leading-none">←</span> Home
        </Link>
        <div className="text-center leading-tight">
          <h1 className="font-display text-[28px] font-semibold">Cauldron Café <span className="text-tutor">✦</span></h1>
          <p className="text-[13px] font-bold text-muted">Cooking &amp; math with Ms. Humphrey</p>
        </div>
        {s.specials.length > 0 ? (
          <motion.button onClick={C.openSpecial} whileTap={{ scale: 0.97 }} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
            className={clsx('tap h-16 min-w-[132px] rounded-2xl bg-tutor px-5 font-display text-[18px] font-semibold text-white shadow-[0_4px_0_0_rgb(160,30,80)] flex items-center gap-2', press)}>
            ★ Today’s Special
          </motion.button>
        ) : <span className="min-w-[132px]" />}
      </header>

      <RecipeStrip recipe={r} index={s.ri} total={s.recipes.length} filled={s.filled} active={activeIng} onSkip={C.skip} canSkip={s.phase === 'playing' && !s.served} />

      <AnimatePresence mode="wait">
        {s.phase !== 'complete' ? (
          <motion.main key="kitchen" exit={{ opacity: 0 }} className="flex-1 min-h-0 grid grid-cols-[1fr_420px] gap-4">
            {/* Left: ten-frames over the kitchen */}
            <div className="min-h-0 flex flex-col gap-3">
              <section className="shrink-0 rounded-[24px] border-2 border-line bg-card px-3 py-2.5 shadow-card flex flex-wrap gap-3 min-h-[96px]" aria-label="Ten-frames">
                {r ? r.ingredients.map((ing, i) => (
                  <TenFrames key={`${s.ri}-${i}`} id={ing.veggie.id} label={ing.veggie.label} need={ing.count} filled={s.filled[i] ?? 0} active={i === activeIng} cell={frames <= 3 ? 30 : 24} />
                )) : <p className="m-auto font-display text-[17px] text-muted">The ten-frames fill up as the veggies go in.</p>}
              </section>
              <Kitchen basket={s.basket} inPot={inPot} served={s.served} booting={s.phase === 'boot'} dish={r?.name} />
            </div>

            {/* Right: Ms. Humphrey and the question card */}
            <div className="min-h-0 flex flex-col gap-3">
              <section className="shrink-0 rounded-[24px] border-2 border-tutor/20 bg-card px-3 py-2.5 shadow-card flex items-center gap-3">
                <HumphreyPortrait state={humphrey} className="w-[68px] h-[68px] rounded-2xl ring-4 ring-tutor/20 shrink-0" />
                <div className="flex-1 leading-tight">
                  <div className="font-display text-[18px] font-semibold">Ms. Humphrey</div>
                  <span className={clsx('mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold', speaking ? 'bg-tutor/10 text-tutor' : 'bg-teal/10 text-teal')}>
                    <span className={clsx('h-1.5 w-1.5 rounded-full', speaking ? 'bg-tutor animate-pulse' : 'bg-teal')} />{speaking ? 'speaking' : 'listening'}
                  </span>
                </div>
                <button onClick={C.repeat} disabled={s.phase === 'boot'}
                  className={clsx('tap h-16 rounded-2xl border-2 border-teal/30 bg-teal/10 px-4 font-display text-[17px] font-semibold text-teal shadow-tile flex items-center gap-2 disabled:opacity-40', press)}>
                  <span className="text-[20px] leading-none">🔊</span> Repeat
                </button>
              </section>

              <section className="relative flex-1 min-h-0 rounded-[24px] border-2 border-line bg-card px-5 py-4 shadow-card flex flex-col gap-3" aria-live="polite">
                <span className="absolute -top-[9px] left-10 h-4 w-4 rotate-45 border-l-2 border-t-2 border-line bg-card" />
                {s.serving || (s.served && step?.kind === 'serve') ? (
                  <Serve recipe={r!} entry={s.entry} served={s.served} wrongServes={s.wrongServes} feedback={s.feedback}
                    onKey={C.key} onServe={C.serve} onMoveOn={C.moveOn} />
                ) : (
                  <>
                    <AnimatePresence mode="wait">
                      <motion.p key={s.question} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="font-display text-[21px] font-medium leading-snug">{s.question}</motion.p>
                    </AnimatePresence>
                    <div className="mt-auto flex flex-col gap-2.5">
                      {s.options.map((o, i) => (
                        <Answer key={`${s.si}-${o}`} value={o} state={s.tiles[o] ?? 'idle'} index={i} onPick={C.answer} />
                      ))}
                    </div>
                    <Feedback fb={s.feedback} />
                  </>
                )}
              </section>
            </div>
          </motion.main>
        ) : (
          <Complete key="done" dishes={s.recipes.length} onAgain={C.cookAgain} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {s.special.open && s.specials[s.special.idx] && (
          <Special idx={s.special.idx} total={s.specials.length} prompt={s.specials[s.special.idx].prompt} answer={s.specials[s.special.idx].answer}
            entry={s.special.entry} result={s.special.result} onKey={C.specialKey} onCheck={C.checkSpecial} onNext={C.nextSpecial} onClose={C.closeSpecial} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- recipe strip ----------
function RecipeStrip({ recipe, index, total, filled, active, onSkip, canSkip }: { recipe?: Recipe; index: number; total: number; filled: number[]; active: number; onSkip: () => void; canSkip: boolean }) {
  return (
    <section className="shrink-0 h-[76px] rounded-[24px] border-2 border-line bg-card pl-3 pr-2 shadow-card flex items-center gap-3">
      <div className="h-14 w-14 shrink-0 rounded-2xl bg-tutor/10 grid place-items-center">
        {recipe ? <Veg id={recipe.ingredients[recipe.ingredients.length - 1].veggie.id} size={34} /> : <span className="text-[26px]">🍲</span>}
      </div>
      <div className="flex-1 min-w-0 leading-tight">
        <AnimatePresence mode="wait">
          <motion.div key={recipe?.name ?? 'loading'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
            <div className="truncate font-display text-[21px] font-semibold">{recipe ? recipe.name : 'Getting tonight’s recipes…'}</div>
            <div className="text-[14px] font-bold text-muted">
              {recipe ? <>Today’s challenge: <span className="text-teal font-extrabold">{recipe.equation}</span>{total > 1 && <span className="ml-2 text-muted/80">· Recipe {Math.min(index + 1, total)} of {total}</span>}</> : 'Chef Ralphie is in the pantry'}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      {recipe && (
        <div className="flex items-center gap-2">
          {recipe.ingredients.map((ing, i) => {
            const full = (filled[i] ?? 0) >= ing.count;
            return (
              <span key={i} className={clsx('h-9 rounded-full border-2 px-3 flex items-center gap-1.5 text-[13px] font-extrabold transition-colors',
                full ? 'border-grass/50 bg-grass/10 text-[rgb(25,130,75)]' : i === active ? 'border-sun bg-sun/15 text-ink' : 'border-line bg-paper text-muted')}>
                <span className={clsx('h-2.5 w-2.5 rounded-full', full ? 'bg-grass' : i === active ? 'bg-sun' : 'bg-line')} />{ing.veggie.label} {ing.count}
              </span>
            );
          })}
        </div>
      )}
      <button onClick={onSkip} disabled={!canSkip} className="tap h-16 shrink-0 rounded-2xl px-4 font-display text-[15px] font-medium text-muted hover:bg-paper disabled:opacity-30">
        Skip recipe ▶
      </button>
    </section>
  );
}

// ---------- kitchen: basket → cauldron, with Chef Ralphie ----------
function Kitchen({ basket, inPot, served, booting, dish }: { basket: ReturnType<typeof useCauldron>['state']['basket']; inPot: number; served: boolean; booting: boolean; dish?: string }) {
  const scene = useRef<HTMLDivElement>(null); const pot = useRef<HTMLDivElement>(null); const bk = useRef<HTMLDivElement>(null);
  const [fly, setFly] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    if (!basket.flying || !pot.current || !bk.current) return;
    const a = bk.current.getBoundingClientRect(); const b = pot.current.getBoundingClientRect();
    setFly({ x: b.left + b.width / 2 - (a.left + a.width / 2), y: b.top + b.height * 0.25 - (a.top + a.height / 2) });
  }, [basket.flying]);

  return (
    <section ref={scene} className="relative flex-1 min-h-0 overflow-hidden rounded-[24px] border-2 border-line shadow-card"
      style={{ background: 'linear-gradient(180deg, #FFF6E6 0%, #FDEBD2 68%, #F2D9B6 68%, #EDD1AA 100%)' }} aria-label="Kitchen">
      {/* shelf with jars */}
      <div className="absolute left-6 right-6 top-[14%] h-3 rounded-full bg-[#C99B6B] shadow-[0_3px_0_#A97B4E]" />
      <div className="absolute left-10 top-[calc(14%-38px)] flex items-end gap-3" aria-hidden>
        {['#F2B5C8', '#BFE3D9', '#FFE19A', '#D8C6F0'].map((c, i) => (
          <span key={i} className="block w-7 rounded-t-lg rounded-b-md border-2 border-white/70" style={{ background: c, height: 26 + (i % 2) * 10 }} />
        ))}
      </div>
      <div className="absolute right-10 top-[calc(14%-34px)] text-[26px]" aria-hidden>🧂🫙</div>

      {/* cauldron */}
      <div ref={pot} className="absolute left-1/2 bottom-[12%] -translate-x-1/2 w-[min(44%,280px)] aspect-[1.25]">
        <Cauldron inPot={inPot} bubbling={inPot > 0} served={served} />
        <motion.div key={inPot} initial={{ scale: 1.2 }} animate={{ scale: 1 }}
          className="absolute left-1/2 -bottom-4 -translate-x-1/2 whitespace-nowrap rounded-2xl border-2 border-[#C8733A]/40 bg-card px-4 py-1.5 font-display text-[19px] font-semibold text-[#A0551F] shadow-tile">
          {inPot} in the pot
        </motion.div>
      </div>

      {/* basket */}
      <div ref={bk} className="absolute left-5 bottom-3 w-[150px]">
        <div className="relative h-[86px] rounded-b-[26px] rounded-t-lg border-[3px] border-[#9C6B3E] shadow-tile"
          style={{ background: 'repeating-linear-gradient(45deg, #C99B6B 0 10px, #B8875A 10px 20px)' }}>
          <AnimatePresence>
            {basket.veg && (
              <motion.div key={`${basket.veg.id}-${basket.size}`} className="absolute inset-x-0 -top-6 flex justify-center gap-0.5"
                initial={{ y: -40, opacity: 0 }}
                animate={basket.flying ? { x: fly.x, y: fly.y, scale: 0.35, opacity: 0, transition: { duration: 0.7, ease: [0.4, 0, 0.6, 1] } } : { x: 0, y: 0, scale: 1, opacity: 1 }}
                exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }}>
                {Array.from({ length: basket.size }).map((_, i) => (
                  <motion.span key={i} className="relative" animate={basket.counting ? { y: [0, -16, 0] } : { y: 0 }} transition={{ delay: basket.counting ? i * 0.32 : 0, duration: 0.3 }}>
                    <Veg id={basket.veg!.id} size={30} />
                    {basket.counting && (
                      <motion.span initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.32 }}
                        className="absolute -top-6 left-1/2 -translate-x-1/2 h-6 w-6 rounded-full bg-teal text-white text-[13px] font-extrabold grid place-items-center">{i + 1}</motion.span>
                    )}
                  </motion.span>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="mt-1.5 text-center text-[12px] font-extrabold text-muted">{booting ? 'Basket' : basket.label || '\u00a0'}</div>
      </div>

      {/* Chef Ralphie */}
      <div className="absolute right-4 bottom-4 flex flex-col items-end">
        <span className="mb-1.5 mr-3 rounded-2xl border-2 border-line bg-card px-3 py-1 text-[13px] font-extrabold shadow-tile">{served ? 'Yum!' : booting ? 'Hmm, what shall we cook?' : 'Stir, stir!'}</span>
        <RalphiePortrait state={served ? 'cheer' : 'chef'} className="w-[132px] h-[132px] rounded-[22px] ring-4 ring-white shadow-card" />
      </div>

      {/* served banner */}
      <AnimatePresence>
        {served && (
          <motion.div initial={{ opacity: 0, y: -14, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
            className="absolute left-1/2 top-[22%] -translate-x-1/2 rounded-[22px] border-2 border-grass/40 bg-card px-6 py-3 text-center shadow-card">
            <div className="font-display text-[22px] font-semibold text-[rgb(25,130,75)]">🍽️ Ready to serve!</div>
            {dish && <div className="text-[14px] font-bold text-muted">{dish}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function Cauldron({ inPot, bubbling, served }: { inPot: number; bubbling: boolean; served: boolean }) {
  return (
    <div className="relative h-full w-full">
      {(served || bubbling) && (
        <div className="pointer-events-none absolute left-1/2 -top-10 -translate-x-1/2 flex gap-5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <motion.span key={i} className="block h-10 w-3 rounded-full bg-white/80 blur-[3px]"
              animate={{ y: [8, -26], opacity: [0, served ? 0.9 : 0.5, 0], scaleX: [1, 1.8] }} transition={{ repeat: Infinity, duration: served ? 1.4 : 2.4, delay: i * 0.5 }} />
          ))}
        </div>
      )}
      <svg viewBox="0 0 250 200" className="h-full w-full" aria-hidden>
        <defs>
          <linearGradient id="cc-copper" x1="0" x2="1"><stop offset="0" stopColor="#B4622C" /><stop offset="0.45" stopColor="#E79A5C" /><stop offset="1" stopColor="#A9592A" /></linearGradient>
          <radialGradient id="cc-soup" cx="0.5" cy="0.4"><stop offset="0" stopColor="#F07A3E" /><stop offset="1" stopColor="#C2502A" /></radialGradient>
        </defs>
        <path d="M60 172 L48 196 M190 172 L202 196 M125 180 L125 198" stroke="#7A4524" strokeWidth="9" strokeLinecap="round" />
        <path d="M18 62 Q16 176 125 182 Q234 176 232 62 Z" fill="url(#cc-copper)" />
        <ellipse cx="86" cy="104" rx="14" ry="34" fill="#fff" opacity="0.18" />
        <ellipse cx="125" cy="60" rx="114" ry="24" fill="#8C4A22" />
        <ellipse cx="125" cy="62" rx="100" ry="17" fill={inPot > 0 ? 'url(#cc-soup)' : '#5A2E14'} />
        {inPot > 0 && [[92, 60], [124, 66], [150, 58], [170, 64], [108, 57]].slice(0, Math.min(5, Math.ceil(inPot / 4))).map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="5" fill={i % 2 ? '#3D8A3D' : '#F08A2A'} />
        ))}
        <rect x="8" y="54" width="234" height="14" rx="7" fill="#C8733A" />
        <path d="M14 78 q-14 0 -12 16 M236 78 q14 0 12 16" stroke="#8C4A22" strokeWidth="7" fill="none" strokeLinecap="round" />
      </svg>
      {bubbling && (
        <div className="pointer-events-none absolute inset-x-[25%] top-[22%] h-6" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <motion.span key={i} className="absolute h-3 w-3 rounded-full border-2 border-[#FFD2B0] bg-[#F7A26A]" style={{ left: `${10 + i * 25}%` }}
              animate={{ y: [4, -6], opacity: [0, 1, 0], scale: [0.6, 1.1] }} transition={{ repeat: Infinity, duration: 1.6, delay: i * 0.4 }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- answers ----------
function Answer({ value, state, index, onPick }: { value: number; state: TileState; index: number; onPick: (n: number) => void }) {
  return (
    <motion.button onClick={() => onPick(value)} disabled={state === 'off' || state === 'correct'}
      initial={{ opacity: 0, x: 16 }} animate={state === 'wrong' ? { opacity: 1, x: [0, -8, 8, -5, 0] } : state === 'hint' ? { opacity: 1, x: 0, scale: [1, 1.04, 1] } : { opacity: 1, x: 0 }}
      transition={state === 'hint' ? { repeat: Infinity, duration: 1.2 } : { delay: state === 'idle' ? index * 0.06 : 0 }}
      whileTap={state === 'idle' || state === 'hint' ? { scale: 0.97 } : undefined}
      aria-label={String(value)}
      className={clsx('tap h-16 w-full rounded-[20px] border-2 font-display text-[30px] font-semibold shadow-tile', press,
        state === 'correct' ? 'border-grass bg-grass text-white'
        : state === 'wrong' ? 'border-amber bg-amber/10 text-[rgb(180,105,5)]'
        : state === 'hint' ? 'border-sun bg-sun/20 ring-4 ring-sun/40'
        : state === 'off' ? 'border-line bg-paper text-muted opacity-50'
        : 'border-line bg-card')}>
      {state === 'correct' ? `✓ ${value}` : value}
    </motion.button>
  );
}

function Feedback({ fb }: { fb: { kind: string; text: string } }) {
  return (
    <div className="min-h-[24px]">
      <AnimatePresence mode="wait">
        {fb.kind !== 'none' && (
          <motion.p key={fb.text} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={clsx('text-[15px] font-extrabold leading-snug', fb.kind === 'correct' ? 'text-[rgb(25,130,75)]' : fb.kind === 'wrong' ? 'text-[rgb(180,105,5)]' : 'text-teal')}>
            {fb.kind === 'correct' ? '✓ ' : ''}{fb.text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- serve: equation, answer box + keypad side by side ----------
function Serve({ recipe, entry, served, wrongServes, feedback, onKey, onServe, onMoveOn }: { recipe: Recipe; entry: string; served: boolean; wrongServes: number; feedback: { kind: string; text: string }; onKey: (k: string) => void; onServe: () => void; onMoveOn: () => void }) {
  const stuck = !served && wrongServes >= SERVE_TRIES_BEFORE_MOVE_ON;
  return (
    <>
      <div className={clsx('shrink-0 rounded-[20px] border-2 border-dashed py-0.5 text-center font-display text-[30px] font-semibold', served ? 'border-grass/50 bg-grass/10' : 'border-amber/60 bg-sun/10')}>
        {served ? recipe.equation.replace('?', String(recipe.answer)) : recipe.equation}
      </div>
      {feedback.kind !== 'none' && <div className="-my-1"><Feedback fb={feedback} /></div>}
      <div className="flex-1 min-h-0 flex gap-3">
        <div className="flex-1 min-w-0 flex flex-col gap-2.5">
          <div className={clsx('h-[76px] shrink-0 rounded-[20px] border-[3px] grid place-items-center font-display text-[40px] font-semibold tabular-nums',
            served ? 'border-grass bg-grass/10 text-[rgb(25,130,75)]' : 'border-sun bg-card')} aria-label="Your answer">
            {served ? recipe.answer : entry ? entry : <motion.span animate={{ opacity: [1, 0.2, 1] }} transition={{ repeat: Infinity, duration: 1.1 }} className="text-muted">_</motion.span>}
          </div>
          <motion.button onClick={onServe} disabled={served || !entry} whileTap={{ scale: 0.97 }}
            className={clsx('tap h-16 shrink-0 rounded-[20px] bg-sun font-display text-[20px] font-semibold text-ink shadow-[0_4px_0_0_rgb(220,160,30)] disabled:opacity-40', press)}>
            Serve it up!
          </motion.button>
          {stuck && (
            <motion.button onClick={onMoveOn} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className={clsx('tap h-16 shrink-0 rounded-[20px] border-2 border-teal/40 bg-teal/10 px-2 font-display text-[15px] font-semibold leading-tight text-teal shadow-tile', press)}>
              Show me &amp; move on →
            </motion.button>
          )}
        </div>
        <NumberPad onKey={onKey} disabled={served} className="w-[216px] shrink-0 content-start" />
      </div>
    </>
  );
}

// ---------- Today's Special ----------
function Special({ idx, total, prompt, answer, entry, result, onKey, onCheck, onNext, onClose }: { idx: number; total: number; prompt: string; answer: number; entry: string; result: 'none' | 'right' | 'wrong'; onKey: (k: string) => void; onCheck: () => void; onNext: () => void; onClose: () => void }) {
  return (
    <motion.div className="fixed inset-0 z-40 grid place-items-center bg-ink/25 backdrop-blur-[3px] p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section role="dialog" aria-labelledby="cc-special" initial={{ y: 24, scale: 0.96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 16, opacity: 0 }}
        className="w-full max-w-[600px] max-h-full overflow-y-auto rounded-[28px] border-2 border-line bg-card p-5 shadow-card flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 rounded-2xl bg-tutor/10 grid place-items-center text-[26px]">⭐</div>
          <div className="flex-1 leading-tight">
            <h2 id="cc-special" className="font-display text-[24px] font-semibold">Today’s Special</h2>
            <div className="text-[13px] font-extrabold text-tutor">Problem {idx + 1} / {total}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className={clsx('tap h-16 w-16 rounded-2xl border-2 border-line bg-paper text-[24px] font-bold text-muted shadow-tile', press)}>×</button>
        </div>
        <p className="rounded-[20px] border-2 border-dashed border-amber/60 bg-sun/10 px-4 py-3 font-display text-[19px] font-medium leading-snug">{prompt}</p>
        <div className="flex gap-3">
          <div className="flex-1 min-w-0 flex flex-col gap-2.5">
            <div className={clsx('h-[76px] rounded-[20px] border-[3px] grid place-items-center font-display text-[40px] font-semibold tabular-nums',
              result === 'right' ? 'border-grass bg-grass/10 text-[rgb(25,130,75)]' : result === 'wrong' ? 'border-amber' : 'border-sun')}>
              {entry || <span className="text-muted text-[18px] font-bold">Type your answer</span>}
            </div>
            {result !== 'right' ? (
              <motion.button onClick={onCheck} disabled={!entry} whileTap={{ scale: 0.97 }}
                className={clsx('tap h-16 rounded-[20px] bg-sun font-display text-[20px] font-semibold text-ink shadow-[0_4px_0_0_rgb(220,160,30)] disabled:opacity-40', press)}>Check answer</motion.button>
            ) : (
              <motion.button onClick={onNext} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} whileTap={{ scale: 0.97 }}
                className={clsx('tap h-16 rounded-[20px] bg-teal font-display text-[20px] font-semibold text-white shadow-tile', press)}>{idx + 1 < total ? 'Next problem →' : 'All done ✓'}</motion.button>
            )}
            <p className={clsx('min-h-[22px] text-[15px] font-extrabold', result === 'right' ? 'text-[rgb(25,130,75)]' : 'text-[rgb(180,105,5)]')}>
              {result === 'right' ? `✓ Yes — ${answer} is right.` : result === 'wrong' ? 'Not quite. Let’s try again.' : ''}
            </p>
          </div>
          <NumberPad onKey={onKey} disabled={result === 'right'} className="w-[216px] shrink-0" />
        </div>
      </motion.section>
    </motion.div>
  );
}

// ---------- menu complete ----------
function Complete({ dishes, onAgain }: { dishes: number; onAgain: () => void }) {
  const confetti = useRef(Array.from({ length: 26 }, (_, i) => ({ left: Math.random() * 100, delay: Math.random() * 1.2, dur: 1.8 + Math.random() * 1.4, color: ['#FFC53D', '#D6336C', '#2EB872', '#0E8C8C', '#C8733A'][i % 5], rot: Math.random() * 360 }))).current;
  return (
    <motion.main initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="relative flex-1 min-h-0 grid place-items-center overflow-hidden">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {confetti.map((c, i) => (
          <motion.span key={i} className="absolute top-0 h-3.5 w-2.5 rounded-sm" style={{ left: `${c.left}%`, background: c.color }}
            initial={{ y: -20, rotate: c.rot, opacity: 1 }} animate={{ y: 520, rotate: c.rot + 540, opacity: 0 }} transition={{ delay: c.delay, duration: c.dur, ease: 'easeIn' }} />
        ))}
      </div>
      <div className="flex flex-col items-center text-center">
        <div className="flex items-end gap-1" aria-hidden><Veg id="carrot" size={40} /><Veg id="tomato" size={44} /><Veg id="potato" size={40} /></div>
        <h2 className="mt-2 font-display text-[44px] font-semibold leading-tight">That’s the whole menu!</h2>
        <p className="font-display text-[19px] font-medium text-muted">Beautiful work in my kitchen today.</p>
        <div className="mt-5 flex items-center gap-4 rounded-[24px] border-2 border-tutor/20 bg-card px-5 py-4 shadow-card">
          <HumphreyPortrait state="cheering" className="h-[76px] w-[76px] rounded-2xl ring-4 ring-tutor/20" />
          <p className="text-left font-display text-[19px] font-medium leading-snug">“Beautiful work, {KID_NAME}. You served <span className="font-semibold text-tutor">{dishes} {dishes === 1 ? 'dish' : 'dishes'}</span> today.”<br /><span className="text-[14px] font-bold text-muted">— Ms. Humphrey</span></p>
          <RalphiePortrait state="cheer" className="h-[76px] w-[76px] rounded-2xl ring-4 ring-white" />
        </div>
        <span className="mt-4 rounded-full border-2 border-grass/40 bg-grass/10 px-4 py-1 text-[14px] font-extrabold text-[rgb(25,130,75)]">{dishes} / {dishes} recipes served</span>
        <div className="mt-5 flex gap-4">
          <button onClick={onAgain} className={clsx('tap h-16 rounded-[22px] bg-sun px-8 font-display text-[19px] font-semibold text-ink shadow-[0_4px_0_0_rgb(220,160,30)]', press)}>🍲 Cook again</button>
          <Link to="/" className={clsx('tap h-16 rounded-[22px] border-2 border-line bg-card px-7 font-display text-[19px] font-semibold shadow-tile flex items-center gap-2', press)}><span className="text-[22px]">←</span> Home</Link>
        </div>
      </div>
    </motion.main>
  );
}
