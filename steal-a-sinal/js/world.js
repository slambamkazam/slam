'use strict';
/* Steal a Sinal — world state, bases, the sinal lifecycle, saving */

const game = {
  time: 0, bases: [], actors: [], sinals: [], player: null,
  fx: [], floaters: [], spawnT: 1, pity: 0, uid: 1,
  up: { speed: 0, grip: 0, shield: 0, pads: 0, hands: 0, tuner: 0 },
  rebirths: 0, log: {}, stats: { bought: 0, stolen: 0, lost: 0 },
  raidCd: 0, started: false, paused: true, shake: 0, mute: false, hints: {},
  playerRate: 0,
};

const playerSpeed = () => 230 + game.up.speed * 18;
const carryFactor = () => 0.76 + game.up.grip * 0.06;
const shieldDur = () => 40 + game.up.shield * 10;
const stealTime = () => 1.5 - game.up.hands * 0.22;
const luck = () => game.up.tuner + game.rebirths * 0.5;
const incomeMult = () => 1 + game.rebirths * 0.5;
const rebirthCost = () => 500000 * Math.pow(6, game.rebirths);
const upCost = (u) => Math.round(u.base * Math.pow(u.mult, game.up[u.id]));

/* ---------- geometry ---------- */
function inPlaza(x, y) {
  return x >= PLAZA.x0 + R && x <= PLAZA.x1 - R && y >= PLAZA.y0 + R && y <= PLAZA.y1 - R;
}
function inInterior(b, x, y) {
  return x >= b.x0 + R && x <= b.x1 - R && y >= b.y0 + R && y <= b.y1 - R;
}
function inCorridor(b, x, y) {
  if (x < b.gx0 + R || x > b.gx1 - R) return false;
  return b.top ? (y > b.y1 - R && y < PLAZA.y0 + R) : (y < b.y0 + R && y > PLAZA.y1 - R);
}
// Which base a walkable position belongs to (interior or its gate), or null for the plaza.
function baseAt(x, y) {
  if (y >= PLAZA.y0 + R && y <= PLAZA.y1 - R) return null;
  const top = y < PLAZA.y0 + R;
  for (const b of game.bases) if (b.top === top && x >= b.x0 && x <= b.x1) return b;
  return null;
}
function insideBase(b, a) {
  return a.x >= b.x0 && a.x <= b.x1 && a.y >= b.y0 && a.y <= b.y1;
}

/* ---------- construction ---------- */
function newActor(base, isPlayer, cfg) {
  return {
    isPlayer, name: cfg.name, color: cfg.color, base,
    x: base.gateIn.x, y: base.gateIn.y, face: base.top ? Math.PI / 2 : -Math.PI / 2,
    moving: false, walk: 0, cash: 0, speed: cfg.speed,
    carrying: null, stun: 0, immune: 0, zapCd: 0, windup: 0, channel: null, onLock: false,
    ai: isPlayer ? null : {
      cfg, state: 'home', t: rand(1.5, 6), stateT: 0, path: [], repath: 0, stuck: 0,
      target: null, pad: null, sinal: null, raiding: null, alerted: false,
    },
  };
}

function buildWorld(save) {
  game.bases = []; game.actors = []; game.sinals = []; game.fx = []; game.floaters = [];
  game.time = 0; game.spawnT = 1; game.pity = 0; game.raidCd = 0; game.shake = 0;
  game.up = { speed: 0, grip: 0, shield: 0, pads: 0, hands: 0, tuner: 0 };
  game.rebirths = 0; game.log = {}; game.stats = { bought: 0, stolen: 0, lost: 0 }; game.hints = {};

  const xs = [500, 1300, 2100];
  let ri = 0;
  for (let i = 0; i < 6; i++) {
    const top = i < 3, cx = xs[i % 3];
    const y0 = top ? PLAZA.y0 - WALL - BASE_H : PLAZA.y1 + WALL;
    const b = {
      idx: i, top, cx, x0: cx - BASE_W / 2, x1: cx + BASE_W / 2, y0, y1: y0 + BASE_H,
      gx0: cx - GATE_W / 2, gx1: cx + GATE_W / 2,
      gateIn: { x: cx, y: top ? y0 + BASE_H - 45 : y0 + 45 },
      gateOut: { x: cx, y: top ? PLAZA.y0 + 45 : PLAZA.y1 - 45 },
      lock: { x: cx, y: top ? y0 + BASE_H - 82 : y0 + 82 },
      pads: [], shield: 0, raider: null, owner: null, income: 0,
    };
    for (let p = 0; p < 10; p++) {
      const fromBack = p < 5 ? 225 : 95;          // pads 0-4 sit nearer the gate
      b.pads.push({
        base: b, idx: p, x: b.x0 + 70 + (p % 5) * 120, y: top ? b.y0 + fromBack : b.y1 - fromBack,
        sinal: null, reserved: null, stored: 0, unlocked: p < 8,
      });
    }
    const isPlayer = i === PLAYER_BASE;
    const a = newActor(b, isPlayer, isPlayer ? { name: 'You', color: PLAYER_COLOR, speed: 230 } : RIVALS[ri++]);
    b.owner = a;
    game.bases.push(b);
    game.actors.push(a);
    if (isPlayer) game.player = a;
  }

  const p = game.player, pb = p.base;
  p.cash = START_CASH;
  if (save) applySave(save);
  pb.pads.forEach((pad, i) => { pad.unlocked = i < 6 + game.up.pads; });

  // Rivals start with a little loot worth taking, scaled to how far the player already is.
  let topIdx = -1;
  for (const pad of pb.pads) if (pad.sinal) topIdx = Math.max(topIdx, pad.sinal.def.index);
  for (const a of game.actors) {
    if (a.isPlayer) continue;
    const n = topIdx < 0 ? 2 : 3 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const idx = topIdx < 0 ? Math.floor(rand(0, 4.99)) : clamp(topIdx + Math.floor(rand(-3, 1.99)), 0, 10);
      const pad = freePad(a.base);
      if (pad) placeOnPad(makeSinal(SINAL_DEFS[idx], pad.x, pad.y), pad);
    }
    a.cash = rand(0, 150);
  }
  for (let x = BELT_X0 + 60; x < BELT_X1 - 100; x += BELT_SPEED * SPAWN_EVERY) makeSinal(rollDef(), x, BELT_Y);
  refreshIncome();
}

