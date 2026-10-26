// Ms. Humphrey's living portrait. Three looping clips (Higgsfield/Seedance,
// see docs/higgsfield-shot-list.md) stacked in one frame; the active state
// fades in over the others so there is never a blank frame. Falls back to
// the poster image until the clips are ready, and if video can't play.
import { useEffect, useRef } from 'react';
import clsx from 'clsx';

export type HumphreyState = 'idle' | 'speaking' | 'delighted';
const STATES: HumphreyState[] = ['idle', 'speaking', 'delighted'];
const SRC = (s: HumphreyState) => `/assets/clips/humphrey_${s}.mp4`;
export const HUMPHREY_POSTER = '/assets/clips/humphrey_poster.jpg';

export default function HumphreyPortrait({ state, className }: { state: HumphreyState; className?: string }) {
  const refs = useRef<Record<HumphreyState, HTMLVideoElement | null>>({ idle: null, speaking: null, delighted: null });

  useEffect(() => {
    for (const s of STATES) {
      const v = refs.current[s];
      if (!v) continue;
      if (s === state) {
        if (s === 'delighted') v.currentTime = 0; // play the reaction from the top
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
        <video key={s} ref={(el) => { refs.current[s] = el; }} src={SRC(s)} muted loop playsInline preload="auto" autoPlay={s === 'idle'}
          className={clsx('absolute inset-0 w-full h-full object-cover transition-opacity duration-300', s === state ? 'opacity-100' : 'opacity-0')} />
      ))}
    </div>
  );
}
