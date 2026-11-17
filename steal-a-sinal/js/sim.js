'use strict';
/* Steal a Sinal — movement, the player, zapping, and rival AI */

const input = { x: 0, y: 0, action: false, zap: false };
let actionPrompt = { type: 'none', label: 'Find a sinal', enabled: false, target: null };

/* ---------- movement ---------- */
// Walkable space is the plaza plus each base interior, joined by gate corridors.
// A shielded base lets strangers out but never in.
function canOccupy(a, nx, ny) {
  if (inPlaza(nx, ny)) return true;
  for (const b of game.bases) {
    const blocked = b.shield > 0 && a.base !== b;
    if (inInterior(b, nx, ny)) return !blocked || inInterior(b, a.x, a.y);
    if (inCorridor(b, nx, ny)) {
      if (!blocked) return true;
      const outward = b.top ? ny >= a.y : ny <= a.y;
      return outward && (inCorridor(b, a.x, a.y) || inInterior(b, a.x, a.y));
    }
  }
  return false;
}
function tryAxis(a, dx, dy) {
  for (let f = 1; f > 0.05; f *= 0.5) {      // blocked: creep up to the wall instead of stopping short
    const nx = a.x + dx * f, ny = a.y + dy * f;
    if (canOccupy(a, nx, ny)) { a.x = nx; a.y = ny; return; }
  }
}
function moveActor(a, dx, dy) {
  if (dx) tryAxis(a, dx, 0);
  if (dy) tryAxis(a, 0, dy);
}
function validPos(x, y) {
  if (inPlaza(x, y)) return true;
  for (const b of game.bases) if (inInterior(b, x, y) || inCorridor(b, x, y)) return true;
  return false;
}
function tickTimers(a, dt) {
  if (a.stun > 0) a.stun = Math.max(0, a.stun - dt);
  if (a.immune > 0) a.immune = Math.max(0, a.immune - dt);
  if (a.zapCd > 0) a.zapCd = Math.max(0, a.zapCd - dt);
  if (!validPos(a.x, a.y)) { a.x = a.base.gateIn.x; a.y = a.base.gateIn.y; }   // safety net, should never fire
}

/* ---------- zapping ---------- */
function stunActor(o, dur, by) {
  o.stun = dur; o.immune = dur + 1.2; o.channel = null; o.windup = 0; o.moving = false;
  addFx('hit', o.x, o.y, '#ffe27a');
  const dropped = o.carrying ? dropCarry(o) : null;
  if (o.isPlayer) {
    game.shake = 0.35;
    sfx('hurt');
    toast(dropped ? `${by.name} zapped you. The sinal went back.` : `${by.name} zapped you!`, 'bad');
  } else {
    aiSetState(o, 'return');
    if (by.isPlayer && dropped && dropped.pad.base === game.player.base) toast(`Got your ${dropped.def.name} back!`, 'good');
  }
}
function doZap(a, onlyTarget) {
  if (a.zapCd > 0 || a.stun > 0) return false;
  a.zapCd = a.isPlayer ? 0.55 : 1.3;
  const range = a.isPlayer ? 88 : 70;
  addFx('zap', a.x, a.y, a.isPlayer ? '#8ecbff' : a.color, range);
  if (a.isPlayer) sfx('zap');
  let hit = false;
  for (const o of game.actors) {
    if (o === a || (onlyTarget && o !== onlyTarget) || o.immune > 0) continue;
    if (dist2(a, o) <= range * range) { stunActor(o, o.isPlayer ? 1.0 : 2.0, a); hit = true; }
  }
  return hit;
}

/* ---------- player ---------- */
function logSinal(def) {
  if (game.log[def.id]) return;
  game.log[def.id] = true;
  const n = Object.keys(game.log).length;
  toast(n === SINAL_DEFS.length ? 'Sinal Log complete. You found every sinal!' : `New in your log: ${def.name}`, 'gold');
  uiDirty.log = true;
}
function hint(key, msg) {
  if (game.hints[key]) return;
  game.hints[key] = 1;
  toast(msg, '', 5200);
}

