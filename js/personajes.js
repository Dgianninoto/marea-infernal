"use strict";
/*
 * Marea Infernal - personajes.js (jugador / personaje)
 * Estado y acciones del heroe: apuntado y proyectiles (spawnArrow),
 * habilidades (useSkill), progresion / subida de nivel (gainXp), esquive/dash
 * (tryDash) y su render (drawPlayer con un cuerpo por clase: drawBodyArcher,
 * drawBodyMage, drawBodyBarbarian; y drawArrow).
 * Depende de simbolos globales definidos en mecanica.js (var/function).
 */

// Semiangulo del cono del Tajo al empezar la partida (rad). Es el arco inicial del barrido: 2 * 0,58 = 1,16 rad (~66,5 grados).
var AXE_CONE_HALF_ANGLE = 0.58;
// Tajo = BARRIDO en sentido horario. Con mas Dano el arco crece de forma lineal desde el arco inicial (con el Dano de
// inicio del Barbaro) hasta completar el circulo de 360 grados cuando el Dano llega a AXE_SWEEP_FULL_DMG.
// Pasado ese Dano el circulo ya esta completo y lo que crece es su radio: lineal de AXE_SWEEP_BASE_RANGE (con
// AXE_SWEEP_FULL_DMG) a AXE_SWEEP_MAX_RANGE (con AXE_SWEEP_MAX_DMG); por encima de ese Dano se queda en el maximo.
var AXE_SWEEP_FULL_DMG = 100;      // <<< BALANCE: Dano necesario para completar el circulo (360 grados)
var AXE_SWEEP_BASE_RANGE = 112;    // radio del barrido (px) hasta completar el circulo
var AXE_SWEEP_MAX_DMG = 380;       // <<< BALANCE: Dano maximo; con este Dano el radio llega a AXE_SWEEP_MAX_RANGE y ya no crece mas
var AXE_SWEEP_MAX_RANGE = 200;     // <<< BALANCE: radio maximo (px) del circulo
var AXE_SWEEP_TIME = 0.22;         // s que tarda el barrido en recorrer todo su arco (fijo, no depende de la Cadencia)
var AXE_SWEEP_FADE = 0.2;          // s que tarda en desvanecerse la estela al terminar
// Dano con el que el Barbaro EMPIEZA la partida = Dano base del personaje + Dano base de la pieza Arma equipada
// (30 + 8 = 38). Con ese Dano el barrido mide exactamente el arco inicial (~66,5 grados).
function axeSweepStartDmg() {
  const w = getWeapon("axe");
  const st = (w.weaponStats || []).find(x => x.key === "dmg");
  return (w.baseDmg || 0) + (st ? st.base : 0);
}
// Opacidad del area del barrido segun la Cadencia: a mas ataques por segundo hay mas barridos superpuestos, asi que cada
// uno se ve mas transparente. 1 (opaco) con la cadencia inicial del Barbaro y AXE_SWEEP_MIN_OPACITY con AXE_MAX_RATE A/s.
var AXE_MAX_RATE = 25;             // <<< Cadencia maxima (A/s) de referencia
var AXE_SWEEP_MIN_OPACITY = 0.1;   // <<< BALANCE: fraccion de opacidad que queda a AXE_MAX_RATE A/s
function axeSweepOpacity() {
  const p = state.player, base = getWeapon("axe").baseRate || 1.6;
  const rate = 1 / weaponSkillCooldown(p, 0);                 // A/s actuales (nivel + guantes)
  const k = clamp((rate - base) / (AXE_MAX_RATE - base), 0, 1);
  return 1 - k * (1 - AXE_SWEEP_MIN_OPACITY);
}
// Cono fantasma: muestra hacia donde saldra el siguiente barrido (el barrido en curso queda fijo y no sigue al raton).
// Sigue la mira en vivo y desaparece cuando el arco ya es el circulo completo (360 grados).
function drawAxePreview() {
  if (state.weaponId !== "axe" || state.over || state.phase === "intermission") return;
  const p = state.player, arc = axeSweepArc(p.dmg);
  if (arc >= Math.PI * 2 - 0.001) return;
  const range = axeSweepRange(p.dmg), aim = Math.atan2(p.aimY, p.aimX);
  const start = aim - arc / 2, end = aim + arc / 2;
  ctx.save();
  ctx.fillStyle = "#ff7659";
  ctx.globalAlpha = 0.09;
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, range, start, end); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 0.3; ctx.strokeStyle = "#ffd0bd"; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, range, start, end); ctx.closePath(); ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.55; ctx.lineWidth = 3;               // borde de salida (el barrido avanza en sentido horario desde aqui)
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(start) * range, p.y + Math.sin(start) * range); ctx.stroke();
  ctx.restore();
}

// Arco (rad) del barrido segun el Dano actual.
function axeSweepArc(dmg) {
  const base = AXE_CONE_HALF_ANGLE * 2, full = Math.PI * 2;
  const start = axeSweepStartDmg();
  if (AXE_SWEEP_FULL_DMG <= start) return full;
  const k = clamp((dmg - start) / (AXE_SWEEP_FULL_DMG - start), 0, 1);
  return base + (full - base) * k;
}
// Radio (px) del barrido segun el Dano actual: fijo hasta completar el circulo, luego crece lineal hasta el maximo.
function axeSweepRange(dmg) {
  if (AXE_SWEEP_MAX_DMG <= AXE_SWEEP_FULL_DMG) return AXE_SWEEP_MAX_RANGE;
  const k = clamp((dmg - AXE_SWEEP_FULL_DMG) / (AXE_SWEEP_MAX_DMG - AXE_SWEEP_FULL_DMG), 0, 1);
  return AXE_SWEEP_BASE_RANGE + (AXE_SWEEP_MAX_RANGE - AXE_SWEEP_BASE_RANGE) * k;
}

