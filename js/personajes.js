"use strict";
/*
 * Marea Infernal - personajes.js (jugador / personaje)
 * Estado y acciones del heroe: apuntado y proyectiles (spawnArrow),
 * habilidades (useSkill), progresion / subida de nivel (gainXp), esquive/dash
 * (tryDash) y su render (drawPlayer, drawArrow).
 * Depende de simbolos globales definidos en mecanica.js (var/function).
 */

// ---------------------------------------------------------------- Combat / loot
// Spawn a projectile heading at angle `ang`.
// opts: {dmg, r, spd, pierce, big, color, kind, splashRadius, splashDamage}
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
    kind: o.kind || "arrow", splashRadius: o.splashRadius || 0, splashDamage: o.splashDamage || 0,
  });
}

function weaponBurst(x, y, radius, color, count) {
  const particles = count || 24;
  for (let i = 0; i < particles; i++) {
    const a = rand(0, Math.PI * 2), speed = rand(70, 260);
    state.particles.push({
      x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      life: rand(0.25, 0.65), r: rand(2, 5), color,
    });
  }
  state.shake = Math.max(state.shake, Math.min(14, radius / 14));
}

function showWeaponArea(x, y, radius, color, duration, kind, angle, range, halfAngle) {
  state.weaponEffects.push({
    kind, x, y, radius, color,
    duration, life: duration,
    angle, range, halfAngle,
  });
}

function castArcaneMeteor() {
  const p = state.player;
  const distance = 320;
  state.weaponEffects.push({
    kind: "meteor",
    x: p.x + p.aimX * distance,
    y: p.y + p.aimY * distance,
    radius: 145,
    color: "#bd8cff",
    phase: "falling",
    fallDuration: 0.85,
    life: 0.85,
    impactDuration: 0.55,
    impactLife: 0,
    damage: p.dmg * 6 + 35,
  });
  floatText(p.x, p.y - 34, "¡METEORITO!", "#d7a5ff");
  Sound.bossdie();
}

function updateWeaponEffects(dt) {
  for (const effect of state.weaponEffects) {
    if (effect.kind !== "meteor") {
      effect.life = Math.max(0, effect.life - dt);
      continue;
    }
    if (effect.phase === "falling") {
      effect.life = Math.max(0, effect.life - dt);
      if (effect.life === 0) {
        effect.phase = "impact";
        effect.impactLife = effect.impactDuration;
        effect.life = effect.impactDuration;
        damageWeaponArea(effect.x, effect.y, effect.radius, effect.damage);
        weaponBurst(effect.x, effect.y, effect.radius, "#bd8cff", 42);
        floatText(effect.x, effect.y - 45, "¡IMPACTO!", "#d7a5ff");
        Sound.bossdie();
      }
    } else {
      effect.impactLife = Math.max(0, effect.impactLife - dt);
      effect.life = effect.impactLife;
    }
  }
  state.weaponEffects = state.weaponEffects.filter(effect => effect.life > 0);
}

