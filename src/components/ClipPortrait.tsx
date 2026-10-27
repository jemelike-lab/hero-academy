// A character made of short looping clips (Higgsfield/Seedance, see
// docs/higgsfield-shot-list.md). All clips for the character are stacked in
// one frame and the active state fades in, so there is never a blank frame.
// The poster shows until clips are ready, and if video can't play.
import { useEffect, useRef } from 'react';
import clsx from 'clsx';

export interface ClipSet<S extends string> {
  poster: string;
  clips: Record<S, string>;
  /** states that restart from frame 0 when entered (reactions); others just keep looping */
  restart: S[];
}

export default function ClipPortrait<S extends string>({ set, state, className, label }: { set: ClipSet<S>; state: S; className?: string; label: string }) {
  const refs = useRef<Partial<Record<S, HTMLVideoElement | null>>>({});
  const states = Object.keys(set.clips) as S[];

  useEffect(() => {
    for (const s of states) {
      const v = refs.current[s];
      if (!v) continue;
      if (s === state) {
        if (set.restart.includes(s)) v.currentTime = 0;
        v.play().catch(() => { /* autoplay blocked: poster stays visible */ });
      } else if (!v.paused && s !== states[0]) {
        v.pause(); // the first state (idle) keeps ticking underneath for seamless returns
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className={clsx('relative overflow-hidden bg-paper', className)} aria-label={`${label}, ${state}`} role="img">
      <img src={set.poster} alt="" className="absolute inset-0 w-full h-full object-cover" />
      {states.map((s) => (
        <video key={s} ref={(el) => { refs.current[s] = el; }} src={set.clips[s]} muted loop playsInline preload="auto" autoPlay={s === states[0]}
          className={clsx('absolute inset-0 w-full h-full object-cover transition-opacity duration-300', s === state ? 'opacity-100' : 'opacity-0')} />
      ))}
    </div>
  );
}
