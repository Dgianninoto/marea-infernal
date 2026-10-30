"use strict";
// Fourth class: independent summons never affect enemy quotas or boss counts.
var NECRO_MINION_LIFE = 10;
var NECRO_MINION_CAP = 6;
var NECRO_MINION_SPEED = 200;
var NECRO_MINION_ATTACK_CD = 0.9;
var NECRO_HARVEST_RADIUS = 190;
var NECRO_POISON_DURATION = 3;
var NECRO_POISON_INTERVAL = 0.5;
var NECRO_KILLS_PER_SKELETON = 3;
var NECRO_DAMAGE_MULT = 1.20; // class-wide damage bonus, including fully upgraded equipment
var NECRO_MELEE_DAMAGE_MULT = 1.4 * 0.88 * NECRO_DAMAGE_MULT;
var necroSprites = Object.create(null);
for (const name of ["necromancer", "skeleton"]) {
  const image = new Image();
  const sprite = necroSprites[name] = { image, ready: false };
  image.onload = () => { sprite.ready = true; };
  image.src = "assets/necro/" + name + ".svg";
}

function registerNecromancerKill() {
  if (state.weaponId === "necro") state.necroSouls++;
}

function raiseNecromancerSkeletons(angle, skill) {
  const p = state.player;
  state.minions = state.minions.filter(m => m.life > 0);
  const count = Math.min(NECRO_MINION_CAP - state.minions.length, Math.floor(state.necroSouls / NECRO_KILLS_PER_SKELETON));
  if (count <= 0) return 0;
  state.necroSouls -= count * NECRO_KILLS_PER_SKELETON;
  for (let i = 0; i < count; i++) {
    const a = angle + Math.PI + (i - (count - 1) / 2) * 0.8;
    const x = clamp(p.x + Math.cos(a) * 44, WALL + 10, WORLD.w - WALL - 10);
    const y = clamp(p.y + Math.sin(a) * 44, WALL + 10, WORLD.h - WALL - 10);
    state.minions.push({ x, y, r: 10, life: NECRO_MINION_LIFE, attackCd: i * 0.12, swing: 0, skill });
    weaponBurst(x, y, 18, "#9fe6b2", 6);
  }
  return count;
}

function useNecromancerSkill(index, angle) {
  const p = state.player;
  if (index === 0) {
    const arc = axeSweepArc(p.dmg), range = axeSweepRange(p.dmg);
    state.weaponEffects.push({
      kind: "axe-sweep", x: p.x, y: p.y, radius: 0, color: "#9fe6b2",
      duration: AXE_SWEEP_TIME + AXE_SWEEP_FADE, life: AXE_SWEEP_TIME + AXE_SWEEP_FADE,
      sweepTime: AXE_SWEEP_TIME, start: angle - arc / 2, arc, range, prog: 0,
      damage: p.dmg * NECRO_MELEE_DAMAGE_MULT, hit: new Set(), opacity: axeSweepOpacity(),
    });
    Sound.swing();
  } else if (index === 1) {
    if (!raiseNecromancerSkeletons(angle, 1)) return false;
    Sound.levelup();
  } else {
    const radius = NECRO_HARVEST_RADIUS * (1 + p.poder * 0.5);
    const inRange = target => target.hp > 0 && dist2(p.x, p.y, target.x, target.y) <= (radius + target.r) ** 2;
    if (!state.enemies.some(inRange) && !state.bosses.some(inRange)) return false;
    state.weaponEffects.push({
      kind: "poison-nova", x: p.x, y: p.y, radius, angle,
      life: 0.95, duration: 0.95, expandTime: 0.7, hit: new Set(), healed: 0,
      damage: p.dmg * NECRO_DAMAGE_MULT,
    });
    weaponBurst(p.x, p.y, 24, "#a7e86e", 14);
    Sound.bossdie();
  }
}

