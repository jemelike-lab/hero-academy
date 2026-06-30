/**
 * Hero Academy — Today's Mission generator (v2, 72-min all-subjects shape).
 *
 * POST /api/mission/today
 * Body: { day_of_week, day_name, zone_progress, recent_zones, homework_due, homework_topic }
 *
 * Returns:
 * {
 *   // NEW shape — flexible N-step array. Client renders this if present.
 *   steps: [
 *     { slot, subject, zone_id, title, blurb, minutes },
 *     ...
 *   ],
 *
 *   // Backward-compat anchors for the existing ha_record_mission RPC, which
 *   // expects p_warmup / p_stretch / p_win JSONB. We synthesize them from steps:
 *   //   warmup  = first step
 *   //   stretch = the math step (or longest learning step if no math)
 *   //   win     = last step
 *   warmup, stretch, win,
 *
 *   total_minutes: number,            // target 72
 *   unlock_hint: string,
 *   reward_character_key: string,     // picked from the stretch zone
 * }
 *
 * Targets a 72-minute homeschool day across ALL FIVE academic subjects:
 *   reading, math, writing, science, social studies — plus a celebration win.
 * Pedagogically modeled on a 2nd-grade MD/CCSS daily block.
 */

const HAIKU_MODEL = 'claude-haiku-4-5';

// Build #5 v2: parent directives. Service-role read of ha_active_directives.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const NIGEL_ID = '2e0e51c5-f120-4152-8aa1-041eeecc8165';

// focus_skill payload key -> zone where that skill lives.
const SKILL_TO_ZONE = {
  'add_within_10':      'number-lab',
  'add_within_20':      'number-lab',
  'subtract_within_10': 'number-lab',
  'subtract_within_20': 'number-lab',
  'make_10':            'number-lab',
  'place_value':        'number-lab',
  'reading_fluency':    'word-tower',
  'sight_words':        'word-tower',
  'writing_sentences':  'writing',
  'handwriting':        'letter-lab',
};

const SKILL_LABELS = {
  'add_within_10':      'addition within 10',
  'add_within_20':      'addition within 20',
  'subtract_within_10': 'subtraction within 10',
  'subtract_within_20': 'subtraction within 20',
  'make_10':            'the make-a-10 strategy',
  'place_value':        'place value',
  'reading_fluency':    'reading fluency',
  'sight_words':        'sight words',
  'writing_sentences':  'writing complete sentences',
  'handwriting':        'forming letters and numbers',
};

// Zone catalog. `subject` aligns with MD MCCRS / CCSS 2nd-grade content areas.
// All ten learning zones the home page actually surfaces, plus the win zone.
// Class-time and hero-hall are intentionally not selectable as learning slots
// (class-time is its own daily lesson card; hero-hall is the celebration).
const ZONES = [
  { id: 'word-tower',  subject: 'reading',  label: 'Word Tower',         learn: true,  emoji: '📖' },
  { id: 'story-time',  subject: 'reading',  label: 'Story Time',         learn: true,  emoji: '📚' },
  { id: 'number-lab',  subject: 'math',     label: 'Cauldron Café',      learn: true,  emoji: '🧪' },
  { id: 'discovery',   subject: 'science',  label: 'Discovery Dome',     learn: true,  emoji: '🔬' },
  { id: 'explorer',    subject: 'social',   label: "Explorer's Hall",    learn: true,  emoji: '🌍' },
  { id: 'writing',     subject: 'writing',  label: 'Story Lab',          learn: true,  emoji: '✍️' },
  { id: 'letter-lab',  subject: 'writing',  label: 'Letter Lab',         learn: true,  emoji: '✏️' },
  { id: 'sound-stage', subject: 'music',    label: 'Sound Stage',        learn: true,  emoji: '🎵' },
  { id: 'creation',    subject: 'art',      label: 'Creation Studio',    learn: true,  emoji: '🎨' },
  { id: 'gym',         subject: 'pe',       label: 'Training Gym',       learn: true,  emoji: '💪' },
  { id: 'hero-hall',   subject: 'trophy',   label: 'Hero Hall',          learn: false, emoji: '🏆' },
];

