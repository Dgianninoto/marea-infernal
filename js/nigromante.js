"use strict";
// Fourth class: independent summons never affect enemy quotas or boss counts.
var NECRO_MINION_LIFE = 10;
var NECRO_HUESTE_HP_RATIO = 0.30;   // <<< BALANCE: vida de cada esqueleto de Hueste = 30 % de la vida maxima del personaje
// Los esqueletos nacidos de una baja por veneno heredan la vida maxima del bicho que murio y desencadeno su aparicion.
var NECRO_MINION_INVULN = 0.5;      // s de invulnerabilidad de un esqueleto tras recibir un golpe
var NECRO_MINION_CAP_MIN = 1;   // minimo de esqueletos aunque el equipo no aporte Mando; el maximo real lo da la stat Mando
var NECRO_MINION_SPEED = 200;
var NECRO_MINION_RANGE = 240;          // <<< BALANCE: alcance (px) desde el que disparan los esqueletos arqueros
var NECRO_MINION_HOLD = 170;           // <<< BALANCE: los esqueletos arqueros dejan de avanzar al llegar a esta distancia (px) de su blanco
var NECRO_MINION_BULLET_SPEED = 700;   // como la flecha basica del Arquero
var NECRO_MINION_GAP = 4;              // separacion minima extra (px) entre esqueletos
var NECRO_TARGET_SEARCH = 900;         // radio (px) en el que buscan blanco
var NECRO_MINION_DAMAGE_RATIO = 0.30;   // <<< BALANCE: daño de cada golpe de esqueleto = 30 % del daño del Nigromante
// <<< BALANCE: cadencia de ataque (s entre golpes) de los esqueletos segun la rareza del arma: Comun, Magico, Raro, Legendario, Unico
var NECRO_MINION_ATTACK_CD_BY_RARITY = [1, 0.8, 0.6, 0.4, 0.2];
// Siega espectral: arco fijo (ya no depende del Daño). Empieza a NECRO_SWEEP_INNER px del personaje y mide NECRO_SWEEP_LENGTH px de largo.
var NECRO_SWEEP_ARC = 70 * Math.PI / 180;  // <<< BALANCE: apertura del barrido (rad)
var NECRO_SWEEP_INNER = 120;               // <<< BALANCE: distancia (px) a la que empieza el arco
var NECRO_SWEEP_TIME = 0.15;               // <<< BALANCE: s que tarda el barrido en recorrer su arco (el del Barbaro tarda AXE_SWEEP_TIME = 0.22)
var NECRO_SWEEP_LENGTH = 55;               // <<< BALANCE: largo (px) del arco; llega hasta INNER + LENGTH = 175 px
// Aura pestilente: pasiva y permanente alrededor del Nigromante. Cada enemigo dentro acumula cargas de veneno.
var NECRO_AURA_RADIUS = 240;               // radio (px)
var NECRO_POISON_INTERVAL = 1;             // s entre ticks de veneno (y entre cargas)
var NECRO_POISON_RATIO = 0.30;             // fraccion del daño del arma por carga y por tick (30 %, 60 %, 90 %...)
var NECRO_POISON_MAX_STACKS = Infinity;    // <<< BALANCE: tope de cargas (Infinity = sin limite)
var NECRO_SKELETON_R = 12;              // radio del esqueleto normal (nacido de bajas): 20 % mas grande que los 10 px originales
var NECRO_ARCHER_R = 10;               // radio del esqueleto arquero (Hueste)
var NECRO_KILLS_PER_SKELETON = 3;   // contador oculto: la baja que completa 3 bajas levanta un esqueleto con la vida maxima de ese bicho
var NECRO_HUESTE_COUNT = 3;         // <<< BALANCE: esqueletos que invoca cada lanzamiento de Hueste (no depende de las bajas)
var NECRO_POISON_DOT_R = 4;                       // radio (px) de cada bolita de veneno
var NECRO_POISON_DOT_STEP = 30 * Math.PI / 180;   // separacion angular entre bolitas de veneno
var NECRO_MELEE_DAMAGE_MULT = 1.4 * 0.88;
var necroSprites = Object.create(null);
// "skeleton-archer": esqueleto arquero con yelmo, hombreras y arco, solo para los esqueletos invocados con Hueste espectral.
for (const name of ["necromancer", "skeleton", "skeleton-archer"]) {
  const image = new Image();
  const sprite = necroSprites[name] = { image, ready: false };
  image.onload = () => { sprite.ready = true; };
  image.src = "assets/necro/" + name + ".svg";
}

