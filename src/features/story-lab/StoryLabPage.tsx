// Story Lab. Layout from 21st take 2 ("Option C", project 1905b1f3…): a tab
// row under the header, Ms. Humphrey beside the activity, the work in one big
// card. Fits 1194×834 (iPad) and 1280×712 (Galaxy Tab in Chrome) with no page
// scrolling; only the saved-stories list scrolls inside its card.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { useStoryLab, type Screen } from './useStoryLab';
import { LINES, kindLabel, wordsFor, type Part, type SavedStory } from './engine';
import { DrawPad, type DrawPadHandle } from './DrawPad';
import { onSpeaking } from '@/lib/tts';
import HumphreyPortrait, { useHumphrey } from '@/components/HumphreyPortrait';
import RalphiePortrait from '@/components/RalphiePortrait';
import { KID_NAME } from '@/lib/child';

const press = 'active:translate-y-[2px] active:shadow-none';
const sunBtn = clsx('tap rounded-[20px] bg-sun font-display font-semibold text-ink shadow-[0_4px_0_0_rgb(220,160,30)] disabled:opacity-50', press);
const plainBtn = clsx('tap rounded-[20px] border-2 border-line bg-card font-display font-semibold shadow-tile disabled:opacity-50', press);

const TABS: { id: Screen; label: string; icon: string }[] = [
  { id: 'start', label: 'Start', icon: '🏠' }, { id: 'slots', label: 'Pick Word', icon: '✏️' }, { id: 'story', label: 'Your Story', icon: '📖' },
  { id: 'library', label: 'My Stories', icon: '📚' }, { id: 'reading', label: 'Reading', icon: '🔊' }, { id: 'questions', label: 'Questions', icon: '❓' }, { id: 'done', label: 'Done', icon: '✅' },
];

export default function StoryLabPage() {
  const L = useStoryLab();
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => onSpeaking(setSpeaking), []);
  const humphrey = useHumphrey(L.mood);
  // Which tabs can be tapped: Start and My Stories always; a finished story can be reopened.
  const can = (id: Screen) => id === 'start' || id === 'library' || (id === 'story' && L.parts.length > 0 && L.screen !== 'slots');
  const go = (id: Screen) => (id === 'start' ? L.goStart() : id === 'library' ? L.openLibrary() : id === 'story' ? L.showStory() : undefined);

  return (
    <div className="h-full flex flex-col gap-3 px-5 pt-3 pb-4 max-w-[1280px] mx-auto w-full select-none">
      <header className="shrink-0 flex items-center gap-4">
        <Link to="/" className={clsx('h-16 min-w-[124px] px-5 flex items-center justify-center gap-2 text-[18px]', plainBtn)}><span className="text-[22px] leading-none">←</span> Home</Link>
        <div className="leading-tight">
          <h1 className="font-display text-[28px] font-semibold">📖 Story Lab</h1>
          <p className="text-[13px] font-bold text-muted">Write and read with Ms. Humphrey</p>
        </div>
        <span className="ml-auto h-11 rounded-full border-2 border-line bg-card px-4 flex items-center gap-2 text-[15px] font-extrabold">📚 {L.saved.length} saved</span>
      </header>

      <nav className="shrink-0 flex gap-1.5 overflow-x-auto" aria-label="Story Lab screens">
        {TABS.map((t) => {
          const on = L.screen === t.id; const tappable = can(t.id) && !on;
          return (
            <button key={t.id} onClick={() => go(t.id)} disabled={!tappable} aria-current={on ? 'page' : undefined}
              className={clsx('h-16 shrink-0 rounded-2xl px-4 flex items-center gap-2 font-display text-[16px] font-semibold transition-colors',
                on ? 'bg-ink text-white shadow-tile' : tappable ? 'tap border-2 border-line bg-card' : 'text-muted/70')}>
              <span>{t.icon}</span>{t.label}
            </button>
          );
        })}
      </nav>

      <main className="flex-1 min-h-0">
        <AnimatePresence mode="wait">
          <motion.div key={L.screen} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="h-full">
            {L.screen === 'start' && <Start L={L} />}
            {L.screen === 'slots' && <WithTeacher humphrey={humphrey} speaking={speaking} bubble={L.slot === 0 ? 'Pick the best word for our story!' : 'Ooh, great choice! What comes next?'}><Slots L={L} /></WithTeacher>}
            {L.screen === 'story' && <StoryScreen L={L} humphrey={humphrey} speaking={speaking} />}
            {L.screen === 'library' && <Library L={L} />}
            {(L.screen === 'reading' || L.screen === 'questions' || L.screen === 'done') && <Adventure L={L} humphrey={humphrey} speaking={speaking} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

type LabState = ReturnType<typeof useStoryLab>;
type HState = ReturnType<typeof useHumphrey>;
const Card = ({ className, children }: { className?: string; children: ReactNode }) => (
  <section className={clsx('rounded-[24px] border-2 border-line bg-card shadow-card', className)}>{children}</section>
);
function Pill({ speaking, label }: { speaking: boolean; label?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold', speaking ? 'bg-tutor/10 text-tutor' : 'bg-teal/10 text-teal')}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', speaking ? 'bg-tutor animate-pulse' : 'bg-teal')} />{label ?? (speaking ? 'speaking' : 'listening')}
    </span>
  );
}

