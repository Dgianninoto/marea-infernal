"use strict";
/*
 * Marea Infernal - mecanica.js (nucleo del juego)
 * Refactor: el juego estaba en un unico index.html. El CSS y el JS se separaron
 * en archivos externos SIN cambiar la logica (solo se movio codigo).
 *
 * Convencion de ambito compartido (clasico, sin modulos ES para que funcione
 * bajo file:// con doble clic): los simbolos de nivel superior se declaran con
 * `var` / `function`, que en un script clasico se cuelgan del objeto global y
 * por tanto SON visibles entre mecanica.js, personajes.js y enemigos.js.
 * (const/let de nivel superior NO se comparten entre <script> separados.)
 *
 * Orden de carga (ver index.html): mecanica.js -> personajes.js -> enemigos.js.
 * El arranque (state = newState(); requestAnimationFrame(loop);) va al final de
 * enemigos.js para garantizar que todo este definido antes de usarse.
 */


// ---------------------------------------------------------------- Audio (Web Audio API, no external files)
var Sound = (() => {
  let ctx = null;
  let enabled = true;
  function ensure() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { enabled = false; }
    }
    if (ctx && ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function tone(freq, dur, type, vol, slideTo) {
    if (!enabled) return;
    const c = ensure();
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, c.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), c.currentTime + dur);
    gain.gain.setValueAtTime(vol || 0.15, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    osc.connect(gain); gain.connect(c.destination);
    osc.start(); osc.stop(c.currentTime + dur);
  }
  function noise(dur, vol) {
    if (!enabled) return;
    const c = ensure();
    if (!c) return;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(); src.buffer = buf;
    const gain = c.createGain(); gain.gain.value = vol || 0.2;
    src.connect(gain); gain.connect(c.destination);
    src.start();
  }
  return {
    resume: () => ensure(),
    toggle: () => { enabled = !enabled; if (enabled) ensure(); return enabled; },
    get enabled() { return enabled; },
    shoot: () => tone(680, 0.08, "square", 0.05, 240),
    hit: () => tone(320, 0.05, "triangle", 0.06, 180),
    kill: () => { tone(160, 0.18, "sawtooth", 0.1, 50); noise(0.12, 0.08); },
    loot: (mult) => { const base = 520 + Math.min(mult, 20) * 40; tone(base, 0.12, "sine", 0.12, base * 1.5); },
    levelup: () => { tone(440, 0.15, "square", 0.1, 660); setTimeout(() => tone(660, 0.2, "square", 0.1, 880), 120); },
    chest: () => { tone(300, 0.1, "sine", 0.12, 600); setTimeout(() => tone(600, 0.15, "sine", 0.12, 900), 90); },
    dash: () => tone(900, 0.12, "sine", 0.08, 300),
    hurt: () => { tone(200, 0.15, "sawtooth", 0.12, 80); noise(0.1, 0.1); },
    boss: () => { tone(90, 0.6, "sawtooth", 0.18, 40); noise(0.4, 0.12); },
    bossdie: () => { tone(120, 0.5, "sawtooth", 0.2, 30); setTimeout(() => tone(80, 0.6, "sawtooth", 0.2, 20), 150); noise(0.5, 0.15); },
    goblin: () => {
      tone(580, 0.07, "triangle", 0.12, 880);
      setTimeout(() => tone(880, 0.08, "sine", 0.14, 1200), 65);
      setTimeout(() => tone(1100, 0.12, "triangle", 0.14, 1500), 140);
      setTimeout(() => tone(900, 0.08, "sine", 0.1, 1300), 240);
    },
    goblinHit: () => {
      tone(750, 0.06, "triangle", 0.11, 1100);
    },
    goblinDie: () => {
      tone(440, 0.1, "sine", 0.14, 880);
      setTimeout(() => tone(660, 0.12, "triangle", 0.15, 1100), 80);
      setTimeout(() => tone(880, 0.16, "sine", 0.18, 1400), 160);
      setTimeout(() => tone(1320, 0.25, "triangle", 0.16, 1760), 240);
      noise(0.2, 0.08);
    },
    goblinEscape: () => {
      tone(600, 0.35, "sawtooth", 0.14, 150);
      noise(0.3, 0.1);
    },
  };
})();

var WORLD = { w: 2600, h: 2600 };

// ---------------------------------------------------------------- Canvas
var canvas = document.getElementById("game");
var ctx = canvas.getContext("2d");
var wrap = document.getElementById("game-wrap");

var W = 0, H = 0, DPR = 1;
// zoom: everything is drawn scaled so the whole arena width always fits the screen.
// VW/VH = size of the visible area in world units.
var zoom = 1, VW = WORLD.w, VH = WORLD.h;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = wrap.clientWidth;
  H = wrap.clientHeight;
  zoom = Math.max(0.05, W / WORLD.w);
  VW = W / zoom;
  VH = H / zoom;
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener("resize", resize);
resize();

// ---------------------------------------------------------------- Utils
var rand = (a, b) => a + Math.random() * (b - a);
var randInt = (a, b) => Math.floor(rand(a, b + 1));
var clamp = (v, a, b) => Math.max(a, Math.min(b, v));
var dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
var pick = arr => arr[Math.floor(Math.random() * arr.length)];

// ---------------------------------------------------------------- World
var WALL = 34; // impassable border thickness (matches the drawn stone wall)
var cam = { x: 0, y: 0 };

// ---------------------------------------------------------------- Scenarios / ground textures
// Each theme's texture is built once onto an offscreen canvas and tiled with
// createPattern (free per frame). The scenario rotates every 10 waves (Stage 6).
var THEMES = [
  { id: "tiles", name: "Páramo de cenizas",   base: "#211109", wall: "#3a2316", merlon: "#4a2e1c", edge: "rgba(255,110,30,0.35)", vignette: "rgba(80,10,0,0.45)" },
  { id: "frost", name: "Cripta de hielo",     base: "#0d1a26", wall: "#1c3346", merlon: "#274a63", edge: "rgba(120,220,255,0.40)", vignette: "rgba(10,30,60,0.55)" },
  { id: "blood", name: "Sangre y obsidiana",  base: "#120a0e", wall: "#241419", merlon: "#311b22", edge: "rgba(150,40,55,0.30)",  vignette: "rgba(35,8,14,0.5)" },
];
var groundPatterns = []; // one CanvasPattern per theme, same index as THEMES

function buildTile(theme) {
  const TILE = 64, SUP = TILE * 4;
  const off = document.createElement("canvas");
  off.width = SUP; off.height = SUP;
  const g = off.getContext("2d");
  g.fillStyle = theme.base;
  g.fillRect(0, 0, SUP, SUP);

  if (theme.id === "tiles") {
    texSpeckle(g, SUP, 900, "rgba(255,170,120,", "rgba(0,0,0,");
    texSlabs(g, SUP, TILE);
    texGrout(g, SUP, TILE);
  } else if (theme.id === "frost") {
    // frozen crypt: deep blue ice with teal pools, frost speckle and glowing cracks
    texSpeckle(g, SUP, 1000, "rgba(180,235,255,", "rgba(10,30,50,");
    // icy patches / frozen pools
    for (let i = 0; i < 55; i++) {
      const x = Math.random() * SUP, y = Math.random() * SUP, r = 8 + Math.random() * 30;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, "rgba(60,150,200,0.40)");
      grd.addColorStop(1, "rgba(20,60,100,0)");
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // dark fractures plus a few glowing cyan ice veins
    for (let i = 0; i < 22; i++) texCrack(g, SUP, "rgba(5,20,40,0.5)", 1);
    for (let i = 0; i < 6; i++) texCrack(g, SUP, "rgba(130,225,255,0.45)", 1.5);
  } else {
    // blood & obsidian: dark volcanic glass with sparse, dried-blood accents
    texSpeckle(g, SUP, 600, "rgba(60,20,24,", "rgba(90,30,36,");
    // fewer, smaller, darker (dried) blood stains — muted garnet, low opacity
    for (let i = 0; i < 16; i++) {
      const x = Math.random() * SUP, y = Math.random() * SUP, r = 6 + Math.random() * 20;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, "rgba(90,22,30,0.35)");
      grd.addColorStop(1, "rgba(40,10,14,0)");
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // obsidian facets: cool dark highlights give the glassy stone its character
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * SUP, y = Math.random() * SUP, s = 4 + Math.random() * 11;
      g.fillStyle = "rgba(46,46,56," + (0.12 + Math.random() * 0.22) + ")";
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + s, y + s * 0.4); g.lineTo(x + s * 0.3, y + s); g.closePath(); g.fill();
    }
    // a few faint dried-blood cracks instead of bright red veins
    for (let i = 0; i < 5; i++) texCrack(g, SUP, "rgba(110,30,38,0.3)", 1);
  }
  return ctx.createPattern(off, "repeat");
}

// shared texture helpers
function texSpeckle(g, SUP, n, cA, cB) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * SUP, y = Math.random() * SUP, a = Math.random() * 0.06;
    g.fillStyle = (Math.random() < 0.5 ? cA : cB) + (a + 0.04) + ")";
    g.fillRect(x, y, Math.random() < 0.8 ? 1 : 2, Math.random() < 0.8 ? 1 : 2);
  }
}
function texCrack(g, SUP, color, w) {
  g.strokeStyle = color; g.lineWidth = w;
  let cx = Math.random() * SUP, cy = Math.random() * SUP;
  g.beginPath(); g.moveTo(cx, cy);
  const steps = 4 + Math.floor(Math.random() * 5);
  for (let s = 0; s < steps; s++) { cx += (Math.random() - 0.5) * 50; cy += (Math.random() - 0.5) * 50; g.lineTo(cx, cy); }
  g.stroke();
}
function texSlabs(g, SUP, TILE) {
  for (let ty = 0; ty < SUP; ty += TILE) {
    for (let tx = 0; tx < SUP; tx += TILE) {
      const sh = 0.82 + Math.random() * 0.3;
      g.fillStyle = "rgb(" + Math.round(58 * sh) + "," + Math.round(32 * sh) + "," + Math.round(22 * sh) + ")";
      g.fillRect(tx + 2, ty + 2, TILE - 4, TILE - 4);
      g.fillStyle = "rgba(255,160,90,0.08)";
      g.fillRect(tx + 2, ty + 2, TILE - 4, 2); g.fillRect(tx + 2, ty + 2, 2, TILE - 4);
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fillRect(tx + 2, ty + TILE - 4, TILE - 4, 2); g.fillRect(tx + TILE - 4, ty + 2, 2, TILE - 4);
      if (Math.random() < 0.3) {
        g.strokeStyle = "rgba(0,0,0,0.5)"; g.lineWidth = 1;
        let cx = tx + 8 + Math.random() * (TILE - 16), cy = ty + 8 + Math.random() * (TILE - 16);
        g.beginPath(); g.moveTo(cx, cy);
        const steps = 3 + Math.floor(Math.random() * 3);
        for (let s = 0; s < steps; s++) { cx += (Math.random() - 0.5) * 20; cy += (Math.random() - 0.5) * 20; g.lineTo(cx, cy); }
        g.stroke();
      }
      if (Math.random() < 0.08) {
        g.strokeStyle = "rgba(255,110,30,0.5)"; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(tx + 12, ty + TILE * 0.3); g.lineTo(tx + TILE - 14, ty + TILE * 0.7); g.stroke();
      }
    }
  }
}
function texGrout(g, SUP, TILE) {
  g.strokeStyle = "rgba(0,0,0,0.55)"; g.lineWidth = 2;
  for (let t = 0; t <= SUP; t += TILE) {
    g.beginPath(); g.moveTo(t, 0); g.lineTo(t, SUP); g.stroke();
    g.beginPath(); g.moveTo(0, t); g.lineTo(SUP, t); g.stroke();
  }
}
function buildAllTextures() { for (const t of THEMES) groundPatterns.push(buildTile(t)); }
buildAllTextures();

