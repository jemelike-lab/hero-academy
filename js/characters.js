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
    STORAGE_KEY
  };
})(window);
