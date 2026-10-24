# Plan temporal: selección de armas y estilos de combate

> Documento de trabajo temporal. Mantener como referencia durante el diseño e
> implementación de las nuevas armas; eliminarlo cuando el plan ya no sea
> necesario.

## Objetivo

Agregar armas con estilos de juego distintos. Antes de cada partida, el jugador
elige un arma; esa elección queda fija durante la partida. Cada arma tiene tres
ataques automáticos —básico, intermedio y definitivo— con sus propios tiempos de
recarga.

## Decisiones acordadas

- Clases iniciales: **Arquero** (arco), **Mago** (bastón de mago) y **Bárbaro** (hacha).
- Mostrar la selección de arma antes de comenzar la partida.
- No permitir cambiar el arma una vez iniciada la partida.
- El ataque básico con recarga reemplaza el disparo continuo actual del arco.
- Los tres ataques de cada arma son automáticos y tienen cooldown.
- El ratón sigue definiendo la dirección de apuntado.
- Usar la ranura **Arma** existente para las estadísticas y mejoras del arma
  elegida. Las otras cinco piezas de equipo conservan su funcionamiento.
- Mantener el sistema actual de oleadas, enemigos, progresión, pausa, muerte y
  puntuaciones.

## Propuesta inicial de estilos

Estos ataques son ejemplos para orientar el diseño, no habilidades finales:

| Arma | Básico | Intermedio | Definitivo |
| --- | --- | --- | --- |
| Arco | Flecha rápida a un objetivo | Abanico de flechas | Flecha de gran daño que atraviesa enemigos |
| Bastón | Orbe mágico guiado, repartido entre los enemigos cercanos | Explosión o proyectiles que rebotan | Ataque mágico de área |
| Hacha | Golpe en arco a corta distancia | Tres hachas giratorias (la central, el doble de grande y de alcance) que atraviesan enemigos y aplican sangrado | Golpe de suelo de gran alcance |

Antes de implementar, definir daño, alcance, cadencia, cooldown, efectos y
comportamiento visual de cada habilidad. El hacha requiere una regla de
adquisición de objetivo apropiada para ataques de corto alcance.

## Estado de implementación (Build 16)

Ya están implementados los tres kits iniciales. Los valores de cooldown son
provisionales y quedan sujetos a pruebas de balance:

| Arma | Básico | Intermedio | Definitivo |
| --- | --- | --- | --- |
| Arco | Flecha (0,29 s) | Abanico (5,5 s) | Devastación (13 s) |
| Bastón de mago | Orbe arcano guiado (0,58 s) | Salva arcana (5,5 s) | Meteorito (13 s) |
| Hacha | Tajo (1,6 A/s fijos; solo suben con guantes) | Hacha arrojadiza (5,5 s) | Golpe sísmico (13 s) |

- La selección aparece antes de iniciar; **Reintentar** conserva el arma.
- La ranura Arma cambia de nombre e icono según el kit elegido.
- Cadencia de equipo acelera el básico; crítico y daño afectan los ataques, y
  reducción de cooldown acelera las recargas.
- Los ataques automáticos se alternan para evitar lanzar los tres a la vez.
- El HUD muestra nombres, iconos y cooldowns propios del arma.
- El jugador ahora representa visualmente el arco, el bastón o el hacha.
- El meteorito muestra la zona de caída, impacta tras 0,85 s y causa daño de
  área; el hacha muestra el cono del tajo y el radio del golpe sísmico; la hacha arrojadiza
  lanza dos hachas de 50 px que recorren 300 px y una central de 100 px que recorre 600 px, todas atravesando enemigos con 25 % del daño; cada impacto aplica sangrado (10 ticks de 12 % del daño del Bárbaro, uno cada 0,5 s, 120 % en 5 s; se renueva sin apilarse) y el enemigo muestra un latido rojo.