/* ---------- sinal lifecycle ----------
   state: 'belt' (for sale) | 'pad' (owned) | 'fly' (travelling to sinal.pad) | 'carried' (being stolen)
   A pad holds `sinal` when occupied and `reserved` while a sinal is on its way or may come back. */
function makeSinal(def, x, y) {
  const s = { uid: game.uid++, def, state: 'belt', x, y, pad: null, fromPad: null, carrier: null, fly: null, phase: Math.random() * TAU };
  game.sinals.push(s);
  return s;
}
function removeSinal(s) {
  s.state = 'gone';
  const i = game.sinals.indexOf(s);
  if (i >= 0) game.sinals.splice(i, 1);
}
function freePad(base) {
  for (const p of base.pads) if (p.unlocked && !p.sinal && !p.reserved) return p;
  return null;
}
function placeOnPad(s, pad) {
  s.state = 'pad'; s.pad = pad; s.x = pad.x; s.y = pad.y; s.fly = null; s.carrier = null;
  pad.sinal = s; pad.reserved = null;
}
function flyTo(s, pad) {
  s.state = 'fly'; s.pad = pad; s.carrier = null; pad.reserved = s;
  s.fly = { sx: s.x, sy: s.y, t: 0, dur: clamp(Math.hypot(pad.x - s.x, pad.y - s.y) / 1000, 0.35, 0.9) };
}

function rollDef() {
  const L = luck();
  let total = 0;
  const ws = RARITY_ORDER.map((k) => { const w = RARITY[k].weight * (1 + RARITY[k].luck * L); total += w; return w; });
  let roll = Math.random() * total, tier = 0;
  for (let i = 0; i < ws.length; i++) { roll -= ws[i]; if (roll <= 0) { tier = i; break; } }
  if (++game.pity >= 45 && tier < 4) tier = 4;      // a legendary shows up at least every ~2 minutes
  if (tier >= 4) game.pity = 0;
  const pool = SINAL_DEFS.filter((d) => d.tier === tier);
  const r = Math.random();
  return pool[Math.min(pool.length - 1, r < 0.58 ? 0 : r < 0.86 ? 1 : 2)];
}

function buySinal(a, s) {
  if (s.state !== 'belt' || a.cash < s.def.price) return false;
  const pad = freePad(a.base);
  if (!pad) return false;
  a.cash -= s.def.price;
  flyTo(s, pad);
  return true;
}

// Finish a steal: the sinal leaves `pad` and rides on the thief until delivered or dropped.
function grabSinal(a, pad) {
  const s = pad.sinal;
  if (!s || s.state !== 'pad' || a.carrying || pad.base === a.base) return false;
  const dest = freePad(a.base);
  if (!dest) return false;
  pad.sinal = null; pad.reserved = s; dest.reserved = s;
  s.state = 'carried'; s.carrier = a; s.fromPad = pad; s.pad = dest; s.fly = null;
  a.carrying = s;
  return true;
}
function deliverCarry(a) {
  const s = a.carrying;
  if (!s) return null;
  a.carrying = null;
  if (s.fromPad && s.fromPad.reserved === s) s.fromPad.reserved = null;
  s.fromPad = null;
  flyTo(s, s.pad);
  return s;
}
// Thief got zapped: the sinal flies back where it came from.
function dropCarry(a) {
  const s = a.carrying;
  if (!s) return null;
  a.carrying = null;
  const from = s.fromPad, dest = s.pad;
  s.fromPad = null;
  if (from) {
    if (dest && dest.reserved === s) dest.reserved = null;
    flyTo(s, from);
  } else {
    flyTo(s, dest);
  }
  return s;
}
function sellPad(a, pad) {
  const s = pad.sinal;
  if (!s || s.state !== 'pad') return 0;
  pad.sinal = null;
  removeSinal(s);
  const gain = Math.floor(s.def.price * 0.5) + Math.floor(pad.stored);
  pad.stored = 0;
  a.cash += gain;
  return gain;
}