// Maximo de esqueletos simultaneos = stat Mando (base 10, +2 por punto gastado en la pieza de arma).
function necroMinionCap() {
  return Math.max(NECRO_MINION_CAP_MIN, Math.floor(state.player.mando || 0));
}

// Tiempo entre ataques de los esqueletos: depende de la rareza de la pieza de arma equipada.
function necroMinionAttackCd() {
  const weapon = state.player.equipped && state.player.equipped.arma;
  const level = weapon ? clamp(weapon.level | 0, 0, NECRO_MINION_ATTACK_CD_BY_RARITY.length - 1) : 0;
  return NECRO_MINION_ATTACK_CD_BY_RARITY[level];
}

// Cada baja suma al contador oculto; la que lo completa (cada 3) levanta un esqueleto con la vida maxima del bicho muerto.
// Si ya hay tantos esqueletos como el Mando, el contador se reinicia igualmente y no nace ninguno.
function registerNecromancerKill(target) {
  if (state.weaponId !== "necro") return;
  state.necroSouls++;
  if (state.necroSouls < NECRO_KILLS_PER_SKELETON) return;
  state.necroSouls = 0;
  const p = state.player;
  // el esqueleto nace donde murio el bicho que completo la cuenta
  raiseNecromancerSkeletons(Math.atan2(p.aimY, p.aimX), 2, (target && (target.maxHp || target.hp)) || 1, 1, target);
}

function raiseNecromancerSkeletons(angle, skill, hp, wanted, origin) {
  const p = state.player;
  state.minions = state.minions.filter(m => m.life > 0);
  const count = Math.min(necroMinionCap() - state.minions.length, wanted);
  if (count <= 0) return 0;
  const spacing = Math.min(0.8, Math.PI * 2 / count);   // con muchos esqueletos se reparten en circulo en vez de solaparse
  for (let i = 0; i < count; i++) {
    const a = angle + Math.PI + (i - (count - 1) / 2) * spacing;
    const r = skill === 1 ? NECRO_ARCHER_R : NECRO_SKELETON_R;
    // con origen (baja) nace exactamente alli; sin origen (Hueste) se reparte alrededor del personaje
    const x = clamp(origin ? origin.x : p.x + Math.cos(a) * 44, WALL + r, WORLD.w - WALL - r);
    const y = clamp(origin ? origin.y : p.y + Math.sin(a) * 44, WALL + r, WORLD.h - WALL - r);
    const maxHp = Math.max(1, hp || 1);
    state.minions.push({ x, y, r, life: NECRO_MINION_LIFE, attackCd: i * 0.12, swing: 0, skill, archer: skill === 1, hp: maxHp, maxHp, inv: 0 });   // archer: esqueleto arquero de Hueste (dispara); el resto pelea cuerpo a cuerpo
    weaponBurst(x, y, 18, "#9fe6b2", 6);
  }
  return count;
}

