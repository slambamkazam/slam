'use strict';
/* Steal a Sinal — HUD, menus, controls, sound, main loop */

const $ = (id) => document.getElementById(id);
const el = {
  game: $('game'), hud: $('hud'), cash: $('cash'), rate: $('rate'), pill: $('shield-pill'), toasts: $('toasts'),
  action: $('btn-action'), actionLabel: $('action-label'), zap: $('btn-zap'), stick: $('stick'), knob: $('stick-knob'),
  logCount: $('log-count'), shopList: $('shop-list'), logGrid: $('log-grid'),
  rebirth: $('btn-rebirth'), rebirthDesc: $('rebirth-desc'), sound: $('btn-sound'), resetConfirm: $('reset-confirm'),
  play: $('btn-play'), mStart: $('m-start'), mShop: $('m-shop'), mLog: $('m-log'), mMenu: $('m-menu'),
};
const uiDirty = { log: true };
const shown = {};                       // last text/class written to the DOM, to skip needless writes
function setText(node, key, val) { if (shown[key] !== val) { shown[key] = val; node.textContent = val; } }
function setFlag(node, key, cls, on) { if (shown[key] !== on) { shown[key] = on; node.classList.toggle(cls, on); } }

/* ---------- sound ---------- */
let actx = null;
const SFX = {
  buy: [[520, 0.07, 'triangle'], [780, 0.11, 'triangle']],
  coin: [[990, 0.05, 'square', 0.035], [1320, 0.07, 'square', 0.035]],
  tick: [[440, 0.05, 'triangle']],
  grab: [[330, 0.06, 'sawtooth', 0.05], [660, 0.12, 'sawtooth', 0.05]],
  win: [[523, 0.08, 'triangle'], [659, 0.08, 'triangle'], [784, 0.18, 'triangle']],
  zap: [[1200, 0.04, 'sawtooth', 0.05], [300, 0.1, 'sawtooth', 0.05]],
  hurt: [[200, 0.12, 'square', 0.06], [120, 0.2, 'square', 0.06]],
  alarm: [[880, 0.1, 'square', 0.05], [660, 0.1, 'square', 0.05], [880, 0.12, 'square', 0.05]],
  shield: [[400, 0.08, 'sine'], [600, 0.08, 'sine'], [800, 0.15, 'sine']],
  up: [[440, 0.07, 'triangle'], [660, 0.07, 'triangle'], [880, 0.16, 'triangle']],
};
const sfxAt = {};
function initAudio() {
  if (actx) return;
  try { const AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); } catch (e) { actx = null; }
}
function sfx(name) {
  if (game.mute || !actx || !SFX[name]) return;
  const now = performance.now();
  if (now - (sfxAt[name] || -1e9) < 80) return;
  sfxAt[name] = now;
  try {
    if (actx.state === 'suspended') actx.resume();
    let t = actx.currentTime + 0.005;
    for (const [freq, dur, type, vol] of SFX[name]) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.07, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(t); o.stop(t + dur + 0.02);
      t += dur * 0.8;
    }
  } catch (e) { /* sound is optional */ }
}

/* ---------- toasts ---------- */
function toast(msg, kind, ms) {
  const box = el.toasts;
  while (box.children.length >= 3) box.removeChild(box.firstChild);
  const d = document.createElement('div');
  d.className = 'toast' + (kind ? ' ' + kind : '');
  d.textContent = msg;
  box.appendChild(d);
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 320); }, ms || 3200);
}