// Ms. Humphrey's column beside the writing screens.
function WithTeacher({ humphrey, speaking, bubble, side, children }: { humphrey: HState; speaking: boolean; bubble: string; side?: ReactNode; children: ReactNode }) {
  return (
    <div className="h-full flex gap-3">
      <aside className="w-[164px] shrink-0 flex flex-col items-center gap-2 pt-1">
        <HumphreyPortrait state={humphrey} className="w-[132px] h-[132px] rounded-[22px] ring-4 ring-tutor/20" />
        <div className="text-center leading-tight"><div className="font-display text-[16px] font-semibold">Ms. Humphrey</div><div className="mt-1"><Pill speaking={speaking} /></div></div>
        <p className="w-full rounded-2xl border-2 border-tutor/15 bg-tutor/5 px-3 py-2 text-center text-[13px] font-bold leading-snug text-tutor">“{bubble}”</p>
        {side ?? <RalphiePortrait state="idle" className="mt-auto w-[96px] h-[96px] rounded-[20px] ring-4 ring-white shadow-tile" />}
      </aside>
      <Card className="flex-1 min-w-0 px-6 py-4 flex flex-col">{children}</Card>
    </div>
  );
}

// ---------- start ----------
function Start({ L }: { L: LabState }) {
  const a = L.adventure;
  return (
    <div className="h-full flex gap-3">
      {a && (
        <Card className="w-[340px] shrink-0 p-5 flex flex-col gap-3">
          <span className="self-start rounded-full bg-sun/25 px-3 py-1 text-[12px] font-extrabold">✨ Today’s Adventure</span>
          <h2 className="font-display text-[26px] font-semibold leading-tight">{a.title}</h2>
          <div className="shrink-0 rounded-2xl bg-paper px-4 py-3"><p className="text-[16px] font-semibold leading-relaxed line-clamp-4">{a.paragraphs[0]}</p></div>
          <div className="flex items-center gap-2 text-[13px] font-bold text-muted">
            <HumphreyPortrait state="idle" className="h-10 w-10 rounded-xl" />Ms. Humphrey will read it with you
          </div>
          <motion.button onClick={L.startAdventure} whileTap={{ scale: 0.97 }} className={clsx('mt-auto h-16 text-[19px]', sunBtn)}>Read with Ms. Humphrey →</motion.button>
        </Card>
      )}
      <Card className="flex-1 min-w-0 p-5 flex flex-col gap-3">
        <div>
          <h2 className="font-display text-[24px] font-semibold">Pick a story to write! ✏️</h2>
          <p className="text-[14px] font-bold text-muted">Tap one. I will help you fill in the blanks.</p>
        </div>
        <div className={clsx('flex-1 min-h-0 grid gap-2.5 auto-rows-fr', a ? 'grid-cols-4' : 'grid-cols-5')}>
          {(L.templates ?? []).slice(0, a ? 8 : 10).map((t, i) => (
            <motion.button key={(t.id ?? t.title) + i} onClick={() => L.pickTemplate(t)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} whileTap={{ scale: 0.97 }}
              className={clsx('min-h-[64px] px-2 py-2 flex flex-col items-center justify-center gap-1 text-center', plainBtn)}>
              <span className="text-[30px] leading-none">{t.emoji}</span>
              <span className="text-[14px] font-semibold leading-tight line-clamp-2">{t.title}</span>
              <span className="text-[11px] font-bold text-muted">{t.slots.length} words to pick</span>
            </motion.button>
          ))}
          {!L.templates && Array.from({ length: 8 }).map((_, i) => <div key={i} className="rounded-[20px] bg-paper animate-pulse" />)}
        </div>
        {L.saved.length > 0 && <button onClick={L.openLibrary} className={clsx('shrink-0 h-16 text-[17px]', plainBtn)}>📚 My saved stories ({L.saved.length})</button>}
      </Card>
    </div>
  );
}

