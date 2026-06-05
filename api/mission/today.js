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
};

// Zone catalog. `subject` aligns with MD MCCRS / CCSS 2nd-grade content areas.
const ZONES = [
  { id: 'word-tower',  subject: 'reading',  label: 'Word Tower',         learn: true,  emoji: '📖' },
  { id: 'story-time',  subject: 'reading',  label: 'Story Time',         learn: true,  emoji: '📚' },
  { id: 'number-lab',  subject: 'math',     label: 'Number Lab',         learn: true,  emoji: '🔢' },
  { id: 'discovery',   subject: 'science',  label: 'Discovery Dome',     learn: true,  emoji: '🔬' },
  { id: 'explorer',    subject: 'social',   label: "Explorer's Hall",    learn: true,  emoji: '🌍' },
  { id: 'writing',     subject: 'writing',  label: 'Story Lab',          learn: true,  emoji: '✍️' },
  { id: 'hero-hall',   subject: 'trophy',   label: 'Hero Hall',          learn: false, emoji: '🏆' },
];

// Canonical daily plan (Maryland 2nd-grade homeschool block, 72 min total).
// `slot` is the semantic role; subject is the content area; zone_id is the
// concrete in-app destination. Each entry has a base minute count which the
// generator can adjust slightly (e.g. homework day bumps math).
const DAILY_PLAN = [
  { slot: 'warmup',  subject: 'reading',  zone_id: 'word-tower', base_minutes: 8  },
  { slot: 'math',    subject: 'math',     zone_id: 'number-lab', base_minutes: 18 },
  { slot: 'reading', subject: 'reading',  zone_id: 'story-time', base_minutes: 12 },
  { slot: 'writing', subject: 'writing',  zone_id: 'writing',    base_minutes: 12 },
  { slot: 'science', subject: 'science',  zone_id: 'discovery',  base_minutes: 10 },
  { slot: 'social',  subject: 'social',   zone_id: 'explorer',   base_minutes: 10 },
  { slot: 'win',     subject: 'trophy',   zone_id: 'hero-hall',  base_minutes: 2  },
];

const TARGET_TOTAL_MINUTES = 72;

const UNLOCK_HINTS = [
  'Finish all the steps and unlock a surprise from the Squad!',
  'Crush the full day and Ms. Humphrey will celebrate with you.',
  'Complete every subject to grow your hero level!',
  'Five subjects, one heroic day — let’s go!',
];

// Reward character is picked from the stretch (math) zone — the day's real work.
const REWARD_CHARACTER_FOR_ZONE = {
  'number-lab': 'aurora',
  'word-tower': 'webly',
  'story-time': 'aurora',
  'discovery':  'carlo',
  'explorer':   'shellback-squad',
  'writing':    'aurora',
  'hero-hall':  'toybox-team',
};
const REWARD_FALLBACK = 'aurora';