function computePrompt() {
  const p = game.player;
  const none = (label) => ({ type: 'none', label, enabled: false, target: null });
  if (p.stun > 0) return none('Stunned!');
  if (p.channel) return { type: 'channel', label: p.channel.type === 'steal' ? 'Stealing…' : 'Selling…', enabled: false, target: p.channel.pad };
  if (p.carrying) return none('Run home with it!');

  const here = baseAt(p.x, p.y);
  if (!here) {
    let best = null, bd = 82 * 82;
    for (const s of game.sinals) {
      if (s.state !== 'belt') continue;
      const d = dist2(p, s);
      if (d < bd) { bd = d; best = s; }
    }
    if (best) {
      const price = best.def.price;
      if (!freePad(p.base)) return { type: 'buy', label: 'Base full. Sell a sinal first', enabled: false, target: best };
      if (p.cash < price) return { type: 'buy', label: `Need $${fmt(price - p.cash)} more`, enabled: false, target: best };
      return { type: 'buy', label: `Buy ${best.def.name} · $${fmt(price)}`, enabled: true, target: best };
    }
    return none('Find a sinal');
  }

  let pad = null, bd = 62 * 62;
  for (const q of here.pads) {
    if (!q.sinal) continue;
    const d = dist2(p, q);
    if (d < bd) { bd = d; pad = q; }
  }
  if (!pad) return none(here === p.base ? 'Stand by a sinal to sell it' : 'Stand by a sinal to steal it');
  if (here === p.base) return { type: 'sell', label: `Sell ${pad.sinal.def.name} · +$${fmt(pad.sinal.def.price * 0.5)}`, enabled: true, target: pad };
  if (!freePad(p.base)) return { type: 'steal', label: 'Your base is full', enabled: false, target: pad };
  return { type: 'steal', label: `Steal ${pad.sinal.def.name}`, enabled: true, target: pad };
}

function doAction() {
  const p = game.player, pr = actionPrompt;
  if (!pr.enabled) return;
  if (pr.type === 'buy') {
    const s = pr.target;
    if (buySinal(p, s)) {
      game.stats.bought++;
      sfx('buy');
      addFloater(p.x, p.y - 40, `-$${fmt(s.def.price)}`, '#ff9a9a');
      logSinal(s.def);
      hint('home', 'It pays into its pad. Walk through your base to collect the cash.');
    }
  } else if (pr.type === 'steal' || pr.type === 'sell') {
    const pad = pr.target;
    p.channel = { type: pr.type, pad, sinal: pad.sinal, t: 0, dur: pr.type === 'steal' ? stealTime() : 0.9 };
    sfx('tick');
  }
}

