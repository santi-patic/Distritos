# Distritos — reglas de trabajo en este repositorio

Juego de estrategia persistente para móvil en el universo SURGO (nombre en clave: Distritos). Los documentos de diseño viven en el proyecto de Claude «SURGO - EL JUEGO»: Documento fundacional (visión, pilares, registro de decisiones, hoja de ruta), Espacio de diseño, Estudio de Hades' Star, Esquema del paquete sim. Este repositorio es solo código, tablas y pruebas.

## Lo que no se negocia en el código

- **Determinismo en `packages/sim/src`**: enteros seguros, sin coma flotante, sin reloj de pared, sin `Math.random`, sin iteración sin orden. Lo impone ESLint (`eslint.config.js`, bloque «paquete sim»); las excepciones (`arith.ts`, `rng.ts`, `hash.ts`, `iter.ts`, `serialize.ts`) están ahí a propósito y no se amplían.
- **El registro de órdenes es la verdad.** El estado se reconstruye con `replay`; una orden inválida queda en el registro con evento `rejected`, nunca se borra.
- **Ningún número de equilibrio en código.** Costes, duraciones, velocidades, pesos, plazos y umbrales van a tablas (`packages/content`, y `packages/sim/test/content.ts` para las pruebas).
- **Hashes dorados.** `packages/sim/test/fixtures/*.json` llevan hashes de estado por tick. Si un cambio los altera, es un cambio de regla: se regeneran con `UPDATE_GOLDENS=1 pnpm -F @distritos/sim test` y el commit lleva una línea para el registro de decisiones.
- **Se reserva el hueco, no se escribe la regla.** Los campos de F2–F5 existen en los tipos y están vacíos; no se implementa una mecánica antes de su fase.
- **Lo de F1 es opcional en las tablas.** Sin almacenes, flujos, tareas ni pizarra, las reglas son las de F0: los dorados de F0 (`f0-basic`, `f0-real`) lo vigilan. El sim tiene tres contenidos de prueba: `test/content.json` (F0), `test/content-f1.json` (F1, con un día de 10 minutos para poder comparar tick a tick) y `test/content-f1r.json` (F1 con sitios, recados y rutas, con el mismo día corto).
- **Rápido = lento.** `advance` acumula los flujos de un tramo de una vez; tiene que dar exactamente lo mismo que `step` tick a tick. Cualquier regla nueva que cambie una tasa tiene que declarar su suceso en `nextEventTick`.

## Comandos

```sh
pnpm install
pnpm check                      # lint + typecheck + test
pnpm -F @distritos/sim test     # solo el sim
```

Node 22, pnpm 10. La CI corre la batería en ubuntu y windows; los hashes tienen que coincidir.

## Fases

F0: fundamentos del sim y determinismo (cerrada el 17 oct 2026). F1 (en curso): casa jugable. F2: servidor. Cada fase tiene una prueba de fuego con personas; no se empieza la siguiente sin pasarla.
