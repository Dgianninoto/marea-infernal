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
  const w = state.wave;
  const scale = 1 + (w - 1) * 0.12;

  const hasLeap  = w >= 20; // Oleada 20+: salto aplastante
  const hasBombs = w >= 30; // Oleada 30+: lluvia de AoEs multiples

  let title = "\u00a1El Se\u00f1or de la Marea<br>ha despertado!";
  if (hasLeap && hasBombs) title = "\u00a1El Se\u00f1or de la Marea<br><span style='color:#ff3a1a;font-size:18px'>\u2014 Forma Devastadora \u2014</span>";
  else if (hasBombs)       title = "\u00a1El Se\u00f1or de la Marea<br><span style='color:#ff9d4d;font-size:18px'>\u2014 Forma Flam\u00edgera \u2014</span>";
  else if (hasLeap)        title = "\u00a1El Se\u00f1or de la Marea<br><span style='color:#6affa0;font-size:18px'>\u2014 Forma Aplastante \u2014</span>";

  state.boss = {
    x, y,
    r: 48 + (hasLeap ? 4 : 0) + (hasBombs ? 4 : 0),
    type: "boss",
    speed: 85 + Math.min(40, w),
    hp: 2600 * scale, maxHp: 2600 * scale,
    dmg: 26 * (1 + (w - 1) * 0.05) * ENEMY_DMG_MULT,
    xp: 600 + w * 20, flash: 0,
    color: (hasLeap && hasBombs) ? "#6a0a3a" : (hasBombs ? "#7a1a08" : "#8a0f2a"),
    shootCd: 2, phase: 0,
    hasLeap,
    leapCd: hasLeap ? rand(4.5, 6.5) : Infinity,
    leaping: 0, lvx: 0, lvy: 0,
    hasBombs,
    bombRainCd: hasBombs ? rand(6.0, 9.0) : Infinity,
  };
  bossWrap.style.display = "block";
  showWarning(title);
  state.shake = 18;
  Sound.boss();
}

