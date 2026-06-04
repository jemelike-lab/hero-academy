/* ============================================================
   Surprise Squad — Hero Academy
   ============================================================
   A pop-up character system that visits during level transitions
   and on game-win screens. Tracks unlocked trading cards in
   localStorage for the Hero Hall.

   Used by: cauldron-cafe.html, diner-lanes.html, (future zones)
   Rendered on: hero-hall.html

   Public API: window.HeroAcademy.Characters
     - maybeSurprise(zone, opts) → Promise<{visited, character?, newUnlock?}>
         Rolls dice (~1 in 4-5). If it triggers, runs the visit
         animation. ALWAYS await before advancing levels — the
         promise resolves immediately when no visit happens.
     - visitCharacter(idOrChar, opts) → Promise<{character, newUnlock}>
         Forces a specific character to appear.
     - celebrateWin() → Promise
         Visits a Toybox Team member; for game-completion screens.
     - readUnlocked() / isUnlocked(id) / unlockCard(id)
         Persistence helpers.
     - CHARACTERS, getById, pickForZone
         Roster query helpers.

   Persistence: localStorage key 'heroAcademy.surpriseSquad.unlocked'
   (v0.1 — move to backend later when tied to Hero Academy XP)

   Art: v0.1 placeholder = emoji + SVG halo. v0.2 will swap in
   Midjourney art at the same DOM hook points (.hero-surprise-emoji,
   .hero-hall-art).
   ============================================================ */

