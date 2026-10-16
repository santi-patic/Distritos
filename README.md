# Distritos

Nombre en clave de un juego de estrategia persistente para móvil ambientado en el universo SURGO. Monorrepositorio en TypeScript: una simulación determinista compartida por cliente y servidor, tablas de contenido fuera del código, y fases con prueba de fuego.

Los documentos de diseño (fundacional, espacio de diseño, estudio de Hades' Star, esquema del paquete `sim`) viven en el proyecto de Claude «SURGO - EL JUEGO»; este repositorio contiene solo código, tablas y pruebas.

## Paquetes

| Paquete             | Qué es                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/sim`      | La simulación: tick fijo, enteros, estado como pliegue de órdenes, hash de estado, azar sembrado. Corre idéntica en cliente y servidor.        |
| `packages/content`  | Tablas JSON validadas por esquema (edificios, obreros, arquetipos, plantillas, acciones) y su compilador. Todo número de equilibrio vive aquí. |
| `packages/protocol` | Sobres de mensajes cliente↔servidor y esquemas de órdenes, intenciones y eventos.                                                              |
| `packages/client`   | Cliente web (Vite + PixiJS); Capacitor para móvil más adelante.                                                                                |
| `packages/server`   | Servidor Node (F2 en adelante).                                                                                                                |

## Reglas de la simulación

1. Tick fijo (100 ms); todo el estado avanza por ticks, nunca por reloj de pared.
2. Aritmética entera: sin coma flotante en la lógica. Lo impone ESLint (`eslint.config.js`, bloque «paquete sim»).
3. Estado igual a pliegue de órdenes: una partida es su lista de órdenes; el estado se reconstruye ejecutándola.
4. Generador aleatorio con semilla dentro del estado.
5. Contenido en tablas, nunca en código.
6. Un hash dorado que cambia es una regla que cambió: el commit lleva una línea en el registro de decisiones.

## Trabajo diario

```sh
pnpm install
pnpm check          # lint + typecheck + test
pnpm -F @distritos/sim test -- --watch
```

Node 22 y pnpm 10. El clon va fuera de carpetas sincronizadas (OneDrive, Drive): `node_modules` y `.git` no se llevan bien con ellas.