// ---------- pick a word ----------
function Slots({ L }: { L: LabState }) {
  const t = L.tpl!; const s = t.slots[L.slot];
  return (
    <>
      <div className="flex items-center gap-3">
        <button onClick={L.slotBack} className={clsx('h-16 px-4 text-[16px]', plainBtn)}>‹ Back</button>
        <h2 className="flex-1 truncate text-center font-display text-[20px] font-semibold">{t.emoji} {t.title}</h2>
        <span className="w-[86px]" />
      </div>
      <div className="mt-1 flex items-center justify-center gap-2 text-[13px] font-extrabold text-muted">
        Word {L.slot + 1} of {t.slots.length}
        {t.slots.map((_, i) => <span key={i} className={clsx('h-3 rounded-full transition-all', i < L.slot ? 'w-3 bg-teal' : i === L.slot ? 'w-6 bg-teal' : 'w-3 bg-line')} />)}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={L.slot} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex-1 min-h-0 flex flex-col">
          <div className="my-3 text-center">
            <div className="text-[15px] font-bold text-teal">Pick {kindLabel(s.kind)}:</div>
            <div className="font-display text-[32px] font-semibold leading-tight">{s.prompt}</div>
          </div>
          <div className="flex-1 min-h-0 grid grid-cols-4 gap-2.5 auto-rows-fr">
            {wordsFor(s.kind).map((w) => {
              const on = L.picked === w;
              return (
                <motion.button key={w} onClick={() => L.pickWord(w)} disabled={!!L.picked} animate={on ? { scale: [1, 1.06, 1] } : {}} whileTap={{ scale: 0.96 }}
                  className={clsx('tap min-h-[64px] rounded-[20px] border-2 px-2 font-display text-[19px] font-semibold shadow-tile', press,
                    on ? 'border-teal bg-teal text-white' : L.picked ? 'border-line bg-card opacity-50' : 'border-line bg-card')}>
                  {on ? `✓ ${w}` : w}
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}

// ---------- the finished story ----------
function StoryText({ parts, className }: { parts: Part[]; className?: string }) {
  return (
    <p className={className}>
      {parts.map((p, i) => 'word' in p
        ? <mark key={i} className="rounded-lg bg-teal/15 px-1.5 font-extrabold text-teal">{p.word}</mark>
        : <span key={i}>{p.text}</span>)}
    </p>
  );
}
// The buttons sit in Ms. Humphrey's column so the drawing pad gets the height.
function StoryScreen({ L, humphrey, speaking }: { L: LabState; humphrey: HState; speaking: boolean }) {
  const pad = useRef<DrawPadHandle>(null);
  const side = (
    <div className="mt-auto w-full flex flex-col gap-2">
      <motion.button onClick={L.readStory} disabled={L.readingStory === 'reading'} whileTap={{ scale: 0.97 }} className={clsx('h-16 text-[16px]', sunBtn)}>
        🔊 {L.readingStory === 'reading' ? 'Reading…' : L.readingStory === 'again' ? 'Read again!' : 'Read to me!'}
      </motion.button>
      <button onClick={() => L.save(pad.current?.toPNG() ?? null)} disabled={L.savedNow !== 'no'}
        className={clsx('tap h-16 rounded-[20px] font-display text-[16px] font-semibold leading-tight shadow-tile', press, L.savedNow !== 'no' ? 'bg-grass text-white' : 'bg-teal text-white')}>
        {L.savedNow === 'no' ? '💾 Save' : L.savedNow === 'yes' ? '✓ Saved!' : '✓ Saved (no picture)'}
      </button>
      <button onClick={L.goStart} className={clsx('h-16 text-[16px]', plainBtn)}>✨ Write another</button>
    </div>
  );
  return <WithTeacher humphrey={humphrey} speaking={speaking} bubble="You wrote a wonderful story! Draw a picture for it." side={side}><Story L={L} pad={pad} /></WithTeacher>;
}
function Story({ L, pad }: { L: LabState; pad: RefObject<DrawPadHandle> }) {
  const t = L.tpl!;
  const confetti = useRef(Array.from({ length: 34 }, (_, i) => ({ left: 10 + Math.random() * 80, delay: Math.random() * 0.4, dur: 1.5 + Math.random() * 1.2, color: ['#FFC53D', '#D6336C', '#2EB872', '#0E8C8C', '#a855f7'][i % 5], rot: Math.random() * 360, drift: (Math.random() - 0.5) * 160 }))).current;
  return (
    <div className="relative h-full flex flex-col gap-3">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {confetti.map((c, i) => (
          <motion.span key={i} className="absolute top-1/3 h-3 w-2.5 rounded-sm" style={{ left: `${c.left}%`, background: c.color }}
            initial={{ y: 0, x: 0, rotate: c.rot, opacity: 1 }} animate={{ y: 420, x: c.drift, rotate: c.rot + 540, opacity: 0 }} transition={{ delay: c.delay, duration: c.dur, ease: [0.2, 0.7, 0.3, 1] }} />
        ))}
      </div>
      <div>
        <div className="text-[12px] font-extrabold tracking-[0.12em] text-tutor">YOUR STORY</div>
        <h2 className="font-display text-[24px] font-semibold leading-tight">{t.emoji} {t.title}</h2>
      </div>
      <div className="shrink-0 max-h-[38%] overflow-y-auto rounded-2xl border-2 border-line bg-paper px-5 py-3">
        <StoryText parts={L.parts} className="text-[19px] font-semibold leading-[1.7]" />
      </div>
      <DrawPad ref={pad} className="flex-1 min-h-0" />
    </div>
  );
}

// ---------- my stories ----------
function Library({ L }: { L: LabState }) {
  const list = [...L.saved].reverse();
  return (
    <Card className="h-full p-5 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <button onClick={L.goStart} className={clsx('h-16 px-4 text-[16px]', plainBtn)}>‹ Back</button>
        <h2 className="font-display text-[24px] font-semibold">📚 My Stories</h2>
        {list.length > 0 && <span className="ml-auto text-[14px] font-bold text-muted">{list.length} {list.length === 1 ? 'story' : 'stories'}</span>}
      </div>
      {list.length === 0 ? (
        <div className="flex-1 grid place-items-center text-center">
          <div>
            <RalphiePortrait state="reading" className="mx-auto mb-3 w-[120px] h-[120px] rounded-[22px] ring-4 ring-paper" />
            <p className="font-display text-[20px] font-medium text-muted">No saved stories yet. Pick a template and write one!</p>
            <button onClick={L.goStart} className={clsx('mt-4 h-16 px-8 text-[18px]', sunBtn)}>✏️ Write a story</button>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-3">
          {list.map((s) => <SavedRow key={s.id} s={s} speaking={L.librarySpeaking === s.id} onRead={() => L.readSavedStory(s)} />)}
        </div>
      )}
    </Card>
  );
}
function SavedRow({ s, speaking, onRead }: { s: SavedStory; speaking: boolean; onRead: () => void }) {
  let date = ''; try { date = new Date(s.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { /* ignore */ }
  return (
    <article className="shrink-0 rounded-[20px] border-2 border-line bg-paper p-3 flex gap-4">
      <div className="w-[150px] shrink-0 rounded-2xl border-2 border-line bg-white grid place-items-center overflow-hidden aspect-[4/3]">
        {s.drawing ? <img src={s.drawing} alt={`Nigel's picture for ${s.title}`} className="h-full w-full object-contain" /> : <span className="text-[40px]">{s.emoji}</span>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <h3 className="truncate font-display text-[19px] font-semibold">{s.emoji} {s.title}</h3>
          <span className="shrink-0 text-[13px] font-bold text-muted">{date}</span>
        </div>
        <p className="mt-1 text-[15px] font-semibold leading-relaxed">{s.text}</p>
      </div>
      <button onClick={onRead} disabled={speaking} className={clsx('self-center h-16 shrink-0 rounded-[20px] bg-teal px-5 font-display text-[16px] font-semibold text-white shadow-tile disabled:opacity-60', press)}>
        🔊 {speaking ? 'Reading…' : 'Read again'}
      </button>
    </article>
  );
}

// ---------- Today's Adventure: reading, questions, done ----------
function Adventure({ L, humphrey, speaking }: { L: LabState; humphrey: HState; speaking: boolean }) {
  const a = L.adventure!; const q = a.questions[L.qi];
  return (
    <Card className="h-full px-6 py-4 flex flex-col gap-3">
      <div className="shrink-0 flex items-center gap-3">
        <HumphreyPortrait state={humphrey} className="w-[72px] h-[72px] rounded-2xl ring-4 ring-tutor/20" />
        <div className="leading-tight">
          <div className="font-display text-[17px] font-semibold">Ms. Humphrey</div>
          <div className="mt-1"><Pill speaking={speaking} label={L.screen === 'reading' && speaking ? 'reading to you' : undefined} /></div>
        </div>
        <RalphiePortrait state={L.screen === 'done' ? 'cheer' : 'reading'} className="ml-auto w-[72px] h-[72px] rounded-2xl ring-4 ring-paper" />
        <button onClick={L.goStart} aria-label="Close" className={clsx('h-16 w-16 text-[26px] text-muted', plainBtn)}>×</button>
      </div>

      {L.screen === 'reading' && (
        <>
          <h2 className="shrink-0 text-center font-display text-[26px] font-semibold">{a.title}</h2>
          <div className="flex-1 min-h-0 rounded-[20px] border-2 border-line bg-paper px-10 py-6 overflow-y-auto grid place-items-center">
            <AnimatePresence mode="wait">
              <motion.p key={Math.max(0, L.page)} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
                className="max-w-[60ch] font-display text-[26px] font-medium leading-[1.55]">{a.paragraphs[Math.max(0, L.page)]}</motion.p>
            </AnimatePresence>
          </div>
          <div className="shrink-0 flex items-center gap-3">
            <button onClick={() => L.setPage(Math.max(0, L.page - 1))} disabled={L.page <= 0} className={clsx('h-16 px-5 text-[17px]', plainBtn)}>‹ Page {Math.max(1, L.page)}</button>
            <div className="mx-auto flex items-center gap-2 text-[14px] font-extrabold text-muted">
              {a.paragraphs.map((_, i) => <span key={i} className={clsx('h-3 rounded-full transition-all', i === Math.max(0, L.page) ? 'w-6 bg-teal' : 'w-3 bg-line')} />)}
              <span className="ml-1">Page {Math.max(0, L.page) + 1} of {a.paragraphs.length}</span>
            </div>
            <button onClick={() => L.setPage(Math.min(a.paragraphs.length - 1, Math.max(0, L.page) + 1))} disabled={L.page >= a.paragraphs.length - 1}
              className={clsx('h-16 px-5 text-[17px]', sunBtn)}>Page {Math.min(a.paragraphs.length, Math.max(0, L.page) + 2)} ›</button>
          </div>
          {L.readDone && !a.questions.length && <p className="shrink-0 text-center text-[15px] font-bold text-muted">That’s the end of today’s story.</p>}
        </>
      )}

      {L.screen === 'questions' && q && (
        <>
          <div className="shrink-0">
            <p className="text-[15px] font-extrabold text-tutor">Great listening, {KID_NAME}. Now tap the right answer for each.</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded-full bg-teal/10 px-3 py-0.5 text-[13px] font-extrabold text-teal">Question {L.qi + 1} of {a.questions.length}</span>
              {a.questions.map((_, i) => <span key={i} className={clsx('h-2.5 w-2.5 rounded-full', i < L.qi ? 'bg-teal' : i === L.qi ? 'bg-teal ring-4 ring-teal/20' : 'bg-line')} />)}
              <button onClick={L.repeat} className={clsx('ml-auto h-16 px-4 text-[15px] text-teal', plainBtn)}>🔊 Hear it again</button>
            </div>
            <h2 className="mt-1 font-display text-[26px] font-semibold leading-tight">{q.q}</h2>
          </div>
          <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 auto-rows-fr">
            {q.choices.map((c, i) => {
              const picked = L.choice === i; const right = i === q.answer; const shown = L.choice !== null;
              return (
                <motion.button key={L.qi + '-' + i} onClick={() => L.answer(i)} disabled={shown} whileTap={shown ? undefined : { scale: 0.98 }}
                  animate={picked && !right ? { x: [0, -8, 8, -5, 0] } : {}}
                  className={clsx('tap min-h-[64px] rounded-[20px] border-2 px-4 flex items-center gap-3 text-left font-display text-[19px] font-semibold shadow-tile', press,
                    shown && right ? 'border-grass bg-grass text-white' : shown && picked ? 'border-amber bg-amber/10' : L.reading === i ? 'border-sun bg-sun/15 ring-4 ring-sun/30' : shown ? 'border-line bg-card opacity-60' : 'border-line bg-card')}>
                  <span className={clsx('h-10 w-10 shrink-0 rounded-xl grid place-items-center text-[16px]', shown && right ? 'bg-white text-grass' : shown && picked ? 'bg-amber text-white' : 'bg-paper text-teal')}>
                    {shown && right ? '✓' : shown && picked ? '✕' : String.fromCharCode(65 + i)}
                  </span>
                  <span className="leading-snug">{c}</span>
                </motion.button>
              );
            })}
          </div>
          <div className="shrink-0 flex items-center gap-3 min-h-16">
            <AnimatePresence>
              {L.choice !== null && (
                <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={clsx('flex-1 text-[17px] font-extrabold', L.choice === q.answer ? 'text-[rgb(25,130,75)]' : 'text-[rgb(180,105,5)]')}>
                  {L.choice === q.answer ? `🌟 ${LINES.rightFeedback}` : LINES.wrongFeedback(q.choices[q.answer])}
                </motion.p>
              )}
            </AnimatePresence>
            {L.choice !== null && (
              <motion.button onClick={L.nextQuestion} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className={clsx('ml-auto h-16 px-7 text-[19px]', sunBtn)}>
                {L.qi + 1 >= a.questions.length ? 'See how I did →' : 'Next question →'}
              </motion.button>
            )}
          </div>
        </>
      )}

      {L.screen === 'done' && (
        <div className="flex-1 min-h-0 grid place-items-center text-center">
          <div>
            <div className="font-display text-[44px] font-semibold">All done 🎉</div>
            <p className="mt-1 font-display text-[22px] font-semibold text-[rgb(25,130,75)]">{LINES.done(L.got, a.questions.length)}</p>
            <p className="mt-1 text-[16px] font-bold text-muted">Great listening, {KID_NAME}.</p>
            <div className="mt-6 flex justify-center gap-4">
              <button onClick={L.goStart} className={clsx('h-16 px-8 text-[19px]', sunBtn)}>✏️ Write a story</button>
              <Link to="/" className={clsx('h-16 px-8 flex items-center gap-2 text-[19px]', plainBtn)}>← Home</Link>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