/* ---------- HUD ---------- */
let hudT = 1;
function measureHud() {
  const r = el.pill.getBoundingClientRect(), g = el.game.getBoundingClientRect();
  if (r.height) view.mmY = r.bottom - g.top + 8;
  view.insetL = parseFloat(getComputedStyle(el.hud).paddingLeft) || 16;
}
function updateHud(dt) {
  const p = game.player, b = p.base;
  setText(el.cash, 'cash', '$' + fmt(p.cash));
  setText(el.rate, 'rate', `+$${fmt(game.playerRate)}/s` + (game.rebirths ? ` · x${incomeMult()} income` : ''));
  setText(el.pill, 'pill', b.shield > 0 ? `Shield ${Math.ceil(b.shield)}s` : 'Shield down');
  setFlag(el.pill, 'pillDown', 'down', b.shield <= 0);
  setText(el.actionLabel, 'action', actionPrompt.label);
  if (shown.actionOff !== !actionPrompt.enabled) { shown.actionOff = !actionPrompt.enabled; el.action.disabled = !actionPrompt.enabled; }
  setFlag(el.action, 'actionCh', 'channel', actionPrompt.type === 'channel');
  setFlag(el.zap, 'zapCool', 'cool', p.zapCd > 0 || p.stun > 0);
  if (uiDirty.log) { uiDirty.log = false; refreshLog(); }
  if ((hudT += dt) > 0.25) {
    hudT = 0;
    measureHud();
    if (!el.mShop.hidden) refreshShop();
  }
}

/* ---------- upgrades ---------- */
let rebirthArmed = 0;
function buildShop() {
  el.shopList.textContent = '';
  for (const u of UPGRADES) {
    const row = document.createElement('div'), info = document.createElement('div');
    row.className = 'up';
    const name = document.createElement('div'), desc = document.createElement('div'), pips = document.createElement('div');
    name.className = 'up-name'; name.textContent = u.name;
    desc.className = 'up-desc'; desc.textContent = u.desc;
    pips.className = 'pips';
    for (let i = 0; i < u.max; i++) { const pip = document.createElement('span'); pip.className = 'pip'; pips.appendChild(pip); }
    info.append(name, desc, pips);
    const btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'up-' + u.id;
    btn.addEventListener('click', () => buyUpgrade(u));
    row.append(info, btn);
    el.shopList.appendChild(row);
    u.btn = btn; u.pips = pips;
  }
}
function refreshShop() {
  const cash = game.player.cash;
  for (const u of UPGRADES) {
    const lvl = game.up[u.id], maxed = lvl >= u.max, cost = upCost(u);
    for (let i = 0; i < u.max; i++) u.pips.children[i].classList.toggle('on', i < lvl);
    u.btn.textContent = maxed ? 'Maxed' : '$' + fmt(cost);
    u.btn.disabled = maxed || cash < cost;
    u.btn.classList.toggle('can', !maxed && cash >= cost);
  }
  const cost = rebirthCost(), can = cash >= cost;
  el.rebirthDesc.textContent = `Start again with $${START_CASH} and no sinals. You keep your upgrades, all income becomes x${1 + 0.5 * (game.rebirths + 1)} for good, and rarer sinals show up.`;
  if (rebirthArmed && performance.now() > rebirthArmed) rebirthArmed = 0;
  el.rebirth.textContent = rebirthArmed ? 'Tap again' : '$' + fmt(cost);
  el.rebirth.disabled = !can;
  el.rebirth.classList.toggle('can', can);
}
function buyUpgrade(u) {
  const p = game.player, cost = upCost(u);
  if (game.up[u.id] >= u.max || p.cash < cost) return;
  p.cash -= cost;
  game.up[u.id]++;
  if (u.id === 'pads') p.base.pads.forEach((pad, i) => { pad.unlocked = i < 6 + game.up.pads; });
  sfx('up');
  refreshShop();
  saveGame();
}
function tryRebirth() {
  if (game.player.cash < rebirthCost()) return;
  if (!rebirthArmed) { rebirthArmed = performance.now() + 4000; refreshShop(); return; }
  rebirthArmed = 0;
  if (doRebirth()) {
    sfx('win');
    closeModals();
    toast(`You went worldwide! All income is now x${incomeMult()}.`, 'gold', 5000);
    saveGame();
  }
}