function updatePlayer(dt) {
  const p = game.player, b = p.base;
  tickTimers(p, dt);

  let mx = input.x, my = input.y;
  const mag = Math.hypot(mx, my);
  if (mag > 1) { mx /= mag; my /= mag; }
  p.moving = p.stun <= 0 && mag > 0.05;
  if (p.moving) {
    const sp = playerSpeed() * (p.carrying ? carryFactor() : 1);
    p.face = Math.atan2(my, mx);
    p.walk += dt * 11 * Math.min(1, mag);
    moveActor(p, mx * sp * dt, my * sp * dt);
  }

  // shield tile: stepping on it (or standing on it when the shield runs out) locks the base
  const on = dist2(p, b.lock) < 40 * 40;
  if (on && (!p.onLock || b.shield <= 0) && b.shield < shieldDur() - 1) {
    b.shield = shieldDur();
    sfx('shield');
    addFx('zap', b.lock.x, b.lock.y, '#8ecbff', 70);
    hint('shield', `Shield up for ${shieldDur()}s. Rivals can't get in until it runs out.`);
  }
  p.onLock = on;

  if (insideBase(b, p)) {
    let got = 0;
    for (const pad of b.pads) {
      if (pad.stored >= 1 && dist2(p, pad) < 100 * 100) {
        const c = Math.floor(pad.stored);
        pad.stored -= c; got += c;
        addFloater(pad.x, pad.y - 30, `+$${fmt(c)}`, '#ffc94d');
      }
    }
    if (got) { p.cash += got; sfx('coin'); }
    if (p.carrying) {
      const s = deliverCarry(p);
      game.stats.stolen++;
      sfx('win');
      toast(`Stole a ${s.def.name}! +$${fmt(s.def.income * incomeMult())}/s`, 'good');
      logSinal(s.def);
    }
  }

  if (p.channel) {
    const c = p.channel, pad = c.pad;
    const ok = p.stun <= 0 && pad.sinal === c.sinal && dist2(p, pad) < 84 * 84 && (c.type === 'sell' || freePad(b));
    if (!ok) p.channel = null;
    else if ((c.t += dt) >= c.dur) {
      p.channel = null;
      if (c.type === 'steal') {
        if (grabSinal(p, pad)) {
          sfx('grab');
          toast(`You grabbed ${pad.base.owner.name}'s ${c.sinal.def.name}. Run home!`, 'gold');
          aiAlert(pad.base.owner, p);
        }
      } else {
        const gain = sellPad(p, pad);
        if (gain) { sfx('coin'); addFloater(pad.x, pad.y - 30, `+$${fmt(gain)}`, '#ffc94d'); }
      }
    }
  }

  actionPrompt = computePrompt();
  if (input.action) { input.action = false; doAction(); actionPrompt = computePrompt(); }
  if (input.zap) { input.zap = false; doZap(p); }
}

/* ---------- rival AI ---------- */
function aiSetState(a, state) {
  const ai = a.ai;
  if (ai.raiding && state !== 'steal_go' && state !== 'steal_grab') {
    if (ai.raiding.raider === a) ai.raiding.raider = null;
    if (ai.raiding.owner.isPlayer) game.raidCd = rand(28, 48);
    ai.raiding = null;
  }
  ai.state = state; ai.stateT = 0; ai.path = []; ai.repath = 0; ai.stuck = 0; a.windup = 0;
  if (state === 'home') ai.t = rand(2.5, 7);
  if (state !== 'chase') ai.target = null;
  if (state !== 'steal_go' && state !== 'steal_grab' && state !== 'buy') { ai.pad = null; ai.sinal = null; }
}
function planPath(a, tx, ty) {
  const path = [], sa = baseAt(a.x, a.y), sb = baseAt(tx, ty);
  if (sa !== sb) {
    if (sa) {
      const deeper = sa.top ? a.y < sa.gateIn.y : a.y > sa.gateIn.y;
      if (deeper) path.push(sa.gateIn);
      path.push(sa.gateOut);
    }
    if (sb) path.push(sb.gateOut, sb.gateIn);
  }
  path.push({ x: tx, y: ty });
  return path;
}
// Walk the current path. Returns true once it is finished.
function followPath(a, speed, dt) {
  const ai = a.ai;
  const wp = ai.path[0];
  if (!wp) return true;
  const dx = wp.x - a.x, dy = wp.y - a.y, d = Math.hypot(dx, dy), step = speed * dt;
  if (d <= Math.max(step, 7)) { ai.path.shift(); return ai.path.length === 0; }
  const ox = a.x, oy = a.y;
  moveActor(a, dx / d * step, dy / d * step);
  a.face = Math.atan2(dy, dx); a.moving = true; a.walk += dt * 11;
  ai.stuck = Math.hypot(a.x - ox, a.y - oy) < step * 0.2 ? ai.stuck + dt : 0;
  return false;
}
function aiSpeed(a) { return a.carrying ? a.speed * 0.74 : a.speed; }

// A base owner hears the alarm when something of theirs is grabbed.
function aiAlert(owner, thief) {
  if (owner.isPlayer) return;
  const ai = owner.ai;
  if (owner.stun > 0 || owner.carrying || ai.state === 'steal_grab') return;
  if (dist2(owner, thief) > 1100 * 1100) return;
  aiSetState(owner, 'chase');
  ai.target = thief;
}
function playerRaidable() {
  if (game.time < 45 || game.raidCd > 0) return false;
  let n = 0;
  for (const p of game.player.base.pads) if (p.sinal) n++;
  return n >= 2;
}

