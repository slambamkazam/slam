'use strict';
/* Steal a Sinal — canvas rendering */

const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
const view = { w: 1, h: 1, dpr: 1, scale: 1, cx: WORLD_W / 2, cy: WORLD_H / 2, mmY: 112, insetL: 16 };
const FONT = "'Chakra Petch', 'Trebuchet MS', 'Segoe UI', sans-serif";
const SPR = 256, SPR_R = 84;          // sprite size and picture radius inside it
const sprites = {};
const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}

// One round, framed sprite per sinal type, all cut from the same picture.
function buildSprites(img) {
  for (const def of SINAL_DEFS) {
    const c = document.createElement('canvas');
    c.width = c.height = SPR;
    const g = c.getContext('2d'), m = SPR / 2, r = SPR_R;
    const glow = g.createRadialGradient(m, m, r * 0.85, m, m, m);
    glow.addColorStop(0, hexA(def.color, 0.6));
    glow.addColorStop(1, hexA(def.color, 0));
    g.fillStyle = glow;
    g.fillRect(0, 0, SPR, SPR);
    g.save();
    g.beginPath(); g.arc(m, m, r, 0, TAU); g.clip();
    if (img) {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, m - r, m - r, r * 2, r * 2);
      if (def.gray) { g.globalCompositeOperation = 'saturation'; g.globalAlpha = def.gray; g.fillStyle = '#808080'; g.fillRect(0, 0, SPR, SPR); }
      if (def.tint) { g.globalCompositeOperation = 'color'; g.globalAlpha = def.tint[1]; g.fillStyle = def.tint[0]; g.fillRect(0, 0, SPR, SPR); }
      if (def.rainbow) {
        const rg = g.createLinearGradient(m - r, m - r, m + r, m + r);
        ['#ff5d73', '#ffc94d', '#6fe39a', '#5cb8ff', '#c98bff'].forEach((col, i) => rg.addColorStop(i / 4, col));
        g.globalCompositeOperation = 'color'; g.globalAlpha = def.rainbow; g.fillStyle = rg; g.fillRect(0, 0, SPR, SPR);
      }
    } else {
      g.fillStyle = '#1b2450'; g.fillRect(0, 0, SPR, SPR);
      g.fillStyle = def.color; g.font = `700 ${r}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('S', m, m + 4);
    }
    g.restore();
    g.lineWidth = 9; g.strokeStyle = def.color;
    g.beginPath(); g.arc(m, m, r, 0, TAU); g.stroke();
    g.lineWidth = 2.5; g.strokeStyle = 'rgba(255,255,255,.75)';
    g.beginPath(); g.arc(m, m, r - 6, 0, TAU); g.stroke();
    sprites[def.id] = c;
  }
}

function resizeView() {
  const r = canvas.getBoundingClientRect();
  view.w = Math.max(1, r.width); view.h = Math.max(1, r.height);
  view.dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = Math.round(view.w * view.dpr), ch = Math.round(view.h * view.dpr);
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  view.scale = clamp(Math.min(view.w, view.h) / 600, 0.7, 1.5);
}
function updateCamera(dt, snap) {
  const p = game.player, vw = view.w / view.scale, vh = view.h / view.scale;
  const tx = vw >= WORLD_W ? WORLD_W / 2 : clamp(p.x, vw / 2, WORLD_W - vw / 2);
  const ty = vh >= WORLD_H ? WORLD_H / 2 : clamp(p.y, vh / 2, WORLD_H - vh / 2);
  const k = snap ? 1 : 1 - Math.exp(-dt * 9);
  view.cx += (tx - view.cx) * k; view.cy += (ty - view.cy) * k;
}

function addFx(type, x, y, color, range) {
  if (game.fx.length < 60) game.fx.push({ type, x, y, color, range: range || 40, t: 0, dur: type === 'zap' ? 0.28 : 0.38 });
}
function addFloater(x, y, text, color) {
  if (game.floaters.length < 40) game.floaters.push({ x, y, text, color, t: 0 });
}

/* ---------- drawing helpers ---------- */
const fs = (px) => Math.max(px, 11 / view.scale);       // keep world text readable when zoomed out
function text(str, x, y, px, color, align) {
  ctx.font = `600 ${fs(px)}px ${FONT}`;
  ctx.textAlign = align || 'center';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(5,8,22,.8)';
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}
function disc(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
function drawSinal(s, r, t) {
  const spr = sprites[s.def.id];
  if (!spr) return;
  const y = s.y + (s.state === 'carried' || reduceMotion ? 0 : Math.sin(s.phase * 2.2) * 3);
  const size = SPR * (r / SPR_R);
  ctx.drawImage(spr, s.x - size / 2, y - size / 2, size, size);
  if (s.def.tier >= 3 && !reduceMotion) {            // epic and up sparkle
    ctx.fillStyle = '#ffffff';
    const n = s.def.tier - 1;
    for (let i = 0; i < n; i++) {
      const a = t * 1.6 + s.phase + i * TAU / n, q = 1.5 + Math.sin(t * 5 + i) * 0.9;
      ctx.fillRect(s.x + Math.cos(a) * (r + 7) - q, y + Math.sin(a) * (r + 7) - q, q * 2, q * 2);
    }
  }
}

function drawGround(x0, y0, x1, y1, t) {
  ctx.fillStyle = '#141c42';
  ctx.fillRect(PLAZA.x0, PLAZA.y0, PLAZA.x1 - PLAZA.x0, PLAZA.y1 - PLAZA.y0);
  ctx.strokeStyle = 'rgba(142,203,255,.05)'; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = Math.max(PLAZA.x0, Math.floor(x0 / 100) * 100); x <= Math.min(PLAZA.x1, x1); x += 100) {
    if (x > PLAZA.x0) { ctx.moveTo(x, PLAZA.y0); ctx.lineTo(x, PLAZA.y1); }
  }
  for (let y = PLAZA.y0 + 100; y < PLAZA.y1; y += 100) { ctx.moveTo(PLAZA.x0, y); ctx.lineTo(PLAZA.x1, y); }
  ctx.stroke();

  // the belt
  ctx.fillStyle = '#0c1230';
  ctx.fillRect(BELT_X0 - 30, BELT_Y - 36, BELT_X1 - BELT_X0 + 60, 72);
  ctx.strokeStyle = 'rgba(142,203,255,.35)'; ctx.lineWidth = 3;
  ctx.strokeRect(BELT_X0 - 30, BELT_Y - 36, BELT_X1 - BELT_X0 + 60, 72);
  ctx.strokeStyle = 'rgba(142,203,255,.16)'; ctx.lineWidth = 4;
  ctx.beginPath();
  const off = reduceMotion ? 0 : (t * BELT_SPEED) % 70;
  for (let x = Math.max(BELT_X0, Math.floor(x0 / 70) * 70) + off; x < Math.min(BELT_X1, x1 + 70); x += 70) {
    ctx.moveTo(x - 9, BELT_Y - 16); ctx.lineTo(x + 7, BELT_Y); ctx.lineTo(x - 9, BELT_Y + 16);
  }
  ctx.stroke();
}

function drawBase(b, t) {
  const mine = b.owner.isPlayer, col = b.owner.color, w = b.x1 - b.x0, h = b.y1 - b.y0;
  ctx.fillStyle = '#111840'; ctx.fillRect(b.x0, b.y0, w, h);
  ctx.fillStyle = hexA(col, mine ? 0.12 : 0.08); ctx.fillRect(b.x0, b.y0, w, h);
  // gate floor, then walls
  const gy = b.top ? b.y1 : b.y0 - WALL;
  ctx.fillStyle = '#141c42'; ctx.fillRect(b.gx0, gy, GATE_W, WALL);
  ctx.fillStyle = '#27336e';
  ctx.fillRect(b.x0 - 12, gy, b.gx0 - b.x0 + 12, WALL);
  ctx.fillRect(b.gx1, gy, b.x1 - b.gx1 + 12, WALL);
  ctx.fillRect(b.x0 - 12, b.y0, 12, h); ctx.fillRect(b.x1, b.y0, 12, h);
  ctx.fillRect(b.x0 - 12, b.top ? b.y0 - 12 : b.y1, w + 24, 12);
  ctx.fillStyle = hexA(col, 0.9);
  ctx.fillRect(b.x0 - 12, b.top ? b.y1 + WALL - 4 : b.y0 - WALL, b.gx0 - b.x0 + 12, 4);
  ctx.fillRect(b.gx1, b.top ? b.y1 + WALL - 4 : b.y0 - WALL, b.x1 - b.gx1 + 12, 4);

  // shield tile
  const lk = b.lock, up = b.shield > 0;
  ctx.fillStyle = up ? 'rgba(142,203,255,.3)' : (mine ? 'rgba(255,107,107,.22)' : 'rgba(255,255,255,.05)');
  disc(lk.x, lk.y, 30); ctx.fill();
  ctx.strokeStyle = up ? '#8ecbff' : (mine ? '#ff6b6b' : 'rgba(255,255,255,.18)'); ctx.lineWidth = 3; ctx.stroke();
  if (mine) text(up ? 'SHIELD' : 'STEP HERE', lk.x, lk.y + 4, 10, up ? '#cfe9ff' : '#ffd9d9');

  for (const p of b.pads) {
    ctx.fillStyle = p.unlocked ? '#1c2658' : '#0d1330';
    disc(p.x, p.y, 34); ctx.fill();
    ctx.strokeStyle = p.unlocked ? hexA(col, 0.55) : 'rgba(255,255,255,.08)'; ctx.lineWidth = 2.5; ctx.stroke();
    if (!p.unlocked) {
      ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y - 4, 6, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(p.x - 9, p.y - 4, 18, 13);
    }
  }

  if (up) {
    const pulse = reduceMotion ? 0.5 : 0.5 + Math.sin(t * 6) * 0.2;
    ctx.fillStyle = hexA('#8ecbff', 0.05); ctx.fillRect(b.x0, b.y0, w, h);
    ctx.fillStyle = hexA('#8ecbff', 0.35 + pulse * 0.3); ctx.fillRect(b.gx0, gy, GATE_W, WALL);
    ctx.strokeStyle = '#d6efff'; ctx.lineWidth = 2; ctx.strokeRect(b.gx0, gy, GATE_W, WALL);
  }
  // sign painted on the plaza outside the gate
  const sy = b.top ? PLAZA.y0 + 30 : PLAZA.y1 - 34;
  text(mine ? 'YOUR BASE' : b.owner.name.toUpperCase(), b.cx, sy, 15, mine ? '#ffffff' : col);
  text(up ? `LOCKED ${Math.ceil(b.shield)}s` : 'OPEN', b.cx, sy + fs(13) + 3, 12, up ? '#8ecbff' : (mine ? '#ff6b6b' : '#6fe39a'));
}

function drawActor(a, t) {
  const y = a.y + (a.moving ? Math.sin(a.walk) * 2 : 0);
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.ellipse(a.x, a.y + 15, 14, 6, 0, 0, TAU); ctx.fill();
  if (a.isPlayer) {
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(a.x, a.y + 15, 20, 9, 0, 0, TAU); ctx.stroke();
  }
  ctx.fillStyle = a.stun > 0 && Math.sin(t * 30) > 0 ? '#ffffff' : a.color;
  disc(a.x, y, R); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(5,8,22,.9)'; ctx.stroke();
  const fx = Math.cos(a.face), fy = Math.sin(a.face);
  for (const side of [-1, 1]) {
    const ex = a.x + fx * 6 - fy * 5.5 * side, ey = y + fy * 6 + fx * 5.5 * side;
    ctx.fillStyle = '#ffffff'; disc(ex, ey, 3.6); ctx.fill();
    ctx.fillStyle = '#0b1026'; disc(ex + fx * 1.4, ey + fy * 1.4, 1.8); ctx.fill();
  }
  if (a.stun > 0) {
    ctx.fillStyle = '#ffe27a';
    for (let i = 0; i < 3; i++) { const an = t * 7 + i * TAU / 3; disc(a.x + Math.cos(an) * 15, y - 24 + Math.sin(an) * 5, 3); ctx.fill(); }
  }
  if (a.windup > 0) text('!', a.x, y - 26, 22, '#ff6b6b');
  if (a.ai && a.ai.state === 'steal_grab') ring(a.x, y - 30, 9, 1 - a.ai.t / 1.5, '#ff6b6b');
  if (!a.isPlayer && !a.carrying && a.windup <= 0) text(a.name, a.x, y - 24, 11, a.color);
}
function ring(x, y, r, k, color) {
  ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(5,8,22,.7)'; disc(x, y, r); ctx.stroke();
  ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(k, 0, 1)); ctx.stroke();
}

function drawFx() {
  for (const f of game.fx) {
    const k = f.t / f.dur;
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = f.color;
    if (f.type === 'zap') {
      ctx.lineWidth = 5 * (1 - k) + 1;
      disc(f.x, f.y, f.range * (0.35 + 0.65 * k)); ctx.stroke();
    } else {
      ctx.lineWidth = 3; ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8;
        ctx.moveTo(f.x + Math.cos(a) * (10 + 26 * k), f.y + Math.sin(a) * (10 + 26 * k));
        ctx.lineTo(f.x + Math.cos(a) * (18 + 34 * k), f.y + Math.sin(a) * (18 + 34 * k));
      }
      ctx.stroke();
    }
  }
  for (const f of game.floaters) {
    ctx.globalAlpha = 1 - Math.pow(f.t / 1.1, 3);
    text(f.text, f.x, f.y - f.t * 46, 15, f.color);
  }
  ctx.globalAlpha = 1;
}

/* ---------- screen-space overlays ---------- */
function drawPointer(wx, wy, color, label) {
  const sx = (wx - view.cx) * view.scale + view.w / 2, sy = (wy - view.cy) * view.scale + view.h / 2;
  const m = 44;
  if (sx > m && sx < view.w - m && sy > m && sy < view.h - m) return;
  const px = clamp(sx, m, view.w - m), py = clamp(sy, m + 60, view.h - m - 90), a = Math.atan2(sy - py, sx - px);
  ctx.save();
  ctx.translate(px, py); ctx.rotate(a);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -11); ctx.lineTo(-8, 11); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.font = `700 11px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = color;
  ctx.fillText(label, clamp(px - Math.cos(a) * 30, 30, view.w - 30), py - Math.sin(a) * 26 + 4);
}
function drawMinimap(t) {
  const mw = clamp(view.w * 0.3, 112, 180), k = mw / WORLD_W, mh = WORLD_H * k, ox = view.insetL, oy = view.mmY;
  ctx.fillStyle = 'rgba(8,12,30,.78)'; ctx.fillRect(ox, oy, mw, mh);
  ctx.strokeStyle = 'rgba(142,203,255,.35)'; ctx.lineWidth = 1; ctx.strokeRect(ox + 0.5, oy + 0.5, mw - 1, mh - 1);
  ctx.fillStyle = 'rgba(142,203,255,.1)';
  ctx.fillRect(ox + PLAZA.x0 * k, oy + PLAZA.y0 * k, (PLAZA.x1 - PLAZA.x0) * k, (PLAZA.y1 - PLAZA.y0) * k);
  for (const b of game.bases) {
    const x = ox + b.x0 * k, y = oy + b.y0 * k, w = BASE_W * k, h = BASE_H * k;
    ctx.fillStyle = hexA(b.owner.color, 0.4); ctx.fillRect(x, y, w, h);
    if (b.shield > 0) { ctx.strokeStyle = '#d6efff'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2); }
  }
  for (const a of game.actors) {
    const thief = a.carrying && a.carrying.fromPad && a.carrying.fromPad.base === game.player.base;
    ctx.fillStyle = thief ? (Math.sin(t * 14) > 0 ? '#ffffff' : '#ff3b3b') : a.color;
    disc(ox + a.x * k, oy + a.y * k, a.isPlayer || thief ? 3.5 : 2.5); ctx.fill();
    if (a.isPlayer) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
}

function render(t) {
  const s = view.scale * view.dpr, p = game.player;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#070b1c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const shake = game.shake > 0 && !reduceMotion ? game.shake * 22 : 0;
  ctx.setTransform(s, 0, 0, s,
    Math.round((view.w / 2 - view.cx * view.scale) * view.dpr + (Math.random() - 0.5) * shake),
    Math.round((view.h / 2 - view.cy * view.scale) * view.dpr + (Math.random() - 0.5) * shake));
  ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';

  const hw = view.w / view.scale / 2 + 60, hh = view.h / view.scale / 2 + 60;
  const x0 = view.cx - hw, x1 = view.cx + hw, y0 = view.cy - hh, y1 = view.cy + hh;
  const vis = (o) => o.x > x0 && o.x < x1 && o.y > y0 && o.y < y1;

  drawGround(x0, y0, x1, y1, t);
  for (const b of game.bases) if (b.x1 + 20 > x0 && b.x0 - 20 < x1 && b.y1 + 60 > y0 && b.y0 - 60 < y1) drawBase(b, t);

  const mult = incomeMult(), target = actionPrompt.target;
  for (const sn of game.sinals) {
    if (!vis(sn)) continue;
    if (sn.state === 'belt') {
      if (sn === target) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; disc(sn.x, sn.y, 36); ctx.stroke(); }
      drawSinal(sn, 25, t);
      text('$' + fmt(sn.def.price), sn.x, sn.y + 46, 13, p.cash >= sn.def.price ? '#9dffbf' : '#ff9a9a');
    } else if (sn.state === 'pad') {
      const pad = sn.pad, mine = pad.base === p.base;
      if (pad === target) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; disc(pad.x, pad.y, 38); ctx.stroke(); }
      drawSinal(sn, 27, t);
      text(`+$${fmt(sn.def.income * (mine ? mult : 1))}/s`, pad.x, pad.y + 50, 12, sn.def.color);
      if (mine && pad.stored >= 1) text('$' + fmt(pad.stored), pad.x, pad.y - 36, 13, '#ffc94d');
    }
  }

  const order = game.actors.slice().sort((a, b) => a.y - b.y);
  for (const a of order) if (vis(a)) drawActor(a, t);
  for (const sn of game.sinals) if ((sn.state === 'fly' || sn.state === 'carried') && vis(sn)) drawSinal(sn, 20, t);
  if (p.channel) ring(p.channel.pad.x, p.channel.pad.y, 40, p.channel.t / p.channel.dur, '#ffc94d');
  drawFx();

  // overlays in CSS pixels
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  if (game.started) {
    for (const a of game.actors) {
      if (a.carrying && a.carrying.fromPad && a.carrying.fromPad.base === p.base) drawPointer(a.x, a.y, '#ff5252', 'THIEF');
    }
    if (p.carrying || !insideBase(p.base, p)) drawPointer(p.base.gateOut.x, p.base.gateOut.y, '#8ecbff', 'HOME');
    drawMinimap(t);
  }
}
