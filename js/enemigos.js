"use strict";
/*
 * Marea Infernal - enemigos.js (demonios / enemigos)
 * Tipos y spawning (spawnEnemy), separacion/colisiones (separateEnemies, enemySeq,
 * ENEMY_DMG_MULT), IA de muerte (killEnemy), render (drawEnemy, drawAoe) y el jefe
 * Senor de la Marea con su escalado por oleada (spawnBoss, killBoss, drawBoss).
 * Depende de simbolos globales de mecanica.js y personajes.js (var/function).
 * Ultimo archivo cargado: arranca el juego al final.
 */

// Enemy-vs-enemy collisions: soft push-apart so bodies never stack on top of each other.
// Uses a spatial grid (cell 64px > any two radii) so it stays cheap with hundreds of enemies.
// The heavier body (bigger radius) moves less; the boss is immovable. A leaper mid-air is ignored.
var enemySeq = 0;

function separateEnemies() {
  const list = state.enemies;
  const n = list.length;
  if (n < 2 && !state.boss) return;
  const CELL = 64;
  for (let iter = 0; iter < 4; iter++) {
    const grid = new Map();
    for (let i = 0; i < n; i++) {
      const e = list[i];
      if (e.hp <= 0 || e.leaping > 0) continue;
      const key = Math.floor(e.x / CELL) * 4096 + Math.floor(e.y / CELL);
      const cell = grid.get(key);
      if (cell) cell.push(e); else grid.set(key, [e]);
    }
    for (const e of list) {
      if (e.hp <= 0 || e.leaping > 0) continue;
      const cx = Math.floor(e.x / CELL), cy = Math.floor(e.y / CELL);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const cell = grid.get(gx * 4096 + gy);
          if (!cell) continue;
          for (const o of cell) {
            if (o === e || o.id_ >= e.id_) continue; // handle each pair once
            let dx = o.x - e.x, dy = o.y - e.y;
            const min = e.r + o.r;
            let d2 = dx * dx + dy * dy;
            if (d2 >= min * min) continue;
            let d = Math.sqrt(d2);
            if (d < 0.001) { const a = Math.random() * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); d = 1; }
            const overlap = min - d;
            const nx = dx / d, ny = dy / d;
            const me = e.r * e.r, mo = o.r * o.r;       // "mass" ~ area
            const pe = overlap * mo / (me + mo);         // e moves away from o
            const po = overlap * me / (me + mo);         // o moves away from e
            e.x -= nx * pe; e.y -= ny * pe;
            o.x += nx * po; o.y += ny * po;
          }
        }
      }
    }
  }
  // the boss does not move: enemies get pushed out of it
  const boss = state.boss;
  if (boss) {
    for (const e of list) {
      if (e.hp <= 0 || e.leaping > 0) continue;
      let dx = e.x - boss.x, dy = e.y - boss.y;
      const min = e.r + boss.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      let d = Math.sqrt(d2);
      if (d < 0.001) { dx = 1; dy = 0; d = 1; }
      const push = min - d;
      e.x += (dx / d) * push; e.y += (dy / d) * push;
    }
  }
  // keep everyone inside the arena
  for (const e of list) {
    e.x = clamp(e.x, WALL + e.r, WORLD.w - WALL - e.r);
    e.y = clamp(e.y, WALL + e.r, WORLD.h - WALL - e.r);
  }
}

var ENEMY_DMG_MULT = 1.3; // +30% to every damage source of the enemies (contact, projectiles, bombs, boss)