// Angulo de cada hacha de la Hacha arrojadiza respecto a la mira (rad); apertura total = el doble.
var AXE_THROW_ANGLE = 0.5;
// Golpe sismico: radio total y 3 anillos concentricos, cada uno de 1/3 del radio. Cada anillo
// multiplica el dano base del Barbaro: exterior x2, central x4, interior (el mas chico) x7.
// `r` = fraccion del radio total hasta donde llega el anillo (de dentro hacia fuera).
var SEISMIC_RADIUS = 195;
var SEISMIC_RINGS = [
  { r: 1 / 3, mult: 7 },
  { r: 2 / 3, mult: 4 },
  { r: 1,     mult: 2 },
];
// Sangrado de la Hacha arrojadiza: 16 ticks (cada 0,5 s) de 50 % del dano del Barbaro = 800 % en 8 s.
var BLEED_TICK_INTERVAL = 0.5;
var BLEED_TICKS = 16;
var BLEED_TICK_RATIO = 0.5;
var BLEED_REAPPLY_RATIO = 0.5; // al reaplicar sobre un objetivo que ya sangra: fraccion del sangrado restante que se inflige de golpe

// ---------------------------------------------------------------- Combat / loot
// Registro de dano por ataque (0 = basico, 1 = intermedio, 2 = definitivo) para el resumen de fin de partida.
// `dmgSkill` es el ataque al que se atribuye el dano que ocurre ahora mismo (-1 = ninguno). Se fija mientras
// se lanza una habilidad (useSkill), al golpear un proyectil (b.skill) y en el impacto del meteorito.
// Se cuenta el dano REAL: lo que sobra al rematar a un enemigo (sobreataque) no suma.
var dmgSkill = -1;
function logDamage(skill, hpBefore, dealt) {
  if (skill < 0 || !state || !state.dmgStats) return;
  state.dmgStats[skill] += Math.max(0, Math.min(dealt, hpBefore));
}

// Multiplicador de critico (solo el Arquero tiene Critico). Cada 100 % es un critico ASEGURADO y cada critico suma +1
// al multiplicador base x1 (el super critico no suma el x2 del critico base aparte). La parte decimal es la
// probabilidad de un critico extra. Ej.: 40 % -> 40 % de x2; 100 % -> x2 siempre; 150 % -> x2 + 50 % de x3;
// 550 % -> 5 criticos asegurados = x6 + 50 % de x7; 300 % -> x4 siempre.
function critMultiplier(chance) {
  if (!(chance > 0)) return 1;
  const whole = Math.floor(chance + 1e-6);          // criticos asegurados
  const frac = Math.max(0, chance - whole);         // probabilidad de uno mas
  return 1 + whole + (frac > 1e-6 && Math.random() < frac ? 1 : 0);
}
function critMark(mult) { return mult >= 3 ? "!!" : mult > 1 ? "!" : ""; }

// Spawn a projectile heading at angle `ang`.
// opts: {dmg, r, spd, pierce, big, color, kind, splashRadius, splashDamage, homing, bleed}
// bleed = dano por tick del sangrado que el proyectil aplica a lo que golpea (0 = sin sangrado).
// attackId = identificador del lanzamiento: las hachas del MISMO ataque no se disparan el golpe instantaneo entre si.
// homing = velocidad maxima de giro (rad/s) para guiar el proyectil hacia el enemigo mas cercano.
function spawnArrow(ang, opts) {
  const p = state.player;
  const o = opts || {};
  const spd = o.spd || 620;
  const critMult = critMultiplier(p.crit); // each skill arrow rolls its own crit (x2, o super critico mayor)
  const crit = critMult > 1;
  state.bullets.push({
    x: p.x + Math.cos(ang) * p.r, y: p.y + Math.sin(ang) * p.r,
    vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
    r: o.r || 5, dmg: (o.dmg || p.dmg) * critMult, life: o.life || 0.55, crit, critMult,
    pierce: o.pierce || 0, big: !!o.big, color: o.color || null,
    kind: o.kind || "arrow", splashRadius: o.splashRadius || 0, splashDamage: o.splashDamage || 0,
    homing: o.homing || 0, target: null, bleed: o.bleed || 0, attackId: o.attackId || 0,
    skill: dmgSkill, // ataque que lo disparo (para el resumen de dano)
  });
}

// Elige blanco para un proyectil guiado: entre los enemigos (y el jefe) vivos dentro de `range`,
// el que tiene MENOS proyectiles guiados activos apuntandole; a igualdad, el mas cercano.
// Asi cada proyectil nuevo se reparte hacia un enemigo distinto en vez de amontonarse en uno.
function findHomingTarget(b, range) {
  const claims = new Map();                       // blanco -> proyectiles activos que lo persiguen
  for (const o of state.bullets) {
    if (o !== b && o.homing > 0 && o.life > 0 && o.target && o.target.hp > 0) {
      claims.set(o.target, (claims.get(o.target) || 0) + 1);
    }
  }
  let best = null, bestClaims = Infinity, bestD = Infinity;
  const consider = t => {
    if (!t || t.hp <= 0 || (b.hitSet && b.hitSet.has(t))) return;
    const d = dist2(b.x, b.y, t.x, t.y);
    if (d > range * range) return;
    const c = claims.get(t) || 0;
    if (c < bestClaims || (c === bestClaims && d < bestD)) { best = t; bestClaims = c; bestD = d; }
  };
  for (const e of state.enemies) consider(e);
  for (const bs of state.bosses) consider(bs);
  return best;
}

// Gira la velocidad del proyectil hacia su blanco (ver findHomingTarget), sin cambiar su rapidez.
// Si el blanco muere, busca otro; si no hay ninguno en rango, sigue recto.
function steerHomingBullet(b, dt) {
  let t = b.target;
  if (!t || t.hp <= 0 || (b.hitSet && b.hitSet.has(t))) t = b.target = findHomingTarget(b, 520);
  if (!t) return;
  const spd = Math.hypot(b.vx, b.vy);
  const cur = Math.atan2(b.vy, b.vx), want = Math.atan2(t.y - b.y, t.x - b.x);
  let diff = want - cur;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));            // diferencia en [-PI, PI]
  const maxStep = b.homing * dt;
  const a = cur + Math.max(-maxStep, Math.min(maxStep, diff));
  b.vx = Math.cos(a) * spd; b.vy = Math.sin(a) * spd;
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

// Salva arcana: abanico de 5 orbes (separados SALVO_SPACING rad). Cada 10 % de Poder agrega un orbe,
// asi el abanico cubre mas angulo hasta cerrar un circulo completo (SALVO_MAX_ORBS orbes).
var SALVO_BASE_ORBS = 5;
var SALVO_SPACING = 0.155;
var SALVO_MAX_ORBS = Math.round(Math.PI * 2 / SALVO_SPACING); // 40
function salvoOrbCount(poder) {
  return Math.min(SALVO_MAX_ORBS, SALVO_BASE_ORBS + Math.floor(poder * 10 + 1e-6));
}

