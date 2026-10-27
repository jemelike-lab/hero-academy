import ClipPortrait, { type ClipSet } from './ClipPortrait';

export type HumphreyState = 'idle' | 'speaking' | 'delighted' | 'thinking' | 'encouraging' | 'cheering' | 'board' | 'goodbye';

export const HUMPHREY: ClipSet<HumphreyState> = {
  poster: '/assets/clips/humphrey_poster.jpg',
  clips: {
    idle: '/assets/clips/humphrey_idle.mp4',
    speaking: '/assets/clips/humphrey_speaking.mp4',
    delighted: '/assets/clips/humphrey_delighted.mp4',
    thinking: '/assets/clips/humphrey_thinking.mp4',
    encouraging: '/assets/clips/humphrey_encouraging.mp4',
    cheering: '/assets/clips/humphrey_cheering.mp4',
    board: '/assets/clips/humphrey_board.mp4',
    goodbye: '/assets/clips/humphrey_goodbye.mp4',
  },
  restart: ['delighted', 'thinking', 'encouraging', 'cheering', 'board', 'goodbye'],
};

export default function HumphreyPortrait({ state, className }: { state: HumphreyState; className?: string }) {
  return <ClipPortrait set={HUMPHREY} state={state} className={className} label="Ms. Humphrey" />;
}