/* ---------- log ---------- */
function refreshLog() {
  el.logGrid.textContent = '';
  let n = 0;
  for (const def of SINAL_DEFS) {
    const have = !!game.log[def.id];
    if (have) n++;
    const item = document.createElement('div'), rar = document.createElement('div'), name = document.createElement('div'), stat = document.createElement('div');
    item.className = 'log-item' + (have ? '' : ' locked');
    rar.className = 'log-rar'; rar.textContent = RARITY[def.rarity].name; rar.style.color = def.color;
    name.className = 'log-name'; name.textContent = have ? def.name : '???';
    stat.className = 'log-stat'; stat.textContent = `$${fmt(def.price)} · +$${fmt(def.income)}/s`;
    const pic = document.createElement('canvas'), body = document.createElement('div');
    pic.width = pic.height = 96; pic.className = 'log-pic';
    if (have && sprites[def.id]) pic.getContext('2d').drawImage(sprites[def.id], 0, 0, 96, 96);
    body.append(rar, name, stat);
    item.append(pic, body);
    el.logGrid.appendChild(item);
  }
  el.logCount.textContent = `${n}/${SINAL_DEFS.length}`;
}

/* ---------- modals ---------- */
function openModal(m) {
  if (!game.started) return;
  closeModals();
  m.hidden = false;
  game.paused = true;
  clearInput();
  if (m === el.mShop) refreshShop();
  if (m === el.mMenu) { el.resetConfirm.hidden = true; el.sound.textContent = 'Sound: ' + (game.mute ? 'off' : 'on'); }
}
function closeModals() {
  el.mShop.hidden = el.mLog.hidden = el.mMenu.hidden = true;
  rebirthArmed = 0;
  if (game.started) game.paused = false;
}
function toggleModal(m) { if (m.hidden) openModal(m); else closeModals(); }
function anyModalOpen() { return !el.mShop.hidden || !el.mLog.hidden || !el.mMenu.hidden; }

/* ---------- controls ---------- */
const keys = {};
const stick = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
function clearInput() {
  for (const k of Object.keys(keys)) keys[k] = false;
  endStick();
  input.x = input.y = 0; input.action = input.zap = false;
}
function readInput() {
  let x = 0, y = 0;
  if (keys.KeyA || keys.ArrowLeft) x -= 1;
  if (keys.KeyD || keys.ArrowRight) x += 1;
  if (keys.KeyW || keys.ArrowUp) y -= 1;
  if (keys.KeyS || keys.ArrowDown) y += 1;
  if (stick.active) { x = stick.x; y = stick.y; }
  input.x = x; input.y = y;
}
function endStick() {
  stick.active = false; stick.id = -1; stick.x = stick.y = 0;
  el.stick.classList.remove('on');
}
function setTouchMode() { el.game.classList.add('touch'); }

window.addEventListener('keydown', (e) => {
  const c = e.code;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!game.started) {
    if (c === 'Enter' || c === 'Space') { e.preventDefault(); startGame(); }
    return;
  }
  if (MOVE_KEYS.includes(c) || c === 'Space') e.preventDefault();
  if (e.repeat) return;
  if (c === 'Escape' || c === 'KeyP') { if (anyModalOpen()) closeModals(); else openModal(el.mMenu); return; }
  if (c === 'KeyU') { toggleModal(el.mShop); return; }
  if (c === 'KeyL') { toggleModal(el.mLog); return; }
  if (game.paused) return;
  keys[c] = true;
  if (c === 'KeyE' || c === 'Enter') input.action = true;
  if (c === 'Space') input.zap = true;
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'Space' && game.started && !game.paused) e.preventDefault();
});
window.addEventListener('blur', clearInput);

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' || stick.active || game.paused) return;
  e.preventDefault();
  setTouchMode();
  const g = el.game.getBoundingClientRect();
  stick.active = true; stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* capture is a nicety */ }
  el.stick.style.left = (e.clientX - g.left) + 'px';
  el.stick.style.top = (e.clientY - g.top) + 'px';
  el.knob.style.transform = 'translate(0px, 0px)';
  el.stick.classList.add('on');
});
canvas.addEventListener('pointermove', (e) => {
  if (!stick.active || e.pointerId !== stick.id) return;
  let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
  const d = Math.hypot(dx, dy), max = 48;
  if (d > max) { dx *= max / d; dy *= max / d; }
  el.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  const m = Math.min(d, max) / max;
  if (m < 0.18) { stick.x = stick.y = 0; } else { stick.x = dx / max; stick.y = dy / max; }
});
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(ev, (e) => { if (e.pointerId === stick.id) endStick(); });
}
window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') setTouchMode(); }, true);
el.game.addEventListener('contextmenu', (e) => e.preventDefault());

