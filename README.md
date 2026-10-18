# Distritos

Nombre en clave de un juego de estrategia persistente para móvil ambientado en el universo SURGO. Monorrepositorio en TypeScript: una simulación determinista compartida por cliente y servidor, tablas de contenido fuera del código, y fases con prueba de fuego.

Los documentos de diseño (fundacional, espacio de diseño, estudio de Hades' Star, esquema del paquete `sim`) viven en el proyecto de Claude «SURGO - EL JUEGO»; este repositorio contiene solo código, tablas y pruebas.

## Paquetes

| Paquete             | Qué es                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/sim`      | La simulación: tick fijo, enteros, estado como pliegue de órdenes, hash de estado, azar sembrado. Corre idéntica en cliente y servidor.        |
| `packages/content`  | Tablas JSON validadas por esquema (edificios, obreros, arquetipos, plantillas, acciones) y su compilador. Todo número de equilibrio vive aquí. |
| `packages/protocol` | Sobres de mensajes cliente↔servidor y esquemas de órdenes, intenciones y eventos.                                                              |
| `packages/client`   | Cliente web (Vite + PixiJS) y su envoltorio de Android (Capacitor). En F1 es también el árbitro: guarda el registro en el navegador.           |
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
pnpm check                          # lint + typecheck + test (sim, content y cliente)
pnpm -F @distritos/sim test -- --watch
pnpm -F @distritos/client dev       # el juego en http://localhost:5173 y en la red local
pnpm -F @distritos/client test:e2e  # Chromium: hashes contra Node y la página de juego
```

Node 22 y pnpm 10. El clon va fuera de carpetas sincronizadas (OneDrive, Drive): `node_modules` y `.git` no se llevan bien con ellas.

### Jugar y probar en el móvil

Cada commit en `main` con la CI en verde se publica en **https://santi-patic.github.io/Distritos/** y deja el APK de Android en **https://santi-patic.github.io/Distritos/distritos.apk** (de depuración: hay que permitir instalar aplicaciones de origen desconocido). La partida vive en el navegador o en la aplicación: el registro de órdenes y la hora del tick 0; al abrir se repite y se pone al día. Desde el menú se exporta (archivo o portapapeles) para mandarla, y se carga una exportada: al cargarla se comprueba que el hash coincide en el tick en que se exportó. El menú dice la versión (commit), las reglas y las tablas.

En local, `pnpm -F @distritos/client dev` imprime una dirección «Network» (`http://192.168.x.x:5173`) que abre el juego desde el móvil en la misma wifi. `?seed=<hex>` en la URL cambia la finca al crear una partida nueva (por defecto todos los probadores tienen la misma). Los hashes dorados (`packages/sim/test/fixtures`, `packages/content/test/fixtures`) son los mismos que verifica la CI: si `pnpm check` pasa en otra máquina, esa máquina simula igual.

### Prueba de fuego de F1

El protocolo, la hoja de observación y el guion contrastado están en el documento «Prueba de fuego de F1» del proyecto. Dos herramientas en el repositorio:

- **Informe de las partidas:** **https://santi-patic.github.io/Distritos/informe.html** (no está enlazado desde el juego). Se le dan las partidas que exportan los probadores y las repite con el mismo sim: por día, entradas, minutos, órdenes, rechazos y cómo iba la casa, y si el hash coincide con el del aparato del probador.
- **Semana simulada:** `packages/content/test/semana.test.ts` juega siete días con las tablas reales y las variantes de `test/semana-variantes.json`, como un jugador que entra a la misma hora cada día. Corre con las pruebas del contenido; para el informe día a día y las semanas como partidas exportadas:

```sh
mkdir -p partidas
SEMANA=semana.md SEMANA_PARTIDAS=partidas pnpm -F @distritos/content exec vitest run test/semana.test.ts
```

(en PowerShell: `$env:SEMANA="semana.md"; $env:SEMANA_PARTIDAS="partidas"; pnpm -F @distritos/content exec vitest run test/semana.test.ts`).

Durante la semana de la prueba no se publica nada en `main`: el juego repite cada partida con las reglas y tablas que tenga al abrirse.

### Cuando cambia una regla o una tabla

```sh
UPDATE_GOLDENS=1 pnpm -F @distritos/sim test
UPDATE_GOLDENS=1 pnpm -F @distritos/content test
```

y una línea en el registro de decisiones diciendo qué cambió.
