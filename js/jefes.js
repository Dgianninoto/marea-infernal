/* Jefes de Marea Infernal: un jefe distinto cada 10 oleadas (10, 20, 30, 40 y 50).
 * Los sprites son archivos SVG en assets/bosses (funciona bajo file://). Se rasterizan una vez
 * a un canvas pequeño y drawBoss (enemigos.js) los dibuja desde ahi.
 * La oleada BOSS_FINAL_WAVE cierra el juego: al caer su jefe hay victoria. */
var BOSS_FINAL_WAVE = 50;      // oleada del Desafio final
var BOSS_FINAL_COUNT = 3;      // jefes del Desafio final (los 3 de BOSS_FINAL_ROSTER) que hay que derrotar
// Rayo en linea recta (oleada 30+ y Desafio final): aviso en el suelo y luego disparo.
var BOSS_BEAM_LEN = 700;        // largo del rayo en px (desde el centro del jefe)
var BOSS_BEAM_W = 100;          // ancho del rayo en px
var BOSS_BEAM_WARN = 1.2;       // segundos que se ve el aviso antes de disparar
var BOSS_BEAM_ACTIVE = 0.3;     // segundos que el rayo permanece activo (dana al tocarlo)
var BOSS_BEAM_DMG_MULT = 2.7;   // dano = dmg del jefe x este valor (~50 % mas que el salto; referencia: abanico 0.62, bombas 1.2, salto 1.8)
// Multiplicador de dano por jefe: se aplica al dmg base del jefe, asi que escala TODOS sus ataques
// (contacto, abanico, salto, lluvia de fuego y rayo). El jefe de la oleada 10 (B1) no lleva multiplicador.
var BOSS_DMG_MULT = { B1: 1, B2: 1.2, B3: 1.5, C1: 2, C2: 3 };  // B2=oleada 20, B3=30, C1=40, C2=50
var BOSS_FINAL_DMG_MULT = 3.5;     // cada jefe del Desafio final, sea cual sea
// Desafio final: cuando cae un jefe, a los que quedan se les reduce el enfriamiento de sus habilidades
// (salto, abanico, lluvia de fuego y rayo): -25 % si ya murio uno y -50 % cuando solo queda uno.
var BOSS_FINAL_CD_RED_ONE_DEAD = 0.25;
var BOSS_FINAL_CD_RED_LAST = 0.50;
function bossCdRate(boss) {
  if (!boss.isFinal) return 1;
  const alive = state.bosses.length;
  const total = boss.finalTotal || 3;
  if (alive >= total) return 1;
  const red = alive <= 1 ? BOSS_FINAL_CD_RED_LAST : BOSS_FINAL_CD_RED_ONE_DEAD;
  return 1 / (1 - red); // los enfriamientos corren mas rapido: -25 % = x1,33; -50 % = x2
}
// Trio de jefes (Desafio final): misma habilidad que el trio dorado/azul (ver TRIO_* en enemigos.js).
// Si los 3 jefes se juntan, avisan y luego 2 recorren 120 grados (horario / antihorario) alrededor del jugador y el
// tercero se queda: los tres quedan repartidos a 120 grados. Mientras dura, ninguno ataca ni avanza.
var BOSS_TRIO_RADIUS = 300;     // px: los 3 se consideran "juntos" si todos estan a <= esto entre si (centro a centro)
var BOSS_TRIO_CHARGE = 0.9;     // s de aviso (aura + sonido) antes de moverse
var BOSS_TRIO_RETREAT = 250;    // px que retroceden (se alejan del jugador) mientras se dispersan
var BOSS_TRIO_MOVE = 1.0;       // s que tardan en recorrer el arco de 120 grados
var BOSS_TRIO_COOLDOWN = 10;    // s antes de poder repetirlo
var BOSS_TRIO_MIN_R = 200;      // px: distancia minima al jugador durante el arco (no pasan encima de el)
var BOSS_FINAL_HP = 300000;    // vida fija de CADA jefe del desafio final (no depende del jefe sorteado)
// Cada jefe tiene su PROPIA vida (hp), ajustada a la fuerza esperada del jugador en su oleada
// (nivel + arma al ritmo de cenizas del sistema +5 / valor por punto x2). Ya no escala con la oleada.
// En el Desafio final cada jefe tiene BOSS_FINAL_HP, sea cual sea.
var BOSS_ROSTER = [
  { id: "B1", name: "Kraken Abisal", hp: 3000, spritePath: "assets/bosses/kraken-abisal.svg" },
  { id: "B2", name: "Coloso Abisal", hp: 20000, spritePath: "assets/bosses/coloso-abisal.svg" },
  { id: "B3", name: "Medusa de Magma", hp: 90000, spritePath: "assets/bosses/medusa-magma.svg" },
  { id: "C1", name: "Ídolo Rúnico", hp: 150000, spritePath: "assets/bosses/idolo-runico.svg" },
  { id: "C2", name: "Señor de la Marea", hp: 250000, spritePath: "assets/bosses/senor-marea.svg" },
];
// Jefes EXCLUSIVOS del Desafio final (oleada 50): variantes del Senor de la Marea en 3 colores, con nombre propio.
// Salen los 3 a la vez. Su vida es BOSS_FINAL_HP y su dano BOSS_FINAL_DMG_MULT; 'glow' es el color de su aura.
var BOSS_FINAL_ROSTER = [
  { id: "F1", name: "Dagh'Nuul, el Ahogado", hp: BOSS_FINAL_HP, glow: "#5ad0ff", spritePath: "assets/bosses/dagh-nuul.svg" },
  { id: "F2", name: "Yth'Korra, Voz del Vacío", hp: BOSS_FINAL_HP, glow: "#c77dff", spritePath: "assets/bosses/yth-korra.svg" },
  { id: "F3", name: "Zul'Gathor, Devorador de Mareas", hp: BOSS_FINAL_HP, glow: "#ffc24a", spritePath: "assets/bosses/zul-gathor.svg" },
];
var BOSS_SPRITE_PX = 256; // lado del sprite rasterizado (viewBox 244 u)
var BOSS_SPRITE_UNITS = 244;
var BOSS_BODY_UNITS = 96; // radio del cuerpo en unidades del SVG: se hace coincidir con boss.r