function killEnemy(e) {
  if (e.type === "goblin") {
    killGoblin(e);
    return;
  }
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
  if (e.type === "goblin") {
    drawGoblin(e);
    return;
  }
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
    const prog = clamp(1 - z.warn / 1.1, 0, 1); // fills up as it's about to go off
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

  // Indicador de salto: sombra verde bajo el jefe cuando salta
  if (b.hasLeap && b.leaping > 0) {
    ctx.save();
    const leapPulse = 0.5 + Math.sin(t * 8) * 0.4;
    ctx.strokeStyle = "rgba(106,255,160," + leapPulse + ")";
    ctx.lineWidth = 4;
    ctx.shadowBlur = 18; ctx.shadowColor = "#6affa0";
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 10, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // Anillo de lluvia de fuego pulsante cuando hasBombs y en cooldown bajo
  if (b.hasBombs && b.bombRainCd < 3.5 && b.leaping <= 0) {
    ctx.save();
    const firePulse = 0.3 + Math.sin(t * 5) * 0.3;
    ctx.strokeStyle = "rgba(255,157,77," + (firePulse + 0.4) + ")";
    ctx.lineWidth = 3.5;
    ctx.shadowBlur = 22; ctx.shadowColor = "#ff9d4d";
    ctx.setLineDash([8, 5]);
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 16, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Aura externa giratoria (mas grande en formas avanzadas)
  const auraSize = b.r + (b.hasLeap && b.hasBombs ? 14 : b.hasLeap || b.hasBombs ? 8 : 2);
  ctx.shadowBlur = 40 + (b.hasBombs ? 18 : 0); ctx.shadowColor = b.hasBombs ? "#ff6a00" : "#ff2a1a";
  ctx.fillStyle = b.flash > 0 ? "#fff" : b.color;
  ctx.beginPath();
  const spikes = b.hasLeap && b.hasBombs ? 14 : (b.hasLeap || b.hasBombs ? 12 : 10);
  for (let i = 0; i < spikes * 2; i++) {
    const ang = (i / (spikes * 2)) * Math.PI * 2 + t * (b.leaping > 0 ? 1.2 : 0.2);
    const rr = (i % 2 === 0) ? auraSize : auraSize * 0.62;
    const px = b.x + Math.cos(ang) * rr;
    const py = b.y + Math.sin(ang) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill();

  // Inner core (mas brillante en la Forma Devastadora)
  ctx.shadowBlur = 20;
  const coreColor = b.hasLeap && b.hasBombs ? "#c0102a" : "#ff3a1a";
  ctx.fillStyle = coreColor;
  const coreR = b.r * 0.4 + Math.sin(t * 2) * 3 + (b.leaping > 0 ? 8 : 0);
  ctx.beginPath(); ctx.arc(b.x, b.y, coreR, 0, Math.PI * 2); ctx.fill();

  // Segundo anillo en Forma Devastadora (wave 40)
  if (b.hasLeap && b.hasBombs) {
    ctx.fillStyle = "rgba(106,10,58,0.6)";
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.7 + Math.sin(t * 3 + 1) * 4, 0, Math.PI * 2); ctx.fill();
  }

  ctx.restore();

  // Eyes (más grandes en formas avanzadas)
  const eyeScale = b.hasLeap && b.hasBombs ? 1.3 : (b.hasLeap || b.hasBombs ? 1.15 : 1);
  ctx.fillStyle = b.hasLeap ? "#6affa0" : "#ffe36a";
  ctx.beginPath(); ctx.arc(b.x - b.r * 0.28, b.y - b.r * 0.1, b.r * 0.1 * eyeScale, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = b.hasBombs ? "#ff9d4d" : "#ffe36a";
  ctx.beginPath(); ctx.arc(b.x + b.r * 0.28, b.y - b.r * 0.1, b.r * 0.1 * eyeScale, 0, Math.PI * 2); ctx.fill();

  // Indicador textual de habilidades activas
  if (b.hasLeap || b.hasBombs) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    const tagX = b.x - 38, tagY = b.y + b.r + 6, tagW = 76, tagH = 15, tagR = 4;
    ctx.beginPath();
    ctx.moveTo(tagX + tagR, tagY);
    ctx.lineTo(tagX + tagW - tagR, tagY);
    ctx.quadraticCurveTo(tagX + tagW, tagY, tagX + tagW, tagY + tagR);
    ctx.lineTo(tagX + tagW, tagY + tagH - tagR);
    ctx.quadraticCurveTo(tagX + tagW, tagY + tagH, tagX + tagW - tagR, tagY + tagH);
    ctx.lineTo(tagX + tagR, tagY + tagH);
    ctx.quadraticCurveTo(tagX, tagY + tagH, tagX, tagY + tagH - tagR);
    ctx.lineTo(tagX, tagY + tagR);
    ctx.quadraticCurveTo(tagX, tagY, tagX + tagR, tagY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff0c2";
    ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center";
    const tags = [];
    if (b.hasLeap)  tags.push("⚡Salto");
    if (b.hasBombs) tags.push("🔥Lluvia");
    ctx.fillText(tags.join("  "), b.x, b.y + b.r + 17);
    ctx.textAlign = "left";
  }
}

// ---------------------------------------------------------------- Duende del Tesoro (Goblin de Diablo)
function spawnGoblin(x, y) {
  const p = state.player;
  const w = state.wave;
  const hpScale = 1 + (w - 1) * 0.18;
  const e = {
    x: clamp(x, WALL + 30, WORLD.w - WALL - 30),
    y: clamp(y, WALL + 30, WORLD.h - WALL - 30),
    type: "goblin",
    r: 18,
    speed: 155, // ágil y escurridizo
    hp: 130 * hpScale,
    maxHp: 130 * hpScale,
    dmg: 0, // ¡no daña al jugador!
    xp: 70 + w * 12,
    color: "#2ecc71",
    flash: 0,
    id_: ++enemySeq,
    vx: 0,
    vy: 0,
    facing: 1,
    hopPhase: 0,
    hopHeight: 0,
    ashTimer: rand(1.1, 1.6),
    trailTimer: 0,
    panicTimer: 0,
    escapeTimer: 32, // tiempo total antes de escapar
    portalState: "none", // "none" | "opening"
    portalTime: 0,
  };
  state.enemies.push(e);
  if (Sound && Sound.goblin) Sound.goblin();
  floatText(e.x, e.y - 50, "¡Duende del Tesoro!", "#ffd84d");
  showWarning("¡Un Duende del Tesoro ha aparecido!<br><span style='font-size:18px;color:#ffd84d'>¡Persíguelo antes de que escape con las cenizas!</span>");
  for (let i = 0; i < 24; i++) {
    const a = rand(0, Math.PI * 2), s = rand(50, 200);
    state.particles.push({
      x: e.x, y: e.y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: rand(0.4, 0.8), r: rand(2, 4),
      color: pick(["#ffd84d", "#ff9d4d", "#2ecc71", "#ffffff"])
    });
  }
  return e;
}

function spawnGoblinNearPlayer() {
  if (state.enemies.some(e => e.type === "goblin" && e.hp > 0)) return;
  const p = state.player;
  let x = p.x, y = p.y + 240;
  for (let i = 0; i < 30; i++) {
    const a = rand(0, Math.PI * 2), d = rand(280, 460);
    const gx = clamp(p.x + Math.cos(a) * d, WALL + 50, WORLD.w - WALL - 50);
    const gy = clamp(p.y + Math.sin(a) * d, WALL + 50, WORLD.h - WALL - 50);
    const m = 26;
    if (!pointInObstacle(gx, gy) && !pointInObstacle(gx - m, gy - m) && !pointInObstacle(gx + m, gy - m) &&
        !pointInObstacle(gx - m, gy + m) && !pointInObstacle(gx + m, gy + m)) {
      x = gx; y = gy; break;
    }
  }
  spawnGoblin(x, y);
}

function updateGoblin(e, dt, p, dx, dy, d) {
  if (e.panicTimer > 0) e.panicTimer -= dt;
  e.escapeTimer -= dt;

  // Apertura de portal de escape al acabarse el tiempo
  if (e.escapeTimer <= 5 && e.portalState === "none") {
    e.portalState = "opening";
    e.portalTime = 0;
    floatText(e.x, e.y - 45, "¡Abriendo portal!", "#e056fd");
  }

  const channeling = e.portalState === "opening" && e.panicTimer <= 0;
  if (channeling) {
    e.portalTime += dt;
    if (Math.random() < 0.6) {
      const a = rand(0, Math.PI * 2), dist = rand(15, 36);
      state.particles.push({
        x: e.x + Math.cos(a) * dist,
        y: e.y + Math.sin(a) * dist,
        vx: -Math.cos(a) * 45 + rand(-10, 10),
        vy: -Math.sin(a) * 45 + rand(-10, 10),
        life: 0.4, r: rand(2, 4),
        color: pick(["#e056fd", "#be2edd", "#ffd84d"])
      });
    }
    if (e.escapeTimer <= 0) {
      e.hp = 0; // Desaparece a través del portal
      if (Sound && Sound.goblinEscape) Sound.goblinEscape();
      floatText(e.x, e.y - 40, "¡El Duende escapó!", "#ff7675");
      for (let i = 0; i < 30; i++) {
        const a = rand(0, Math.PI * 2), s = rand(60, 240);
        state.particles.push({
          x: e.x, y: e.y,
          vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          life: rand(0.4, 0.8), r: rand(2, 5),
          color: pick(["#e056fd", "#be2edd", "#ffffff"])
        });
      }
      return;
    }
  }

  // Velocidad y huida del jugador
  let moveSpd = e.speed;
  if (e.panicTimer > 0) moveSpd *= 1.45; // sprint de pánico

  let fleeX = -dx / (d || 1);
  let fleeY = -dy / (d || 1);

  // Evitar paredes del mapa suavemente
  const edgeDist = 180;
  if (e.x < WALL + edgeDist) fleeX += 0.8;
  if (e.x > WORLD.w - WALL - edgeDist) fleeX -= 0.8;
  if (e.y < WALL + edgeDist) fleeY += 0.8;
  if (e.y > WORLD.h - WALL - edgeDist) fleeY -= 0.8;

  // Zigzag errático al huir
  const zigzag = Math.sin(performance.now() / 240) * 0.35;
  const perpX = -fleeY, perpY = fleeX;
  fleeX += perpX * zigzag;
  fleeY += perpY * zigzag;

  const fLen = Math.hypot(fleeX, fleeY) || 1;
  fleeX /= fLen; fleeY /= fLen;

  if (!channeling) {
    e.vx = fleeX * moveSpd;
    e.vy = fleeY * moveSpd;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    if (fleeX !== 0) e.facing = fleeX > 0 ? 1 : -1;
  } else {
    e.vx = 0;
    e.vy = 0;
  }

  e.x = clamp(e.x, WALL + e.r, WORLD.w - WALL - e.r);
  e.y = clamp(e.y, WALL + e.r, WORLD.h - WALL - e.r);

  const ro = resolveObstacles(e.x, e.y, e.r);
  e.x = ro.x; e.y = ro.y;

  // Ciclo de saltos ("va saltando")
  const hopRate = channeling ? 4 : (e.panicTimer > 0 ? 16 : 10);
  e.hopPhase = (e.hopPhase || 0) + dt * hopRate;
  const sinHop = Math.sin(e.hopPhase);
  e.hopHeight = Math.max(0, sinHop) * (channeling ? 5 : (e.panicTimer > 0 ? 17 : 13));

  // Pistas de partículas brillantes y cenizas
  e.trailTimer -= dt;
  if (e.trailTimer <= 0) {
    e.trailTimer = channeling ? 0.2 : (e.panicTimer > 0 ? 0.05 : 0.09);
    state.particles.push({
      x: e.x + rand(-6, 6),
      y: e.y + rand(-3, 3),
      vx: rand(-15, 15),
      vy: rand(-15, 15),
      life: rand(0.4, 0.7),
      r: rand(1.5, 3),
      color: pick(["#ffd84d", "#ff9d4d", "#ff7a2a", "#f1c40f"])
    });
  }

  // Dejar orbes de ceniza reales como pistas en el camino ("dejando pistas o en este caso cenizas")
  e.ashTimer -= dt;
  if (!channeling && e.ashTimer <= 0) {
    e.ashTimer = rand(1.1, 1.7);
    const ashVal = randInt(1, 2);
    state.orbs.push({
      x: e.x + rand(-8, 8),
      y: e.y + rand(-8, 8),
      r: 8,
      kind: "ash",
      val: ashVal,
      vx: rand(-30, 30),
      vy: rand(-30, 30)
    });
    for (let i = 0; i < 4; i++) {
      state.particles.push({
        x: e.x, y: e.y,
        vx: rand(-30, 30), vy: rand(-30, 30),
        life: 0.35, r: rand(1.5, 3),
        color: "#ff9d4d"
      });
    }
  }
}

function onGoblinHit(e) {
  e.panicTimer = 1.2;
  if (e.portalState === "opening") {
    e.escapeTimer = Math.min(12, e.escapeTimer + 2.2);
    e.portalState = "none";
    floatText(e.x, e.y - 45, "¡Portal interrumpido!", "#ffd84d");
  }
  if (Sound && Sound.goblinHit) Sound.goblinHit();
  // Deja caer cenizas extras al ser golpeado
  const dropCount = randInt(1, 3);
  for (let i = 0; i < dropCount; i++) {
    state.orbs.push({
      x: e.x + rand(-12, 12),
      y: e.y + rand(-12, 12),
      r: 8,
      kind: "ash",
      val: randInt(2, 3),
      vx: rand(-50, 50),
      vy: rand(-50, 50)
    });
  }
}

function killGoblin(e) {
  state.kills++;
  state.score += 800;
  if (Sound && Sound.goblinDie) Sound.goblinDie();
  else if (Sound && Sound.chest) Sound.chest();

  const p = state.player;
  const baseReward = 200;
  const totalAsh = Math.round(baseReward * (1 + (p.ashBonus || 0)));

  gainXp(e.xp || 100);
  state.shake = Math.max(state.shake, 14);
  floatText(e.x, e.y - 45, "¡DUENDE ANIQUILADO! +" + totalAsh + "🔥", "#ffd84d");

  // Lluvia explosiva de orbes de ceniza que suman 200 (afectados por bonus de cenizas)
  const orbCount = 10;
  const perOrb = Math.floor(totalAsh / orbCount);
  const remainder = totalAsh - perOrb * orbCount;

  for (let i = 0; i < orbCount; i++) {
    const angle = (i / orbCount) * Math.PI * 2 + rand(-0.2, 0.2);
    const speed = rand(80, 220);
    state.orbs.push({
      x: e.x,
      y: e.y,
      r: 10,
      kind: "ash",
      val: perOrb + (i === 0 ? remainder : 0),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed
    });
  }

  // Orbes de experiencia
  for (let i = 0; i < 3; i++) {
    state.orbs.push({
      x: e.x + rand(-10, 10),
      y: e.y + rand(-10, 10),
      r: 8,
      kind: "xp",
      val: Math.round(e.xp * 0.35),
      vx: rand(-70, 70),
      vy: rand(-70, 70)
    });
  }

  // Fuegos artificiales de partículas (oro, fuego, gemas)
  for (let i = 0; i < 60; i++) {
    const a = rand(0, Math.PI * 2), s = rand(60, 340);
    state.particles.push({
      x: e.x, y: e.y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: rand(0.5, 1.2), r: rand(2.5, 6),
      color: pick(["#ffd84d", "#ff9d4d", "#ff5252", "#2ecc71", "#ffffff", "#f1c40f", "#e056fd"])
    });
  }
}

function drawSparkle(ctx, x, y, size) {
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size * 0.3, y - size * 0.3);
  ctx.lineTo(x + size, y);
  ctx.lineTo(x + size * 0.3, y + size * 0.3);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size * 0.3, y + size * 0.3);
  ctx.lineTo(x - size, y);
  ctx.lineTo(x - size * 0.3, y - size * 0.3);
  ctx.closePath();
  ctx.fill();
}

function drawGoblin(e) {
  // Sombra dinámica en el suelo según la altura del salto
  const hopH = e.hopHeight || 0;
  const shadowScale = clamp(1 - (hopH / 30), 0.45, 1);
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0," + (0.45 * shadowScale) + ")";
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + 6, (e.r + 2) * shadowScale, ((e.r + 2) * 0.45) * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Portal de escape dimensional si está canalizando
  if (e.portalState === "opening") {
    const t = performance.now() / 200;
    ctx.save();
    ctx.translate(e.x, e.y + 4);
    ctx.scale(1, 0.45);
    const grad = ctx.createRadialGradient(0, 0, 5, 0, 0, 42);
    grad.addColorStop(0, "rgba(224, 86, 253, 0.85)");
    grad.addColorStop(0.6, "rgba(108, 92, 231, 0.5)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, 42, 0, Math.PI * 2); ctx.fill();

    ctx.rotate(t);
    ctx.strokeStyle = "rgba(255, 216, 77, 0.75)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 4; a += 0.2) {
      const pr = 4 + a * 2.8;
      const px = Math.cos(a) * pr, py = Math.sin(a) * pr;
      if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Dibujo del Duende
  ctx.save();
  ctx.translate(e.x, e.y - hopH);
  if (e.facing === -1) {
    ctx.scale(-1, 1);
  }

  // Deformación de salto y aterrizaje (squash & stretch)
  const sinHop = Math.sin(e.hopPhase || 0);
  let sx = 1, sy = 1;
  if (sinHop > 0.35) {
    sx = 0.88; sy = 1.14; // estiramiento en el aire
  } else if (sinHop < 0.1 && sinHop > -0.3) {
    sx = 1.15; sy = 0.88; // aplastamiento al aterrizar
  }
  ctx.scale(sx, sy);

  if (e.flash > 0) ctx.globalAlpha = 0.85;

  // 1. Saco de botín gigante sobrecargado en la espalda
  ctx.save();
  const jiggle = Math.sin((e.hopPhase || 0) * 0.8) * 0.1;
  ctx.rotate(jiggle - 0.15);

  ctx.shadowColor = "#ffd84d";
  ctx.shadowBlur = 12;

  // Cuerpo del saco de cuero
  const sackGrad = ctx.createRadialGradient(-10, -8, 2, -10, -6, 20);
  sackGrad.addColorStop(0, "#a06535");
  sackGrad.addColorStop(0.7, "#6b3e1b");
  sackGrad.addColorStop(1, "#42220c");
  ctx.fillStyle = sackGrad;
  ctx.strokeStyle = "#2e1506";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.ellipse(-12, -4, 15, 17, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Costuras del saco
  ctx.strokeStyle = "#d4a373";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-16, -6); ctx.lineTo(-12, -2);
  ctx.moveTo(-15, -3); ctx.lineTo(-13, -5);
  ctx.stroke();

  // Cuerda dorada del saco
  ctx.fillStyle = "#ffd84d";
  ctx.fillRect(-15, -19, 8, 3.5);

  // Monedas y gemas desbordándose
  ctx.fillStyle = "#ffe066";
  ctx.beginPath(); ctx.arc(-13, -22, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-9, -21, 2.8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-15, -20, 2.5, 0, Math.PI * 2); ctx.fill();

  // Rubí brillante
  ctx.fillStyle = "#ff3366";
  ctx.beginPath();
  ctx.moveTo(-11, -25); ctx.lineTo(-8, -22); ctx.lineTo(-11, -19); ctx.lineTo(-14, -22);
  ctx.closePath(); ctx.fill();

  // Esmeralda brillante
  ctx.fillStyle = "#00e676";
  ctx.beginPath();
  ctx.moveTo(-7, -23); ctx.lineTo(-5, -20); ctx.lineTo(-7, -17); ctx.lineTo(-9, -20);
  ctx.closePath(); ctx.fill();

  // Brillo titilante
  const sparkleTime = performance.now() / 250;
  const sparkleAlpha = 0.5 + Math.sin(sparkleTime) * 0.5;
  ctx.fillStyle = "rgba(255, 255, 255, " + sparkleAlpha + ")";
  drawSparkle(ctx, -10, -26, 4 + Math.sin(sparkleTime) * 1.5);

  ctx.restore();

  // 2. Patas y cuerpo del Duende
  const legSwing = Math.sin((e.hopPhase || 0) * 1.2) * 5;
  ctx.fillStyle = "#1e392a";
  ctx.beginPath(); ctx.ellipse(-6 + legSwing, 12, 4.5, 3, 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(6 - legSwing, 12, 4.5, 3, -0.2, 0, Math.PI * 2); ctx.fill();

  // Túnica carmesí
  ctx.fillStyle = "#8e1b24";
  ctx.strokeStyle = "#38070b";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-3, 0); ctx.lineTo(9, 1); ctx.lineTo(7, 10); ctx.lineTo(-5, 9);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // Cinturón dorado
  ctx.fillStyle = "#d4af37";
  ctx.fillRect(-4, 5, 12, 2.5);

  // Brazo sujetando la correa
  ctx.fillStyle = "#27ae60";
  ctx.strokeStyle = "#145a32";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(3, 4, 3.5, 5, 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // 3. Cabeza y rostro del Duende
  ctx.save();
  ctx.translate(5, -6);

  // Orejas puntiagudas características
  ctx.fillStyle = "#27ae60";
  ctx.strokeStyle = "#145a32";
  ctx.beginPath();
  ctx.moveTo(-4, -1); ctx.lineTo(-15, -6); ctx.lineTo(-4, 4);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#e07b89";
  ctx.beginPath();
  ctx.moveTo(-4, 0); ctx.lineTo(-12, -5); ctx.lineTo(-4, 3);
  ctx.closePath(); ctx.fill();

  // Cabeza base
  ctx.fillStyle = e.flash > 0 ? "#ffffff" : "#2ecc71";
  ctx.strokeStyle = "#145a32";
  ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.ellipse(0, 0, 8.5, 7.5, 0.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // Nariz curva prominente
  ctx.fillStyle = "#27ae60";
  ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(12, 2); ctx.lineTo(4, 4); ctx.closePath(); ctx.fill(); ctx.stroke();

  // Ojos brillantes amarillos
  ctx.fillStyle = "#fff066";
  ctx.shadowColor = "#ffd84d";
  ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.ellipse(3, -2, 3.2, 4, 0.1, 0, Math.PI * 2); ctx.fill();

  // Pupila mirando hacia atrás (al jugador)
  ctx.fillStyle = "#111";
  ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.arc(1.8, -2, 1.4, 0, Math.PI * 2); ctx.fill();

  // Sonrisa pícara con colmillo
  ctx.strokeStyle = "#145a32";
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(2, 4, 4, 0.2, Math.PI * 0.8); ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.moveTo(3, 4); ctx.lineTo(4, 6.5); ctx.lineTo(5, 4); ctx.closePath(); ctx.fill();

  // Pequeña capucha
  ctx.fillStyle = "#8e1b24";
  ctx.beginPath(); ctx.moveTo(-5, -6); ctx.lineTo(1, -12); ctx.lineTo(6, -6); ctx.closePath(); ctx.fill();

  ctx.restore(); // fin cabeza
  ctx.restore(); // fin cuerpo duende

  // Interfaz flotante: Nombre + Barra de vida
  const barW = 36;
  const barY = e.y - hopH - 26;

  ctx.fillStyle = "rgba(0,0,0,0.7)";
  roundRect(e.x - barW / 2 - 2, barY - 12, barW + 4, 18, 3);
  ctx.fill();

  ctx.fillStyle = "#ffd84d";
  ctx.font = "bold 9px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("💰 Duende 💰", e.x, barY - 3);

  ctx.fillStyle = "rgba(40, 10, 10, 0.8)";
  ctx.fillRect(e.x - barW / 2, barY, barW, 3.5);
  ctx.fillStyle = "#2ecc71";
  const hpPct = clamp(e.hp / e.maxHp, 0, 1);
  ctx.fillRect(e.x - barW / 2, barY, barW * hpPct, 3.5);

  if (e.portalState === "opening") {
    ctx.fillStyle = "#ff7675";
    ctx.font = "bold 10px sans-serif";
    ctx.fillText("¡Portal! " + Math.max(0, e.escapeTimer).toFixed(1) + "s", e.x, barY - 14);
  }

  ctx.textAlign = "left";
}

// ---------------------------------------------------------------- Arranque
state = newState();
requestAnimationFrame(loop);