// Meteorito: dano = base * multiplicador segun la distancia al centro. x100 en el centro (d = 0) y cae de forma
// EXPONENCIAL (decaimiento rapido) hasta x2 en el borde del area, asi el dano grande queda concentrado en el
// centro. Los enemigos y jefes dentro del 1/3 central se empujan un poco hacia el centro ANTES de recibir el dano
// (el multiplicador usa la posicion en la que quedan).
var METEOR_MULT_CENTER = 100;
var METEOR_MULT_EDGE = 2;
var METEOR_DECAY_K = 4;         // rapidez de la caida: mayor = mas concentrado en el centro
var METEOR_PULL_ZONE = 1 / 3;   // fraccion del radio donde se aplica el empuje
var METEOR_PULL_STRENGTH = 0.35; // fraccion de la distancia al centro que se recorre (empuje ligero)
// Forma de la caida normalizada: 1 en el centro (frac = 0), 0 en el borde (frac = 1), decaimiento exponencial.
function meteorFalloff(frac) {
  const t = clamp(frac, 0, 1), eK = Math.exp(-METEOR_DECAY_K);
  return (Math.exp(-METEOR_DECAY_K * t) - eK) / (1 - eK);
}
function meteorMult(frac) { return METEOR_MULT_EDGE + (METEOR_MULT_CENTER - METEOR_MULT_EDGE) * meteorFalloff(frac); }
function meteorHit(x, y, radius, baseDamage) {
  const prevSkill = dmgSkill;
  dmgSkill = 2; // el meteorito es el ataque definitivo del Mago
  try { meteorHitInner(x, y, radius, baseDamage); } finally { dmgSkill = prevSkill; }
}
function meteorHitInner(x, y, radius, baseDamage) {
  const targets = [];
  for (const e of state.enemies) targets.push([e, false]);
  for (const b of state.bosses) targets.push([b, true]);
  for (const [t, isBoss] of targets) {
    if (t.hp <= 0) continue;
    let d = Math.sqrt(dist2(x, y, t.x, t.y));
    if (d > radius + t.r) continue;
    // 1) empuje ligero hacia el centro (enemigos normales y jefes), ANTES de calcular el dano
    if (d <= radius * METEOR_PULL_ZONE && d > 0) {
      const k = 1 - METEOR_PULL_STRENGTH;
      t.x = x + (t.x - x) * k;
      t.y = y + (t.y - y) * k;
      if (isBoss) {
        t.x = clamp(t.x, WALL + t.r, WORLD.w - WALL - t.r);
        t.y = clamp(t.y, WALL + t.r, WORLD.h - WALL - t.r);
      }
      d = Math.sqrt(dist2(x, y, t.x, t.y)); // posicion final tras el empuje
    }
    // 2) dano segun la posicion en la que queda el objetivo (siempre entre x100 y x2 dentro del area visible)
    const mult = meteorMult(Math.min(d, radius) / radius);
    if (isBoss) damageWeaponBoss(t, baseDamage * mult); else damageWeaponEnemy(t, baseDamage * mult);
  }
}

// Gradiente del area del Meteorito: intenso y claro en el centro (x100) y tenue en el borde (x2). Las paradas
// siguen la misma curva exponencial que meteorMult, asi lo que se ve coincide con el dano real.
function meteorGradient(x, y, radius) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  const c0 = [255, 240, 255], c1 = [110, 60, 170];   // color del centro y del borde
  const stops = [0, 0.04, 0.08, 0.12, 0.17, 0.23, 0.3, 0.4, 0.55, 0.75, 1];
  for (const t of stops) {
    const f = meteorFalloff(t);
    const c = c0.map((v, i) => Math.round(c1[i] + (v - c1[i]) * f));
    g.addColorStop(t, "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (0.14 + 0.81 * f).toFixed(3) + ")");
  }
  return g;
}

// Radio del Meteorito: 145 px base, +% igual al Poder.
function meteorRadius(poder) { return 145 * (1 + poder); }

// Distancia de casteo del Meteorito: cae donde apunta la mira, limitado entre un minimo y un maximo.
// (Antes caia siempre a 320 px: minimo 160 = la mitad, maximo 640 = el doble.)
var METEOR_MIN_RANGE = 160;
var METEOR_MAX_RANGE = 500;
function castArcaneMeteor() {
  const p = state.player;
  const distance = clamp(p.aimDist != null ? p.aimDist : 320, METEOR_MIN_RANGE, METEOR_MAX_RANGE);
  state.weaponEffects.push({
    kind: "meteor",
    x: p.x + p.aimX * distance,
    y: p.y + p.aimY * distance,
    radius: meteorRadius(p.poder || 0),
    color: "#bd8cff",
    phase: "falling",
    fallDuration: 0.85,
    life: 0.85,
    impactDuration: 0.55,
    impactLife: 0,
    damage: p.dmg, // base: se multiplica x100 (centro) a x2 (borde), caida exponencial al impactar, ver meteorHit
  });
  Sound.bossdie();
}