// Desafio final: los jefes son las variantes de BOSS_FINAL_ROSTER (en orden aleatorio, que cambia sus posiciones iniciales).
function pickFinalBosses() {
  const pool = BOSS_FINAL_ROSTER.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  return pool.slice(0, BOSS_FINAL_COUNT);
}

function bossForWave(w) {
  const i = Math.min(BOSS_ROSTER.length - 1, Math.max(0, Math.floor(w / 10) - 1));
  return BOSS_ROSTER[i];
}

(function loadBossSprites() {
  for (const b of BOSS_ROSTER.concat(BOSS_FINAL_ROSTER)) {
    b.sprite = null; b.flashSprite = null;
    const img = new Image();
    img.onload = function () {
      const c = document.createElement("canvas"); c.width = c.height = BOSS_SPRITE_PX;
      c.getContext("2d").drawImage(img, 0, 0, BOSS_SPRITE_PX, BOSS_SPRITE_PX);
      // silueta blanca para el destello al recibir dano
      const f = document.createElement("canvas"); f.width = f.height = BOSS_SPRITE_PX;
      const fx = f.getContext("2d");
      fx.drawImage(c, 0, 0);
      fx.globalCompositeOperation = "source-atop";
      fx.fillStyle = "rgba(255,255,255,0.85)";
      fx.fillRect(0, 0, BOSS_SPRITE_PX, BOSS_SPRITE_PX);
      b.sprite = c; b.flashSprite = f;
    };
    img.src = b.spritePath;
  }
})();

// ---------------------------------------------------------------- Fuegos artificiales (pantalla de victoria)
// Canvas propio dentro de #over-screen; se detiene solo cuando la pantalla se oculta.
var fwRunning = false;
function startFireworks() {
  const cv = document.getElementById("fireworks"), scr = document.getElementById("over-screen");
  if (!cv || fwRunning) return;
  cv.style.display = "block";
  const fx = cv.getContext("2d");
  const rockets = [], sparks = [];
  const COLORS = ["#ffd84d", "#ff7a2a", "#ff3a1a", "#6affa0", "#7fb3ff", "#ff6ad5", "#ffffff"];
  let last = performance.now(), nextLaunch = 0;
  fwRunning = true;
  function resize() { cv.width = cv.clientWidth || 800; cv.height = cv.clientHeight || 600; }
  resize();
  function burst(x, y) {
    const c1 = COLORS[Math.floor(Math.random() * COLORS.length)], c2 = COLORS[Math.floor(Math.random() * COLORS.length)];
    const n = 46 + Math.floor(Math.random() * 30), ring = Math.random() < 0.4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, s = ring ? 190 : 60 + Math.random() * 200;
      sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1 + Math.random() * 0.6, max: 1.6, c: i % 3 === 0 ? c2 : c1 });
    }
  }
  function frame(now) {
    if (scr.classList.contains("hidden")) { fwRunning = false; cv.style.display = "none"; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (cv.width !== cv.clientWidth || cv.height !== cv.clientHeight) resize();
    fx.clearRect(0, 0, cv.width, cv.height);
    nextLaunch -= dt;
    if (nextLaunch <= 0) {
      nextLaunch = 0.25 + Math.random() * 0.5;
      rockets.push({ x: cv.width * (0.1 + Math.random() * 0.8), y: cv.height, vy: -(380 + Math.random() * 220), ty: cv.height * (0.12 + Math.random() * 0.4) });
    }
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i]; r.y += r.vy * dt;
      fx.fillStyle = "#fff"; fx.fillRect(r.x - 1.5, r.y, 3, 10);
      if (r.y <= r.ty) { burst(r.x, r.y); rockets.splice(i, 1); }
    }
    fx.globalCompositeOperation = "lighter";
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.life -= dt;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.vy += 120 * dt; s.vx *= 0.985; s.vy *= 0.985; s.x += s.vx * dt; s.y += s.vy * dt;
      fx.globalAlpha = Math.min(1, s.life / s.max * 1.4); fx.fillStyle = s.c;
      fx.beginPath(); fx.arc(s.x, s.y, 2.4, 0, Math.PI * 2); fx.fill();
    }
    fx.globalAlpha = 1; fx.globalCompositeOperation = "source-over";
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
