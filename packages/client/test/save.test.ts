import { describe, expect, it } from 'vitest';
import {
  exportName,
  localDayOffset,
  newSave,
  parseExport,
  parseSave,
  touchSession,
  type SaveData,
} from '../src/save.js';

const base = {
  template: 'f1_casa',
  seed: 'f1f1f1f1f1f1f1f1',
  actor: 'local',
  plot: 'p1',
  tickMs: 100,
  dayTicks: 864_000,
  contentHash: 'c'.repeat(64),
  rules: '0.2.1',
};

describe('partida guardada', () => {
  it('ancla el tick 0 a un múltiplo del tick y el día a la hora local del jugador', () => {
    // 19 oct 2026, 10:00:00.250 en Madrid (UTC+2, desfase −120 min).
    const now = Date.UTC(2026, 9, 19, 8, 0, 0, 250);
    const s = newSave({ ...base, nowMs: now, tzOffsetMin: -120 });
    expect(s.anchorMs).toBe(now - 50);
    expect(s.params.dayOffset).toBe(10 * 36_000 + 2);
    expect(localDayOffset(Date.UTC(2026, 9, 19, 23, 30), 100, 864_000, -120)).toBe(54_000);
    // Al oeste de Greenwich el día local va por detrás.
    expect(localDayOffset(Date.UTC(2026, 9, 19, 2, 0), 100, 864_000, 300)).toBe(21 * 36_000);
  });

  it('se lee lo que se escribe y se rechaza lo que no es una partida', () => {
    const s = newSave({ ...base, nowMs: 1_000_000, tzOffsetMin: 0 });
    s.log.push({ seq: 1, tick: 5, actor: 'local', kind: 'reveal', args: { mobile: 'm1', hex: '1,0' } });
    s.ranWith = 'x/0.2.1';
    const back = parseSave(JSON.stringify(s));
    expect(back).toEqual(s);
    expect(parseSave('no es json')).toBeNull();
    expect(parseSave(JSON.stringify({ ...s, format: 'otra-cosa' }))).toBeNull();
    expect(parseSave(JSON.stringify({ ...s, params: { ...s.params, seed: 'XYZ' } }))).toBeNull();
    const desordenado: SaveData = {
      ...s,
      log: [
        { seq: 2, tick: 9, actor: 'local', kind: 'move', args: { mobile: 'm1', to: 'e1' } },
        { seq: 1, tick: 5, actor: 'local', kind: 'move', args: { mobile: 'm1', to: 'e2' } },
      ],
    };
    expect(parseSave(JSON.stringify(desordenado))).toBeNull();
    // Una exportación (con campos de más) también es una partida.
    expect(
      parseSave(JSON.stringify({ ...s, exportedAt: 1, check: { tick: 1, hash: 'h' } }))?.log,
    ).toHaveLength(1);
  });

  it('una exportación conserva su comprobación y los datos del aparato; una partida, no los tiene', () => {
    const s = newSave({ ...base, nowMs: 1_000_000, tzOffsetMin: 0 });
    const check = { tick: 7, hash: 'a'.repeat(64), contentHash: 'c'.repeat(64), rules: '0.2.1' };
    const client = { userAgent: 'ua', timeZone: 'Europe/Madrid', lang: 'gl', build: 'abc1234' };
    const exp = parseExport(JSON.stringify({ ...s, exportedAt: 5, check, client }));
    expect(exp).toMatchObject({ exportedAt: 5, check, client });
    expect(parseExport(JSON.stringify(s))).not.toHaveProperty('check');
    // Una comprobación mal formada no impide leer la partida.
    expect(parseExport(JSON.stringify({ ...s, check: { tick: -1 } }))).not.toHaveProperty('check');
    expect(parseExport('no es json')).toBeNull();
  });

  it('cuenta las sesiones: dos aperturas seguidas son una', () => {
    const s = newSave({ ...base, nowMs: 0, tzOffsetMin: 0 });
    touchSession(s, 1_000, 300_000);
    touchSession(s, 60_000, 300_000);
    touchSession(s, 1_000_000, 300_000);
    expect(s.sessions).toEqual([
      { start: 1_000, end: 60_000 },
      { start: 1_000_000, end: 1_000_000 },
    ]);
    expect(exportName(Date.UTC(2026, 9, 19, 8, 5))).toMatch(/^distritos-2026-10-19-\d{4}\.json$/);
  });
});
