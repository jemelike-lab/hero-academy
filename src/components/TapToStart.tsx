// Shown only while Humphrey's audio is still locked: the page was opened
// directly (reload, PWA relaunch) rather than from a tap on Home. One tap
// here primes audio (the global listener in tts.ts does the work) and the
// page carries on; lines that were waiting play straight away.
import { AnimatePresence, motion } from 'framer-motion';
import { useAudioUnlocked } from '@/lib/tts';
import { HUMPHREY } from './HumphreyPortrait';

export default function TapToStart({ title, label }: { title: string; label: string }) {
  const unlocked = useAudioUnlocked();
  return (
    <AnimatePresence>
      {!unlocked && (
        <motion.div key="tap-to-start" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] bg-paper/95 backdrop-blur-sm flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} className="flex flex-col items-center gap-5 text-center">
            <img src={HUMPHREY.poster} alt="Ms. Humphrey" className="w-40 h-40 rounded-[32px] object-cover ring-4 ring-teal/15 shadow-card" />
            <h2 className="font-display font-semibold text-[32px] leading-tight text-ink">{title}</h2>
            <motion.button type="button" whileTap={{ scale: 0.96 }}
              className="tap min-h-[88px] px-12 rounded-xl3 bg-sun text-ink font-display font-semibold text-[30px] shadow-tile active:translate-y-[2px] active:shadow-none">
              ▶ {label}
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
