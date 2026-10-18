import { describe, expect, it } from 'vitest';
import { content as loadContent } from '@distritos/content';
import { RULES_VERSION, advance, createScene, hashState } from '@distritos/sim';
import { analyze } from '../src/report.js';
import { newSave, type ExportData } from '../src/save.js';

const content = loadContent();
const TICK = content.scenes.district.tickMs;
const DAY = content.scenes.district.dayTicks;
const HOUR = 3_600_000 / TICK;
const MIN = 60_000;
/** Creada el lunes 19 a las 10:00 de Madrid (08:00 UTC). */
const ANCHOR = Date.UTC(2026, 9, 19, 8);

/** Una partida de dos días exportada el segundo, con su comprobación. */
function exported(): ExportData {
  const save = newSave({
    template: 'f1_casa',
    seed: 'f1f1f1f1f1f1f1f1',
    actor: 'local',
    plot: 'p1',
    nowMs: ANCHOR,
    tickMs: TICK,
    dayTicks: DAY,
    tzOffsetMin: -120,
    contentHash: content.hash,
    rules: RULES_VERSION,
  });
  // Medianoche local del primer día: 14 h después de crearla. El segundo día, una ruta a las 09:00.
  const midnight = 14 * HOUR;
  const nine = midnight + 9 * HOUR;
  save.log = [
    { seq: 1, tick: 0, actor: 'local', kind: 'reveal', args: { mobile: 'm1', hex: '1,0' } },
    { seq: 2, tick: 1, actor: 'local', kind: 'reveal', args: { mobile: 'm1', hex: '0,1' } },
    { seq: 3, tick: nine, actor: 'local', kind: 'route', args: { mobile: 'm2', stops: ['e8', 'e9'] } },
  ];
  save.sessions = [
    { start: ANCHOR, end: ANCHOR + 8 * MIN },
    { start: ANCHOR + 3 * 3_600_000, end: ANCHOR + 3 * 3_600_000 + 30_000 },
    { start: ANCHOR + nine * TICK, end: ANCHOR + nine * TICK + 5 * MIN },
  ];
  const until = nine + (30 * MIN) / TICK;
  const s = createScene(save.params, content);
  advance(s, save.log, until, content);
  save.seenTick = until;
  return {
    ...save,
    exportedAt: ANCHOR + until * TICK,
    check: { tick: until, hash: hashState(s), contentHash: content.hash, rules: RULES_VERSION },
    client: { userAgent: 'prueba', timeZone: 'Europe/Madrid', lang: 'es', build: 'local' },
  };
}

describe('informe de una partida exportada', () => {
  it('por día local del jugador: entradas, minutos, órdenes, rechazos y cómo va la casa', () => {
    const r = analyze(exported(), content, 'local');
    expect(r.check).toBe('same');
    expect(r.sameTables).toBe(true);
    expect(r.days.map((d) => d.date)).toEqual(['2026-10-19', '2026-10-20']);
    const [one, two] = r.days;
    expect(one).toMatchObject({
      day: 1,
      sessions: 2,
      orders: { reveal: 2 },
      rejected: 1,
      sectors: 2,
      workers: 2,
    });
    expect(one?.minutes).toBeCloseTo(8.5);
    expect(two).toMatchObject({ day: 2, sessions: 1, minutes: 5, orders: { route: 1 }, rejected: 0 });
    // La ruta del almacén a la cocina lleva la leña: un recado entregado, 2 Águilas.
    expect(two?.errands).toBe(1);
    expect(two?.eagles).toBe(2);
  });

  it('una exportación que no da su hash, o hecha con otras tablas, se señala', () => {
    const bad = exported();
    bad.check.hash = '0'.repeat(64);
    expect(analyze(bad, content, 'local').check).toBe('differs');
    const other = exported();
    other.check.contentHash = 'otra';
    expect(analyze(other, content, 'local').sameTables).toBe(false);
  });
});
