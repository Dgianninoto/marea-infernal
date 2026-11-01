"use strict";

// Portal de etapa: solo se abre con la arena vacia y se cruza explicitamente.
function canOpenStagePortal() {
  return !!(state && state.running && !state.over && !state.finalChallenge && !state.victory
    && state.wave > 0 && state.wave % 10 === 0 && state.toSpawn === 0 && state.alive === 0
    && !state.boss && !state.bosses.some(b => b.hp > 0 && !b.dead)
    && !state.enemies.some(e => e.hp > 0));
}

function findStagePortalPosition() {
  const p = state.player;
  for (const distance of [150, 110, 70]) {
    for (let i = 0; i < 16; i++) {
      const angle = i * Math.PI / 8;
      const x = p.x + Math.cos(angle) * distance, y = p.y + Math.sin(angle) * distance;
      if (x < WALL + 65 || y < WALL + 65 || x > WORLD.w - WALL - 65 || y > WORLD.h - WALL - 65) continue;
      if (state.obstacles.some(o => x + 60 > o.x && x - 60 < o.x + o.w && y + 45 > o.y && y - 45 < o.y + o.h)) continue;
      // Comprobar tambien el camino: un hueco libre al otro lado de una pared no sirve.
      let reachable = true;
      for (let j = 1; j <= 12; j++) {
        const sx = p.x + (x - p.x) * j / 12, sy = p.y + (y - p.y) * j / 12;
        const corrected = resolveObstacles(sx, sy, p.r + 3);
        if (Math.hypot(corrected.x - sx, corrected.y - sy) > 0.1) { reachable = false; break; }
      }
      if (reachable) return { x, y };
    }
  }
  // En un rincon estrecho, el suelo que ya ocupa el jugador siempre es accesible.
  return { x: p.x, y: p.y };
}

function startStagePortal() {
  if (state.stagePortal || !canOpenStagePortal()) return false;
  restoreIntermissionResources();
  state.phase = "intermission";
  state.stagePortal = { ...findStagePortalPosition(), final: state.wave >= BOSS_FINAL_WAVE };
  state.bullets = []; state.bossBullets = []; state.aoes = []; state.beams = [];
  state.weaponEffects = []; state.trios = []; state.bossTrio = null;
  interPanel.style.display = "none";
  showWarning("¡Etapa completada!<br><span style='font-size:20px'>Acércate al portal y pulsa E o Enter para continuar</span>");
  Sound.goblinPortal(0.6);
  updateHud();
  return true;
}

function stagePortalGeometry() {
  if (!state || !state.stagePortal) return null;
  const radius = state.player.r;
  return {
    x: state.stagePortal.x,
    y: state.stagePortal.y - radius * 0.55,
    rx: radius * 1.25,
    ry: radius * 1.6
  };
}

function isNearStagePortal() {
  const shape = stagePortalGeometry();
  if (!shape) return false;
  const p = state.player;
  // El mismo centro y ovalo que se dibujan, con margen por el cuerpo del jugador.
  return ((p.x - shape.x) / (shape.rx + p.r * 0.5)) ** 2 + ((p.y - shape.y) / (shape.ry + p.r * 0.5)) ** 2 <= 1;
}

function tryUseStagePortal() {
  if (!state || !state.running || state.over || paused || invOpen || state.phase !== "intermission" || !isNearStagePortal()) return false;
  const final = state.stagePortal.final;
  state.stagePortal = null; // consumir antes de avanzar: una pulsacion solo cruza una vez
  state.bullets = []; state.bossBullets = []; state.aoes = []; state.beams = [];
  const p = state.player;
  p.x = WORLD.w / 2; p.y = WORLD.h / 2;
  p.dashTime = 0; p.blinkArrive = 0;
  clearKeyboardInput();
  if (final) startFinalChallenge(); else startWave();
  // La hueste acompaña al personaje al cambiar de arena.
  state.minions.forEach((m, i) => {
    const a = i * Math.PI * 2 / Math.max(1, state.minions.length);
    const pos = resolveObstacles(p.x + Math.cos(a) * 65, p.y + Math.sin(a) * 65, m.r || 12);
    m.x = pos.x; m.y = pos.y;
  });
  Sound.dash();
  updateStagePortalPrompt();
  return true;
}

function tryInteract() {
  if (!state || !state.running || state.over || paused || invOpen) return;
  if (!tryUseStagePortal()) tryOpenChest();
}

function updateStagePortalPrompt() {
  const prompt = el("portal-prompt");
  const visible = !!(state && state.running && !state.over && !paused && !invOpen && isNearStagePortal());
  prompt.hidden = !visible;
  if (visible) el("portal-prompt-title").textContent = state.stagePortal.final ? "Entrar al desafío final" : "Pasar a la siguiente etapa";
}

function drawStagePortal() {
  const portal = state.stagePortal;
  if (!portal) return;
  const shape = stagePortalGeometry();
  const t = state.time, x = 0, y = 0;
  const glow = portal.final ? "#ff9454" : "#68cfff";
  const edge = portal.final ? "#ffdab3" : "#d4f8ff";
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath(); ctx.ellipse(shape.x, shape.y + shape.ry * 0.9, shape.rx * 1.25, shape.ry * 0.24, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(shape.x, shape.y);
  ctx.scale(shape.rx / 46, shape.ry / 75);
  const aura = ctx.createRadialGradient(x, y, 8, x, y, 108);
  aura.addColorStop(0, portal.final ? "rgba(170,45,225,0.5)" : "rgba(45,105,230,0.5)");
  aura.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = aura; ctx.fillRect(x - 110, y - 110, 220, 220);
  ctx.save();
  ctx.beginPath(); ctx.ellipse(x, y, 44, 72, 0, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = "#090b24"; ctx.fillRect(x - 48, y - 76, 96, 152);
  ctx.lineWidth = 2;
  // Espirales elipticas: no generan particulas ni nodos adicionales por frame.
  for (let i = 0; i < 7; i++) {
    const spin = t * 1.8 + i * 0.8;
    ctx.strokeStyle = i % 2 ? glow : "#935cff";
    ctx.globalAlpha = 0.35 + (i % 3) * 0.15;
    ctx.beginPath();
    for (let j = 0; j <= 45; j++) {
      const a = spin + j * 0.17, r = 4 + j * 1.05;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 1.65;
      if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
  ctx.shadowColor = glow; ctx.shadowBlur = 12;
  ctx.strokeStyle = glow; ctx.lineWidth = 5 + Math.sin(t * 4) * 0.8;
  ctx.beginPath(); ctx.ellipse(x, y, 46, 75, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = edge; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.ellipse(x, y, 43, 72, 0, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8 + t * 0.5, pulse = 1 + Math.sin(t * 3 + i) * 0.08;
    ctx.fillStyle = i % 2 ? edge : glow;
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * 49 * pulse, y + Math.sin(a) * 78 * pulse, 1.5 + Math.sin(t + i) ** 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // El texto conserva su tamaño aunque el portal se ajuste al personaje.
  ctx.save();
  ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
  ctx.fillStyle = edge;
  ctx.fillText(portal.final ? "DESAFÍO FINAL" : "ETAPA " + (Math.floor(state.wave / 10) + 1), shape.x, shape.y - shape.ry - 14);
  ctx.restore();
}

el("portal-enter").addEventListener("click", tryUseStagePortal);