// Canonical daily plan (Maryland 2nd-grade homeschool block, ~72-80 min total).
// `slot` is the semantic role; `candidates` is the pool of zones that can fill
// that slot. The generator picks one candidate per slot per day using a
// deterministic rotation + recent_zones avoidance so the same zone doesn't
// dominate the week.
//
// Why this exists: prior versions hardcoded one zone per slot, producing the
// same 6 zones every day with day-of-year shifting which 3 the client showed.
// Result: a period-6 rotation Nigel had memorized in a week. The new pool model
// turns the writing slot into a story-lab/letter-lab rotation, adds an
// `enrich` slot that rotates through music/art/PE, and lets the warmup &
// reading slots cross-pollinate so the day genuinely varies.
const DAILY_PLAN = [
  { slot: 'warmup',  subject: 'reading', candidates: ['word-tower', 'story-time'],         base_minutes: 8  },
  { slot: 'math',    subject: 'math',    candidates: ['number-lab'],                       base_minutes: 18 },
  { slot: 'reading', subject: 'reading', candidates: ['story-time', 'word-tower'],         base_minutes: 12 },
  { slot: 'writing', subject: 'writing', candidates: ['writing', 'letter-lab'],            base_minutes: 12 },
  { slot: 'science', subject: 'science', candidates: ['discovery'],                        base_minutes: 10 },
  { slot: 'social',  subject: 'social',  candidates: ['explorer'],                         base_minutes: 10 },
  { slot: 'enrich',  subject: 'enrich',  candidates: ['sound-stage', 'creation', 'gym'],   base_minutes: 8  },
  { slot: 'win',     subject: 'trophy',  candidates: ['hero-hall'],                        base_minutes: 2  },
];

const TARGET_TOTAL_MINUTES = 80;

// Slot -> subject the chosen candidate should map to. Used when a candidate
// can sit in slots of different subjects (e.g. word-tower as warmup vs reading).
const SLOT_SUBJECT_OVERRIDE = {
  warmup:  'reading',
  reading: 'reading',
  writing: 'writing',
  enrich:  null,    // inherit from the picked zone's natural subject
};

const UNLOCK_HINTS = [
  'Finish all the steps and unlock a surprise from the Squad!',
  'Crush the full day and Ms. Humphrey will celebrate with you.',
  'Complete every subject to grow your hero level!',
  'Five subjects, one heroic day — let’s go!',
  'Stack up the steps and a new Squad pal might show up!',
  'Big brain energy today — finish strong, hero.',
  'Every step makes you a little bit stronger, smarter, braver.',
  'Surprise the Squad: knock out all the steps before lunch.',
  'You vs. the mission — and you’re winning already.',
  'Three subjects, three wins, one hero (that’s you).',
  'Move your body, stretch your brain, finish the day proud.',
  'Today’s rotation has something new — find it!',
];

// Reward character is picked from the stretch (math) zone — the day's real work.
const REWARD_CHARACTER_FOR_ZONE = {
  'number-lab': 'aurora',
  'word-tower': 'webly',
  'story-time': 'aurora',
  'discovery':  'carlo',
  'explorer':   'shellback-squad',
  'writing':    'aurora',
  'letter-lab': 'webly',
  'sound-stage':'toybox-team',
  'creation':   'toybox-team',
  'gym':        'carlo',
  'hero-hall':  'toybox-team',
};
const REWARD_FALLBACK = 'aurora';

function rewardCharacterForMission(m) {
  if (!m) return REWARD_FALLBACK;
  const stretchZone = m.stretch && m.stretch.zone_id;
  return REWARD_CHARACTER_FOR_ZONE[stretchZone] || REWARD_FALLBACK;
}

