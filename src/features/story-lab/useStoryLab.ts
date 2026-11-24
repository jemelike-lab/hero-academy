// Story Lab state (legacy story-lab.js + the Today's Adventure script):
// start → pick words → your story / my stories, and start → reading →
// questions → done.
import { useCallback, useEffect, useRef, useState } from 'react';
import { pause, say, stop } from '@/lib/tts';
import { rpc, startZoneSession } from '@/lib/telemetry';
import { CHILD_ID } from '@/lib/child';
import {
  LINES, PICK_MS, POOL_ASYNC, POOL_BLOCK, LOCAL_TEMPLATES, adventureFrom, firstVisitToday, markDone, readSaved, readingChunks,
  saveStory, storyParts, storyText, templatesFrom, type Adventure, type Part, type SavedStory, type Template,
} from './engine';

export type Screen = 'start' | 'slots' | 'story' | 'library' | 'reading' | 'questions' | 'done';
export type Mood = 'cheering' | 'encouraging' | null;

const GENERATOR = '/api/humphrey/generate-story-templates';
const json = (r: Response) => (r.ok ? r.json() : null);

// Legacy warmupPool + ha_get_story_templates: wait for fresh stories only when
// fewer than 5 are left unseen, otherwise ask for more in the background.
async function loadTemplates(): Promise<Template[]> {
  try {
    const status = await rpc('ha_story_pool_status', { p_child_id: CHILD_ID }).then(json).catch(() => null);
    const s = Array.isArray(status) ? status[0] : status;
    const unseen = s && typeof s.unseen === 'number' ? s.unseen : null;
    if (unseen !== null && unseen < POOL_ASYNC) {
      const gen = fetch(GENERATOR, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ child_id: CHILD_ID, target_count: 12 }), keepalive: true }).catch(() => null);
      if (unseen < POOL_BLOCK) await Promise.race([gen, pause(18000)]);
    }
    const rows = await rpc('ha_get_story_templates', { p_child_id: CHILD_ID, p_n: 10 }).then(json);
    return templatesFrom(rows);
  } catch {
    return LOCAL_TEMPLATES.slice();
  }
}

