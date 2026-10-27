// Digit Tower engine (v310). Behaviour ported from js/digit-tower.js v210:
// 75-minute Game Day, hq → warmup → floors → break → bonus → debrief; seeded
// rooms re-skinned per world with a daily twist; no timers, no lives; wrong
// answers open the work board and the third miss shows the answer to type;
// progress in ha_tower_progress via ha_tower_save_progress; the same local
// markers Class Time writes so the home tile flips.
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { CHILD_ID, KID_NAME, todayISO } from '@/lib/child';
import { rpc } from '@/lib/telemetry';
import { say, stop, setMuted as ttsSetMuted } from '@/lib/tts';
import { C, DEBRIEF_MAX, DEBRIEF_N, DEBRIEF_UNTIL_MIN, MIN, PHASES, RANKS, SEASON, TOTAL_MIN, TWISTS, WARMUP_N, WORLDS, rankFor, type Kind, type Phase } from './config';
import { GEN, makeQuestion, weakKindFromTopic, type Q } from './questions';
import { Music } from './music';
import { Room, Tile, allVaultsOpen, bfs, hash32, isLockCh, key, makeRoom, mulberry, tileAt } from './room';

export type Mode = 'boot' | 'hq' | 'intro' | 'play' | 'prob' | 'resolving' | 'roomend' | 'break' | 'done';
export type ProbMode = 'lock' | 'warmup' | 'debrief';
export interface Progress { gems: number; crown: number[]; floors: Array<{ date: string; world: number; floor: number; stars: number }>; gadgets: Record<string, unknown>; floor_idx: number; game_days: number; world_idx: number; locks_total: number; first_try_total: number }
export interface Float { id: number; c: number; r: number; txt: string; col: string }
export interface Burst { id: number; c: number; r: number; col: string; n: number }
export interface Intro { title: string; text: string; sayText: string; btn: string; onGo: () => void }
export interface RoomEnd { title: string; say: string; btn: string; stars: number; first: string; onGo: () => void }

export interface TowerState {
  date: string; mode: Mode; phase: Phase; resumePhase: Phase | null;
  progress: Progress | null; weakKinds: Kind[];
  elapsedMs: number; completed: boolean;
  worldIdx: number; floorIdx: number; roomIdx: number; twist: string; seed: number;
  gemsToday: number; locksToday: number; firstTryToday: number; assistedToday: number; boardToday: number; misses: Kind[]; topics: Record<string, number>;
  room: Room | null; roomTick: number; // roomTick bumps so React re-renders the mutable room
  warmupDone: number; debriefDone: number;
  q: Q | null; tries: number; typed: string; workOpen: boolean; boardBeforeAnswer: boolean; sel: string | null; probMode: ProbMode; probLabel: string; hintLevel: number; answerState: 'idle' | 'ok' | 'shake';
  target: { c: number; r: number; ch: Tile } | null;
  bubble: string; intro: Intro | null; roomEnd: RoomEnd | null; breakLeft: number;
  floats: Float[]; bursts: Burst[];
  muted: boolean; musicOn: boolean;
  doneSummary: { stars: number; rank: string; say: string } | null;
}

type Act = { type: 'patch'; p: Partial<TowerState> };
function reducer(s: TowerState, a: Act): TowerState { return { ...s, ...a.p }; }

const LS_KEY = (date: string) => `ha_tower_day_${date}`;
let uid = 1;

const initial: TowerState = {
  date: todayISO(), mode: 'boot', phase: 'hq', resumePhase: null, progress: null, weakKinds: ['add2r'],
  elapsedMs: 0, completed: false, worldIdx: 0, floorIdx: 1, roomIdx: 0, twist: 'none', seed: 0,
  gemsToday: 0, locksToday: 0, firstTryToday: 0, assistedToday: 0, boardToday: 0, misses: [], topics: {},
  room: null, roomTick: 0, warmupDone: 0, debriefDone: 0,
  q: null, tries: 0, typed: '', workOpen: false, boardBeforeAnswer: false, sel: null, probMode: 'lock', probLabel: '', hintLevel: 0, answerState: 'idle', target: null,
  bubble: '', intro: null, roomEnd: null, breakLeft: 0, floats: [], bursts: [], muted: false, musicOn: true, doneSummary: null,
};