function aiDecide(a) {
  const ai = a.ai, b = a.base;
  let best = null;
  for (const s of game.sinals) {
    if (s.state !== 'belt' || s.x > BELT_X1 - 380 || s.def.price > a.cash) continue;
    if (!best || s.def.income > best.def.income) best = s;
  }
  const targets = [];
  for (const o of game.bases) {
    if (o === b || o.shield > 0 || o.raider) continue;
    if (o.owner.isPlayer && !playerRaidable()) continue;
    for (const p of o.pads) if (p.sinal) targets.push(p);
  }
  targets.sort((p, q) => q.sinal.def.income - p.sinal.def.income);
  const loot = targets.length ? targets[Math.floor(Math.random() * Math.random() * Math.min(4, targets.length))] : null;

  if (!freePad(b)) {
    // full: only make room for something clearly better than the weakest sinal owned
    let weak = null;
    for (const p of b.pads) if (p.sinal && (!weak || p.sinal.def.income < weak.sinal.def.income)) weak = p;
    const want = Math.max(best ? best.def.income : 0, loot ? loot.sinal.def.income : 0);
    if (weak && want > weak.sinal.def.income * 1.8 && Math.random() < 0.6) sellPad(a, weak);
    if (!freePad(b)) { ai.t = rand(2, 5); return; }
  }

  const roll = Math.random();
  const steal = loot && (best ? roll < ai.cfg.nerve && loot.sinal.def.income >= best.def.income * 0.5 : roll < 0.45);
  if (steal) {
    aiSetState(a, 'steal_go');
    ai.pad = loot; ai.sinal = loot.sinal; ai.raiding = loot.base; ai.alerted = false;
    loot.base.raider = a;
  } else if (best) {
    aiSetState(a, 'buy');
    ai.sinal = best;
  } else {
    ai.t = rand(2, 5);
  }
}

