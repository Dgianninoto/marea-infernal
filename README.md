# Marea Infernal

Juego de acción y supervivencia en arenas, visto desde arriba y hecho con HTML,
CSS y JavaScript. Elige un arma, sobrevive a 50 oleadas de demonios,
mejora tu equipo con cenizas y derrota al Señor de la Marea.

## Jugar

Abre `index.html` en un navegador moderno. No requiere instalación de
dependencias ni servidor web.

## Cómo se juega

- **Sobrevive:** no hay temporizador. La partida termina cuando la vida del personaje
  llega a cero o cuando superas el Desafío final que sigue a la **oleada 50** (victoria).
- **Elige tu clase antes de jugar:** el Arquero combate a distancia con flechas; el
  Mago lanza orbes y un meteorito de área; el Bárbaro golpea de cerca con tajos,
  lanza hachas giratorias y usa ataques de área visibles. La clase queda fija durante esa partida.
  El Mago no tiene crítico: su stat de arma es **Poder** (+2 % por punto), que agranda el
  radio del Meteorito y suma un orbe a la Salva arcana cada 10 % (hasta formar un círculo completo).
  El Arquero puede pasar del 100 % de Crítico (**super crítico**): cada 100 % es un crítico asegurado
  y cada crítico suma +1 al ×1 base; el resto es la probabilidad de uno más (550 % = 5 críticos = ×6 siempre y 50 % de ×7).
- **Lee las zonas de impacto:** el meteorito marca el área antes de caer y la
  muestra al impactar. El hacha dibuja el barrido del tajo y el radio de
  su golpe sísmico.
- **Barrido del Bárbaro:** el Tajo ya no es un cono fijo sino un barrido en sentido horario que dura 0,22 s.
  Empieza con el arco de siempre (~66,5°, con los 38 de Daño iniciales) y cada punto de Daño lo abre más hasta cerrar el
  círculo de 360° cuando el Daño llega a `AXE_SWEEP_FULL_DMG` (100). Con el círculo completo, más Daño agranda su radio
  de 112 px (100 de Daño) a 200 px (`AXE_SWEEP_MAX_DMG` = 380 de Daño) y ahí se detiene. Todas las variables están en
  `js/personajes.js`. Cada enemigo recibe un solo golpe por barrido.
  Un **cono fantasma** transparente muestra hacia dónde saldrá el siguiente barrido (sigue al ratón en vivo, ya que el
  barrido en curso queda fijo) y desaparece cuando el arco llega a 360°. Al subir la Cadencia el área del barrido se vuelve
  más transparente (hasta el 10 % de su opacidad, `AXE_SWEEP_MIN_OPACITY`, con `AXE_MAX_RATE` = 25 A/s).
- **Ataca automáticamente:** cada arma tiene tres ataques —básico, intermedio y
  definitivo— que se activan solos cuando hay enemigos cerca y termina su
  cooldown. Apunta con el ratón para orientar proyectiles y ataques frontales.
- **Muévete:** desplázate por la arena para esquivar peligros y posicionarte.
- **Esquiva:** usa el dash para desplazarte rápidamente y evitar daño. Tiene
  tiempo de recarga e incluye un breve periodo de invulnerabilidad.
- **Sube de nivel:** recoge la experiencia que dejan los enemigos. Cada nivel
  aumenta tus atributos y restaura toda tu vida.
- **Puntaje final:** suma, entre otras cosas, las cenizas totales de la partida —las que tienes y las que ya gastaste en mejoras— a 2 puntos por ceniza.
- **Reúne cenizas:** los enemigos pueden dejar cenizas. También recibes una
  recompensa al superar oleadas y al derrotar jefes.
- **Mejora el equipo:** abre el inventario durante la partida para gastar
  cenizas en las seis piezas iniciales —arma, casco, pecho, guantes, botas y
  anillo—. Cada pieza tiene atributos mejorables; al llegar a +5 puedes subir
  su rareza y continuar mejorándola.
