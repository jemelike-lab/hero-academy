// "My path" (v306). One trail per subject, built from ha_topics × ha_topic_mastery.
// Stops: mastered (stamped), strong (≥ 0.75 pass rate), shaky (tried, under 0.75),
// new (never tried). The first non-mastered stop is "next up". Topics without
// a sequence order are shown below as extra practice.
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { fetchPath, type PathTopic } from '@/lib/api';
import RalphiePortrait from '@/components/RalphiePortrait';

const SUBJECTS = [
  { id: 'math', label: 'Math', emoji: '🔢' },
  { id: 'reading', label: 'Reading', emoji: '📖' },
  { id: 'spelling', label: 'Spelling', emoji: '🔤' },
  { id: 'science', label: 'Science', emoji: '🔬' },
  { id: 'grammar', label: 'Grammar', emoji: '✏️' },
  { id: 'writing', label: 'Writing', emoji: '📝' },
];

type Stop = 'mastered' | 'strong' | 'shaky' | 'new';
function stopState(t: PathTopic): Stop {
  if (t.mastered) return 'mastered';
  if (t.attempted === 0) return 'new';
  return (t.pass_rate ?? 0) >= 0.75 ? 'strong' : 'shaky';
}

export default function PathPage() {
  const { subject: subjParam } = useParams();
  const subject = SUBJECTS.find((s) => s.id === subjParam)?.id || 'math';
  const [topics, setTopics] = useState<PathTopic[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setTopics(null); setError('');
    fetchPath(subject).then(setTopics).catch((e) => setError(e instanceof Error ? e.message : 'Could not load'));
  }, [subject]);

  const trail = useMemo(() => (topics || []).filter((t) => t.sequence_order != null), [topics]);
  const extras = useMemo(() => (topics || []).filter((t) => t.sequence_order == null && t.attempted > 0), [topics]);
  const nextIdx = trail.findIndex((t) => !t.mastered);
  const mastered = (topics || []).filter((t) => t.mastered).length;
  const strong = (topics || []).filter((t) => stopState(t) === 'strong').length;
  const hasPlacement = trail.length >= 4;

  return (
    <div className="min-h-full max-w-[900px] mx-auto px-5 py-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <Link to="/" className="text-[13px] font-bold text-muted">← Hero Hall</Link>
          <h1 className="font-display font-semibold text-[34px] leading-none mt-1">My path</h1>
        </div>
        <RalphiePortrait state="thinking" className="w-20 h-20 rounded-2xl ring-2 ring-teal/15" />
      </header>

      <nav className="mt-5 flex gap-2 overflow-x-auto pb-1" aria-label="Subjects">
        {SUBJECTS.map((s) => (
          <Link key={s.id} to={`/path/${s.id}`}
            className={clsx('tap shrink-0 px-4 rounded-2xl font-bold text-[14px] flex items-center gap-2 border-2', s.id === subject ? 'bg-teal text-white border-teal' : 'bg-card border-line')}>
            <span>{s.emoji}</span>{s.label}
          </Link>
        ))}
      </nav>

      <section className="mt-5 bg-card rounded-xl3 shadow-card p-5">
        {topics === null && !error && <p className="text-muted font-semibold">Loading your path…</p>}
        {error && <p className="text-amber font-semibold">Couldn’t load this path right now. {error}</p>}
        {topics && (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <Badge color="grass">{mastered} mastered</Badge>
              <Badge color="teal">{strong} strong</Badge>
              <Badge color="muted">{trail.length} stops on the trail</Badge>
              {hasPlacement && (
                <Link to={`/level-check/${subject}`} className="ml-auto tap inline-flex items-center rounded-xl2 bg-sun px-5 font-display font-semibold text-[16px] shadow-tile">Find my level</Link>
              )}
            </div>

            {trail.length === 0 ? (
              <p className="text-muted font-semibold">This subject doesn’t have an ordered trail yet. The topics you’ve practised are listed below.</p>
            ) : (
              <ol className="relative pl-8">
                <div className="absolute left-[15px] top-2 bottom-2 w-[3px] bg-line rounded" />
                {trail.map((t, i) => {
                  const st = stopState(t);
                  const isNext = i === nextIdx;
                  return (
                    <motion.li key={t.topic_id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }}
                      className={clsx('relative py-2 pr-2', isNext && 'bg-sun/10 rounded-xl -ml-8 pl-8')}>
                      <span className={clsx('absolute left-[-26px] top-3 w-7 h-7 rounded-full border-[3px] border-paper flex items-center justify-center text-[12px] font-extrabold',
                        st === 'mastered' && 'bg-grass text-white', st === 'strong' && 'bg-teal text-white', st === 'shaky' && 'bg-amber text-white', st === 'new' && 'bg-line text-muted',
                        isNext && 'ring-4 ring-sun/40')}>
                        {st === 'mastered' ? '✓' : st === 'strong' ? '•' : st === 'shaky' ? '!' : ''}
                      </span>
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-display font-medium text-[17px]">{t.title}</span>
                        {isNext && <span className="text-[11px] font-extrabold text-amber uppercase tracking-wide">Next up</span>}
                        {t.difficulty != null && <span className="text-[11px] font-bold text-muted">level {t.difficulty}</span>}
                      </div>
                      {t.description && <p className="text-[13px] text-muted font-semibold leading-snug">{t.description}</p>}
                      {t.attempted > 0 && <p className="text-[12px] font-bold text-muted mt-0.5">{t.passed} of {t.attempted} first-try</p>}
                    </motion.li>
                  );
                })}
              </ol>
            )}

            {extras.length > 0 && (
              <div className="mt-6">
                <h2 className="font-display font-semibold text-[18px] mb-2">Extra practice</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {extras.map((t) => {
                    const st = stopState(t);
                    return (
                      <div key={t.topic_id} className="flex items-center gap-3 rounded-xl border-2 border-line px-3 py-2">
                        <span className={clsx('w-3 h-3 rounded-full shrink-0', st === 'mastered' && 'bg-grass', st === 'strong' && 'bg-teal', st === 'shaky' && 'bg-amber')} />
                        <span className="font-semibold text-[14px] flex-1 truncate">{t.title}</span>
                        <span className="text-[12px] font-bold text-muted">{t.passed}/{t.attempted}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Badge({ color, children }: { color: 'grass' | 'teal' | 'muted'; children: React.ReactNode }) {
  return <span className={clsx('text-[12px] font-extrabold px-3 py-1.5 rounded-full', color === 'grass' && 'bg-grass/15 text-grass', color === 'teal' && 'bg-teal/10 text-teal', color === 'muted' && 'bg-line/50 text-muted')}>{children}</span>;
}