// ---------------------------------------------------------------------------
// Per-slot zone picker
// ---------------------------------------------------------------------------
//
// Deterministic, per-day rotation across each slot's candidate pool, with a
// recency penalty so zones Nigel just played slide to the back of the line.
// The pool order itself is the natural priority (first candidate in
// DAILY_PLAN[slot].candidates is the "default" choice); the rotation rotates
// the priority forward by `dayIndex` so a different candidate leads each day.
//
// Why deterministic-per-day: the mission is cached client-side under today's
// date key, so the choice must be stable for the whole day. A new day produces
// a new rotation index.
function dayIndexFromKey(dateKey) {
  // dateKey is YYYY-MM-DD. Use a UTC-stable day number so the choice is
  // consistent across the user's day even if Vercel's clock drifts past midnight
  // while the page is still loaded.
  if (!dateKey || typeof dateKey !== 'string') {
    const now = new Date();
    dateKey = now.toISOString().slice(0, 10);
  }
  const [y, m, d] = dateKey.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return 0;
  // Days since the project's epoch (Jan 1 2026). Stable, monotonically
  // increasing integer.
  const epoch = Date.UTC(2026, 0, 1);
  const today = Date.UTC(y, m - 1, d);
  return Math.max(0, Math.floor((today - epoch) / 86400000));
}

function pickZoneForSlot(slot, opts) {
  opts = opts || {};
  const planEntry = (DAILY_PLAN.find((p) => p.slot === slot)) || null;
  if (!planEntry) return null;
  const skipSet = opts.skipZones || new Set();
  const recentZones = Array.isArray(opts.recentZones) ? opts.recentZones : [];
  const dayIndex = Number.isFinite(opts.dayIndex) ? opts.dayIndex : 0;
  const previousByZone = opts.previousByZone || {};   // zone_id -> true if already used in another slot today

  // Filter out skipped zones and already-used zones (don't put the same zone
  // in two slots on the same day).
  let pool = planEntry.candidates.filter((z) => !skipSet.has(z) && !previousByZone[z]);
  if (pool.length === 0) {
    // Allow re-use across slots only if everything is skipped/used.
    pool = planEntry.candidates.filter((z) => !skipSet.has(z));
  }
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];

  // Rotate the pool by dayIndex so each day a different candidate leads.
  // Add a per-slot offset so different slots don't all rotate in lockstep
  // (otherwise warmup and reading would always co-vary when both could pick
  // word-tower vs story-time).
  const slotOffset = stableHash(slot) % pool.length;
  const baseOffset = (dayIndex + slotOffset) % pool.length;
  const rotated = pool.slice(baseOffset).concat(pool.slice(0, baseOffset));

  // Push any zones in the recent_zones list to the back of the rotated order.
  // Nigel just played them — show him something else.
  const recentSet = new Set(recentZones);
  const fresh = rotated.filter((z) => !recentSet.has(z));
  const stale = rotated.filter((z) =>  recentSet.has(z));
  const ranked = fresh.concat(stale);

  return ranked[0];
}

function stableHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

// Pick every slot's zone for today. Returns a map slot -> zone_id, plus the
// subject the picked zone should be tagged with in the mission card.
function planForToday(opts) {
  opts = opts || {};
  const choices = {};      // slot -> { zone_id, subject }
  const usedZones = {};
  DAILY_PLAN.forEach((entry) => {
    const zone = pickZoneForSlot(entry.slot, {
      skipZones: opts.skipZones,
      recentZones: opts.recentZones,
      dayIndex: opts.dayIndex,
      previousByZone: usedZones,
    });
    if (!zone) return;
    usedZones[zone] = true;
    const subjectOverride = SLOT_SUBJECT_OVERRIDE.hasOwnProperty(entry.slot)
      ? SLOT_SUBJECT_OVERRIDE[entry.slot]
      : entry.subject;
    const zoneDef = ZONES.find((z) => z.id === zone) || null;
    const subject = subjectOverride || (zoneDef && zoneDef.subject) || entry.subject;
    choices[entry.slot] = { zone_id: zone, subject };
  });
  return choices;
}