function drawWeaponEffects() {
  for (const effect of state.weaponEffects) {
    if (effect.kind === "meteor") {
      if (effect.phase === "falling") {
        const progress = clamp(1 - effect.life / effect.fallDuration, 0, 1);
        const pulse = 0.5 + Math.sin(performance.now() / 70) * 0.12;
        ctx.save();
        ctx.globalAlpha = 0.24 + progress * 0.2;
        ctx.fillStyle = effect.color;
        ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.65 + pulse * 0.25;
        ctx.strokeStyle = "#f0c7ff"; ctx.lineWidth = 4;
        ctx.setLineDash([12, 8]);
        ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);

        const height = (1 - progress) * 300;
        ctx.translate(effect.x, effect.y - height);
        ctx.rotate(performance.now() / 180);
        ctx.shadowBlur = 30; ctx.shadowColor = "#bd8cff";
        ctx.fillStyle = "#7d43b5";
        ctx.beginPath();
        ctx.moveTo(0, -25); ctx.lineTo(20, -12); ctx.lineTo(18, 12);
        ctx.lineTo(2, 24); ctx.lineTo(-19, 13); ctx.lineTo(-22, -8);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#f4d4ff";
        ctx.beginPath(); ctx.arc(-5, -5, 6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else {
        const progress = clamp(effect.impactLife / effect.impactDuration, 0, 1);
        ctx.save();
        ctx.globalAlpha = progress * 0.55;
        ctx.fillStyle = "#d7a5ff";
        ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = progress;
        ctx.strokeStyle = "#f4d4ff"; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius * (1.15 - progress * 0.15), 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      continue;
    }

    const alpha = clamp(effect.life / effect.duration, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (effect.kind === "axe-cone") {
      const start = effect.angle - effect.halfAngle;
      const end = effect.angle + effect.halfAngle;
      ctx.fillStyle = effect.color;
      ctx.globalAlpha = alpha * 0.28;
      ctx.beginPath();
      ctx.moveTo(effect.x, effect.y);
      ctx.arc(effect.x, effect.y, effect.range, start, end);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "#ffd0bd"; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(effect.x, effect.y);
      ctx.lineTo(effect.x + Math.cos(start) * effect.range, effect.y + Math.sin(start) * effect.range);
      ctx.arc(effect.x, effect.y, effect.range, start, end);
      ctx.lineTo(effect.x, effect.y);
      ctx.stroke();
    } else {
      ctx.fillStyle = effect.color;
      ctx.globalAlpha = alpha * 0.22;
      ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "#ffd0bd"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
}

function damageWeaponEnemy(enemy, damage) {
  if (!enemy || enemy.hp <= 0) return;
  const critical = Math.random() < state.player.crit;
  const dealt = damage * (critical ? 2 : 1);
  enemy.hp -= dealt;
  enemy.flash = 0.08;
  floatText(enemy.x, enemy.y - enemy.r - 4, "-" + Math.round(dealt) + (critical ? "!" : ""), critical ? "#ff9d2e" : "#ffe08a");
  if (enemy.type === "goblin" && typeof onGoblinHit === "function") onGoblinHit(enemy);
  if (enemy.hp <= 0) killEnemy(enemy);
}

function damageWeaponBoss(boss, damage) {
  if (!boss || boss.hp <= 0) return;
  const critical = Math.random() < state.player.crit;
  const dealt = damage * (critical ? 2 : 1);
  boss.hp -= dealt;
  boss.flash = 0.08;
  floatText(boss.x, boss.y - boss.r - 4, "-" + Math.round(dealt) + (critical ? "!" : ""), critical ? "#ff9d2e" : "#ffe08a");
  if (boss.hp <= 0) killBoss(boss);
}

function damageWeaponArea(x, y, radius, damage, excludedTarget) {
  for (const enemy of state.enemies) {
    if (enemy !== excludedTarget && enemy.hp > 0 &&
        dist2(x, y, enemy.x, enemy.y) <= (radius + enemy.r) ** 2) {
      damageWeaponEnemy(enemy, damage);
    }
  }
  const boss = state.boss;
  if (boss && boss !== excludedTarget && boss.hp > 0 &&
      dist2(x, y, boss.x, boss.y) <= (radius + boss.r) ** 2) {
    damageWeaponBoss(boss, damage);
  }
}

function damageWeaponCone(angle, range, halfAngle, damage) {
  const fx = Math.cos(angle), fy = Math.sin(angle);
  const tangent = Math.tan(halfAngle);
  const hits = target => {
    const dx = target.x - state.player.x, dy = target.y - state.player.y;
    const forward = dx * fx + dy * fy;
    const side = Math.abs(dx * fy - dy * fx);
    return forward >= -target.r && forward <= range + target.r &&
      side <= Math.max(0, forward) * tangent + target.r;
  };
  for (const enemy of state.enemies) if (enemy.hp > 0 && hits(enemy)) damageWeaponEnemy(enemy, damage);
  if (state.boss && state.boss.hp > 0 && hits(state.boss)) damageWeaponBoss(state.boss, damage);
}

// Automatic weapon kit: basic, intermediate and ultimate attacks share cooldown UI.
function useSkill(i) {
  if (!state || !state.running || state.over || paused || invOpen) return;
  const p = state.player;
  if (p.skillCd[i] > 0) return;
  const base = Math.atan2(p.aimY, p.aimX);
  const weaponId = state.weaponId;

  if (weaponId === "bow") {
    if (i === 0) {
      spawnArrow(base, { dmg: p.dmg * 1.1, spd: 700, life: 0.8, color: "#ffd84d" });
      Sound.shoot();
    } else if (i === 1) {
      const count = 7, spread = 0.9;
      for (let k = 0; k < count; k++) {
        const angle = base + (k - (count - 1) / 2) * (spread / (count - 1));
        spawnArrow(angle, { dmg: p.dmg * 0.75, spd: 640, life: 1.1, color: "#ffd84d" });
      }
      floatText(p.x, p.y - 34, "¡Abanico!", "#ffd84d");
      Sound.shoot();
    } else {
      spawnArrow(base, { dmg: p.dmg * 6 + 60, r: 16, spd: 760, pierce: 999, big: true, life: 0.8, color: "#ff7a2a" });
      state.shake = Math.max(state.shake, 12);
      floatText(p.x, p.y - 34, "¡DEVASTACIÓN!", "#ff7a2a");
      Sound.bossdie();
    }
  } else if (weaponId === "staff") {
    if (i === 0) {
      spawnArrow(base, { dmg: p.dmg, r: 9, spd: 430, life: 1.25, color: "#bd8cff", kind: "orb" });
      Sound.shoot();
    } else if (i === 1) {
      const count = 5, spread = 0.62;
      for (let k = 0; k < count; k++) {
        const angle = base + (k - (count - 1) / 2) * (spread / (count - 1));
        spawnArrow(angle, {
          dmg: p.dmg * 0.75, r: 9, spd: 390, life: 1.35,
          color: "#d7a5ff", kind: "orb", splashRadius: 46, splashDamage: p.dmg * 0.35,
        });
      }
      floatText(p.x, p.y - 34, "¡Salva arcana!", "#d7a5ff");
      Sound.levelup();
    } else {
      castArcaneMeteor();
    }
  } else {
    if (i === 0) {
      const range = 112, halfAngle = 0.58;
      damageWeaponCone(base, range, halfAngle, p.dmg * 1.4);
      showWeaponArea(p.x, p.y, 0, "#ff7659", 0.42, "axe-cone", base, range, halfAngle);
      weaponBurst(p.x + p.aimX * 65, p.y + p.aimY * 65, 50, "#ff7659", 12);
      Sound.hit();
    } else if (i === 1) {
      const radius = 132;
      damageWeaponArea(p.x, p.y, radius, p.dmg * 1.5);
      showWeaponArea(p.x, p.y, radius, "#ff7659", 0.52, "axe-ring");
      weaponBurst(p.x, p.y, radius, "#ff7659", 32);
      floatText(p.x, p.y - 38, "¡Giro amplio!", "#ff9d4d");
      Sound.boss();
    } else {
      const radius = 195;
      damageWeaponArea(p.x, p.y, radius, p.dmg * 7 + 45);
      showWeaponArea(p.x, p.y, radius, "#ff3a1a", 0.68, "axe-ring");
      weaponBurst(p.x, p.y, radius, "#ff3a1a", 48);
      floatText(p.x, p.y - 44, "¡GOLPE SÍSMICO!", "#ff7659");
      Sound.bossdie();
    }
  }
  p.skillCd[i] = weaponSkillCooldown(p, i);
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

  // Draw the selected weapon facing the aim direction.
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(ang);
  if (state.weaponId === "bow") {
    const br = p.r + 10;
    ctx.strokeStyle = "#8a5a2a"; ctx.lineWidth = 3.5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(2, 0, br, -1.15, 1.15); ctx.stroke();
    ctx.strokeStyle = "#c8894a"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(2, 0, br, -1.15, 1.15); ctx.stroke();
    const tipX = 2 + Math.cos(1.15) * br, tipY = Math.sin(1.15) * br;
    ctx.strokeStyle = "rgba(240,223,206,0.85)"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(tipX, -tipY); ctx.lineTo(tipX, tipY); ctx.stroke();
  } else if (state.weaponId === "staff") {
    ctx.strokeStyle = "#7f542d"; ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(3, 8); ctx.lineTo(24, -8); ctx.stroke();
    ctx.strokeStyle = "#d7a5ff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(7, 5); ctx.lineTo(24, -8); ctx.stroke();
    ctx.shadowBlur = 12; ctx.shadowColor = "#bd8cff"; ctx.fillStyle = "#bd8cff";
    ctx.beginPath(); ctx.arc(26, -10, 5, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.strokeStyle = "#8a5a2a"; ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(25, 0); ctx.stroke();
    ctx.fillStyle = "#b9c0c8"; ctx.strokeStyle = "#69737d"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(17, -3); ctx.lineTo(24, -13); ctx.lineTo(33, -11);
    ctx.lineTo(28, 0); ctx.lineTo(33, 11); ctx.lineTo(24, 13); ctx.lineTo(17, 3);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();

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