- El golpe sísmico tiene 3 anillos concentricos de 1/3 del radio (195 px) cada uno: exterior ×2, central ×4 e interior ×7 del daño base; cada enemigo recibe solo el anillo más interno que toca.
- Las flechas del Abanico del Arquero tienen 1 de penetración: atraviesan al primer enemigo y desaparecen al llegar al segundo o a su alcance máximo.
- La esquiva del Mago es especial (parpadeo arcano): recarga un 75 % más rápido (2,2 s → ≈1,26 s) y es un 25 % más larga (144 px → 180 px). Desaparece mientras se desplaza (sensación de teletransporte), deja anillos violeta al desaparecer y reaparecer y parpadea en violeta un instante, como el teletransporte de los enemigos.
- Se actualizaron la ayuda del juego y el README.

## Etapas de trabajo

### 1. Definir el modelo de los kits — implementado

- [x] Representar metadatos del arma y habilidades (identificador, nombre, icono,
  cooldown) por separado de los efectos de combate.
- [x] Establecer cómo los atributos existentes de la ranura Arma —daño, crítico y
  cadencia— afectan a cada kit.
- [x] Conservar el arco como referencia de regresión y no cambiar su balance sin
  necesidad.

### 2. Crear la selección previa a la partida — implementado

- [x] Añadir una vista accesible desde **Jugar**, antes de iniciar el combate.
- [x] Presentar las tres armas, su estilo y resumen de sus tres habilidades.
- [x] Iniciar con el arma seleccionada y guardarla en el estado de esa partida.
- [x] Permitir volver al menú desde la selección sin iniciar una partida.
- [x] Definir la experiencia de **Reintentar**: reiniciar con la misma arma; volver
  a la selección para cambiar de arma desde el menú.

### 3. Integrar el arma elegida con equipo y estado — implementado

- [x] Inicializar la selección antes de recalcular las estadísticas del personaje.
- [x] Hacer que la ranura Arma muestre el arma seleccionada y sus mejoras se
  apliquen al kit activo.
- [x] Preservar las otras cinco ranuras, los costes y la progresión existentes.
- [x] Comprobar que iniciar una nueva partida no conserva estados de cooldown de la
  partida anterior.

### 4. Implementar los ataques automáticos — implementado

- [x] Reemplazar el disparo continuo por el ataque básico de cada arma con cooldown.
- [x] Implementar el ataque intermedio y el definitivo, cada uno con cooldown
  independiente.
- [x] Lanzar ataques cuando haya enemigos cerca, respetando el apuntado y el alcance
  apropiado para cada arma.
- [x] Evitar que todos los ataques listos se activen en un mismo instante si el
  comportamiento resultara confuso o demasiado potente.
- [x] Mantener consistentes el daño, críticos, efectos y retroalimentación de
  combate.

### 5. Actualizar HUD y presentación — implementado

- [x] Mostrar nombre, icono e indicador de recarga para las tres habilidades del
  arma elegida.
- [x] Quitar el escudo desactivado como espacio intermedio del kit.
- [x] Incorporar señales visuales y sonoras que ayuden a distinguir los tres
  estilos.
- [x] Verificar que el HUD se actualice al iniciar y reiniciar con cada arma.

### 6. Balancear y validar — en curso

- [x] Probar selección, inicio y reintento conservando el arma.
- [x] Probar los ataques de cada arma, cooldowns, daño cuerpo a cuerpo y daño
  explosivo a enemigos cercanos.
- [ ] Probar adquisición, alcance y rendimiento contra grupos y jefes durante
  partidas reales.
- [ ] Probar en juego las mejoras de daño, crítico, cadencia y reducción de
  cooldown.
- [x] Confirmar que aparece el menú de muerte y se calcula el puntaje.
- [ ] Completar una partida para revisar oleadas y puntuaciones de principio a fin.
- [ ] Ajustar números tras jugar cada kit en oleadas tempranas y avanzadas.

### 7. Actualizar la documentación permanente — implementado

- [x] Actualizar la ayuda dentro del juego con selección y controles actuales.
- [x] Actualizar `README.md` con las armas, habilidades y diferencias de estilo.
- Eliminar este `PLAN.md` temporal cuando deje de ser útil como registro.