// Game buttons fire on press (snappier, and works while another finger holds the stick).
function pressButton(btn, fn) {
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!btn.disabled) fn(); });
  btn.addEventListener('click', (e) => { if (e.detail === 0 && !btn.disabled) fn(); });   // keyboard activation
}
pressButton(el.action, () => { if (!game.paused) input.action = true; });
pressButton(el.zap, () => { if (!game.paused) input.zap = true; });

$('btn-shop').addEventListener('click', () => toggleModal(el.mShop));
$('btn-log').addEventListener('click', () => toggleModal(el.mLog));
$('btn-menu').addEventListener('click', () => toggleModal(el.mMenu));
$('btn-resume').addEventListener('click', closeModals);
el.rebirth.addEventListener('click', tryRebirth);
el.play.addEventListener('click', startGame);
el.sound.addEventListener('click', () => {
  game.mute = !game.mute;
  el.sound.textContent = 'Sound: ' + (game.mute ? 'off' : 'on');
  sfx('tick');
  saveGame();
});
$('btn-reset').addEventListener('click', () => { el.resetConfirm.hidden = false; });
$('btn-reset-no').addEventListener('click', () => { el.resetConfirm.hidden = true; });
$('btn-reset-yes').addEventListener('click', () => {
  wipeSave();
  buildWorld(null);
  for (const k of Object.keys(shown)) delete shown[k];
  uiDirty.log = true;
  el.toasts.textContent = '';
  updateCamera(0, true);
  closeModals();
  saveGame();
  hint('start', 'Fresh start. Walk up to the belt and buy your first sinal.');
});
for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', closeModals);
for (const m of [el.mShop, el.mLog, el.mMenu]) m.addEventListener('pointerdown', (e) => { if (e.target === m) closeModals(); });
// A mouse click should not leave a button focused, or Space/Enter would press it again mid-game.
document.addEventListener('click', (e) => {
  if (e.detail > 0 && document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur();
});

/* ---------- main loop ---------- */
let lastT = 0, saveT = 0;
function startGame() {
  if (game.started) return;
  game.started = true; game.paused = false;
  initAudio();
  el.mStart.hidden = true;
  el.hud.hidden = false;
  measureHud();
  hint('start', 'Walk up to the belt and buy your first sinal.');
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  if (!(dt > 0)) return;
  if (game.started && !game.paused) {
    readInput();
    updateSim(dt);
    if ((saveT += dt) > 5) { saveT = 0; saveGame(); }
  }
  updateCamera(dt, false);
  if (game.started) updateHud(dt);
  render(game.time);
}

function boot() {
  const save = loadSave();
  buildWorld(save);
  buildSprites(null);
  const hero = $('hero-sinal');
  const useHero = () => { if (hero.naturalWidth) { buildSprites(hero); refreshLog(); } };
  if (hero.complete) useHero(); else hero.addEventListener('load', useHero);
  if (save) el.play.textContent = 'Continue';
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) setTouchMode();
  buildShop();
  refreshLog();
  resizeView();
  updateCamera(0, true);
  window.addEventListener('resize', resizeView);
  if (window.ResizeObserver) new ResizeObserver(resizeView).observe(canvas);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { saveGame(); clearInput(); } });
  window.addEventListener('pagehide', saveGame);
  requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(frame); });
}
boot();
