// v315 Writing Time — the last part of Class Time.
// Dictation (every class day): Ms. Humphrey says a sentence twice, Nigel
// writes it on lined paper, and the exact sentence is saved next to his
// handwriting for the parents. Friday adds the spelling test: word, sentence,
// word, and he writes the word. The app never shows the sentence or word on
// screen and never grades; parents compare on /parent/writing.
import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import HandwritingPad, { type HandwritingPadHandle } from '@/components/HandwritingPad';
import HumphreyPortrait, { useHumphrey, type HumphreyState } from '@/components/HumphreyPortrait';
import RalphiePortrait from '@/components/RalphiePortrait';
import { KID_NAME } from '@/lib/child';
import { recordEvent as record } from '@/lib/api';
import { onSpeaking, pause, say, stop } from '@/lib/tts';
import { fetchWritingSet, isWritingTest, saveWritingAttempt, type DictationItem, type SpellingItem, type WritingKind, type WritingSet } from '@/lib/writing';

// Test runs (?test_child=) leave Nigel's activity log alone.
const recordEvent: typeof record = (t, p) => { if (!isWritingTest) record(t, p); };

const NUM = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const CHEERS = ['Nice work.', 'Thank you. Good effort.', 'Well done.', 'Great job sticking with it.', 'Lovely. Let’s keep going.'];

type Stage = 'loading' | 'intro' | 'listening' | 'writing' | 'saving' | 'save-error' | 'between' | 'error';

function scriptFor(kind: WritingKind, item: DictationItem | SpellingItem, n: number): string[] {
  if (kind === 'dictation') {
    const t = (item as DictationItem).text;
    return [`Sentence ${NUM[n] || n + 1}.`, t, 'One more time.', t];
  }
  const s = item as SpellingItem;
  return [`Word ${NUM[n] || n + 1}.`, `${s.word}.`, s.sentence, `${s.word}.`];
}
function replayFor(kind: WritingKind, item: DictationItem | SpellingItem): string[] {
  if (kind === 'dictation') return [(item as DictationItem).text];
  const s = item as SpellingItem;
  return [`${s.word}.`, s.sentence, `${s.word}.`];
}

