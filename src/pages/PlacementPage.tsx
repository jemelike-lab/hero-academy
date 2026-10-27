// "Find my level" (v306). Eight questions from four topics spread across the
// subject's trail, easy to hard. One try each, no hints, no teach-through:
// this is a measurement, not a lesson. Every answer is recorded with
// ha_record_topic_attempt so the daily plan picks it up tomorrow.
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { fetchPlacement, recordEvent, type Question } from '@/lib/api';
import { KID_NAME } from '@/lib/child';
import { recordTopicAttempt } from '@/lib/telemetry';
import { onSpeaking, say, stop, pause } from '@/lib/tts';
import HumphreyPortrait, { type HumphreyState } from '@/components/HumphreyPortrait';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const LABEL: Record<string, string> = { math: 'Math', reading: 'Reading', spelling: 'Spelling', science: 'Science', grammar: 'Grammar', writing: 'Writing' };

type Phase = 'loading' | 'intro' | 'question' | 'done' | 'empty' | 'error';

export default function PlacementPage() {
  const { subject = 'math' } = useParams();
  const label = LABEL[subject] || subject;
  const [phase, setPhase] = useState<Phase>('loading');
  const [topics, setTopics] = useState<{ id: string; title: string }[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [locked, setLocked] = useState(true);
  const [bubble, setBubble] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const abort = useRef(false);
  useEffect(() => onSpeaking(setSpeaking), []);

  useEffect(() => {
    abort.current = false;
    (async () => {
      try {
        const r = await fetchPlacement(subject);
        if (abort.current) return;
        if (r.questions.length < 4) { setPhase('empty'); return; }
        setTopics(r.topics); setQuestions(r.questions); setPhase('intro');
        recordEvent('placement_start', { subject, n: r.questions.length });
        setBubble(`Let's find your level in ${label}, ${KID_NAME}. Eight questions, easy ones first, then harder. Just do your best, there are no hints this time.`);
        await say(`Let's find your level in ${label}, ${KID_NAME}. Eight questions, easy ones first, then harder. Just do your best, there are no hints this time.`);
        if (!abort.current) present(0, r.questions);
      } catch { if (!abort.current) setPhase('error'); }
    })();
    return () => { abort.current = true; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject]);

  async function present(i: number, qs: Question[]) {
    setPhase('question'); setIdx(i); setPicked(null); setLocked(true);
    const q = qs[i];
    const text = `${q.question} ${q.options.map((o, k) => `${LETTERS[k]}. ${o}.`).join(' ')}`;
    setBubble(text);
    await say(text);
    if (abort.current) return;
    setLocked(false); setBubble('Pick one.');
  }

  async function answer(choice: number) {
    if (locked || picked !== null) return;
    const q = questions[idx];
    const ok = choice === q.correct_index;
    setPicked(choice); setLocked(true);
    const next = [...results, ok]; setResults(next);
    recordTopicAttempt(q.topic, ok, subject, 'placement');
    recordEvent('placement_answer', { subject, q_idx: idx, topic: q.topic, correct: ok });
    const line = ok ? ['Yes.', 'That’s it.', 'Good.'][idx % 3] : 'Okay, let’s keep going.';
    setBubble(line); await say(line); await pause(500);
    if (abort.current) return;
    if (idx + 1 < questions.length) present(idx + 1, questions);
    else finish(next);
  }

  async function finish(all: boolean[]) {
    setPhase('done');
    const level = levelFrom(all);
    recordEvent('placement_complete', { subject, correct: all.filter(Boolean).length, total: all.length, level: level.id });
    try { localStorage.setItem(`ha_placement_${subject}`, JSON.stringify({ at: new Date().toISOString(), correct: all.filter(Boolean).length, total: all.length, level: level.id })); } catch { /* ignore */ }
    const line = `All done, ${KID_NAME}. ${level.say} Tomorrow's ${label} class will start right there.`;
    setBubble(line); await say(line);
  }

  function levelFrom(all: boolean[]) {
    // two questions per topic, easy → hard: find the hardest topic with at least one right
    const perTopic = topics.map((_, t) => all.slice(t * 2, t * 2 + 2));
    let top = -1;
    perTopic.forEach((pair, t) => { if (pair.some(Boolean)) top = t; });
    const firstShaky = perTopic.findIndex((pair) => pair.length && !pair.every(Boolean));
    const start = firstShaky >= 0 ? firstShaky : Math.max(0, top);
    const t = topics[start] || topics[0];
    const correct = all.filter(Boolean).length;
    const say = correct === all.length ? `You got every single one, so we'll stretch you at ${t?.title}.`
      : correct >= all.length / 2 ? `You've got a solid start, and we'll build from ${t?.title}.`
      : `We'll take it steady and start from ${t?.title}.`;
    return { id: t?.id || '', title: t?.title || '', say };
  }

  const humphrey: HumphreyState = phase === 'done' ? 'cheering' : speaking ? 'speaking' : picked !== null ? (results[results.length - 1] ? 'delighted' : 'encouraging') : 'idle';
  const q = questions[idx];

  return (
    <div className="min-h-full max-w-[1000px] mx-auto px-5 py-5 flex flex-col">
      <header className="flex items-center justify-between">
        <div>
          <Link to={`/path/${subject}`} className="text-[13px] font-bold text-muted">← My path</Link>
          <h1 className="font-display font-semibold text-[26px] leading-none mt-1">Level check · {label}</h1>
        </div>
        <HumphreyPortrait state={humphrey} className={clsx('w-20 h-20 rounded-2xl ring-2 ring-tutor/20', speaking && 'speaking')} />
      </header>

      <div className="mt-3 bg-tutor/10 rounded-2xl px-4 py-3 text-[15px] font-semibold min-h-[56px]" aria-live="polite">{bubble || '…'}</div>

      {phase === 'loading' && <p className="mt-6 text-muted font-semibold">Ms. Humphrey is choosing your questions…</p>}
      {phase === 'empty' && <p className="mt-6 text-muted font-semibold">There’s nothing left to place in {label} right now. <Link to="/" className="text-teal">Back to Hero Hall</Link></p>}
      {phase === 'error' && <p className="mt-6 text-amber font-semibold">Couldn’t load the level check. Please try again in a moment.</p>}

      {phase === 'question' && q && (
        <section className="mt-4 bg-card rounded-xl3 shadow-card p-5 lg:p-7 flex-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-extrabold text-teal">{topics[Math.floor(idx / 2)]?.title || q.topic}</span>
            <span className="text-[12px] font-bold text-muted">{idx + 1} of {questions.length}</span>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.h2 key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="font-display font-medium text-[26px] md:text-[30px] leading-[1.15]">{q.question}</motion.h2>
          </AnimatePresence>
          <div className="grid gap-3 mt-4 grid-cols-1 sm:grid-cols-2">
            {q.options.map((opt, i) => {
              const state = picked === null ? 'idle' : i === q.correct_index ? 'correct' : i === picked ? 'wrong' : 'dim';
              return (
                <motion.button key={`${idx}-${i}`} onClick={() => answer(i)} disabled={locked || picked !== null} whileTap={locked ? undefined : { scale: 0.97 }}
                  data-state={state === 'idle' ? undefined : state}
                  className={clsx('tile tap rounded-xl2 px-4 py-3 flex items-center gap-3 text-left border-[3px] border-line bg-card', locked && picked === null && 'opacity-60')}>
                  <span className={clsx('w-10 h-10 shrink-0 rounded-xl flex items-center justify-center font-display font-semibold text-[20px]', state === 'correct' ? 'bg-white/25 text-white' : state === 'wrong' ? 'bg-amber text-white' : 'bg-paper text-muted')}>{state === 'correct' ? '✓' : LETTERS[i]}</span>
                  <span className="font-display font-medium text-[22px] leading-tight">{opt}</span>
                </motion.button>
              );
            })}
          </div>
          <div className="mt-5 flex gap-1.5">
            {questions.map((_, i) => <span key={i} className={clsx('h-2 flex-1 rounded-full', i < results.length ? (results[i] ? 'bg-grass' : 'bg-amber') : i === idx ? 'bg-teal' : 'bg-line')} />)}
          </div>
        </section>
      )}

      {phase === 'done' && (
        <section className="mt-4 bg-card rounded-xl3 shadow-card p-6 text-center">
          <div className="font-display font-semibold text-[28px]">{results.filter(Boolean).length} of {results.length}</div>
          <div className="mt-3 flex justify-center gap-1.5">
            {results.map((r, i) => <span key={i} className={clsx('w-6 h-2 rounded-full', r ? 'bg-grass' : 'bg-amber')} />)}
          </div>
          <p className="mt-4 font-semibold text-muted">Starting point: <span className="text-ink">{levelFrom(results).title}</span></p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to={`/path/${subject}`} className="tap inline-flex items-center rounded-xl2 bg-teal text-white px-6 font-extrabold">See my path</Link>
            <Link to="/" className="tap inline-flex items-center rounded-xl2 bg-sun px-6 font-display font-semibold text-[18px] shadow-tile">Hero Hall</Link>
          </div>
        </section>
      )}
    </div>
  );
}