function updateNecromancerNova(effect, dt) {
  effect.life = Math.max(0, effect.life - dt);
  const progress = clamp((effect.duration - effect.life) / effect.expandTime, 0, 1);
  const radius = effect.radius * progress;
  const previousSkill = dmgSkill;
  dmgSkill = 2;
  try {
    for (const target of state.enemies.concat(state.bosses)) {
      if (target.hp <= 0 || effect.hit.has(target)) continue;
      if (dist2(effect.x, effect.y, target.x, target.y) > (radius + target.r) ** 2) continue;
      effect.hit.add(target);
      // Preserve total damage: 2x on contact plus 3.5x over six poison ticks.
      const tickDamage = effect.damage * 3.5 / (NECRO_POISON_DURATION / NECRO_POISON_INTERVAL);
      const old = target.necroPoison;
      target.necroPoison = {
        life: NECRO_POISON_DURATION, elapsed: old ? old.elapsed : 0,
        damage: Math.max(tickDamage, old ? old.damage : 0),
      };
      if (target.type === "boss") damageWeaponBoss(target, effect.damage * 2);
      else damageWeaponEnemy(target, effect.damage * 2);
      const p = state.player;
      const heal = Math.max(0, Math.min(p.maxHp - p.hp, p.maxHp * 0.02, p.maxHp * 0.12 - effect.healed));
      p.hp += heal; effect.healed += heal;
      if (heal > 0) floatText(p.x, p.y - 35, "+" + Math.round(heal) + " vida", "#b5f4c5");
    }
    raiseNecromancerSkeletons(effect.angle, 2);
  } finally { dmgSkill = previousSkill; }
}

function updateNecromancerPoison(dt) {
  const previousSkill = dmgSkill, killsBefore = state.kills;
  dmgSkill = 2;
  try {
    for (const target of state.enemies.concat(state.bosses)) {
      const poison = target.necroPoison;
      if (!poison || target.hp <= 0) continue;
      const elapsed = Math.min(dt, poison.life);
      poison.life = Math.max(0, poison.life - elapsed);
      poison.elapsed += elapsed;
      while (poison.elapsed + 1e-9 >= NECRO_POISON_INTERVAL && target.hp > 0) {
        poison.elapsed -= NECRO_POISON_INTERVAL;
        if (target.type === "boss") damageWeaponBoss(target, poison.damage);
        else damageWeaponEnemy(target, poison.damage);
      }
      if (poison.life <= 1e-9 || target.hp <= 0) delete target.necroPoison;
    }
    if (state.kills > killsBefore) raiseNecromancerSkeletons(Math.atan2(state.player.aimY, state.player.aimX), 2);
  } finally { dmgSkill = previousSkill; }
}