export default function WritingTime({ parts, date, onDone, onExit }: { parts: WritingKind[]; date: string; onDone: () => void; onExit: () => void }) {
  const [partIdx, setPartIdx] = useState(0);
  const [set, setSet] = useState<WritingSet | null>(null);
  const [idx, setIdx] = useState(0);
  const [stage, setStage] = useState<Stage>('loading');
  const [bubble, setBubble] = useState('');
  const [hasInk, setHasInk] = useState(false);
  const [error, setError] = useState('');
  const [reaction, setReaction] = useState<HumphreyState | null>(null);
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => onSpeaking(setSpeaking), []);
  const portrait = useHumphrey(reaction);
  const pad = useRef<HandwritingPadHandle>(null);
  const alive = useRef(true);
  const replays = useRef(0);
  const startedAt = useRef(new Date().toISOString());
  const spoken = useRef('');
  const kind = parts[partIdx];

  const talk = useCallback(async (lines: string[], gap = 700) => {
    for (const l of lines) {
      if (!alive.current) return;
      await say(l);
      await pause(gap);
    }
  }, []);

  const present = useCallback(async (s: WritingSet, i: number) => {
    const item = s.items[i];
    pad.current?.clear(); setHasInk(false);
    replays.current = 0; startedAt.current = new Date().toISOString();
    const script = scriptFor(s.kind, item, i);
    spoken.current = script.join(' ');
    setReaction(null);
    setStage('listening');
    setBubble(s.kind === 'dictation' ? 'Listen carefully…' : 'Listen to the word…');
    await talk(script, 900);
    if (!alive.current) return;
    setStage('writing');
    setBubble(s.kind === 'dictation' ? 'Write the sentence on the lines. Tap “I’m done” when you finish.' : 'Write the word on the line. Tap “I’m done” when you finish.');
  }, [talk]);

  // Load each part; resume where he left off if he came back.
  useEffect(() => {
    alive.current = true;
    if (!kind) { onDone(); return; }
    let cancelled = false;
    (async () => {
      setStage('loading'); setBubble('Getting your paper ready…');
      try {
        const { set: s, done } = await fetchWritingSet(kind, date);
        if (cancelled) return;
        const doneSet = new Set(done);
        const first = s.items.findIndex((it) => !doneSet.has(it.index));
        if (first < 0) { setPartIdx((p) => p + 1); return; }
        setSet(s); setIdx(first);
        setStage('intro');
        recordEvent('writing_time_start', { kind, resume_at: first, items: s.items.length });
        const intro = kind === 'dictation'
          ? (first === 0
            ? [`Now it’s writing time, ${KID_NAME}! I’ll say a sentence two times. Listen carefully, then write it on the lines.`, 'Start with a capital letter, and put a period, a question mark, or an exclamation mark at the end.']
            : [`Let’s finish our writing, ${KID_NAME}.`])
          : (first === 0
            ? [`It’s Friday, ${KID_NAME}, so it’s spelling test time!`, 'I’ll say a word, use it in a sentence, and say the word again. Write the word on the line.']
            : ['Let’s finish your spelling test.']);
        setBubble(intro[0]);
        await talk(intro, 500);
        if (cancelled || !alive.current) return;
        await present(s, first);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not load writing time.');
        setStage('error');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, date]);

  useEffect(() => () => { alive.current = false; stop(); }, []);

  const hearAgain = useCallback(async () => {
    if (!set || stage !== 'writing') return;
    replays.current += 1;
    recordEvent('writing_time_replay', { kind: set.kind, item: idx });
    setStage('listening');
    await talk(replayFor(set.kind, set.items[idx]), 600);
    if (alive.current) setStage('writing');
  }, [set, stage, idx, talk]);

  const submit = useCallback(async () => {
    if (!set || !pad.current?.hasInk()) return;
    stop();
    setStage('saving');
    const png = pad.current.toPNG();
    const body = { set_id: set.id, item_index: set.items[idx].index, drawing_png: png, spoken_text: spoken.current, replays: replays.current, started_at: startedAt.current };
    try {
      try { await saveWritingAttempt(body); } catch { await pause(800); await saveWritingAttempt(body); }
    } catch {
      setStage('save-error');
      setBubble('Hmm, I couldn’t save that one. Tap “Try again”.');
      return;
    }
    recordEvent('writing_time_item', { kind: set.kind, item: idx, replays: replays.current });
    const next = idx + 1;
    setReaction('encouraging');
    if (next >= set.items.length) {
      setStage('between');
      const line = set.kind === 'dictation' ? `Great writing today, ${KID_NAME}! Your mom and dad will look at your sentences.` : `You finished your spelling test, ${KID_NAME}! Great job.`;
      setBubble(line); setReaction('cheering');
      recordEvent('writing_time_done', { kind: set.kind });
      await say(line);
      await pause(600);
      if (!alive.current) return;
      setSet(null); setPartIdx((p) => p + 1);
      return;
    }
    const cheer = CHEERS[idx % CHEERS.length];
    setStage('between');
    setBubble(cheer);
    await say(cheer);
    if (!alive.current) return;
    setIdx(next);
    await present(set, next);
  }, [set, idx, present]);

  const total = set?.items.length || 0;
  const label = kind === 'spelling' ? 'Spelling test' : 'Dictation';
  const writing = stage === 'writing';

  if (stage === 'error') {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-6 text-center">
        <RalphiePortrait state="idle" className="w-28 h-28 rounded-3xl" />
        <h1 className="font-display font-semibold text-[26px]">Writing time couldn’t load.</h1>
        <p className="text-muted font-semibold">{error}</p>
        <button onClick={onDone} className="tap rounded-xl2 bg-sun px-8 font-display font-semibold text-[20px] shadow-tile">Finish class</button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col px-4 py-3 lg:px-7 lg:py-4 max-w-[1320px] mx-auto w-full">
      <header className="flex items-center justify-between gap-4">
        <div className="leading-tight">
          <div className="font-display font-semibold text-[17px]">Writing Time · {label}</div>
          <div className="text-[12px] font-bold text-muted">{total ? `${kind === 'spelling' ? 'Word' : 'Sentence'} ${Math.min(idx + 1, total)} of ${total}` : 'Getting ready'}{parts.length > 1 ? ` · Part ${partIdx + 1} of ${parts.length}` : ''}</div>
        </div>
        <button onClick={onExit} aria-label="Leave class" title="Leave class"
          className="w-16 h-16 rounded-2xl border-2 border-amber/40 text-amber text-[24px] flex items-center justify-center bg-card">✕</button>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 mt-3 min-h-0">
        <section className="bg-card rounded-xl3 shadow-card p-5 lg:p-7 flex flex-col gap-4 min-h-0 overflow-y-auto">
          <div className="flex items-center gap-2 flex-wrap">
            {Array.from({ length: total }).map((_, i) => (
              <span key={i} className={clsx('w-9 h-9 rounded-full grid place-items-center text-[13px] font-extrabold',
                i < idx ? 'bg-grass text-white' : i === idx ? 'bg-teal text-white ring-4 ring-teal/15' : 'bg-line/50 text-muted')}>{i < idx ? '✓' : i + 1}</span>
            ))}
          </div>
          <div className="font-display font-medium text-[24px] md:text-[28px] leading-tight">
            {stage === 'listening' || stage === 'intro' || stage === 'loading' ? '👂 Listen…' : stage === 'saving' ? 'Saving…' : stage === 'between' ? '⭐ Saved!' : kind === 'spelling' ? '✏️ Write the word.' : '✏️ Write the sentence.'}
          </div>
          <HandwritingPad ref={pad} rows={kind === 'spelling' ? 1 : 2} onInk={setHasInk} disabled={!writing && stage !== 'listening'} />
          <div className="grid grid-cols-3 gap-3">
            <button onClick={hearAgain} disabled={!writing} className="tap min-h-[64px] rounded-2xl border-2 border-line bg-card font-bold text-[16px] disabled:opacity-50">🔊 Hear it again</button>
            <button onClick={() => pad.current?.undo()} disabled={!hasInk || stage === 'saving'} className="tap min-h-[64px] rounded-2xl border-2 border-line bg-card font-bold text-[16px] disabled:opacity-50">↶ Undo</button>
            <button onClick={() => pad.current?.clear()} disabled={!hasInk || stage === 'saving'} className="tap min-h-[64px] rounded-2xl border-2 border-line bg-card font-bold text-[16px] disabled:opacity-50">🧽 Erase all</button>
          </div>
          {stage === 'save-error' ? (
            <button onClick={submit} className="tap min-h-[72px] w-full rounded-xl2 bg-amber text-white font-display font-semibold text-[22px] shadow-tile">Try again</button>
          ) : (
            <motion.button onClick={submit} disabled={!writing || !hasInk} whileTap={writing && hasInk ? { scale: 0.97 } : undefined}
              className="tap min-h-[72px] w-full rounded-xl2 bg-sun text-ink font-display font-semibold text-[22px] shadow-tile disabled:opacity-40 active:translate-y-[2px] active:shadow-none">I’m done ✓</motion.button>
          )}
        </section>

        <aside className="bg-card rounded-xl3 shadow-card p-5 flex flex-col min-h-0">
          <div className="flex items-center gap-3">
            <HumphreyPortrait state={portrait} className={clsx('w-24 h-24 rounded-2xl ring-2 ring-tutor/20 shrink-0', speaking && 'speaking')} />
            <div className="leading-tight">
              <div className="font-display font-semibold text-[17px]">Ms. Humphrey</div>
              <div className="text-[11px] font-bold text-muted">{speaking ? 'speaking' : 'listening'}</div>
            </div>
          </div>
          <div className="relative mt-4 bg-tutor/10 rounded-2xl px-4 py-3 text-[15px] font-semibold leading-snug min-h-[64px]" aria-live="polite">
            {bubble || `Hi ${KID_NAME}!`}
            <span className="absolute left-6 -bottom-2 w-4 h-4 bg-tutor/10 rotate-45 rounded-[3px]" />
          </div>
          <p className="mt-5 text-[13px] font-bold text-muted leading-snug">
            {kind === 'spelling' ? 'Take your time. Sound the word out in your head.' : 'Capital letter at the start. Spaces between words. A mark at the end.'}
          </p>
        </aside>
      </main>
    </div>
  );
}
