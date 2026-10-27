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

// Habilidad de los bichos (imp rojo, hound violeta y brute: la estrella grande roja): cada 1 s tiran un dado;
// si sale, brillan en blanco (sin sonido) y reaparecen en el lado opuesto del jugador,
// en la misma direccion: el jugador queda como punto medio entre la posicion vieja y la nueva.
var TP_INTERVAL = 1;      // segundos entre cada tirada
var TP_CHANCE = 0.03;     // base: probabilidad real = (bichos en pantalla / bichos por tanda) * TP_CHANCE
var TP_CROWD_RADIUS = 50; // radio (px, centro a centro) para contar vecinos del tamano de un imp (r=15)
var TP_CROWD_BONUS = 0.10; // +10% por cada bicho dentro de ese radio
function tpChance(e) {
  const b = state.batchSize || 1;
  let near = 0;
  // las estrellas grandes (brute, jefe...) cuentan tambien: su radio se suma al alcance
  const count = (o) => {
    if (!o || o === e || o.hp <= 0) return;
    const reach = TP_CROWD_RADIUS + Math.max(0, o.r - 15);
    const dx = o.x - e.x, dy = o.y - e.y;
    if (dx * dx + dy * dy <= reach * reach) near++;
  };
  for (const o of state.enemies) count(o);
  for (const bs of state.bosses) count(bs);
  return Math.min(1, (state.alive / b) * TP_CHANCE + near * TP_CROWD_BONUS);
}
var TP_CHARGE_TIME = 0.45; // segundos que brilla en blanco antes de desaparecer
var TP_ARRIVE_TIME = 0.4;  // segundos que parpadea en blanco al reaparecer, sin hacer dano
var TP_MIN_DIST = 100;    // si esta mas cerca que esto no se teletransporta (seria inutil)

// ---------------------------------------------------------------- Trio dispersante (dorado = bomber, azul = caster)
// Si 3 bichos dorados/azules (en cualquier mezcla) se juntan dentro de TRIO_RADIUS px, hacen un efecto con sonido
// (TRIO_CHARGE s) y despues 2 de ellos recorren una circunferencia con el jugador como centro: uno 120 grados en sentido
// horario y el otro 120 grados en sentido antihorario. El tercero se queda en su sitio, asi los tres quedan repartidos
// a 120 grados alrededor del jugador (cada uno conserva su distancia). Luego tienen TRIO_COOLDOWN s sin volver a hacerlo.
var TRIO_RADIUS = 75;        // px (centro a centro) para que cuenten como juntos
var TRIO_CHARGE = 0.6;       // s de aviso (brillo + sonido) antes de dispersarse
var TRIO_MOVE = 0.9;         // s que tardan en recorrer el arco
var TRIO_ARC = Math.PI * 2 / 3; // 120 grados
var TRIO_COOLDOWN = 0;       // s antes de que esos bichos puedan formar otro trio (0 = sin enfriamiento)
var TRIO_RETREAT = 150;      // px que retroceden (se alejan del jugador) mientras se dispersan
var TRIO_MIN_R = 110;        // distancia minima al jugador durante el arco (evita que pasen encima de el)

function isTrioType(e) { return e.type === "bomber" || e.type === "caster"; }

function trioSnd(kind, x, y) {
  const p = state.player;
  const v = clamp(1 - Math.hypot(x - p.x, y - p.y) / 900, 0.35, 1);
  Sound[kind](v);
}