function useNecromancerSkill(index, angle) {
  const p = state.player;
  if (index === 0) {
    const arc = NECRO_SWEEP_ARC, inner = NECRO_SWEEP_INNER, range = NECRO_SWEEP_INNER + NECRO_SWEEP_LENGTH;
    state.weaponEffects.push({
      kind: "axe-sweep", x: p.x, y: p.y, radius: 0, color: "#9fe6b2",
      duration: NECRO_SWEEP_TIME + AXE_SWEEP_FADE, life: NECRO_SWEEP_TIME + AXE_SWEEP_FADE,
      sweepTime: NECRO_SWEEP_TIME, start: angle - arc / 2, arc, range, inner, prog: 0, edgeColor: "#d0f2a0",
      damage: p.dmg * NECRO_MELEE_DAMAGE_MULT, hit: new Set(), opacity: axeSweepOpacity(),
    });
    Sound.scythe();
  } else if (index === 1) {
    if (!raiseNecromancerSkeletons(angle, 1, p.maxHp * NECRO_HUESTE_HP_RATIO, NECRO_HUESTE_COUNT)) return false;
    Sound.levelup();
  } else {
    return false; // Aura pestilente: pasiva, se procesa en updateNecromancerPoison
  }
}

function necroAuraRadius() {
  return NECRO_AURA_RADIUS;
}

// Aura: al entrar un enemigo recibe 1 carga. Cada NECRO_POISON_INTERVAL s sufre (cargas x 30 % del daño del arma) y,
// si sigue dentro del aura, gana otra carga; si salio, pierde una. Sin cargas el veneno desaparece.
function updateNecromancerPoison(dt) {
  const p = state.player, radius = necroAuraRadius();
  const weaponDmg = p.dmg;
  const previousSkill = dmgSkill;
  dmgSkill = 2;
  try {
    for (const target of state.enemies.concat(state.bosses)) {
      if (target.hp <= 0) { delete target.necroPoison; continue; }
      const inside = dist2(p.x, p.y, target.x, target.y) <= (radius + target.r) ** 2;
      let poison = target.necroPoison;
      if (!poison) {
        if (!inside) continue;
        poison = target.necroPoison = { stacks: 1, timer: 0 };
      }
      poison.timer += dt;
      while (poison.timer + 1e-9 >= NECRO_POISON_INTERVAL && target.hp > 0) {
        poison.timer -= NECRO_POISON_INTERVAL;
        const damage = weaponDmg * NECRO_POISON_RATIO * poison.stacks;
        if (target.type === "boss") damageWeaponBoss(target, damage);
        else damageWeaponEnemy(target, damage);
        if (target.hp <= 0) break;            // lo mato el veneno: la baja ya se registro en killEnemy / killBoss
        poison.stacks = Math.min(NECRO_POISON_MAX_STACKS, poison.stacks + (inside ? 1 : -1));
        if (poison.stacks <= 0) { delete target.necroPoison; break; }
      }
    }
  } finally { dmgSkill = previousSkill; }
}