// ---------------------------------------------------------------------------
// Parent directives (Build #5 v2)
// ---------------------------------------------------------------------------

async function fetchActiveDirectives() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/ha_active_directives', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ p_child_id: NIGEL_ID }),
    });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j) ? j : [];
  } catch (_) {
    return [];
  }
}

function classifyDirectives(directives) {
  const todayISO = new Date().toISOString().slice(0, 10);
  const skipZones = new Set();
  let focusSkill = null;
  const parentNotes = [];
  for (const d of (directives || [])) {
    const p = d.payload || {};
    if (d.directive_type === 'skip_zone_today') {
      const payloadDate = p.date || todayISO;
      if (payloadDate === todayISO && p.zone) skipZones.add(p.zone);
    } else if (d.directive_type === 'focus_skill') {
      if (!focusSkill && p.skill) focusSkill = p.skill;
    } else if (d.directive_type === 'note_for_humphrey') {
      if (p.text) parentNotes.push({ text: String(p.text).slice(0, 300), by: d.created_by || 'parent' });
    }
  }
  return { skipZones, focusSkill, parentNotes };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  if (!body || typeof body !== 'object') body = {};

  const zoneProgress = body.zone_progress || {};
  const recentZones = Array.isArray(body.recent_zones) ? body.recent_zones : [];
  const dayName = String(body.day_name || dayNameFromNumber(body.day_of_week));
  const homeworkDue = !!body.homework_due;
  const homeworkTopic = body.homework_topic || null;

  const directives = await fetchActiveDirectives();
  const { skipZones, focusSkill, parentNotes } = classifyDirectives(directives);

  // Resolve a stable day index for today and pick today's zones up front.
  // Both Haiku and the fallback see the same chosen zones, so the mission
  // varies day-to-day regardless of which path produced it.
  const todayISO = new Date().toISOString().slice(0, 10);
  const dayIndex = dayIndexFromKey(todayISO);
  const slotChoices = planForToday({ skipZones, recentZones, dayIndex });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  let mission;
  if (ANTHROPIC_KEY) {
    try {
      mission = await generateWithHaiku({
        ANTHROPIC_KEY, dayName, zoneProgress, recentZones, homeworkDue, homeworkTopic,
        skipZones, focusSkill, parentNotes, slotChoices,
      });
    } catch (e) {
      mission = null;
    }
  }
  if (!mission) {
    mission = fallbackMission({ dayName, zoneProgress, homeworkDue, skipZones, focusSkill, slotChoices, dayIndex });
  }

  // Validate, patch, and synthesize backward-compat anchors.
  mission = validateAndPatch(mission, { skipZones, focusSkill, homeworkDue, slotChoices });

  return res.status(200).json(mission);
}

function dayNameFromNumber(n) {
  const names = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  if (typeof n === 'number' && n >= 0 && n <= 6) return names[n];
  return names[new Date().getDay()];
}

// ---------------------------------------------------------------------------
// Haiku generation (v2 — N-step shape, all-subjects)
// ---------------------------------------------------------------------------

