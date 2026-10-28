// v300 home shell. Class Time is native; every other zone still opens its
// legacy page (served from /public) until it is ported. Nothing is removed.
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { KID_NAME, isGameDay, todayISO } from '@/lib/child';
import RalphiePortrait, { type RalphieState } from '@/components/RalphiePortrait';

const ZONES = [
  { id: 'game-day', name: 'Digit Tower', subject: 'Game Day · Math', emoji: '🗼', href: '/game-day' },
  { id: 'number-lab', name: 'Number Lab', subject: 'Math', emoji: '🧮', href: '/cauldron-cafe.html' },
  { id: 'letter-lab', name: 'Letter Lab', subject: 'Phonics', emoji: '🔤', href: '/letter-lab.html' },
  { id: 'word-tower', name: 'Word Tower', subject: 'Reading', emoji: '🗼', href: '/word-tower' },
  { id: 'story-time', name: 'Story Time', subject: 'Reading', emoji: '📖', href: '/story-time.html' },
  { id: 'writing', name: 'Story Lab', subject: 'Writing', emoji: '✍️', href: '/story-lab.html' },
  { id: 'discovery', name: 'Discovery Dome', subject: 'Science', emoji: '🔬', href: '/discovery-dome.html' },
  { id: 'explorer', name: "Explorer's Hall", subject: 'Social studies', emoji: '🗺️', href: '/explorers-hall.html' },
  { id: 'sound-stage', name: 'Sound Stage', subject: 'Music', emoji: '🎵', href: '/sound-stage.html' },
  { id: 'creation', name: 'Creation Studio', subject: 'Art', emoji: '🎨', href: '/creation-studio.html' },
  { id: 'gym', name: 'Training Gym', subject: 'Movement', emoji: '🤸', href: '/training-gym.html' },
  { id: 'review', name: 'Daily Practice', subject: 'Review', emoji: '🧠', href: '/review.html' },
  { id: 'hero-hall', name: 'Hero Hall', subject: 'Trophies', emoji: '🏆', href: '/hero-hall.html' },
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const gameDay = isGameDay();
  const [classDone, setClassDone] = useState(false);
  const [ralphie, setRalphie] = useState<RalphieState>('wave');
  useEffect(() => { const t = setTimeout(() => setRalphie('idle'), 5200); return () => clearTimeout(t); }, []);
  useEffect(() => {
    try { const raw = localStorage.getItem(`ha_class_time_${todayISO()}`); setClassDone(!!(raw && JSON.parse(raw).completedAt)); } catch { /* ignore */ }
  }, []);

  return (
    <div className="min-h-full max-w-[1100px] mx-auto px-5 py-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-muted font-bold">{greeting()},</p>
          <h1 className="font-display font-semibold text-[40px] leading-none">{KID_NAME}</h1>
        </div>
        <RalphiePortrait state={ralphie} className="w-28 h-28 rounded-3xl ring-2 ring-teal/15" />
      </header>

      <Link to={gameDay ? '/game-day' : '/class-time'}
        className={clsx('mt-6 flex items-center gap-5 rounded-xl3 p-6 shadow-card text-ink', classDone ? 'bg-grass/20' : 'bg-sun')}>
        <span className="text-[56px] leading-none">{gameDay ? '🗼' : '🎒'}</span>
        <span className="flex-1">
          <span className="block text-[13px] font-extrabold text-ink/70">{gameDay ? 'Game Day with Ms. Humphrey' : 'Class Time with Ms. Humphrey'}</span>
          <span className="block font-display font-semibold text-[30px] leading-tight">{classDone ? 'All done today' : gameDay ? 'Climb Digit Tower' : 'Start school'}</span>
          <span className="block text-[14px] font-semibold text-ink/70">{classDone ? `Great work today, ${KID_NAME}.` : gameDay ? 'Math tower, about 75 minutes' : '4 classes, about 75 minutes, one break'}</span>
        </span>
      </Link>

      <div className="mt-2 flex justify-end">
        <Link to={gameDay ? '/class-time' : '/game-day'} className="text-[13px] font-bold text-teal underline-offset-2 hover:underline">
          {gameDay ? 'Or do Class Time instead' : 'Or climb Digit Tower instead'}
        </Link>
      </div>

      <Link to="/path/math" className="mt-3 flex items-center gap-4 rounded-xl2 bg-card shadow-card px-5 py-4">
        <span className="text-[32px] leading-none">🗺️</span>
        <span className="flex-1">
          <span className="block font-display font-semibold text-[18px]">My path</span>
          <span className="block text-[13px] font-bold text-muted">See what you’ve mastered and what’s next, or find your level</span>
        </span>
        <span className="text-muted font-bold">›</span>
      </Link>

      <h2 className="font-display font-semibold text-[22px] mt-8 mb-3">Training zones</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {ZONES.map((z) => (
          <Link key={z.id} to={z.href} reloadDocument={z.href.endsWith('.html')} className="tap bg-card rounded-xl2 shadow-card p-4 flex flex-col gap-1 active:scale-[0.98] transition-transform">
            <span className="text-[32px] leading-none">{z.emoji}</span>
            <span className="font-display font-semibold text-[17px] mt-1">{z.name}</span>
            <span className="text-[12px] font-bold text-muted">{z.subject}</span>
          </Link>
        ))}
      </div>

      <footer className="mt-10 flex justify-center">
        <a href="/parent.html" className="text-[13px] font-bold text-muted">For parents</a>
      </footer>
    </div>
  );
}
