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
  var dpadRect = null;
  var dpadSector = null;
  var dpadDirections = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  function canAct() {
    return !!(state && state.running && !state.over && !paused && !invOpen);
  }
  function readDpad(e) {
    if (!canAct()) { clearInput(); return; }
    var r = dpadRect;
    if (!r) return;
    var dx = e.clientX - (r.left + r.width / 2);
    var dy = e.clientY - (r.top + r.height / 2);
    var len = Math.hypot(dx, dy);
    var knob = Math.min(len, r.width * 0.24);
    dpad.style.setProperty("--stick-x", (len ? dx / len * knob : 0) + "px");
    dpad.style.setProperty("--stick-y", (len ? dy / len * knob : 0) + "px");
    var deadZone = Math.min(14, r.width * 0.10) * (dpadSector === null ? 1 : 0.7);
    if (len < deadZone) { dpadSector = null; setMove(0, 0); return; }
    var angle = Math.atan2(dy, dx), sector = Math.round(angle / (Math.PI / 4));
    // Un margen angular evita alternar entre recto y diagonal con pequeños temblores.
    if (dpadSector !== null) {
      var delta = angle - dpadSector * Math.PI / 4;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      if (Math.abs(delta) < Math.PI / 8 + 0.08) sector = dpadSector;
    }
    dpadSector = (sector + 8) % 8;
    setMove(dpadDirections[dpadSector][0], dpadDirections[dpadSector][1]);
  }
  dpad.addEventListener("pointerdown", function (e) {
    if (!canAct() || dpadPointer !== null || e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    dpadPointer = e.pointerId;
    dpadRect = dpad.getBoundingClientRect();
    dpadSector = null;
    dpad.classList.add("dragging");
    try { dpad.setPointerCapture(e.pointerId); } catch (err) {}
    readDpad(e);
  });
  window.addEventListener("pointermove", function (e) {
    if (e.pointerId !== dpadPointer) return;
    e.preventDefault();
    readDpad(e);
  }, { passive: false });
  function releaseDpad(e) {
    if (e && e.pointerId !== dpadPointer) return;
    var pointer = dpadPointer;
    dpadPointer = null; dpadRect = null; dpadSector = null;
    dpad.classList.remove("dragging");
    dpad.style.setProperty("--stick-x", "0px"); dpad.style.setProperty("--stick-y", "0px");
    setMove(0, 0);
    if (pointer !== null) { try { dpad.releasePointerCapture(pointer); } catch (err) {} }
  }
  dpad.addEventListener("pointerup", releaseDpad);
  dpad.addEventListener("pointercancel", releaseDpad);
  dpad.addEventListener("lostpointercapture", releaseDpad);
  window.addEventListener("pointerup", releaseDpad);
  window.addEventListener("pointercancel", releaseDpad);

  // ---------------------------------------------------------------- Esquive
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
    if (canAct()) tryInteract();
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
    if (!canAct() && dpadPointer !== null) clearInput();
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
  function clearInput() { releaseDpad(); dashUp(); }
  window.addEventListener("blur", clearInput);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) return;
    clearInput();
    // El inventario ya detiene la partida; al salir de la app dejamos una pausa
    // explicita para que cerrar el inventario al volver no reanude el combate.
    if (state && state.running && !state.over) {
      if (invOpen) closeInventory();
      if (!paused) pauseGame();
    }
    // Una ayuda de pantalla completa abierta no debe reanudar tras interrupcion.
    helpPausedGame = false;
  });
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

  // ---------------------------------------------------------------- Pantalla y viewport movil
  var viewportPending = false;
  function syncViewport() {
    viewportPending = false;
    var viewport = window.visualViewport;
    var height = Math.round(viewport ? viewport.height : window.innerHeight);
    if (height > 0) document.documentElement.style.setProperty("--mobile-height", height + "px");
    clearInput();
    resize();
  }
  function queueViewport() {
    if (viewportPending) return;
    viewportPending = true; requestAnimationFrame(syncViewport);
  }
  window.addEventListener("resize", queueViewport);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", queueViewport);

  var fullscreenHelp = document.getElementById("fullscreen-help");
  var fullscreenMessage = document.getElementById("fullscreen-message");
  var displayButtons = document.querySelectorAll("[data-fullscreen]");
  var helpPausedGame = false, helpPreviousFocus = null, orientationLocked = false;
  function fullscreenElement() { return document.fullscreenElement || document.webkitFullscreenElement; }
  function standalone() { return !!(navigator.standalone || window.matchMedia("(display-mode: standalone)").matches); }
  function syncFullscreenButtons() {
    var active = !!fullscreenElement();
    displayButtons.forEach(function (button) {
      button.hidden = standalone();
      var label = active ? "Salir de pantalla completa" : "Pantalla completa";
      button.textContent = button.dataset.compact ? (active ? "⊡" : "⛶") : "⛶ " + label;
      button.title = label; button.setAttribute("aria-label", label);
      button.setAttribute("aria-pressed", String(active));
    });
  }
  function showFullscreenHelp() {
    var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    fullscreenMessage.textContent = ios
      ? "Si Safari no permite pantalla completa, abrí el juego en Safari, tocá Compartir y Añadir a pantalla de inicio. Después abrilo desde ese icono y girá el teléfono en horizontal."
      : "No se pudo activar la pantalla completa. Abrí el juego directamente en una pestaña de Chrome e intentá de nuevo. También podés añadirlo a la pantalla de inicio desde el menú del navegador.";
    helpPreviousFocus = document.activeElement;
    helpPausedGame = canAct();
    if (helpPausedGame) pauseGame();
    clearInput(); fullscreenHelp.hidden = false;
    document.getElementById("fullscreen-help-close").focus();
  }
  function closeFullscreenHelp() {
    fullscreenHelp.hidden = true;
    if (helpPausedGame && state && state.running && !state.over && paused) resumeGame();
    helpPausedGame = false;
    if (helpPreviousFocus && helpPreviousFocus.focus) helpPreviousFocus.focus();
  }
  async function toggleFullscreen() {
    clearInput();
    try {
      if (fullscreenElement()) {
        var exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) await exit.call(document);
      } else {
        var root = document.documentElement;
        var request = root.requestFullscreen || root.webkitRequestFullscreen;
        if (!request) { showFullscreenHelp(); return; }
        await request.call(root, { navigationUI: "hide" });
        if (window.screen && screen.orientation && screen.orientation.lock) {
          try { await screen.orientation.lock("landscape"); orientationLocked = true; } catch (err) {}
        }
      }
    } catch (err) { showFullscreenHelp(); }
    syncFullscreenButtons(); queueViewport();
  }
  displayButtons.forEach(function (button) { button.addEventListener("click", toggleFullscreen); });
  document.getElementById("fullscreen-help-close").addEventListener("click", closeFullscreenHelp);
  document.addEventListener("keydown", function (e) {
    if (!fullscreenHelp.hidden && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeFullscreenHelp(); }
  }, true);
  function onFullscreenChange() {
    if (!fullscreenElement() && orientationLocked) {
      if (window.screen && screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
      orientationLocked = false;
    }
    syncFullscreenButtons(); queueViewport();
  }
  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onFullscreenChange);
  syncViewport(); syncFullscreenButtons();

  window.TouchControls = { aim: aim, active: true };
})();
