"use strict";
/*
 * Marea Infernal - personajes.js (jugador / personaje)
 * Estado y acciones del heroe: disparo y apuntado (fire, spawnArrow),
 * habilidades (useSkill), progresion / subida de nivel (gainXp), esquive/dash
 * (tryDash) y su render (drawPlayer, drawArrow).
 * Depende de simbolos globales definidos en mecanica.js (var/function).
 */

// ---------------------------------------------------------------- Combat / loot
function fire() {
  const p = state.player;
  const lag = Math.max(0, -p.fireCd);   // time elapsed since this shot was due (spreads multi-shot frames)
  p.fireCd += p.fireRate;
  if (state.time - (p.lastShootSnd || -1) > 0.06) { p.lastShootSnd = state.time; Sound.shoot(); }
  const spd = 620;
  const crit = Math.random() < p.crit; // critical hit: damage x2
  state.bullets.push({
    x: p.x + p.aimX * (p.r + spd * lag), y: p.y + p.aimY * (p.r + spd * lag),
    vx: p.aimX * spd, vy: p.aimY * spd,
    r: 5, dmg: p.dmg * (crit ? 2 : 1), life: 0.55, crit,
  });
  // muzzle sparks
  for (let i = 0; i < 4; i++) {
    state.particles.push({
      x: p.x + p.aimX * p.r, y: p.y + p.aimY * p.r,
      vx: p.aimX * rand(60, 160) + rand(-60, 60),
      vy: p.aimY * rand(60, 160) + rand(-60, 60),
      life: 0.25, r: rand(1, 3), color: "#ffcf80",
    });
  }
}

// Spawn a single arrow heading at angle `ang`. opts: {dmg, r, spd, pierce, big, color}
function spawnArrow(ang, opts) {
  const p = state.player;
  const o = opts || {};
  const spd = o.spd || 620;
  const crit = Math.random() < p.crit; // each skill arrow rolls its own crit: damage x2
  state.bullets.push({
    x: p.x + Math.cos(ang) * p.r, y: p.y + Math.sin(ang) * p.r,
    vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
    r: o.r || 5, dmg: (o.dmg || p.dmg) * (crit ? 2 : 1), life: o.life || 0.55, crit,
    pierce: o.pierce || 0, big: !!o.big, color: o.color || null,
  });
}

// ---- Abilities (keys 1/2/3) ----
function useSkill(i) {
  if (!state || !state.running || state.over || paused || invOpen) return;
  const p = state.player;
  if (p.skillCd[i] > 0) return;
  if (i === 1) return; // shield skill temporarily disabled (remove this line to re-enable it)
  const base = Math.atan2(p.aimY, p.aimX);

  if (i === 0) {
    // 1 — Lluvia en abanico: 7 flechas en un arco
    const n = 7, spread = 0.9;
    for (let k = 0; k < n; k++) {
      const a = base + (k - (n - 1) / 2) * (spread / (n - 1));
      spawnArrow(a, { dmg: p.dmg * 0.9, spd: 640, life: 1.1 }); // life 0.55 -> 1.1 = +100% range
    }
    p.skillCd[0] = p.skillMax[0];
    floatText(p.x, p.y - 34, "¡Abanico!", "#ffd84d");
    Sound.shoot();
  } else if (i === 1) {
    // 2 — Escudo de energía: invulnerable un rato
    p.shieldTime = p.shieldDur;
    p.inv = Math.max(p.inv, p.shieldDur);
    p.skillCd[1] = p.skillMax[1];
    floatText(p.x, p.y - 34, "¡Escudo!", "#6ad1ff");
    Sound.levelup();
    for (let k = 0; k < 20; k++) {
      const a = rand(0, Math.PI * 2);
      state.particles.push({ x: p.x + Math.cos(a) * p.r, y: p.y + Math.sin(a) * p.r, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, life: 0.4, r: rand(2, 4), color: "#6ad1ff" });
    }
  } else {
    // 3 — Ultimate: flecha enorme, mucho daño, atraviesa enemigos
    spawnArrow(base, { dmg: p.dmg * 6 + 60, r: 16, spd: 760, pierce: 999, big: true, life: 0.8, color: "#ff7a2a" });
    p.skillCd[2] = p.skillMax[2];
    state.shake = Math.max(state.shake, 12);
    floatText(p.x, p.y - 34, "¡DEVASTACIÓN!", "#ff7a2a");
    Sound.bossdie();
  }
}

function gainXp(amount) {
  const p = state.player;
  p.xp += amount;
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext;
    p.level++;
    p.xpNext = Math.round(p.xpNext * 1.35 + 10);
    // level-up rewards raise BASE stats, then recalc effective stats
    p.base.maxHp += 12;
    p.base.dmg += 2.5;
    p.base.speed += 4;
    recalcStats(p);
    p.hp = p.maxHp; // full heal on level up
    state.shake = Math.max(state.shake, 10);
    Sound.levelup();
    floatText(p.x, p.y - 30, "¡NIVEL " + p.level + "!", "#ffd84d");
    for (let i = 0; i < 24; i++) {
      const a = rand(0, Math.PI * 2), s = rand(60, 260);
      state.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.4, 0.8), r: rand(2, 4), color: "#ffd84d" });
    }
  }
}

