import { useEffect, useState } from 'react';
import ClipPortrait, { type ClipSet } from './ClipPortrait';
import { isSpeaking, onSpeaking } from '@/lib/tts';

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

/**
 * Which clip to show. While her voice is playing she always uses the talking
 * clip (reaction clips are laughs, cheers and waves with no lip movement, and
 * looked wrong over speech). The one exception is 'board', the teaching gesture
 * used while she explains a step. A reaction plays in the silence after she
 * finishes, for up to `holdMs`, then she settles back to idle.
 */
export function useHumphrey(reaction: HumphreyState | null, holdMs = 4000): HumphreyState {
  const [speaking, setSpeaking] = useState(isSpeaking);
  useEffect(() => onSpeaking(setSpeaking), []);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    setExpired(false);
    if (!reaction || speaking) return;
    const t = window.setTimeout(() => setExpired(true), holdMs);
    return () => window.clearTimeout(t);
  }, [reaction, speaking, holdMs]);
  if (speaking) return reaction === 'board' ? 'board' : 'speaking';
  return reaction && !expired ? reaction : 'idle';
}
