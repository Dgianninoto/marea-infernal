# Marea Infernal

Juego de acción top-down inspirado en las Mareas Infernales (Helltide) de Diablo IV,
hecho en un **único archivo HTML** con CSS y JavaScript embebidos. No necesita
dependencias ni servidor: se abre directamente en el navegador.

## Jugar

Abre `marea-infernal.html` con doble clic en cualquier navegador moderno.

## Características

- **Marea con temporizador** de 3 minutos y oleadas de demonios que escalan con el tiempo.
- **Progresión**: mata demonios para ganar experiencia, subir de nivel y hacerte más fuerte.
- **Botín con rareza** (Común → Mágico → Raro → Legendario → Único) que genera ítems reales.
- **Sistema de equipo e inventario**: 6 ranuras (arma, casco, pecho, guantes, botas, anillo)
  con afijos que modifican tus stats. Equipa, compara y funde piezas por cenizas.
- **Cenizas candentes** 🔥 para abrir cofres repartidos por el mapa y conseguir loot garantizado.
- **Jefe final**: el Señor de la Marea despierta en los últimos segundos; derrótalo para
  un Legendario y un Único garantizados.
- **Esquive (dash)** con cooldown e invulnerabilidad.
- **Efectos de sonido** generados con Web Audio API (sin archivos externos).
- **Menú principal** con explicación, controles y **tabla de puntuaciones** persistente
  (guardada en `localStorage`).
- Diseño responsivo con controles táctiles (joystick + botones) para móvil.

## Controles

| Acción          | Teclado / ratón           | Móvil                     |
|-----------------|---------------------------|---------------------------|
| Moverse         | `W A S D` / flechas       | Joystick (mitad izq.)     |
| Apuntar/disparar| Ratón + clic izquierdo    | Tocar (mitad der.)        |
| Esquive (dash)  | `Shift`                   | Botón ⚡                   |
| Abrir cofre     | `Espacio`                 | —                         |
| Inventario      | `I`                       | Botón 🎒                   |
| Pausa / menú    | `Esc`                     | —                         |

## Tecnología

HTML5 Canvas, CSS y JavaScript puro (vanilla), todo en un solo archivo.