function tryDash() {
  if (!state || !state.running) return;
  const p = state.player;
  if (p.dashCd > 0 || p.dashTime > 0) return;
  // dash in movement direction, else toward aim
  let mx = 0, my = 0;
  if (keys["w"] || keys["arrowup"]) my -= 1;
  if (keys["s"] || keys["arrowdown"]) my += 1;
  if (keys["a"] || keys["arrowleft"]) mx -= 1;
  if (keys["d"] || keys["arrowright"]) mx += 1;
  let dx = mx, dy = my;
  const l = Math.hypot(dx, dy);
  if (l < 0.1) { dx = p.aimX; dy = p.aimY; }
  else { dx /= l; dy /= l; }
  p.dashVX = dx; p.dashVY = dy;
  p.dashTime = p.dashDur;
  p.dashCd = p.dashMax;
  p.inv = Math.max(p.inv, p.dashDur + 0.1); // i-frames during dash
  Sound.dash();
  for (let i = 0; i < 12; i++) {
    state.particles.push({ x: p.x, y: p.y, vx: -dx * rand(60, 200) + rand(-40, 40), vy: -dy * rand(60, 200) + rand(-40, 40), life: rand(0.2, 0.4), r: rand(2, 4), color: "#6ad1ff" });
  }
}

function drawPlayer(p) {
  // invuln blink
  if (p.inv > 0 && Math.floor(p.inv * 20) % 2 === 0) ctx.globalAlpha = 0.5;

  const ang = Math.atan2(p.aimY, p.aimX);

  // ground shadow
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(p.x, p.y + p.r * 0.7, p.r * 0.9, p.r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // hooded cloak body with a thick dark outline for contrast
  ctx.save();
  ctx.shadowBlur = 16; ctx.shadowColor = "#ff7a2a";
  ctx.fillStyle = "#2b1a12";
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - p.r);                       // hood top
  ctx.quadraticCurveTo(p.x + p.r, p.y - p.r * 0.3, p.x + p.r * 0.8, p.y + p.r);  // right of cloak
  ctx.lineTo(p.x - p.r * 0.8, p.y + p.r);           // hem
  ctx.quadraticCurveTo(p.x - p.r, p.y - p.r * 0.3, p.x, p.y - p.r);              // left back to hood
  ctx.closePath();
  // dark outline first (thick), then ember rim
  ctx.lineJoin = "round";
  ctx.lineWidth = 5; ctx.strokeStyle = "#000"; ctx.stroke();
  ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = "#ff9d4d"; ctx.stroke();
  ctx.restore();

  // hood opening (dark face with ember eyes)
  ctx.fillStyle = "#140b07";
  ctx.beginPath(); ctx.arc(p.x, p.y - p.r * 0.25, p.r * 0.42, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ffcf80";
  ctx.beginPath(); ctx.arc(p.x - p.r * 0.14, p.y - p.r * 0.28, p.r * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(p.x + p.r * 0.14, p.y - p.r * 0.28, p.r * 0.07, 0, Math.PI * 2); ctx.fill();

  // ---- bow, rotated toward the aim direction ----
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(ang);
  const br = p.r + 10;            // bow radius
  // bow limb (C-shaped arc opening toward the target)
  ctx.strokeStyle = "#8a5a2a"; ctx.lineWidth = 3.5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(2, 0, br, -1.15, 1.15); ctx.stroke();
  // thin highlight on the bow
  ctx.strokeStyle = "#c8894a"; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(2, 0, br, -1.15, 1.15); ctx.stroke();
  // bowstring between the two tips
  const tipX = 2 + Math.cos(1.15) * br, tipY = Math.sin(1.15) * br;
  ctx.strokeStyle = "rgba(240,223,206,0.85)"; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(tipX, -tipY); ctx.lineTo(tipX, tipY); ctx.stroke();
  ctx.restore();

  // energy shield ring while active
  if (p.shieldTime > 0) {
    const t = performance.now() / 160;
    ctx.save();
    ctx.globalAlpha = 0.5 + Math.sin(t) * 0.2;
    ctx.strokeStyle = "#6ad1ff"; ctx.lineWidth = 3;
    ctx.shadowBlur = 18; ctx.shadowColor = "#6ad1ff";
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 12, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = "#6ad1ff";
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 12, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  ctx.globalAlpha = 1;
}

// draw a single arrow pointing along its velocity. scale grows for the ultimate.
function drawArrow(x, y, vx, vy, len, color, scale) {
  const ang = Math.atan2(vy, vx);
  const s = scale || 1;
  const hw = 3.2 * s;   // head half-width
  const fw = 3.5 * s;   // fletching half-width
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.shadowBlur = 8 * s; ctx.shadowColor = s > 1 ? "#ff7a2a" : "#ffb347";
  // shaft
  ctx.strokeStyle = color || "#e7cda0"; ctx.lineWidth = 2.2 * s; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-len, 0); ctx.lineTo(len * 0.6, 0); ctx.stroke();
  // arrowhead
  ctx.fillStyle = "#fff0c2";
  ctx.beginPath();
  ctx.moveTo(len, 0);
  ctx.lineTo(len * 0.5, -hw);
  ctx.lineTo(len * 0.5, hw);
  ctx.closePath(); ctx.fill();
  // fletching (feathers at the tail)
  ctx.fillStyle = "#c0603a";
  ctx.beginPath();
  ctx.moveTo(-len, 0); ctx.lineTo(-len - 4 * s, -fw); ctx.lineTo(-len + 3 * s, 0); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-len, 0); ctx.lineTo(-len - 4 * s, fw); ctx.lineTo(-len + 3 * s, 0); ctx.closePath(); ctx.fill();
  ctx.restore();
}