export function useStoryLab() {
  const [screen, setScreen] = useState<Screen>('start');
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [adventure, setAdventure] = useState<Adventure | null>(null);
  const [saved, setSaved] = useState<SavedStory[]>(() => readSaved(localStorage));
  const [mood, setMood] = useState<Mood>(null);
  // writing
  const [tpl, setTpl] = useState<Template | null>(null);
  const [slot, setSlot] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string | null>(null);
  const [parts, setParts] = useState<Part[]>([]);
  const [readingStory, setReadingStory] = useState<'idle' | 'reading' | 'again'>('idle');
  const [savedNow, setSavedNow] = useState<'no' | 'yes' | 'no-drawing'>('no');
  const [librarySpeaking, setLibrarySpeaking] = useState<string | null>(null);
  // adventure
  const [page, setPage] = useState(-1);
  const [readDone, setReadDone] = useState(false);
  const [qi, setQi] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [reading, setReading] = useState<number | null>(null);   // choice being read out
  const [got, setGot] = useState(0);
  const gen = useRef(0);          // bumps on every screen change, so stale speech chains stop
  const leave = () => { gen.current++; stop(); };

  useEffect(() => {
    const end = startZoneSession('writing', 'story-lab');
    void loadTemplates().then(setTemplates);
    rpc('ha_get_todays_content', { p_child_id: CHILD_ID, p_content_type: 'story' }).then(json)
      .then((r) => setAdventure(adventureFrom(r))).catch(() => { /* no card */ });
    if (firstVisitToday(localStorage)) {
      const my = gen.current;
      void pause(600).then(() => { if (gen.current === my) void say(LINES.welcome); });
    }
    return () => { gen.current++; stop(); end(); };
  }, []);

  // ---------- writing ----------
  const goStart = useCallback(() => {
    leave(); setScreen('start'); setTpl(null); setValues({}); setSlot(0); setPicked(null); setMood(null);
  }, []);
  const pickTemplate = useCallback((t: Template) => {
    leave(); setTpl(t); setValues({}); setSlot(0); setPicked(null); setScreen('slots');
    if (t.server && t.id) rpc('ha_mark_story_started', { p_item_id: t.id }).catch(() => {});
  }, []);

  const finishStory = useCallback((t: Template, vals: Record<string, string>) => {
    const ps = storyParts(t, vals); const text = storyText(ps);
    setParts(ps); setSavedNow('no'); setScreen('story'); setMood('cheering');
    markDone(localStorage);
    if (t.server && t.id) rpc('ha_mark_story_completed', { p_item_id: t.id }).catch(() => {});
    const my = ++gen.current; stop();
    setReadingStory('reading');
    void pause(500).then(async () => {
      if (gen.current !== my) return;
      await say(LINES.listen(text));
      if (gen.current === my) setReadingStory('again');
    });
  }, []);

  const pickWord = useCallback((word: string) => {
    if (!tpl || picked) return;
    const s = tpl.slots[slot]; const vals = { ...values, [s.key]: word };
    setPicked(word); setValues(vals);
    const my = gen.current;
    window.setTimeout(() => {
      if (gen.current !== my) return;
      setPicked(null);
      if (slot + 1 >= tpl.slots.length) finishStory(tpl, vals); else setSlot(slot + 1);
    }, PICK_MS);
  }, [tpl, slot, values, picked, finishStory]);

  // Legacy back: first word → the picker; later → the previous word.
  const slotBack = useCallback(() => {
    if (!tpl || picked) return;
    if (slot === 0) { goStart(); return; }
    const prev = tpl.slots[slot - 1]; const vals = { ...values }; delete vals[prev.key];
    setValues(vals); setSlot(slot - 1);
  }, [tpl, slot, values, picked, goStart]);

  const readStory = useCallback(async () => {
    if (readingStory === 'reading') return;
    const my = ++gen.current; setReadingStory('reading');
    await say(LINES.listen(storyText(parts)));
    if (gen.current === my) setReadingStory('again');
  }, [parts, readingStory]);

  const save = useCallback((drawing: string | null) => {
    if (!tpl || savedNow !== 'no') return;
    const story: SavedStory = { id: 'story-' + Date.now(), templateId: tpl.id, title: tpl.title, emoji: tpl.emoji, slots: { ...values }, text: storyText(parts), drawing, createdAt: new Date().toISOString() };
    const r = saveStory(localStorage, story);
    setSaved(r.saved); setSavedNow(drawing && !r.withDrawing ? 'no-drawing' : 'yes');
  }, [tpl, values, parts, savedNow]);

  const openLibrary = useCallback(() => { leave(); setSaved(readSaved(localStorage)); setLibrarySpeaking(null); setScreen('library'); }, []);
  const readSavedStory = useCallback(async (s: SavedStory) => {
    const my = ++gen.current; setLibrarySpeaking(s.id);
    await say(LINES.hereIs(s.text));
    if (gen.current === my) setLibrarySpeaking(null);
  }, []);

  // ---------- Today's Adventure ----------
  const askQuestion = useCallback(async (a: Adventure, i: number, my: number) => {
    setQi(i); setChoice(null); setReading(null); setMood(null);
    const q = a.questions[i];
    // Legacy HumphreyChoices.speakWithHighlights: the question, then each answer as it lights up.
    await say(q.q);
    for (let c = 0; c < q.choices.length; c++) {
      if (gen.current !== my) return;
      setReading(c); await say(q.choices[c]);
    }
    if (gen.current === my) setReading(null);
  }, []);

  const startAdventure = useCallback(async () => {
    if (!adventure) return;
    leave(); const my = gen.current; const a = adventure;
    setScreen('reading'); setPage(0); setReadDone(false); setGot(0); setMood(null);
    if (a.contentDate) rpc('ha_record_content_use', { p_child_id: CHILD_ID, p_content_date: a.contentDate, p_content_type: 'story' }).catch(() => {});
    for (const c of readingChunks(a)) {
      if (gen.current !== my) return;
      if (c.page >= 0) setPage(c.page);
      await say(c.text);
    }
    if (gen.current !== my) return;
    setReadDone(true);
    if (!a.questions.length) {
      // Legacy: open-ended questions are read aloud; there is nothing to tap.
      if (a.otherQuestions.length) { await say(LINES.thinkAboutIt); for (const q of a.otherQuestions) { if (gen.current !== my) return; await say(q); } }
      return;
    }
    setScreen('questions');
    await say(LINES.greatListening);
    if (gen.current === my) void askQuestion(a, 0, my);
  }, [adventure, askQuestion]);

  const answer = useCallback((i: number) => {
    if (!adventure || choice !== null) return;
    const q = adventure.questions[qi]; const right = i === q.answer;
    const my = ++gen.current; stop();
    setChoice(i); setReading(null); setMood(right ? 'cheering' : 'encouraging');
    if (right) setGot((n) => n + 1);
    if (gen.current === my) void say(right ? LINES.right(q.choices[q.answer]) : LINES.wrong(q.choices[q.answer]));
  }, [adventure, choice, qi]);

  const nextQuestion = useCallback(() => {
    if (!adventure) return;
    const my = ++gen.current; stop();
    if (qi + 1 < adventure.questions.length) void askQuestion(adventure, qi + 1, my);
    else { setScreen('done'); setMood('cheering'); }
  }, [adventure, qi, askQuestion]);

  const repeat = useCallback(() => {
    if (!adventure) return;
    if (screen === 'questions') { const my = ++gen.current; stop(); void askQuestion(adventure, qi, my); }
  }, [adventure, screen, qi, askQuestion]);

  return {
    screen, templates, adventure, saved, mood,
    tpl, slot, values, picked, parts, readingStory, savedNow, librarySpeaking,
    page, setPage, readDone, qi, choice, reading, got,
    goStart, pickTemplate, pickWord, slotBack, readStory, save, openLibrary, readSavedStory,
    startAdventure, answer, nextQuestion, repeat, showStory: () => { if (parts.length) { leave(); setScreen('story'); } },
  };
}
