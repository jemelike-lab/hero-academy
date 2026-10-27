// Ms. Humphrey's living portrait. Three looping clips (Higgsfield/Seedance,
// see docs/higgsfield-shot-list.md) stacked in one frame; the active state
// fades in over the others so there is never a blank frame. Falls back to
// the poster image until the clips are ready, and if video can't play.
import { useEffect, useRef } from 'react';
import clsx from 'clsx';

export type HumphreyState = 'idle' | 'speaking' | 'delighted' | 'thinking' | 'encouraging' | 'cheering' | 'board' | 'goodbye';
const STATES: HumphreyState[] = ['idle', 'speaking', 'delighted', 'thinking', 'encouraging', 'cheering', 'board', 'goodbye'];
// One-shot reactions restart from frame 0 when entered; the rest just loop.
const RESTART: HumphreyState[] = ['delighted', 'cheering', 'goodbye', 'thinking', 'encouraging', 'board'];
const CLIP: Record<HumphreyState, string> = {
  idle: '/assets/clips/humphrey_idle.mp4',
  speaking: '/assets/clips/humphrey_speaking.mp4',
  delighted: '/assets/clips/humphrey_delighted.mp4',
  thinking: '/assets/clips/humphrey_thinking.mp4',
  encouraging: '/assets/clips/humphrey_encouraging.mp4',
  cheering: '/assets/clips/humphrey_cheering.mp4',
  board: '/assets/clips/humphrey_board.mp4',
  goodbye: '/assets/clips/humphrey_goodbye.mp4',
};
export const HUMPHREY_POSTER = '/assets/clips/humphrey_poster.jpg';

export default function HumphreyPortrait({ state, className }: { state: HumphreyState; className?: string }) {
  const refs = useRef<Partial<Record<HumphreyState, HTMLVideoElement | null>>>({});

  useEffect(() => {
    for (const s of STATES) {
      const v = refs.current[s];
      if (!v) continue;
      if (s === state) {
        if (RESTART.includes(s)) v.currentTime = 0;
        v.play().catch(() => { /* autoplay blocked: poster stays visible */ });
      } else if (!v.paused) {
        // keep idle ticking underneath so the crossfade back is seamless
        if (s !== 'idle') v.pause();
      }
    }
  }, [state]);

  return (
    <div className={clsx('relative overflow-hidden bg-paper', className)} aria-label={`Ms. Humphrey, ${state}`} role="img">
      <img src={HUMPHREY_POSTER} alt="" className="absolute inset-0 w-full h-full object-cover" />
      {STATES.map((s) => (
        <video key={s} ref={(el) => { refs.current[s] = el; }} src={CLIP[s]} muted loop playsInline preload="auto" autoPlay={s === 'idle'}
          className={clsx('absolute inset-0 w-full h-full object-cover transition-opacity duration-300', s === state ? 'opacity-100' : 'opacity-0')} />
      ))}
    </div>
  );
}
