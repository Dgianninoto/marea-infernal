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
  Mago lanza orbes y un meteorito de área; el Nigromante barre con su guadaña, invoca esqueletos y cosecha vida; el Bárbaro golpea de cerca con tajos,
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
  Kraken Abisal (10), Coloso Abisal (20), Medusa de Magma (30) e Ídolo Rúnico (40).
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
  **Continuar**; puedes revisar el inventario antes de seguir. Al entrar en el intermedio
  recuperas toda la vida y se recargan las habilidades y el esquive. Los esqueletos nacidos del
  Nigromante detienen su temporizador de 10 s mientras dura el intermedio.
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

Los enemigos comunes tienen un tamaño un 25 % mayor, los jefes un 10 % y el duende
de botín un 30 % (incluidos sus radios de colisión). Cuando el duende queda completamente
fuera de pantalla, una flecha dorada con la etiqueta «Duende» indica su dirección.
El duende usa el diseño de Krampus, con cuernos, pelaje y saco de tesoros; conserva su
comportamiento. Los cofres se dibujan un 30 % más grandes, sin cambiar su alcance de apertura.

El HUD inferior (estilo Diablo) agrupa la **vida** (orbe rojo a la izquierda),
la **experiencia con el nivel** (barra encima de las habilidades) y las tres
**habilidades** del arma. El orbe late cuando la vida baja del 25 %.

El botón **Debug ▾**, arriba a la izquierda, despliega los controles para avanzar
oleada, activar cenizas infinitas o invulnerabilidad, invocar un goblin y subir nivel.
El menú se cierra al pulsar fuera o con `Esc`. Usar cualquiera de estos controles
impide guardar la puntuación de esa partida; abrir el menú no afecta al ranking.

## Puntuaciones

Al terminar una partida el resultado **solo se guarda si pulsas el botón Guardar** (o Enter en el campo de nombre); si sales sin guardar, o abandonas la partida, no se registra nada. Se guarda: clase, nivel, oleada, bajas, cenizas totales, jefes derrotados, si ganaste o perdiste y el puntaje. La tabla de
puntuaciones y el récord se almacenan localmente en el navegador (`localStorage`);
no se sincronizan entre dispositivos o navegadores.

## Archivos del proyecto

- `index.html`: estructura del juego y orden de carga de scripts.
- `css/estilos.css`: estilos, HUD (dock con orbe de vida), menús, overlays y modo táctil.
- `js/mecanica.js`: estado, oleadas, combate, inventario y puntuaciones.
- `js/personajes.js`: movimiento, disparo, habilidades y progresión del jugador.
- `js/nigromante.js`: habilidades, invocaciones aliadas y renderizado del Nigromante.
- `js/jefes.js`: jefes, sus ataques y el Desafío final.
- `js/enemigos.js`: enemigos, cofres, jefes y renderizado asociado.
- `js/tactil.js`: controles táctiles (cruceta, esquive, cofre, pausa y apuntado automático). Solo actúa en modo táctil.
- `assets/bosses/`: los ocho sprites SVG de los jefes de oleada y del Desafío final, cargados desde archivos independientes.
- `assets/enemies/`, `assets/archer/`, `assets/mage/` y `assets/goblin/`: diseños activos de enemigos y personajes.
- `assets/chest/` y `assets/ui/`: cofres y elementos gráficos de la interfaz.
- `assets/necro/`: sprites del Nigromante y sus esqueletos espectrales.

## Nigromante

Cuarta clase seleccionable, con guadaña y 95 de vida base (más el equipo inicial).
Sus tres ataques se activan automáticamente con los mismos controles de las otras clases:

- **Siega espectral:** barrido de guadaña en arco, siempre igual: 70° de apertura y 55 px de largo, empezando a 120 px
  del personaje (cubre de 120 a 175 px; el hueco interior no golpea). Ya no cambia de arco ni de radio con el Daño
  (constantes `NECRO_SWEEP_*` en `js/nigromante.js`). Un cono fantasma indica hacia dónde saldrá el siguiente barrido. Recorre su arco en 0,15 s (el Tajo del Bárbaro tarda 0,22 s) y suena como un silbido grave de aire cortado por la guadaña. Hace el doble del Daño del arma (`NECRO_SWEEP_DMG_MULT`). Cadencia base: 0,4 ataques por segundo, y cada punto de Cadencia en los guantes suma 0,15 A/s.
