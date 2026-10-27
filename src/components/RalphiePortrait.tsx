import ClipPortrait, { type ClipSet } from './ClipPortrait';

export type RalphieState = 'idle' | 'wave' | 'cheer' | 'thinking' | 'sleepy' | 'trophy';

export const RALPHIE: ClipSet<RalphieState> = {
  poster: '/assets/clips/ralphie_poster.jpg',
  clips: {
    idle: '/assets/clips/ralphie_idle.mp4',
    wave: '/assets/clips/ralphie_wave.mp4',
    cheer: '/assets/clips/ralphie_cheer.mp4',
    thinking: '/assets/clips/ralphie_thinking.mp4',
    sleepy: '/assets/clips/ralphie_sleepy.mp4',
    trophy: '/assets/clips/ralphie_trophy.mp4',
  },
  restart: ['wave', 'cheer', 'thinking', 'trophy'],
};

export default function RalphiePortrait({ state, className }: { state: RalphieState; className?: string }) {
  return <ClipPortrait set={RALPHIE} state={state} className={className} label="Ralphie" />;
}