(function (global) {
  'use strict';

  const STORAGE_KEY = 'heroAcademy.surpriseSquad.unlocked';
  const TRIGGER_CHANCE = 0.22; // ~1 in 4-5 (per pickup doc)

  // --- Roster -----------------------------------------------------------
  const CHARACTERS = [
    {
      id: 'carlo',
      name: 'Captain Carlo',
      title: 'the Cosmic Plumber',
      archetype: 'Tinkerer · Fixer',
      bio: 'A beaver in red overalls with goggles and a gear belt. Builds and fixes anything across the cosmos.',
      zones: ['discoverydome'],
      voiceLine: "Captain Carlo's on the case! Need anything fixed?",
      bonus: 'gear-coin',
      color: '#ef4444',
      emoji: '🦫',
      accessory: '🥽'
    },
    {
      id: 'aurora',
      name: 'Aurora the Aviator',
      title: 'Hero of the High Skies',
      archetype: 'Hero · Announcer',
      bio: 'A great horned owl in a star-spangled cape. Swoops in to announce bonus rounds across every zone.',
      zones: ['numberlab','wordtower','discoverydome','explorershall'],
      voiceLine: 'Aurora here! Bonus round, hero!',
      bonus: 'extra-star',
      color: '#14b8d4',
      emoji: '🦉',
      accessory: '⭐'
    },
    {
      id: 'shellback-squad',
      name: 'The Shellback Squad',
      title: "Ralphie's Four Cousins",
      archetype: 'Friend Group',
      bio: 'Marbles the builder, Glow the scientist, Pebble the athlete, and Spark the artist. Show up as a quartet, line-dance, then leave.',
      zones: ['numberlab','wordtower','discoverydome','explorershall'],
      voiceLine: 'The Shellback Squad has arrived!',
      bonus: 'coin-shower',
      color: '#ff8b3d',
      emoji: '🐢',
      accessory: '🎉',
      members: [
        { name: 'Marbles', color: '#ef4444', trait: 'Builder',   emoji: '🔨' },
        { name: 'Glow',    color: '#14b8d4', trait: 'Scientist', emoji: '🔬' },
        { name: 'Pebble',  color: '#ff8b3d', trait: 'Athlete',   emoji: '🏃' },
        { name: 'Spark',   color: '#a855f7', trait: 'Artist',    emoji: '🎨' }
      ]
    },
    {
      id: 'webly',
      name: 'Webly Quickfoot',
      title: 'the Web-Slinger',
      archetype: 'Climber · Helper',
      bio: 'A cheerful jumping spider with sparkly webs. Swings in from a corner to pass down a high bonus item.',
      zones: ['wordtower'],
      voiceLine: 'Webly to the rescue! Catch this!',
      bonus: 'free-skip',
      color: '#a855f7',
      emoji: '🕷️',
      accessory: '✨'
    },
    {
      id: 'toybox-team',
      name: 'The Toybox Team',
      title: 'Living Toys',
      archetype: 'Win-Screen Crew',
      bio: 'Astro the space bear, Sheriff Sage the fox, Cogworth the robot, and Doodle the crayon dragon. They show up when you finish a game.',
      zones: ['win'],
      voiceLine: 'The Toybox Team is here! Way to go, hero!',
      bonus: 'trophy-shower',
      color: '#ec4899',
      emoji: '🧸',
      accessory: '🏆',
      members: [
        { name: 'Astro',        color: '#14b8d4', trait: 'Space Bear',     emoji: '🐻‍❄️' },
        { name: 'Sheriff Sage', color: '#ff8b3d', trait: 'Fox',            emoji: '🦊' },
        { name: 'Cogworth',     color: '#9ca3af', trait: 'Robot',          emoji: '🤖' },
        { name: 'Doodle',       color: '#ec4899', trait: 'Crayon Dragon',  emoji: '🐉' }
      ]
    }
  ];

  // --- Persistence ------------------------------------------------------
  function readUnlocked() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function writeUnlocked(arr) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); } catch (e) {}
  }
  function unlockCard(id) {
    const set = new Set(readUnlocked());
    if (set.has(id)) return false;
    set.add(id);
    writeUnlocked(Array.from(set));
    return true; // newly unlocked
  }
  function isUnlocked(id) { return readUnlocked().includes(id); }

  // --- Roster query -----------------------------------------------------
  function getById(id) { return CHARACTERS.find(c => c.id === id) || null; }
  function pickForZone(zone) {
    const eligible = CHARACTERS.filter(c => c.zones.includes(zone));
    if (!eligible.length) return null;
    return eligible[Math.floor(Math.random() * eligible.length)];
  }

  // --- Speech (Web Speech, v0.1) ---------------------------------------
  function speakLine(text) {
    try {
      if (!window.speechSynthesis) return;
      // Don't stomp on Miss Humphrey mid-sentence
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1; u.pitch = 1.15; u.volume = 0.95;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  // --- Overlay scaffolding ---------------------------------------------
  function ensureStyles() {
    if (document.getElementById('hero-surprise-styles')) return;
    const s = document.createElement('style');
    s.id = 'hero-surprise-styles';
    s.textContent = `
      @keyframes hero-surprise-in {
        0%   { transform: translate(-110vw, 25vh) rotate(-22deg) scale(.55); opacity: 0; }
        55%  { transform: translate(0, 0) rotate(-4deg) scale(1.08); opacity: 1; }
        72%  { transform: translate(0, 0) rotate(3deg) scale(.96); opacity: 1; }
        100% { transform: translate(0, 0) rotate(0deg) scale(1); opacity: 1; }
      }
      @keyframes hero-surprise-out {
        0%   { transform: translate(0, 0) scale(1); opacity: 1; }
        100% { transform: translate(115vw, -10vh) rotate(18deg) scale(.7); opacity: 0; }
      }
      @keyframes hero-surprise-bob {
        0%, 100% { transform: translateY(0); }
        50%      { transform: translateY(-6px); }
      }
      @keyframes hero-surprise-sparkle {
        0%   { transform: scale(0) rotate(0deg); opacity: 1; }
        100% { transform: scale(1.6) rotate(200deg); opacity: 0; }
      }
      @keyframes hero-surprise-banner {
        0% { transform: translateY(14px); opacity: 0; }
        100% { transform: translateY(0); opacity: 1; }
      }
      .hero-surprise-card {
        position: relative;
        background: linear-gradient(180deg, rgba(10,11,46,.94), rgba(26,21,84,.94));
        border: 4px solid var(--gold, #ffd147);
        border-radius: 28px;
        padding: 24px 30px 26px;
        color: #fff;
        text-align: center;
        box-shadow: 0 18px 50px rgba(0,0,0,.5), 0 0 0 4px rgba(255,209,71,.22), 0 0 80px rgba(255,209,71,.18);
        max-width: 86vw;
        min-width: 260px;
        font-family: 'Fredoka','SF Pro Rounded',system-ui,sans-serif;
      }
      .hero-surprise-halo {
        position:absolute; inset:-6px; border-radius:32px; pointer-events:none;
        background: conic-gradient(from 0deg, transparent 0deg, rgba(255,209,71,.35) 60deg, transparent 120deg, rgba(20,184,212,.3) 180deg, transparent 240deg, rgba(236,72,153,.3) 300deg, transparent 360deg);
        filter: blur(8px);
        opacity:.7;
      }
      .hero-surprise-emoji-wrap {
        position: relative;
        display: inline-block;
        animation: hero-surprise-bob 2.2s ease-in-out infinite;
      }
      .hero-surprise-emoji {
        font-size: 96px; line-height: 1;
        filter: drop-shadow(0 6px 14px rgba(0,0,0,.45));
      }
      .hero-surprise-accessory {
        position: absolute; top: -6px; right: -14px;
        font-size: 40px;
        filter: drop-shadow(0 3px 6px rgba(0,0,0,.4));
      }
      .hero-surprise-name {
        font-size: 28px; font-weight: 700; color: var(--gold, #ffd147);
        margin: 6px 0 0; letter-spacing: .3px;
      }
      .hero-surprise-title {
        font-size: 15px; font-weight: 500; opacity: .92; margin: 4px 0 12px;
        font-style: italic;
      }
      .hero-surprise-banner {
        display: inline-block;
        background: var(--gold, #ffd147);
        color: #1a1554;
        font-weight: 700;
        padding: 8px 18px;
        border-radius: 999px;
        font-size: 14px;
        animation: hero-surprise-banner .4s .15s ease-out backwards;
        box-shadow: 0 4px 12px rgba(255,209,71,.4);
      }
      .hero-surprise-banner.return {
        background: var(--cyan, #14b8d4);
        color: #fff;
      }
      .hero-surprise-sparkle {
        position:absolute; font-size:34px; pointer-events:none;
        animation: hero-surprise-sparkle 1s ease-out forwards;
      }
    `;
    document.head.appendChild(s);
  }

  function buildOverlay() {
    let el = document.getElementById('hero-surprise-overlay');
    if (el) { el.innerHTML = ''; return el; }
    el = document.createElement('div');
    el.id = 'hero-surprise-overlay';
    el.setAttribute('aria-live','polite');
    el.style.cssText =
      'position:fixed;inset:0;z-index:9999;pointer-events:none;' +
      'display:flex;align-items:center;justify-content:center;';
    document.body.appendChild(el);
    return el;
  }

  function spawnSparkles(overlay) {
    const glyphs = ['✨','⭐','💫','🌟','✨'];
    for (let i = 0; i < 12; i++) {
      const sp = document.createElement('div');
      sp.className = 'hero-surprise-sparkle';
      sp.textContent = glyphs[i % glyphs.length];
      sp.style.left = (Math.random() * 80 + 10) + '%';
      sp.style.top  = (Math.random() * 70 + 15) + '%';
      sp.style.animationDelay = (Math.random() * .5) + 's';
      overlay.appendChild(sp);
      setTimeout(() => sp.remove(), 1500);
    }
  }

  function renderCard(char, isNew) {
    const card = document.createElement('div');
    card.className = 'hero-surprise-card';
    card.style.animation = 'hero-surprise-in .75s cubic-bezier(.34,1.56,.64,1) forwards';

    const halo = document.createElement('div');
    halo.className = 'hero-surprise-halo';
    card.appendChild(halo);

    const wrap = document.createElement('div');
    wrap.className = 'hero-surprise-emoji-wrap';
    const emoji = document.createElement('div');
    emoji.className = 'hero-surprise-emoji';
    emoji.textContent = char.emoji;
    wrap.appendChild(emoji);
    if (char.accessory) {
      const acc = document.createElement('div');
      acc.className = 'hero-surprise-accessory';
      acc.textContent = char.accessory;
      wrap.appendChild(acc);
    }
    card.appendChild(wrap);

    const name = document.createElement('div');
    name.className = 'hero-surprise-name';
    name.textContent = char.name;
    card.appendChild(name);

    const title = document.createElement('div');
    title.className = 'hero-surprise-title';
    title.textContent = char.title;
    card.appendChild(title);

    const banner = document.createElement('div');
    banner.className = 'hero-surprise-banner' + (isNew ? '' : ' return');
    banner.textContent = isNew ? '⭐ New Card Unlocked!' : 'Hi again, hero!';
    card.appendChild(banner);

    return card;
  }

  // --- Public: visitCharacter ------------------------------------------
  function visitCharacter(idOrChar, opts) {
    const char = (typeof idOrChar === 'string') ? getById(idOrChar) : idOrChar;
    if (!char) return Promise.resolve(null);
    const o = opts || {};
    const duration = o.duration || 3300;

    ensureStyles();

    return new Promise(resolve => {
      const overlay = buildOverlay();
      const newUnlock = unlockCard(char.id);
      const card = renderCard(char, newUnlock);
      overlay.appendChild(card);
      spawnSparkles(overlay);
      if (o.voice !== false) speakLine(char.voiceLine);

      setTimeout(() => {
        card.style.animation = 'hero-surprise-out .55s cubic-bezier(.7,0,.84,0) forwards';
      }, duration - 600);
      setTimeout(() => {
        card.remove();
        resolve({ character: char, newUnlock });
      }, duration);
    });
  }

  // --- Public: maybeSurprise -------------------------------------------
  function maybeSurprise(zone, opts) {
    const o = opts || {};
    const chance = (typeof o.chance === 'number') ? o.chance : TRIGGER_CHANCE;
    if (Math.random() > chance) return Promise.resolve({ visited: false });
    const char = pickForZone(zone);
    if (!char) return Promise.resolve({ visited: false });
    return visitCharacter(char, o).then(res => ({
      visited: true, character: res.character, newUnlock: res.newUnlock
    }));
  }

  // --- Public: celebrateWin --------------------------------------------
  function celebrateWin(opts) {
    return visitCharacter('toybox-team', Object.assign({ duration: 4000 }, opts || {}));
  }

  // ====================================================================
  // EPISODE PROGRESSION (mastery-based, server-backed)
  // ====================================================================
  // Each character has 3 episodes Nigel earns by playing. Unlocks are
  // deterministic (tied to real sessions / mastery), not random. Each unlock
  // fires a Haiku-generated story snippet Ms. Humphrey reads aloud.
  //
  // Existing maybeSurprise / unlockCard / readUnlocked are kept untouched
  // for the random-visit overlay — that's a separate flavor mechanism that
  // populates the legacy 'unlocked' set. Episode state lives in a new
  // localStorage key and is synced to Supabase per-child.

  const MILESTONES_KEY = 'heroAcademy.milestones';
  const EPISODE_KEY    = 'heroAcademy.episodes';    // local mirror of progress
  const DEFAULT_CHILD  = '2e0e51c5-f120-4152-8aa1-041eeecc8165';

  // Per-character criteria. Each criterion is a predicate function over the
  // milestones blob. Returns true when the kid has earned that episode.
  const UNLOCK_CRITERIA = {
    'webly': {
      1: m => (m.sessionsByZone.wordtower || 0) >= 1,
      2: m => (m.sessionsByZone.wordtower || 0) >= 5,
      3: m => (m.sessionsByZone.wordtower || 0) >= 10,
    },
    'carlo': {
      1: m => (m.sessionsByZone.discoverydome || 0) >= 1,
      2: m => (m.sessionsByZone.discoverydome || 0) >= 5,
      3: m => (m.sessionsByZone.discoverydome || 0) >= 10,
    },
    'aurora': {
      1: m => (m.sessionsByZone.numberlab || 0) >= 1,
      2: m => (m.sessionsByZone.numberlab || 0) >= 5,
      3: m => (m.mathSkillsMastered || []).length >= 1,
    },
    'toybox-team': {
      1: m => (m.sessionsByZone.storylab || 0) >= 1,
      2: m => (m.sessionsByZone.storylab || 0) >= 5,
      3: m => (m.sessionsByZone.storylab || 0) >= 10,
    },
    'shellback-squad': {
      1: m => Object.keys(m.sessionsByZone || {}).length >= 2,
      2: m => Object.keys(m.sessionsByZone || {}).length >= 4,
      3: m => Object.keys(m.sessionsByZone || {})
                .filter(z => (m.sessionsByZone[z] || 0) >= 3).length >= 4,
    },
  };

  // -------- Build #3 — kid-readable criterion strings ----------------------
  // Each entry mirrors UNLOCK_CRITERIA but returns a friendly progress line.
  // The helper produces text like "Play 3 more Word Tower games" (4 done of 5)
  // so Nigel sees exactly what tomorrow is for.
  function _zoneCount(m, z) { return (m.sessionsByZone && m.sessionsByZone[z]) || 0; }
  function _zonesCount(m)   { return Object.keys(m.sessionsByZone || {}).length; }
  function _wellPlayedZones(m) {
    return Object.keys(m.sessionsByZone || {})
      .filter(z => (m.sessionsByZone[z] || 0) >= 3).length;
  }
  function _remaining(needed, have) {
    const r = Math.max(0, needed - have);
    return r;
  }
  const CRITERIA_DESCRIPTIONS = {
    'webly': {
      1: m => ({ label: 'Visit Word Tower once',                    have: _zoneCount(m, 'wordtower'),  need: 1 }),
      2: m => ({ label: 'Play 5 Word Tower games',                  have: _zoneCount(m, 'wordtower'),  need: 5 }),
      3: m => ({ label: 'Play 10 Word Tower games',                 have: _zoneCount(m, 'wordtower'),  need: 10 }),
    },
    'carlo': {
      1: m => ({ label: 'Visit Discovery Dome once',                have: _zoneCount(m, 'discoverydome'), need: 1 }),
      2: m => ({ label: 'Play 5 Discovery Dome sessions',           have: _zoneCount(m, 'discoverydome'), need: 5 }),
      3: m => ({ label: 'Play 10 Discovery Dome sessions',          have: _zoneCount(m, 'discoverydome'), need: 10 }),
    },
    'aurora': {
      1: m => ({ label: 'Visit Number Lab once',                    have: _zoneCount(m, 'numberlab'),  need: 1 }),
      2: m => ({ label: 'Play 5 Number Lab sessions',               have: _zoneCount(m, 'numberlab'),  need: 5 }),
      3: m => ({ label: 'Master one math skill',                    have: (m.mathSkillsMastered || []).length, need: 1 }),
    },
    'toybox-team': {
      1: m => ({ label: 'Visit Story Lab once',                     have: _zoneCount(m, 'storylab'),   need: 1 }),
      2: m => ({ label: 'Play 5 Story Lab sessions',                have: _zoneCount(m, 'storylab'),   need: 5 }),
      3: m => ({ label: 'Play 10 Story Lab sessions',               have: _zoneCount(m, 'storylab'),   need: 10 }),
    },
    'shellback-squad': {
      1: m => ({ label: 'Play in 2 different zones',                have: _zonesCount(m),              need: 2 }),
      2: m => ({ label: 'Play in 4 different zones',                have: _zonesCount(m),              need: 4 }),
      3: m => ({ label: 'Play 3+ sessions in 4 different zones',    have: _wellPlayedZones(m),         need: 4 }),
    },
  };

  // Describe the "what's next" step for a single character given milestone data.
  // Returns one of:
  //   { complete: true, label: '★ SQUAD READY ★' }            — all 3 episodes earned
  //   { complete: false, episode: N, label, have, need, remaining, almost }
  function describeNextStep(charKey, milestones, currentEpisode) {
    const ep = (currentEpisode || 0);
    if (ep >= 3) return { complete: true, label: '\u2605 SQUAD READY \u2605' };
    const nextEp = ep + 1;
    const desc = CRITERIA_DESCRIPTIONS[charKey] && CRITERIA_DESCRIPTIONS[charKey][nextEp];
    if (!desc) return { complete: false, episode: nextEp, label: 'Keep playing!', have: 0, need: 0, remaining: 0, almost: false };
    const r = desc(milestones || defaultMilestones());
    const remaining = _remaining(r.need, r.have);
    return {
      complete: false,
      episode: nextEp,
      label: r.label,
      have: r.have,
      need: r.need,
      remaining,
      // "almost" = within one play of unlock — UI can pulse-highlight these
      almost: remaining > 0 && remaining <= 1,
    };
  }

  // Aggregate hero level — derived purely from episode counts so this stays
  // a function of progression, not arbitrary XP.
  // Total possible episodes = 5 characters × 3 = 15. Level curve:
  //   0–1 ep  → Level 1 (Sidekick)
  //   2–3 ep  → Level 2 (Cadet)
  //   4–6 ep  → Level 3 (Hero)
  //   7–9 ep  → Level 4 (Champion)
  //  10–12 ep → Level 5 (Legend)
  //  13–15 ep → Level 6 (Mythic)
  const HERO_TITLES = ['Sidekick', 'Cadet', 'Hero', 'Champion', 'Legend', 'Mythic'];
  function totalEpisodesEarned(episodesByChar) {
    if (!episodesByChar || typeof episodesByChar !== 'object') return 0;
    let n = 0;
    Object.keys(episodesByChar).forEach(k => { n += Math.min(3, Math.max(0, episodesByChar[k] || 0)); });
    return n;
  }
  function heroLevel(episodes) {
    if (episodes <= 1)  return { level: 1, title: HERO_TITLES[0], floor: 0,  ceiling: 2 };
    if (episodes <= 3)  return { level: 2, title: HERO_TITLES[1], floor: 2,  ceiling: 4 };
    if (episodes <= 6)  return { level: 3, title: HERO_TITLES[2], floor: 4,  ceiling: 7 };
    if (episodes <= 9)  return { level: 4, title: HERO_TITLES[3], floor: 7,  ceiling: 10 };
    if (episodes <= 12) return { level: 5, title: HERO_TITLES[4], floor: 10, ceiling: 13 };
    return                     { level: 6, title: HERO_TITLES[5], floor: 13, ceiling: 15 };
  }

  // -------- Milestones (the local source-of-truth for criteria) -----------
  function defaultMilestones() {
    return {
      sessionsByZone: {},        // { numberlab: N, wordtower: N, ... }
      zonesEverPlayed: [],       // array of zone ids (deduped via set)
      daysPlayed: [],            // array of YYYY-MM-DD (deduped)
      mathSkillsMastered: [],    // array of skill ids (deduped)
    };
  }
  function readMilestones() {
    try {
      const raw = localStorage.getItem(MILESTONES_KEY);
      return raw ? Object.assign(defaultMilestones(), JSON.parse(raw)) : defaultMilestones();
    } catch (e) { return defaultMilestones(); }
  }
  function writeMilestones(m) {
    try { localStorage.setItem(MILESTONES_KEY, JSON.stringify(m)); } catch (e) {}
  }
  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }

  // -------- Episode state (local mirror of server) ------------------------
  function readEpisodes() {
    try {
      const raw = localStorage.getItem(EPISODE_KEY);
      return raw ? JSON.parse(raw) : {};   // { charKey: highestEpisode }
    } catch (e) { return {}; }
  }
  function writeEpisodes(obj) {
    try { localStorage.setItem(EPISODE_KEY, JSON.stringify(obj)); } catch (e) {}
  }

  // -------- Server sync helpers ------------------------------------------
  function childId() {
    if (window.HeroAcademy && window.HeroAcademy.Telemetry &&
        typeof window.HeroAcademy.Telemetry.childId === 'function') {
      return window.HeroAcademy.Telemetry.childId() || DEFAULT_CHILD;
    }
    return DEFAULT_CHILD;
  }
  function tel() {
    return window.HeroAcademy && window.HeroAcademy.Telemetry;
  }

  // Fetch progress from server. Falls back to localStorage on any failure.
  async function getProgress() {
    const T = tel();
    if (T && typeof T.rpc === 'function') {
      try {
        const r = await T.rpc('ha_get_character_progress', { p_child_id: childId() });
        if (r && r.ok) {
          const rows = await r.json();
          if (Array.isArray(rows)) {
            const out = {};
            rows.forEach(row => { out[row.character_key] = row.episode || 0; });
            // Mirror to local for fast next-render
            writeEpisodes(out);
            return out;
          }
        }
      } catch (e) { /* fall through */ }
    }
    return readEpisodes();
  }

  // Record on the server, also update local mirror.
  async function persistEpisode(charKey, episode) {
    const T = tel();
    if (T && typeof T.rpc === 'function') {
      try {
        await T.rpc('ha_unlock_character_episode', {
          p_child_id: childId(), p_character_key: charKey, p_episode: episode
        });
      } catch (e) { /* localStorage will hold the change */ }
    }
    const eps = readEpisodes();
    eps[charKey] = Math.max(eps[charKey] || 0, episode);
    writeEpisodes(eps);
  }

  // Fetch or generate the episode story.
  async function fetchEpisodeStory(charKey, episode) {
    const T = tel();
    // Try cached on the server
    if (T && typeof T.rpc === 'function') {
      try {
        const r = await T.rpc('ha_get_character_episode', {
          p_child_id: childId(), p_character_key: charKey, p_episode: episode
        });
        if (r && r.ok) {
          const rows = await r.json();
          if (Array.isArray(rows) && rows.length > 0 && rows[0].story) {
            return rows[0].story;
          }
        }
      } catch (e) {}
    }
    // Generate on demand
    try {
      const resp = await fetch('/api/humphrey/generate-character-episode', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          child_id: childId(), character_key: charKey, episode: episode
        }),
      });
      if (resp.ok) {
        const j = await resp.json();
        if (j && j.story) return j.story;
      }
    } catch (e) {}
    // Last resort — fall back to the character's voiceLine.
    const c = getById(charKey);
    return c ? (c.voiceLine || 'A new hero joins your squad!') : 'A new hero joins your squad!';
  }

  // Play the episode celebration overlay — character art animates in,
  // Ms. Humphrey reads the story, then it fades out.
  async function playEpisodeCelebration(charKey, episode, story) {
    const char = getById(charKey);
    if (!char) return;
    ensureStyles();

    // Build overlay using the same card scaffolding as random visits, but
    // with the episode story shown underneath.
    return new Promise(resolve => {
      const overlay = buildOverlay();
      const newUnlock = unlockCard(char.id);  // also flip legacy localStorage flag
      const card = renderCard(char, newUnlock);

      // Append the episode story as an extra panel under the card.
      const arc = document.createElement('div');
      arc.style.cssText =
        'max-width:480px;margin:18px auto 0;padding:14px 18px;background:rgba(0,0,0,0.42);' +
        'border-radius:14px;color:#f5e8c8;font-size:1.02rem;line-height:1.5;text-align:center;' +
        'border:1px solid rgba(255,209,71,0.35)';
      arc.innerHTML =
        '<div style="font-weight:700;font-size:0.78rem;letter-spacing:0.08em;' +
        'color:#ffd147;margin-bottom:8px">EPISODE ' + episode + '</div>' +
        '<div>' + escapeHTML(story) + '</div>';
      card.appendChild(arc);

      overlay.appendChild(card);
      spawnSparkles(overlay);

      // Ms. Humphrey reads the story (preferred), else fall back to the
      // legacy speechSynthesis voiceLine.
      const H = window.HeroAcademy && window.HeroAcademy.Humphrey;
      if (H && typeof H.say === 'function') {
        H.say('correct-answer', {
          kidName: 'Nigel',
          text: story,
          expression: 'cheering',
          duration: Math.min(20000, Math.max(7000, story.length * 70)),
        });
      } else {
        speakLine(story);
      }

      const duration = Math.min(14000, Math.max(7000, story.length * 70));
      setTimeout(() => {
        card.style.animation = 'hero-surprise-out .55s cubic-bezier(.7,0,.84,0) forwards';
      }, duration - 600);
      setTimeout(() => {
        card.remove();
        resolve({ character: char, episode });
      }, duration);
    });
  }

  function escapeHTML(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/\'/g, '&#39;');
  }


  // -------- Difficulty signal recording + badge ---------------------------
  // Posts a session signal to the server which auto-evaluates the new level
  // and returns the change direction ('up' | 'down' | 'same'). On a level
  // change, Ms. Humphrey reads a short narration so Nigel knows the
  // difficulty just shifted.
  async function recordDifficultySignal(zoneId, signal) {
    const T = tel();
    if (!T || typeof T.rpc !== 'function') return null;
    const attempted = Math.max(0, parseInt(signal.items_attempted || 0, 10));
    const firstTry  = Math.max(0, parseInt(signal.items_correct_first_try || 0, 10));
    const streak    = Math.max(0, parseInt(signal.longest_streak || 0, 10));
    if (attempted === 0 && zoneId !== 'storylab') return null; // nothing to eval

    let r, rows;
    try {
      r = await T.rpc('ha_record_session_signal', {
        p_child_id: childId(),
        p_zone: zoneId,
        p_items_attempted: attempted,
        p_items_correct_first_try: firstTry,
        p_longest_streak: streak,
      });
      if (!r || !r.ok) return null;
      rows = await r.json();
    } catch (e) { return null; }
    const result = Array.isArray(rows) ? rows[0] : rows;
    if (!result || !result.change_direction || result.change_direction === 'same') return result;

    // Level changed — surface a Ms. Humphrey narration after a short pause
    // so the existing celebration scene has its moment first.
    setTimeout(function () {
      const H = window.HeroAcademy && window.HeroAcademy.Humphrey;
      if (!H || typeof H.say !== 'function') return;
      const lvl = result.new_level;
      const dir = result.change_direction;
      const text = dir === 'up'
        ? "Wow, Nigel, you are so good at this. I am going to give you something a little trickier next time."
        : "Let me give you a little more practice with the basics, Nigel. We will build it up again together.";
      H.say(dir === 'up' ? 'streak-5' : 'try-again-math', {
        kidName: 'Nigel',
        text: text,
        expression: dir === 'up' ? 'cheering' : 'encouraging',
        duration: 7500,
      });
    }, 3500);

    return result;
  }
  // -------- Public: recordSessionComplete --------------------------------
  // Each zone calls this when a session ends. It bumps milestones, then
  // checks every character\'s criteria. New unlocks fire a celebration in
  // sequence (awaited so we don\'t stack overlays).
  async function recordSessionComplete(zoneId, signal) {
    if (!zoneId) return [];

    // 0. Difficulty evaluation (only when signal data is provided).
    // We do this first so the level-change badge fires before the episode
    // celebration overlay if both happen in the same call.
    if (signal && typeof signal === 'object') {
      try { await recordDifficultySignal(zoneId, signal); } catch (e) {}
    }

    // 1. Bump milestones
    const m = readMilestones();
    m.sessionsByZone[zoneId] = (m.sessionsByZone[zoneId] || 0) + 1;
    if (m.zonesEverPlayed.indexOf(zoneId) < 0) m.zonesEverPlayed.push(zoneId);
    const today = todayKey();
    if (m.daysPlayed.indexOf(today) < 0) m.daysPlayed.push(today);
    // Pull math-skills-mastered from main game state, if present
    try {
      const gs = JSON.parse(localStorage.getItem('hero_academy_state_v1') || '{}');
      m.mathSkillsMastered = Array.from(new Set(gs.skillsMastered || []));
    } catch (e) {}
    writeMilestones(m);

    // 2. Evaluate criteria against the new state
    const currentEps = readEpisodes();
    const newUnlocks = [];
    Object.keys(UNLOCK_CRITERIA).forEach(charKey => {
      const criteria = UNLOCK_CRITERIA[charKey];
      const haveEp   = currentEps[charKey] || 0;
      // Find the highest episode the kid newly qualifies for.
      let earned = haveEp;
      [1, 2, 3].forEach(ep => {
        if (ep > earned && criteria[ep] && criteria[ep](m)) earned = ep;
      });
      // Stage up one episode at a time so each milestone gets its own scene.
      // If kid qualifies for ep 3 but is still at 0, give ep 1 now and let
      // future sessions deliver ep 2 and 3.
      if (earned > haveEp) {
        newUnlocks.push({ charKey, episode: haveEp + 1 });
      }
    });

    // 3. For each new unlock, persist + fetch story + play celebration
    for (const u of newUnlocks) {
      await persistEpisode(u.charKey, u.episode);
      const story = await fetchEpisodeStory(u.charKey, u.episode);
      await playEpisodeCelebration(u.charKey, u.episode, story);
    }
    return newUnlocks;
  }

  // --- Expose ----------------------------------------------------------
  global.HeroAcademy = global.HeroAcademy || {};
  global.HeroAcademy.Characters = {
    CHARACTERS,
    getById,
    pickForZone,
    maybeSurprise,
    visitCharacter,
    celebrateWin,
    unlockCard,
    isUnlocked,
    readUnlocked,
    TRIGGER_CHANCE,
    STORAGE_KEY,
    // Episode progression
    recordSessionComplete,
    recordDifficultySignal,
    getProgress,
    fetchEpisodeStory,
    playEpisodeCelebration,
    UNLOCK_CRITERIA,
    readMilestones,
    readEpisodes,
    // Build #3 — Journey Map / Hero Levels
    CRITERIA_DESCRIPTIONS,
    describeNextStep,
    heroLevel,
    totalEpisodesEarned,
    HERO_TITLES
  };
})(window);
