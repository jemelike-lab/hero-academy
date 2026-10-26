// js/class-time-visuals.js
// Inline SVG library for the 31 valid showVisual() topics from Ms. Humphrey's prompt.
// All SVGs use viewBox 0 0 200 200 for consistent sizing.
(function(){
  'use strict';
  const NS = window.HeroAcademy = window.HeroAcademy || {};

  // Color palette — warm, kid-friendly
  const C = {
    sky:'#bae6fd', sun:'#fcd34d', sunRing:'#f59e0b',
    water:'#3b82f6', waterLight:'#7dd3fc',
    leaf:'#16a34a', leafLight:'#86efac', stem:'#15803d',
    soil:'#92400e', soilDark:'#78350f',
    fire:'#ef4444', fireYellow:'#fbbf24',
    ice:'#cffafe', iceEdge:'#06b6d4',
    rock:'#78716c', rockDark:'#44403c',
    skin:'#fda4af', wing:'#a855f7',
    body:'#1e293b', bellyLight:'#fef9c3',
    metal:'#94a3b8', gold:'#fbbf24',
    purple:'#8b5cf6', pink:'#ec4899',
    teal:'#14b8a6', orange:'#f97316'
  };

  function wrap(inner){ return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`; }

  const VISUALS = {
    // Nature
    plant: wrap(`
      <ellipse cx="100" cy="180" rx="70" ry="10" fill="${C.soilDark}"/>
      <rect x="40" y="160" width="120" height="20" fill="${C.soil}" rx="4"/>
      <path d="M100 160 L100 70" stroke="${C.stem}" stroke-width="8" stroke-linecap="round" fill="none"/>
      <ellipse cx="70" cy="110" rx="28" ry="14" fill="${C.leaf}" transform="rotate(-30 70 110)"/>
      <ellipse cx="130" cy="100" rx="28" ry="14" fill="${C.leafLight}" transform="rotate(30 130 100)"/>
      <circle cx="100" cy="60" r="22" fill="${C.pink}"/>
      <circle cx="100" cy="60" r="8" fill="${C.sun}"/>
    `),
    sun: wrap(`
      <g>
        ${Array.from({length:8}).map((_,i)=>{const a=i*45;return `<rect x="96" y="10" width="8" height="36" rx="4" fill="${C.sunRing}" transform="rotate(${a} 100 100)"/>`}).join('')}
      </g>
      <circle cx="100" cy="100" r="42" fill="${C.sun}"/>
      <circle cx="88" cy="92" r="5" fill="${C.body}"/>
      <circle cx="112" cy="92" r="5" fill="${C.body}"/>
      <path d="M85 112 Q100 124 115 112" stroke="${C.body}" stroke-width="4" fill="none" stroke-linecap="round"/>
    `),
    water: wrap(`
      <path d="M100 30 Q70 90 70 130 Q70 168 100 168 Q130 168 130 130 Q130 90 100 30 Z" fill="${C.water}"/>
      <ellipse cx="88" cy="120" rx="14" ry="22" fill="${C.waterLight}" opacity="0.7"/>
    `),
    soil: wrap(`
      <rect x="20" y="80" width="160" height="100" fill="${C.soil}" rx="6"/>
      <circle cx="50" cy="120" r="6" fill="${C.soilDark}"/>
      <circle cx="90" cy="140" r="5" fill="${C.soilDark}"/>
      <circle cx="130" cy="115" r="7" fill="${C.soilDark}"/>
      <circle cx="160" cy="145" r="5" fill="${C.soilDark}"/>
      <path d="M75 90 Q73 70 80 60 M120 90 Q122 65 130 58" stroke="${C.leaf}" stroke-width="4" fill="none" stroke-linecap="round"/>
    `),
    butterfly: wrap(`
      <ellipse cx="100" cy="100" rx="6" ry="40" fill="${C.body}"/>
      <ellipse cx="65" cy="80" rx="32" ry="38" fill="${C.purple}" transform="rotate(-20 65 80)"/>
      <ellipse cx="135" cy="80" rx="32" ry="38" fill="${C.purple}" transform="rotate(20 135 80)"/>
      <ellipse cx="60" cy="130" rx="26" ry="28" fill="${C.pink}" transform="rotate(-30 60 130)"/>
      <ellipse cx="140" cy="130" rx="26" ry="28" fill="${C.pink}" transform="rotate(30 140 130)"/>
      <circle cx="65" cy="80" r="6" fill="${C.sun}"/>
      <circle cx="135" cy="80" r="6" fill="${C.sun}"/>
      <circle cx="100" cy="65" r="6" fill="${C.body}"/>
      <line x1="98" y1="62" x2="92" y2="50" stroke="${C.body}" stroke-width="2"/>
      <line x1="102" y1="62" x2="108" y2="50" stroke="${C.body}" stroke-width="2"/>
    `),
    frog: wrap(`
      <ellipse cx="100" cy="140" rx="70" ry="40" fill="${C.leaf}"/>
      <ellipse cx="70" cy="120" rx="18" ry="16" fill="${C.leaf}"/>
      <ellipse cx="130" cy="120" rx="18" ry="16" fill="${C.leaf}"/>
      <circle cx="70" cy="118" r="10" fill="#fff"/>
      <circle cx="130" cy="118" r="10" fill="#fff"/>
      <circle cx="70" cy="120" r="6" fill="${C.body}"/>
      <circle cx="130" cy="120" r="6" fill="${C.body}"/>
      <path d="M70 150 Q100 165 130 150" stroke="${C.body}" stroke-width="3" fill="none" stroke-linecap="round"/>
      <ellipse cx="40" cy="160" rx="14" ry="8" fill="${C.leafLight}"/>
      <ellipse cx="160" cy="160" rx="14" ry="8" fill="${C.leafLight}"/>
    `),
    bee: wrap(`
      <ellipse cx="100" cy="110" rx="50" ry="36" fill="${C.sun}"/>
      <rect x="55" y="90" width="90" height="14" fill="${C.body}"/>
      <rect x="55" y="116" width="90" height="14" fill="${C.body}"/>
      <ellipse cx="70" cy="80" rx="22" ry="14" fill="#fff" opacity="0.7"/>
      <ellipse cx="130" cy="80" rx="22" ry="14" fill="#fff" opacity="0.7"/>
      <circle cx="78" cy="100" r="4" fill="${C.body}"/>
      <circle cx="122" cy="100" r="4" fill="${C.body}"/>
    `),
    // Space
    planet: wrap(`
      <circle cx="100" cy="100" r="60" fill="${C.water}"/>
      <ellipse cx="80" cy="80" rx="24" ry="14" fill="${C.leaf}"/>
      <ellipse cx="125" cy="115" rx="20" ry="10" fill="${C.leafLight}"/>
      <ellipse cx="100" cy="100" rx="90" ry="14" fill="none" stroke="${C.sun}" stroke-width="4" transform="rotate(-15 100 100)"/>
    `),
    moon: wrap(`
      <circle cx="100" cy="100" r="60" fill="#f1f5f9"/>
      <circle cx="80" cy="85" r="10" fill="#cbd5e1"/>
      <circle cx="120" cy="115" r="14" fill="#cbd5e1"/>
      <circle cx="115" cy="80" r="6" fill="#cbd5e1"/>
    `),
    star: wrap(`
      <polygon points="100,20 120,80 185,80 130,120 150,180 100,140 50,180 70,120 15,80 80,80" fill="${C.sun}" stroke="${C.sunRing}" stroke-width="3"/>
    `),
    // Earth features
    volcano: wrap(`
      <path d="M30 180 L80 60 L120 60 L170 180 Z" fill="${C.rockDark}"/>
      <path d="M80 60 L100 30 L120 60 Z" fill="${C.fire}"/>
      <path d="M85 80 Q100 50 115 80 Q120 100 100 120 Q80 100 85 80" fill="${C.fireYellow}"/>
      <circle cx="100" cy="40" r="6" fill="${C.fire}"/>
      <circle cx="115" cy="50" r="4" fill="${C.fireYellow}"/>
    `),
    mountain: wrap(`
      <path d="M10 180 L60 80 L100 130 L140 60 L190 180 Z" fill="${C.rock}"/>
      <path d="M60 80 L50 100 L60 80 L70 100 Z M140 60 L130 84 L140 60 L150 84 Z" fill="#fff"/>
    `),
    river: wrap(`
      <path d="M20 30 Q60 60 50 100 Q40 140 90 160 Q140 180 180 160" stroke="${C.water}" stroke-width="22" fill="none" stroke-linecap="round"/>
      <rect x="0" y="0" width="200" height="200" fill="${C.leaf}" opacity="0.15"/>
    `),
    ocean: wrap(`
      <rect x="0" y="100" width="200" height="100" fill="${C.water}"/>
      <path d="M0 110 Q25 100 50 110 Q75 120 100 110 Q125 100 150 110 Q175 120 200 110" stroke="${C.waterLight}" stroke-width="3" fill="none"/>
      <path d="M0 130 Q25 122 50 130 Q75 138 100 130 Q125 122 150 130 Q175 138 200 130" stroke="${C.waterLight}" stroke-width="3" fill="none"/>
      <circle cx="160" cy="50" r="22" fill="${C.sun}"/>
    `),
    fire: wrap(`
      <path d="M100 180 Q60 160 60 110 Q60 80 100 50 Q90 90 110 100 Q140 80 130 130 Q130 170 100 180 Z" fill="${C.fire}"/>
      <path d="M100 180 Q80 170 80 130 Q80 110 100 90 Q98 120 110 130 Q120 150 110 170 Q105 180 100 180 Z" fill="${C.fireYellow}"/>
    `),
    ice: wrap(`
      <path d="M100 20 L120 60 L160 70 L130 100 L140 150 L100 130 L60 150 L70 100 L40 70 L80 60 Z" fill="${C.ice}" stroke="${C.iceEdge}" stroke-width="3"/>
      <line x1="100" y1="20" x2="100" y2="180" stroke="${C.iceEdge}" stroke-width="2" opacity="0.5"/>
      <line x1="40" y1="70" x2="160" y2="70" stroke="${C.iceEdge}" stroke-width="2" opacity="0.5"/>
    `),
    magnet: wrap(`
      <path d="M50 40 L50 110 Q50 170 100 170 Q150 170 150 110 L150 40 L120 40 L120 110 Q120 140 100 140 Q80 140 80 110 L80 40 Z" fill="${C.fire}"/>
      <rect x="50" y="40" width="30" height="30" fill="${C.water}"/>
      <rect x="120" y="40" width="30" height="30" fill="${C.water}"/>
    `),
    // Body
    heart: wrap(`
      <path d="M100 170 C30 130 20 80 50 60 C80 40 100 70 100 70 C100 70 120 40 150 60 C180 80 170 130 100 170 Z" fill="${C.fire}"/>
      <path d="M70 75 Q75 70 80 75" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>
    `),
    lung: wrap(`
      <path d="M70 50 Q40 90 50 150 Q60 170 80 160 L80 50 Z" fill="${C.pink}"/>
      <path d="M130 50 Q160 90 150 150 Q140 170 120 160 L120 50 Z" fill="${C.pink}"/>
      <rect x="92" y="30" width="16" height="100" fill="${C.body}" rx="4"/>
    `),
    brain: wrap(`
      <path d="M60 80 Q40 80 40 110 Q40 140 60 140 Q70 160 100 160 Q130 160 140 140 Q160 140 160 110 Q160 80 140 80 Q130 60 100 60 Q70 60 60 80 Z" fill="${C.pink}"/>
      <path d="M100 60 L100 160 M70 75 Q90 95 75 120 M130 75 Q110 95 125 120" stroke="${C.fire}" stroke-width="2" fill="none" opacity="0.5"/>
    `),
    // Animals
    dog: wrap(`
      <ellipse cx="100" cy="120" rx="50" ry="40" fill="${C.soil}"/>
      <circle cx="100" cy="80" r="36" fill="${C.soil}"/>
      <path d="M70 60 L70 90 L84 75 Z" fill="${C.soilDark}"/>
      <path d="M130 60 L130 90 L116 75 Z" fill="${C.soilDark}"/>
      <circle cx="88" cy="80" r="4" fill="${C.body}"/>
      <circle cx="112" cy="80" r="4" fill="${C.body}"/>
      <ellipse cx="100" cy="92" rx="6" ry="4" fill="${C.body}"/>
      <path d="M94 100 Q100 108 106 100" stroke="${C.body}" stroke-width="2" fill="none"/>
    `),
    cat: wrap(`
      <circle cx="100" cy="100" r="50" fill="${C.metal}"/>
      <polygon points="60,60 75,90 90,55" fill="${C.metal}"/>
      <polygon points="140,60 125,90 110,55" fill="${C.metal}"/>
      <circle cx="84" cy="95" r="4" fill="${C.leaf}"/>
      <circle cx="116" cy="95" r="4" fill="${C.leaf}"/>
      <polygon points="100,108 95,116 105,116" fill="${C.pink}"/>
      <line x1="80" y1="115" x2="60" y2="113" stroke="${C.body}" stroke-width="1.5"/>
      <line x1="80" y1="120" x2="60" y2="122" stroke="${C.body}" stroke-width="1.5"/>
      <line x1="120" y1="115" x2="140" y2="113" stroke="${C.body}" stroke-width="1.5"/>
      <line x1="120" y1="120" x2="140" y2="122" stroke="${C.body}" stroke-width="1.5"/>
    `),
    fish: wrap(`
      <path d="M30 100 Q60 60 130 80 L150 60 L150 140 L130 120 Q60 140 30 100 Z" fill="${C.orange}"/>
      <circle cx="60" cy="95" r="6" fill="#fff"/>
      <circle cx="60" cy="95" r="3" fill="${C.body}"/>
      <path d="M80 90 Q90 100 80 110" stroke="${C.fire}" stroke-width="2" fill="none"/>
    `),
    bird: wrap(`
      <ellipse cx="100" cy="120" rx="44" ry="32" fill="${C.water}"/>
      <circle cx="80" cy="80" r="26" fill="${C.water}"/>
      <polygon points="60,82 50,90 60,98" fill="${C.sun}"/>
      <circle cx="74" cy="78" r="3" fill="${C.body}"/>
      <path d="M130 110 Q150 100 160 130 Q140 130 130 130 Z" fill="${C.waterLight}"/>
    `),
    dinosaur: wrap(`
      <path d="M50 140 Q40 100 70 90 Q80 50 130 50 Q170 60 170 110 Q180 130 160 140 Q150 165 100 165 Q70 165 50 140 Z" fill="${C.leaf}"/>
      <polygon points="80,90 85,75 90,90" fill="${C.leafLight}"/>
      <polygon points="100,80 105,65 110,80" fill="${C.leafLight}"/>
      <polygon points="120,75 125,60 130,75" fill="${C.leafLight}"/>
      <circle cx="150" cy="75" r="4" fill="${C.body}"/>
      <path d="M170 110 Q180 130 175 145" stroke="${C.leaf}" stroke-width="14" fill="none" stroke-linecap="round"/>
    `),
    // Buildings & objects
    knight: wrap(`
      <rect x="80" y="80" width="40" height="60" fill="${C.metal}" rx="6"/>
      <circle cx="100" cy="60" r="22" fill="${C.metal}"/>
      <rect x="90" y="50" width="20" height="18" fill="${C.body}"/>
      <rect x="65" y="90" width="10" height="40" fill="${C.metal}" rx="4"/>
      <rect x="125" y="90" width="10" height="40" fill="${C.metal}" rx="4"/>
      <polygon points="100,40 105,28 95,28" fill="${C.fire}"/>
      <rect x="60" y="110" width="6" height="50" fill="${C.metal}"/>
      <polygon points="56,108 70,108 63,98" fill="${C.gold}"/>
    `),
    castle: wrap(`
      <rect x="30" y="80" width="40" height="100" fill="${C.metal}"/>
      <rect x="130" y="80" width="40" height="100" fill="${C.metal}"/>
      <rect x="60" y="110" width="80" height="70" fill="${C.metal}"/>
      <polygon points="30,80 35,70 45,80 55,70 65,80" fill="${C.metal}"/>
      <polygon points="130,80 135,70 145,80 155,70 165,80" fill="${C.metal}"/>
      <rect x="88" y="130" width="24" height="50" fill="${C.body}" rx="12"/>
      <rect x="42" y="120" width="14" height="14" fill="${C.body}"/>
      <rect x="142" y="120" width="14" height="14" fill="${C.body}"/>
      <polygon points="50,70 50,55 55,60" fill="${C.fire}"/>
      <polygon points="150,70 150,55 155,60" fill="${C.fire}"/>
    `),
    map: wrap(`
      <rect x="20" y="40" width="160" height="120" fill="${C.sun}" rx="4"/>
      <path d="M30 80 Q60 60 100 90 Q140 120 170 100" stroke="${C.water}" stroke-width="6" fill="none"/>
      <polygon points="100,60 95,75 105,75" fill="${C.fire}"/>
      <text x="50" y="140" font-family="serif" font-size="14" fill="${C.body}">A</text>
      <text x="150" y="140" font-family="serif" font-size="14" fill="${C.body}">B</text>
    `),
    flag: wrap(`
      <rect x="60" y="50" width="100" height="60" fill="${C.water}"/>
      <line x1="60" y1="50" x2="60" y2="180" stroke="${C.body}" stroke-width="6"/>
      <path d="M60 50 L160 50 L160 110 L60 110 Z" fill="${C.water}"/>
      <polygon points="100,65 105,80 120,80 108,90 113,105 100,96 87,105 92,90 80,80 95,80" fill="${C.sun}"/>
    `),
    clock: wrap(`
      <circle cx="100" cy="100" r="70" fill="#fff" stroke="${C.body}" stroke-width="4"/>
      <text x="100" y="50" font-size="14" text-anchor="middle" fill="${C.body}" font-family="sans-serif" font-weight="bold">12</text>
      <text x="160" y="106" font-size="14" text-anchor="middle" fill="${C.body}" font-family="sans-serif" font-weight="bold">3</text>
      <text x="100" y="160" font-size="14" text-anchor="middle" fill="${C.body}" font-family="sans-serif" font-weight="bold">6</text>
      <text x="40" y="106" font-size="14" text-anchor="middle" fill="${C.body}" font-family="sans-serif" font-weight="bold">9</text>
      <line x1="100" y1="100" x2="100" y2="60" stroke="${C.body}" stroke-width="4" stroke-linecap="round"/>
      <line x1="100" y1="100" x2="135" y2="100" stroke="${C.fire}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="100" cy="100" r="5" fill="${C.body}"/>
    `),
    calendar: wrap(`
      <rect x="30" y="40" width="140" height="130" fill="#fff" stroke="${C.body}" stroke-width="3" rx="6"/>
      <rect x="30" y="40" width="140" height="30" fill="${C.fire}" rx="6"/>
      <rect x="55" y="30" width="14" height="24" fill="${C.body}" rx="3"/>
      <rect x="131" y="30" width="14" height="24" fill="${C.body}" rx="3"/>
      ${(()=>{let s='';for(let r=0;r<3;r++)for(let c=0;c<5;c++){const x=42+c*24, y=86+r*22; s+=`<rect x="${x}" y="${y}" width="18" height="16" fill="#f1f5f9"/>`} return s})()}
      <rect x="90" y="86" width="18" height="16" fill="${C.sun}"/>
    `)
  };

  NS.ClassTimeVisuals = {
    has(topic){ return Object.prototype.hasOwnProperty.call(VISUALS, String(topic||'').toLowerCase()); },
    get(topic){ return VISUALS[String(topic||'').toLowerCase()] || ''; },
    list(){ return Object.keys(VISUALS); }
  };
})();