function updateTrios(dt) {
  const p = state.player;
  if (!state.trios) state.trios = [];
  const alive = (m) => m.hp > 0 && state.enemies.indexOf(m) >= 0;

  // enfriamiento
  for (const e of state.enemies) if (e.trioCd > 0) e.trioCd -= dt;

  // ---- avanzar los trios activos ----
  for (const g of state.trios) {
    if (g.done) continue;
    if (!g.members.every(alive)) {        // si muere alguno, se cancela
      g.done = true;
      for (const m of g.members) { m.trio = null; if (alive(m)) m.trioCd = 2; }
      continue;
    }
    g.t += dt;
    if (g.phase === "charge") {
      if (Math.random() < dt * 40) {      // chispas que convergen al centro del trio
        const m = g.members[(Math.random() * 3) | 0];
        const a = rand(0, Math.PI * 2), d0 = rand(26, 44);
        state.particles.push({ x: m.x + Math.cos(a) * d0, y: m.y + Math.sin(a) * d0, vx: -Math.cos(a) * 60, vy: -Math.sin(a) * 60, life: 0.3, r: rand(2, 4), color: Math.random() < 0.5 ? "#ffd24a" : "#7fb3ff" });
      }
      if (g.t >= TRIO_CHARGE) {
        g.phase = "move"; g.t = 0;
        // el que se queda (stay) fija el angulo de referencia; los otros van a +120 / -120 de el
        const ref = g.members[0];
        const aRef = Math.atan2(ref.y - p.y, ref.x - p.x);
        g.members.forEach((m, i) => {
          m.trio.a0 = Math.atan2(m.y - p.y, m.x - p.x);
          m.trio.R = Math.max(Math.hypot(m.x - p.x, m.y - p.y), TRIO_MIN_R);
          if (i === 0) { m.trio.sweep = 0; return; }
          const TAU = Math.PI * 2;
          const target = aRef + (m.trio.dir > 0 ? TRIO_ARC : -TRIO_ARC);
          let d = (target - m.trio.a0) % TAU;               // diferencia en el sentido pedido
          if (m.trio.dir > 0) { if (d < 0) d += TAU; } else { if (d > 0) d -= TAU; }
          m.trio.sweep = d;
        });
        g.burst = 0.45;
        state.shake = Math.max(state.shake, 6);
        trioSnd("trioBurst", ref.x, ref.y);
        floatText(ref.x, ref.y - 34, "\u00a1TR\u00cdO!", "#ffd24a");
      }
    } else { // move
      const k = clamp(g.t / TRIO_MOVE, 0, 1);
      const ease = k * k * (3 - 2 * k);
      g.members.forEach(m => {
        const a = m.trio.a0 + m.trio.sweep * ease;       // el que se queda (sweep 0) conserva su angulo
        const R = m.trio.R + TRIO_RETREAT * ease;        // y todos retroceden TRIO_RETREAT px alejandose del jugador
        m.x = clamp(p.x + Math.cos(a) * R, WALL + m.r, WORLD.w - WALL - m.r);
        m.y = clamp(p.y + Math.sin(a) * R, WALL + m.r, WORLD.h - WALL - m.r);
        state.particles.push({ x: m.x, y: m.y, vx: rand(-25, 25), vy: rand(-25, 25), life: 0.3, r: rand(3, 5), color: m.type === "bomber" ? "#ffd24a" : "#7fb3ff" });
      });
      if (g.burst > 0) g.burst -= dt;
      if (k >= 1) {
        g.done = true;
        for (const m of g.members) { m.trio = null; m.trioCd = TRIO_COOLDOWN; }
      }
    }
  }
  state.trios = state.trios.filter(g => !g.done);

  // ---- detectar trios nuevos ----
  const cand = state.enemies.filter(e => isTrioType(e) && e.hp > 0 && !e.trio && !(e.trioCd > 0) && !(e.tpCharge > 0));
  if (cand.length < 3) return;
  const used = new Set();
  const r2 = TRIO_RADIUS * TRIO_RADIUS;
  for (const e of cand) {
    if (used.has(e)) continue;
    const near = [];
    for (const o of cand) {
      if (o === e || used.has(o)) continue;
      const dx = o.x - e.x, dy = o.y - e.y, d2 = dx * dx + dy * dy;
      if (d2 <= r2) near.push({ o, d2 });
    }
    if (near.length < 2) continue;
    near.sort((a, b) => a.d2 - b.d2);
    const members = [e, near[0].o, near[1].o];
    const dirs = Math.random() < 0.5 ? [1, -1] : [-1, 1];   // quien va en horario / antihorario
    members.forEach((m, i) => { used.add(m); m.trio = { dir: i === 0 ? 0 : dirs[i - 1], a0: 0, R: 0, sweep: 0 }; });
    state.trios.push({ members, phase: "charge", t: 0, burst: 0, done: false });
    trioSnd("trioCharge", e.x, e.y);
  }
}

