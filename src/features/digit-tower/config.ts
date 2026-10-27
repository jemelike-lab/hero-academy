// Ported from js/digit-tower.js v210. Keep in sync with the legacy file until it is retired.
export const SEASON = 1;
export const COLS = 9, ROWS = 6;
export const MIN = 60 * 1000;
export type Phase = 'hq' | 'warmup' | 'floors' | 'break' | 'bonus' | 'debrief';
export const PHASES: Array<[Phase, number]> = [['hq', 5], ['warmup', 13], ['floors', 44], ['break', 49], ['bonus', 61], ['debrief', 75]];
export const TOTAL_MIN = 75;
export const WARMUP_N = 4, DEBRIEF_N = 4, DEBRIEF_MAX = 8, DEBRIEF_UNTIL_MIN = 70;
export type Kind = 'add2' | 'add2r' | 'fact' | 'skip' | 'missing' | 'money' | 'time' | 'length' | 'arrays' | 'shapes' | 'graph' | 'three';
export interface World { n: string; std: string; vil: string; lock: string; floor: string; floor2: string; wall: string; acc: string; acc2: string; dark: boolean; kinds: Partial<Record<Kind, number>>; music: { bpm: number; root: number; scale: number[]; lead: OscillatorType; bass: OscillatorType } }
export const C = { ink:'#0b0c22', cream:'#fff6e5', gold:'#ffc72c', magenta:'#ff4f8b', cyan:'#35e0ff', coral:'#ff6b4a', mint:'#5cf0b0', violet:'#7b3fe4' };
export const WORLDS: World[] = [
    { n:'Gem Vaults',       std:'two-digit addition',        vil:'The Locksmith',       lock:'lock',  floor:'#26245f', floor2:'#2c2a6b', wall:'#131437', acc:'#ffc72c', acc2:'#35e0ff', dark:false, kinds:{add2:.3, add2r:.5, skip:.2}, music:{bpm:112, root:57, scale:[0,2,4,7,9], lead:'square', bass:'triangle'} },
    { n:'Frost Lab',        std:'regrouping',                vil:'Captain Freeze',      lock:'ice',   floor:'#cfe9f7', floor2:'#bddff2', wall:'#5b8fb0', acc:'#0b4f7a', acc2:'#ff4f8b', dark:true,  kinds:{add2r:.8, add2:.2}, music:{bpm:96, root:62, scale:[0,2,3,7,8], lead:'triangle', bass:'sine'} },
    { n:'Jungle Ruins',     std:'skip counting',             vil:'The Vine Queen',      lock:'vine',  floor:'#2f6b3a', floor2:'#37784a', wall:'#1a3d22', acc:'#ffb347', acc2:'#e6ff6a', dark:false, kinds:{skip:.7, add2:.3}, music:{bpm:124, root:55, scale:[0,3,5,7,10], lead:'square', bass:'triangle'} },
    { n:'Robot Factory',    std:'missing addend',            vil:'Unit Zero',           lock:'gear',  floor:'#4a4f5c', floor2:'#555b69', wall:'#23262e', acc:'#ff8a3d', acc2:'#35e0ff', dark:false, kinds:{missing:.7, add2r:.3}, music:{bpm:118, root:52, scale:[0,2,3,5,7,10], lead:'sawtooth', bass:'square'} },
    { n:'Coin Harbor',      std:'money',                     vil:'Pirate Penny',        lock:'chest', floor:'#e8d6a8', floor2:'#dcc78f', wall:'#1c6e7a', acc:'#c98a1b', acc2:'#1c6e7a', dark:true,  kinds:{money:.7, skip:.3}, music:{bpm:104, root:60, scale:[0,2,4,5,7,9], lead:'triangle', bass:'triangle'} },
    { n:'Clock Tower',      std:'telling time',              vil:'The Tick-Tock Twins', lock:'clock', floor:'#5a2a2f', floor2:'#66333a', wall:'#2b1316', acc:'#e0b45c', acc2:'#fff6e5', dark:false, kinds:{time:.7, skip:.3}, music:{bpm:100, root:57, scale:[0,2,4,7,9], lead:'square', bass:'sine'} },
    { n:'Measure Mountain', std:'length',                    vil:'Yeti Yardstick',      lock:'plank', floor:'#eef3f7', floor2:'#dde6ee', wall:'#2d5a4a', acc:'#2d5a4a', acc2:'#ff6b4a', dark:true,  kinds:{length:.7, add2r:.3}, music:{bpm:92, root:64, scale:[0,2,4,7,9], lead:'triangle', bass:'triangle'} },
    { n:'Array Arcade',     std:'arrays',                    vil:'The Grid Gremlin',    lock:'grid',  floor:'#1a0b2e', floor2:'#22103a', wall:'#0a0414', acc:'#ff4f8b', acc2:'#35e0ff', dark:false, kinds:{arrays:.7, fact:.3}, music:{bpm:132, root:57, scale:[0,3,5,7,10], lead:'square', bass:'square'} },
    { n:'Shape Caverns',    std:'geometry',                  vil:'Polygon Pete',        lock:'shape', floor:'#3b2a5c', floor2:'#46336b', wall:'#1d1430', acc:'#ffa94d', acc2:'#5cf0b0', dark:false, kinds:{shapes:.7, add2:.3}, music:{bpm:108, root:55, scale:[0,2,3,7,8], lead:'triangle', bass:'sine'} },
    { n:'Data Dome',        std:'graphs',                    vil:'Chart Shark',         lock:'chart', floor:'#0f4c5c', floor2:'#135a6c', wall:'#062830', acc:'#ff6b4a', acc2:'#5cf0b0', dark:false, kinds:{graph:.7, missing:.3}, music:{bpm:110, root:60, scale:[0,2,4,7,9], lead:'sawtooth', bass:'triangle'} },
    { n:'Hundred Heights',  std:'three-digit place value',   vil:'General Thousand',    lock:'lift',  floor:'#a9c8e8', floor2:'#98bde3', wall:'#3c5f8a', acc:'#ffc72c', acc2:'#fff6e5', dark:true,  kinds:{three:.7, add2r:.3}, music:{bpm:116, root:62, scale:[0,2,4,5,7,9,11], lead:'square', bass:'triangle'} },
    { n:"Digit's Citadel",  std:'everything',                vil:'Doctor Digit',        lock:'skull', floor:'#1a1020', floor2:'#22152a', wall:'#080408', acc:'#ff2e5b', acc2:'#7b3fe4', dark:false, kinds:{add2r:.2, missing:.2, skip:.15, money:.15, time:.1, arrays:.1, three:.1}, music:{bpm:128, root:52, scale:[0,1,3,5,7,8,10], lead:'sawtooth', bass:'square'} },
];
// Twists: unlock as the season goes (gd = game days completed)
export const TWISTS = [
    { id:'none',   label:'Clear skies',   from:0 },
    { id:'fog',    label:'Fog',           from:1 },
    { id:'gems',   label:'Gem rush',      from:1 },
    { id:'mirror', label:'Mirror',        from:2 },
    { id:'ralphie',label:'Ralphie rescue',from:2 },
    { id:'night',  label:'Night floor',   from:4 },
];
export const RANKS = [
    { n:'Cadet',    at:0,   suit:'#9aa0b5', cape:'#5a6078' },
    { n:'Scout',    at:25,  suit:'#35e0ff', cape:'#1c6e7a' },
    { n:'Guardian', at:60,  suit:'#ffc72c', cape:'#ff4f8b' },
    { n:'Captain',  at:110, suit:'#ffc72c', cape:'#7b3fe4' },
    { n:'Legend',   at:180, suit:'#fff6e5', cape:'#ff4f8b' },
];
export function rankFor(firstTry: number) { let r = 0; RANKS.forEach((k, i) => { if (firstTry >= k.at) r = i; }); return r; }
