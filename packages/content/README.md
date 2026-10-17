# @distritos/content

Tablas de contenido del juego y su compilador. Todo número de equilibrio vive aquí; el código no lleva ninguno.

## Tablas (`tables/`)

| Tabla | Qué fija | Unidades |
| --- | --- | --- |
| `scenes.json` | Tick, ciclo día-noche y curva de luz, tamaño del hexágono y tope de puesta al día por tipo de escena | `tickMs` ms; `daySeconds` y la curva en segundos; `hexSizeMm` mm; `maxCatchupDays` días |
| `archetypes.json` | Qué puede haber en un terreno de cada arquetipo (terrenos con peso, hallazgos por terreno, dotación inicial) y su nivel de experiencia | desplazamientos en mm; stocks en la unidad de cada recurso (energía en J) |
| `templates.json` | Plantillas de distrito: terrenos (id, arquetipo, sector central, radio) y tierra común | — |
| `elements.json` | Elementos y su categoría visual (`fixed`, `resource`, `site`) | — |
| `mobiles.json` | Los cuatro números de cada tipo de móvil y su tabla de nombres | velocidad en mm/s |
| `terrains.json` | Terrenos y su categoría | — |
| `actions.json` | Coste y duración de las acciones (abrir un sector) | energía en J; duración en s |

Cada tabla tiene su esquema en `schemas/` (JSON Schema draft-07); VS Code los aplica al editar (`.vscode/settings.json`). El compilador (`src/compile.ts`) valida, comprueba referencias cruzadas, convierte segundos a ticks y el hexágono a retícula entera, y calcula el hash del contenido compilado, que entra en el estado de cada escena.

## Estado de los números

Los valores de F0 son provisionales: sirven para que el sim arranque y para las pruebas de determinismo. El diseño de detalle de la casa (F1) fija los de verdad; cambiarlos aquí no toca código, pero sí cambia el hash del contenido y, con él, los hashes dorados de las escenas que lo usen.