function drawNecromancerAura() {
  const p = state.player, r = necroAuraRadius(), t = performance.now() / 1000;
  ctx.save();
  ctx.translate(p.x, p.y);
  const grad = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
  grad.addColorStop(0, "rgba(135,201,79,0.015)");
  grad.addColorStop(1, "rgba(135,201,79,0.085)");   // mas transparente que antes (0.03 -> 0.16)
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(196,239,140,0.55)";
  for (let i = 0; i < 12; i++) {                      // motas de veneno que giran lentamente dentro del aura
    const a = i * Math.PI * 2 / 12 + t * 0.35 * (i % 2 ? 1 : -1);
    const rr = r * (0.35 + 0.6 * ((i * 0.37 + t * 0.12) % 1));
    ctx.beginPath(); ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function hurtNecromancerMinion(m, amount) {
  m.hp -= amount;
  m.inv = NECRO_MINION_INVULN;
  floatText(m.x, m.y - 22, "-" + Math.round(amount), "#9fe6b2");
  if (m.hp <= 0) { m.life = 0; weaponBurst(m.x, m.y, 14, "#9fe6b2", 6); }
}

// Los esqueletos reciben daño de los enemigos: contacto, proyectiles, zonas de area y rayos.
function updateNecromancerMinionDamage(dt) {
  const targets = state.enemies.concat(state.bosses);
  for (const m of state.minions) {
    m.inv = Math.max(0, (m.inv || 0) - dt);
    if (m.life <= 0 || m.inv > 0) continue;
    for (const t of targets) {
      if (t.hp <= 0 || t.type === "goblin" || t.tpArrive > 0 || !(t.dmg > 0)) continue;
      if (dist2(m.x, m.y, t.x, t.y) < (m.r + t.r) ** 2) { hurtNecromancerMinion(m, t.dmg); break; }
    }
    if (m.inv > 0) continue;
    for (const bb of state.bossBullets) {
      if (bb.life > 0 && dist2(m.x, m.y, bb.x, bb.y) < (m.r + bb.r) ** 2) { bb.life = 0; hurtNecromancerMinion(m, bb.dmg); break; }
    }
    if (m.inv > 0) continue;
    for (const z of state.aoes) {
      if (z.warn > 0 || !(z.active > 0)) continue;
      z.minionHit = z.minionHit || new Set();
      if (z.minionHit.has(m) || dist2(m.x, m.y, z.x, z.y) >= (z.r + m.r) ** 2) continue;
      z.minionHit.add(m); hurtNecromancerMinion(m, z.dmg); break;
    }
    if (m.inv > 0) continue;
    for (const z of state.beams) {
      if (z.warn > 0 || !(z.active > 0)) continue;
      z.minionHit = z.minionHit || new Set();
      const ex = z.x + Math.cos(z.ang) * z.len, ey = z.y + Math.sin(z.ang) * z.len;
      if (z.minionHit.has(m) || distSeg2(m.x, m.y, z.x, z.y, ex, ey) >= (z.w / 2 + m.r) ** 2) continue;
      z.minionHit.add(m); hurtNecromancerMinion(m, z.dmg); break;
    }
  }
}

// Blanco: el enemigo mas cercano que ningun otro esqueleto tenga ya fijado; si todos estan ocupados, el menos ocupado
// (a igualdad, el mas cercano). Cada esqueleto conserva su blanco hasta que muere o se aleja demasiado.
function pickNecromancerMinionTarget(m, targets) {
  if (state.phase === "intermission") return m.target = null;
  const limit = NECRO_TARGET_SEARCH * NECRO_TARGET_SEARCH;
  const current = m.target;
  if (current && current.hp > 0 && dist2(m.x, m.y, current.x, current.y) <= limit * 1.5) return current;
  const claims = new Map();
  for (const o of state.minions) {
    if (o !== m && o.life > 0 && o.target && o.target.hp > 0) claims.set(o.target, (claims.get(o.target) || 0) + 1);
  }
  let best = null, bestClaims = Infinity, bestD = Infinity;
  for (const e of targets) {
    if (e.hp <= 0) continue;
    const d = dist2(m.x, m.y, e.x, e.y);
    if (d > limit) continue;
    const c = claims.get(e) || 0;
    if (c < bestClaims || (c === bestClaims && d < bestD)) { best = e; bestClaims = c; bestD = d; }
  }
  return m.target = best;
}

// Disparo del esqueleto: proyectil como la flecha basica del Arquero (misma velocidad), con el daño del esqueleto.
function shootNecromancerMinion(m, target) {
  const p = state.player;
  const ang = Math.atan2(target.y - m.y, target.x - m.x);
  const critMult = critMultiplier(p.crit);
  state.bullets.push({
    x: m.x + Math.cos(ang) * m.r, y: m.y + Math.sin(ang) * m.r,
    vx: Math.cos(ang) * NECRO_MINION_BULLET_SPEED, vy: Math.sin(ang) * NECRO_MINION_BULLET_SPEED,
    r: 5, dmg: p.dmg * NECRO_MINION_DAMAGE_RATIO * critMult, life: (NECRO_MINION_RANGE + 40) / NECRO_MINION_BULLET_SPEED,
    crit: critMult > 1, critMult, pierce: 0, big: false, color: "#d3e5c6",
    kind: "arrow", splashRadius: 0, splashDamage: 0, homing: 0, target: null, bleed: 0, attackId: 0,
    skill: m.skill == null ? 1 : m.skill,   // ataque que lo invoco (para el resumen de daño)
  });
}

// Colision entre esqueletos: se empujan mutuamente para no apilarse.
function separateNecromancerMinions() {
  const list = state.minions;
  for (let iter = 0; iter < 2; iter++) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.life <= 0 || b.life <= 0) continue;
        let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        const min = a.r + b.r + NECRO_MINION_GAP;
        if (d >= min) continue;
        if (d < 0.001) { const t = Math.random() * Math.PI * 2; dx = Math.cos(t); dy = Math.sin(t); d = 1; }
        const push = (min - d) / 2 / d;
        a.x -= dx * push; a.y -= dy * push;
        b.x += dx * push; b.y += dy * push;
      }
    }
  }
  for (const m of list) {
    m.x = clamp(m.x, WALL + m.r, WORLD.w - WALL - m.r);
    m.y = clamp(m.y, WALL + m.r, WORLD.h - WALL - m.r);
  }
}

