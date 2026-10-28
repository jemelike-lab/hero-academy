import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { useDigitTower } from './useDigitTower';
import { PHASES, RANKS, TOTAL_MIN, TWISTS, WORLDS, rankFor } from './config';
import { RoomGrid, HeroSVG } from './RoomGrid';
import WorkBoard from './WorkBoard';
import { allVaultsOpen, tileAt, key } from './room';
import { onSpeaking } from '@/lib/tts';
import { KID_NAME } from '@/lib/child';
import HumphreyPortrait, { type HumphreyState } from '@/components/HumphreyPortrait';
import RalphiePortrait from '@/components/RalphiePortrait';

const PHASE_LABEL: Record<string, string> = { hq: 'Hero HQ', warmup: 'Warm-up', floors: 'Tower', break: 'Break', bonus: 'Bonus', debrief: 'Debrief' };
const PHASE_COLOR: Record<string, string> = { hq: '#7c5cff', warmup: '#7c5cff', floors: '#35e0ff', break: '#5cf0b0', bonus: '#ffc72c', debrief: '#ff5e7a' };

export default function DigitTowerPage() {
  const { state: s, leaveHQ, tapTile, typeDigit, check, toggleWork, askRalphie, readAgain, skipBreak, toggleMute, toggleMusic, exit } = useDigitTower();
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => onSpeaking(setSpeaking), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (s.mode !== 'prob') return; if (/^[0-9]$/.test(e.key)) typeDigit(e.key); else if (e.key === 'Backspace') typeDigit('del'); else if (e.key === 'Enter') check(); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [s.mode, typeDigit, check]);

  const w = WORLDS[s.worldIdx]; const p = s.progress;
  const rank = rankFor((p?.first_try_total || 0) + s.firstTryToday);
  const gems = (p?.gems || 0) + s.gemsToday;
  const minutes = Math.floor(s.elapsedMs / 60000);
  const twist = TWISTS.find((t) => t.id === s.twist) || TWISTS[0];
  const vaults = s.room ? countVaults(s.room) : null;
  const humphrey: HumphreyState = s.mode === 'done' ? 'goodbye' : s.mode === 'roomend' ? 'cheering' : s.answerState === 'ok' ? 'delighted' : s.mode === 'prob' && s.tries > 0 ? 'encouraging' : speaking ? 'speaking' : 'idle';
  // On a light scene a pale accent (cream, pale blue) disappears, so swap it for the world's other accent.
  const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  const acc2 = lum(w.acc2) > 0.8 ? (lum(w.acc) > 0.8 ? '#0E8C8C' : w.acc) : w.acc2;
  const acc = lum(w.acc) > 0.8 ? (lum(w.acc2) > 0.8 ? '#D6336C' : w.acc2) : w.acc;
  const theme = { ['--dt-wall' as string]: w.wall, ['--dt-floor' as string]: w.floor, ['--dt-floor2' as string]: w.floor2, ['--dt-acc' as string]: acc, ['--dt-acc2' as string]: acc2 };

  return (
    <div className="dt-scene h-full flex flex-col font-display select-none" style={theme}>
      {/* HUD */}
      <header className="h-[72px] px-4 lg:px-5 flex items-center justify-between gap-4 z-30">
        <div className="dt-pill rounded-full pl-3 pr-4 py-2 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full grid place-items-center" style={{ background: 'linear-gradient(180deg,#ffd75a,#e0a200)', boxShadow: '0 0 12px rgba(255,199,44,.6)' }}><span className="text-[#3a2400] text-sm">★</span></div>
          <div className="leading-tight"><div className="text-[11px] text-muted font-body tracking-wide">WORLD {s.worldIdx + 1}</div><div className="text-[13px] font-semibold -mt-0.5">{w.n} · Floor {s.floorIdx}</div></div>
        </div>
        <div className="flex-1 max-w-[560px] hidden md:block">
          <div className="flex items-center justify-between text-[10px] text-muted font-body mb-1"><span>{TOTAL_MIN}-MIN SESSION</span><span className="text-muted">{minutes} min in</span></div>
          <div className="h-2.5 rounded-full bg-line/60 border border-line overflow-hidden flex relative">
            {PHASES.map(([name, end], i) => { const start = i ? PHASES[i - 1][1] : 0; return <div key={name} className="h-full" style={{ width: `${((end - start) / TOTAL_MIN) * 100}%`, background: PHASE_COLOR[name], opacity: s.phase === name ? 1 : 0.45 }} />; })}
            <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-ink shadow-[0_0_0_3px_rgba(31,45,77,.15)] -translate-x-1/2 transition-[left] duration-1000" style={{ left: `${Math.min(100, (s.elapsedMs / 60000 / TOTAL_MIN) * 100)}%` }} />
          </div>
          <div className="flex justify-between text-[9.5px] font-body tracking-wide text-muted mt-1">{PHASES.filter(([n]) => n !== 'hq').map(([n]) => <span key={n} style={{ color: s.phase === n ? PHASE_COLOR[n] : undefined }}>{PHASE_LABEL[n]}</span>)}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="dt-pill rounded-full pl-2.5 pr-3.5 py-2 flex items-center gap-2"><span className="text-lg leading-none" style={{ color: acc, textShadow: `0 0 8px ${acc}` }}>◆</span><motion.span key={gems} initial={{ scale: 1.3 }} animate={{ scale: 1 }} className="font-body font-extrabold text-lg leading-none">{gems}</motion.span></div>
          <HudBtn label={s.muted ? 'Unmute' : 'Mute'} onClick={toggleMute}>{s.muted ? '🔇' : '🔊'}</HudBtn>
          <HudBtn label="Music" onClick={toggleMusic} dim={!s.musicOn}>🎵</HudBtn>
          <HudBtn label="Exit" onClick={exit}>✕</HudBtn>
        </div>
      </header>

      {/* main */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 relative p-4 lg:p-6">
          {s.room ? (
            <RoomGrid room={s.room} twist={s.twist} rank={rank} sel={s.sel} floats={s.floats} bursts={s.bursts} onTap={tapTile} />
          ) : (
            <div className="w-full h-full rounded-2xl flex items-center justify-center" style={{ background: 'radial-gradient(60% 60% at 50% 40%, color-mix(in srgb, var(--dt-acc2) 14%, transparent), transparent 70%)' }}>
              {s.mode === 'boot' && <div className="text-muted font-body">Setting up Game Day…</div>}
            </div>
          )}
          <div className="absolute bottom-2 left-8 text-[10px] font-body tracking-[0.25em] text-muted uppercase">{w.n} · {twist.label}</div>
        </div>

        <aside className="w-[280px] shrink-0 border-l border-line p-4 hidden lg:flex flex-col gap-3" style={{ background: 'rgba(255,255,255,.55)' }}>
          <div className="flex items-start gap-3">
            <HumphreyPortrait state={humphrey} className={clsx('w-16 h-16 rounded-2xl shrink-0 ring-2 ring-line', speaking && 'speaking')} />
            <div className="relative flex-1"><div className="absolute -left-2 top-3 w-3 h-3 rotate-45 bg-paper" /><div className="bg-paper text-ink rounded-2xl rounded-tl-sm px-3 py-2.5 text-[12.5px] leading-snug font-medium shadow-lg min-h-[48px]" aria-live="polite">{s.bubble || `Hi ${KID_NAME}!`}</div></div>
          </div>
          <div className="rounded-2xl p-3.5 relative overflow-hidden" style={{ background: 'linear-gradient(160deg,#fff0f5,#ffe3ec)', border: '1px solid rgba(214,51,108,.25)' }}>
            <div className="text-[10px] font-body tracking-widest text-tutor">{s.floorIdx === 2 ? 'FLOOR VILLAIN' : 'WORLD VILLAIN'}</div>
            <div className="font-semibold text-[15px] leading-tight">{w.vil}</div>
            <div className="text-[11px] text-muted">{s.floorIdx === 2 ? 'guards the stairs' : `rules ${w.n} · ${w.std}`}</div>
            {vaults && vaults.total > 0 && (
              <div className="mt-3"><div className="text-[10px] font-body tracking-wide text-muted mb-1.5">VAULTS OPENED · {vaults.open} OF {vaults.total}</div>
                <div className="flex gap-2">{Array.from({ length: vaults.total }).map((_, i) => <div key={i} className="flex-1 h-9 rounded-lg grid place-items-center text-sm" style={i < vaults.open ? { background: 'linear-gradient(180deg,#ffd75a,#e0a200)', color: '#3a2400' } : { background: 'linear-gradient(180deg,#2a2770,#1a1840)', border: '1px solid rgba(255,199,44,.3)', color: '#ffc72c' }}>{i < vaults.open ? '✓' : '🔒'}</div>)}</div></div>
            )}
          </div>
          <div className="rounded-2xl p-3 dt-pill">
            <div className="text-[10px] font-body tracking-widest text-muted mb-2">TODAY</div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat n={s.locksToday} l="locks" /><Stat n={s.firstTryToday} l="first try" /><Stat n={RANKS[rank].n} l="rank" />
            </div>
          </div>
          {s.room?.ralphie && <div className="rounded-2xl p-3 dt-pill flex items-center gap-3"><RalphiePortrait state="idle" className="w-12 h-12 rounded-xl" /><div className="text-[12px] leading-snug">Ralphie is with you. {s.room.hintTokens} hint left.</div></div>}
          <div className="mt-auto text-center text-[10px] font-body text-muted tracking-wide">{s.room ? 'TAP A TILE TO WALK' : PHASE_LABEL[s.phase].toUpperCase()}</div>
        </aside>
      </div>

      {/* ---------------- overlays ---------------- */}
      <AnimatePresence>
        {s.mode === 'hq' && p && (
          <Overlay key="hq">
            <div className="dt-glass rounded-[26px] p-6 w-[960px] max-w-[94%] grid grid-cols-1 md:grid-cols-[300px_1fr] gap-5">
              <div className="rounded-2xl p-4 flex flex-col items-center" style={{ background: 'linear-gradient(180deg,rgba(14,140,140,.08),rgba(255,255,255,.6))', border: '1px solid rgb(222,214,200)' }}>
                <HeroSVG rank={rankFor(p.first_try_total)} className="w-40 h-52" />
                <div className="font-semibold text-[22px]">{RANKS[rankFor(p.first_try_total)].n}</div>
                <div className="text-[11px] font-body tracking-widest text-muted">HERO RANK</div>
                <div className="grid grid-cols-3 gap-3 mt-4 w-full text-center"><Stat n={p.gems} l="gems" /><Stat n={p.locks_total} l="locks" /><Stat n={p.game_days} l="game days" /></div>
              </div>
              <div className="flex flex-col">
                <div className="text-[11px] font-body tracking-widest text-muted">HERO HQ</div>
                <h1 className="font-semibold text-[30px] leading-tight">Today · World {s.worldIdx + 1}, Floor {s.floorIdx}</h1>
                <p className="text-muted mt-1">{w.n}, {w.std}. Twist: {twist.label}.{s.floorIdx === 2 ? ` ${w.vil} guards the stairs.` : ''}</p>
                <div className="mt-4"><div className="text-[10px] font-body tracking-widest text-muted mb-2">TOWER MAP · 24 FLOORS</div>
                  <div className="grid grid-cols-12 gap-1.5">{Array.from({ length: 24 }).map((_, i) => { const done = i < (p.floors || []).length; const now = i === (p.floors || []).length; return <div key={i} className={clsx('h-7 rounded-md grid place-items-center text-[11px] font-body font-bold', done ? 'bg-[#5cf0b0] text-[#063]' : now ? 'bg-[#ffc72c] text-[#3a2400] ring-2 ring-[#ffc72c]/40' : 'bg-line/50 text-muted')}>{i + 1}</div>; })}</div></div>
                <div className="mt-4"><div className="text-[10px] font-body tracking-widest text-muted mb-2">CROWN · {(p.crown || []).length} OF 12</div>
                  <div className="flex gap-1.5">{Array.from({ length: 12 }).map((_, i) => <i key={i} className={clsx('block w-5 h-6 rounded-t-full', (p.crown || []).includes(i) ? 'bg-[#ffc72c] shadow-[0_0_10px_rgba(255,199,44,.7)]' : 'bg-line/60')} />)}</div></div>
                <div className="mt-5 bg-paper text-ink rounded-2xl px-4 py-3 text-[14px] font-medium leading-snug">{s.bubble}</div>
                <button onClick={leaveHQ} className="tap mt-4 dt-key-gold rounded-2xl font-bold text-[20px]">{s.resumePhase && s.resumePhase !== 'hq' ? 'Keep going' : 'Suit up'}</button>
              </div>
            </div>
          </Overlay>
        )}

        {s.intro && (
          <Overlay key="intro">
            <div className="dt-glass rounded-[26px] p-7 w-[640px] max-w-[94%] text-center">
              <div className="text-[11px] font-body tracking-widest text-muted">{PHASE_LABEL[s.phase].toUpperCase()}</div>
              <h2 className="font-semibold text-[32px] leading-tight mt-1">{s.intro.title}</h2>
              <p className="text-muted mt-2 text-[15px]">{s.intro.text}</p>
              <div className="mt-4 bg-paper text-ink rounded-2xl px-4 py-3 text-[14px] font-medium leading-snug">{s.intro.sayText}</div>
              <button onClick={s.intro.onGo} className="tap mt-5 dt-key-gold rounded-2xl font-bold text-[20px] px-10">{s.intro.btn}</button>
            </div>
          </Overlay>
        )}

        {(s.mode === 'prob' || s.mode === 'resolving') && s.q && (
          <Overlay key="prob" dim>
            <div className="dt-glass rounded-[26px] p-5 lg:p-6 w-[940px] max-w-[96%] max-h-[94vh] overflow-y-auto grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-2"><span className="rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide" style={{ background: 'linear-gradient(180deg,#ffd75a,#e0a200)', color: '#3a2400' }}>🔒 {s.probLabel.toUpperCase()}</span></div>
                <div className="text-center mt-1 font-body font-extrabold leading-tight tracking-tight whitespace-pre-line" style={{ fontSize: s.q.prompt.length > 22 ? 30 : 66, textShadow: '0 4px 20px rgba(31,45,77,.12)' }}>{s.q.prompt.replace(/\?$/, '')}<span style={{ color: acc }}>{s.typed || '?'}</span></div>
                <div className="mt-3 mx-auto max-w-[460px] flex items-start gap-2 rounded-xl px-3 py-2" style={{ background: 'rgb(14 140 140 / .08)', border: '1px solid rgb(14 140 140 / .3)' }}><span>💡</span><p className="text-[13px] text-ink leading-snug">{s.hintLevel > 0 ? s.q.hints[s.hintLevel - 1] : s.q.start}</p></div>
                <motion.div animate={s.answerState === 'shake' ? { x: [0, -8, 8, -5, 5, 0] } : { x: 0 }} transition={{ duration: 0.35 }} className={clsx('dt-answer rounded-2xl px-4 py-2.5 mt-3 flex items-center justify-between', s.answerState === 'ok' && 'ok')}>
                  <span className="text-[11px] font-body tracking-widest text-muted">YOUR ANSWER</span><span className="font-body font-extrabold text-[34px] leading-none tracking-wider min-w-[120px] text-right">{s.answerState === 'ok' ? `✓ ${s.q.answer}` : s.typed || '—'}</span>
                </motion.div>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <button onClick={() => toggleWork()} className="tap dt-chip rounded-xl text-[14px] font-semibold">{s.workOpen ? 'Hide my work' : 'Show my work'}</button>
                  <button onClick={readAgain} className="tap dt-chip rounded-xl text-[14px] font-semibold">🔊 Read it again</button>
                  <button onClick={askRalphie} disabled={!(s.room?.ralphie && s.room.hintTokens > 0 && s.probMode === 'lock')} className="tap dt-chip rounded-xl text-[14px] font-semibold disabled:opacity-35">Ask Ralphie <span className="ml-1 px-1.5 rounded-full bg-[#ffc72c] text-[#3a2400] text-[10px] font-body font-extrabold">{s.room?.hintTokens || 0}</span></button>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2.5">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} onClick={() => typeDigit(d)} className="dt-key rounded-2xl h-16 font-body font-extrabold text-2xl">{d}</button>)}
                  <button onClick={() => typeDigit('del')} className="dt-key rounded-2xl h-16 text-2xl text-amber">⌫</button>
                  <button onClick={() => typeDigit('0')} className="dt-key rounded-2xl h-16 font-body font-extrabold text-2xl">0</button>
                  <button onClick={check} className="dt-key-gold rounded-2xl h-16 font-bold text-lg">OPEN</button>
                </div>
              </div>
              <div className={clsx('flex-col', s.workOpen ? 'flex' : 'hidden lg:flex')}>
                <div className="flex items-center justify-between mb-3"><span className="text-[11px] font-body tracking-widest text-muted">WORK BOARD</span><span className="text-[10px] font-body text-teal">{s.workOpen ? `STEP ${Math.max(0, s.hintLevel)} OF 3` : 'TAP SHOW MY WORK'}</span></div>
                <div className="rounded-2xl p-3" style={{ background: 'rgb(var(--c-paper))', border: '1px solid rgb(var(--c-line))' }}>{s.workOpen ? <WorkBoard q={s.q} lvl={s.hintLevel} /> : <div className="text-muted text-[12px] text-center py-8">The board fills in as Ms. Humphrey helps.</div>}</div>
              </div>
            </div>
          </Overlay>
        )}

        {s.roomEnd && (
          <Overlay key="roomend">
            <div className="dt-glass rounded-[26px] p-7 w-[560px] max-w-[94%] text-center">
              <h2 className="font-semibold text-[30px]">{s.roomEnd.title}</h2>
              <div className="flex justify-center gap-2 mt-2 text-4xl">{[0, 1, 2].map((i) => <motion.span key={i} initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.2 + i * 0.15, type: 'spring' }} className={i < s.roomEnd!.stars ? 'text-[#ffc72c]' : 'text-line'}>★</motion.span>)}</div>
              <div className="grid grid-cols-3 gap-3 mt-4"><Stat n={s.gemsToday} l="gems today" /><Stat n={s.locksToday} l="locks" /><Stat n={s.roomEnd.first} l="first try" /></div>
              <div className="mt-4 bg-paper text-ink rounded-2xl px-4 py-3 text-[14px] font-medium">{s.roomEnd.say}</div>
              <button onClick={s.roomEnd.onGo} className="tap mt-5 dt-key-gold rounded-2xl font-bold text-[20px] px-10">{s.roomEnd.btn}</button>
            </div>
          </Overlay>
        )}

        {s.mode === 'break' && (
          <Overlay key="break">
            <div className="dt-glass rounded-[26px] p-7 w-[480px] max-w-[94%] text-center">
              <RalphiePortrait state="sleepy" className="w-32 h-32 mx-auto rounded-3xl ring-4 ring-line" />
              <h2 className="font-semibold text-[28px] mt-3">Stretch break</h2>
              <div className="font-body font-extrabold text-[52px] tabular-nums text-teal">{Math.floor(s.breakLeft / 60)}:{String(s.breakLeft % 60).padStart(2, '0')}</div>
              <p className="text-muted">Stand up, shake it out, drink some water.</p>
              <button onClick={skipBreak} className="tap mt-4 dt-chip rounded-xl px-10 text-[18px] font-semibold">I’m ready</button>
            </div>
          </Overlay>
        )}

        {s.mode === 'done' && s.doneSummary && (
          <Overlay key="done">
            <div className="dt-glass rounded-[26px] p-7 w-[640px] max-w-[94%] text-center">
              <div className="flex items-end justify-center gap-4"><HumphreyPortrait state="goodbye" className="w-28 h-28 rounded-3xl ring-4 ring-line" /><RalphiePortrait state="trophy" className="w-24 h-24 rounded-3xl ring-4 ring-[#ffc72c]/30" /></div>
              <h2 className="font-semibold text-[30px] mt-3">That’s Game Day!</h2>
              <div className="flex justify-center gap-2 mt-1 text-4xl">{[0, 1, 2].map((i) => <span key={i} className={i < s.doneSummary!.stars ? 'text-[#ffc72c]' : 'text-line'}>★</span>)}</div>
              <div className="grid grid-cols-4 gap-3 mt-4"><Stat n={s.gemsToday} l="gems" /><Stat n={s.locksToday} l="locks" /><Stat n={`${s.firstTryToday}/${s.locksToday}`} l="first try" /><Stat n={s.doneSummary.rank} l="rank" /></div>
              <div className="mt-4 bg-paper text-ink rounded-2xl px-4 py-3 text-[14px] font-medium">{s.doneSummary.say}</div>
              <a href="/" className="tap mt-5 inline-flex items-center dt-key-gold rounded-2xl font-bold text-[20px] px-10">Back to Hero Hall</a>
            </div>
          </Overlay>
        )}
      </AnimatePresence>
    </div>
  );
}

