import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeHolidays, normalizeDateList, remoteIsFresh } from '../lib/holiday-source.js';

test('встроенный календарь дополняется файлом пользователя', () => {
  const set = mergeHolidays(['2026-10-01'], { dates: ['2027-05-01'] });
  assert.ok(set.has('2026-10-01'));
  assert.ok(set.has('2027-05-01'));
});

test('файл может убрать дату из встроенного календаря', () => {
  const set = mergeHolidays(['2026-10-01', '2026-10-02'], { remove: ['2026-10-02'] });
  assert.ok(set.has('2026-10-01'));
  assert.equal(set.has('2026-10-02'), false);
});

test('мусор в списке дат отбрасывается, а не ломает календарь', () => {
  const dates = normalizeDateList(['2027-05-01', 'not-a-date', '2027-13-40', 42, null]);
  assert.deepEqual(dates, ['2027-05-01']);
});

test('пустой или битый оверрайд ничего не меняет', () => {
  const set = mergeHolidays(['2026-10-01'], null);
  assert.equal(set.size, 1);
  const again = mergeHolidays(['2026-10-01'], { dates: 'oops' });
  assert.equal(again.size, 1);
});

test('кэш удалённого календаря считается свежим только внутри TTL', () => {
  const now = Date.parse('2026-11-05T12:00:00Z');
  assert.equal(remoteIsFresh({ fetchedAt: now - 1000 }, now, 24 * 3600 * 1000), true);
  assert.equal(remoteIsFresh({ fetchedAt: now - 25 * 3600 * 1000 }, now, 24 * 3600 * 1000), false);
  assert.equal(remoteIsFresh(null, now, 1000), false);
});
