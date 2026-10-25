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
- **Lee las zonas de impacto:** el meteorito marca el área antes de caer y la
  muestra al impactar. El hacha dibuja el arco frontal del tajo y el radio de
  su golpe sísmico.
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
  ("Prepárate para el Desafío final"). Al continuar aparecen **tres jefes al azar de los cinco, a la
  vez**, con 300.000 de vida cada uno y sin enemigos normales. Al derrotar a los tres ganas: hay fuegos
  artificiales y puedes escribir tu nombre para el registro de puntuaciones.
- **Descansa entre ciclos:** cada cinco oleadas, elimina a todos los enemigos
  para entrar en un intermedio. No aparecerán nuevos enemigos hasta que pulses
  **Continuar**; puedes revisar el inventario antes de seguir.
- **Observa los escenarios:** el entorno cambia cada 10 oleadas.

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

## Puntuaciones

Al terminar una partida el resultado **solo se guarda si pulsas el botón Guardar** (o Enter en el campo de nombre); si sales sin guardar, o abandonas la partida, no se registra nada. Se guarda: clase, nivel, oleada, bajas, cenizas totales, jefes derrotados, si ganaste o perdiste y el puntaje. La tabla de
puntuaciones y el récord se almacenan localmente en el navegador (`localStorage`);
no se sincronizan entre dispositivos o navegadores.

## Archivos del proyecto

- `index.html`: estructura del juego y orden de carga de scripts.
- `css/estilos.css`: estilos, HUD, menús y overlays.
- `js/mecanica.js`: estado, oleadas, combate, inventario y puntuaciones.
- `js/personajes.js`: movimiento, disparo, habilidades y progresión del jugador.
- `js/jefes.js`: jefes, sus ataques y el Desafío final.
- `js/enemigos.js`: enemigos, cofres, jefes y renderizado asociado.