function rewardCharacterForMission(m) {
  if (!m) return REWARD_FALLBACK;
  const stretchZone = m.stretch && m.stretch.zone_id;
  return REWARD_CHARACTER_FOR_ZONE[stretchZone] || REWARD_FALLBACK;
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

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  let mission;
  if (ANTHROPIC_KEY) {
    try {
      mission = await generateWithHaiku({
        ANTHROPIC_KEY, dayName, zoneProgress, recentZones, homeworkDue, homeworkTopic,
        skipZones, focusSkill, parentNotes,
      });
    } catch (e) {
      mission = null;
    }
  }
  if (!mission) {
    mission = fallbackMission({ dayName, zoneProgress, homeworkDue, skipZones, focusSkill });
  }

  // Validate, patch, and synthesize backward-compat anchors.
  mission = validateAndPatch(mission, { skipZones, focusSkill, homeworkDue });

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

async function generateWithHaiku({ ANTHROPIC_KEY, dayName, zoneProgress, recentZones, homeworkDue, homeworkTopic, skipZones, focusSkill, parentNotes }) {
  const skipSet = skipZones || new Set();

  // Derive the plan after skips — anything the parent excluded today drops out.
  const plan = DAILY_PLAN.filter((s) => !skipSet.has(s.zone_id));

  // Apply homework-day adjustment to math slot before sending to Haiku.
  let mathSlot = plan.find((s) => s.slot === 'math');
  if (mathSlot && homeworkDue) {
    mathSlot = { ...mathSlot, base_minutes: 22 };
  }
  const planForPrompt = plan.map((s) => s.slot === 'math' && mathSlot ? mathSlot : s);

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

  // The strongest instructions (RULES + JSON shape) go LAST. Lesson from
  // Build #2 v3: Haiku weights recency in the system prompt heavily.
  const systemPrompt = [
    'You are Ms. Humphrey designing today\'s 72-minute homeschool mission for Nigel — 7 years old, 2nd grade, Maryland.',
    '',
    'Maryland homeschool law (COMAR 13A.10.01.01) requires daily instruction across all academic subjects: reading, math, writing, science, and social studies. Today\'s plan is FIXED in structure — your job is to write the title and one-sentence blurb for each step that fits Nigel\'s mood, day of the week, and zone progress.',
    '',
    'The fixed plan (do NOT reorder, do NOT add or remove steps, do NOT change zone_id or minutes):',
    JSON.stringify(planForPrompt, null, 2),
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
    '  1. Output ONE step per item in the fixed plan above, in the SAME ORDER.',
    '  2. Each blurb is ONE short sentence written TO Nigel ("Practice your ch- words with Webly."), max 100 chars.',
    '  3. Each title is the zone\'s friendly label OR a short variant ("Math Time", "Reading Adventure") — max 24 chars.',
    '  4. The math step blurb MUST acknowledge homework when homework_due is true ("Knock out today\'s homework, hero.").',
    '  5. The win step blurb is a quick celebration line ("You did it — go see your hero gallery!").',
    '  6. Output strictly valid JSON, nothing else. No markdown, no prose, no code fences.',
    '',
    'OUTPUT JSON SHAPE — copy this exact structure with steps in the exact order from the plan above:',
    '{',
    '  "steps": [',
    '    { "slot": "warmup",  "subject": "reading", "zone_id": "word-tower", "title": "Word Tower",     "blurb": "...", "minutes": 8  },',
    '    { "slot": "math",    "subject": "math",    "zone_id": "number-lab", "title": "Number Lab",     "blurb": "...", "minutes": 18 },',
    '    { "slot": "reading", "subject": "reading", "zone_id": "story-time", "title": "Story Time",     "blurb": "...", "minutes": 12 },',
    '    { "slot": "writing", "subject": "writing", "zone_id": "writing",    "title": "Story Lab",      "blurb": "...", "minutes": 12 },',
    '    { "slot": "science", "subject": "science", "zone_id": "discovery",  "title": "Discovery Dome", "blurb": "...", "minutes": 10 },',
    '    { "slot": "social",  "subject": "social",  "zone_id": "explorer",   "title": "Explorer\'s Hall","blurb": "...", "minutes": 10 },',
    '    { "slot": "win",     "subject": "trophy",  "zone_id": "hero-hall",  "title": "Hero Hall",      "blurb": "...", "minutes": 2  }',
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

function fallbackMission({ dayName, zoneProgress, homeworkDue, skipZones, focusSkill }) {
  const skipSet = skipZones || new Set();
  const plan = DAILY_PLAN.filter((s) => !skipSet.has(s.zone_id));

  const blurbs = {
    warmup:  'Warm up with some words you already love.',
    math:    homeworkDue ? "Knock out today's homework, hero." : "Today's math challenge — take your time.",
    reading: 'Read a story with Ms. Humphrey and Ralphie.',
    writing: 'Build a story in Story Lab — pick a path!',
    science: 'A new science card is waiting in the Dome.',
    social:  'Explore a place on the map — discover something new.',
    win:     'You did it — go see your hero gallery!',
  };

  // Apply focus_skill — bumps relevant blurb.
  const focusZone = focusSkill && SKILL_TO_ZONE[focusSkill];
  if (focusZone && SKILL_LABELS[focusSkill]) {
    if (focusZone === 'number-lab')   blurbs.math    = "Today's focus: " + SKILL_LABELS[focusSkill] + '.';
    if (focusZone === 'word-tower')   blurbs.warmup  = "Today's focus: " + SKILL_LABELS[focusSkill] + '.';
    if (focusZone === 'writing')      blurbs.writing = "Today's focus: " + SKILL_LABELS[focusSkill] + '.';
  }

  const steps = plan.map((s) => {
    const z = ZONES.find((zz) => zz.id === s.zone_id) || {};
    return {
      slot: s.slot,
      subject: s.subject,
      zone_id: s.zone_id,
      title: z.label || s.zone_id,
      blurb: blurbs[s.slot] || '',
      minutes: (s.slot === 'math' && homeworkDue) ? 22 : s.base_minutes,
    };
  });

  return {
    steps: steps,
    unlock_hint: UNLOCK_HINTS[new Date().getDate() % UNLOCK_HINTS.length],
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

  // If Haiku omitted steps, derive from fallback shape.
  if (!Array.isArray(m.steps) || m.steps.length === 0) {
    const fb = fallbackMission({ zoneProgress: {}, homeworkDue, skipZones: skipSet, focusSkill: opts.focusSkill });
    m.steps = fb.steps;
    if (!m.unlock_hint) m.unlock_hint = fb.unlock_hint;
  }

  const zonePool = new Set(ZONES.map((z) => z.id));
  const planBySlot = {};
  DAILY_PLAN.forEach((p) => { planBySlot[p.slot] = p; });

  // Walk each step, repair zone_id/title/minutes, enforce skip rules.
  const cleanSteps = [];
  m.steps.forEach((step) => {
    if (!step || typeof step !== 'object') return;
    const slot = step.slot;
    const planEntry = planBySlot[slot];
    if (!planEntry) return;                            // unknown slot — drop
    if (skipSet.has(planEntry.zone_id)) return;        // parent skipped

    // Force zone_id to the canonical one for this slot (Haiku can't reassign).
    const zoneId = planEntry.zone_id;
    if (!zonePool.has(zoneId)) return;
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

    cleanSteps.push({
      slot,
      subject: planEntry.subject,
      zone_id: zoneId,
      title,
      blurb,
      minutes,
    });
  });

  // If we lost so many steps that nothing's left, restore the fallback.
  if (cleanSteps.length === 0) {
    const fb = fallbackMission({ zoneProgress: {}, homeworkDue, skipZones: skipSet, focusSkill: opts.focusSkill });
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
