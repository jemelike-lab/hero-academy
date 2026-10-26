// v300 home shell. Class Time is native; every other zone still opens its
// legacy page (served from /public) until it is ported. Nothing is removed.
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { KID_NAME, isGameDay, todayISO } from '@/lib/child';

const ZONES = [
  { id: 'number-lab', name: 'Number Lab', subject: 'Math', emoji: '🧮', href: '/cauldron-cafe.html' },
  { id: 'letter-lab', name: 'Letter Lab', subject: 'Phonics', emoji: '🔤', href: '/letter-lab.html' },
  { id: 'word-tower', name: 'Word Tower', subject: 'Reading', emoji: '🗼', href: '/word-tower.html' },
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
        <img src="/assets/ralphie/ralphie_waving.webp" alt="Ralphie waving" className="w-24 h-24 object-contain" />
      </header>

      <a href={gameDay ? '/game-day.html' : '/class-time'}
        className={clsx('mt-6 flex items-center gap-5 rounded-xl3 p-6 shadow-card text-ink', classDone ? 'bg-grass/20' : 'bg-sun')}>
        <span className="text-[56px] leading-none">{gameDay ? '🗼' : '🎒'}</span>
        <span className="flex-1">
          <span className="block text-[13px] font-extrabold text-ink/70">{gameDay ? 'Game Day with Ms. Humphrey' : 'Class Time with Ms. Humphrey'}</span>
          <span className="block font-display font-semibold text-[30px] leading-tight">{classDone ? 'All done today' : gameDay ? 'Climb Digit Tower' : 'Start school'}</span>
          <span className="block text-[14px] font-semibold text-ink/70">{classDone ? `Great work today, ${KID_NAME}.` : gameDay ? 'Math tower, about 75 minutes' : '4 classes, about 75 minutes, one break'}</span>
        </span>
      </a>

      <h2 className="font-display font-semibold text-[22px] mt-8 mb-3">Training zones</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {ZONES.map((z) => (
          <a key={z.id} href={z.href} className="tap bg-card rounded-xl2 shadow-card p-4 flex flex-col gap-1 active:scale-[0.98] transition-transform">
            <span className="text-[32px] leading-none">{z.emoji}</span>
            <span className="font-display font-semibold text-[17px] mt-1">{z.name}</span>
            <span className="text-[12px] font-bold text-muted">{z.subject}</span>
          </a>
        ))}
      </div>

      <footer className="mt-10 flex justify-center">
        <a href="/parent.html" className="text-[13px] font-bold text-muted">For parents</a>
      </footer>
    </div>
  );
}