// ---------------------------------------------------------------- Equipment system
// The hero starts with 6 base pieces (one per slot, one stat each). Pieces never drop:
// they are upgraded with brasas (ash) in two independent ways:
//  - Stat points: +1 point at a time, each adds `step` to the piece's stat (flat cost).
//  - Rarity (level 0..4): multiplies the whole stat by RARITY_MULT[level]. Cost grows x1.5 per level.
var RARITY = [
  { name: "Común",      color: "#d9d2c6" },
  { name: "Mágico",     color: "#5aa0ff" },
  { name: "Raro",       color: "#ffd84d" },
  { name: "Legendario", color: "#ff7a2a" },
  { name: "Único",      color: "#c9622b" },
];
var MAX_LEVEL = RARITY.length - 1;
var MAX_PLUS = 10;            // an item holds at most +10 (each stat point = +1); rarity can only be raised at +10
var POINT_BASE_COST = 25;     // brasas per +1: 25 + 5 * rarity index of the item
var POINT_RARITY_COST = 5;
var itemPlus = it => it.plus; // upgrade indicator 0..10 (stat points themselves are permanent)
function pointCost(it) { return POINT_BASE_COST + it.level * POINT_RARITY_COST; }
var RARITY_BASE_COST = 250;   // brasas for the first rarity level
var RARITY_GROWTH = 1.5;      // each rarity level costs 150% of the previous one
var RARITY_MULT = [1, 1.5, 2, 3, 5]; // stat multiplier per rarity: Común, Mágico, Raro, Legendario, Único
var roundTo25 = v => Math.round(v / 25) * 25;
// brasas to go from rarity level n to n+1: 250, 375, 575, 850...
function rarityCost(level) { return roundTo25(RARITY_BASE_COST * Math.pow(RARITY_GROWTH, level)); }

var AFFIX = {
  dmg:      { label: "Daño",      color: "#ff8a5a", fmt: v => "+" + v },
  maxHp:    { label: "Vida máx",  color: "#ff5a5a", fmt: v => "+" + v },
  fireRate: { label: "Cadencia",  color: "#6ad1ff", fmt: v => "+" + v + " A/s" },
  speed:    { label: "Velocidad", color: "#aaffaa", fmt: v => "+" + v },
  regen:    { label: "Regen",     color: "#9affd0", fmt: v => "+" + v + "/s" },
  ashBonus: { label: "Brasas",    color: "#ffb347", fmt: v => "+" + v + "%" },
  crit:     { label: "Crítico",   color: "#ffd84d", fmt: v => "+" + v + "%" },
  cdr:      { label: "Recarga",   color: "#c58aff", fmt: v => "+" + v + "%" },
};
var WEAPONS = {
  bow: {
    id: "bow", name: "Arco", icon: "🏹", color: "#ffd84d",
    skills: [
      { name: "Flecha", icon: "➶", cooldown: 0.29 },
      { name: "Abanico", icon: "🏹", cooldown: 5.5 },
      { name: "Devastación", icon: "💥", cooldown: 13 },
    ],
  },
  staff: {
    id: "staff", name: "Bastón de mago", icon: "🪄", color: "#bd8cff",
    skills: [
      { name: "Orbe arcano", icon: "🔮", cooldown: 0.58 },
      { name: "Salva arcana", icon: "✨", cooldown: 5.5 },
      { name: "Meteorito", icon: "☄️", cooldown: 13 },
    ],
  },
  axe: {
    id: "axe", name: "Hacha", icon: "🪓", color: "#ff7659",
    skills: [
      { name: "Tajo", icon: "🪓", cooldown: 0.62 },
      { name: "Giro amplio", icon: "🌀", cooldown: 5.5 },
      { name: "Golpe sísmico", icon: "💥", cooldown: 13 },
    ],
  },
};
var selectedWeaponId = "bow";
function getWeapon(id) { return WEAPONS[id] || WEAPONS.bow; }

// each piece has one or more stats; every stat has its own base value and its own stat points
var SLOTS = [
  { key: "arma",    label: "Arma",    icon: "🏹", name: "Arco",    stats: [
      { key: "dmg",  base: 8, step: 1 },
      { key: "crit", base: 10, step: 2 } ] },
  { key: "casco",   label: "Casco",   icon: "⛑️", name: "Yelmo",   stats: [{ key: "ashBonus", base: 0, step: 2 }] },
  { key: "pecho",   label: "Pecho",   icon: "🛡️", name: "Coraza",  stats: [{ key: "maxHp",    base: 40,  step: 5 }] },
  { key: "guantes", label: "Guantes", icon: "🧤", name: "Guantes", stats: [
      { key: "fireRate", base: 0, step: 0.2 },
      { key: "cdr",      base: 0, step: 5 } ] },
  { key: "botas",   label: "Botas",   icon: "🥾", name: "Botas",   stats: [{ key: "speed",    base: 10,   step: 1 }] },
  { key: "anillo",  label: "Anillo",  icon: "💍", name: "Anillo",  stats: [{ key: "regen",    base: 0, step: 0.1 }] },
];

// value of one stat of a piece: (base + points * step) * RARITY_MULT[rarity level]
function statValue(item, st, points, level) {
  return +((st.base + points * st.step) * RARITY_MULT[level]).toFixed(2);
}
function statCur(item, st) { return statValue(item, st, st.points, item.level); }

function makeBaseEquipment(weaponId) {
  const eq = {};
  const weapon = getWeapon(weaponId || selectedWeaponId);
  SLOTS.forEach((sl, i) => {
    const isWeapon = sl.key === "arma";
    eq[sl.key] = {
      id: i + 1, slot: sl.key, slotLabel: sl.label,
      icon: isWeapon ? weapon.icon : sl.icon,
      name: isWeapon ? weapon.name : sl.name,
      level: 0, plus: 0,
      stats: sl.stats.map(st => ({ key: st.key, base: st.base, step: st.step, points: 0 })),
    };
  });
  return eq;
}

// Sum one stat across all equipped pieces.
function equipSum(p, key) {
  let sum = 0;
  for (const sk in p.equipped) {
    const it = p.equipped[sk];
    if (!it) continue;
    for (const st of it.stats) if (st.key === key) sum += statCur(it, st);
  }
  return sum;
}

function weaponSkillCooldown(p, index) {
  const cooldown = getWeapon(state.weaponId).skills[index].cooldown;
  if (index !== 0) return cooldown;
  return 1 / (1 / cooldown + equipSum(p, "fireRate"));
}

// Recompute effective stats from base + equipment. Keeps current hp ratio when maxHp changes.
function recalcStats(p) {
  const prevMax = p.maxHp || 1;
  const hpRatio = clamp(p.hp / prevMax, 0, 1);
  p.speed = p.base.speed + equipSum(p, "speed");
  p.maxHp = Math.round(p.base.maxHp + equipSum(p, "maxHp"));
  p.dmg = p.base.dmg + equipSum(p, "dmg");
  // Cadencia: equipment adds attacks per second (A/s) on top of the level-based A/s; no minimum interval
  p.regen = p.base.regen + equipSum(p, "regen");
  p.ashBonus = equipSum(p, "ashBonus") / 100;
  p.crit = clamp(equipSum(p, "crit") / 100, 0, 1);                 // crit chance 0..1 (crit = x2 damage)
  p.cdr = equipSum(p, "cdr") / 100;                                // Recarga: no cap; cooldowns tick (1 + cdr) times faster
  p.hp = Math.min(p.maxHp, Math.max(1, Math.round(hpRatio * p.maxHp)));
  let power = 0;
  for (const sk in p.equipped) {
    const it = p.equipped[sk];
    if (!it) continue;
    power += (it.level + 1) * 10;
    for (const st of it.stats) power += st.points * 2;
  }
  p.power = power;
}

// Spend brasas to add one stat point to a piece.
function upgradePoint(slotKey, statKey) {
  const p = state.player;
  const it = p.equipped[slotKey];
  const st = it && it.stats.find(x => x.key === statKey);
  if (!st || itemPlus(it) >= MAX_PLUS) return;
  const cost = pointCost(it);
  if (state.ash < cost) return;
  state.ash -= cost;
  st.points++;
  it.plus++;
  state.lootCount++;
  recalcStats(p);
  Sound.chest();
  floatText(p.x, p.y - 30, AFFIX[st.key].label + " +1", AFFIX[st.key].color);
  renderInventory();
}

// Spend brasas to raise a piece one rarity level.
function upgradeItem(slotKey) {
  const p = state.player;
  const it = p.equipped[slotKey];
  if (!it || it.level >= MAX_LEVEL || itemPlus(it) < MAX_PLUS) return; // needs +10 first
  const cost = rarityCost(it.level);
  if (state.ash < cost) return;
  state.ash -= cost;
  it.level++;
  it.plus = 0; // indicator back to +0; the stat points already bought are kept
  state.lootCount++; // counts upgrades done
  recalcStats(p);
  Sound.chest();
  floatText(p.x, p.y - 30, it.name + " → " + RARITY[it.level].name, RARITY[it.level].color);
  renderInventory();
}