- **Hueste espectral:** se lanza siempre que esté disponible (no depende de las bajas) e invoca 3 esqueletos arqueros
  (`NECRO_HUESTE_COUNT`) que no caducan, hasta **Mando** aliados simultáneos en el mapa (ver abajo). Recarga base: 8 s. Atacan al enemigo o jefe
  cercano y atraviesan obstáculos; sus flechas también los atraviesan (`noWalls`). Cada uno tiene el 35 % de la vida máxima del personaje (`NECRO_HUESTE_HP_RATIO`).
  Cada golpe hace el 15 % del Daño del Nigromante (`NECRO_MINION_DAMAGE_RATIO`) y atacan cada 1 s con arma Común,
  0,8 s Mágica, 0,6 s Rara, 0,4 s Legendaria y 0,2 s Única (`NECRO_MINION_ATTACK_CD_BY_RARITY`).
- **Aura pestilente (pasiva):** aura permanente alrededor del Nigromante (300 px). Cada enemigo
  o jefe que entra recibe una carga de veneno que le quita un 30 % del daño del arma cada 1 s. Si al terminar ese
  segundo sigue dentro del aura recibe otra carga y el daño pasa a 60 % (luego 90 %…); si ya salió, pierde una carga
  (al llegar a 0 el veneno desaparece). Sin tope de cargas por defecto (`NECRO_POISON_MAX_STACKS`). Ya no cura.

**Esqueletos por bajas:** un contador oculto cuenta cada baja (de cualquier origen: guadaña, veneno, esqueletos). La baja que
completa 3 (`NECRO_KILLS_PER_SKELETON`) levanta un esqueleto con la vida máxima del bicho que acaba de morir y el contador
vuelve a 0.

**Esqueleto de jefe:** al derrotar a un jefe con el Nigromante, este reaparece de inmediato como esqueleto en el mismo lugar, con su vida máxima y su tamaño. No tiene temporizador de desaparición (dura hasta que lo destruyan), no ocupa cupo de Mando y no suma al contador oculto de bajas (ver `registerNecromancerKill` en `js/nigromante.js`).

**Reserva y luz verde:** si al invocar (por bajas o con Hueste) ya hay tantos esqueletos en el mapa como el Mando, los que no caben **no aparecen en el mapa**: pasan a una **reserva** (buffer) y la cuenta del contador supera el límite (por ejemplo 12/10). Cuando un esqueleto del mapa muere (en combate o por caducidad) entra en su lugar el siguiente de la reserva (en orden de llegada, junto al personaje, con la vida y el tipo con que se invocó; los nacidos de bajas empiezan entonces sus 10 s) y la cuenta baja en 1. La reserva no tiene temporizador propio. Mientras la cuenta esté por encima del límite, y como mínimo `NECRO_OVER_MIN` = 5 s desde la última entrada en reserva, se enciende una **luz verde** en la barra del contador y en los esqueletos del mapa, y la vida de estos se multiplica por `NECRO_OVER_HP_MULT` = 2 (también la actual). Al acabar el efecto la vida máxima vuelve a la normal y la actual se recorta si la supera. La barra discreta del dock muestra la cuenta en el centro (cuenta/Mando).

**Mando:** stat especial del Nigromante (reemplaza al Poder y al Crítico). Fija el máximo de esqueletos simultáneos:
10 de base y +1 por cada punto gastado en la pieza de arma, multiplicado por la rareza de la pieza como el resto de
stats (Común ×1, Mágico ×1,5, Raro ×2, Legendario ×3, Único ×5; el resultado se redondea hacia abajo). Se define en `WEAPONS.necro.weaponStats` (`js/mecanica.js`). El Nigromante es un 10 % más grande que el resto de héroes (radio 22 en vez de 20). Los esqueletos nacidos de bajas nacen donde murió el bicho que completó la cuenta y tienen el tamaño (radio) de ese bicho, igual que su vida; los de Hueste usan un sprite propio, más grande e imponente y un 20 % mayor (`NECRO_ARCHER_SCALE`, `assets/necro/skeleton-archer.svg`).

**Comportamiento de los esqueletos:** los 3 esqueletos arqueros de Hueste disparan proyectiles como la flecha básica del Arquero (700 px/s, alcance `NECRO_MINION_RANGE` = 240 px, avanzan hasta `NECRO_MINION_HOLD` = 170 px de su blanco). Eligen el enemigo más cercano con hueco, dando prioridad a los que estén a menos de `NECRO_TARGET_PRIORITY_R` = 400 px del personaje (si no hay ninguno, cualquiera a menos de 900 px de ellos). Cada bicho admite `NECRO_TARGET_PER_ENEMY` = 2 esqueletos a la vez; jefes y duendes admiten el 50 % del Mando en esqueletos (`NECRO_TARGET_BOSS_MANDO_RATIO`, mínimo 2). Si todos están llenos se suman al menos ocupado. Mantienen el blanco hasta que muere, salvo que quede fuera de la zona de 400 px y entre otro enemigo en ella. Los arqueros salen de los charcos de área (bomber y jefes) desde que se marcan y no entran en ellos (`NECRO_DODGE_MARGIN` = 8 px de margen). Máxima prioridad: el bicho que golpea al personaje queda marcado `NECRO_AGGRO_TIME` = 3 s y lo fijan hasta el 50 % del Mando en esqueletos (`NECRO_AGGRO_MANDO_RATIO`). Los esqueletos nacidos de bajas usan el mismo sistema de blancos pero atacan cuerpo a cuerpo. Todos chocan entre sí y con los enemigos comunes para no apilarse (los jefes y el duende los atraviesan). Los enemigos comunes persiguen al esqueleto o al personaje, el que tengan más cerca (los jefes y el duende siguen al personaje).