function spawnEnemy() {
  const p = state.player;
  // spawn off-screen around the player
  const ang = rand(0, Math.PI * 2);
  const dsp = rand(650, 1000);
  let x = p.x + Math.cos(ang) * dsp;
  let y = p.y + Math.sin(ang) * dsp;
  x = clamp(x, WALL + 20, WORLD.w - WALL - 20);
  y = clamp(y, WALL + 20, WORLD.h - WALL - 20);

  // never-ending ramp: hp scales fastest; damage and speed more gently (speed capped so it stays fair)
  const w = state.wave;
  const hpScale = 1 + (w - 1) * 0.20;
  const dmgScale = (1 + (w - 1) * 0.10) * ENEMY_DMG_MULT;
  const spdScale = 1 + Math.min(1.1, (w - 1) * 0.03);

  // Weighted type pool. New types unlock progressively so early waves stay simple:
  //  leaper (jumps at you), caster (shoots dodgeable projectiles), bomber (telegraphed AoE).
  const pool = [];
  pool.push(["imp", 50]);
  pool.push(["hound", 22 + Math.min(14, w)]);
  if (w >= 3) pool.push(["brute", Math.min(22, 4 + w)]);
  if (w >= 4) pool.push(["leaper", Math.min(20, 3 + w)]);
  if (w >= 6) pool.push(["caster", Math.min(18, 2 + w)]);
  if (w >= 8) pool.push(["bomber", Math.min(16, 2 + w)]);
  let total = 0; for (const t of pool) total += t[1];
  let r = Math.random() * total, type = "imp";
  for (const t of pool) { r -= t[1]; if (r <= 0) { type = t[0]; break; } }

  let e = { x, y, type, flash: 0, id_: ++enemySeq };
  if (type === "imp") {
    e.r = 15; e.speed = rand(70, 95) * spdScale;
    e.hp = e.maxHp = 24 * hpScale; e.dmg = 9 * dmgScale; e.xp = 10 + w; e.ashChance = 0.35; e.color = "#c0392b";
  } else if (type === "hound") {
    e.r = 13; e.speed = rand(120, 150) * spdScale;
    e.hp = e.maxHp = 16 * hpScale; e.dmg = 7 * dmgScale; e.xp = 8 + w; e.ashChance = 0.3; e.color = "#8e44ad";
  } else if (type === "brute") {
    e.r = 26; e.speed = rand(45, 60) * (1 + Math.min(0.5, (w - 1) * 0.02));
    e.hp = e.maxHp = 90 * hpScale; e.dmg = 20 * dmgScale; e.xp = 35 + w * 2; e.ashChance = 0.8; e.color = "#7a1d1d";
  } else if (type === "leaper") {
    // closes in, then leaps across a gap; big contact hit on landing
    e.r = 16; e.speed = rand(90, 115) * spdScale;
    e.hp = e.maxHp = 30 * hpScale; e.dmg = 16 * dmgScale; e.xp = 16 + w; e.ashChance = 0.4; e.color = "#2e8b57";
    e.leapCd = rand(1.2, 2.2); e.leaping = 0; e.lvx = 0; e.lvy = 0;
  } else if (type === "caster") {
    // keeps its distance and fires dodgeable bolts (big so it reads clearly)
    e.r = 23; e.speed = rand(55, 75) * spdScale;
    e.hp = e.maxHp = 34 * hpScale; e.dmg = 6 * dmgScale; e.xp = 18 + w; e.ashChance = 0.45; e.color = "#2f6fd1";
    e.shootCd = rand(1.4, 2.4); e.projDmg = 12 * dmgScale;
  } else { // bomber
    // plants a telegraphed ground AoE you must step out of
    e.r = 20; e.speed = rand(50, 68) * spdScale;
    e.hp = e.maxHp = 40 * hpScale; e.dmg = 8 * dmgScale; e.xp = 22 + w; e.ashChance = 0.55; e.color = "#b8860b";
    e.bombCd = rand(2.0, 3.2); e.aoeDmg = 22 * dmgScale;
  }
  e.speed *= 0.75 * 1.1; // -25% from the original, then +10% (net x0.825)
  state.enemies.push(e);
}

function spawnBoss() {
  const p = state.player;
  const ang = rand(0, Math.PI * 2);
  let x = clamp(p.x + Math.cos(ang) * 600, 80, WORLD.w - 80);
  let y = clamp(p.y + Math.sin(ang) * 600, 80, WORLD.h - 80);
  const scale = 1 + (state.wave - 1) * 0.12;
  state.boss = {
    x, y, r: 48, type: "boss",
    speed: 85 + Math.min(40, state.wave),
    hp: 2600 * scale, maxHp: 2600 * scale,
    dmg: 26 * (1 + (state.wave - 1) * 0.05) * ENEMY_DMG_MULT, xp: 600 + state.wave * 20, flash: 0,
    color: "#8a0f2a",
    shootCd: 2, phase: 0,
  };
  bossWrap.style.display = "block";
  showWarning("¡El Señor de la Marea<br>ha despertado!");
  state.shake = 18;
  Sound.boss();
}

function killEnemy(e) {
  state.kills++;
  state.alive = Math.max(0, state.alive - 1);
  state.score += Math.round(e.xp * 1.5);
  Sound.kill();
  gainXp(e.xp);
  // blood burst
  for (let i = 0; i < 14; i++) {
    const a = rand(0, Math.PI * 2), s = rand(40, 240);
    state.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), r: rand(2, 5), color: Math.random() < 0.5 ? "#8b0a0a" : "#c0392b" });
  }
  // drop an XP/ash orb and sometimes loot
  state.orbs.push({ x: e.x, y: e.y, r: 7, kind: "xp", val: Math.round(e.xp * 0.4), vx: rand(-40, 40), vy: rand(-40, 40) });
  if (Math.random() < e.ashChance) {
    const amt = e.type === "brute" ? randInt(3, 6) : randInt(1, 2);
    state.orbs.push({ x: e.x + rand(-10, 10), y: e.y + rand(-10, 10), r: 8, kind: "ash", val: amt, vx: rand(-40, 40), vy: rand(-40, 40) });
  }
}