async function generateWithHaiku({ ANTHROPIC_KEY, dayName, zoneProgress, recentZones, homeworkDue, homeworkTopic, skipZones, focusSkill, parentNotes, slotChoices }) {
  const skipSet = skipZones || new Set();
  const choices = slotChoices || {};

  // Build today's plan from the per-slot picks. Each plan entry tells Haiku
  // exactly which zone to talk about for that slot, with its slot label,
  // subject, minutes, and the zone's friendly label.
  const plan = DAILY_PLAN
    .map((p) => {
      const pick = choices[p.slot];
      if (!pick) return null;
      if (skipSet.has(pick.zone_id)) return null;
      const zoneDef = ZONES.find((z) => z.id === pick.zone_id);
      const baseMinutes = (p.slot === 'math' && homeworkDue) ? 22 : p.base_minutes;
      return {
        slot: p.slot,
        subject: pick.subject || p.subject,
        zone_id: pick.zone_id,
        zone_label: zoneDef ? zoneDef.label : pick.zone_id,
        minutes: baseMinutes,
      };
    })
    .filter(Boolean);

  const allowedZonesForBlurbs = ZONES
    .filter((z) => !skipSet.has(z.id))
    .map((z) => ({ id: z.id, label: z.label, subject: z.subject, progress_pct: zoneProgress[z.id] || 0 }));

  // Compose parent-directive context (omitted when no input).
  const parentLines = [];
  if (focusSkill && SKILL_LABELS[focusSkill]) {
    const targetZone = SKILL_TO_ZONE[focusSkill];
    parentLines.push(
      targetZone
        ? '  - PARENT FOCUS — emphasize ' + SKILL_LABELS[focusSkill] + ' in the ' + targetZone + ' step. Make that blurb specifically reference today\'s focus.'
        : '  - Parent wants extra focus on ' + SKILL_LABELS[focusSkill] + '.'
    );
  }
  if (skipSet.size > 0) {
    parentLines.push('  - Parent asked to skip these zones today (already removed from the plan): ' + Array.from(skipSet).join(', ') + '.');
  }
  if (parentNotes && parentNotes.length > 0) {
    parentNotes.slice(0, 3).forEach(function (n) {
      parentLines.push('  - Note from ' + n.by + ': "' + n.text + '" — weave the warmth of this into the warmup blurb if it fits naturally.');
    });
  }

  // Build the JSON shape example dynamically from today's plan so the model
  // doesn't lock onto stale zone_ids from a hand-written example.
  const shapeExample = plan.map((p) => (
    '    { "slot": "' + p.slot + '", "subject": "' + p.subject +
    '", "zone_id": "' + p.zone_id + '", "title": "' + (p.zone_label || p.zone_id) +
    '", "blurb": "...", "minutes": ' + p.minutes + ' }'
  )).join(',\n');

  const systemPrompt = [
    'You are Ms. Humphrey designing today\'s homeschool mission for Nigel — 7 years old, 2nd grade, Maryland.',
    '',
    'Maryland homeschool law (COMAR 13A.10.01.01) requires daily instruction across all academic subjects: reading, math, writing, science, and social studies. The system has already selected which zone fills each slot today (the selection rotates daily so Nigel sees variety). Your job is to write the title and one-sentence blurb for each step.',
    '',
    'TODAY\'S PLAN — the slot/zone_id/subject/minutes are FIXED. Do NOT reorder, add, remove, or change them. Write only title + blurb:',
    JSON.stringify(plan, null, 2),
    '',
    'Reference data — zones available and Nigel\'s current progress in each:',
    JSON.stringify(allowedZonesForBlurbs, null, 2),
    '',
    'Day: ' + dayName,
    'Homework due today: ' + (homeworkDue ? ('yes (topic: ' + (homeworkTopic || 'math') + ')') : 'no'),
    'Recently visited zones (newest first): ' + (recentZones.length ? recentZones.join(', ') : 'none'),
    '',
    parentLines.length > 0 ? 'Parent guidance for today (Bianca/Josh sent these via the co-pilot — respect them in the relevant blurbs):\n' + parentLines.join('\n') : '',
    '',
    '★★★ RULES — READ CAREFULLY ★★★',
    '  1. Output ONE step per item in TODAY\'S PLAN above, in the SAME ORDER. Copy slot/subject/zone_id/minutes EXACTLY as given.',
    '  2. Each blurb is ONE short sentence written TO Nigel ("Practice your ch- words with Webly."), max 100 chars.',
    '  3. Each title is the zone\'s friendly label OR a short variant — max 24 chars.',
    '  4. The math step blurb MUST acknowledge homework when homework_due is true ("Knock out today\'s homework, hero.").',
    '  5. The win step blurb is a quick celebration line ("You did it — go see your hero gallery!").',
    '  6. For the enrich slot, write a blurb that matches the picked zone (music = Sound Stage, art = Creation Studio, PE = Training Gym). Celebrate that today is a different kind of day — Nigel doesn\'t see this slot every day.',
    '  7. Output strictly valid JSON, nothing else. No markdown, no prose, no code fences.',
    '',
    'OUTPUT JSON SHAPE — copy this exact structure for today\'s plan:',
    '{',
    '  "steps": [',
    shapeExample,
    '  ],',
    '  "unlock_hint": "..."',
    '}',
  ].filter((l) => l !== '').join('\n');

  const userPrompt = 'Design today\'s mission blurbs. Return JSON only matching the OUTPUT JSON SHAPE.';

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 1400,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!r.ok) throw new Error('anthropic ' + r.status);
  const json = await r.json();
  const text = (json.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  return parsed;
}

