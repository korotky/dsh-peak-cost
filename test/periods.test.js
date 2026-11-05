import test from 'node:test';
import assert from 'node:assert/strict';

import { dayStart, weekStart } from '../lib/periods.js';

// Границы считаются по локальным суткам и неделе машины: человек думает
// «сегодня» и «на этой неделе» в своём поясе, а не в UTC.

test('начало суток — локальная полночь', () => {
  const moment = new Date(2026, 10, 5, 19, 27, 0); // 5 ноября 2026, 19:27 локально
  const start = new Date(dayStart(moment.getTime()));
  assert.equal(start.getHours(), 0);
  assert.equal(start.getMinutes(), 0);
  assert.equal(start.getDate(), 5);
});

test('начало недели — понедельник', () => {
  const thursday = new Date(2026, 10, 5, 19, 27, 0); // четверг
  const start = new Date(weekStart(thursday.getTime()));
  assert.equal(start.getDay(), 1); // понедельник
  assert.equal(start.getDate(), 2); // 2 ноября 2026
  assert.equal(start.getHours(), 0);
});

test('в понедельник неделя начинается в тот же день', () => {
  const monday = new Date(2026, 10, 2, 9, 0, 0);
  const start = new Date(weekStart(monday.getTime()));
  assert.equal(start.getDate(), 2);
  assert.equal(start.getDay(), 1);
});