function drawNecromancerNova(effect) {
  const elapsed = effect.duration - effect.life;
  const progress = clamp(elapsed / effect.expandTime, 0, 1);
  const radius = effect.radius * progress;
  const fade = Math.min(1, effect.life / 0.25);
  ctx.save();
  ctx.translate(effect.x, effect.y);
  ctx.globalAlpha = fade * 0.10;
  ctx.fillStyle = "#87c94f";
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.shadowColor = "#93dc57"; ctx.shadowBlur = 12;
  // Curved, branching filaments: deterministic bends avoid electric flickering.
  for (let i = 0; i < 18; i++) {
    const angle = i * Math.PI * 2 / 18;
    const bend = Math.sin(i * 2.3) * 0.23;
    const points = [];
    for (let j = 0; j <= 5; j++) {
      const f = j / 5;
      const a = angle + Math.sin(f * 4 + i) * bend * f;
      points.push({ x: Math.cos(a) * radius * f, y: Math.sin(a) * radius * f });
    }
    ctx.globalAlpha = fade * 0.62;
    ctx.strokeStyle = "#7dcc4c"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 0);
    for (let j = 1; j < points.length; j++) {
      const before = points[j - 1], p = points[j];
      ctx.quadraticCurveTo(before.x, before.y, (before.x + p.x) / 2, (before.y + p.y) / 2);
    }
    ctx.lineTo(points[5].x, points[5].y); ctx.stroke();
    ctx.globalAlpha = fade * 0.85;
    ctx.strokeStyle = "#d0f2a0"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(points[2].x, points[2].y);
    const a = angle + (i % 2 ? 0.3 : -0.3);
    ctx.quadraticCurveTo(points[3].x, points[3].y, Math.cos(a) * radius * 0.88, Math.sin(a) * radius * 0.88);
    ctx.stroke();
    ctx.fillStyle = "#c4ef8c";
    ctx.beginPath(); ctx.arc(points[5].x, points[5].y, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function updateNecromancer(dt) {
  if (state.weaponId !== "necro") return;
  const p = state.player;
  state.minions = state.minions.filter(m => m.life > 0);
  updateNecromancerPoison(dt);
  const targets = state.enemies.concat(state.bosses);
  for (let i = 0; i < state.minions.length; i++) {
    const m = state.minions[i];
    m.life -= dt;
    if (m.life <= 0) continue;
    m.attackCd -= dt;
    m.swing = Math.max(0, m.swing - dt);
    let target = null, best = 900 * 900;
    if (state.phase !== "intermission") {
      for (const enemy of targets) {
        if (enemy.hp <= 0) continue;
        const d = dist2(m.x, m.y, enemy.x, enemy.y);
        if (d < best) { best = d; target = enemy; }
      }
    }
    const a = i * Math.PI * 2 / Math.max(1, state.minions.length);
    const tx = target ? target.x : p.x + Math.cos(a) * 65;
    const ty = target ? target.y : p.y + Math.sin(a) * 65;
    const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy);
    const reach = target ? target.r + m.r + 6 : 8;
    if (d > reach) {
      const move = Math.min(d - reach, NECRO_MINION_SPEED * dt);
      m.x += dx / d * move; m.y += dy / d * move;
    } else if (target && m.attackCd <= 0) {
      const prev = dmgSkill;
      dmgSkill = m.skill == null ? 1 : m.skill;
      try {
        const damage = p.dmg * 0.65 * (1 + p.poder) * NECRO_DAMAGE_MULT;
        if (target.type === "boss") damageWeaponBoss(target, damage);
        else damageWeaponEnemy(target, damage);
      } finally { dmgSkill = prev; }
      m.attackCd = NECRO_MINION_ATTACK_CD;
      m.swing = 0.18;
    }
    // Spectral summons pass through scenery, but stay inside arena walls.
    m.x = clamp(m.x, WALL + m.r, WORLD.w - WALL - m.r);
    m.y = clamp(m.y, WALL + m.r, WORLD.h - WALL - m.r);
  }
  state.minions = state.minions.filter(m => m.life > 0);
}

function drawNecromancer() {
  if (state.weaponId !== "necro") return;
  for (const effect of state.weaponEffects) {
    if (effect.kind === "poison-nova") drawNecromancerNova(effect);
  }
  for (const target of state.enemies.concat(state.bosses)) {
    if (!target.necroPoison || target.hp <= 0) continue;
    ctx.save();
    ctx.strokeStyle = "rgba(166,230,95,0.75)"; ctx.lineWidth = 2;
    ctx.shadowColor = "#8ad84f"; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(target.x, target.y, target.r + 4, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  for (const m of state.minions) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, m.life / 0.8);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(m.x, m.y + 8, 10, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = "#9fe6b2"; ctx.shadowBlur = m.swing > 0 ? 18 : 5;
    const bob = Math.sin(performance.now() / 160 + m.x * 0.02) * 2;
    if (necroSprites.skeleton.ready) ctx.drawImage(necroSprites.skeleton.image, m.x - 15, m.y - 18 + bob, 30, 30);
    else { ctx.fillStyle = "#dce8c5"; ctx.beginPath(); ctx.arc(m.x, m.y - 3, 7.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
}

function drawBodyNecromancer() {
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(0, 15, 17, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.shadowColor = "#9fe6b2"; ctx.shadowBlur = 8;
  if (necroSprites.necromancer.ready) ctx.drawImage(necroSprites.necromancer.image, -26, -27, 52, 52);
  else { ctx.fillStyle = "#537663"; ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

function drawNecromancerWeapon() {
  ctx.strokeStyle = "#292d30"; ctx.lineWidth = 6; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(2, 14); ctx.lineTo(26, -15); ctx.stroke();
  ctx.strokeStyle = "#a5b7a0"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(2, 14); ctx.lineTo(26, -15); ctx.stroke();
  ctx.fillStyle = "#d3e5c6"; ctx.strokeStyle = "#26362f"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(22, -17); ctx.quadraticCurveTo(43, -19, 42, 7);
  ctx.quadraticCurveTo(34, -7, 22, -10); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#98edb0"; ctx.shadowColor = "#9fe6b2"; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.arc(25, -13, 3, 0, Math.PI * 2); ctx.fill();
}