// ---------------------------------------------------------------------------
// Fallback (when Haiku unavailable or invalid output)
// ---------------------------------------------------------------------------

function fallbackMission({ dayName, zoneProgress, homeworkDue, skipZones, focusSkill, slotChoices, dayIndex }) {
  const skipSet = skipZones || new Set();
  const choices = slotChoices || planForToday({ skipZones: skipSet, recentZones: [], dayIndex: dayIndex || 0 });

  // Blurb defaults keyed by chosen zone, with slot-level fallback. Each entry
  // has 2-4 lines that rotate by dayIndex so the fallback path also varies.
  const ZONE_BLURBS = {
    'word-tower': [
      'Climb the Word Tower — fluency reps with Webly.',
      'Stack new words and own your sight-word list.',
      'Quick reading reps to wake your brain up.',
    ],
    'story-time': [
      'Read a story aloud to Ms. Humphrey.',
      'Pick a story and bring the characters to life.',
      'Read with feeling — Ralphie\'s listening too.',
    ],
    'number-lab': [
      'Cook up math at Cauldron Café — count, add, serve!',
      'Take on today\'s math recipe with Ms. Humphrey.',
      'Sharpen your math brain at the Café.',
    ],
    'discovery': [
      'A new science card is waiting in the Dome.',
      'Investigate something cool with Carlo today.',
      'Explore a science mystery in the Dome.',
    ],
    'explorer': [
      'Explore a place on the map — discover something new.',
      'Travel somewhere new in Explorer\'s Hall.',
      'Find a new spot on the world map today.',
    ],
    'writing': [
      'Build a story in Story Lab — pick a path!',
      'Write your own adventure, hero.',
      'Story Lab time — make Ms. Humphrey laugh.',
    ],
    'letter-lab': [
      'Practice letters and numbers with Ms. Humphrey.',
      'Draw your best letters today — slow and steady.',
      'Strong handwriting starts here.',
    ],
    'sound-stage': [
      'Music time! Step onto the Sound Stage.',
      'Feel the beat — Ms. Humphrey\'s studio is open.',
      'Play, sing, or jam in the Sound Stage today.',
    ],
    'creation': [
      'Make something cool in the Creation Studio.',
      'Art break! Draw, stamp, or animate today.',
      'Use your imagination in the Creation Studio.',
    ],
    'gym': [
      'Move your body in the Training Gym.',
      'Mind strong, body strong — Gym time, hero.',
      'Stretch, jump, and breathe at the Gym.',
    ],
    'hero-hall': [
      'You did it — go see your hero gallery!',
      'Victory lap! Check who joined the Squad.',
      'Hero Hall is calling — go celebrate.',
    ],
  };
  const SLOT_BLURBS = {
    warmup: 'Warm up with something you already love.',
    math: homeworkDue ? "Knock out today's homework, hero." : "Today's math challenge — take your time.",
    reading: 'Read a story with Ms. Humphrey.',
    writing: 'Writing time — get the pencil moving.',
    science: 'Investigate something new today.',
    social: 'Travel somewhere new on the map.',
    enrich: 'Switch it up — something different today.',
    win: 'You did it — go see your hero gallery!',
  };

  const blurbFor = (slot, zoneId, idx) => {
    if (slot === 'math' && homeworkDue) return "Knock out today's homework, hero.";
    const arr = ZONE_BLURBS[zoneId];
    if (Array.isArray(arr) && arr.length > 0) {
      return arr[(idx + (dayIndex || 0)) % arr.length];
    }
    return SLOT_BLURBS[slot] || '';
  };

  // Apply focus_skill — bumps relevant blurb override.
  const focusZone = focusSkill && SKILL_TO_ZONE[focusSkill];

  const steps = DAILY_PLAN
    .map((s, idx) => {
      const pick = choices[s.slot];
      if (!pick) return null;
      if (skipSet.has(pick.zone_id)) return null;
      const z = ZONES.find((zz) => zz.id === pick.zone_id) || {};
      let blurb = blurbFor(s.slot, pick.zone_id, idx);
      if (focusZone && focusZone === pick.zone_id && SKILL_LABELS[focusSkill]) {
        blurb = "Today's focus: " + SKILL_LABELS[focusSkill] + '.';
      }
      return {
        slot: s.slot,
        subject: pick.subject || s.subject,
        zone_id: pick.zone_id,
        title: z.label || pick.zone_id,
        blurb,
        minutes: (s.slot === 'math' && homeworkDue) ? 22 : s.base_minutes,
      };
    })
    .filter(Boolean);

  return {
    steps: steps,
    unlock_hint: UNLOCK_HINTS[((dayIndex || 0) + new Date().getDate()) % UNLOCK_HINTS.length],
  };
}

