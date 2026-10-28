/* =====================================================================
 * tactil.js — controles tactiles (moviles y tablets)
 *
 * Solo hace algo si TOUCH_MODE es true (definido en mecanica.js: pantalla tactil
 * o ?touch=1 en la URL). En PC este archivo termina en la primera linea y el
 * juego se comporta exactamente igual que antes.
 *
 * Que aporta:
 *  - Cruceta de 8 direcciones: escribe en `keys` (w/a/s/d), asi el movimiento y el
 *    esquive usan el mismo codigo que el teclado, sin tocar la jugabilidad.
 *  - Boton de esquive: llama a tryDash() y muestra la recarga.
 *  - Apuntado automatico: sin raton, la mira va al enemigo/jefe mas cercano
 *    (si no hay ninguno, hacia donde te mueves). update() llama a TouchControls.aim().
 *  - Boton de cofre: aparece solo cuando hay un cofre al alcance (equivale a la tecla E).
 *  - Boton de pausa (equivale a Esc) y auto-pausa al pasar a vertical.
 * ===================================================================== */
(function () {
  if (typeof TOUCH_MODE === "undefined" || !TOUCH_MODE) return;

  var dpad = document.getElementById("dpad");
  var dashBtn = document.getElementById("touch-dash");
  var chestBtn = document.getElementById("touch-chest");
  var pauseBtn = document.getElementById("pause-btn");
  var dpArms = {
    up: dpad.querySelector(".dp-up"), down: dpad.querySelector(".dp-down"),
    left: dpad.querySelector(".dp-left"), right: dpad.querySelector(".dp-right"),
  };

  // ultima direccion en la que te moviste (sirve para apuntar y esquivar cuando no hay enemigos)
  var lastDir = { x: 1, y: 0 };

  function setMove(x, y) {
    keys["a"] = x < 0; keys["d"] = x > 0;
    keys["w"] = y < 0; keys["s"] = y > 0;
    dpArms.left.classList.toggle("on", x < 0);
    dpArms.right.classList.toggle("on", x > 0);
    dpArms.up.classList.toggle("on", y < 0);
    dpArms.down.classList.toggle("on", y > 0);
    if (x || y) { var l = Math.hypot(x, y); lastDir.x = x / l; lastDir.y = y / l; }
  }

  // ---------------------------------------------------------------- Cruceta
  var dpadPointer = null;
  function readDpad(e) {
    var r = dpad.getBoundingClientRect();
    var dx = e.clientX - (r.left + r.width / 2);
    var dy = e.clientY - (r.top + r.height / 2);
    var len = Math.hypot(dx, dy);
    if (len < r.width * 0.12) { setMove(0, 0); return; } // zona muerta del centro
    var ax = dx / len, ay = dy / len;
    // 8 sectores: cada eje se activa si la direccion se inclina mas de ~22,5 grados hacia el
    setMove(ax > 0.38 ? 1 : ax < -0.38 ? -1 : 0, ay > 0.38 ? 1 : ay < -0.38 ? -1 : 0);
  }
  dpad.addEventListener("pointerdown", function (e) {
    if (dpadPointer !== null) return;
    e.preventDefault();
    dpadPointer = e.pointerId;
    try { dpad.setPointerCapture(e.pointerId); } catch (err) {}
    readDpad(e);
  });
  dpad.addEventListener("pointermove", function (e) {
    if (e.pointerId !== dpadPointer) return;
    e.preventDefault();
    readDpad(e);
  });
  function releaseDpad(e) {
    if (e && e.pointerId !== dpadPointer) return;
    dpadPointer = null;
    setMove(0, 0);
  }
  dpad.addEventListener("pointerup", releaseDpad);
  dpad.addEventListener("pointercancel", releaseDpad);
  dpad.addEventListener("lostpointercapture", releaseDpad);

  // ---------------------------------------------------------------- Esquive
  function canAct() {
    return !!(state && state.running && !state.over && !paused && !invOpen);
  }
  dashBtn.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    dashBtn.classList.add("down");
    if (!canAct()) return;
    var p = state.player;
    // sin cruceta pulsada, tryDash() usaria la mira (el enemigo mas cercano): mejor esquivar hacia donde ibas
    if (!(keys["w"] || keys["a"] || keys["s"] || keys["d"])) { p.aimX = lastDir.x; p.aimY = lastDir.y; }
    tryDash();
  });
  function dashUp() { dashBtn.classList.remove("down"); }
  dashBtn.addEventListener("pointerup", dashUp);
  dashBtn.addEventListener("pointercancel", dashUp);
  dashBtn.addEventListener("pointerleave", dashUp);

  // ---------------------------------------------------------------- Cofre y pausa
  chestBtn.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    if (canAct()) tryOpenChest();
  });
  pauseBtn.addEventListener("click", function () {
    // igual que la tecla Esc
    if (invOpen) closeInventory();
    else if (paused) resumeGame();
    else if (state && state.running && !state.over) pauseGame();
  });

  // ---------------------------------------------------------------- Apuntado automatico
  var AIM_RANGE = 900; // un poco mas que el alcance de disparo automatico (800)
  function aim(p) {
    var bx = null, by = null, bd = AIM_RANGE * AIM_RANGE;
    var i, t, d;
    for (i = 0; i < state.enemies.length; i++) {
      t = state.enemies[i];
      if (!(t.hp > 0)) continue;
      d = dist2(p.x, p.y, t.x, t.y);
      if (d < bd) { bd = d; bx = t.x; by = t.y; }
    }
    for (i = 0; i < state.bosses.length; i++) {
      t = state.bosses[i];
      if (!(t.hp > 0)) continue;
      d = dist2(p.x, p.y, t.x, t.y);
      if (d < bd) { bd = d; bx = t.x; by = t.y; }
    }
    if (bx === null) { bx = p.x + lastDir.x * 320; by = p.y + lastDir.y * 320; } // sin enemigos: hacia donde caminas
    // update() calcula la mira como mouse/zoom + camara: se escribe el "raton" equivalente
    mouse.x = (bx - cam.x) * zoom;
    mouse.y = (by - cam.y) * zoom;
  }

  // ---------------------------------------------------------------- Bucle de la interfaz tactil
  var lastCd = -1, lastReady = null, lastChest = null;
  function frame() {
    requestAnimationFrame(frame);
    if (!state || !state.player) return;
    var p = state.player;

    var cd = p.dashMax > 0 ? Math.min(1, Math.max(0, p.dashCd / p.dashMax)) : 0;
    if (cd !== lastCd) { dashBtn.style.setProperty("--cd", cd.toFixed(3)); lastCd = cd; }
    var ready = cd <= 0;
    if (ready !== lastReady) { dashBtn.classList.toggle("ready", ready); lastReady = ready; }

    // el boton de cofre solo aparece con un cofre al alcance (mismo radio que tryOpenChest)
    var near = false;
    if (state.running && !state.over) {
      for (var i = 0; i < state.chests.length; i++) {
        var c = state.chests[i];
        if (!c.opened && dist2(p.x, p.y, c.x, c.y) < (c.r + p.r + 24) * (c.r + p.r + 24)) { near = true; break; }
      }
    }
    if (near !== lastChest) { chestBtn.hidden = !near; lastChest = near; }
  }
  requestAnimationFrame(frame);

  // ---------------------------------------------------------------- Seguridad
  // si la pantalla se oscurece o cambia de app con un dedo apoyado, no dejar la cruceta "pegada"
  function clearInput() { dpadPointer = null; setMove(0, 0); dashUp(); }
  window.addEventListener("blur", clearInput);
  document.addEventListener("visibilitychange", function () { if (document.hidden) clearInput(); });
  // evitar el menu contextual (pulsacion larga) y el zoom por gestos en iOS
  document.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  document.addEventListener("gesturestart", function (e) { e.preventDefault(); });

  // en vertical aparece el aviso "gira el dispositivo": se pausa la partida para que nadie muera mientras tanto
  var portrait = window.matchMedia("(orientation: portrait)");
  function onOrientation() {
    if (portrait.matches) {
      clearInput();
      if (state && state.running && !state.over && !paused) pauseGame();
    }
  }
  if (portrait.addEventListener) portrait.addEventListener("change", onOrientation);
  else if (portrait.addListener) portrait.addListener(onOrientation);

  window.TouchControls = { aim: aim, active: true };
})();