- **Abre cofres:** acércate y pulsa `E` antes de que desaparezcan. Pueden
  aparecer durante las tandas de enemigos (5 % por tanda; si pasan más de 35 tandas
  sin ninguno, aparece uno de inmediato) y siempre aparecen al derrotar al jefe.
- **Prepárate para los jefes:** aparece un jefe distinto cada 10 oleadas:
  Kraken Abisal (10), Cangrejo Acorazado (20), Medusa de Magma (30) e Ídolo Rúnico (40).
  Desde la oleada 20 saltan para aplastar y desde la 30 invocan lluvia de fuego.
- **Desafío final:** tras vencer al Señor de la Marea (oleada 50) hay una última pausa
  ("Prepárate para el Desafío final"). Al continuar aparecen **tres jefes a la
  vez** (variantes del Señor de la Marea: Dagh'Nuul, Yth'Korra y Zul'Gathor), con 300.000 de vida cada uno (en Difícil; ver Dificultades) y sin enemigos
  normales. Si se juntan, hacen el **trío abisal** (como el de los demonios dorados/azules, ver `BOSS_TRIO_*` en
  `js/jefes.js`): avisan con un aura y dos de ellos recorren 120° alrededor del personaje mientras el tercero se queda, para rodearte.
  Durante el trío no atacan ni avanzan. Al derrotar a los tres ganas: hay fuegos
  artificiales y puedes escribir tu nombre para el registro de puntuaciones.
- **Descansa entre ciclos:** cada cinco oleadas, elimina a todos los enemigos
  para entrar en un intermedio. No aparecerán nuevos enemigos hasta que pulses
  **Continuar**; puedes revisar el inventario antes de seguir.
- **Cuidado con los tríos:** si 3 demonios dorados/azules (de área y de rango, en cualquier mezcla) se juntan a menos de 50 px, brillan con un sonido de aviso y se dispersan: uno se queda y los otros dos recorren 120° en sentido horario y antihorario alrededor del personaje, quedando repartidos a su alrededor. Después tienen 8 s de enfriamiento (`TRIO_*` en `js/enemigos.js`).
- **Observa los escenarios:** el entorno y la distribución de obstáculos cambian cada 10 oleadas
  (oleadas 11, 21, 31 y 41). El Páramo de cenizas tiene ruinas de piedra;
  la Cripta de hielo, bloques helados y sarcófagos; Sangre y obsidiana, altares y monolitos.
  Si una nueva cobertura aparece sobre el personaje o el botín, se desplazan al borde para evitar que queden atrapados.
  El Desafío final tiene un escenario exclusivo: **Bastión del umbral**, con piso violeta,
  anillos de latón y bastiones en la periferia. Conserva los tres jefes y las mismas reglas de combate.

## Controles

| Acción | Control |
| --- | --- |
| Moverse | `W`, `A`, `S`, `D` o flechas |
| Apuntar y orientar ataques | Mover el ratón |
| Ataques del arma | Automáticos, con cooldown |
| Esquivar (dash) | `Espacio` |
| Abrir un cofre cercano | `E` |
| Abrir o cerrar el inventario | `I` |
| Pausar o volver desde una pausa | `Esc` |

Los ataques se activan de forma escalonada para no disparar todas las
habilidades a la vez. El inventario también pausa la acción para que puedas
hacer mejoras.

### Móviles y tablets

En pantallas táctiles (detectadas con `(hover: none) and (pointer: coarse)`) el
juego muestra controles en pantalla; en PC no aparece nada de esto y el juego
funciona igual que antes. Para probarlo desde el ordenador añade `?touch=1` a la URL.

| Acción | Control táctil |
| --- | --- |
| Moverse | Cruceta (abajo a la izquierda, 8 direcciones; se puede deslizar el dedo) |
| Esquivar (dash) | Botón 💨 (abajo a la derecha, muestra la recarga). Sin cruceta pulsada, esquiva hacia donde ibas |
| Apuntar | Automático: hacia el enemigo o jefe más cercano (si no hay, hacia donde caminas) |
| Abrir un cofre | Botón 📦, aparece solo cuando hay un cofre al alcance |
| Pausar | Botón ⏸ (sobre el botón de esquive) |
| Inventario | Botón 🎒 del panel superior |

Se juega en **horizontal**: en vertical aparece un aviso para girar el dispositivo
y la partida se pausa sola. El zoom mínimo en móvil es `TOUCH_MIN_ZOOM` (en
`js/mecanica.js`): la cámara sigue al jugador en lugar de mostrar toda la arena.

## Interfaz

El HUD inferior (estilo Diablo) agrupa la **vida** (orbe rojo a la izquierda),
la **experiencia con el nivel** (barra encima de las habilidades) y las tres
**habilidades** del arma. El orbe late cuando la vida baja del 25 %.

## Puntuaciones

Al terminar una partida el resultado **solo se guarda si pulsas el botón Guardar** (o Enter en el campo de nombre); si sales sin guardar, o abandonas la partida, no se registra nada. Se guarda: clase, nivel, oleada, bajas, cenizas totales, jefes derrotados, si ganaste o perdiste y el puntaje. La tabla de
puntuaciones y el récord se almacenan localmente en el navegador (`localStorage`);
no se sincronizan entre dispositivos o navegadores.

## Archivos del proyecto

- `index.html`: estructura del juego y orden de carga de scripts.
- `css/estilos.css`: estilos, HUD (dock con orbe de vida), menús, overlays y modo táctil.
- `js/mecanica.js`: estado, oleadas, combate, inventario y puntuaciones.
- `js/personajes.js`: movimiento, disparo, habilidades y progresión del jugador.
- `js/jefes.js`: jefes, sus ataques y el Desafío final.
- `js/enemigos.js`: enemigos, cofres, jefes y renderizado asociado.
- `js/tactil.js`: controles táctiles (cruceta, esquive, cofre, pausa y apuntado automático). Solo actúa en modo táctil.

## Dificultades

Se eligen en la pantalla de selección de arma (por defecto **Difícil**, la dificultad original). La tabla `DIFFICULTIES`
está en `js/enemigos.js`:

| Dificultad | Bichos: vida (oleada 50) | Bichos: daño (oleada 50) | Vida de los jefes | Multiplicador de daño de los jefes |
|---|---|---|---|---|
| Fácil | x1 (sin multiplicador) | x1 (sin multiplicador) | -50 % | ninguno (x1) |
| Normal | x5 | x3 | -30 % | la mitad |
| Difícil | x15 | x5 | sin cambio | entero |

El escalado de los bichos es lineal desde x1 en la oleada 1 hasta el valor de la tabla en la oleada `ENEMY_SCALE_END` (50);
después sigue con la misma pendiente. El daño de los bichos además lleva siempre el `ENEMY_DMG_MULT` (x1,3). La vida reducida
de los jefes aplica a los de oleada y a los del Desafío final. El multiplicador de daño de cada jefe (`BOSS_DMG_MULT`,
`BOSS_FINAL_DMG_MULT`) se aplica entero en Difícil, a la mitad en Normal y no se aplica (x1) en Fácil.

### Puntuaciones por dificultad

Cada partida se guarda con su dificultad (`difficulty`: `easy`, `normal` o `hard`), tanto en el ranking local como en el global
(Supabase). La pantalla **Puntuaciones** tiene un selector Fácil / Normal / Difícil y abre en la última dificultad elegida; cada
dificultad tiene su propio top 10 (local y global). El récord de la pantalla final se compara dentro de la misma dificultad.
Las partidas guardadas antes de existir las dificultades cuentan como **Difícil**.

**Importante:** hay que volver a correr `supabase-setup.sql` en el SQL Editor de Supabase para crear la columna `difficulty`
(se puede correr más de una vez). Mientras no exista, el juego sigue funcionando: el ranking global solo muestra Difícil y las
partidas Fácil/Normal no se envían al global (quedan en el ranking local).