function Overlay({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={clsx('fixed inset-0 z-40 grid place-items-center p-4', dim ? 'bg-[rgba(31,45,77,.35)]' : 'bg-[rgba(31,45,77,.25)] backdrop-blur-sm')}>
      <motion.div initial={{ y: 16, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 8, scale: 0.98 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }} className="contents">{children}</motion.div>
    </motion.div>
  );
}
function HudBtn({ children, label, onClick, dim }: { children: React.ReactNode; label: string; onClick: () => void; dim?: boolean }) {
  return <button onClick={onClick} aria-label={label} className={clsx('dt-pill rounded-full w-16 h-16 grid place-items-center text-[22px]', dim && 'opacity-40')}>{children}</button>;
}
function Stat({ n, l }: { n: number | string; l: string }) {
  return <div className="rounded-xl py-2 px-1" style={{ background: 'rgba(31,45,77,.05)' }}><div className="font-body font-extrabold text-[20px] leading-none">{n}</div><div className="text-[10px] font-body tracking-wide text-muted mt-1 uppercase">{l}</div></div>;
}
function countVaults(room: { grid: unknown } & Parameters<typeof allVaultsOpen>[0]) {
  let total = 0, open = 0;
  for (let r = 0; r < room.grid.length; r++) for (let c = 0; c < room.grid[r].length; c++) if (tileAt(room, c, r) === 'V') { total++; if (room.opened.has(key(c, r))) open++; }
  return { total, open };
}