Los esqueletos reciben daño de los enemigos (contacto, proyectiles, zonas de área y rayos), con 0,5 s de invulnerabilidad
tras cada golpe, y desaparecen al llegar a 0 de vida; además, los esqueletos nacidos de bajas caducan a los 10 s (`NECRO_MINION_LIFE`) + 0,1 s por cada punto de Mando (`NECRO_MINION_LIFE_PER_MANDO`, función `necroMinionLife()`), mientras que los arqueros de Hueste no. No cuentan como enemigos de oleada ni bloquean los intermedios. El daño de sus
ataques se atribuye a la habilidad que los invocó en el resumen final. El ranking identifica la clase como Nigromante.

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
## Audio y musica

El boton de volumen (junto al de silencio) abre tres controles: general, musica y habilidades y efectos. El general controla ambos canales; los otros dos permiten equilibrarlos por separado. Los niveles se guardan en este navegador; silenciar conserva los valores elegidos. Llevar musica a 0 permite jugar solo con efectos; llevar habilidades y efectos a 0 deja solo la musica.

La banda sonora se genera en `js/musica.js` mediante Web Audio, sin servicios ni descargas. Son composiciones originales de 32 compases con sintesis de consola. La musica continua al abrir el inventario; se detiene con la pausa, el fin de partida o al ocultar la pestaña. Cambia automaticamente al entrar en cada tramo. El menu principal y la seleccion de personaje comparten una pista chill que comienza tras la primera interaccion que habilita el audio del navegador.

| Oleadas | Pista | Tempo |
| --- | --- | --- |
| 1–10 | Falla tectonica | 128 BPM |
| 11–20 | Ceniza digital | 112 BPM |
| 21–30 | Marea espectral | 84 BPM |
| 31–40 | Antes del umbral | 136 BPM |
| 41–50 | Pulso de hierro | 140 BPM |
| Desafio final | Alarma en el bastion | 156 BPM |
| Menu y seleccion | Refugio de cenizas | 76 BPM |

**Falla tectonica** y **Antes del umbral** combinan riffs pesados y breakdowns; **Ceniza digital** tiene groove pesado y melodia de pulsos; **Pulso de hierro**, breakbeat rapido con bajo movil y notas cortas brillantes; **Marea espectral**, medio tiempo atmosferico con acordes sostenidos y percusion espaciada. El desafio final tiene un motivo cromatico y un pulso rapido de tension; el menu usa acordes suaves y percusion discreta. El panel de volumen muestra la pista actual y esta accesible tambien desde el menu.

El inventario se abre con **I** y utiliza el layout de pantalla completa de la version descargada de GitHub. Los controles de audio siguen accesibles sobre el inventario. La musica continua sonando mientras se revisa el equipo.

El teclado limpia las teclas retenidas al perder el foco u ocultar la pestaña y devuelve el foco al lienzo al volver a una partida. WASD funciona aun con botones o controles de volumen enfocados; las flechas de un deslizador siguen ajustando su valor y los campos de texto conservan la escritura normal.

## Portales entre etapas

Al completar las oleadas **10, 20, 30, 40 y 50**, el juego espera a que no queden enemigos vivos (incluido el duende), jefes ni enemigos pendientes de aparecer. Entonces abre un portal ovalado animado cerca del personaje, con un camino libre para acercarse. La vida y las habilidades se recuperan, como en los descansos habituales.

Al superponerse con el ovalo visible aparece **Pasar a la siguiente etapa**. El dibujo y el area de interaccion comparten centro y dimensiones; el portal es ligeramente mas grande que el personaje. Se cruza con **E**, **Enter** o el boton **Cruzar** (tambien disponible en tactil). No avanza automaticamente y se puede seguir recogiendo cofres o revisando el inventario. El portal de la oleada 50 lleva al **Desafio final**. Los descansos de las oleadas 5, 15, 25, 35 y 45 conservan el boton Continuar.

El cambio lleva al personaje y su hueste al centro de la siguiente arena. El nuevo tramo selecciona su escenario y musica mediante el flujo habitual. La animacion se dibuja en canvas desde `js/portal.js`, sin imagenes ni descargas adicionales.

