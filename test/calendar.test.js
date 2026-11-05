import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { phaseAt } from '../lib/calendar.js';

const PEAK = 'peak';
const OFF_PEAK = 'off-peak';

// Все моменты заданы в UTC. Пик: 01:00-04:00 и 06:00-10:00 UTC, будни,
// кроме праздников КНР; выходные и праздники целиком off-peak.

test('пик начинается на 01:00 UTC в будний день', () => {
  const { phase } = phaseAt(Date.parse('2026-11-05T01:00:00Z'));
  assert.equal(phase, PEAK);
  assert.equal(phaseAt(Date.parse('2026-11-05T00:59:59Z')).phase, OFF_PEAK);
});

test('пик заканчивается на 04:00 UTC', () => {
  assert.equal(phaseAt(Date.parse('2026-11-05T03:59:59Z')).phase, PEAK);
  assert.equal(phaseAt(Date.parse('2026-11-05T04:00:00Z')).phase, OFF_PEAK);
});

test('второе пиковое окно 06:00-10:00 UTC', () => {
  assert.equal(phaseAt(Date.parse('2026-11-05T06:00:00Z')).phase, PEAK);
  assert.equal(phaseAt(Date.parse('2026-11-05T09:59:59Z')).phase, PEAK);
  assert.equal(phaseAt(Date.parse('2026-11-05T10:00:00Z')).phase, OFF_PEAK);
});

test('выходные целиком off-peak', () => {
  assert.equal(phaseAt(Date.parse('2026-11-07T02:00:00Z')).phase, OFF_PEAK); // суббота
  assert.equal(phaseAt(Date.parse('2026-11-08T07:00:00Z')).phase, OFF_PEAK); // воскресенье
});

test('праздник КНР целиком off-peak, хотя это будний день', () => {
  assert.equal(phaseAt(Date.parse('2026-10-02T02:00:00Z')).phase, OFF_PEAK); // пятница, Национальный день
  assert.equal(phaseAt(Date.parse('2026-10-02T07:00:00Z')).phase, OFF_PEAK);
});

test('следующее переключение внутри пикового окна', () => {
  const { nextChangeAt } = phaseAt(Date.parse('2026-11-05T03:30:00Z'));
  assert.equal(nextChangeAt, Date.parse('2026-11-05T04:00:00Z'));
});

test('следующее переключение из off-peak в тот же будний день', () => {
  const { nextChangeAt } = phaseAt(Date.parse('2026-11-05T04:30:00Z'));
  assert.equal(nextChangeAt, Date.parse('2026-11-05T06:00:00Z'));
});

test('после вечернего пика следующее переключение — утро следующего буднего дня', () => {
  const { nextChangeAt } = phaseAt(Date.parse('2026-11-05T10:30:00Z'));
  assert.equal(nextChangeAt, Date.parse('2026-11-06T01:00:00Z'));
});

test('в пятницу вечером следующее переключение — понедельник', () => {
  const { nextChangeAt } = phaseAt(Date.parse('2026-11-06T11:00:00Z'));
  assert.equal(nextChangeAt, Date.parse('2026-11-09T01:00:00Z'));
});

test('праздничный блок пропускается целиком', () => {
  // 2026-09-30 — среда. Вечернее окно заканчивается, дальше праздники 10-01..10-07.
  const { nextChangeAt } = phaseAt(Date.parse('2026-09-30T10:30:00Z'));
  assert.equal(nextChangeAt, Date.parse('2026-10-08T01:00:00Z'));
});

test('фаза не зависит от часового пояса процесса', () => {
  const script = [
    "import { phaseAt } from './lib/calendar.js';",
    "const p = phaseAt(Date.parse('2026-11-05T02:00:00Z'));",
    "process.stdout.write(p.phase);",
  ].join('\n');
  const dir = fileURLToPath(new URL('..', import.meta.url));
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: dir,
    env: { ...process.env, TZ: 'America/New_York' },
    encoding: 'utf8',
  });
  assert.equal(out, PEAK);
});