// Barrido del Tajo: sigue al jugador y golpea una sola vez a cada objetivo cuando el filo (que gira en sentido
// horario, o sea angulo creciente en pantalla) pasa por su cuerpo.
function updateAxeSweep(effect, dt) {
  const p = state.player;
  effect.x = p.x; effect.y = p.y;
  effect.life = Math.max(0, effect.life - dt);
  const elapsed = effect.duration - effect.life;
  const k = clamp(elapsed / effect.sweepTime, 0, 1);
  const a0 = effect.prog, a1 = k;                          // velocidad angular constante
  effect.prog = a1;
  const s0 = a0 * effect.arc, s1 = a1 * effect.arc, TAU = Math.PI * 2;
  const prevSkill = dmgSkill;
  dmgSkill = 0; // el Tajo es el ataque basico del Barbaro
  try {
    const hits = t => {
      if (t.hp <= 0 || effect.hit.has(t)) return false;
      const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy);
      if (d > effect.range + t.r) return false;
      if (d <= t.r) return true;                           // el jugador esta dentro del cuerpo: lo golpea ya
      let rel = (Math.atan2(dy, dx) - effect.start) % TAU; // desplazamiento horario desde el inicio del barrido
      if (rel < 0) rel += TAU;
      const w = Math.asin(Math.min(1, t.r / d));           // semiancho angular del cuerpo
      for (let m = -1; m <= 1; m++) {
        const lo = rel + m * TAU - w, hi = rel + m * TAU + w;
        if (hi >= s0 && lo <= s1) return true;
      }
      return false;
    };
    for (const e of state.enemies.slice()) if (hits(e)) { effect.hit.add(e); damageWeaponEnemy(e, effect.damage); }
    for (const b of state.bosses.slice()) if (hits(b)) { effect.hit.add(b); damageWeaponBoss(b, effect.damage); }
  } finally { dmgSkill = prevSkill; }
  // chispas en el filo mientras gira
  if (k < 1) {
    const ang = effect.start + s1;
    for (let i = 0; i < 2; i++) {
      const rr = effect.range * rand(0.55, 1);
      state.particles.push({ x: p.x + Math.cos(ang) * rr, y: p.y + Math.sin(ang) * rr, vx: rand(-30, 30), vy: rand(-30, 30), life: rand(0.15, 0.3), r: rand(2, 4), color: "#ff9a7a" });
    }
  }
}

