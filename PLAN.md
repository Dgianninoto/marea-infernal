# Plan de desarrollo — Marea Infernal

Documento de etapas para retomar el trabajo sin perder el hilo. El juego es un
único archivo autocontenido: `marea-infernal.html` (HTML + CSS + JS embebidos).

## Punto de partida (baseline sano)

- Commit de referencia: `4e0c4ca` (igual que `origin/main` en GitHub).
- Esta versión funciona y es jugable. Incluye: menú principal, cómo jugar,
  tabla de puntuaciones (localStorage), equipo e inventario, cenizas y cofres,
  jefe (Señor de la Marea), esquive (dash) y sonido (Web Audio).
- Esta versión **todavía NO tiene**: suelo de baldosas, borde amurallado,
  escenarios por tema, ni el sistema de oleadas infinitas. Todo eso se
  reconstruye en las etapas de abajo (se perdió en un incidente de edición).

## Reglas de trabajo (para no volver a romper el archivo)

1. **Nunca** editar `marea-infernal.html` con PowerShell / `Set-Content` /
   reescrituras de bytes. El archivo tiene emojis y acentos; esas herramientas
   corrompen la codificación UTF-8. Editar SOLO con las herramientas de edición
   que preservan UTF-8 (str_replace / fs_write del editor).
2. Avanzar en **pasos pequeños**. Un cambio lógico a la vez.
3. Tras cada etapa: verificar la **sintaxis JS** (`node --check` sobre el
   `<script>` extraído) y comprobar que **no haya caracteres corruptos** (buscar
   el carácter de reemplazo U+FFFD). PowerShell SÍ se puede usar para *leer* y
   verificar; nunca para escribir el HTML.
4. Hacer **commit al terminar cada etapa** que quede estable, con mensaje claro.
   Así cada etapa es un punto de retome seguro.
5. Probar en el navegador al cerrar cada etapa antes de pasar a la siguiente.

## Etapas

### Etapa 0 — Baseline verificado  ✅ (hecho)
- Archivo restaurado al commit `4e0c4ca`, sintaxis OK, 0 corrupción.
- Estado: COMPLETADO.

### Etapa 1 — Escenario: suelo de baldosas + borde amurallado (opción 2)  ✅
- Textura de losas de piedra cacheada + muro almenado infranqueable (`WALL`).
- Jugador, dash, jefe y spawn respetan el muro.
- Estado: COMPLETADO (commit `8438f2c`).

### Etapa 2 — Sin límite de tiempo; morir es la única derrota  ✅
- Eliminado el temporizador `tide`. El juego termina solo al llegar la vida a 0.
- HUD reconvertido a "OLEADA N" + progreso.
- Estado: COMPLETADO (commit `e450c89`).

### Etapa 3 — Oleadas con dificultad siempre creciente  ✅
- Sistema por oleadas con cuota de enemigos; escalado sin tope (vida/daño/vel.
  con topes razonables en velocidad). Director de oleadas (`startWave`,
  `onWaveCleared`).
- Estado: COMPLETADO (commit `e450c89`).

### Etapa 4 — Intermedio cada 5 oleadas  ✅
- Fase "intermission" de 12s (sin spawns) con banner y botón "Continuar ahora".
- Estado: COMPLETADO (commit `e450c89`).

### Etapa 5 — Jefe cada 10 oleadas  ✅
- Jefe en oleadas 10, 20, 30... escalado por oleada; la oleada no se supera
  hasta derrotarlo.
- Estado: COMPLETADO (commit `e450c89`).

### Etapa 6 — Cambio de escenario cada 10 oleadas  ✅
- 3 temas: Páramo de cenizas, Roca oscura, Sangre y obsidiana (suelo + muro +
  viñeta), rotación cada 10 oleadas.
- Estado: COMPLETADO (commit `e450c89`).

### Etapa 7 — Ajuste de puntuación y textos  ✅
- Puntuación por oleada/nivel/jefes/cenizas. Textos de cómo-jugar actualizados.
- Estado: COMPLETADO (commit `e450c89`).

### Etapa 8 — Commit final y push a GitHub
- Estado: EN CURSO.

## Registro de progreso

- 2026-10-20: Etapa 0 completada (baseline restaurado y verificado).
- 2026-10-20: Etapa 1 completada (commit 8438f2c).
- 2026-10-20: Etapas 2-7 completadas (commit e450c89). Pendiente push.