// ---------------------------------------------------------------- Game state
var state;
function newState(weaponId) {
  const weapon = getWeapon(weaponId || selectedWeaponId);
  return {
    weaponId: weapon.id,
    running: false,
    over: false,
    time: 0,
    wave: 0,            // becomes 1 on the first startWave()
    phase: "fighting",  // "fighting" | "intermission"
    spawnTimer: 0,
    spawnInterval: 1.4,
    toSpawn: 0,         // enemies still to spawn this wave
    alive: 0,           // enemies currently on the field this wave
    waveQuota: 0,       // total enemies to clear this wave
    theme: 0,           // scenario index (set in Stage 6)
    kills: 0,
    lootCount: 0,
    ash: 0,
    score: 0,
    shake: 0,
    boss: null,
    bossDefeated: false,
    bossesDown: 0,
    player: {
      x: WORLD.w / 2, y: WORLD.h / 2,
      r: 20,             // bigger hero so it reads clearly against loot/ash
      hp: 100,
      level: 1, xp: 0, xpNext: 1000,
      aimX: 1, aimY: 0,
      inv: 0,            // invulnerability frames after hit
      // base stats (raised by level-ups); effective stats are derived in recalcStats()
      base: { speed: 150, maxHp: 100, dmg: 12, regen: 0.5 },
      // effective stats after equipment (filled by recalcStats)
      speed: 150, maxHp: 100, dmg: 12, regen: 0.5, ashBonus: 0, crit: 0, cdr: 0,
      // equipment: slotKey -> item (or null)
      equipped: makeBaseEquipment(weapon.id), // start with the 6 base pieces
      power: 0,          // total gear score
      dashCd: 0,         // current cooldown remaining
      dashMax: 2.2,      // cooldown length
      dashTime: 0,       // active dash remaining
      dashDur: 0.16,     // dash duration
      dashSpeed: 900,    // dash velocity
      dashVX: 0, dashVY: 0,
      skillCd: [0, 0, 0],
      skillMax: weapon.skills.map(skill => skill.cooldown),
      autoSkillCd: 0,
      nextAutoSkill: 0,
    },
    bullets: [],
    bossBullets: [],   // boss + caster projectiles that damage the player
    aoes: [],          // telegraphed ground areas that damage the player
    weaponEffects: [],
    enemies: [],
    orbs: [],
    chests: [],
    obstacles: [],      // walls/columns for cover
    particles: [],
    floaters: [],
  };
}

// ---------------------------------------------------------------- Input
var keys = {};
var mouse = { x: W / 2, y: H / 2, down: false };

window.addEventListener("keydown", e => {
  var t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  keys[e.key.toLowerCase()] = true;
  if (e.key === " " || e.code === "Space") { e.preventDefault(); tryDash(); }
  if (e.key.toLowerCase() === "e") { e.preventDefault(); tryOpenChest(); }
  if (e.key.toLowerCase() === "i") { e.preventDefault(); toggleInventory(); }
  if (e.key === "Escape") {
    e.preventDefault();
    if (invOpen) closeInventory();
    else if (paused) resumeGame();
    else if (state && state.running && !state.over) pauseGame();
  }
});
window.addEventListener("keyup", e => {
  var t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener("mousemove", e => {
  const r = canvas.getBoundingClientRect();
  mouse.x = e.clientX - r.left;
  mouse.y = e.clientY - r.top;
});
canvas.addEventListener("mousedown", e => { if (e.button === 0) mouse.down = true; });
window.addEventListener("mouseup", () => { mouse.down = false; });


// ---------------------------------------------------------------- Spawning
// Symmetric cover: columns and walls mirrored about the arena center so the
// layout feels deliberate. Rectangles; circle entities resolve against them.
function spawnObstacles() {
  state.obstacles = [];
  const cx = WORLD.w / 2, cy = WORLD.h / 2;
  const add = (x, y, w, h) => state.obstacles.push({ x, y, w, h });
  // four corner L-columns (mirrored)
  const off = 560, tw = 40, tl = 180;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      add(cx + sx * off - tw / 2, cy + sy * off - tl / 2, tw, tl);
      add(cx + sx * off - tl / 2, cy + sy * off - tw / 2, tl, tw);
    }
  }
  // two central pillars flanking the middle (mirrored on X)
  for (const sx of [-1, 1]) add(cx + sx * 240 - 30, cy - 30, 60, 60);
  // two long walls top/bottom (mirrored on Y), with a gap in the middle
  for (const sy of [-1, 1]) {
    add(cx - 360, cy + sy * 300 - 22, 240, 44);
    add(cx + 120, cy + sy * 300 - 22, 240, 44);
  }
}

// Push a circle (entity of radius r at x,y) out of any obstacle it overlaps.
// Returns the corrected {x, y}.
function resolveObstacles(x, y, r) {
  for (const o of state.obstacles) {
    // closest point on the rect to the circle center
    const nx = clamp(x, o.x, o.x + o.w), ny = clamp(y, o.y, o.y + o.h);
    const dx = x - nx, dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r; y = ny + (dy / d) * r;
      } else {
        // center inside the rect: push out along the nearest edge
        const left = x - o.x, right = o.x + o.w - x, top = y - o.y, bottom = o.y + o.h - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = o.x - r; else if (m === right) x = o.x + o.w + r;
        else if (m === top) y = o.y - r; else y = o.y + o.h + r;
      }
    }
  }
  return { x, y };
}

// True if a point (arrow tip) is inside any obstacle.
function pointInObstacle(x, y) {
  for (const o of state.obstacles) {
    if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return true;
  }
  return false;
}

// Temporary free chests: they live CHEST_LIFE seconds, open with E, and pay (100 + level*50) brasas, boosted by the Brasas bonus.
// They appear with a 5% chance per batch of enemies and always when the boss dies.
var CHEST_LIFE = 5;
var chestReward = p => Math.round((100 + p.level * 50) * (1 + p.ashBonus));
var CHEST_CHANCE = 0.05;
var GOBLIN_CHANCE = 0.01; // 1% por tanda de enemigos
function spawnChest(x, y) {
  state.chests.push({
    x: clamp(x, WALL + 40, WORLD.w - WALL - 40),
    y: clamp(y, WALL + 40, WORLD.h - WALL - 40),
    r: 22, opened: false, glow: 0, life: CHEST_LIFE,
  });
  Sound.chest();
}
function spawnChestNearPlayer() {
  const p = state.player;
  let x = p.x, y = p.y + 140;
  for (let i = 0; i < 30; i++) {
    const a = rand(0, Math.PI * 2), d = rand(140, 280);
    const cx = clamp(p.x + Math.cos(a) * d, WALL + 40, WORLD.w - WALL - 40);
    const cy = clamp(p.y + Math.sin(a) * d, WALL + 40, WORLD.h - WALL - 40);
    const m = 26;
    if (!pointInObstacle(cx, cy) && !pointInObstacle(cx - m, cy - m) && !pointInObstacle(cx + m, cy - m) &&
        !pointInObstacle(cx - m, cy + m) && !pointInObstacle(cx + m, cy + m)) { x = cx; y = cy; break; }
  }
  spawnChest(x, y);
  floatText(x, y - 40, "¡Cofre!", "#ffd84d");
}

function tryOpenChest() {
  if (!state.running) return;
  const p = state.player;
  for (const c of state.chests) {
    if (c.opened) continue;
    if (dist2(p.x, p.y, c.x, c.y) < (c.r + p.r + 24) ** 2) {
      c.opened = true;
      c.life = Math.min(c.life, 0.8); // fades out quickly once empty
      state.shake = Math.max(state.shake, 8);
      Sound.chest();
      const reward = c.reward || chestReward(p);
      state.ash += reward;
      const label = c.isBonus ? "¡BONO DE OLEADA! +" : "¡COFRE ABIERTO! +";
      floatText(c.x, c.y - 30, label + reward + "🔥", "#ffd84d");
      for (let i = 0; i < 35; i++) {
        const a = rand(0, Math.PI * 2), s = rand(80, 320);
        state.particles.push({
          x: c.x, y: c.y,
          vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          life: rand(0.4, 0.9), r: rand(2, 5),
          color: c.isBonus ? pick(["#ffd84d", "#ffffff", "#ff9d4d"]) : (Math.random() < 0.5 ? "#ffd84d" : "#ff7a2a")
        });
      }
      return;
    }
  }
}

// ---------------------------------------------------------------- Floating text + loot feed
var floatLayer = document.getElementById("float-layer");
function floatText(wx, wy, text, color) {
  state.floaters.push({ wx, wy, text, color, el: null, life: 0.9 });
}
var lootFeed = document.getElementById("loot-feed");
// ---------------------------------------------------------------- Wave director
// Begins the next wave. Every 10th wave spawns a boss (Stage 5) and, from Stage 6,
// rotates the scenario. Difficulty ramps forever (handled in spawnEnemy / startWave).
function startWave() {
  state.wave++;
  state.phase = "fighting";
  // state.alive is NOT reset: leftover enemies from the previous wave stay counted
  const w = state.wave;

  // scenario rotation every 10 waves (Stage 6 reads state.theme when drawing)
  const newTheme = Math.floor((w - 1) / 10) % THEMES.length;
  if (newTheme !== state.theme) {
    state.theme = newTheme;
    showWarning("Nuevo escenario<br><span style='font-size:22px'>" + THEMES[newTheme].name + "</span>");
    state.shake = Math.max(state.shake, 10);
  }

  // enemy quota grows every wave; spawn cadence tightens (never-ending ramp)
  state.waveQuota = (6 + Math.floor(w * 2.2)) * 4; // enemy count doubled twice (x4 vs original)
  state.toSpawn = state.waveQuota + Math.max(0, state.toSpawn); // carry over anything not yet spawned
  state.waveTotal = state.toSpawn;                  // total enemies this wave will spawn
  state.batchSize = Math.ceil(state.waveTotal / 5); // 5 batches = 20% of the wave each
  state.batchesSpawned = 0;
  state.spawnInterval = Math.max(0.28, 1.4 - (w - 1) * 0.04);
  state.spawnTimer = 0;

  const p = state.player;
  if (w % 10 === 0) {
    floatText(p.x, p.y - 56, "OLEADA " + w + " \u2014 \u00a1JEFE!", "#ff5050");
    spawnBoss();
  } else {
    floatText(p.x, p.y - 56, "OLEADA " + w, "#ff7a2a");
  }
  updateHud();
}

function onWaveCleared() {
  const w = state.wave;
  state.score += 50 + w * 10;
  state.ash += 3 + Math.floor(w / 3);
  floatText(state.player.x, state.player.y - 40, "Oleada " + w + " superada", "#6affa0");
  Sound.levelup();
  // every 5th wave -> intermission breather; otherwise straight into the next wave
  if (w % 5 === 0) startIntermission();
  else startWave();
}

function startIntermission() {
  state.phase = "intermission";
  // absorb everything left on the floor (xp/ash orbs, boss drops)
  for (const o of state.orbs) o.pull = true;
  // no countdown: the game waits (no new enemies) until the player presses Continue
  showWarning("Pausa<br><span style='font-size:20px'>Revisa tu equipo (I) y continúa cuando estés listo</span>");
  interPanel.style.display = "block";
}

