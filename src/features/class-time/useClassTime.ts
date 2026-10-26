// Class Time engine (v300). Same behaviour as js/class-time-mc.js v171–v210,
// rebuilt as a React hook. Preserved: 4 courses/day, day-plan subjects,
// WritingBank primary for literacy, MathBank interleave for math, Humphrey
// reads question + options with tiles locked, wrong-twice teach-through,
// break after every two courses (5/10/15 picker), Supabase course records,
// localStorage markers the home tile reads.
// New (Vimi-style): a hint ladder the kid can pull at any time.
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { BoardAction, Course, CourseProgress, DayPlan, Question, fetchCourseProgress, fetchDayPlan, fetchQuestions, lookupImage, recordCourse, recordEvent } from '@/lib/api';
import { KID_NAME, todayISO } from '@/lib/child';
import { recordTopicAttempt } from '@/lib/telemetry';
import { say, stop, pause, setMuted as ttsSetMuted } from '@/lib/tts';
import { MathBank } from './math-bank';
import { WritingBank } from './writing-bank';

export const COURSES_PER_DAY = 4;
const QUESTIONS_PER_COURSE = 8;
const POST_SPEECH_PAUSE_MS = 2000;
const STEP_PAUSE_MS = 600;

export const SUBJECT_LABEL: Record<string, string> = {
  math: 'Math', reading: 'Reading', spelling: 'Spelling', science: 'Science', grammar: 'Grammar',
  vocabulary: 'Vocabulary', writing: 'Writing', social: 'Social Studies', 'social studies': 'Social Studies',
  social_studies: 'Social Studies', history: 'History', art: 'Art', music: 'Music',
};
export const SUBJECT_EMOJI: Record<string, string> = {
  math: '🔢', reading: '📖', spelling: '🔤', science: '🔬', grammar: '✏️', vocabulary: '💬', writing: '📝', social: '🗺️', history: '🏛️',
};

export type Phase = 'boot' | 'course-intro' | 'question' | 'remediation' | 'break' | 'done' | 'error';
export type TileState = 'idle' | 'correct' | 'wrong' | 'dim';
export type HintRung = 0 | 1 | 2 | 3;

export interface BoardState { actions: BoardAction[]; stepIdx: number; stepsTotal: number; label: string }

export interface ClassTimeState {
  phase: Phase;
  today: string;
  dayPlan: DayPlan | null;
  progress: CourseProgress[];
  courseIdx: number;
  subject: string;
  questions: Question[];
  qIdx: number;
  wrongAttempts: number;
  locked: boolean;
  bubble: string;
  tiles: TileState[];
  hintRung: HintRung;
  board: BoardState | null;
  imageUrl: string | null;
  imageCaption: string;
  remediationDone: boolean;
  bootLabel: string;
  muted: boolean;
  nextCourseIdx: number;
  error: string;
}

type Action =
  | { type: 'patch'; patch: Partial<ClassTimeState> }
  | { type: 'tiles'; tiles: TileState[] };

function reducer(s: ClassTimeState, a: Action): ClassTimeState {
  switch (a.type) {
    case 'patch': return { ...s, ...a.patch };
    case 'tiles': return { ...s, tiles: a.tiles };
  }
}

const initial: ClassTimeState = {
  phase: 'boot', today: todayISO(), dayPlan: null, progress: [], courseIdx: 0, subject: 'math',
  questions: [], qIdx: 0, wrongAttempts: 0, locked: true, bubble: '', tiles: [], hintRung: 0, board: null,
  imageUrl: null, imageCaption: '', remediationDone: false, bootLabel: 'Setting up today’s class…', muted: false,
  nextCourseIdx: 0, error: '',
};

function ensureCorrectAnswer(q: Question): Question {
  // Banks use correct_answer (string); API uses correct_index. Normalise.
  const anyQ = q as Question & { correct_answer?: string };
  if (typeof q.correct_index !== 'number' && anyQ.correct_answer) {
    const idx = q.options.findIndex((o) => o === anyQ.correct_answer);
    return { ...q, correct_index: idx >= 0 ? idx : 0 };
  }
  return q;
}

export function courseForIdx(plan: DayPlan | null, idx: number): Course | null {
  if (!plan?.courses) return null;
  return plan.courses.find((c) => Number(c.order) === idx + 1) || plan.courses[idx] || null;
}