function updateAI(a, dt) {
  const ai = a.ai, b = a.base;
  tickTimers(a, dt);
  ai.stateT += dt;
  a.moving = false;
  if (a.stun > 0) return;

  // Home with loot: it is ours now.
  if (a.carrying && insideBase(b, a)) {
    const s = deliverCarry(a);
    if (s && Math.random() < 0.85) b.shield = 32;
    aiSetState(a, 'home');
  }

  // Defend: go after whoever is carrying our sinal, or is poking around inside our base.
  if ((ai.state === 'home' || ai.state === 'return') && !a.carrying) {
    for (const o of game.actors) {
      if (o === a || o.stun > 0) continue;
      const mine = o.carrying && o.carrying.fromPad && o.carrying.fromPad.base === b;
      if ((mine && dist2(a, o) < 900 * 900) || (ai.state === 'home' && insideBase(b, o))) {
        aiSetState(a, 'chase');
        ai.target = o;
        break;
      }
    }
  }

  // Watchdog: nothing should take this long. Head home, and if even that fails, snap there.
  if (ai.state !== 'home' && (ai.stateT > 45 || ai.stuck > 0.8)) {
    if (ai.state === 'return' && (ai.stateT > 45 || ai.stuck > 3)) { a.x = b.gateIn.x; a.y = b.gateIn.y; aiSetState(a, 'home'); }
    else if (ai.state !== 'return') aiSetState(a, 'return');
    else ai.path = [];
  }

  switch (ai.state) {
    case 'home': {
      if (!insideBase(b, a)) { aiSetState(a, 'return'); break; }
      ai.t -= dt;
      if (ai.t <= 0) { aiDecide(a); break; }
      if (!ai.path.length && Math.random() < dt * 0.5) {
        ai.path = [{ x: rand(b.x0 + 60, b.x1 - 60), y: rand(b.y0 + 60, b.y1 - 60) }];
      }
      followPath(a, a.speed * 0.45, dt);
      break;
    }
    case 'buy': {
      const s = ai.sinal;
      if (!s || s.state !== 'belt' || s.x > BELT_X1 - 80 || s.def.price > a.cash || !freePad(b)) { aiSetState(a, 'return'); break; }
      if ((ai.repath -= dt) <= 0) {
        ai.repath = 0.3;
        ai.path = planPath(a, clamp(s.x + 26, PLAZA.x0 + 30, PLAZA.x1 - 30), BELT_Y + (b.top ? -34 : 34));
      }
      followPath(a, aiSpeed(a), dt);
      if (dist2(a, s) < 72 * 72) { buySinal(a, s); aiSetState(a, 'return'); }
      break;
    }
    case 'steal_go': {
      const pad = ai.pad, tb = pad && pad.base;
      const ok = pad && pad.sinal === ai.sinal && freePad(b) && !(tb.shield > 0 && baseAt(a.x, a.y) !== tb);
      if (!ok) { aiSetState(a, 'return'); break; }
      if (!ai.path.length) ai.path = planPath(a, pad.x, pad.y + (tb.top ? 24 : -24));
      if (tb.owner.isPlayer && !ai.alerted && insideBase(tb, a)) {
        ai.alerted = true;
        sfx('alarm');
        toast(`${a.name} is in your base! Zap them!`, 'bad');
      }
      if (followPath(a, aiSpeed(a), dt)) { ai.state = 'steal_grab'; ai.stateT = 0; ai.t = 1.5; }
      break;
    }
    case 'steal_grab': {
      const pad = ai.pad;
      if (!pad || pad.sinal !== ai.sinal || !freePad(b)) { aiSetState(a, 'return'); break; }
      if ((ai.t -= dt) > 0) break;
      const owner = pad.base.owner, s = ai.sinal;
      if (grabSinal(a, pad)) {
        if (owner.isPlayer) {
          game.stats.lost++;
          sfx('alarm');
          toast(`${a.name} took your ${s.def.name}! Zap them before they get home!`, 'bad');
        } else {
          aiAlert(owner, a);
        }
      }
      aiSetState(a, 'return');
      break;
    }
    case 'return': {
      if (!ai.path.length) {
        if (insideBase(b, a) && inInterior(b, a.x, a.y)) {
          if (Math.random() < 0.5 && b.shield <= 0) b.shield = 32;
          aiSetState(a, 'home');
          break;
        }
        ai.path = planPath(a, rand(b.x0 + 80, b.x1 - 80), b.top ? b.y1 - rand(110, 170) : b.y0 + rand(110, 170));
      }
      followPath(a, aiSpeed(a), dt);
      break;
    }
    case 'chase': {
      const t = ai.target;
      const mine = t && t.carrying && t.carrying.fromPad && t.carrying.fromPad.base === b;
      const intruder = t && insideBase(b, t);
      if (!t || t.stun > 0 || (!mine && !intruder) || ai.stateT > 10) { aiSetState(a, 'return'); break; }
      if ((ai.repath -= dt) <= 0) { ai.repath = 0.25; ai.path = planPath(a, t.x, t.y); }
      followPath(a, a.speed, dt);
      const d2 = dist2(a, t);
      if (a.windup > 0) {
        if ((a.windup -= dt) <= 0) { a.windup = 0; doZap(a, t); }   // on a hit the target is stunned, which ends the chase next tick
      } else if (d2 < 58 * 58 && a.zapCd <= 0 && t.immune <= 0) {
        a.windup = 0.3;
      }
      break;
    }
  }
}

function updateSim(dt) {
  updateWorld(dt);
  updatePlayer(dt);
  for (const a of game.actors) if (!a.isPlayer) updateAI(a, dt);
  for (let i = game.fx.length - 1; i >= 0; i--) if ((game.fx[i].t += dt) >= game.fx[i].dur) game.fx.splice(i, 1);
  for (let i = game.floaters.length - 1; i >= 0; i--) if ((game.floaters[i].t += dt) >= 1.1) game.floaters.splice(i, 1);
  if (game.shake > 0) game.shake = Math.max(0, game.shake - dt);
}