function killBoss(boss) {
  state.boss = null;
  state.bossDefeated = true;
  state.bossesDown++;
  state.kills++;
  state.score += 1500;
  state.ash += 40;
  bossWrap.style.display = "none";
  spawnChest(boss.x, boss.y);
  floatText(boss.x, boss.y - 60, "¡Cofre del jefe!", "#ffd84d");
  showWarning("¡Señor de la Marea<br>derrotado!");
  state.shake = 22;
  Sound.bossdie();
  gainXp(boss.xp);
  // no item drops anymore: the boss showers brasas instead
  for (let i = 0; i < 10; i++) {
    state.orbs.push({ x: boss.x + rand(-40, 40), y: boss.y + rand(-40, 40), r: 9, kind: "ash", val: 15, vx: rand(-80, 80), vy: rand(-80, 80) });
  }
  state.orbs.push({ x: boss.x, y: boss.y, r: 10, kind: "ash", val: 20, vx: rand(-60, 60), vy: rand(-60, 60) });
  // the boss drops stay on the floor; everything is absorbed when the pause starts
  // explosion
  for (let i = 0; i < 60; i++) {
    const a = rand(0, Math.PI * 2), s = rand(80, 420);
    state.particles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.5, 1.1), r: rand(2, 6), color: pick(["#ffd84d", "#ff7a2a", "#c0392b"]) });
  }
}

function drawEnemy(e) {
  ctx.save();
  if (e.flash > 0) ctx.globalAlpha = 0.9;
  // spiky demon body
  const spikes = e.type === "brute" ? 8 : 6;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const ang = (i / (spikes * 2)) * Math.PI * 2;
    const rr = (i % 2 === 0) ? e.r : e.r * 0.62;
    const px = e.x + Math.cos(ang) * rr;
    const py = e.y + Math.sin(ang) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  // thick black outline so enemies read clearly against floor and loot
  ctx.lineJoin = "round";
  ctx.lineWidth = 3.5; ctx.strokeStyle = "#000"; ctx.stroke();
  // fill with glow
  ctx.shadowBlur = 10; ctx.shadowColor = e.color;
  ctx.fillStyle = e.flash > 0 ? "#fff" : e.color;
  ctx.fill();
  ctx.restore();
  // eyes
  ctx.fillStyle = "#ffe36a";
  const ex = e.x, ey = e.y;
  ctx.beginPath(); ctx.arc(ex - e.r * 0.3, ey - e.r * 0.1, e.r * 0.14, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(ex + e.r * 0.3, ey - e.r * 0.1, e.r * 0.14, 0, Math.PI * 2); ctx.fill();
  // per-type cue so the special enemies read at a glance
  if (e.type === "leaper") {
    // ring around the body; brighter while mid-leap
    ctx.strokeStyle = e.leaping > 0 ? "rgba(140,255,180,0.9)" : "rgba(110,255,160,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 5, 0, Math.PI * 2); ctx.stroke();
  } else if (e.type === "caster") {
    // arcane core
    ctx.fillStyle = "rgba(127,179,255,0.9)";
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.3, 0, Math.PI * 2); ctx.fill();
  } else if (e.type === "bomber") {
    // pulsing warning dot on top
    const t = performance.now() / 200;
    ctx.fillStyle = "rgba(255,180,60," + (0.5 + Math.sin(t) * 0.4) + ")";
    ctx.beginPath(); ctx.arc(e.x, e.y - e.r - 6, 4, 0, Math.PI * 2); ctx.fill();
  }
  // hp bar
  if (e.hp < e.maxHp) {
    const w = e.r * 2;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(e.x - w / 2, e.y - e.r - 10, w, 4);
    ctx.fillStyle = "#e0241c";
    ctx.fillRect(e.x - w / 2, e.y - e.r - 10, w * clamp(e.hp / e.maxHp, 0, 1), 4);
  }
}

function drawAoe(z) {
  ctx.save();
  if (z.warn > 0) {
    const t = performance.now() / 120;
    const prog = 1 - z.warn / 1.1; // fills up as it's about to go off
    ctx.fillStyle = "rgba(255,120,30,0.12)";
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,150,40," + (0.5 + Math.sin(t) * 0.3) + ")";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.stroke();
    // inner fill ring showing countdown
    ctx.fillStyle = "rgba(255,90,20,0.18)";
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r * prog, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.globalAlpha = clamp(z.active / 0.35, 0, 1);
    ctx.shadowBlur = 24; ctx.shadowColor = "#ff7a2a";
    ctx.fillStyle = "#ff8a3a";
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawBoss(b) {
  const t = performance.now() / 300;
  ctx.save();
  // aura
  ctx.shadowBlur = 40; ctx.shadowColor = "#ff2a1a";
  ctx.fillStyle = b.flash > 0 ? "#fff" : b.color;
  ctx.beginPath();
  const spikes = 10;
  for (let i = 0; i < spikes * 2; i++) {
    const ang = (i / (spikes * 2)) * Math.PI * 2 + t * 0.2;
    const rr = (i % 2 === 0) ? b.r : b.r * 0.66;
    const px = b.x + Math.cos(ang) * rr;
    const py = b.y + Math.sin(ang) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill();
  // inner core
  ctx.shadowBlur = 20;
  ctx.fillStyle = "#ff3a1a";
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.4 + Math.sin(t * 2) * 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // eyes
  ctx.fillStyle = "#ffe36a";
  ctx.beginPath(); ctx.arc(b.x - b.r * 0.28, b.y - b.r * 0.1, b.r * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(b.x + b.r * 0.28, b.y - b.r * 0.1, b.r * 0.1, 0, Math.PI * 2); ctx.fill();
}

// ---------------------------------------------------------------- Arranque
state = newState();
requestAnimationFrame(loop);
