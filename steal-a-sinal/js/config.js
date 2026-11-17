'use strict';
/* Steal a Sinal — constants, sinal catalogue, small helpers */

const TAU = Math.PI * 2;
const WORLD_W = 2600, WORLD_H = 1700;
const PLAZA = { x0: 60, y0: 600, x1: 2540, y1: 1100 };
const BELT_Y = 850, BELT_X0 = 80, BELT_X1 = 2520, BELT_SPEED = 46, SPAWN_EVERY = 2.4;
const R = 16;                       // actor radius
const BASE_W = 620, BASE_H = 430, GATE_W = 150, WALL = 20;
const PLAYER_BASE = 4;              // bottom middle
const SAVE_KEY = 'steal-a-sinal-v1';
const START_CASH = 200;

const RARITY = {
  common:    { name: 'Common',    color: '#a9bdd4', weight: 560, luck: 0 },
  uncommon:  { name: 'Uncommon',  color: '#6fe39a', weight: 250, luck: 0 },
  rare:      { name: 'Rare',      color: '#5cb8ff', weight: 120, luck: 0.2 },
  epic:      { name: 'Epic',      color: '#c98bff', weight: 50,  luck: 0.35 },
  legendary: { name: 'Legendary', color: '#ffc94d', weight: 15,  luck: 0.5 },
  mythic:    { name: 'Mythic',    color: '#ff6b8b', weight: 4,   luck: 0.6 },
  secret:    { name: 'Secret',    color: '#ffffff', weight: 1,   luck: 0.6 },
};
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'secret'];

// tint: [css colour, strength 0..1] blended over the picture; gray: desaturate amount
const SINAL_DEFS = [
  { id: 'sleepy',  name: 'Sleepy Sinal',       rarity: 'common',    price: 50,      income: 2,     gray: 0.75 },
  { id: 'petal',   name: 'Petal Sinal',        rarity: 'common',    price: 120,     income: 5 },
  { id: 'breezy',  name: 'Breezy Sinal',       rarity: 'common',    price: 260,     income: 10,    tint: ['#6fe0ff', 0.35] },
  { id: 'minty',   name: 'Minty Sinal',        rarity: 'uncommon',  price: 600,     income: 22,    tint: ['#55e39a', 0.55] },
  { id: 'peachy',  name: 'Peachy Sinal',       rarity: 'uncommon',  price: 1300,    income: 44,    tint: ['#ffab7a', 0.6] },
  { id: 'frosty',  name: 'Frosty Sinal',       rarity: 'rare',      price: 3200,    income: 95,    tint: ['#2f8dff', 0.6] },
  { id: 'dreamy',  name: 'Dreamy Sinal',       rarity: 'rare',      price: 7000,    income: 190,   tint: ['#b7a2ff', 0.65] },
  { id: 'royal',   name: 'Royal Sinal',        rarity: 'epic',      price: 16000,   income: 400,   tint: ['#9a4dff', 0.7] },
  { id: 'neon',    name: 'Neon Sinal',         rarity: 'epic',      price: 38000,   income: 850,   tint: ['#ff4fd8', 0.7] },
  { id: 'golden',  name: 'Golden Sinal',       rarity: 'legendary', price: 110000,  income: 2200,  tint: ['#ffc21f', 0.8] },
  { id: 'starlit', name: 'Starlit Sinal',      rarity: 'legendary', price: 280000,  income: 5000,  tint: ['#3a49ff', 0.75] },
  { id: 'prism',   name: 'Prism Sinal',        rarity: 'mythic',    price: 1200000, income: 17000, rainbow: 0.7 },
  { id: 'true',    name: 'The One True Sinal', rarity: 'secret',    price: 6000000, income: 70000 },
];
const DEF_BY_ID = {};
SINAL_DEFS.forEach((d, i) => {
  d.index = i;
  d.color = RARITY[d.rarity].color;
  d.tier = RARITY_ORDER.indexOf(d.rarity);
  DEF_BY_ID[d.id] = d;
});

const RIVALS = [
  { name: 'Vex',   color: '#ff6b6b', speed: 205, greed: 1.0,  nerve: 0.55 },
  { name: 'Nova',  color: '#ffb347', speed: 195, greed: 1.15, nerve: 0.35 },
  { name: 'Hertz', color: '#b388ff', speed: 212, greed: 0.8,  nerve: 0.7 },
  { name: 'Echo',  color: '#6fe39a', speed: 190, greed: 1.05, nerve: 0.45 },
  { name: 'Blip',  color: '#ff7ad9', speed: 200, greed: 0.9,  nerve: 0.6 },
];
const PLAYER_COLOR = '#8ecbff';

const UPGRADES = [
  { id: 'speed',  name: 'Sneakers',       desc: 'Run faster',                   max: 5, base: 400,  mult: 3 },
  { id: 'grip',   name: 'Grip Gloves',    desc: 'Less slowdown while carrying', max: 4, base: 600,  mult: 3 },
  { id: 'shield', name: 'Shield Battery', desc: '+10s of shield per lock',      max: 5, base: 500,  mult: 3 },
  { id: 'pads',   name: 'Extra Pad',      desc: 'Room for one more sinal',      max: 4, base: 1500, mult: 5 },
  { id: 'hands',  name: 'Fast Hands',     desc: 'Steal quicker',                max: 4, base: 800,  mult: 3 },
  { id: 'tuner',  name: 'Lucky Charm',    desc: 'Rarer sinals on the belt',     max: 5, base: 2500, mult: 4 },
];

/* ---------- helpers ---------- */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const dist2 = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; };
const dist = (a, b) => Math.sqrt(dist2(a, b));

function fmt(n) {
  n = Math.floor(n);
  if (!isFinite(n) || n < 0) n = 0;
  if (n < 1000) return String(n);
  const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];
  let u = -1;
  while (n >= 1000 && u < units.length - 1) { n /= 1000; u++; }
  const v = n >= 100 ? Math.floor(n) : n >= 10 ? Math.floor(n * 10) / 10 : Math.floor(n * 100) / 100;
  return v + units[u];
}