// Efectos del trio por debajo de los bichos: lineas de union durante la carga, onda y guia del arco al dispersarse
function drawTrios() {
  if (!state.trios || !state.trios.length) return;
  const p = state.player;
  for (const g of state.trios) {
    if (g.done) continue;
    const [A, B, C] = g.members;
    ctx.save();
    if (g.phase === "charge") {
      const k = clamp(g.t / TRIO_CHARGE, 0, 1);
      const pulse = 0.5 + 0.5 * Math.sin(g.t * 30);
      ctx.lineWidth = 2 + k * 2;
      ctx.strokeStyle = "rgba(255,230,140," + (0.35 + 0.4 * pulse) + ")";
      ctx.shadowBlur = 14; ctx.shadowColor = "#ffd24a";
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(C.x, C.y); ctx.closePath(); ctx.stroke();
      for (const m of g.members) {
        ctx.strokeStyle = m.type === "bomber" ? "rgba(255,210,74,0.9)" : "rgba(127,179,255,0.9)";
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r + 6 + (1 - k) * 16, 0, Math.PI * 2); ctx.stroke();
      }
    } else {
      // guia del arco que recorre cada uno (horario / antihorario) con el jugador de centro
      const k = clamp(g.t / TRIO_MOVE, 0, 1);
      ctx.globalAlpha = 0.55 * (1 - k * 0.6);
      ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
      for (const m of g.members) {
        if (!m.trio || !m.trio.sweep) continue;
        ctx.strokeStyle = m.trio.dir > 0 ? "#ffd24a" : "#7fb3ff";
        ctx.beginPath();
        ctx.arc(p.x, p.y, m.trio.R + TRIO_RETREAT * k * k * (3 - 2 * k), m.trio.a0, m.trio.a0 + m.trio.sweep, m.trio.sweep < 0);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // onda de choque en el punto de partida
      if (g.burst > 0) {
        const b = 1 - g.burst / 0.45;
        ctx.globalAlpha = 1 - b;
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 4;
        ctx.shadowBlur = 20; ctx.shadowColor = "#ffd24a";
        ctx.beginPath(); ctx.arc(A.x, A.y, 20 + b * 110, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- Trio de jefes (Desafio final)
// Misma habilidad que el trio dorado/azul, para los 3 jefes del Desafio final (constantes BOSS_TRIO_* en jefes.js).
// Si los 3 estan juntos (todos a <= BOSS_TRIO_RADIUS entre si) avisan BOSS_TRIO_CHARGE s y despues 2 de ellos recorren
// 120 grados con el jugador de centro (uno horario y otro antihorario); el tercero se queda. Quedan repartidos a 120
// grados alrededor del jugador, cada uno conservando su distancia. Mientras dura (aviso + arco) no atacan ni avanzan.
function updateBossTrio(dt) {
  const p = state.player;
  const alive = (m) => m.hp > 0 && state.bosses.indexOf(m) >= 0;
  for (const b of state.bosses) if (b.trioCd > 0) b.trioCd -= dt;

  const g = state.bossTrio;
  if (g) {
    if (!g.members.every(alive)) {          // si cae alguno, se cancela
      for (const m of g.members) { m.trio = null; if (alive(m)) m.trioCd = 2; }
      state.bossTrio = null;
      return;
    }
    g.t += dt;
    if (g.phase === "charge") {
      if (Math.random() < dt * 60) {        // chispas del color de cada jefe que convergen hacia el
        const m = g.members[(Math.random() * 3) | 0];
        const a = rand(0, Math.PI * 2), d0 = rand(m.r + 8, m.r + 50);
        state.particles.push({ x: m.x + Math.cos(a) * d0, y: m.y + Math.sin(a) * d0, vx: -Math.cos(a) * 90, vy: -Math.sin(a) * 90, life: 0.35, r: rand(3, 6), color: m.def.glow || "#ffd24a" });
      }
      if (g.t >= BOSS_TRIO_CHARGE) {
        g.phase = "move"; g.t = 0;
        const ref = g.members[0];           // el que se queda fija el angulo de referencia; los otros van a +120 / -120
        const aRef = Math.atan2(ref.y - p.y, ref.x - p.x);
        const TAU = Math.PI * 2;
        g.members.forEach((m, i) => {
          m.trio.a0 = Math.atan2(m.y - p.y, m.x - p.x);
          m.trio.R = Math.max(Math.hypot(m.x - p.x, m.y - p.y), BOSS_TRIO_MIN_R);
          if (i === 0) { m.trio.sweep = 0; return; }
          const target = aRef + (m.trio.dir > 0 ? TRIO_ARC : -TRIO_ARC);
          let d = (target - m.trio.a0) % TAU;               // diferencia en el sentido pedido
          if (m.trio.dir > 0) { if (d < 0) d += TAU; } else { if (d > 0) d -= TAU; }
          m.trio.sweep = d;
        });
        g.burst = 0.5;
        state.shake = Math.max(state.shake, 12);
        trioSnd("trioBurst", ref.x, ref.y);
        floatText(ref.x, ref.y - ref.r - 20, "\u00a1TR\u00cdO ABISAL!", "#ffffff");
      }
    } else { // move
      const k = clamp(g.t / BOSS_TRIO_MOVE, 0, 1);
      const ease = k * k * (3 - 2 * k);
      g.members.forEach(m => {
        const a = m.trio.a0 + m.trio.sweep * ease;       // el que se queda (sweep 0) conserva su angulo
        const R = m.trio.R + BOSS_TRIO_RETREAT * ease;   // y todos retroceden BOSS_TRIO_RETREAT px alejandose del jugador
        m.x = clamp(p.x + Math.cos(a) * R, WALL + m.r, WORLD.w - WALL - m.r);
        m.y = clamp(p.y + Math.sin(a) * R, WALL + m.r, WORLD.h - WALL - m.r);
        state.particles.push({ x: m.x + rand(-m.r, m.r) * 0.6, y: m.y + rand(-m.r, m.r) * 0.6, vx: rand(-30, 30), vy: rand(-30, 30), life: 0.35, r: rand(4, 8), color: m.def.glow || "#ffd24a" });
      });
      if (g.burst > 0) g.burst -= dt;
      if (k >= 1) {
        for (const m of g.members) { m.trio = null; m.trioCd = BOSS_TRIO_COOLDOWN; }
        state.bossTrio = null;
      }
    }
    return;
  }

  // ---- detectar el trio: solo en el Desafio final, con los 3 jefes vivos, libres (sin saltar ni cargar rayo) y juntos ----
  if (!state.finalChallenge || state.bosses.length !== BOSS_FINAL_COUNT) return;
  const bs = state.bosses;
  if (!bs.every(b => b.isFinal && b.hp > 0 && !(b.trioCd > 0) && !(b.leaping > 0) && !(b.beamLock > 0))) return;
  const r2 = BOSS_TRIO_RADIUS * BOSS_TRIO_RADIUS;
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    if (dist2(bs[i].x, bs[i].y, bs[j].x, bs[j].y) > r2) return;
  }
  const members = bs.slice();
  const si = (Math.random() * members.length) | 0;           // cual se queda en su sitio: al azar
  const t0 = members[0]; members[0] = members[si]; members[si] = t0;
  const dirs = Math.random() < 0.5 ? [1, -1] : [-1, 1];      // quien va en horario / antihorario
  members.forEach((m, i) => { m.trio = { dir: i === 0 ? 0 : dirs[i - 1], a0: 0, R: 0, sweep: 0 }; });
  state.bossTrio = { members, phase: "charge", t: 0, burst: 0 };
  trioSnd("trioCharge", members[0].x, members[0].y);
}

// Efectos del trio de jefes bajo los sprites: union y auras durante el aviso, y arcos + onda al moverse
function drawBossTrio() {
  const g = state.bossTrio;
  if (!g) return;
  const p = state.player;
  const [A, B, C] = g.members;
  ctx.save();
  if (g.phase === "charge") {
    const k = clamp(g.t / BOSS_TRIO_CHARGE, 0, 1);
    const pulse = 0.5 + 0.5 * Math.sin(g.t * 30);
    ctx.lineWidth = 3 + k * 3;
    ctx.strokeStyle = "rgba(255,255,255," + (0.3 + 0.4 * pulse) + ")";
    ctx.shadowBlur = 18; ctx.shadowColor = "#ffffff";
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(C.x, C.y); ctx.closePath(); ctx.stroke();
    for (const m of g.members) {
      const col = m.def.glow || "#ffd24a";
      ctx.strokeStyle = col; ctx.shadowColor = col;
      ctx.globalAlpha = 0.6 + 0.4 * pulse;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r + 12 + (1 - k) * 34, 0, Math.PI * 2); ctx.stroke();
    }
  } else {
    // guia del arco que recorre cada uno (horario / antihorario) con el jugador de centro
    const k = clamp(g.t / BOSS_TRIO_MOVE, 0, 1);
    ctx.globalAlpha = 0.6 * (1 - k * 0.6);
    ctx.lineWidth = 5; ctx.setLineDash([14, 10]);
    for (const m of g.members) {
      if (!m.trio || !m.trio.sweep) continue;
      const col = m.def.glow || "#ffd24a";
      ctx.strokeStyle = col; ctx.shadowBlur = 16; ctx.shadowColor = col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, m.trio.R + BOSS_TRIO_RETREAT * k * k * (3 - 2 * k), m.trio.a0, m.trio.a0 + m.trio.sweep, m.trio.sweep < 0);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // onda de choque en el jefe que se queda
    if (g.burst > 0) {
      const b = 1 - g.burst / 0.5;
      ctx.globalAlpha = 1 - b;
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 5;
      ctx.shadowBlur = 24; ctx.shadowColor = A.def.glow || "#ffd24a";
      ctx.beginPath(); ctx.arc(A.x, A.y, A.r + b * 200, 0, Math.PI * 2); ctx.stroke();
    }
  }
  ctx.restore();
}

function separateEnemies() {
  const list = state.enemies;
  const n = list.length;
  if (n < 2 && state.bosses.length === 0) return;
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
  for (const boss of state.bosses) {
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

// +20 % a las brasas que sueltan los enemigos normales. Como cada drop es un entero pequeno (1-2),
// el valor se redondea al azar (p. ej. 1,2 = 1 con 80 % y 2 con 20 %), asi el promedio sube exactamente lo indicado.
var ENEMY_ASH_MULT = 1.2;
function scaledAshDrop(n) {
  const v = n * ENEMY_ASH_MULT, base = Math.floor(v);
  return base + (Math.random() < v - base ? 1 : 0);
}

var ENEMY_DMG_MULT = 1.3; // +30% to every damage source of the enemies (contact, projectiles, bombs, boss)
var ENEMY_SCALE_END = 50;    // oleada en la que se alcanzan los multiplicadores finales
// Dificultades (se elige en el menu antes de jugar). Para los bichos normales, hpEnd / dmgEnd son los multiplicadores
// totales de vida y dano en la oleada ENEMY_SCALE_END (escala lineal desde x1 en la oleada 1; sin contar ENEMY_DMG_MULT).
// bossHp multiplica la vida de TODOS los jefes (los de oleada y los del Desafio final).
// bossDmgK escala el multiplicador de dano propio de cada jefe (BOSS_DMG_MULT / BOSS_FINAL_DMG_MULT en jefes.js):
// 1 = el multiplicador entero, 0.5 = la mitad de ese multiplicador, 0 = sin multiplicador (x1).
var DIFFICULTIES = {
  easy:   { name: "Fácil",   hpEnd: 1,  dmgEnd: 1, bossHp: 0.5, bossDmgK: 0 },    // bichos sin multiplicador; jefes -50 % vida y sin multiplicador de dano
  normal: { name: "Normal",  hpEnd: 5,  dmgEnd: 3, bossHp: 0.7, bossDmgK: 0.5 },  // bichos x5 vida y x3 dano; jefes -30 % vida y mitad del multiplicador de dano
  hard:   { name: "Difícil", hpEnd: 15, dmgEnd: 5, bossHp: 1,   bossDmgK: 1 },    // la dificultad original
};
function currentDifficulty() {
  return DIFFICULTIES[(typeof state !== "undefined" && state && state.difficulty) || "hard"] || DIFFICULTIES.hard;
}
function bossHpFor(baseHp) { return Math.round(baseHp * currentDifficulty().bossHp); }
function bossDmgMultFor(m) { const k = currentDifficulty().bossDmgK; return k === 0 ? 1 : m * k; }

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
  // Escalado lineal: x1 en la oleada 1 y x(ENEMY_*_END) en la oleada ENEMY_SCALE_END (despues sigue con la misma pendiente).
  const lin = (w - 1) / (ENEMY_SCALE_END - 1);
  const diff = currentDifficulty();
  const hpScale = 1 + (diff.hpEnd - 1) * lin;
  const dmgScale = (1 + (diff.dmgEnd - 1) * lin) * ENEMY_DMG_MULT;
  const spdScale = 1 + Math.min(1.1, (w - 1) * 0.03);

  // Weighted type pool. New types unlock progressively so early waves stay simple:
  //  leaper (jumps at you), caster (shoots dodgeable projectiles), bomber (telegraphed AoE).
  const pool = [];
  pool.push(["imp", 50]);
  pool.push(["hound", 22 + Math.min(14, w)]);
  if (w >= 3) pool.push(["brute", Math.min(22, 4 + w)]);
  if (w >= 4) pool.push(["leaper", Math.min(20, 3 + w)]);
  // El dorado (bomber, areas) aparece desde la oleada 6 y el azul (caster, proyectiles) desde la 8.
  if (w >= 6) pool.push(["bomber", Math.min(18, 2 + w)]);
  if (w >= 8) pool.push(["caster", Math.min(16, 2 + w)]);
  let total = 0; for (const t of pool) total += t[1];
  let r = Math.random() * total, type = "imp";
  for (const t of pool) { r -= t[1]; if (r <= 0) { type = t[0]; break; } }

  let e = { x, y, type, flash: 0, id_: ++enemySeq };
  if (type === "imp") {
    e.r = 15; e.speed = rand(70, 95) * spdScale;
    e.hp = e.maxHp = 24 * hpScale; e.dmg = 9 * dmgScale; e.xp = 10 + w; e.ashChance = 0.35; e.color = "#c0392b";
    e.tpTimer = rand(0, TP_INTERVAL); e.tpCharge = 0; e.tpArrive = 0; // teletransporte
  } else if (type === "hound") {
    e.r = 13; e.speed = rand(120, 150) * spdScale;
    e.hp = e.maxHp = 16 * hpScale; e.dmg = 7 * dmgScale; e.xp = 8 + w; e.ashChance = 0.3; e.color = "#8e44ad";
    e.tpTimer = rand(0, TP_INTERVAL); e.tpCharge = 0; e.tpArrive = 0; // teletransporte
  } else if (type === "brute") {
    e.r = 26; e.speed = rand(45, 60) * (1 + Math.min(0.5, (w - 1) * 0.02));
    e.hp = e.maxHp = 90 * hpScale; e.dmg = 20 * dmgScale; e.xp = 35 + w * 2; e.ashChance = 0.8; e.color = "#7a1d1d";
    e.tpTimer = rand(0, TP_INTERVAL); e.tpCharge = 0; e.tpArrive = 0; // teletransporte
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

// Desafio final: tras la pausa de la oleada BOSS_FINAL_WAVE aparecen los BOSS_FINAL_COUNT jefes de BOSS_FINAL_ROSTER,
// todos a la vez y sin enemigos normales. Se gana al derrotarlos a todos.
function startFinalChallenge() {
  const defs = pickFinalBosses();
  state.finalChallenge = true;
  state.phase = "fighting";
  state.enemies = []; state.bossBullets = []; state.aoes = []; state.beams = [];
  state.toSpawn = 0; state.alive = 0; state.waveQuota = 0; state.waveTotal = 0; state.batchSize = 1; state.batchesSpawned = 1;
  state.finalBossList = [];
  const a0 = rand(0, Math.PI * 2);
  defs.forEach((d, i) => spawnBoss(d, i + 1, defs.length, a0 + i * (Math.PI * 2 / defs.length)));
  showWarning("\u00a1DESAF\u00cdO FINAL!<br><span style='color:#ff3a1a;font-size:20px'>" + defs.map(d => d.name).join(" \u00b7 ") + "</span><br><span style='font-size:16px'>" + bossHpFor(BOSS_FINAL_HP).toLocaleString("es") + " de vida cada uno</span>");
  floatText(state.player.x, state.player.y - 56, "DESAF\u00cdO FINAL", "#ff5050");
  state.shake = 24;
  updateHud();
}

function spawnBoss(forcedDef, finalIdx, finalTotal, angle) {
  const p = state.player;
  const ang = angle !== undefined ? angle : rand(0, Math.PI * 2);
  let x = clamp(p.x + Math.cos(ang) * 600, 80, WORLD.w - 80);
  let y = clamp(p.y + Math.sin(ang) * 600, 80, WORLD.h - 80);
  const w = state.wave;

  const hasLeap  = w >= 20; // Oleada 20+: salto aplastante
  const hasBombs = w >= 30; // Oleada 30+: lluvia de AoEs multiples
  const hasBeam  = w >= 30; // Oleada 30+: rayo en linea recta (aviso + disparo)

  const isFinal = !!forcedDef;
  const def = forcedDef || bossForWave(w);
  const bossHp = bossHpFor(isFinal ? BOSS_FINAL_HP : def.hp);
  let title = "\u00a1" + def.name + "<br>ha despertado!";
  if (isFinal) title = "\u00a1DESAFÍO FINAL " + finalIdx + "/" + finalTotal + "!<br><span style='color:" + (def.glow || "#ff3a1a") + ";font-size:20px'>" + def.name + " \u2014 " + bossHp.toLocaleString("es") + " de vida</span>";
  else if (hasLeap && hasBombs) title = "\u00a1" + def.name + "<br><span style='color:#ff9d4d;font-size:18px'>\u2014 Salto, lluvia de fuego y rayo \u2014</span>";
  else if (hasLeap)             title = "\u00a1" + def.name + "<br><span style='color:#6affa0;font-size:18px'>\u2014 Salto aplastante \u2014</span>";

  const boss = {
    x, y,
    r: 48 + (hasLeap ? 4 : 0) + (hasBombs ? 4 : 0),
    type: "boss", def, isFinal, finalIdx, finalTotal,
    name: def.name,
    speed: 85 + Math.min(40, w),
    hp: bossHp, maxHp: bossHp, // vida propia de cada jefe (ver BOSS_ROSTER en jefes.js)
    dmg: 26 * (1 + (w - 1) * 0.05) * ENEMY_DMG_MULT * bossDmgMultFor(isFinal ? BOSS_FINAL_DMG_MULT : (BOSS_DMG_MULT[def.id] || 1)),
    xp: 600 + w * 20, flash: 0,
    color: (hasLeap && hasBombs) ? "#6a0a3a" : (hasBombs ? "#7a1a08" : "#8a0f2a"),
    shootCd: 2, phase: 0,
    hasLeap,
    leapCd: hasLeap ? rand(4.5, 6.5) : Infinity,
    leaping: 0, lvx: 0, lvy: 0,
    hasBombs,
    bombRainCd: hasBombs ? rand(6.0, 9.0) : Infinity,
    hasBeam,
    beamCd: hasBeam ? rand(4.0, 6.0) : Infinity,
    beamLock: 0,
    trio: null,                         // estado del trio de jefes (solo Desafio final)
    trioCd: isFinal ? 4 : Infinity,     // enfriamiento del trio
  };
  state.bosses.push(boss);
  if (isFinal) state.finalBossList.push(boss);
  state.boss = state.bosses[0] || null;
  bossNameEl.textContent = boss.name;
  bossWrap.style.display = "block";
  if (!isFinal) { showWarning(title); state.shake = 18; }
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
    const amt = scaledAshDrop(e.type === "brute" ? randInt(3, 6) : randInt(1, 3));
    state.orbs.push({ x: e.x + rand(-10, 10), y: e.y + rand(-10, 10), r: 8, kind: "ash", val: amt, vx: rand(-40, 40), vy: rand(-40, 40) });
  }
}

function killBoss(boss) {
  if (boss.dead) return;
  boss.dead = true;
  state.bosses = state.bosses.filter(b => b !== boss);
  state.beams = state.beams.filter(z => z.owner !== boss);
  state.boss = state.bosses[0] || null;
  state.bossDefeated = true;
  state.bossesDown++;
  state.kills++;
  state.score += 1500;
  state.ash += 40;
  if (state.bosses.length === 0) bossWrap.style.display = "none";
  spawnChest(boss.x, boss.y);
  floatText(boss.x, boss.y - 60, "¡Cofre del jefe!", "#ffd84d");
  showWarning(boss.isFinal && state.bosses.length > 0 ? "¡" + boss.def.name + "<br>derrotado!<br><span style='font-size:16px'>Quedan " + state.bosses.length + "</span>" : "¡" + boss.def.name + "<br>derrotado!");
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
  // Desafio final: al caer el ultimo jefe, victoria tras una breve pausa para ver la explosion
  if (boss.isFinal && state.bosses.length === 0) {
    state.victory = true;
    state.victoryDelay = 3;
    state.enemies = []; state.bossBullets = []; state.aoes = []; state.beams = []; state.toSpawn = 0; state.alive = 0;
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
  // cargando el teletransporte: brilla en blanco (pulso rapido)
  if (e.tpCharge > 0) {
    const k = 1 - e.tpCharge / TP_CHARGE_TIME; // 0 -> 1 mientras carga
    ctx.shadowBlur = 22 + k * 22; ctx.shadowColor = "#fff";
    ctx.fillStyle = "rgba(255,255,255," + (0.55 + 0.45 * k) + ")";
    ctx.fill();
  }
  // recien reaparecido: parpadea en blanco (inofensivo)
  if (e.tpArrive > 0 && Math.floor(e.tpArrive * 20) % 2 === 0) {
    ctx.shadowBlur = 26; ctx.shadowColor = "#fff";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fill();
  }
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

// Rayo del jefe: durante el aviso se ve el rectangulo por donde saldra y se va rellenando; al dispararse brilla.
function drawBeam(z) {
  ctx.save();
  ctx.translate(z.x, z.y); ctx.rotate(z.ang);
  const L = z.len, W = z.w;
  if (z.warn > 0) {
    const prog = clamp(1 - z.warn / z.warnMax, 0, 1);
    const t = performance.now() / 90;
    ctx.fillStyle = "rgba(255,40,40,0.10)";
    ctx.fillRect(0, -W / 2, L, W);
    ctx.fillStyle = "rgba(255,60,40," + (0.12 + prog * 0.28) + ")";
    ctx.fillRect(0, -W * prog / 2, L, W * prog);
    ctx.strokeStyle = "rgba(255,80,50," + (0.55 + Math.sin(t) * 0.3) + ")";
    ctx.lineWidth = 2; ctx.setLineDash([14, 8]);
    ctx.strokeRect(0, -W / 2, L, W);
  } else {
    ctx.globalAlpha = clamp(z.active / z.activeMax, 0, 1);
    ctx.shadowBlur = 30; ctx.shadowColor = "#ff4a2a";
    ctx.fillStyle = "#ff4a2a";
    ctx.fillRect(0, -W / 2, L, W);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff4d0";
    ctx.fillRect(0, -W * 0.2, L, W * 0.4);
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

  // Sprite SVG del jefe (rasterizado en jefes.js). Escala: el cuerpo del SVG coincide con b.r.
  const def = b.def, spr = def && (b.flash > 0 ? def.flashSprite : def.sprite);
  const size = BOSS_SPRITE_UNITS * (b.r / BOSS_BODY_UNITS);
  const pulse = 1 + Math.sin(t * 2) * 0.025 + (b.leaping > 0 ? 0.08 : 0);
  ctx.shadowBlur = 36 + (b.hasBombs ? 14 : 0);
  ctx.shadowColor = (def && def.glow) || (b.hasBombs ? "#ff6a00" : (b.hasLeap ? "#6affa0" : "#ff2a1a"));
  if (spr) {
    ctx.drawImage(spr, b.x - size * pulse / 2, b.y - size * pulse / 2, size * pulse, size * pulse);
  } else { // el sprite aun no cargo: circulo de respaldo
    ctx.fillStyle = b.flash > 0 ? "#fff" : b.color;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- Duende del Tesoro (Goblin de Diablo)
function spawnGoblin(x, y) {
  const p = state.player;
  const w = state.wave;
  const hpScale = 1 + (w - 1) * 0.25;
  const e = {
    x: clamp(x, WALL + 30, WORLD.w - WALL - 30),
    y: clamp(y, WALL + 30, WORLD.h - WALL - 30),
    type: "goblin",
    r: 18,
    speed: 155, // ágil y escurridizo
    hp: 390 * hpScale,
    maxHp: 390 * hpScale,
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
    escapeTimer: 30, // tiempo total antes de escapar: 25 s corriendo + 5 s de portal (a los 25 s ya no se detiene)
    portalGrace: 5, // segundos tras aparecer en los que no puede usar el portal
    portalLocked: false, // true al pasar 25 s: el portal ya no se puede interrumpir
    portalState: "none", // "none" | "opening"
    portalTime: 0,
    edgeTimer: 0, // segundos seguidos cerca del borde del mapa
    laughTimer: rand(2.5, 4), // proxima risita
    wasChanneling: false, portalTick: 0.4, // sonidos del portal
  };
  state.enemies.push(e);
  if (Sound && Sound.goblin) Sound.goblin();
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

var GOBLIN_PORTAL_FAR = 500;     // a mas de esta distancia (px) del jugador empieza a abrir el portal
var GOBLIN_PORTAL_CHANNEL = 5;   // segundos de canalizacion antes de escapar
var GOBLIN_EDGE_ZONE = 150;      // zona (px) junto al borde del mapa donde no puede quedarse mucho
var GOBLIN_EDGE_MAX_TIME = 2;    // segundos maximos seguidos dentro de esa zona antes de ser obligado a salir

function updateGoblin(e, dt, p, dx, dy, d) {
  if (e.panicTimer > 0) e.panicTimer -= dt;
  e.escapeTimer -= dt;
  if (e.portalGrace > 0) e.portalGrace -= dt;

  // Zona de borde: a menos de GOBLIN_EDGE_ZONE px del borde del mapa NO puede abrir/canalizar el portal
  // anticipado; el portal por tiempo (bloqueado a los 25 s) si puede usarlo aunque este en el borde.
  const edgeDistMin = Math.min(e.x - WALL, WORLD.w - WALL - e.x, e.y - WALL, WORLD.h - WALL - e.y);
  const inEdgeZone = edgeDistMin < GOBLIN_EDGE_ZONE;

  // Apertura del portal de escape:
  //  - pasados 25 s desde que aparece (escapeTimer <= 5) se abre y queda BLOQUEADO: ya no se puede interrumpir.
  //  - antes de eso, pasados los 5 s de gracia iniciales y si esta a mas de GOBLIN_PORTAL_FAR px del jugador
  //    (y no esta en panico) empieza a
  //    abrirlo; un golpe lo interrumpe (ver onGoblinHit).
  if (e.escapeTimer <= 5 && !e.portalLocked) {
    e.portalLocked = true;
    if (e.portalState === "none") { e.portalState = "opening"; e.portalTime = 0; }
  } else if (e.portalState === "none" && e.panicTimer <= 0 && d > GOBLIN_PORTAL_FAR && !inEdgeZone && e.portalGrace <= 0) {
    e.portalState = "opening";
    e.portalTime = 0;
  }

  const channeling = e.portalState === "opening" && e.panicTimer <= 0 && (!inEdgeZone || e.portalLocked);
  e.channeling = channeling; // para dibujar el portal solo mientras canaliza
  const sfxVol = clamp(1 - d / 1500, 0.3, 1); // mas lejos = mas bajito
  // sonido de portal de fantasia: al empezar a canalizar y destellos mientras dura
  if (channeling && !e.wasChanneling) { e.portalTick = 0.8; if (Sound.goblinPortal) Sound.goblinPortal(sfxVol); }
  e.wasChanneling = channeling;
  // risita periodica mientras el duende esta en el mapa (no mientras canaliza el portal)
  if (!channeling) {
    e.laughTimer -= dt;
    if (e.laughTimer <= 0) { e.laughTimer = rand(5, 8); if (Sound.goblinLaugh) Sound.goblinLaugh(sfxVol); }
  }
  if (channeling) {
    e.portalTime += dt;
    e.portalTick -= dt;
    if (e.portalTick <= 0) {
      e.portalTick = 0.8;
      if (Sound.goblinPortalTick) Sound.goblinPortalTick(clamp(e.portalTime / GOBLIN_PORTAL_CHANNEL, 0, 1), sfxVol);
    }
    if (Math.random() < 0.6) {
      const a = rand(0, Math.PI * 2), dist = rand(30, 70);
      state.particles.push({
        x: e.x + Math.cos(a) * dist,
        y: e.y + Math.sin(a) * dist * 0.45,
        vx: -Math.cos(a) * 45 + rand(-10, 10),
        vy: -Math.sin(a) * 45 + rand(-10, 10),
        life: 0.4, r: rand(2, 4),
        color: pick(["#ffd84d", "#f1c40f", "#fff3b0"])
      });
    }
    if (e.portalTime >= GOBLIN_PORTAL_CHANNEL) {
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

  // Limite junto al borde: no puede pasar mas de GOBLIN_EDGE_MAX_TIME s a menos de GOBLIN_EDGE_ZONE px del borde.
  // Pasado ese tiempo ignora al jugador y se dirige al centro del mapa hasta salir de la zona (no aplica mientras canaliza).
  if (!inEdgeZone) e.edgeTimer = 0;
  else e.edgeTimer += dt;
  if (inEdgeZone && !channeling && e.edgeTimer >= GOBLIN_EDGE_MAX_TIME) {
    const cx = WORLD.w / 2 - e.x, cy = WORLD.h / 2 - e.y, cl = Math.hypot(cx, cy) || 1;
    fleeX = cx / cl; fleeY = cy / cl;
  }

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
    const ashVal = randInt(1, 3);
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
  // Si el portal esta bloqueado (pasaron 25 s) ya no se puede detener: ni panico ni interrupcion, solo suelta cenizas.
  // Antes de eso, un golpe lo interrumpe (reinicia el progreso) y el duende entra en panico.
  if (!e.portalLocked) {
    e.panicTimer = 1.2;
    e.portalState = "none";
    e.portalTime = 0;
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
  if (e.channeling) {
    const t = performance.now() / 200;
    ctx.save();
    ctx.translate(e.x, e.y + 4);
    ctx.scale(1, 0.45);
    const PR = 75; // radio del portal: ~150 px de ancho (ovalado por el scale vertical)
    const grad = ctx.createRadialGradient(0, 0, 8, 0, 0, PR);
    grad.addColorStop(0, "rgba(255, 244, 176, 0.9)");
    grad.addColorStop(0.6, "rgba(241, 196, 15, 0.55)");
    grad.addColorStop(1, "rgba(255, 216, 77, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, PR, 0, Math.PI * 2); ctx.fill();

    ctx.rotate(t);
    ctx.strokeStyle = "rgba(255, 244, 176, 0.85)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 4; a += 0.2) {
      const pr = 6 + a * 5.4;
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

  if (e.channeling) {
    ctx.fillStyle = "#ff7675";
    ctx.font = "bold 10px sans-serif";
    ctx.fillText("¡Portal! " + Math.max(0, GOBLIN_PORTAL_CHANNEL - e.portalTime).toFixed(1) + "s", e.x, barY - 14);
  }

  ctx.textAlign = "left";
}

// ---------------------------------------------------------------- Arranque
state = newState();
requestAnimationFrame(loop);
