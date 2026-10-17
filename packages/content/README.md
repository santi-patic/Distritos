# @distritos/content

Tablas de contenido del juego y su compilador. Todo número de equilibrio vive aquí; el código no lleva ninguno.

## Tablas (`tables/`)

| Tabla             | Qué fija                                                                                                                                                                  | Unidades                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `scenes.json`     | Tick, ciclo día-noche y curva de luz escalonada, tamaño del hexágono, tope de puesta al día, luz mínima de trabajo y hora del paso diario                               | `tickMs` ms; `daySeconds`, la curva y `dailyAt` en segundos del día; `workLight` en milésimas |
| `archetypes.json` | Qué puede haber en un terreno de cada arquetipo y su dotación inicial: elementos con existencias, obreros, nexos de la finca cableada                                   | desplazamientos en mm; existencias en la unidad de cada recurso                                |
| `templates.json`  | Plantillas de distrito: terrenos y tierra común con sus elementos fijos (`f1_casa`: la casa de F1 con el punto de carga y el almacén del común)                          | —                                                                                              |
| `elements.json`   | Elementos: categoría visual, almacenes, qué producen y consumen, si se encienden, camas, suciedad y ciclos                                                               | tasas con su periodo (`per`: `s`, `h`, `dia`); 400 J por `s` son 400 W                        |
| `resources.json`  | Recursos físicos (en almacenes) o de libro (Eagles, en el jugador), y orden de resolución de los flujos                                                                  | —                                                                                              |
| `mobiles.json`    | Los cuatro números de cada obrero, su tabla de nombres, lo que come y cuánto rinde sin comer                                                                             | velocidad en mm/s; rendimiento en milésimas                                                    |
| `terrains.json`   | Terrenos y su categoría                                                                                                                                                   | —                                                                                              |
| `actions.json`    | Abrir un sector: coste, duración y duración de la primera vez                                                                                                             | energía en J; duraciones en s                                                                  |
| `tasks.json`      | Tareas de los obreros sobre un elemento (sacar agua, recoger, talar, picar, limpiar), con su variante con herramienta                                                     | duraciones en s; cantidades en la unidad de cada recurso                                      |
| `builds.json`     | Edificios construibles: duración, coste, distancia mínima y si tienen que estar junto a algo                                                                             | s; mm                                                                                          |
| `links.json`      | Nexos: qué llevan (cable energía, canal agua) o cuánto aceleran (camino), duración y coste por tramo                                                                      | s por tramo de `unitMm`                                                                        |
| `hires.json`      | Coste de contratar cada tipo de obrero                                                                                                                                    | —                                                                                              |
| `board.json`      | Pizarra del común: moneda y encargos que se publican uno por día, por orden                                                                                              | cantidades en la unidad del recurso; si es trabajo, en segundos                                |

Cada tabla tiene su esquema en `schemas/` (JSON Schema draft-07); VS Code los aplica al editar (`.vscode/settings.json`). El compilador (`src/compile.ts`) valida, comprueba referencias cruzadas (recursos, elementos, nexos, orden de los flujos), convierte segundos a ticks y tasas a unidades por día, calcula la retícula entera del hexágono y el hash del contenido compilado, que entra en el estado de cada escena.

## Estado de los números

Los números de F1 son los de partida del «Diseño de detalle de la casa» (§12). Donde el diseño no da número o se contradice, hay un valor provisional anotado en las preguntas abiertas del registro (P2: madera y piedra con las tareas `talar` y `picar`; P8: coste en madera del cobertizo y comida inicial). Cambiar una tabla no toca código, pero sí cambia el hash del contenido y, con él, los dorados que la usen (`test/fixtures/f1-real.json`).