function subjectForIdx(plan: DayPlan | null, idx: number): string {
  const c = courseForIdx(plan, idx);
  if (c?.subject) return String(c.subject).toLowerCase().trim();
  return ['math', 'reading', 'spelling', 'science'][idx] || 'math';
}

function letterFor(i: number) { return String.fromCharCode(65 + i); }

export function useClassTime() {
  const [state, dispatch] = useReducer(reducer, initial);
  const ref = useRef(state); ref.current = state;
  const abort = useRef(false);
  const patch = useCallback((p: Partial<ClassTimeState>) => dispatch({ type: 'patch', patch: p }), []);

  const speak = useCallback(async (text: string) => {
    patch({ bubble: text });
    await say(text);
  }, [patch]);

  // ---------- question sourcing (mirrors fetchQuestionsForCourse) ----------
  const questionsFor = useCallback(async (courseIdx: number, subject: string): Promise<Question[]> => {
    const today = ref.current.today;
    const BANK_SUBJECTS = ['writing', 'spelling', 'reading', 'grammar'];
    if (BANK_SUBJECTS.includes(subject)) {
      const picked = WritingBank.pickForDate(today, QUESTIONS_PER_COURSE) as unknown as Question[];
      if (picked?.length >= 3) return picked.slice(0, QUESTIONS_PER_COURSE);
    }
    let server: Question[] | null = null;
    try {
      const r = await fetchQuestions(today, courseIdx + 1);
      if (r.questions.length >= 3) server = r.questions;
    } catch { /* fall through */ }
    if (subject === 'math') {
      const coded = MathBank.pickForDate(today, 4) as unknown as Question[];
      const fromServer = (server || []).slice(0, 4);
      const out: Question[] = [];
      for (let i = 0; i < 4; i++) { if (coded[i]) out.push(coded[i]); if (fromServer[i]) out.push(fromServer[i]); }
      if (out.length >= 4) return out.slice(0, QUESTIONS_PER_COURSE);
    }
    if (server) return server.slice(0, QUESTIONS_PER_COURSE);
    // Last resort: the curated banks are always available offline.
    return (subject === 'math' ? MathBank.pickForDate(today, QUESTIONS_PER_COURSE) : WritingBank.pickForDate(today, QUESTIONS_PER_COURSE)) as unknown as Question[];
  }, []);

  // ---------- question rendering ----------
  const presentQuestion = useCallback(async (q: Question) => {
    patch({
      phase: 'question', wrongAttempts: 0, locked: true, hintRung: 0, board: null, remediationDone: false,
      tiles: q.options.map(() => 'idle' as TileState), imageUrl: null, imageCaption: '',
    });
    if (q.image_subject) {
      lookupImage(q.image_subject).then((img) => {
        if (abort.current || ref.current.questions[ref.current.qIdx] !== q) return;
        if (img.image_url) patch({ imageUrl: img.image_url, imageCaption: img.caption || q.image_subject || '' });
      }).catch(() => { /* text-only */ });
    }
    const optionsRead = q.options.map((o, i) => `${letterFor(i)}. ${o}.`).join(' ');
    await speak(`${q.question} ${optionsRead}`);
    if (abort.current) return;
    patch({ locked: false, bubble: 'Tap the answer you think is right.' });
  }, [patch, speak]);

  const advance = useCallback(async () => {
    const s = ref.current;
    const next = s.qIdx + 1;
    if (next >= s.questions.length) { await finishCourse(); return; }
    patch({ qIdx: next });
    await presentQuestion(s.questions[next]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patch, presentQuestion]);

  // ---------- board playback (remediation steps) ----------
  const playSteps = useCallback(async (q: Question, fromStep: number, toStep: number, label: string) => {
    const steps = q.remediation?.steps || [];
    let actions: BoardAction[] = [];
    for (let i = fromStep; i < Math.min(toStep, steps.length); i++) {
      if (abort.current) return;
      const st = steps[i];
      if (st.board) {
        actions = st.board.tool === 'clearBoard' ? [] : [...actions, st.board];
      }
      patch({ board: { actions, stepIdx: i, stepsTotal: steps.length, label } });
      await speak(st.say);
      await pause(STEP_PAUSE_MS);
    }
  }, [patch, speak]);

  const startRemediation = useCallback(async (q: Question) => {
    patch({ phase: 'remediation', locked: true, hintRung: 3 });
    recordEvent('class_time_demo_start', { q_idx: ref.current.qIdx });
    await speak(q.remediation?.intro || 'Let me show you how this one works.');
    await playSteps(q, 0, 99, 'Ms. Humphrey’s board');
    if (abort.current) return;
    await speak(q.remediation?.outro || q.explanation || 'And that is how we solve it.');
    patch({ remediationDone: true, bubble: 'Tap “I get it” when you’re ready for the next one.' });
  }, [patch, speak, playSteps]);

  // ---------- answering ----------
  const answer = useCallback(async (idx: number) => {
    const s = ref.current;
    if (s.locked || s.phase !== 'question') return;
    const q = s.questions[s.qIdx];
    const correct = idx === q.correct_index;
    const topicId = q.topic;
    if (correct) {
      const tiles = s.tiles.map((_, i) => (i === idx ? 'correct' : 'dim') as TileState);
      dispatch({ type: 'tiles', tiles });
      patch({ locked: true });
      recordEvent('class_time_answer', { q_idx: s.qIdx, correct: true, attempts: s.wrongAttempts + 1 });
      recordTopicAttempt(topicId, s.wrongAttempts === 0, s.subject);
      await speak(q.explanation || 'Yes! That’s right.');
      await pause(POST_SPEECH_PAUSE_MS);
      if (!abort.current) await advance();
      return;
    }
    const wrong = s.wrongAttempts + 1;
    const tiles = s.tiles.map((t, i) => (i === idx ? 'wrong' : t) as TileState);
    dispatch({ type: 'tiles', tiles });
    patch({ wrongAttempts: wrong, locked: true });
    recordEvent('class_time_answer', { q_idx: s.qIdx, correct: false, attempts: wrong });
    if (wrong === 1) {
      await speak(q.hint ? `Not quite. ${q.hint}` : 'Not quite. Try once more.');
      if (abort.current) return;
      // the wrong tile stays amber so he remembers; everything else re-opens
      patch({ locked: false, hintRung: ref.current.hintRung < 1 ? 1 : ref.current.hintRung });
    } else {
      recordTopicAttempt(topicId, false, s.subject);
      await startRemediation(q);
    }
  }, [patch, speak, advance, startRemediation]);

  // ---------- hint ladder (new) ----------
  const useHint = useCallback(async (rung: 1 | 2 | 3) => {
    const s = ref.current;
    if (s.phase !== 'question') return;
    const q = s.questions[s.qIdx];
    stop();
    if (rung === 1) {
      patch({ hintRung: Math.max(1, s.hintRung) as HintRung });
      await speak(q.hint || 'Read the question once more, slowly.');
      if (!abort.current) patch({ locked: false });
    } else if (rung === 2) {
      patch({ hintRung: Math.max(2, s.hintRung) as HintRung, locked: true });
      await playSteps(q, 0, 1, 'One step');
      if (!abort.current) patch({ locked: false, bubble: 'Now you try.' });
    } else {
      await startRemediation(q);
    }
  }, [patch, speak, playSteps, startRemediation]);

  const readAgain = useCallback(async () => {
    const s = ref.current;
    if (s.phase !== 'question') return;
    const q = s.questions[s.qIdx];
    stop();
    patch({ locked: true });
    await speak(`${q.question} ${q.options.map((o, i) => `${letterFor(i)}. ${o}.`).join(' ')}`);
    if (!abort.current) patch({ locked: false });
  }, [patch, speak]);

  const gotIt = useCallback(async () => {
    if (ref.current.phase !== 'remediation') return;
    stop();
    await advance();
  }, [advance]);

  // ---------- course lifecycle ----------
  const startCourse = useCallback(async (courseIdx: number) => {
    const s = ref.current;
    const subject = subjectForIdx(s.dayPlan, courseIdx);
    patch({ phase: 'boot', bootLabel: `Loading questions for ${SUBJECT_LABEL[subject] || subject}…`, courseIdx, subject });
    const questions = (await questionsFor(courseIdx, subject)).map(ensureCorrectAnswer);
    if (abort.current) return;
    patch({ questions, qIdx: 0, phase: 'course-intro' });
    recordEvent('class_time_course_start', { course_idx: courseIdx, subject });
    const label = SUBJECT_LABEL[subject] || subject;
    const ordinal = ['first', 'second', 'third', 'fourth'][courseIdx] || `course ${courseIdx + 1}`;
    const c = courseForIdx(s.dayPlan, courseIdx);
    let why = c?.why_chosen ? String(c.why_chosen).trim().slice(0, 200) : '';
    if (why && !/[.!?]$/.test(why)) why += '.';
    const opener = courseIdx === 0
      ? `Welcome to class, ${KID_NAME}! Let's start with ${label}. ${why ? why + ' ' : ''}Here is your first question.`
      : `Great, it's time for ${label}, our ${ordinal} class. ${why ? why + ' ' : ''}Here is your first question.`;
    await speak(opener);
    if (abort.current) return;
    if (!questions.length) { await finishCourse(); return; }
    await presentQuestion(questions[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patch, questionsFor, speak, presentQuestion]);

  const completeDay = useCallback((reason: string) => {
    const s = ref.current;
    try {
      const raw = localStorage.getItem('hero_academy_state_v1');
      const app = raw ? JSON.parse(raw) : {};
      app.zoneProgress = app.zoneProgress || {};
      app.zoneProgress['class-time'] = Math.min(100, (app.zoneProgress['class-time'] || 0) + 25);
      localStorage.setItem('hero_academy_state_v1', JSON.stringify(app));
      const key = `ha_mission_zones_done_${s.today}`;
      const done: string[] = JSON.parse(localStorage.getItem(key) || '[]');
      if (!done.includes('class-time')) { done.push('class-time'); localStorage.setItem(key, JSON.stringify(done)); }
      localStorage.setItem(`ha_class_time_${s.today}`, JSON.stringify({ completedAt: new Date().toISOString(), courses_done: COURSES_PER_DAY, total_courses: COURSES_PER_DAY }));
    } catch { /* storage unavailable */ }
    recordEvent('class_time_complete', { reason });
    patch({ phase: 'done', bubble: `Great class, ${KID_NAME}! See you tomorrow.` });
    void say(`Great class today, ${KID_NAME}! I'll see you tomorrow.`);
  }, [patch]);

  async function finishCourse() {
    const s = ref.current;
    const topics = s.questions.map((q) => q.topic);
    recordEvent('class_time_course_complete', { course_idx: s.courseIdx, subject: s.subject });
    try { await recordCourse(s.today, s.courseIdx + 1, s.subject, topics); } catch { /* keep going; progress card will reconcile next boot */ }
    const prog = [...s.progress.filter((p) => p.course_order !== s.courseIdx + 1), { course_order: s.courseIdx + 1, subject: s.subject, started_at: null, completed_at: new Date().toISOString(), topics_covered: topics }];
    patch({ progress: prog });
    if (s.courseIdx + 1 >= COURSES_PER_DAY) { completeDay('all-courses-done'); return; }
    const breakDue = ((s.courseIdx + 1) % 2) === 0; // v194: one mid-day break
    if (breakDue) { patch({ phase: 'break', nextCourseIdx: s.courseIdx + 1 }); }
    else { await startCourse(s.courseIdx + 1); }
  }

  const resumeFromBreak = useCallback(async () => {
    recordEvent('class_time_break_end', {});
    await startCourse(ref.current.nextCourseIdx);
  }, [startCourse]);

  const toggleMute = useCallback(() => {
    const m = !ref.current.muted; ttsSetMuted(m); patch({ muted: m });
  }, [patch]);

  const exit = useCallback(() => {
    abort.current = true; stop();
    recordEvent('class_time_exit_early', { course_idx: ref.current.courseIdx, q_idx: ref.current.qIdx });
    window.location.href = '/';
  }, []);

  // ---------- boot ----------
  useEffect(() => {
    abort.current = false;
    (async () => {
      try {
        const today = ref.current.today;
        const [plan, progress] = await Promise.all([
          fetchDayPlan(today).catch(() => null),
          fetchCourseProgress(today).catch(() => [] as CourseProgress[]),
        ]);
        patch({ dayPlan: plan, progress });
        const done = new Set(progress.filter((p) => p.completed_at).map((p) => p.course_order));
        if (done.size >= COURSES_PER_DAY) { completeDay('already-done'); return; }
        let first = 0; while (done.has(first + 1) && first < COURSES_PER_DAY) first++;
        await startCourse(first);
      } catch (e) {
        patch({ phase: 'error', error: e instanceof Error ? e.message : 'Could not load class.' });
      }
    })();
    return () => { abort.current = true; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, answer, useHint, readAgain, gotIt, resumeFromBreak, toggleMute, exit };
}