## Integracion con main (build 0.258)

Se conserva el contador de DPS efectivo de GitHub: dano real de los ultimos 15 segundos de juego, sin sobreataque, dividido entre 15 y actualizado cada segundo. El boton de musica permite silenciar solo la banda sonora sin cambiar su volumen ni los efectos, y guarda esa preferencia. Los portales y las correcciones de E/Enter y apertura de cofres se integran sobre esa version.

## Personalidad visual del barbaro (build 0.260)

El barbaro tiene respiracion de reposo, botas que alternan al caminar, inclinacion del torso y tela que acompaña el movimiento. La armadura incorpora remaches y desgaste; el hacha sostenida acompaña el barrido que ya existe. Todo se calcula en las funciones de dibujo, sin modificar el estado de combate: estadisticas, daño, habilidades, recargas, velocidad y colisiones conservan sus valores y funcionamiento.

En el build **0.261**, el arquero suma inclinacion agil, capa y carcaj animados y vibracion de cuerda al disparar. La maga incorpora flotacion suave, tela movil, dos cristales ornamentales y brillo en el baston. El nigromante tiene una respiracion mas lenta, tunica en movimiento, humo tenue y detalles luminosos en la guadaña. Estas animaciones tambien son de dibujo y no agregan proyectiles, invocaciones ni efectos de combate. Las etiquetas visibles del duende del tesoro ahora muestran **Krampus**.

## Señales de peligro (build 0.262)

Se refuerzan los avisos que ya existian: circulos de area, aterrizaje de jefes y corredores de rayos. El borde oscuro mejora el contraste con el escenario; los trazos discontinuos indican preparacion y los continuos indican ataque activo. El aterrizaje incorpora cuatro flechas hacia adentro y los rayos muestran su direccion. Los limites siguen usando el radio, ancho y longitud originales de cada ataque.

El progreso visual de las bombas toma la duracion observada de cada aviso, en lugar de asumir siempre 1,1 segundos. Esa referencia se guarda en una WeakMap exclusiva del dibujo, sin modificar los ataques. El daño, los tiempos de preparacion, las colisiones y las estadisticas permanecen intactos.

## Legibilidad de enemigos (build 0.266)

El saltador, el bombardero de area y el hechicero usan colores planos mas claros: verde, dorado y azul respectivamente. Se conservan las formas, contornos, tamaños y todos los valores de combate.

## Controles moviles y pantalla completa (build 0.267)

La cruceta tiene un area tactil mas amplia y un centro que sigue al dedo. Conserva las ocho direcciones y el movimiento normalizado del juego; una zona muerta y un margen angular evitan cambios involuntarios de diagonal. La captura identifica el dedo de movimiento para poder esquivar con el otro. Al soltar, cancelar, perder foco, abrir inventario/pausa o redimensionar la pantalla se limpia la entrada para evitar movimiento retenido.

El boton **⛶** aparece en el menu, junto a los controles de audio y en el aviso de girar el dispositivo. Solicita pantalla completa con la interfaz del navegador oculta y, cuando esta permitido, orientacion horizontal. Permite salir de ese modo sin abandonar la partida. Si el navegador no ofrece o rechaza la API, muestra ayuda sin bloquear el juego: en iPhone, abrir desde Safari y añadir a la pantalla de inicio. La configuracion web incluye modo standalone para esa apertura; no agrega funciones offline.

El alto del juego sigue el viewport visible, incluidos los cambios por barras del navegador, y conserva los margenes de seguridad. La seleccion de personaje en movil vuelve a permitir desplazamiento. El apuntado automatico, la velocidad, las habilidades y las estadisticas no cambian. Las verificaciones de eventos y pantalla completa se realizaron con simulaciones; queda validar la ergonomia en dispositivos Android/iPhone reales.

En el build **0.269**, los controles de sonido y pantalla completa se apilan verticalmente en el lateral derecho. El inventario reserva ese espacio para evitar que se superpongan con los botones de mejora; el panel de volumen se despliega hacia la izquierda. El boton Inventario conserva su aspecto y suma una zona tactil invisible de 48 px de alto y 10 px adicionales a cada lado. El ajuste solo afecta al modo tactil.

## Balance, DPS por tramos y esqueleto de jefe (build 0.268)

La pantalla final muestra el DPS promedio por tramo de 10 oleadas. El dash recarga en 2 s para todas las clases y la velocidad por nivel baja a +2. El Arquero gana 0,2 A/s por punto de Cadencia. El Nigromante ajusta su Siega (x2 de Daño, 0,4 A/s base, +0,15 A/s por punto), Velocidad (130 base, +1 por punto de botas), Mando (8 base) y la vida de los arqueros de la Hueste (35 %), y al matar a un jefe este reaparece de inmediato como esqueleto permanente.