function endIntermission() {
  interPanel.style.display = "none";
  startWave();
}

// ---------------------------------------------------------------- Update
function update(dt) {
  const p = state.player;
  state.time += dt;

  // movement (skipped while dashing — dash moves the player instead)
  if (p.dashTime <= 0) {
    let mx = 0, my = 0;
    if (keys["w"] || keys["arrowup"]) my -= 1;
    if (keys["s"] || keys["arrowdown"]) my += 1;
    if (keys["a"] || keys["arrowleft"]) mx -= 1;
    if (keys["d"] || keys["arrowright"]) mx += 1;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    p.x = clamp(p.x + mx * p.speed * dt, WALL + p.r, WORLD.w - WALL - p.r);
    p.y = clamp(p.y + my * p.speed * dt, WALL + p.r, WORLD.h - WALL - p.r);
    const rp = resolveObstacles(p.x, p.y, p.r); p.x = rp.x; p.y = rp.y;
  }

  // aim
  const aimWorldX = mouse.x / zoom + cam.x;
  const aimWorldY = mouse.y / zoom + cam.y;
  let ax = aimWorldX - p.x, ay = aimWorldY - p.y;
  const al = Math.hypot(ax, ay) || 1;
  p.aimX = ax / al; p.aimY = ay / al;

  // regen
  if (p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
  if (p.inv > 0) p.inv -= dt;

  // Weapon skill cooldowns
  for (let i = 0; i < 3; i++) if (p.skillCd[i] > 0) p.skillCd[i] = Math.max(0, p.skillCd[i] - dt * (1 + p.cdr)); // Recarga = faster cooldown tick
  if (p.autoSkillCd > 0) p.autoSkillCd = Math.max(0, p.autoSkillCd - dt);

  // Auto-fire the next ready weapon skill while a target is within engagement range.
  if (state.phase !== "intermission" && p.autoSkillCd <= 0) {
    const weapon = getWeapon(state.weaponId);
    const range = weapon.id === "axe" ? 210 : 450;
    const rangeSq = range * range;
    let threat = !!(state.boss && dist2(p.x, p.y, state.boss.x, state.boss.y) < rangeSq);
    if (!threat) {
      for (const e of state.enemies) {
        if (e.hp > 0 && dist2(p.x, p.y, e.x, e.y) < rangeSq) { threat = true; break; }
      }
    }
    if (threat) {
      for (let offset = 0; offset < 3; offset++) {
        const index = (p.nextAutoSkill + offset) % 3;
        if (p.skillCd[index] <= 0) {
          useSkill(index);
          p.autoSkillCd = 0.22;
          p.nextAutoSkill = (index + 1) % 3;
          break;
        }
      }
    }
  }
  updateWeaponEffects(dt);

  // dash cooldown / active dash
  if (p.dashCd > 0) p.dashCd = Math.max(0, p.dashCd - dt);
  if (p.dashTime > 0) {
    p.dashTime -= dt;
    p.x = clamp(p.x + p.dashVX * p.dashSpeed * dt, WALL + p.r, WORLD.w - WALL - p.r);
    p.y = clamp(p.y + p.dashVY * p.dashSpeed * dt, WALL + p.r, WORLD.h - WALL - p.r);
    const rd = resolveObstacles(p.x, p.y, p.r); p.x = rd.x; p.y = rd.y;
    // dash trail
    state.particles.push({ x: p.x, y: p.y, vx: rand(-20, 20), vy: rand(-20, 20), life: 0.25, r: rand(3, 6), color: "#6ad1ff" });
  }

  // ---- wave director ----
  if (state.phase === "intermission") {
    // pause: no spawns at all; only the Continue button starts the next wave.
  } else {
    // fighting: drip-feed this wave's enemy quota
    // the first batch comes out as the wave starts; each next batch (20% of the wave)
    // comes out when 75% or less of a batch's size is left alive (= 15% of the whole wave)
    if (state.toSpawn > 0 && (state.batchesSpawned === 0 || state.alive <= state.batchSize * 0.75)) {
      const batch = Math.min(state.toSpawn, state.batchSize);
      for (let i = 0; i < batch; i++) { spawnEnemy(); state.toSpawn--; state.alive++; }
      state.batchesSpawned++;
      if (Math.random() < CHEST_CHANCE) spawnChestNearPlayer();
      if (Math.random() < GOBLIN_CHANCE && typeof spawnGoblinNearPlayer === "function") spawnGoblinNearPlayer();
    }
    // Waves that end in a pause (every 5th, incl. boss waves) are cleared only when the LAST enemy dies.
    // Other waves start the next one when 15% or less of this wave's enemies remain.
    const remaining = state.toSpawn + state.alive;
    const done = (state.wave % 5 === 0) ? remaining === 0 : remaining <= state.waveTotal * 0.15;
    if (done && !state.boss) onWaveCleared();
  }

  // bullets (arrows). Walls stop normal arrows; the big ultimate smashes through.
  for (const b of state.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (!b.big && b.life > 0 && pointInObstacle(b.x, b.y)) b.life = 0;
  }

  // enemies
  for (const e of state.enemies) {
    if (e.flash > 0) e.flash -= dt;
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    // enemies ignore obstacles: they walk straight through them
    // far from the player (>600px): +300% speed (x4) to catch up
    const sp = d > 600 ? e.speed * 4 : e.speed;

    // ---- special-enemy behavior ----
    // handledMove = true when the type moved on its own and the plain chase is skipped.
    let handledMove = false;
    if (e.type === "goblin") {
      if (typeof updateGoblin === "function") updateGoblin(e, dt, p, dx, dy, d);
      handledMove = true;
    } else if (e.type === "leaper") {
      if (e.leaping > 0) {
        // mid-leap: fly along the locked velocity (clamped to the arena)
        e.leaping -= dt;
        e.x = clamp(e.x + e.lvx * dt, WALL + e.r, WORLD.w - WALL - e.r);
        e.y = clamp(e.y + e.lvy * dt, WALL + e.r, WORLD.h - WALL - e.r);
        state.particles.push({ x: e.x, y: e.y, vx: rand(-20, 20), vy: rand(-20, 20), life: 0.2, r: rand(2, 4), color: "#6affa0" });
        handledMove = true;
      } else {
        e.leapCd -= dt;
        // leap when at mid range, then wait for the next one
        if (e.leapCd <= 0 && d > 70 && d < 360) {
          e.leaping = 0.34;
          const lspd = 520;
          e.lvx = (dx / d) * lspd; e.lvy = (dy / d) * lspd;
          e.leapCd = rand(1.6, 2.6);
          state.shake = Math.max(state.shake, 3);
        }
      }
    } else if (e.type === "caster") {
      // hold at a shooting distance: back off if too close, approach if too far, strafe in between
      const want = 300;
      let mvx, mvy;
      if (d < want - 40) { mvx = -dx / d; mvy = -dy / d; }
      else if (d > want + 40) { mvx = dx / d; mvy = dy / d; }
      else { mvx = -dy / d; mvy = dx / d; }
      e.x = clamp(e.x + mvx * sp * dt, WALL + e.r, WORLD.w - WALL - e.r);
      e.y = clamp(e.y + mvy * sp * dt, WALL + e.r, WORLD.h - WALL - e.r);
      handledMove = true;
      // fire a dodgeable bolt
      e.shootCd -= dt;
      if (e.shootCd <= 0 && d < 520) {
        e.shootCd = rand(1.6, 2.6);
        const bs = 260;
        state.bossBullets.push({ x: e.x, y: e.y, vx: (dx / d) * bs, vy: (dy / d) * bs, r: 11, dmg: e.projDmg, life: 3, col: "#7fb3ff" });
        Sound.boss();
      }
    } else if (e.type === "bomber") {
      // plant a telegraphed AoE on the player's position (keeps chasing normally)
      e.bombCd -= dt;
      if (e.bombCd <= 0 && d < 460) {
        e.bombCd = rand(2.6, 3.8);
        state.aoes.push({ x: p.x, y: p.y, r: 70, warn: 1.1, active: 0, dmg: e.aoeDmg, hit: false });
      }
    }

    // ---- teletransporte (imp rojo, hound violeta y brute; silencioso) ----
    if (e.type === "imp" || e.type === "hound" || e.type === "brute") {
      if (e.tpArrive > 0) e.tpArrive -= dt;
      if (e.tpCharge > 0) {
        e.tpCharge -= dt;
        if (e.tpCharge <= 0) {
          // el jugador es el punto medio: nueva pos = 2*jugador - pos actual (dentro de la arena)
          e.x = clamp(2 * p.x - e.x, WALL + e.r, WORLD.w - WALL - e.r);
          e.y = clamp(2 * p.y - e.y, WALL + e.r, WORLD.h - WALL - e.r);
          e.tpCharge = 0;
          e.tpArrive = TP_ARRIVE_TIME; // parpadea en blanco sin hacer dano
        }
      } else if (!(e.tpArrive > 0)) {
        e.tpTimer -= dt;
        if (e.tpTimer <= 0) {
          e.tpTimer += TP_INTERVAL;
          if (d > TP_MIN_DIST && Math.random() < tpChance(e)) e.tpCharge = TP_CHARGE_TIME;
        }
      }
    }

    if (!handledMove) {
      e.x += (dx / d) * sp * dt;
      e.y += (dy / d) * sp * dt;
    }
    // contact damage (el duende no daña al jugador)
    if (e.type !== "goblin" && !(e.tpArrive > 0) && d < e.r + p.r && p.inv <= 0 && !debugGod) {
      p.hp -= e.dmg;
      p.inv = 0.6;
      state.shake = Math.max(state.shake, 9);
      Sound.hurt();
      floatText(p.x, p.y - 26, "-" + Math.round(e.dmg), "#ff5050");
      if (p.hp <= 0) { endGame(); return; }
    }
  }

  // enemies cannot overlap each other (or the boss)
  separateEnemies();

  // boss
  const boss = state.boss;
  if (boss) {
    if (boss.flash > 0) boss.flash -= dt;
    const bdx = p.x - boss.x, bdy = p.y - boss.y;
    const bd = Math.hypot(bdx, bdy) || 1;

    // ---- Skill 2: Salto aplastante (wave 20+) ----
    if (boss.hasLeap) {
      if (boss.leaping > 0) {
        // En el aire: vuela hacia el punto objetivo con estela de fuego
        boss.leaping -= dt;
        boss.x = clamp(boss.x + boss.lvx * dt, WALL + boss.r, WORLD.w - WALL - boss.r);
        boss.y = clamp(boss.y + boss.lvy * dt, WALL + boss.r, WORLD.h - WALL - boss.r);
        if (Math.random() < 0.7) {
          state.particles.push({ x: boss.x + rand(-10,10), y: boss.y + rand(-10,10), vx: rand(-40,40), vy: rand(-40,40), life: 0.3, r: rand(4, 9), color: pick(["#ff3a1a","#ff9d4d","#8a0f2a"]) });
        }
        if (boss.leaping <= 0) {
          // Aterrizaje: AoE de golpe en zona grande
          const slamDmg = boss.dmg * 1.8;
          state.aoes.push({ x: boss.x, y: boss.y, r: 115, warn: 0, active: 0.5, dmg: slamDmg, hit: false });
          state.shake = Math.max(state.shake, 18);
          for (let i = 0; i < 50; i++) {
            const a = rand(0, Math.PI * 2), s = rand(100, 420);
            state.particles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.4, 1.0), r: rand(3, 8), color: pick(["#ff3a1a","#ff9d4d","#8a0f2a","#ffffff"]) });
          }
          floatText(boss.x, boss.y - boss.r - 14, "¡IMPACTO!", "#6affa0");
          Sound.boss();
          boss.leapCd = rand(5.0, 8.0);
        }
      } else {
        boss.leapCd -= dt;
        if (boss.leapCd <= 0 && bd > 140 && bd < 560 && boss.shootCd > 0.5) {
          boss.leaping = 0.42;
          const lspd = 820;
          boss.lvx = (bdx / bd) * lspd;
          boss.lvy = (bdy / bd) * lspd;
          floatText(boss.x, boss.y - boss.r - 14, "¡SALTO!", "#6affa0");
          state.shake = Math.max(state.shake, 6);
        }
      }
    }

    // Movimiento normal solo cuando no está saltando
    if (!boss.hasLeap || boss.leaping <= 0) {
      if (bd > 180) { boss.x += (bdx / bd) * boss.speed * dt; boss.y += (bdy / bd) * boss.speed * dt; }
      boss.x = clamp(boss.x, WALL + boss.r, WORLD.w - WALL - boss.r);
      boss.y = clamp(boss.y, WALL + boss.r, WORLD.h - WALL - boss.r);
      const rb = resolveObstacles(boss.x, boss.y, boss.r); boss.x = rb.x; boss.y = rb.y;
    }

    // contact damage
    if (bd < boss.r + p.r && p.inv <= 0 && !debugGod) {
      p.hp -= boss.dmg; p.inv = 0.7; state.shake = Math.max(state.shake, 12); Sound.hurt();
      floatText(p.x, p.y - 26, "-" + Math.round(boss.dmg), "#ff5050");
      if (p.hp <= 0) { endGame(); return; }
    }

    // Skill 1 (siempre): abanico de proyectiles
    boss.shootCd -= dt;
    if (boss.shootCd <= 0 && (!boss.hasLeap || boss.leaping <= 0)) {
      boss.shootCd = 2.2;
      const base = Math.atan2(bdy, bdx);
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.22;
        state.bossBullets.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, r: 9, dmg: 16 * ENEMY_DMG_MULT, life: 3 });
      }
      Sound.boss();
    }

    // ---- Skill 3: Lluvia de bombas en patron circular (wave 30+) ----
    if (boss.hasBombs) {
      boss.bombRainCd -= dt;
      if (boss.bombRainCd <= 0 && (!boss.hasLeap || boss.leaping <= 0)) {
        boss.bombRainCd = rand(7.0, 11.0);
        floatText(boss.x, boss.y - boss.r - 14, "¡LLUVIA DE FUEGO!", "#ff9d4d");
        const bombCount = 5 + Math.floor(state.wave / 10);
        for (let i = 0; i < bombCount; i++) {
          const a = (i / bombCount) * Math.PI * 2 + rand(-0.25, 0.25);
          const dist = rand(55, 210);
          const bx = clamp(p.x + Math.cos(a) * dist, WALL + 50, WORLD.w - WALL - 50);
          const by = clamp(p.y + Math.sin(a) * dist, WALL + 50, WORLD.h - WALL - 50);
          state.aoes.push({ x: bx, y: by, r: 72, warn: 1.0 + i * 0.14, active: 0, dmg: boss.dmg * 1.2, hit: false });
        }
        Sound.boss();
      }
    }
  }

  // boss projectiles
  for (const bb of state.bossBullets) {
    bb.x += bb.vx * dt; bb.y += bb.vy * dt; bb.life -= dt;
    if (bb.life > 0 && p.inv <= 0 && !debugGod && dist2(bb.x, bb.y, p.x, p.y) < (bb.r + p.r) ** 2) {
      bb.life = 0; p.hp -= bb.dmg; p.inv = 0.5; state.shake = Math.max(state.shake, 8); Sound.hurt();
      floatText(p.x, p.y - 26, "-" + Math.round(bb.dmg), "#ff5050");
      if (p.hp <= 0) { endGame(); return; }
    }
  }
  state.bossBullets = state.bossBullets.filter(bb => bb.life > 0);

  // ground AoE zones (bomber): warn-up telegraph, then a brief damaging burst.
  // Standing in the zone when it detonates hurts: step out to avoid it.
  for (const z of state.aoes) {
    if (z.warn > 0) {
      z.warn -= dt;
      if (z.warn <= 0) {
        z.active = 0.35; // burst duration
        state.shake = Math.max(state.shake, 6);
        for (let i = 0; i < 18; i++) {
          const a = rand(0, Math.PI * 2), sp2 = rand(60, 240);
          state.particles.push({ x: z.x, y: z.y, vx: Math.cos(a) * sp2, vy: Math.sin(a) * sp2, life: rand(0.3, 0.6), r: rand(2, 5), color: "#ffb347" });
        }
      }
    } else if (z.active > 0) {
      z.active -= dt;
      if (!z.hit && p.inv <= 0 && !debugGod && dist2(p.x, p.y, z.x, z.y) < (z.r + p.r) ** 2) {
        z.hit = true; p.hp -= z.dmg; p.inv = 0.6; state.shake = Math.max(state.shake, 10); Sound.hurt();
        floatText(p.x, p.y - 26, "-" + Math.round(z.dmg), "#ff5050");
        if (p.hp <= 0) { endGame(); return; }
      }
    }
  }
  state.aoes = state.aoes.filter(z => z.warn > 0 || z.active > 0);

  // bullet vs enemy  (pierce>0 lets the ultimate arrow pass through several)
  for (const b of state.bullets) {
    if (b.life <= 0) continue;
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      if (b.hitSet && b.hitSet.has(e)) continue; // already pierced this one
      if (dist2(b.x, b.y, e.x, e.y) < (b.r + e.r) ** 2) {
        e.hp -= b.dmg; e.flash = 0.08;
        Sound.hit();
        floatText(e.x, e.y - e.r - 4, "-" + Math.round(b.dmg) + (b.crit ? "!" : ""), b.crit ? "#ff9d2e" : "#ffe08a");
        for (let i = 0; i < 3; i++) {
          const a = Math.atan2(b.vy, b.vx) + rand(-0.8, 0.8), s = rand(40, 140);
          state.particles.push({ x: b.x, y: b.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3, r: rand(1, 3), color: "#ffcf80" });
        }
        if (e.type === "goblin" && typeof onGoblinHit === "function") onGoblinHit(e);
        if (e.hp <= 0) killEnemy(e);
        if (b.splashRadius > 0) {
          damageWeaponArea(b.x, b.y, b.splashRadius, b.splashDamage, e);
          weaponBurst(b.x, b.y, b.splashRadius, b.color || "#bd8cff", 8);
        }
        if (b.pierce > 0) { b.pierce--; (b.hitSet || (b.hitSet = new Set())).add(e); }
        else { b.life = 0; break; }
      }
    }
    // bullet vs boss
    if (b.life > 0 && boss && dist2(b.x, b.y, boss.x, boss.y) < (b.r + boss.r) ** 2) {
      if (!(b.hitSet && b.hitSet.has(boss))) {
        boss.hp -= b.dmg; boss.flash = 0.06;
        floatText(boss.x + rand(-20, 20), boss.y - boss.r - 4, "-" + Math.round(b.dmg) + (b.crit ? "!" : ""), b.crit ? "#ff9d2e" : "#ffe08a");
        for (let i = 0; i < 3; i++) {
          const a = Math.atan2(b.vy, b.vx) + rand(-0.8, 0.8), s = rand(40, 140);
          state.particles.push({ x: b.x, y: b.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3, r: rand(1, 3), color: "#ffcf80" });
        }
        if (boss.hp <= 0) killBoss(boss);
        if (b.splashRadius > 0) {
          damageWeaponArea(b.x, b.y, b.splashRadius, b.splashDamage, boss);
          weaponBurst(b.x, b.y, b.splashRadius, b.color || "#bd8cff", 8);
        }
        if (b.pierce > 0) { b.pierce--; (b.hitSet || (b.hitSet = new Set())).add(boss); }
        else b.life = 0;
      }
    }
  }

  // orbs: magnet + collect
  for (const o of state.orbs) {
    if (o.pull) {
      // boss-kill vacuum: accelerate straight to the player from anywhere on the map
      o.pullSpeed = Math.min(1600, (o.pullSpeed || 250) + 2200 * dt);
      const pd = Math.sqrt(dist2(o.x, o.y, p.x, p.y)) || 1;
      const step = Math.min(o.pullSpeed * dt, pd);
      o.x += ((p.x - o.x) / pd) * step;
      o.y += ((p.y - o.y) / pd) * step;
      if (dist2(o.x, o.y, p.x, p.y) < (p.r + o.r) ** 2) {
        o.dead = true;
        if (o.kind === "xp") gainXp(o.val);
        else if (o.kind === "ash") { const g = Math.round(o.val * (1 + p.ashBonus)); state.ash += g; floatText(p.x, p.y - 14, "+" + g + "🔥", "#ff9d4d"); }
      }
      continue;
    }
    o.vx *= 0.9; o.vy *= 0.9;
    o.x += o.vx * dt; o.y += o.vy * dt;
    const d2 = dist2(o.x, o.y, p.x, p.y);
    const magnet = 150;
    if (d2 < magnet * magnet) {
      const d = Math.sqrt(d2) || 1;
      const pull = (1 - d / magnet) * 520;
      o.x += ((p.x - o.x) / d) * pull * dt;
      o.y += ((p.y - o.y) / d) * pull * dt;
    }
    if (d2 < (p.r + o.r) ** 2) {
      o.dead = true;
      if (o.kind === "xp") gainXp(o.val);
      else if (o.kind === "ash") { const g = Math.round(o.val * (1 + p.ashBonus)); state.ash += g; floatText(p.x, p.y - 14, "+" + g + "🔥", "#ff9d4d"); }
    }
  }

  // cleanup
  state.bullets = state.bullets.filter(b => b.life > 0 && b.x > cam.x - 60 && b.x < cam.x + VW + 60 && b.y > cam.y - 60 && b.y < cam.y + VH + 60);
  state.enemies = state.enemies.filter(e => e.hp > 0);
  state.orbs = state.orbs.filter(o => !o.dead);
  state.chests = state.chests.filter(c => c.life > 0);

  // chest glow + lifetime
  for (const c of state.chests) {
    if (!c.isBonus || c.opened) c.life -= dt;
    if (!c.opened) {
      const near = dist2(p.x, p.y, c.x, c.y) < (c.r + p.r + 24) ** 2;
      c.glow = clamp(c.glow + (near ? 1 : -1) * dt * 4, 0, 1);
    }
  }

  // particles
  for (const pt of state.particles) {
    pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt; pt.vx *= 0.94; pt.vy *= 0.94;
  }
  state.particles = state.particles.filter(pt => pt.life > 0);

  // floaters (lifetime; rendered via DOM-free canvas)
  for (const f of state.floaters) f.life -= dt;
  state.floaters = state.floaters.filter(f => f.life > 0);

  // camera follow
  cam.x = clamp(p.x - VW / 2, 0, Math.max(0, WORLD.w - VW));
  cam.y = clamp(p.y - VH / 2, 0, Math.max(0, WORLD.h - VH));
  if (WORLD.w < VW) cam.x = (WORLD.w - VW) / 2;
  if (WORLD.h < VH) cam.y = (WORLD.h - VH) / 2;

  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 40);

  updateHud();
}