// Colision enemigo-esqueleto: se empujan (el enemigo cede mas) pero queda un solape minimo para que el contacto siga haciendo daño.
function collideEnemiesWithMinions() {
  if (!state.minions.length) return;
  for (const e of state.enemies) {
    if (e.hp <= 0 || e.type === "goblin" || e.trio || e.tpArrive > 0) continue;
    for (const m of state.minions) {
      if (m.life <= 0) continue;
      let dx = e.x - m.x, dy = e.y - m.y, d = Math.hypot(dx, dy);
      const min = e.r + m.r - 1;
      if (d >= min) continue;
      if (d < 0.001) { const t = Math.random() * Math.PI * 2; dx = Math.cos(t); dy = Math.sin(t); d = 1; }
      const push = (min - d) / d;
      e.x += dx * push * 0.65; e.y += dy * push * 0.65;
      m.x -= dx * push * 0.35; m.y -= dy * push * 0.35;
      e.x = clamp(e.x, WALL + e.r, WORLD.w - WALL - e.r); e.y = clamp(e.y, WALL + e.r, WORLD.h - WALL - e.r);
      m.x = clamp(m.x, WALL + m.r, WORLD.w - WALL - m.r); m.y = clamp(m.y, WALL + m.r, WORLD.h - WALL - m.r);
    }
  }
}

// Objetivo de persecucion de un enemigo: el esqueleto mas cercano si esta mas cerca que el personaje; si no, null (persigue al personaje).
function necroChaseTarget(e, playerDist) {
  if (state.weaponId !== "necro" || !state.minions.length) return null;
  let best = null, bestD = playerDist * playerDist;
  for (const m of state.minions) {
    if (m.life <= 0) continue;
    const d = dist2(e.x, e.y, m.x, m.y);
    if (d < bestD) { bestD = d; best = m; }
  }
  return best;
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
    const target = pickNecromancerMinionTarget(m, targets);
    const a = i * Math.PI * 2 / Math.max(1, state.minions.length);
    const tx = target ? target.x : p.x + Math.cos(a) * 65;
    const ty = target ? target.y : p.y + Math.sin(a) * 65;
    const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy);
    // Solo los esqueletos arqueros (Hueste) disparan a distancia; los nacidos de bajas pelean cuerpo a cuerpo
    const ranged = m.archer;
    const reach = target ? (ranged ? NECRO_MINION_HOLD : target.r + m.r + 6) : 8;
    if (d > reach) {
      const move = Math.min(d - reach, NECRO_MINION_SPEED * dt);
      m.x += dx / (d || 1) * move; m.y += dy / (d || 1) * move;
    }
    if (target && m.attackCd <= 0) {
      if (ranged && d <= NECRO_MINION_RANGE) {
        shootNecromancerMinion(m, target);
        m.attackCd = necroMinionAttackCd();
        m.swing = 0.18;
      } else if (!ranged && d <= reach + 1) {
        const prev = dmgSkill;
        dmgSkill = m.skill == null ? 1 : m.skill;
        try {
          const damage = p.dmg * NECRO_MINION_DAMAGE_RATIO;
          if (target.type === "boss") damageWeaponBoss(target, damage);
          else damageWeaponEnemy(target, damage);
        } finally { dmgSkill = prev; }
        m.attackCd = necroMinionAttackCd();
        m.swing = 0.18;
      }
    }
    // Spectral summons pass through scenery, but stay inside arena walls.
    m.x = clamp(m.x, WALL + m.r, WORLD.w - WALL - m.r);
    m.y = clamp(m.y, WALL + m.r, WORLD.h - WALL - m.r);
  }
  separateNecromancerMinions();
  collideEnemiesWithMinions();
  updateNecromancerMinionDamage(dt);
  state.minions = state.minions.filter(m => m.life > 0);
}