export function useDigitTower() {
  const [state, dispatch] = useReducer(reducer, initial);
  const ref = useRef(state); ref.current = state;
  const patch = useCallback((p: Partial<TowerState>) => dispatch({ type: 'patch', p }), []);
  const lastTick = useRef(Date.now());
  const breakTimer = useRef<number | null>(null);
  const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

  const voice = useCallback((text: string) => { patch({ bubble: text }); Music.duck(true); void say(text).finally(() => Music.duck(false)); }, [patch]);

  // ---------------- persistence ----------------
  const saveLocal = useCallback(() => {
    const s = ref.current; const rm = s.room;
    try {
      localStorage.setItem(LS_KEY(s.date), JSON.stringify({
        v: 1, phase: s.phase, elapsedMs: s.elapsedMs, completed: s.completed, worldIdx: s.worldIdx, floorIdx: s.floorIdx, roomIdx: s.roomIdx, twist: s.twist,
        gemsToday: s.gemsToday, locksToday: s.locksToday, firstTryToday: s.firstTryToday, assistedToday: s.assistedToday, boardToday: s.boardToday, misses: s.misses, topics: s.topics, warmupDone: s.warmupDone, debriefDone: s.debriefDone,
        room: rm ? { seed: s.seed, bonus: rm.bonus, opened: [...rm.opened], seen: [...rm.seen], ralphie: rm.ralphie, hintTokens: rm.hintTokens, hero: { c: rm.hero.c, r: rm.hero.r }, stats: { ...rm.stats, ms: Date.now() - rm.stats.t0 } } : null,
      }));
    } catch { /* storage unavailable */ }
  }, []);
  const loadLocal = (date: string) => { try { const raw = localStorage.getItem(LS_KEY(date)); return raw ? JSON.parse(raw) : null; } catch { return null; } };
  const recordTopic = (topic: string, first: boolean) => rpc('ha_record_topic_attempt', { p_child_id: CHILD_ID, p_topic_id: topic, p_passed: !!first, p_subject: 'math', p_zone_id: 'digit-tower' }).catch(() => {});
  const logEvent = (type: string, payload: Record<string, unknown>) => rpc('ha_record_event', { p_child_id: CHILD_ID, p_event_type: type, p_payload: payload }).catch(() => {});
  const recordRoomRun = (phase: string, st: Room['stats'], stars: number) => {
    const s = ref.current;
    rpc('ha_tower_record_floor', { p_child_id: CHILD_ID, p_run: { date: s.date, world: s.worldIdx, floor: s.floorIdx, room: s.roomIdx, phase, twist: s.twist, locks: st.locks, first_try: st.first, assisted: st.assisted, board_before: st.board, ms: st.ms, stars, topics: st.topics } }).catch(() => {});
  };

  // ---------------- clock ----------------
  const elapsedMin = () => ref.current.elapsedMs / MIN;
  const setPhase = useCallback((name: Phase) => {
    const idx = PHASES.findIndex((p) => p[0] === name); const startMin = idx > 0 ? PHASES[idx - 1][1] : 0;
    patch({ phase: name, elapsedMs: Math.max(ref.current.elapsedMs, startMin * MIN) });
  }, [patch]);

  // ---------------- effects: bursts/floats ----------------
  const burst = (c: number, r: number, col: string, n: number) => { const b = { id: uid++, c, r, col, n }; patch({ bursts: [...ref.current.bursts, b] }); setTimeout(() => patch({ bursts: ref.current.bursts.filter((x) => x.id !== b.id) }), 1000); };
  const float = (c: number, r: number, txt: string, col: string) => { const f = { id: uid++, c, r, txt, col }; patch({ floats: [...ref.current.floats, f] }); setTimeout(() => patch({ floats: ref.current.floats.filter((x) => x.id !== f.id) }), 1300); };

  // ---------------- rooms ----------------
  const startRoom = useCallback((bonus: boolean) => {
    const s = ref.current; const lieutenant = s.floorIdx === 2 && !bonus;
    const seed = hash32(`${CHILD_ID}|${s.date}|${s.worldIdx}|${s.floorIdx}|${s.roomIdx}${bonus ? '|bonus' : ''}`);
    const room = makeRoom(seed, { bonus, lieutenant, twist: s.twist });
    patch({ seed, room, roomTick: 0, mode: 'play', intro: null, roomEnd: null });
    setTimeout(saveLocal, 0);
    Music.start(s.worldIdx, seed);
  }, [patch, saveLocal]);

  const restoreRoom = useCallback((saved: any) => {
    const s = ref.current; const lieutenant = s.floorIdx === 2 && !saved.bonus;
    const room = makeRoom(saved.seed, { bonus: saved.bonus, lieutenant, twist: s.twist });
    room.opened = new Set(saved.opened || []); room.seen = new Set(saved.seen || []); room.ralphie = !!saved.ralphie; room.hintTokens = saved.hintTokens || 0;
    if (saved.stats) room.stats = { ...room.stats, ...saved.stats, t0: Date.now() - (saved.stats.ms || 0) };
    if (saved.hero) room.hero = { c: saved.hero.c, r: saved.hero.r, x: saved.hero.c, y: saved.hero.r };
    patch({ seed: saved.seed, room, roomTick: 0, mode: 'play' });
    Music.start(s.worldIdx, saved.seed);
  }, [patch]);

  // ---------------- problems ----------------
  const openProblem = useCallback((target: { c: number; r: number; ch: Tile } | null, mode: ProbMode = 'lock') => {
    const s = ref.current; let q: Q; let label: string;
    if (mode === 'warmup') { q = makeQuestion('weak', s.worldIdx, s.weakKinds); label = `Warm-up ${s.warmupDone + 1} of ${WARMUP_N}`; }
    else if (mode === 'debrief') { const m = s.misses.length ? s.misses[s.debriefDone % s.misses.length] : null; q = m && GEN[m] ? GEN[m]() : makeQuestion('weak', s.worldIdx, s.weakKinds); label = `Debrief ${s.debriefDone + 1}`; }
    else {
      const ch = target!.ch; q = ch === 'C' || ch === 'R' ? makeQuestion('fact', s.worldIdx, s.weakKinds) : makeQuestion('world', s.worldIdx, s.weakKinds);
      label = ch === 'C' ? 'Treasure crate · bonus' : ch === 'V' ? `${WORLDS[s.worldIdx].vil}'s vault lock` : ch === 'R' ? "Ralphie's cage" : 'Door lock';
      if (s.room) s.room.stats.locks++;
    }
    patch({ probMode: mode, sel: target ? key(target.c, target.r) : null, tries: 0, typed: '', workOpen: false, boardBeforeAnswer: false, mode: 'prob', q, target, probLabel: label, hintLevel: 0, answerState: 'idle' });
    voice(q.say);
  }, [patch, voice]);

  const typeDigit = useCallback((d: string) => { const s = ref.current; if (s.mode !== 'prob') return; patch({ typed: d === 'del' ? s.typed.slice(0, -1) : s.typed.length < 3 ? s.typed + d : s.typed }); }, [patch]);
  const toggleWork = useCallback((force?: boolean) => { const s = ref.current; const next = force === undefined ? !s.workOpen : force; patch({ workOpen: next, boardBeforeAnswer: s.boardBeforeAnswer || (next && !s.workOpen && s.tries === 0) }); }, [patch]);
  const askRalphie = useCallback(() => { const s = ref.current; if (!s.room || s.room.hintTokens <= 0 || !s.q) return; s.room.hintTokens--; patch({ workOpen: true, hintLevel: Math.max(1, s.hintLevel), roomTick: s.roomTick + 1 }); voice('Ralphie says: ' + s.q.hints[0]); }, [patch, voice]);
  const readAgain = useCallback(() => { const s = ref.current; if (s.q) voice(s.q.say); }, [voice]);

  const finishDay = useCallback(() => {
    const s = ref.current; if (s.completed || !s.progress) return;
    Music.stop(); Music.sfx('fanfare');
    const p = s.progress; const ratio = s.locksToday ? s.firstTryToday / s.locksToday : 1; const stars = ratio >= 0.85 ? 3 : ratio >= 0.6 ? 2 : 1;
    const patchP: Record<string, unknown> = { gems: p.gems + s.gemsToday, first_try_total: p.first_try_total + s.firstTryToday, locks_total: p.locks_total + s.locksToday, game_days: p.game_days + 1, floors_add: { date: s.date, world: s.worldIdx, floor: s.floorIdx, stars } };
    if (s.floorIdx === 2) { patchP.crown_add = s.worldIdx; patchP.world_idx = Math.min(WORLDS.length - 1, s.worldIdx + 1); patchP.floor_idx = s.worldIdx === WORLDS.length - 1 ? 2 : 1; } else patchP.floor_idx = 2;
    rpc('ha_tower_save_progress', { p_child_id: CHILD_ID, p_patch: patchP, p_season: SEASON }).catch(() => {});
    rpc('ha_record_session_signal', { p_child_id: CHILD_ID, p_zone: 'digit-tower', p_items_attempted: s.locksToday, p_items_correct_first_try: s.firstTryToday, p_longest_streak: 0 }).catch(() => {});
    try {
      const raw = localStorage.getItem('hero_academy_state_v1'); const app = raw ? JSON.parse(raw) : {}; app.zoneProgress = app.zoneProgress || {}; app.zoneProgress['class-time'] = Math.min(100, (app.zoneProgress['class-time'] || 0) + 25); localStorage.setItem('hero_academy_state_v1', JSON.stringify(app));
      const k = `ha_mission_zones_done_${s.date}`; const done = JSON.parse(localStorage.getItem(k) || '[]'); if (!done.includes('class-time')) { done.push('class-time'); localStorage.setItem(k, JSON.stringify(done)); }
      localStorage.setItem('ha_class_time_' + s.date, JSON.stringify({ completedAt: new Date().toISOString(), courses_done: 4, total_courses: 4, game_day: true }));
    } catch { /* ignore */ }
    logEvent('class_time_complete', { reason: 'game-day', world: s.worldIdx, floor: s.floorIdx, gems: s.gemsToday, locks: s.locksToday, first_try: s.firstTryToday, minutes: Math.round(elapsedMin()) });
    const newRank = RANKS[rankFor(p.first_try_total + s.firstTryToday)].n, oldRank = RANKS[rankFor(p.first_try_total)].n; const w = WORLDS[s.worldIdx];
    const sayT = (newRank !== oldRank ? `You are a ${newRank} now! ` : '') + (s.floorIdx === 2 ? `${w.vil} is beaten and a crown piece is yours. ` : `${w.n} floor one is done. `) + `That is Game Day, ${KID_NAME}. ${s.floorIdx === 2 ? `Next time, ${WORLDS[Math.min(WORLDS.length - 1, s.worldIdx + 1)].n}.` : `Next time, floor two, and ${w.vil} will be waiting.`} See you then.`;
    patch({ completed: true, mode: 'done', doneSummary: { stars, rank: newRank, say: sayT } });
    setTimeout(saveLocal, 0); voice(sayT);
  }, [patch, saveLocal, voice]);

  // forward declarations resolved via refs so callbacks can reference each other
  const startFloorsPhaseRef = useRef<() => void>(() => {});
  const startDebriefRef = useRef<() => void>(() => {});
  const startBonusRef = useRef<() => void>(() => {});

  const roomCleared = useCallback(() => {
    const s = ref.current; const rm = s.room; if (!rm) return;
    Music.stop(); const st = rm.stats; st.ms = Date.now() - st.t0;
    const ratio = st.locks ? st.first / st.locks : 1; const stars = ratio >= 0.85 ? 3 : ratio >= 0.6 ? 2 : 1;
    recordRoomRun(rm.bonus ? 'bonus' : 'floor', st, stars); Music.sfx('fanfare');
    const m = elapsedMin(); let next: 'room' | 'bonus' | 'break' | 'debrief';
    if (rm.bonus) next = m >= 66 ? 'debrief' : 'bonus'; else next = m < 42 ? 'room' : (m < 60 ? 'break' : 'debrief');
    const sayT = stars === 3 ? `Every lock on the first try. That is real hero work, ${KID_NAME}.` : stars === 2 ? 'Strong room. Remember the work board is your superpower.' : 'You opened every door, and that is what counts.';
    const btn = { room: 'Next room', break: 'Stretch break', debrief: 'Hero debrief', bonus: 'Another bonus room' }[next];
    const onGo = () => {
      stop(); patch({ roomEnd: null });
      if (next === 'room') { patch({ roomIdx: ref.current.roomIdx + 1, room: null }); setTimeout(() => startRoom(false), 0); }
      else if (next === 'bonus') { patch({ roomIdx: ref.current.roomIdx + 1, room: null }); setTimeout(() => startRoom(true), 0); }
      else if (next === 'break') startBreak(); else startDebriefRef.current();
    };
    patch({ mode: 'roomend', roomEnd: { title: rm.bonus ? 'Bonus room cleared!' : `Room ${s.roomIdx + 1} cleared!`, say: sayT, btn, stars, first: `${st.first}/${st.locks}`, onGo } });
    voice(sayT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patch, startRoom, voice]);

  const check = useCallback(() => {
    const s = ref.current; if (!s.typed || s.mode !== 'prob' || !s.q) return;
    const v = parseInt(s.typed, 10); const q = s.q;
    if (v === q.answer) {
      Music.sfx('good'); const first = s.tries === 0; patch({ answerState: 'ok', mode: 'resolving' });
      if (s.probMode === 'lock' && s.room && s.target) {
        const rm = s.room; const st = rm.stats; if (first) st.first++; if (s.tries >= 3) st.assisted++; if (s.boardBeforeAnswer) st.board++;
        st.topics[q.topic] = st.topics[q.topic] || { n: 0, first: 0 }; st.topics[q.topic].n++; if (first) st.topics[q.topic].first++;
        recordTopic(q.topic, first);
        const isCrate = s.target.ch === 'C', isRalphie = s.target.ch === 'R'; const gems = isCrate ? (first ? 6 : 3) : isRalphie ? 5 : (first ? 4 : 2);
        patch({ firstTryToday: s.firstTryToday + (first ? 1 : 0), assistedToday: s.assistedToday + (s.tries >= 3 ? 1 : 0), boardToday: s.boardToday + (s.boardBeforeAnswer ? 1 : 0), locksToday: s.locksToday + 1, topics: { ...s.topics, [q.topic]: (s.topics[q.topic] || 0) + 1 }, gemsToday: s.gemsToday + gems });
        const praise = first ? ['Yes! First try.', `That is it, ${KID_NAME}!`, 'Opened. Nice work.', 'Perfect.'][rnd(0, 3)] : (s.tries >= 3 ? 'There it is. You typed it, so it is yours now.' : 'You got it. The board helped, and that counts.');
        const tgt = s.target;
        setTimeout(() => {
          rm.opened.add(key(tgt.c, tgt.r)); burst(tgt.c, tgt.r, C.gold, 34); burst(tgt.c, tgt.r, C.mint, 14); float(tgt.c, tgt.r, `+${gems} ◆`, C.gold); Music.sfx('gem');
          if (isRalphie) { rm.ralphie = true; rm.hintTokens = 1; voice('Ralphie is free! He will follow you, and he can give you one hint on any lock. Tap Ask Ralphie when you want it.'); } else voice(praise);
          patch({ mode: 'play', q: null, roomTick: ref.current.roomTick + 1 }); saveLocal();
          if (tgt.ch === 'V' && allVaultsOpen(rm)) setTimeout(() => { burst(tgt.c, tgt.r, C.magenta, 40); voice(`${WORLDS[ref.current.worldIdx].vil} is beaten! The stairs are open, ${KID_NAME}.`); }, 500);
        }, 500);
      } else if (s.probMode === 'warmup') {
        recordTopic(q.topic, first); const done = s.warmupDone + 1;
        patch({ warmupDone: done, misses: first ? s.misses : [...s.misses, q.kind] });
        setTimeout(() => { patch({ mode: 'play', q: null }); saveLocal(); if (done >= WARMUP_N) { voice('Warm-up done. Now the tower.'); setTimeout(() => startFloorsPhaseRef.current(), 900); } else { voice(first ? 'Good.' : 'Got it.'); setTimeout(() => openProblem(null, 'warmup'), 900); } }, 500);
      } else {
        recordTopic(q.topic, first); const done = s.debriefDone + 1; patch({ debriefDone: done });
        setTimeout(() => { patch({ mode: 'play', q: null }); saveLocal(); if (done >= DEBRIEF_N && (elapsedMin() >= DEBRIEF_UNTIL_MIN || done >= DEBRIEF_MAX)) finishDay(); else { voice(first ? 'That is one you missed earlier, and now you own it.' : 'Better every time.'); setTimeout(() => openProblem(null, 'debrief'), 900); } }, 500);
      }
    } else {
      const tries = s.tries + 1; Music.sfx('soft'); const lvl = Math.min(3, tries);
      patch({ tries, typed: '', answerState: 'shake', misses: tries === 1 ? [...s.misses, q.kind] : s.misses, workOpen: true, hintLevel: lvl });
      setTimeout(() => patch({ answerState: 'idle' }), 350);
      voice((lvl === 1 ? 'Not yet. ' : lvl === 2 ? 'Almost. ' : 'Let me show you. ') + q.hints[lvl - 1]);
    }
  }, [patch, saveLocal, voice, openProblem, finishDay]);

  // ---------------- phases ----------------
  const showIntro = useCallback((title: string, text: string, sayText: string, btn: string, onGo: () => void) => {
    patch({ mode: 'intro', intro: { title, text, sayText, btn, onGo: () => { stop(); patch({ intro: null }); onGo(); } } }); voice(sayText);
  }, [patch, voice]);

  const startWarmup = useCallback(() => {
    setPhase('warmup'); patch({ warmupDone: 0, room: null }); Music.start(ref.current.worldIdx, hash32(ref.current.date + 'warm'));
    showIntro('Warm-up', 'Four quick ones on the board before the tower. Type your answer. The work board is right there if you want it.', `Let's warm up first, ${KID_NAME}. Four problems, no rush. Then the tower.`, 'Start warm-up', () => { patch({ mode: 'play' }); openProblem(null, 'warmup'); });
  }, [setPhase, patch, showIntro, openProblem]);

  const startFloorsPhase = useCallback(() => {
    setPhase('floors'); const s = ref.current; const w = WORLDS[s.worldIdx];
    showIntro(`${w.n} · Floor ${s.floorIdx}`, `Walk to a lock and solve it to open the door. Crates hold bonus gems. Find the stairs to clear the room.${s.floorIdx === 2 ? ` ${w.vil} has locked the stairs with three vault locks.` : ''}`, `Here we go, ${w.n}. Tap where you want to walk. When you reach a lock, I will read it to you.`, 'Enter', () => startRoom(false));
  }, [setPhase, showIntro, startRoom]);
  startFloorsPhaseRef.current = startFloorsPhase;

  const startBonus = useCallback(() => {
    setPhase('bonus'); patch({ roomIdx: ref.current.roomIdx + 1 });
    showIntro('Bonus room', 'Crates everywhere. Each one is a quick fact, and each one pays double gems. Open as many as you want, then take the stairs.', 'Bonus room! These crates are quick ones, and they pay double. Grab what you can.', 'Open it', () => startRoom(true));
  }, [setPhase, patch, showIntro, startRoom]);
  startBonusRef.current = startBonus;

  function startBreak() {
    setPhase('break'); patch({ room: null, mode: 'break', breakLeft: 5 * 60 }); Music.stop();
    voice(`Stretch break, ${KID_NAME}. Stand up, shake it out, drink some water. I will call you back in five minutes.`);
    if (breakTimer.current) clearInterval(breakTimer.current);
    breakTimer.current = window.setInterval(() => { const left = ref.current.breakLeft - 1; patch({ breakLeft: left }); if (left <= 0) endBreak(); }, 1000);
  }
  function endBreak() { if (breakTimer.current) clearInterval(breakTimer.current); breakTimer.current = null; startBonusRef.current(); }
  const skipBreak = useCallback(() => endBreak(), []);

  const startDebrief = useCallback(() => {
    setPhase('debrief'); patch({ room: null, debriefDone: 0 }); Music.start(ref.current.worldIdx, hash32(ref.current.date + 'debrief'));
    const n = ref.current.misses.length;
    showIntro('Hero debrief', n ? 'A few problems like the ones that gave you trouble today. Show them who is boss.' : 'A few last problems to finish strong.', n ? `Last thing, ${KID_NAME}. A few problems like the ones that tricked you today. This time, you know the moves.` : `Last few, ${KID_NAME}. Finish strong.`, 'Start', () => { patch({ mode: 'play' }); openProblem(null, 'debrief'); });
  }, [setPhase, patch, showIntro, openProblem]);
  startDebriefRef.current = startDebrief;

  const resumePhase = useCallback((savedRoom: any) => {
    const s = ref.current; setPhase(s.phase);
    if (s.phase === 'warmup') { if (s.warmupDone >= WARMUP_N) startFloorsPhase(); else { patch({ mode: 'play' }); Music.start(s.worldIdx, hash32(s.date + 'warm')); openProblem(null, 'warmup'); } }
    else if (s.phase === 'floors' || s.phase === 'bonus') { if (savedRoom) restoreRoom(savedRoom); else startRoom(s.phase === 'bonus'); }
    else if (s.phase === 'break') startBonus();
    else if (s.phase === 'debrief') { if (s.debriefDone >= DEBRIEF_N && (elapsedMin() >= DEBRIEF_UNTIL_MIN || s.debriefDone >= DEBRIEF_MAX)) finishDay(); else { patch({ mode: 'play' }); openProblem(null, 'debrief'); } }
    else startWarmup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPhase, patch, startFloorsPhase, openProblem, restoreRoom, startRoom, startBonus, finishDay, startWarmup]);

  const savedRoomRef = useRef<any>(null);
  const leaveHQ = useCallback(() => {
    stop(); const s = ref.current;
    if (s.resumePhase && s.resumePhase !== 'hq') { const rp = s.resumePhase; patch({ phase: rp, resumePhase: null, mode: 'play' }); setTimeout(() => resumePhase(savedRoomRef.current), 0); return; }
    patch({ resumePhase: null }); startWarmup();
  }, [patch, resumePhase, startWarmup]);

  // ---------------- room input ----------------
  const tapTile = useCallback((c: number, r: number) => {
    const s = ref.current; const rm = s.room; if (s.mode !== 'play' || !rm) return;
    const ch = tileAt(rm, c, r); if (ch === '#') return; const h = rm.hero;
    if (isLockCh(ch) && !rm.opened.has(key(c, r))) {
      if (Math.abs(h.c - c) + Math.abs(h.r - r) === 1) { openProblem({ c, r, ch }); return; }
      const p = bfs(rm, { c: h.c, r: h.r }, (n) => Math.abs(n.c - c) + Math.abs(n.r - r) === 1);
      if (p) { rm.path = p.slice(1); rm.pending = { c, r, ch }; patch({ sel: key(c, r), roomTick: s.roomTick + 1 }); } else Music.sfx('soft');
      return;
    }
    const p = bfs(rm, { c: h.c, r: h.r }, (n) => n.c === c && n.r === r);
    if (p) { rm.path = p.slice(1); rm.pending = null; patch({ sel: null, roomTick: s.roomTick + 1 }); } else Music.sfx('soft');
  }, [patch, openProblem]);

  // ---------------- game loop: walking + clock ----------------
  useEffect(() => {
    let raf = 0; let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const s = ref.current;
      // clock (ticks only while something is happening; pauses in hq/done)
      if (s.mode !== 'boot' && s.mode !== 'hq' && s.mode !== 'done' && !s.completed) {
        const nowMs = Date.now(); const delta = Math.min(5000, nowMs - lastTick.current); lastTick.current = nowMs;
        if (delta > 0) { const next = s.elapsedMs + delta; if (Math.floor(next / 1000) !== Math.floor(s.elapsedMs / 1000)) patch({ elapsedMs: next }); else ref.current.elapsedMs = next; }
      } else lastTick.current = Date.now();
      const rm = s.room;
      if (rm && s.mode === 'play' && rm.path.length) {
        rm.walkT += dt * 7;
        if (rm.walkT >= 1) {
          rm.walkT = 0; const n = rm.path.shift()!; rm.hero.c = n.c; rm.hero.r = n.r; rm.hero.x = n.c; rm.hero.y = n.r; Music.sfx('step');
          for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) if (Math.abs(dr) + Math.abs(dc) <= 2) rm.seen.add(key(n.c + dc, n.r + dr));
          const ch = tileAt(rm, n.c, n.r);
          if (ch === 'G' && !rm.opened.has(key(n.c, n.r))) { rm.opened.add(key(n.c, n.r)); patch({ gemsToday: s.gemsToday + 3 }); burst(n.c, n.r, C.cyan, 22); float(n.c, n.r, '+3 ◆', C.cyan); Music.sfx('gem'); saveLocal(); }
          if (ch === 'E') { rm.path = []; setTimeout(roomCleared, 300); }
          if (!rm.path.length && rm.pending) { const pd = rm.pending; rm.pending = null; if (!rm.opened.has(key(pd.c, pd.r))) setTimeout(() => openProblem(pd), 120); }
          if (!rm.path.length) saveLocal();
          patch({ roomTick: ref.current.roomTick + 1 });
        } else { const n = rm.path[0]; rm.hero.x = rm.hero.c + (n.c - rm.hero.c) * rm.walkT; rm.hero.y = rm.hero.r + (n.r - rm.hero.r) * rm.walkT; patch({ roomTick: ref.current.roomTick + 1 }); }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [patch, saveLocal, roomCleared, openProblem]);

  // ---------------- boot ----------------
  useEffect(() => {
    (async () => {
      const date = ref.current.date;
      let state: any = null;
      try { const r = await rpc('ha_tower_get_state', { p_child_id: CHILD_ID, p_season: SEASON }); state = r.ok ? await r.json() : null; } catch { state = null; }
      const progress: Progress = (state && state.progress) || { gems: 0, crown: [], floors: [], gadgets: {}, floor_idx: 1, game_days: 0, world_idx: 0, locks_total: 0, first_try_total: 0 };
      let weakKinds = [...new Set(((state && state.weak_topics) || []).map((t: { topic_id: string }) => weakKindFromTopic(t.topic_id)).filter(Boolean))] as Kind[]; if (!weakKinds.length) weakKinds = ['add2r'];
      let worldIdx = Math.min(WORLDS.length - 1, progress.world_idx || 0), floorIdx = progress.floor_idx || 1;
      const saved = loadLocal(date);
      const p: Partial<TowerState> = { progress, weakKinds, worldIdx, floorIdx, mode: 'hq' };
      if (saved && saved.v === 1) {
        Object.assign(p, { phase: saved.phase, elapsedMs: saved.elapsedMs || 0, completed: !!saved.completed, roomIdx: saved.roomIdx || 0, twist: saved.twist || 'none', gemsToday: saved.gemsToday || 0, locksToday: saved.locksToday || 0, firstTryToday: saved.firstTryToday || 0, assistedToday: saved.assistedToday || 0, boardToday: saved.boardToday || 0, misses: saved.misses || [], topics: saved.topics || {}, warmupDone: saved.warmupDone || 0, debriefDone: saved.debriefDone || 0, resumePhase: saved.phase || 'hq' });
        if (typeof saved.worldIdx === 'number') { p.worldIdx = saved.worldIdx; p.floorIdx = saved.floorIdx || 1; }
        savedRoomRef.current = saved.room || null;
      } else {
        const gd = progress.game_days || 0; const pool = TWISTS.filter((t) => gd >= t.from); const rng = mulberry(hash32(CHILD_ID + date + 'twist'));
        p.twist = gd === 0 ? 'none' : pool[Math.floor(rng() * pool.length)].id;
      }
      lastTick.current = Date.now();
      patch(p);
      if (p.completed) { patch({ mode: 'done', doneSummary: { stars: 0, rank: RANKS[rankFor(progress.first_try_total)].n, say: `Game Day is already done today, ${KID_NAME}. See you Thursday!` } }); return; }
      // HQ greeting
      const s2 = { ...ref.current, ...p }; const w = WORLDS[s2.worldIdx!];
      const resumed = !!(s2.resumePhase && s2.resumePhase !== 'hq');
      const line = resumed ? `Welcome back, ${KID_NAME}. You have ${Math.max(0, TOTAL_MIN - Math.floor((s2.elapsedMs || 0) / MIN))} minutes of Game Day left. Let's pick up where you were.`
        : `Happy Game Day, ${KID_NAME}! Today we climb ${w.n}, floor ${s2.floorIdx}. ${s2.floorIdx === 2 ? w.vil + ' is waiting at the stairs. ' : ''}There is no clock on any lock. Take your time, and use the work board whenever you like.`;
      voice(line);
    })();
    const onHide = () => { if (document.visibilityState === 'hidden') saveLocal(); lastTick.current = Date.now(); };
    document.addEventListener('visibilitychange', onHide); window.addEventListener('pagehide', saveLocal);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', saveLocal); stop(); Music.stop(); if (breakTimer.current) clearInterval(breakTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMute = useCallback(() => { const m = !ref.current.muted; ttsSetMuted(m); patch({ muted: m }); }, [patch]);
  const toggleMusic = useCallback(() => { patch({ musicOn: Music.toggle() }); }, [patch]);
  const exit = useCallback(() => { saveLocal(); stop(); Music.stop(); window.location.href = '/'; }, [saveLocal]);

  return { state, leaveHQ, tapTile, typeDigit, check, toggleWork, askRalphie, readAgain, skipBreak, toggleMute, toggleMusic, exit, elapsedMin };
}