function updateWeaponEffects(dt) {
  for (const effect of state.weaponEffects) {
    if (effect.kind === "axe-sweep") { updateAxeSweep(effect, dt); continue; }
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
        meteorHit(effect.x, effect.y, effect.radius, effect.damage);
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
  drawAxePreview();
  for (const effect of state.weaponEffects) {
    if (effect.kind === "meteor") {
      if (effect.phase === "falling") {
        const progress = clamp(1 - effect.life / effect.fallDuration, 0, 1);
        const pulse = 0.5 + Math.sin(performance.now() / 70) * 0.12;
        ctx.save();
        ctx.globalAlpha = 0.55 + progress * 0.45;
        ctx.fillStyle = meteorGradient(effect.x, effect.y, effect.radius);
        ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2); ctx.fill();
        // anillo fino en el tercio central: zona de mayor dano y de empuje hacia el centro
        ctx.globalAlpha = 0.35 + progress * 0.35;
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius * METEOR_PULL_ZONE, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
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
        ctx.globalAlpha = progress;
        ctx.fillStyle = meteorGradient(effect.x, effect.y, effect.radius);
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
    if (effect.kind === "axe-sweep") {
      const fade = clamp(effect.life / AXE_SWEEP_FADE, 0, 1);   // la estela se desvanece al final
      const op = effect.opacity == null ? 1 : effect.opacity;   // baja con la Cadencia (ver axeSweepOpacity)
      const lineOp = Math.max(0.25, op);                        // los bordes nunca desaparecen del todo
      const start = effect.start, cur = start + effect.arc * effect.prog;
      const full = effect.arc >= Math.PI * 2 - 0.001;
      ctx.fillStyle = effect.color;
      ctx.globalAlpha = fade * 0.3 * op;
      ctx.beginPath();
      if (!full) ctx.moveTo(effect.x, effect.y);
      ctx.arc(effect.x, effect.y, effect.range, start, cur);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = fade * lineOp;
      ctx.strokeStyle = "#ffd0bd"; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.range, start, cur);   // borde exterior de la estela
      ctx.stroke();
      if (effect.prog < 1) {                                   // filo que va barriendo
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 5;
        ctx.shadowBlur = 14; ctx.shadowColor = effect.color;
        ctx.beginPath();
        ctx.moveTo(effect.x, effect.y);
        ctx.lineTo(effect.x + Math.cos(cur) * effect.range, effect.y + Math.sin(cur) * effect.range);
        ctx.stroke();
      }
    } else if (effect.kind === "axe-cone") {
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
    } else if (effect.kind === "blink-out" || effect.kind === "blink-in") {
      const t = 1 - alpha;                                   // 0 -> 1
      const rr = effect.radius * (effect.kind === "blink-out" ? 0.5 + t * 1.3 : 1.8 - t * 1.3);
      ctx.shadowBlur = 16; ctx.shadowColor = "#bd8cff";
      ctx.fillStyle = "rgba(189,140,255,0.22)";
      ctx.beginPath(); ctx.arc(effect.x, effect.y, rr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#e3c8ff"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(effect.x, effect.y, rr, 0, Math.PI * 2); ctx.stroke();
    } else if (effect.kind === "axe-ring") {
      // 3 anillos: los discos se superponen, asi el centro (x7) es el mas intenso y el borde (x2) el mas suave
      ctx.fillStyle = effect.color;
      for (let k = SEISMIC_RINGS.length - 1; k >= 0; k--) {
        const rr = effect.radius * SEISMIC_RINGS[k].r;
        ctx.globalAlpha = alpha * 0.16;
        ctx.beginPath(); ctx.arc(effect.x, effect.y, rr, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = alpha * (k === SEISMIC_RINGS.length - 1 ? 1 : 0.8);
        ctx.strokeStyle = "#ffd0bd"; ctx.lineWidth = k === SEISMIC_RINGS.length - 1 ? 5 : 3;
        ctx.beginPath(); ctx.arc(effect.x, effect.y, rr, 0, Math.PI * 2); ctx.stroke();
      }
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
  const critMult = critMultiplier(state.player.crit);
  const critical = critMult > 1;
  const dealt = damage * critMult;
  logDamage(dmgSkill, enemy.hp, dealt);
  enemy.hp -= dealt;
  enemy.flash = 0.08;
  floatText(enemy.x, enemy.y - enemy.r - 4, "-" + Math.round(dealt) + critMark(critMult), critical ? "#ff9d2e" : "#ffe08a");
  if (enemy.type === "goblin" && typeof onGoblinHit === "function") onGoblinHit(enemy);
  if (enemy.hp <= 0) killEnemy(enemy);
}

function damageWeaponBoss(boss, damage) {
  if (!boss || boss.hp <= 0) return;
  const critMult = critMultiplier(state.player.crit);
  const critical = critMult > 1;
  const dealt = damage * critMult;
  logDamage(dmgSkill, boss.hp, dealt);
  boss.hp -= dealt;
  boss.flash = 0.08;
  floatText(boss.x, boss.y - boss.r - 4, "-" + Math.round(dealt) + critMark(critMult), critical ? "#ff9d2e" : "#ffe08a");
  if (boss.hp <= 0) killBoss(boss);
}

function damageWeaponArea(x, y, radius, damage, excludedTarget) {
  for (const enemy of state.enemies) {
    if (enemy !== excludedTarget && enemy.hp > 0 &&
        dist2(x, y, enemy.x, enemy.y) <= (radius + enemy.r) ** 2) {
      damageWeaponEnemy(enemy, damage);
    }
  }
  for (const boss of state.bosses.slice()) {
    if (boss !== excludedTarget && boss.hp > 0 &&
        dist2(x, y, boss.x, boss.y) <= (radius + boss.r) ** 2) {
      damageWeaponBoss(boss, damage);
    }
  }
}

// Dano por anillos concentricos: cada enemigo recibe un solo golpe, el del anillo mas interior que
// toque su cuerpo (distancia al centro - radio del enemigo <= radio del anillo).
function damageWeaponRings(x, y, radius, rings, baseDamage) {
  const ringFor = t => {
    const d = Math.sqrt(dist2(x, y, t.x, t.y));
    if (d > radius + t.r) return null;
    for (const ring of rings) if (d - t.r <= radius * ring.r) return ring;
    return null;
  };
  for (const enemy of state.enemies.slice()) {
    if (enemy.hp <= 0) continue;
    const ring = ringFor(enemy);
    if (ring) damageWeaponEnemy(enemy, baseDamage * ring.mult);
  }
  for (const boss of state.bosses.slice()) {
    if (boss.hp <= 0) continue;
    const ring = ringFor(boss);
    if (ring) damageWeaponBoss(boss, baseDamage * ring.mult);
  }
}

// Dano por anillos concentricos: cada enemigo recibe un solo golpe, el del anillo mas interior que
// toque su cuerpo (distancia al centro - radio del enemigo <= radio del anillo).
function damageWeaponRings(x, y, radius, rings, baseDamage) {
  const ringFor = t => {
    const d = Math.sqrt(dist2(x, y, t.x, t.y));
    if (d > radius + t.r) return null;
    for (const ring of rings) if (d - t.r <= radius * ring.r) return ring;
    return null;
  };
  for (const enemy of state.enemies.slice()) {
    if (enemy.hp <= 0) continue;
    const ring = ringFor(enemy);
    if (ring) damageWeaponEnemy(enemy, baseDamage * ring.mult);
  }
  for (const boss of state.bosses.slice()) {
    if (boss.hp <= 0) continue;
    const ring = ringFor(boss);
    if (ring) damageWeaponBoss(boss, baseDamage * ring.mult);
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
  for (const bs of state.bosses.slice()) if (bs.hp > 0 && hits(bs)) damageWeaponBoss(bs, damage);
}

// Automatic weapon kit: basic, intermediate and ultimate attacks share cooldown UI.
function useSkill(i) {
  dmgSkill = i;
  try { useSkillInner(i); } finally { dmgSkill = -1; }
}
function useSkillInner(i) {
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
        spawnArrow(angle, { dmg: p.dmg * 0.75, spd: 640, life: 1.1, pierce: 1, color: "#ffd84d" }); // pierce 1: atraviesa al primer enemigo y se detiene en el segundo (o al alcanzar su alcance maximo)
      }
      Sound.shoot();
    } else {
      spawnArrow(base, { dmg: p.dmg * 6 + 60, r: 16, spd: 760, pierce: 999, big: true, life: 0.8, color: "#ff7a2a" });
      state.shake = Math.max(state.shake, 12);
      Sound.bossdie();
    }
  } else if (weaponId === "staff") {
    if (i === 0) {
      // Orbe guiado: sale hacia la mira y gira (hasta 6 rad/s) hacia el enemigo con menos orbes encima (a igualdad, el mas cercano).
      spawnArrow(base, { dmg: p.dmg, r: 9, spd: 430, life: 1.25, color: "#bd8cff", kind: "orb", homing: 6 });
      Sound.shoot();
    } else if (i === 1) {
      const count = salvoOrbCount(p.poder || 0);
      const full = count >= SALVO_MAX_ORBS;                       // circulo completo: reparte los orbes en 360 grados
      const step = full ? Math.PI * 2 / count : SALVO_SPACING;
      for (let k = 0; k < count; k++) {
        const angle = full ? base + k * step : base + (k - (count - 1) / 2) * step;
        spawnArrow(angle, {
          dmg: p.dmg * 0.75, r: 9, spd: 390, life: 1.35,
          color: "#d7a5ff", kind: "orb", splashRadius: 46, splashDamage: p.dmg * 0.35,
        });
      }
      Sound.levelup();
    } else {
      castArcaneMeteor();
    }
  } else {
    if (i === 0) {
      // Barrido horario: arco centrado en la mira (de base - arco/2 a base + arco/2, avanzando en sentido horario).
      // Arco y radio dependen del Dano (ver axeSweepArc / axeSweepRange). El dano se aplica mientras barre.
      const arc = axeSweepArc(p.dmg), range = axeSweepRange(p.dmg);
      const sweepTime = AXE_SWEEP_TIME;              // duracion fija
      state.weaponEffects.push({
        kind: "axe-sweep", x: p.x, y: p.y, radius: 0, color: "#ff7659",
        duration: sweepTime + AXE_SWEEP_FADE, life: sweepTime + AXE_SWEEP_FADE, sweepTime,
        start: base - arc / 2, arc, range, prog: 0, damage: p.dmg * 1.4, hit: new Set(), opacity: axeSweepOpacity(),
      });
      Sound.swing();
    } else if (i === 1) {
      // Hacha arrojadiza: 2 hachas giratorias (circulos de 50 px) lanzadas en abanico a +-0,5 rad
      // de la mira, mas una hacha central del doble de tamano (100 px) que viaja 375 px (las laterales 250 px).
      // Recorren su trayecto atravesando enemigos; dano = 25 % del dano base, pero cada impacto
      // deja sangrado (50 % del dano del Barbaro cada 0,5 s durante 8 s, ver applyBleed).
      const spd = 500, bleed = p.dmg * BLEED_TICK_RATIO, attackId = ++bleedAttackSeq; // las 3 hachas comparten attackId
      const throws = [
        { angle: base - AXE_THROW_ANGLE, diameter: 50,  travel: 250 },
        { angle: base + AXE_THROW_ANGLE, diameter: 50,  travel: 250 },
        { angle: base,                   diameter: 100, travel: 375 },
      ];
      for (const t of throws) {
        spawnArrow(t.angle, {
          dmg: p.dmg * 0.25, r: t.diameter / 2, spd, life: t.travel / spd,
          pierce: 999, color: "#ff7659", kind: "axe", bleed, attackId,
        });
      }
      Sound.shoot();
    } else {
      const radius = SEISMIC_RADIUS;
      damageWeaponRings(p.x, p.y, radius, SEISMIC_RINGS, p.dmg);
      showWeaponArea(p.x, p.y, radius, "#ff3a1a", 0.68, "axe-ring");
      weaponBurst(p.x, p.y, radius, "#ff3a1a", 48);
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
  const blink = p.dashFx === "blink";
  if (blink) showWeaponArea(p.x, p.y, 38, "#bd8cff", MAGE_BLINK_TIME, "blink-out"); // desaparece: anillo que se expande
  for (let i = 0; i < (blink ? 18 : 12); i++) {
    state.particles.push({ x: p.x, y: p.y, vx: -dx * rand(60, 200) + rand(-40, 40), vy: -dy * rand(60, 200) + rand(-40, 40), life: rand(0.2, 0.4), r: rand(2, 4), color: blink ? (i % 2 ? "#bd8cff" : "#f4d4ff") : "#6ad1ff" });
  }
}

// Esquiva del mago (parpadeo arcano): al terminar reaparece con un anillo que se cierra y
// parpadea en violeta unos instantes (como los enemigos al reaparecer, pero violeta).
var MAGE_BLINK_TIME = 0.4;   // duracion de los anillos
var MAGE_BLINK_ARRIVE = 0.4; // segundos de parpadeo violeta al reaparecer
function endMageBlink(p) {
  p.blinkArrive = MAGE_BLINK_ARRIVE;
  showWeaponArea(p.x, p.y, 38, "#bd8cff", MAGE_BLINK_TIME, "blink-in");
  for (let i = 0; i < 16; i++) {
    const a = rand(0, Math.PI * 2), s = rand(40, 170);
    state.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.25, 0.5), r: rand(2, 4), color: i % 2 ? "#bd8cff" : "#f4d4ff" });
  }
}

// ---------------------------------------------------------------- Skins por clase
// Cada cuerpo se dibuja en coordenadas "de unidad" (jugador con r = 20) y se
// escala con p.r / 20, centrado en (p.x, p.y). El cuerpo NO rota con el
// apuntado; solo el arma gira hacia el raton (ver drawPlayer).

// Arquero: Explorador del bosque. Load once; keep the original drawing as fallback.
var archerSprite = new Image();
var archerSpriteReady = false;
archerSprite.onload = () => { archerSpriteReady = true; };
archerSprite.src = "assets/archer/forest.svg";

function drawBodyArcher() {
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(0, 14, 18, 10, 0, 0, Math.PI * 2); ctx.fill();

  if (archerSpriteReady) {
    // 96-unit artwork has padding; its visible body matches the original 40px height.
    ctx.drawImage(archerSprite, -24, -24, 48, 48);
    return;
  }

  ctx.save();
  ctx.shadowBlur = 16; ctx.shadowColor = "#ff7a2a";
  ctx.fillStyle = "#2b1a12";
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.quadraticCurveTo(20, -6, 16, 20);
  ctx.lineTo(-16, 20);
  ctx.quadraticCurveTo(-20, -6, 0, -20);
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.lineWidth = 5; ctx.strokeStyle = "#000"; ctx.stroke();
  ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = "#ff9d4d"; ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#140b07";
  ctx.beginPath(); ctx.arc(0, -5, 8.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ffcf80";
  ctx.beginPath(); ctx.arc(-2.8, -5.6, 1.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(2.8, -5.6, 1.4, 0, Math.PI * 2); ctx.fill();
}

// Maga: figura esbelta (hombros estrechos, cintura marcada, falda abierta), violeta.
var mageSprite = new Image();
var mageSpriteReady = false;
mageSprite.onload = () => { mageSpriteReady = true; };
mageSprite.src = "assets/mage/arcane.svg";

function drawBodyMage() {
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(0, 15, 15, 7, 0, 0, Math.PI * 2); ctx.fill();

  if (mageSpriteReady) {
    // Match the SVG's translate(48 44) scale(1.7) to the original body coordinates.
    const scale = 1 / 1.7;
    ctx.drawImage(mageSprite, -48 * scale, -44 * scale, 96 * scale, 96 * scale);
    return;
  }

  ctx.lineJoin = "round";
  ctx.save();
  ctx.shadowBlur = 16; ctx.shadowColor = "#bd8cff";

  // cabello largo detras de la tunica (un lado y su espejo)
  for (const side of [1, -1]) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.beginPath();
    ctx.moveTo(-6, -17);
    ctx.bezierCurveTo(-14, -11, -14, 0, -11, 11);
    ctx.bezierCurveTo(-8, 5, -6, -3, -4, -12);
    ctx.closePath();
    ctx.fillStyle = "#6f3fb0"; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = "#000"; ctx.stroke();
    ctx.restore();
  }

  // tunica
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.bezierCurveTo(6, -20, 10, -14, 10, -8);
  ctx.bezierCurveTo(10, -3, 6, 0, 6, 4);
  ctx.bezierCurveTo(6, 10, 14, 14, 15, 20);
  ctx.quadraticCurveTo(0, 24, -15, 20);
  ctx.bezierCurveTo(-14, 14, -6, 10, -6, 4);
  ctx.bezierCurveTo(-6, 0, -10, -3, -10, -8);
  ctx.bezierCurveTo(-10, -14, -6, -20, 0, -20);
  ctx.closePath();
  ctx.lineWidth = 5; ctx.strokeStyle = "#000"; ctx.stroke();
  ctx.fillStyle = "#3d2160"; ctx.fill();
  ctx.lineWidth = 1.8; ctx.strokeStyle = "#bd8cff"; ctx.stroke();
  ctx.restore();

  // pliegues de tela
  ctx.save();
  ctx.globalAlpha *= 0.6;
  ctx.strokeStyle = "#bd8cff"; ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, 21); ctx.stroke();
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-3, -2); ctx.quadraticCurveTo(-6, 1, -6, 4);
  ctx.moveTo(3, -2); ctx.quadraticCurveTo(6, 1, 6, 4);
  ctx.stroke();
  ctx.restore();

  // fajin con gema
  ctx.lineCap = "round";
  ctx.strokeStyle = "#d7a5ff"; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(-6.4, 3.2); ctx.quadraticCurveTo(0, 5.6, 6.4, 3.2); ctx.stroke();
  ctx.fillStyle = "#fff0ff"; ctx.strokeStyle = "#bd8cff"; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.arc(0, 4.4, 1.9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // rostro, ojos, pestanas y sonrisa
  ctx.fillStyle = "#140b07";
  ctx.beginPath(); ctx.ellipse(0, -11.5, 5.3, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f4e0ff";
  ctx.beginPath(); ctx.ellipse(-2.1, -12, 1.25, 0.95, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(2.1, -12, 1.25, 0.95, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#d7a5ff"; ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-3.6, -12.6); ctx.lineTo(-4.6, -13.5);
  ctx.moveTo(3.6, -12.6); ctx.lineTo(4.6, -13.5);
  ctx.stroke();
  ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(-1.2, -8.6); ctx.quadraticCurveTo(0, -7.8, 1.2, -8.6); ctx.stroke();
}

// Barbaro: triangulo invertido (hombros enormes, cintura angosta), rojo, mirada maligna.
function drawBodyBarbarian() {
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath(); ctx.ellipse(0, 17, 20, 7, 0, 0, Math.PI * 2); ctx.fill();

  ctx.lineJoin = "round";

  // torso
  ctx.save();
  ctx.shadowBlur = 16; ctx.shadowColor = "#ff2a1a";
  ctx.beginPath();
  ctx.moveTo(-25, -11);
  ctx.quadraticCurveTo(0, -19, 25, -11);
  ctx.lineTo(8, 20);
  ctx.lineTo(-8, 20);
  ctx.closePath();
  ctx.lineWidth = 5; ctx.strokeStyle = "#000"; ctx.stroke();
  ctx.fillStyle = "#8c1a14"; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = "#ff5a45"; ctx.stroke();
  ctx.restore();

  // correas cruzadas y cinturon con hebilla
  ctx.lineCap = "round";
  ctx.strokeStyle = "#2b0a08"; ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(-19, -10); ctx.lineTo(7, 16);
  ctx.moveTo(19, -10); ctx.lineTo(-7, 16);
  ctx.stroke();
  ctx.lineWidth = 3.4;
  ctx.beginPath(); ctx.moveTo(-10.5, 14.5); ctx.lineTo(10.5, 14.5); ctx.stroke();
  ctx.fillStyle = "#b9c0c8"; ctx.strokeStyle = "#69737d"; ctx.lineWidth = 0.8;
  ctx.fillRect(-2.4, 12.6, 4.8, 3.8); ctx.strokeRect(-2.4, 12.6, 4.8, 3.8);

  // hombreras con puas
  for (const side of [-1, 1]) {
    ctx.fillStyle = "#b9c0c8"; ctx.strokeStyle = "#000"; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(side * 29, -15); ctx.lineTo(side * 34, -24); ctx.lineTo(side * 24, -17);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(side * 25, -11, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#5a0f0c"; ctx.fill();
    ctx.lineWidth = 2.4; ctx.strokeStyle = "#000"; ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = "#ff5a45"; ctx.stroke();
  }

  // cuernos
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.beginPath();
    ctx.moveTo(6, -20);
    ctx.bezierCurveTo(11, -21, 14, -25, 13, -31);
    ctx.bezierCurveTo(10, -26, 7, -25, 4, -24);
    ctx.closePath();
    ctx.fillStyle = "#e8dcc0"; ctx.fill();
    ctx.lineWidth = 1.4; ctx.strokeStyle = "#000"; ctx.stroke();
    ctx.restore();
  }

  // cabeza / casco
  ctx.beginPath(); ctx.arc(0, -14, 8.4, 0, Math.PI * 2);
  ctx.fillStyle = "#5a0f0c"; ctx.fill();
  ctx.lineWidth = 2.4; ctx.strokeStyle = "#000"; ctx.stroke();
  ctx.lineWidth = 1; ctx.strokeStyle = "#ff5a45"; ctx.stroke();
  ctx.fillStyle = "#140b07";
  ctx.beginPath();
  ctx.moveTo(-6.4, -14.6);
  ctx.quadraticCurveTo(0, -11, 6.4, -14.6);
  ctx.lineTo(5.6, -8.5);
  ctx.quadraticCurveTo(0, -6.2, -5.6, -8.5);
  ctx.closePath(); ctx.fill();

  // ojos malignos (inclinados hacia adentro, con brillo)
  ctx.save();
  ctx.shadowBlur = 6; ctx.shadowColor = "#ff3b2f";
  ctx.fillStyle = "#ff3b2f";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 6, -14.6); ctx.lineTo(side * 0.9, -12.2);
    ctx.lineTo(side * 1.6, -10.8); ctx.lineTo(side * 5.6, -12.4);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  // ceno fruncido y colmillos
  ctx.strokeStyle = "#140b07"; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-7, -16.8); ctx.lineTo(-0.6, -13.4);
  ctx.moveTo(7, -16.8); ctx.lineTo(0.6, -13.4);
  ctx.stroke();
  ctx.strokeStyle = "#e8dcc0"; ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-3.8, -9.6); ctx.lineTo(-2.6, -8.2); ctx.lineTo(-1.4, -9.6);
  ctx.lineTo(0, -8.2); ctx.lineTo(1.4, -9.6); ctx.lineTo(2.6, -8.2); ctx.lineTo(3.8, -9.6);
  ctx.stroke();
}

function drawPlayer(p) {
  // Esquiva del mago (parpadeo arcano): mientras se desplaza desaparece por completo (sensacion de
  // teletransporte); solo se ven los anillos violeta y las particulas, que se dibujan aparte.
  if (p.dashFx === "blink" && p.dashTime > 0) return;

  // invuln blink
  if (p.inv > 0 && Math.floor(p.inv * 20) % 2 === 0) ctx.globalAlpha = 0.5;

  const ang = Math.atan2(p.aimY, p.aimX);

  // Cuerpo segun la clase elegida (bow = Arquero, staff = Maga, axe = Barbaro).
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(p.r / 20, p.r / 20);
  if (state.weaponId === "bow") drawBodyArcher();
  else if (state.weaponId === "staff") drawBodyMage();
  else drawBodyBarbarian();
  ctx.restore();

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

  // Esquiva del mago: al reaparecer parpadea en violeta unos instantes
  if (p.dashFx === "blink" && p.blinkArrive > 0 && Math.floor(p.blinkArrive * 20) % 2 === 0) {
    ctx.save();
    ctx.shadowBlur = 26; ctx.shadowColor = "#bd8cff";
    ctx.fillStyle = "rgba(215,165,255,0.9)";
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- Sangrado
// Aplica (o renueva) el sangrado a un enemigo o jefe: BLEED_TICKS ticks, uno cada
// BLEED_TICK_INTERVAL s, de `tickDmg` cada uno. Si el objetivo YA sangraba, al renovar se le
// inflige de golpe BLEED_REAPPLY_RATIO (50 %) del dano que le quedaba por sangrar (ticks restantes x
// dano por tick del sangrado anterior) y despues empieza un sangrado nuevo completo. No se apila.
// Ej.: con 4 s restantes (8 ticks de 50 % del dano) quedaban 400 % -> el golpe extra es 200 %.
// Excepcion: si el sangrado que ya tiene viene del MISMO lanzamiento (attackId igual: las 3 hachas de una misma
// Hacha arrojadiza), no hay golpe instantaneo ni renovacion; solo cuenta entre lanzamientos distintos.
// La muerte por este dano instantaneo la resuelve quien llama (killEnemy / killBoss).
var bleedAttackSeq = 0; // contador de lanzamientos de Hacha arrojadiza (cada lanzamiento = un attackId)
function applyBleed(target, tickDmg, skill, attackId) {
  if (!target || target.hp <= 0 || !(tickDmg > 0)) return;
  const b = target.bleed;
  if (b) {
    // Otra hacha del MISMO lanzamiento: el sangrado ya esta aplicado por este ataque, sin golpe instantaneo ni renovacion.
    if (attackId && b.attackId === attackId) return;
    const burst = b.ticks * b.dmg * BLEED_REAPPLY_RATIO;
    if (burst > 0) {
      logDamage(b.skill, target.hp, burst);
      target.hp -= burst;
      floatText(target.x + rand(-8, 8), target.y - target.r - 14, "-" + Math.round(burst) + " \u{1FA78}", "#ff3a4a");
    }
    b.ticks = BLEED_TICKS; b.dmg = tickDmg; b.skill = skill; b.attackId = attackId || 0;
  }
  else target.bleed = { ticks: BLEED_TICKS, next: BLEED_TICK_INTERVAL, dmg: tickDmg, skill, attackId: attackId || 0 };
}

// Avanza el sangrado de todos los enemigos y del jefe. Los ticks no hacen critico.
function updateBleeding(dt) {
  const tick = (t, isBoss) => {
    const b = t.bleed;
    if (!b) return;
    if (t.hp <= 0) { t.bleed = null; return; }
    b.next -= dt;
    while (b.next <= 0 && b.ticks > 0 && t.hp > 0) {
      b.next += BLEED_TICK_INTERVAL;
      b.ticks--;
      logDamage(b.skill, t.hp, b.dmg);
      t.hp -= b.dmg;
      floatText(t.x + rand(-8, 8), t.y - t.r - 4, "-" + Math.round(b.dmg), "#ff3a4a");
      if (t.hp <= 0) { if (isBoss) killBoss(t); else killEnemy(t); }
    }
    if (b.ticks <= 0 || t.hp <= 0) t.bleed = null;
  };
  for (const e of state.enemies.slice()) tick(e, false);
  for (const bs of state.bosses.slice()) tick(bs, true);
}

// Latido rojo discreto sobre quien sangra: doble pulso ("lub-dub") sincronizado con cada tick.
function drawBleedPulse(t) {
  const b = t.bleed;
  if (!b) return;
  const phase = Math.max(0, Math.min(1, 1 - b.next / BLEED_TICK_INTERVAL)); // 0 = recien hubo tick
  const bump = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
  const beat = Math.max(bump(phase, 0.04, 0.09), 0.6 * bump(phase, 0.34, 0.08));
  ctx.save();
  ctx.shadowBlur = 8 + beat * 10; ctx.shadowColor = "#ff1a2a";
  ctx.fillStyle = "rgba(190,0,20," + (0.05 + 0.17 * beat).toFixed(3) + ")";
  ctx.beginPath(); ctx.arc(t.x, t.y, t.r + 1 + beat * 3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(255,45,55," + (0.22 + 0.5 * beat).toFixed(3) + ")";
  ctx.lineWidth = 1.5 + beat * 1.5;
  ctx.beginPath(); ctx.arc(t.x, t.y, t.r + 3 + beat * 5, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// Hacha arrojadiza en vuelo: disco de 50 px (r = b.r) con un hacha doble que gira.
function drawThrownAxe(b) {
  const k = b.r / 25;                 // escala respecto al tamano base (r = 25)
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.shadowBlur = 16; ctx.shadowColor = "#ff3a1a";
  ctx.fillStyle = "rgba(255,118,89,0.22)";
  ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(255,208,189,0.75)"; ctx.lineWidth = 2; ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.rotate(b.life * 22);            // giro segun el tiempo de vida restante
  ctx.scale(k, k);
  ctx.lineCap = "round"; ctx.lineJoin = "miter";
  for (let n = 0; n < 2; n++) {
    ctx.strokeStyle = "#8a5a2a"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(15, 0); ctx.stroke();
    ctx.fillStyle = "#b9c0c8"; ctx.strokeStyle = "#69737d"; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(10, -3); ctx.lineTo(15, -12); ctx.lineTo(22, -10);
    ctx.lineTo(19, 0); ctx.lineTo(22, 10); ctx.lineTo(15, 12); ctx.lineTo(10, 3);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.rotate(Math.PI);
  }
  ctx.restore();
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