// ---------------------------------------------------------------------------
// Validation + backward-compat anchor synthesis
// ---------------------------------------------------------------------------

function validateAndPatch(m, opts) {
  if (!m || typeof m !== 'object') m = {};
  opts = opts || {};
  const skipSet = opts.skipZones || new Set();
  const homeworkDue = !!opts.homeworkDue;
  const slotChoices = opts.slotChoices || {};

  // If Haiku omitted steps, derive from fallback shape.
  if (!Array.isArray(m.steps) || m.steps.length === 0) {
    const fb = fallbackMission({ zoneProgress: {}, homeworkDue, skipZones: skipSet, focusSkill: opts.focusSkill, slotChoices });
    m.steps = fb.steps;
    if (!m.unlock_hint) m.unlock_hint = fb.unlock_hint;
  }

  const zonePool = new Set(ZONES.map((z) => z.id));
  const planBySlot = {};
  DAILY_PLAN.forEach((p) => { planBySlot[p.slot] = p; });

  // Walk each step, validate slot, accept any zone_id in the slot's candidate
  // pool (so Haiku is free to pick from the pool if it has a good reason),
  // and otherwise fall back to today's pre-chosen zone for that slot.
  const cleanSteps = [];
  m.steps.forEach((step) => {
    if (!step || typeof step !== 'object') return;
    const slot = step.slot;
    const planEntry = planBySlot[slot];
    if (!planEntry) return;                            // unknown slot — drop

    const candidates = planEntry.candidates || [];
    const todaysChoice = slotChoices[slot] ? slotChoices[slot].zone_id : null;

    // Pick the zone for this slot:
    //   1. Honor Haiku's choice if it's in the candidate pool and not skipped.
    //   2. Otherwise use today's pre-chosen zone for this slot.
    //   3. Otherwise the first non-skipped candidate.
    let zoneId = null;
    const haikuZone = (typeof step.zone_id === 'string') ? step.zone_id : null;
    if (haikuZone && candidates.indexOf(haikuZone) !== -1 && !skipSet.has(haikuZone)) {
      zoneId = haikuZone;
    } else if (todaysChoice && !skipSet.has(todaysChoice)) {
      zoneId = todaysChoice;
    } else {
      zoneId = candidates.find((z) => !skipSet.has(z)) || null;
    }
    if (!zoneId || !zonePool.has(zoneId)) return;
    const zone = ZONES.find((zz) => zz.id === zoneId);

    let minutes = Number(step.minutes);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 30) {
      minutes = planEntry.base_minutes;
    }
    if (slot === 'math' && homeworkDue && minutes < 18) minutes = 22;
    minutes = Math.round(minutes);

    let title = typeof step.title === 'string' && step.title.trim() ? step.title.trim() : (zone ? zone.label : zoneId);
    title = title.slice(0, 32);
    let blurb = typeof step.blurb === 'string' ? step.blurb.trim() : '';
    blurb = blurb.slice(0, 140);

    // Subject comes from the slot's natural override (warmup/reading/writing
    // are slot-typed; enrich and the rest inherit from the zone's subject).
    const slotSubjectOverride = SLOT_SUBJECT_OVERRIDE.hasOwnProperty(slot)
      ? SLOT_SUBJECT_OVERRIDE[slot]
      : planEntry.subject;
    const subject = slotSubjectOverride || (zone && zone.subject) || planEntry.subject;

    cleanSteps.push({
      slot,
      subject,
      zone_id: zoneId,
      title,
      blurb,
      minutes,
    });
  });

  // If we lost so many steps that nothing's left, restore the fallback.
  if (cleanSteps.length === 0) {
    const fb = fallbackMission({ zoneProgress: {}, homeworkDue, skipZones: skipSet, focusSkill: opts.focusSkill, slotChoices });
    m.steps = fb.steps;
  } else {
    m.steps = cleanSteps;
  }

  // Total minutes — sum of all steps.
  m.total_minutes = m.steps.reduce((sum, s) => sum + (s.minutes || 0), 0);

  // Synthesize backward-compat anchors for ha_record_mission RPC.
  //   warmup  = first step
  //   stretch = math step (or longest learning step if math was skipped)
  //   win     = last step
  m.warmup = pickAnchor(m.steps, ['warmup']) || m.steps[0];
  const mathStep = m.steps.find((s) => s.slot === 'math');
  if (mathStep) {
    m.stretch = mathStep;
  } else {
    // Longest non-win learning step
    const learning = m.steps.filter((s) => s.slot !== 'win' && s.slot !== 'warmup');
    learning.sort((a, b) => (b.minutes || 0) - (a.minutes || 0));
    m.stretch = learning[0] || m.steps[Math.floor(m.steps.length / 2)];
  }
  m.win = pickAnchor(m.steps, ['win']) || m.steps[m.steps.length - 1];

  // Strip extra fields from anchors (DB schema expects {zone_id,title,blurb,minutes}).
  m.warmup  = anchorShape(m.warmup);
  m.stretch = anchorShape(m.stretch);
  m.win     = anchorShape(m.win);

  if (typeof m.unlock_hint !== 'string' || !m.unlock_hint) {
    m.unlock_hint = UNLOCK_HINTS[0];
  }
  m.unlock_hint = String(m.unlock_hint).slice(0, 160);

  m.reward_character_key = rewardCharacterForMission(m);
  return m;
}

function pickAnchor(steps, slots) {
  for (const slot of slots) {
    const found = steps.find((s) => s.slot === slot);
    if (found) return found;
  }
  return null;
}
function anchorShape(s) {
  if (!s) return null;
  return {
    zone_id: s.zone_id,
    title:   s.title,
    blurb:   s.blurb,
    minutes: s.minutes,
  };
}