function drawNecromancer() {
  if (state.weaponId !== "necro") return;
  drawNecromancerAura();
  for (const target of state.enemies.concat(state.bosses)) {
    if (!target.necroPoison || target.hp <= 0) continue;
    const stacks = target.necroPoison.stacks;
    ctx.save();
    ctx.strokeStyle = "rgba(166,230,95," + Math.min(1, 0.55 + stacks * 0.08) + ")"; ctx.lineWidth = 2 + Math.min(3, stacks * 0.3);
    ctx.shadowColor = "#8ad84f"; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(target.x, target.y, target.r + 4, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;                                                       // cargas de veneno: una bolita verde fija por carga
    const baseR = target.r + 4;
    ctx.fillStyle = "#8ad84f"; ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 1;
    for (let ring = 0; ring * 12 < stacks; ring++) {                         // 12 bolitas por vuelta; si hay mas cargas se abre otro anillo
      const count = Math.min(12, stacks - ring * 12), rr = baseR + ring * 6;
      for (let i = 0; i < count; i++) {
        const a = -Math.PI / 2 + (i - (count - 1) / 2) * NECRO_POISON_DOT_STEP;   // una cada 30 grados, grupo centrado arriba
        ctx.beginPath(); ctx.arc(target.x + Math.cos(a) * rr, target.y + Math.sin(a) * rr, NECRO_POISON_DOT_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    ctx.restore();
  }
  for (const m of state.minions) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, m.life / 0.8);
    const archer = m.archer;                           // esqueleto arquero (Hueste): sprite mas grande
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(m.x, m.y + (archer ? 11 : 9.6), archer ? 14 : 12, archer ? 6 : 5.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = m.inv > 0 ? "#ff5a5a" : "#9fe6b2"; ctx.shadowBlur = m.swing > 0 || m.inv > 0 ? 18 : 5;
    const bob = Math.sin(performance.now() / 160 + m.x * 0.02) * 2;
    const sprite = archer ? necroSprites["skeleton-archer"] : necroSprites.skeleton;
    if (archer && sprite.ready) ctx.drawImage(sprite.image, m.x - 24, m.y - 33 + bob, 48, 48);
    else if (sprite.ready) ctx.drawImage(sprite.image, m.x - 18, m.y - 21.6 + bob, 36, 36);   // 20 % mas grande (30 -> 36)
    else { ctx.fillStyle = "#dce8c5"; ctx.beginPath(); ctx.arc(m.x, m.y - 3.6, 9, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    if (m.hp < m.maxHp) {                               // barra de vida solo cuando ya recibio daño
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(m.x - 12, m.y - (archer ? 38 : 31), 24, 3);
      ctx.fillStyle = "#9fe6b2"; ctx.fillRect(m.x - 12, m.y - (archer ? 38 : 31), 24 * clamp(m.hp / m.maxHp, 0, 1), 3);
      ctx.restore();
    }
  }
}

function drawBodyNecromancer() {
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(0, 16.5, 18.7, 8.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.shadowColor = "#9fe6b2"; ctx.shadowBlur = 8;
  if (necroSprites.necromancer.ready) ctx.drawImage(necroSprites.necromancer.image, -28.6, -30.6, 57.2, 57.2);   // skin un 10 % mas grande (52 -> 57.2)
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