// ---------------------------------------------------------------- Render
function draw() {
  ctx.clearRect(0, 0, W, H);

  let sx = 0, sy = 0;
  if (state.shake > 0) { sx = rand(-state.shake, state.shake); sy = rand(-state.shake, state.shake); }
  ctx.save();
  ctx.scale(zoom, zoom);
  ctx.translate(-cam.x + sx, -cam.y + sy);

  drawGround();

  // obstacles (cover)
  for (const o of state.obstacles) drawObstacle(o);

  // ground AoE zones (drawn on the floor, under entities)
  for (const z of state.aoes) drawAoe(z);

  // chests
  for (const c of state.chests) drawChest(c);

  // orbs
  for (const o of state.orbs) drawOrb(o);

  // particles (behind entities-ish)
  for (const pt of state.particles) {
    ctx.globalAlpha = clamp(pt.life * 2, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // enemies
  for (const e of state.enemies) drawEnemy(e);

  // boss
  if (state.boss) drawBoss(state.boss);
  drawWeaponEffects();

  // boss + caster projectiles
  for (const bb of state.bossBullets) {
    ctx.save();
    const col = bb.col || "#ff6a4a";
    ctx.shadowBlur = 14; ctx.shadowColor = bb.col || "#ff2a1a";
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(bb.x, bb.y, bb.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // bullets
  for (const b of state.bullets) {
    if (b.kind === "orb") {
      ctx.save();
      ctx.shadowBlur = 18; ctx.shadowColor = b.color || "#bd8cff";
      ctx.fillStyle = b.color || "#bd8cff";
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff0ff";
      ctx.beginPath(); ctx.arc(b.x - b.r * 0.25, b.y - b.r * 0.25, Math.max(2, b.r * 0.28), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (b.big) drawArrow(b.x, b.y, b.vx, b.vy, 24, b.color || "#ff7a2a", 2.4);
    else drawArrow(b.x, b.y, b.vx, b.vy, 11, b.color || "#e7cda0", 1);
  }

  // player
  drawPlayer(state.player);

  // floaters (world-space text)
  for (const f of state.floaters) {
    ctx.globalAlpha = clamp(f.life / 0.9, 0, 1);
    ctx.fillStyle = f.color;
    ctx.font = "bold " + Math.round(15 / zoom) + "px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "center";
    ctx.shadowBlur = 4; ctx.shadowColor = "#000";
    const rise = (0.9 - f.life) * 46;
    ctx.fillText(f.text, f.wx, f.wy - rise);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";

  ctx.restore();

  // scenario vignette
  const vigColor = THEMES[state ? state.theme % THEMES.length : 0].vignette;
  const grad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, vigColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

function drawGround() {
  // floor: cached pattern for the active scenario theme
  const ti = state ? state.theme % THEMES.length : 0;
  const theme = THEMES[ti];
  const pat = groundPatterns[ti];
  if (pat) {
    ctx.save();
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    ctx.restore();
  } else {
    ctx.fillStyle = theme.base;
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  }

  drawWallBorder(theme);
}

// Battlemented stone wall around the whole arena, tinted to the active theme.
function drawWallBorder(theme) {
  const T = WALL, merlon = 40, gap = 26;
  ctx.save();

  ctx.fillStyle = theme.wall;
  ctx.fillRect(0, 0, WORLD.w, T);
  ctx.fillRect(0, WORLD.h - T, WORLD.w, T);
  ctx.fillRect(0, 0, T, WORLD.h);
  ctx.fillRect(WORLD.w - T, 0, T, WORLD.h);

  ctx.strokeStyle = theme.edge;
  ctx.lineWidth = 3;
  ctx.strokeRect(T, T, WORLD.w - T * 2, WORLD.h - T * 2);

  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 2;
  const block = 60;
  ctx.beginPath();
  for (let x = 0; x < WORLD.w; x += block) {
    ctx.moveTo(x, 0); ctx.lineTo(x, T);
    ctx.moveTo(x, WORLD.h - T); ctx.lineTo(x, WORLD.h);
  }
  for (let y = 0; y < WORLD.h; y += block) {
    ctx.moveTo(0, y); ctx.lineTo(T, y);
    ctx.moveTo(WORLD.w - T, y); ctx.lineTo(WORLD.w, y);
  }
  ctx.stroke();

  ctx.fillStyle = theme.merlon;
  const step = merlon + gap;
  for (let x = 0; x < WORLD.w; x += step) {
    ctx.fillRect(x, -10, merlon, 14);
    ctx.fillRect(x, WORLD.h - 4, merlon, 14);
  }
  for (let y = 0; y < WORLD.h; y += step) {
    ctx.fillRect(-10, y, 14, merlon);
    ctx.fillRect(WORLD.w - 4, y, 14, merlon);
  }

  const tower = 46;
  for (const corner of [[0, 0], [WORLD.w, 0], [0, WORLD.h], [WORLD.w, WORLD.h]]) {
    const cx = corner[0], cy = corner[1];
    ctx.fillStyle = theme.merlon;
    ctx.beginPath(); ctx.arc(cx, cy, tower, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = theme.edge;
    ctx.beginPath(); ctx.arc(cx, cy, tower * 0.55, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}



// draw a cover obstacle (stone column/wall) with a dark outline
function drawObstacle(o) {
  ctx.save();
  ctx.fillStyle = "#3a2a20";
  ctx.strokeStyle = "#0a0604"; ctx.lineWidth = 3;
  ctx.fillRect(o.x, o.y, o.w, o.h);
  ctx.strokeRect(o.x, o.y, o.w, o.h);
  // top-left highlight / bottom-right shade for a bit of relief
  ctx.fillStyle = "rgba(255,180,110,0.10)";
  ctx.fillRect(o.x + 2, o.y + 2, o.w - 4, 3);
  ctx.fillStyle = "rgba(0,0,0,0.30)";
  ctx.fillRect(o.x + 2, o.y + o.h - 5, o.w - 4, 3);
  ctx.restore();
}




function drawChest(c) {
  ctx.save();
  if (c.opened) ctx.globalAlpha = clamp(c.life / 0.8, 0, 1);
  else if (!c.isBonus && c.life < 1.5 && Math.floor(performance.now() / 120) % 2 === 0) ctx.globalAlpha = 0.35; // blink before vanishing (solo cofres normales)
  drawChestBody(c);
  ctx.restore();
}
function drawChestBody(c) {
  const t = performance.now() / 500;
  if (c.opened) {
    ctx.fillStyle = "#1a0f08";
    ctx.strokeStyle = "#3a2010"; ctx.lineWidth = 3;
    roundRect(c.x - c.r, c.y - c.r * 0.6, c.r * 2, c.r * 1.4, 5);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#6a4a30"; ctx.font = "bold " + Math.round(12 / zoom) + "px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("vacío", c.x, c.y + 4); ctx.textAlign = "left";
    return;
  }
  const pulse = 0.5 + Math.sin(t) * 0.3 + c.glow * 0.4;
  ctx.save();
  ctx.shadowBlur = (c.isBonus ? 26 : 20) + c.glow * 20;
  ctx.shadowColor = c.isBonus ? "#ffd84d" : "#ffb347";
  // body
  ctx.fillStyle = c.isBonus ? "#7a2a08" : "#6a3a12";
  roundRect(c.x - c.r, c.y - c.r * 0.6, c.r * 2, c.r * 1.4, 5); ctx.fill();
  // lid
  ctx.fillStyle = c.isBonus ? "#a84310" : "#8a5020";
  roundRect(c.x - c.r, c.y - c.r * 0.9, c.r * 2, c.r * 0.5, 5); ctx.fill();
  // lock & trim
  ctx.fillStyle = "#ffd84d";
  ctx.globalAlpha = pulse;
  ctx.beginPath(); ctx.arc(c.x, c.y - c.r * 0.25, c.isBonus ? 6.5 : 5, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = c.isBonus ? "#d4af37" : "#3a2010"; ctx.lineWidth = c.isBonus ? 3.5 : 3;
  roundRect(c.x - c.r, c.y - c.r * 0.9, c.r * 2, c.r * 1.4, 5); ctx.stroke();
  ctx.restore();

  // reward + label
  const rewardVal = c.reward || chestReward(state.player);
  ctx.fillStyle = "#ffd84d";
  ctx.font = "bold " + Math.round(13 / zoom) + "px sans-serif"; ctx.textAlign = "center";
  if (c.isBonus) {
    ctx.fillText("🎁 BONO 🔥 " + rewardVal, c.x, c.y + c.r + 18 / zoom);
  } else {
    ctx.fillText("🔥 " + rewardVal + "  ·  " + Math.max(0, c.life).toFixed(1) + "s", c.x, c.y + c.r + 18 / zoom);
  }
  ctx.fillStyle = "#fff0c2";
  ctx.font = "bold " + Math.round(12 / zoom) + "px sans-serif";
  ctx.fillText("[E]", c.x, c.y + c.r + 34 / zoom);
  ctx.textAlign = "left";
}

function drawOrb(o) {
  ctx.save();
  let color = "#5aa0ff";
  if (o.kind === "xp") color = "#6fe06f";
  else if (o.kind === "ash") color = "#ff9d4d";
  else if (o.kind === "loot") color = "#3d9bff"; // ground loot is always blue
  const t = performance.now() / 300;
  const pulse = 1 + Math.sin(t + o.x) * 0.12;
  ctx.shadowBlur = o.kind === "loot" ? 16 : 8;
  ctx.shadowColor = color;
  ctx.fillStyle = color;
  if (o.kind === "loot") {
    // diamond for loot
    ctx.translate(o.x, o.y);
    ctx.rotate(Math.PI / 4);
    const s = o.r * pulse;
    ctx.fillRect(-s, -s, s * 2, s * 2);
  } else {
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r * pulse, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------- HUD binding
var el = id => document.getElementById(id);
var hpFill = el("hp-fill"), hpTxt = el("hp-txt");
var xpFill = el("xp-fill"), xpTxt = el("xp-txt");
var dashFill = el("dash-fill"), dashTxt = el("dash-txt");
var skillEls = [el("skill-0"), el("skill-1"), el("skill-2")];
var skillCdEls = skillEls.map(s => s.querySelector(".skill-cd"));
var skillIconEls = skillEls.map(s => s.querySelector(".skill-icon"));
var skillNameEls = skillEls.map(s => s.querySelector(".skill-name"));
var levelTxt = el("level-txt"), ashTxt = el("ash-txt");
var waveTxt = el("wave-txt"), killsTxt = el("kills-txt"), lootTxt = el("loot-txt");
var tideTimer = el("tide-timer");
var waveProgress = el("wave-progress");
var bossWrap = el("boss-wrap"), bossFill = el("boss-fill");
var warningEl = el("warning");
var interPanel = el("inter-panel");

function updateWeaponHud(weaponId) {
  const weapon = getWeapon(weaponId);
  for (let i = 0; i < weapon.skills.length; i++) {
    const skill = weapon.skills[i];
    skillIconEls[i].textContent = skill.icon;
    skillNameEls[i].textContent = skill.name;
    skillEls[i].title = skill.name + " · " + skill.cooldown + " s";
  }
}

var warnTimer = null;
function showWarning(html) {
  warningEl.innerHTML = html;
  warningEl.classList.remove("show");
  void warningEl.offsetWidth; // restart animation
  warningEl.classList.add("show");
}

// sound toggle
el("sound-btn").addEventListener("click", () => {
  const on = Sound.toggle();
  el("sound-btn").textContent = on ? "🔊 Sonido" : "🔇 Silencio";
});

// intermission: let the player skip the breather
el("inter-continue").addEventListener("click", () => {
  if (state && state.phase === "intermission") endIntermission();
});

// ---------------------------------------------------------------- TEMP DEBUG (remove this block + #debug-panel)
var debugInfAsh = false;
var debugGod = false; // invulnerable: nada le baja vida al jugador
var DEBUG_ASH = 999999;
function debugTopUpAsh() { if (debugInfAsh && state) state.ash = Math.max(state.ash, DEBUG_ASH); }
function debugNextWave() {
  if (!state || !state.running || state.over) return;
  // wipe whatever is on the field, then jump straight into the next wave
  state.enemies = [];
  state.bossBullets = [];
  state.aoes = [];
  state.boss = null;
  bossWrap.style.display = "none";
  state.toSpawn = 0;
  state.alive = 0;
  interPanel.style.display = "none";
  startWave();
}
for (const [id, fn] of [["dbg-wave", debugNextWave], ["dbg-ash", () => {
  debugInfAsh = !debugInfAsh;
  el("dbg-ash").classList.toggle("on", debugInfAsh);
  debugTopUpAsh();
  if (invOpen) renderInventory();
}], ["dbg-god", () => {
  debugGod = !debugGod;
  el("dbg-god").classList.toggle("on", debugGod);
}], ["dbg-goblin", () => {
  if (typeof spawnGoblinNearPlayer === "function") spawnGoblinNearPlayer();
}]]) {
  const b = el(id);
  b.addEventListener("mousedown", e => e.preventDefault()); // keep focus off the button so Space/E don't trigger it
  b.addEventListener("click", fn);
}

// ---------------------------------------------------------------- Inventory UI
var invScreen = el("inv-screen");
var powerTxt = el("power-txt");
var invOpen = false;

function openInventory() {
  if (!state || !state.running || state.over) return;
  if (paused) return;
  invOpen = true;
  invScreen.classList.remove("hidden");
  renderInventory();
}
function closeInventory() {
  invOpen = false;
  invScreen.classList.add("hidden");
}
function toggleInventory() { invOpen ? closeInventory() : openInventory(); }

function itemCard(item) {
  const div = document.createElement("div");
  const tier = RARITY[item.level];
  div.className = "item";
  div.style.borderLeftColor = tier.color;
  const totalPts = itemPlus(item);
  const plusFull = totalPts >= MAX_PLUS;
  div.innerHTML =
    `<div class="item-head" style="color:${tier.color}">${item.icon} ${item.name}
      <span style="color:var(--muted);font-weight:normal;font-size:11px">(${item.slotLabel} · ${tier.name} · +${totalPts}/${MAX_PLUS} · rareza ×${RARITY_MULT[item.level]})</span>
    </div>`;

  // one row per stat: current value -> value with +1 point, and its own "+1" button
  for (const st of item.stats) {
    const meta = AFFIX[st.key];
    const row = document.createElement("div");
    row.className = "item-stat";
    row.innerHTML = `<span class="item-affixes"><span style="color:${meta.color}">${meta.fmt(statCur(item, st))} ${meta.label}</span>`
      + ` ${plusFull ? "" : `<span style="color:#6affa0">→ ${meta.fmt(statValue(item, st, st.points + 1, item.level))}</span>`} <span style="color:var(--muted)">(${st.points} pts)</span></span>`;
    const ptBtn = document.createElement("button");
    ptBtn.className = "mini equip";
    const pc = pointCost(item);
    ptBtn.textContent = plusFull ? "+10 máx" : "+1 · " + pc + " 🔥";
    ptBtn.disabled = plusFull || state.ash < pc;
    ptBtn.addEventListener("click", () => upgradePoint(item.slot, st.key));
    row.appendChild(ptBtn);
    div.appendChild(row);
  }

  const actions = document.createElement("div");
  actions.className = "item-actions";
  const btn = document.createElement("button");
  btn.className = "mini equip";
  if (item.level >= MAX_LEVEL) { btn.textContent = "Rareza máxima"; btn.disabled = true; }
  else if (!plusFull) { btn.textContent = "Rareza → " + RARITY[item.level + 1].name + " (requiere +" + MAX_PLUS + ")"; btn.disabled = true; }
  else {
    const cost = rarityCost(item.level);
    btn.textContent = "Rareza → " + RARITY[item.level + 1].name + " · " + cost + " 🔥";
    btn.disabled = state.ash < cost;
    btn.addEventListener("click", () => upgradeItem(item.slot));
  }
  actions.appendChild(btn);
  div.appendChild(actions);
  return div;
}

// Stats panel: splits each stat into what comes from level (base) and from equipment.
function renderStatsPanel(p) {
  const f1 = v => (Math.round(v * 10) / 10).toString();
  const shots = 1 / getWeapon(state.weaponId).skills[0].cooldown;
  const rows = [
    { label: "Daño",      color: AFFIX.dmg.color,      lvl: p.base.dmg,   eq: equipSum(p, "dmg"),      fmt: v => f1(v) },
    { label: "Vida máx",  color: AFFIX.maxHp.color,    lvl: p.base.maxHp, eq: equipSum(p, "maxHp"),    fmt: v => f1(v) },
    { label: "Velocidad", color: AFFIX.speed.color,    lvl: p.base.speed, eq: equipSum(p, "speed"),    fmt: v => f1(v) },
    { label: "Cadencia básica", color: AFFIX.fireRate.color, lvl: shots, eq: equipSum(p, "fireRate"), fmt: v => f1(v * 100) / 100 + " A/s", dec: 2 },
    { label: "Regen",     color: AFFIX.regen.color,    lvl: p.base.regen, eq: equipSum(p, "regen"),    fmt: v => f1(v) + "/s" },
    { label: "Brasas",    color: AFFIX.ashBonus.color, lvl: 0,            eq: equipSum(p, "ashBonus"), fmt: v => f1(v) + "%" },
    { label: "Crítico",   color: AFFIX.crit.color,     lvl: 0,            eq: equipSum(p, "crit"),     fmt: v => f1(v) + "%", cap: 100 },
    { label: "Recarga",   color: AFFIX.cdr.color,      lvl: 0,            eq: equipSum(p, "cdr"),      fmt: v => f1(v) + "%" },
  ];
  const fmtV = (r, v) => r.dec ? (Math.round(v * 100) / 100) + " A/s" : r.fmt(v);
  el("stats-panel").innerHTML = rows.map(r => {
    const raw = r.lvl + r.eq;
    const total = r.cap ? Math.min(raw, r.cap) : raw;
    const capped = r.cap && raw > r.cap;
    const lp = total > 0 ? Math.round(r.lvl / total * 100) : 0;
    const ep = total > 0 ? 100 - lp : 0;
    return `<div class="stat-row">
      <div class="sr-head"><span style="color:${r.color}">${r.label}</span><span>${fmtV(r, total)}${capped ? " (tope)" : ""}</span></div>
      <div class="sr-bar"><div class="sr-lvl" style="width:${lp}%"></div><div class="sr-eq" style="width:${ep}%"></div></div>
      <div class="sr-detail"><span><b class="l">Nivel ${fmtV(r, r.lvl)}</b> (${lp}%)</span><span><b class="e">Equipo +${fmtV(r, r.eq)}</b> (${ep}%)</span></div>
    </div>`;
  }).join("");
}

function renderInventory() {
  if (!state) return;
  debugTopUpAsh();
  const p = state.player;
  renderStatsPanel(p);
  el("inv-power").textContent = "Brasas 🔥 " + state.ash
    + "  ·  Daño " + Math.round(p.dmg)
    + "  ·  Vida " + Math.round(p.maxHp)
    + "  ·  Vel " + Math.round(p.speed)
    + "  ·  Brasas +" + Math.round(p.ashBonus * 100) + "%"
    + "  ·  Crit " + Math.round(p.crit * 100) + "%"
    + "  ·  Recarga " + Math.round(p.cdr * 100) + "%";
  const equipList = el("equip-list");
  equipList.innerHTML = "";
  for (const slot of SLOTS) {
    const it = p.equipped[slot.key];
    if (it) equipList.appendChild(itemCard(it));
  }
}

el("inv-btn").addEventListener("click", toggleInventory);
el("inv-close").addEventListener("click", closeInventory);

function updateHud() {
  debugTopUpAsh();
  const p = state.player;
  hpFill.style.width = clamp(p.hp / p.maxHp * 100, 0, 100) + "%";
  hpTxt.textContent = Math.max(0, Math.round(p.hp)) + " / " + Math.round(p.maxHp);
  xpFill.style.width = clamp(p.xp / p.xpNext * 100, 0, 100) + "%";
  xpTxt.textContent = Math.round(p.xp) + " / " + p.xpNext;

  const dashReady = p.dashCd <= 0;
  dashFill.style.width = (dashReady ? 100 : (1 - p.dashCd / p.dashMax) * 100) + "%";
  dashFill.classList.toggle("ready", dashReady);
  dashTxt.textContent = dashReady ? "LISTO" : p.dashCd.toFixed(1) + "s";

  // ability cooldown overlays (curtain shrinks to 0% when ready)
  for (let i = 0; i < 3; i++) {
    const ready = p.skillCd[i] <= 0;
    skillCdEls[i].style.height = (ready ? 0 : (p.skillCd[i] / weaponSkillCooldown(p, i)) * 100) + "%";
    skillEls[i].classList.toggle("ready", ready);
  }

  if (state.boss) {
    bossFill.style.width = clamp(state.boss.hp / state.boss.maxHp * 100, 0, 100) + "%";
  }

  levelTxt.textContent = p.level;
  ashTxt.textContent = state.ash;
  waveTxt.textContent = state.wave;
  killsTxt.textContent = state.kills;
  lootTxt.textContent = state.lootCount;
  powerTxt.textContent = p.power;

  if (state.phase === "intermission") {
    tideTimer.textContent = "PAUSA";
    tideTimer.classList.add("low");
    waveProgress.textContent = "Pulsa Continuar";
  } else {
    tideTimer.textContent = "OLEADA " + state.wave;
    tideTimer.classList.remove("low");
    const cleared = state.waveQuota - state.toSpawn - state.alive;
    waveProgress.textContent = clamp(cleared, 0, state.waveQuota) + " / " + state.waveQuota + (state.boss ? "  👹" : "");
  }
}

// ---------------------------------------------------------------- Game flow
var menuScreen = el("menu-screen");
var overScreen = el("over-screen");
var pauseScreen = el("pause-screen");

// ---------------------------------------------------------------- Scoreboard (localStorage)
var SCORE_KEY = "mareaInfernalScores";
var MAX_SCORES = 10;

function loadScores() {
  try {
    const raw = localStorage.getItem(SCORE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
function saveScores(list) {
  try { localStorage.setItem(SCORE_KEY, JSON.stringify(list)); } catch (e) {}
}
function bestScore() {
  const s = loadScores();
  return s.length ? s[0].score : 0;
}
// Add a run to the board. Returns the saved entry (so we can highlight it).
function addScore(entry) {
  const list = loadScores();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  if (list.length > MAX_SCORES) list.length = MAX_SCORES;
  saveScores(list);
  return entry;
}
function renderScores(highlightId) {
  const list = loadScores();
  const table = el("scores-table");
  table.innerHTML = "";
  if (list.length === 0) {
    const e = document.createElement("div");
    e.className = "scores-empty";
    e.textContent = "Aún no hay puntuaciones. ¡Sé el primero en caer con honor!";
    table.appendChild(e);
    return;
  }
  const medals = ["🥇", "🥈", "🥉"];
  list.forEach((s, i) => {
    const row = document.createElement("div");
    row.className = "score-row" + (i < 3 ? " top" : "") + (s.id && s.id === highlightId ? " me" : "");
    const rank = i < 3 ? medals[i] : (i + 1);
    const date = s.date ? new Date(s.date).toLocaleDateString() : "";
    row.innerHTML =
      `<div class="rank">${rank}</div>
       <div class="nm">${escapeHtml(s.name || "Anónimo")}</div>
       <div class="sc">${(s.score || 0).toLocaleString()}</div>
       <div class="meta">Nv ${s.level || 1} · ${s.kills || 0} bajas · ${s.loot || 0} loot${s.boss ? " · 👹 jefe" : ""} · ${date}</div>`;
    table.appendChild(row);
  });
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// the stats of the most recent finished run, awaiting a name to be saved
var pendingRun = null;

// ---------------------------------------------------------------- Menu navigation
var menuViews = { home: el("menu-home"), weapons: el("menu-weapons"), howto: el("menu-howto"), scores: el("menu-scores") };
function showMenuView(name) {
  for (const k in menuViews) menuViews[k].classList.toggle("hidden", k !== name);
  if (name === "scores") renderScores();
  if (name === "home") el("menu-best").textContent = bestScore().toLocaleString();
}
function openMenu() {
  state.running = false;
  closeInventory();
  overScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  bossWrap.style.display = "none";
  interPanel.style.display = "none";
  menuScreen.classList.remove("hidden");
  showMenuView("home");
}

// ---------------------------------------------------------------- Pause
var paused = false;
function pauseGame() {
  if (!state.running || state.over || invOpen) return;
  paused = true;
  pauseScreen.classList.remove("hidden");
}
function resumeGame() {
  paused = false;
  pauseScreen.classList.add("hidden");
}

// ---------------------------------------------------------------- Start / end
function startGame(weaponId) {
  Sound.resume(); // unlock audio on user gesture
  if (typeof weaponId === "string") selectedWeaponId = getWeapon(weaponId).id;
  state = newState(selectedWeaponId);
  updateWeaponHud(state.weaponId);
  recalcStats(state.player); // initialize effective stats
  closeInventory();
  resumeGame();
  spawnObstacles();
  cam.x = clamp(state.player.x - VW / 2, 0, Math.max(0, WORLD.w - VW));
  cam.y = clamp(state.player.y - VH / 2, 0, Math.max(0, WORLD.h - VH));
  if (WORLD.w < VW) cam.x = (WORLD.w - VW) / 2;
  if (WORLD.h < VH) cam.y = (WORLD.h - VH) / 2;
  state.running = true;
  state.over = false;
  menuScreen.classList.add("hidden");
  overScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  bossWrap.style.display = "none";
  interPanel.style.display = "none";
  warningEl.classList.remove("show");
  lootFeed.innerHTML = "";
  startWave(); // begin wave 1
  updateHud();
}

function endGame() {
  if (state.over) return;
  state.running = false;
  state.over = true;
  paused = false;
  pauseScreen.classList.add("hidden");
  const p = state.player;
  // score rewards waves reached, levels, bosses felled and ash hoarded
  const finalScore = state.score + state.wave * 150 + p.level * 100 + state.ash * 2 + state.bossesDown * 1500;
  bossWrap.style.display = "none";
  interPanel.style.display = "none";
  el("over-title").textContent = "Has caído";
  el("final-level").textContent = p.level;
  el("final-wave").textContent = state.wave;
  el("final-kills").textContent = state.kills;
  el("final-loot").textContent = state.lootCount;
  el("final-ash").textContent = state.ash;
  el("final-score").textContent = finalScore.toLocaleString();

  // stash this run so the player can name & save it
  pendingRun = {
    score: finalScore, level: p.level, wave: state.wave,
    kills: state.kills, loot: state.lootCount, ash: state.ash,
    boss: state.bossesDown > 0, date: Date.now(),
  };

  const prevBest = bestScore();
  el("best-score").textContent = finalScore > prevBest && prevBest > 0
    ? "🏆 ¡Nuevo récord! " + finalScore.toLocaleString()
    : "Mejor puntuación: " + Math.max(prevBest, finalScore).toLocaleString();

  // reset the save row
  const nameRow = el("name-row");
  nameRow.style.display = "flex";
  const input = el("name-input");
  input.value = "";
  input.disabled = false;
  el("save-score-btn").disabled = false;
  el("save-score-btn").textContent = "Guardar";

  overScreen.classList.remove("hidden");
  setTimeout(() => { try { input.focus(); } catch (e) {} }, 50);
}

function saveCurrentScore() {
  if (!pendingRun) return;
  const input = el("name-input");
  const name = (input.value || "").trim().slice(0, 14) || "Anónimo";
  const entry = addScore(Object.assign({ id: "r" + Date.now() + Math.random().toString(36).slice(2, 6), name }, pendingRun));
  pendingRun.saved = entry.id;
  pendingRun = null;
  input.disabled = true;
  const btn = el("save-score-btn");
  btn.disabled = true;
  btn.textContent = "✓ Guardado";
  el("name-row").style.display = "none";
  Sound.chest();
}

// ---- menu buttons
el("btn-play").addEventListener("click", () => showMenuView("weapons"));
document.querySelectorAll("[data-weapon]").forEach(button => {
  button.addEventListener("click", () => startGame(button.dataset.weapon));
});
el("btn-how").addEventListener("click", () => showMenuView("howto"));
el("btn-scores").addEventListener("click", () => showMenuView("scores"));
document.querySelectorAll("[data-back]").forEach(b => b.addEventListener("click", () => showMenuView("home")));
el("btn-clear-scores").addEventListener("click", () => {
  saveScores([]);
  renderScores();
});

// ---- pause buttons
el("btn-resume").addEventListener("click", resumeGame);
el("btn-pause-menu").addEventListener("click", () => { endGameToMenu(); });

// leaving to the menu mid-run saves the current progress as a run, then returns home
function endGameToMenu() {
  if (state.running && !state.over) {
    state.running = false;
    state.over = true;
    const p = state.player;
    const finalScore = state.score + state.wave * 150 + p.level * 100 + state.ash * 2 + state.bossesDown * 1500;
    addScore({
      id: "r" + Date.now() + Math.random().toString(36).slice(2, 6),
      name: "Abandono", score: finalScore, level: p.level, wave: state.wave,
      kills: state.kills, loot: state.lootCount, ash: state.ash,
      boss: state.bossesDown > 0, date: Date.now(),
    });
    pendingRun = null;
  }
  openMenu();
}

// ---- game over buttons
el("restart-btn").addEventListener("click", startGame);
el("over-scores-btn").addEventListener("click", () => {
  // auto-save unsaved run under "Anónimo" so it shows up, then view board
  if (pendingRun) saveCurrentScore();
  overScreen.classList.add("hidden");
  menuScreen.classList.remove("hidden");
  showMenuView("scores");
});
el("over-menu-btn").addEventListener("click", () => {
  if (pendingRun) saveCurrentScore();
  openMenu();
});
el("save-score-btn").addEventListener("click", saveCurrentScore);
el("name-input").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); saveCurrentScore(); }
});

// initialize best score on the menu at load
el("menu-best").textContent = bestScore().toLocaleString();

// ---------------------------------------------------------------- Loop
var last = performance.now();
function loop(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05; // clamp big frame gaps
  if (state && state.running) {
    if (!invOpen && !paused) update(dt); // inventory and pause menu freeze the action
    draw();
  }
  requestAnimationFrame(loop);
}
