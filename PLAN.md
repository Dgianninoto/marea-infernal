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

### Etapa 1 — Escenario: suelo de baldosas + borde amurallado (opción 2)
- Reañadir textura de suelo de losas de piedra (cacheada, generada una vez).
- Reañadir muro perimetral almenado que **delimita** la arena.
- Hacer el muro infranqueable: el jugador, el jefe y el spawn de enemigos
  respetan el grosor del muro (constante `WALL`).
- Verificación: se ve el suelo y el muro; el personaje choca limpio con el borde.
- Estado: PENDIENTE.

### Etapa 2 — Sin límite de tiempo; morir es la única derrota
- Quitar el temporizador de marea (`tide`) y su panel/cuenta atrás.
- El juego termina **solo** cuando la vida del jugador llega a 0.
- Ajustar el HUD donde estaba el temporizador (se reutiliza para la oleada).
- Verificación: no hay cuenta atrás; sobrevivir indefinidamente es posible.
- Estado: PENDIENTE.

### Etapa 3 — Oleadas con dificultad siempre creciente
- Sustituir el avance por tiempo por un sistema por oleadas: cada oleada tiene
  una cuota de enemigos; al limpiarlos, empieza la siguiente.
- Escalado sin tope: más enemigos y más fuertes/rápidos cada oleada (con topes
  razonables en velocidad para que siga siendo justo).
- HUD muestra "OLEADA N" y progreso (enemigos restantes).
- Verificación: la dificultad sube de forma perceptible oleada a oleada.
- Estado: PENDIENTE.

### Etapa 4 — Intermedio cada 5 oleadas
- Tras cada 5.ª oleada, pausa breve (sin spawns) para revisar inventario.
- Banner de "Intermedio" + botón/tecla para continuar antes de tiempo.
- Verificación: al superar la oleada 5, 10, 15... hay respiro y se puede abrir
  el inventario con calma.
- Estado: PENDIENTE.

### Etapa 5 — Jefe cada 10 oleadas
- El Señor de la Marea aparece en las oleadas 10, 20, 30... y escala con la
  oleada. La oleada no se considera superada hasta derrotarlo.
- Verificación: en la oleada 10 aparece el jefe con su barra de vida.
- Estado: PENDIENTE.

### Etapa 6 — Cambio de escenario cada 10 oleadas
- Rotación de 3 texturas de suelo (y tinte del muro/viñeta):
  1. Páramo de cenizas (baldosas) — de la Etapa 1
  2. Suelo de roca oscura
  3. Suelo de sangre y obsidiana
- El escenario cambia al entrar en la oleada 11, 21, 31... (ciclo de 3).
- Verificación: el suelo y el ambiente cambian visiblemente cada 10 oleadas.
- Estado: PENDIENTE.

### Etapa 7 — Ajuste de puntuación y cierre
- Puntuación coherente con el nuevo bucle (oleada alcanzada, nivel, jefes,
  cenizas). Actualizar textos de menú/cómo-jugar y pantalla de fin de partida.
- Verificación: fin de partida muestra oleada alcanzada y guarda score.
- Estado: PENDIENTE.

### Etapa 8 — Commit final y push a GitHub
- Commit de la versión completa y `git push` al repo privado `marea-infernal`.
- Estado: PENDIENTE.

## Registro de progreso

- 2026-10-20: Etapa 0 completada (baseline restaurado y verificado).
