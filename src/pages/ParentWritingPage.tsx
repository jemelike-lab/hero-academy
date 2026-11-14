// v315 Parent review for Writing Time. For each day: what Ms. Humphrey said,
// word for word, beside what Nigel wrote. Dictation is not graded; parents
// compare. Spelling words get a Right / Not yet mark from the parent, which
// adds up to the week's score.
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { fetchWritingDay, fetchWritingDays, markWriting, type SpellingItem, type WritingAttempt, type WritingDaySet, type WritingDaySummary } from '@/lib/writing';
import { KID_NAME } from '@/lib/child';

const PARENTS: Record<string, string> = { josh: 'Josh', bianca: 'Bianca' };

function whoFromUrl(): string | null {
  const h = window.location.hash.replace(/^#/, '').toLowerCase().trim();
  if (PARENTS[h]) { try { localStorage.setItem('ha_parent', h); } catch { /* noop */ } return h; }
  try { const v = localStorage.getItem('ha_parent'); if (v && PARENTS[v]) return v; } catch { /* noop */ }
  return null;
}

function niceDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'short', day: 'numeric' }) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', opts);
}
function niceTime(ts: string) {
  return new Date(ts).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function ParentWritingPage() {
  const [who, setWho] = useState<string | null>(whoFromUrl);
  const [days, setDays] = useState<WritingDaySummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [sets, setSets] = useState<WritingDaySet[] | null>(null);
  const [error, setError] = useState('');

  const [daysTick, setDaysTick] = useState(0);
  useEffect(() => {
    if (!who) return;
    fetchWritingDays(60).then((d) => { setDays(d); setSelected((cur) => cur || d[0]?.set_date || null); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load.'));
  }, [who, daysTick]);

  useEffect(() => {
    if (!selected) return;
    setSets(null);
    fetchWritingDay(selected).then(setSets).catch((e) => setError(e instanceof Error ? e.message : 'Could not load.'));
  }, [selected]);

  if (!who) {
    return (
      <div className="min-h-full flex items-center justify-center p-6">
        <div className="bg-card rounded-xl3 shadow-card p-8 max-w-md w-full text-center">
          <h1 className="font-display font-semibold text-[26px]">Writing review</h1>
          <p className="text-muted font-semibold mt-1">Which parent are you?</p>
          <div className="grid grid-cols-2 gap-3 mt-6">
            {Object.entries(PARENTS).map(([k, name]) => (
              <button key={k} onClick={() => { window.location.hash = k; setWho(whoFromUrl()); }}
                className="tap rounded-2xl bg-teal/10 text-teal font-display font-semibold text-[22px] py-5">{k === 'josh' ? '👨' : '👩'} {name}</button>
            ))}
          </div>
          <p className="text-[12px] font-bold text-muted mt-5">This page shows {KID_NAME}’s handwriting from Class Time.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full px-4 py-5 lg:px-8 max-w-[1200px] mx-auto w-full">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display font-semibold text-[28px] leading-tight">✍️ Writing &amp; spelling</h1>
          <p className="text-muted font-semibold">What Ms. Humphrey said, next to what {KID_NAME} wrote. Hi, {PARENTS[who]}.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a href="/class-time?part=dictation" className="rounded-xl border-2 border-line bg-card px-3 py-2 text-[13px] font-bold">Start today’s dictation</a>
          <a href="/class-time?part=spelling" className="rounded-xl border-2 border-line bg-card px-3 py-2 text-[13px] font-bold">Start this week’s spelling test</a>
          <a href={`/parent.html#${who}`} className="rounded-xl border-2 border-line bg-card px-3 py-2 text-[13px] font-bold text-muted">← Parent dashboard</a>
        </div>
      </header>

      {error && <p className="mt-4 rounded-xl bg-amber/10 text-amber font-bold px-4 py-3">{error}</p>}

      {days && days.length === 0 && (
        <div className="mt-6 bg-card rounded-xl3 shadow-card p-6 text-center">
          <p className="font-display text-[20px]">Nothing written yet.</p>
          <p className="text-muted font-semibold mt-1">Dictation comes at the end of each Class Time. The spelling test runs on Fridays.</p>
        </div>
      )}

      {days && days.length > 0 && (
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5">
          <nav className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-1" aria-label="Days">
            {days.map((d) => {
              const dic = d.kinds.dictation, sp = d.kinds.spelling;
              return (
                <button key={d.set_date} onClick={() => setSelected(d.set_date)}
                  className={clsx('shrink-0 text-left rounded-2xl border-2 px-4 py-3 bg-card min-w-[180px]', selected === d.set_date ? 'border-teal ring-4 ring-teal/10' : 'border-line')}>
                  <div className="font-display font-semibold text-[16px]">{niceDate(d.set_date)}</div>
                  {dic && <div className="text-[12px] font-bold text-muted">Dictation: {dic.written} of {dic.items} written</div>}
                  {sp && <div className="text-[12px] font-bold text-muted">Spelling: {sp.written} of {sp.items}{sp.right + sp.wrong > 0 ? ` · ${sp.right} right` : ' · not marked'}</div>}
                </button>
              );
            })}
          </nav>

          <div className="min-w-0 space-y-6">
            {!sets && <p className="text-muted font-semibold">Loading…</p>}
            {sets?.map((s) => s.kind === 'dictation'
              ? <DictationCard key={s.id} set={s} />
              : <SpellingCard key={s.id} set={s} who={who} onChanged={(a) => { setSets((cur) => cur?.map((x) => x.id === s.id ? { ...x, attempts: x.attempts.map((y) => y.id === a.id ? a : y) } : x) || null); setDaysTick((t) => t + 1); }} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function groupAttempts(attempts: WritingAttempt[]) {
  const m = new Map<number, WritingAttempt[]>();
  for (const a of attempts) { if (!m.has(a.item_index)) m.set(a.item_index, []); m.get(a.item_index)!.push(a); }
  return m;
}

function Writing({ a, label }: { a: WritingAttempt; label?: string }) {
  return (
    <figure className="min-w-0">
      <img src={a.drawing_png} alt={`${KID_NAME}’s handwriting`} className="w-full rounded-xl border border-line bg-white" />
      <figcaption className="text-[11px] font-bold text-muted mt-1">
        {label ? `${label} · ` : ''}{niceTime(a.submitted_at)}{a.replays ? ` · asked to hear it ${a.replays === 1 ? 'once more' : `${a.replays} more times`}` : ''}
      </figcaption>
    </figure>
  );
}

function DictationCard({ set }: { set: WritingDaySet }) {
  const byIdx = groupAttempts(set.attempts);
  return (
    <section className="bg-card rounded-xl3 shadow-card p-5 lg:p-6">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="font-display font-semibold text-[22px]">Dictation</h2>
        <span className="text-[12px] font-bold text-muted">{byIdx.size} of {set.items.length} written · not graded by the app</span>
      </header>
      <ol className="mt-4 space-y-5">
        {set.items.map((it) => {
          const tries = byIdx.get(it.index) || [];
          const text = 'text' in it ? it.text : '';
          return (
            <li key={it.index} className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-line pt-4 first:border-0 first:pt-0">
              <div>
                <div className="text-[12px] font-extrabold text-teal">Sentence {it.index + 1} · Ms. Humphrey said</div>
                <p className="font-display font-medium text-[26px] leading-snug mt-1">{text}</p>
              </div>
              <div className="space-y-3">
                <div className="text-[12px] font-extrabold text-tutor">{KID_NAME} wrote</div>
                {tries.length === 0 && <p className="text-muted font-semibold">Not written yet.</p>}
                {tries.map((a, i) => <Writing key={a.id} a={a} label={tries.length > 1 ? `Try ${i + 1}` : undefined} />)}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function SpellingCard({ set, who, onChanged }: { set: WritingDaySet; who: string; onChanged: (a: WritingAttempt) => void }) {
  const byIdx = groupAttempts(set.attempts);
  const latest = useMemo(() => [...byIdx.values()].map((t) => t[t.length - 1]), [byIdx]);
  const right = latest.filter((a) => a.parent_mark === 'right').length;
  const marked = latest.filter((a) => a.parent_mark).length;
  const [busy, setBusy] = useState<string | null>(null);

  async function mark(a: WritingAttempt, m: 'right' | 'wrong') {
    const next = a.parent_mark === m ? null : m;
    setBusy(a.id);
    try { await markWriting(a.id, { mark: next, by: who }); onChanged({ ...a, parent_mark: next, marked_by: who }); } catch { /* leave as is */ }
    setBusy(null);
  }

  return (
    <section className="bg-card rounded-xl3 shadow-card p-5 lg:p-6">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="font-display font-semibold text-[22px]">Friday spelling test · week of {niceDate(set.week_start, { month: 'short', day: 'numeric' })}</h2>
        <span className="text-[14px] font-extrabold">{marked ? `${right} of ${latest.length} right` : `${latest.length} of ${set.items.length} written · tap Right or Not yet`}</span>
      </header>
      {set.week_words?.length > 0 && (
        <p className="text-[12px] font-bold text-muted mt-1">Words from this week’s lessons: {set.week_words.slice(0, 24).join(', ')}</p>
      )}
      <ol className="mt-4 space-y-5">
        {(set.items as SpellingItem[]).map((it) => {
          const tries = byIdx.get(it.index) || [];
          const a = tries[tries.length - 1];
          return (
            <li key={it.index} className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr] gap-4 border-t border-line pt-4 first:border-0 first:pt-0">
              <div>
                <div className="text-[12px] font-extrabold text-teal">Word {it.index + 1}{it.from_lessons === false ? ' · extra 2nd-grade word' : ''}</div>
                <p className="font-display font-semibold text-[34px] leading-none mt-1">{it.word}</p>
                <p className="text-muted font-semibold mt-2">“{it.sentence}”</p>
              </div>
              <div className="space-y-2">
                {!a && <p className="text-muted font-semibold">Not written yet.</p>}
                {tries.map((t, i) => <Writing key={t.id} a={t} label={tries.length > 1 ? `Try ${i + 1}` : undefined} />)}
                {a && (
                  <div className="flex gap-2">
                    <button disabled={busy === a.id} onClick={() => mark(a, 'right')}
                      className={clsx('flex-1 min-h-[48px] rounded-xl border-2 font-bold', a.parent_mark === 'right' ? 'border-grass bg-grass text-white' : 'border-line bg-card')}>✓ Right</button>
                    <button disabled={busy === a.id} onClick={() => mark(a, 'wrong')}
                      className={clsx('flex-1 min-h-[48px] rounded-xl border-2 font-bold', a.parent_mark === 'wrong' ? 'border-amber bg-amber text-white' : 'border-line bg-card')}>✗ Not yet</button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
