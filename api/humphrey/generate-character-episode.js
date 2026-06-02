/**
 * Hero Academy — Character episode generator.
 *
 *   POST /api/humphrey/generate-character-episode
 *   Body: { child_id, character_key, episode, force? }
 *
 * Generates a 3-4 sentence personalized story snippet for one of the Surprise
 * Squad characters at one of 3 episodes (meet, train, squad-ready). The
 * snippet is what Ms. Humphrey reads aloud when the kid earns that episode.
 *
 * Caching: episodes are cached per (child, character, episode). If the row
 * exists and force isn't set, returns the cached story.
 *
 * Env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { readFileSync } from 'fs';
import path from 'path';

const HAIKU_MODEL = 'claude-haiku-4-5';

// Character roster — keep in sync with js/characters.js. Only the bits Haiku
// needs to know to write a story snippet in voice.
const CHARACTERS = {
  'carlo': {
    name: 'Captain Carlo',
    title: 'the Cosmic Plumber',
    archetype: 'Tinkerer · Fixer',
    bio: 'A beaver in red overalls with goggles and a gear belt. Builds and fixes anything across the cosmos.',
    flavor: 'gears, tools, fixing things, building, engineering, gadgets',
    domain: 'Discovery Dome (science)',
  },
  'aurora': {
    name: 'Aurora the Aviator',
    title: 'Hero of the High Skies',
    archetype: 'Hero · Announcer',
    bio: 'A great horned owl in a star-spangled cape. Swoops in to announce bonus rounds across every zone.',
    flavor: 'skies, soaring, brave announcements, bonus rounds, stars, leadership',
    domain: 'Number Lab (math) and all zones',
  },
  'shellback-squad': {
    name: 'The Shellback Squad',
    title: "Ralphie's four cousins",
    archetype: 'Friend Group',
    bio: 'Marbles the builder, Glow the scientist, Pebble the athlete, and Spark the artist. Four turtles, four personalities, one squad.',
    flavor: 'four cousins, friendship, teamwork, line-dancing, group entrances',
    domain: 'all zones',
  },
  'webly': {
    name: 'Webly Quickfoot',
    title: 'the Web-Slinger',
    archetype: 'Climber · Helper',
    bio: 'A cheerful jumping spider with sparkly webs. Swings in from corners to pass down bonuses from above.',
    flavor: 'webs, climbing, swinging, helping from above, sparkly threads',
    domain: 'Word Tower (reading)',
  },
  'toybox-team': {
    name: 'The Toybox Team',
    title: 'Living Toys',
    archetype: 'Win-Screen Crew',
    bio: 'Astro the space bear, Sheriff Sage the fox, Cogworth the robot, and Doodle the crayon dragon. Show up for victory celebrations.',
    flavor: 'toys come to life, victory parade, party, trophies, celebration',
    domain: 'Story Lab and win screens',
  },
};

// Episode stage flavor — the "beat" each episode hits in the arc.
const EPISODES = {
  1: {
    stage: 'first meeting',
    instruction:
      'This is the moment Nigel meets the character for the first time. ' +
      'Ms. Humphrey introduces them, and the character notices a specific ' +
      'thing Nigel just accomplished. The character is friendly and impressed. ' +
      'End with a hint that they will train Nigel later.',
  },
  2: {
    stage: 'training together',
    instruction:
      'Nigel has been working hard and the character returns. This time the ' +
      'character teaches Nigel something or shares a secret tied to their ' +
      'archetype. The tone is encouraging and slightly playful. End with the ' +
      'character saying they are proud of how far Nigel has come.',
  },
  3: {
    stage: 'joining the squad',
    instruction:
      'This is the finale of the character\u2019s arc. Nigel has earned a major ' +
      'milestone and the character officially joins the Surprise Squad on ' +
      'his team. The moment should feel triumphant — Nigel is becoming the ' +
      'captain of a real team. End with the character calling Nigel by name ' +
      'and saying they are squad-ready.',
  },
};

let PROFILE = {};
try {
  PROFILE = JSON.parse(readFileSync(
    path.join(process.cwd(), 'data', 'nigel-profile.json'), 'utf-8'
  ));
} catch (_) {}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: 'supabase env missing' });
  if (!ANTHROPIC_KEY)     return res.status(500).json({ error: 'anthropic env missing' });

  const body = (req.body && typeof req.body === 'object') ? req.body : safeJson(req.body);
  const child_id      = String(body.child_id || '').trim();
  const character_key = String(body.character_key || '').trim();
  const episode       = parseInt(body.episode, 10);
  const force         = body.force === true;
  if (!child_id) return res.status(400).json({ error: 'child_id required' });
  if (!CHARACTERS[character_key]) return res.status(400).json({ error: `unknown character: ${character_key}` });
  if (![1, 2, 3].includes(episode)) return res.status(400).json({ error: 'episode must be 1, 2, or 3' });

  // ---- Cache lookup -----------------------------------------------------
  if (!force) {
    try {
      const cached = await sbGet({ SB_URL, SB_KEY,
        path: `ha_character_episodes?child_id=eq.${child_id}` +
              `&character_key=eq.${character_key}&episode=eq.${episode}&select=story,generated_at` });
      if (Array.isArray(cached) && cached.length > 0) {
        return res.status(200).json({ status: 'cached', episode, character_key, story: cached[0].story });
      }
    } catch (_) {}
  }

  // ---- Generate ---------------------------------------------------------
  const char    = CHARACTERS[character_key];
  const episCfg = EPISODES[episode];
  let story;
  try {
    story = await draftEpisode({ ANTHROPIC_KEY, char, episCfg });
  } catch (e) {
    return res.status(502).json({ error: 'haiku draft failed', detail: errStr(e) });
  }
  if (!story || story.length < 30) {
    return res.status(502).json({ error: 'haiku output too short', preview: (story || '').slice(0, 100) });
  }

  // ---- Persist (upsert on conflict; force-mode overwrites) -------------
  try {
    if (force) {
      // Delete the existing row first, then insert. Cheaper than building
      // an upsert against unique constraint here.
      await sbDelete({ SB_URL, SB_KEY,
        path: `ha_character_episodes?child_id=eq.${child_id}` +
              `&character_key=eq.${character_key}&episode=eq.${episode}` });
    }
    await sbPost({ SB_URL, SB_KEY, path: 'ha_character_episodes',
                   headers: { Prefer: 'return=minimal' },
                   body: [{ child_id, character_key, episode, story }] });
  } catch (e) {
    return res.status(500).json({ error: 'insert failed', detail: errStr(e), story });
  }

  return res.status(200).json({ status: 'generated', episode, character_key, story });
}

// ---------------------------------------------------------------------------
// Haiku prompt
// ---------------------------------------------------------------------------

function buildPersonalBlock(profile) {
  if (!profile || Object.keys(profile).length === 0) return '(no profile)';
  const fam = profile.family || {};
  const bits = [];
  bits.push(`Name: ${profile.name || 'Nigel'} (age ${profile.age || 7}).`);
  if (Array.isArray(fam.cousins) && fam.cousins.length) bits.push(`Cousins: ${fam.cousins.join(', ')}.`);
  if (fam.best_friend) bits.push(`Best friend: ${fam.best_friend}.`);
  if (Array.isArray(fam.other_friends) && fam.other_friends.length) bits.push(`Friends: ${fam.other_friends.join(', ')}.`);
  if (Array.isArray(profile.loves) && profile.loves.length) bits.push(`Loves: ${profile.loves.join(', ')}.`);
  if (Array.isArray(profile.hobbies) && profile.hobbies.length) bits.push(`Hobbies: ${profile.hobbies.join(', ')}.`);
  return bits.join(' ');
}

async function draftEpisode({ ANTHROPIC_KEY, char, episCfg }) {
  const personal = buildPersonalBlock(PROFILE);

  const system = [
    'You are Ms. Humphrey, the warm Indian-American homeschool tutor at Hero Academy. You speak in your own voice (encouraging, gentle, present-tense).',
    '',
    'You are about to tell a 7-year-old named Nigel a 3-4 sentence story arc moment about a character on his Surprise Squad team. Nigel just earned this episode by working hard in his lessons.',
    '',
    'CHARACTER:',
    `  Name: ${char.name} (${char.title})`,
    `  Archetype: ${char.archetype}`,
    `  Bio: ${char.bio}`,
    `  Flavor: ${char.flavor}`,
    `  Zone domain: ${char.domain}`,
    '',
    `EPISODE STAGE: ${episCfg.stage}`,
    `EPISODE BEAT: ${episCfg.instruction}`,
    '',
    'NIGEL\'S PROFILE (use 1-2 details naturally — not all of them):',
    personal,
    '',
    'WRITING RULES:',
    '  - Exactly 3-4 sentences. No more, no less.',
    '  - Decodable, warm 2nd-grade English. Short sentences.',
    '  - Use Nigel\'s name once. Don\'t overuse it.',
    '  - Use 1-2 details from his profile naturally (a friend, a hobby, a love). Skip the rest.',
    '  - Speak as Ms. Humphrey narrating to Nigel — second person ("you") is fine.',
    '  - Tie the moment to the character\'s archetype and flavor (gears for Carlo, skies for Aurora, webs for Webly, etc.).',
    '  - No exclamation points stacked together. One per sentence max.',
    '  - No "I" speaking as Ms. Humphrey — just narrate the scene. The text will be read aloud by Ms. Humphrey, so it should be the story she\'s telling, not her commenting on it.',
    '',
    'OUTPUT: Strict JSON only, no preamble, no fences:',
    '{ "story": "..." }',
  ].join('\n');

  const user = 'Write the story now. Return JSON only.';

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`anthropic ${r.status}: ${body.slice(0, 300)}`);
  }
  const json = await r.json();
  const text = (json.content || [])
    .filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  const fenced = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let parsed;
  try { parsed = JSON.parse(fenced); }
  catch (e) { throw new Error('haiku not JSON: ' + fenced.slice(0, 200)); }
  const story = String(parsed.story || '').trim();
  if (!story) throw new Error('empty story field');
  return story;
}

// ---------------------------------------------------------------------------
// Supabase REST helpers
// ---------------------------------------------------------------------------

async function sbGet({ SB_URL, SB_KEY, path }) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`get ${path} ${r.status}`);
  return r.json();
}
async function sbPost({ SB_URL, SB_KEY, path, body, headers }) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json', Accept: 'application/json',
      ...(headers || {}),
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`post ${path} ${r.status} ${(await r.text()).slice(0, 200)}`);
}
async function sbDelete({ SB_URL, SB_KEY, path }) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: 'DELETE',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Accept: 'application/json' },
  });
  if (!r.ok && r.status !== 404) throw new Error(`delete ${path} ${r.status}`);
}

function safeJson(s) { try { return JSON.parse(s); } catch (_) { return {}; } }
function errStr(e) { return (e && e.message) || String(e); }