function refreshIncome() {
  for (const b of game.bases) {
    let inc = 0;
    for (const p of b.pads) if (p.sinal) inc += p.sinal.def.income;
    b.income = inc;
  }
  game.playerRate = game.player.base.income * incomeMult();
}

function updateWorld(dt) {
  game.time += dt;
  if (game.raidCd > 0) game.raidCd -= dt;

  game.spawnT -= dt;
  if (game.spawnT <= 0) { game.spawnT += SPAWN_EVERY; makeSinal(rollDef(), BELT_X0, BELT_Y); }

  for (let i = game.sinals.length - 1; i >= 0; i--) {
    const s = game.sinals[i];
    s.phase += dt;
    if (s.state === 'belt') {
      s.x += BELT_SPEED * dt;
      if (s.x > BELT_X1) removeSinal(s);
    } else if (s.state === 'fly') {
      const f = s.fly, pad = s.pad;
      f.t += dt;
      const k = Math.min(1, f.t / f.dur), e = k * k * (3 - 2 * k);
      s.x = lerp(f.sx, pad.x, e);
      s.y = lerp(f.sy, pad.y, e) - Math.sin(k * Math.PI) * 46;
      if (k >= 1) placeOnPad(s, pad);
    } else if (s.state === 'carried') {
      s.x = s.carrier.x; s.y = s.carrier.y - 36;
    }
  }

  refreshIncome();
  const mult = incomeMult();
  for (const b of game.bases) {
    if (b.shield > 0) b.shield = Math.max(0, b.shield - dt);
    const o = b.owner;
    if (o.isPlayer) {
      for (const p of b.pads) if (p.sinal) p.stored += p.sinal.def.income * mult * dt;
    } else {
      const g = o.ai.cfg.greed;
      o.cash += (b.income * 0.5 + 1.5 + 0.3 * game.playerRate * g) * dt;
      o.cash = Math.min(o.cash, Math.max(600, game.playerRate * 60 * g));
    }
  }
}

/* ---------- rebirth ---------- */
function doRebirth() {
  const p = game.player, cost = rebirthCost();
  if (p.cash < cost) return false;
  if (p.carrying) dropCarry(p);
  p.channel = null;
  for (const pad of p.base.pads) {
    if (pad.sinal) { const s = pad.sinal; pad.sinal = null; removeSinal(s); }
    const r = pad.reserved;
    if (r) {
      pad.reserved = null;
      if (r.state === 'fly') removeSinal(r);          // was on its way here
      else if (r.fromPad === pad) r.fromPad = null;   // a rival is running off with it: theirs now
    }
    pad.stored = 0;
  }
  game.rebirths++;
  p.cash = START_CASH;
  refreshIncome();
  return true;
}

/* ---------- saving ---------- */
function saveGame() {
  if (!game.started) return;
  try {
    const p = game.player;
    const data = {
      v: 1, cash: Math.floor(p.cash), rebirths: game.rebirths, up: game.up,
      pads: p.base.pads.map((pad) => {
        if (pad.sinal) return pad.sinal.def.id;
        const r = pad.reserved;      // still counts as the player's: flying in, or stolen but not yet delivered
        if (r && (r.state === 'fly' || r.fromPad === pad)) return r.def.id;
        return null;
      }),
      stored: p.base.pads.map((pad) => Math.floor(pad.stored)),
      log: Object.keys(game.log), stats: game.stats, hints: game.hints, mute: game.mute,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { /* storage unavailable: play on without saving */ }
}
function loadSave() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY));
    return d && d.v === 1 && typeof d.cash === 'number' ? d : null;
  } catch (e) { return null; }
}
function wipeSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing to wipe */ }
}
function applySave(d) {
  const p = game.player, num = (v, lo, hi) => clamp(Math.floor(Number(v)) || 0, lo, hi);
  p.cash = num(d.cash, 0, 1e18);
  game.rebirths = num(d.rebirths, 0, 60);
  for (const u of UPGRADES) game.up[u.id] = num(d.up && d.up[u.id], 0, u.max);
  const unlocked = 6 + game.up.pads;
  if (Array.isArray(d.pads)) {
    d.pads.slice(0, unlocked).forEach((id, i) => {
      const def = DEF_BY_ID[id], pad = p.base.pads[i];
      if (!def) return;
      placeOnPad(makeSinal(def, pad.x, pad.y), pad);
      pad.stored = num(d.stored && d.stored[i], 0, 1e18);
    });
  }
  if (Array.isArray(d.log)) for (const id of d.log) if (DEF_BY_ID[id]) game.log[id] = true;
  if (d.stats) for (const k of Object.keys(game.stats)) game.stats[k] = num(d.stats[k], 0, 1e12);
  if (d.hints && typeof d.hints === 'object') game.hints = d.hints;
  game.mute = !!d.mute;
}
