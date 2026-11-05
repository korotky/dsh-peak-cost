import test from 'node:test';
import assert from 'node:assert/strict';

import { foldWebCalls, WEB_BILLING_FROM } from '../lib/webcalls.js';

const AFTER_BILLING = Date.parse('2026-11-06T02:00:00Z');
const BEFORE_BILLING = Date.parse('2026-10-20T02:00:00Z');

function call(id, name, time) {
  return { type: 'tool/call', time, data: { callId: id, name } };
}
function result(id, time, isError = false) {
  return { type: 'tool/result', time, data: { message: { toolCallId: id, isError } } };
}

test('успешный вызов поиска после начала биллинга стоит $0.00075', () => {
  const events = [call('a', 'web_search', AFTER_BILLING), result('a', AFTER_BILLING)];
  const { calls, amount } = foldWebCalls(events, { currency: 'USD' });
  assert.equal(calls, 1);
  assert.equal(amount, 0.00075);
});

test('в юанях тот же вызов стоит ¥0.005', () => {
  const events = [call('a', 'web_search', AFTER_BILLING), result('a', AFTER_BILLING)];
  const { amount } = foldWebCalls(events, { currency: 'CNY' });
  assert.equal(amount, 0.005);
});

test('неуспешный вызов бесплатен и не считается', () => {
  const events = [call('a', 'web_fetch', AFTER_BILLING), result('a', AFTER_BILLING, true)];
  const { calls, amount } = foldWebCalls(events, { currency: 'USD' });
  assert.equal(calls, 0);
  assert.equal(amount, 0);
});

test('вызов без результата не считается', () => {
  const events = [call('a', 'web_search', AFTER_BILLING)];
  const { calls } = foldWebCalls(events, { currency: 'USD' });
  assert.equal(calls, 0);
});

test('вызов до начала биллинга показывается бесплатным', () => {
  const events = [call('a', 'web_search', BEFORE_BILLING), result('a', BEFORE_BILLING)];
  const { calls, amount, free } = foldWebCalls(events, { currency: 'USD' });
  assert.equal(calls, 1);
  assert.equal(amount, 0);
  assert.equal(free, 1);
  assert.ok(BEFORE_BILLING < WEB_BILLING_FROM);
});

test('обычные инструменты не считаются', () => {
  const events = [call('a', 'bash', AFTER_BILLING), result('a', AFTER_BILLING)];
  const { calls } = foldWebCalls(events, { currency: 'USD' });
  assert.equal(calls, 0);
});

test('разбивка web-вызовов по фазам: суммы фаз дают общий итог', () => {
  const peak = Date.parse('2026-11-06T02:00:00Z'); // пятница, пик
  const off = Date.parse('2026-11-06T04:30:00Z'); // пятница, off-peak
  const events = [
    call('a', 'web_search', peak),
    result('a', peak),
    call('b', 'web_fetch', off),
    result('b', off),
  ];
  const { amount, byPhase } = foldWebCalls(events, { currency: 'USD' });
  assert.equal(byPhase.peak.calls, 1);
  assert.equal(byPhase.offPeak.calls, 1);
  assert.equal(
    Number((byPhase.peak.amount + byPhase.offPeak.amount).toFixed(6)),
    Number(amount.toFixed(6)),
  );
});

test('мультизапросный поиск биллится по числу запросов', () => {
  const events = [
    {
      type: 'tool/call',
      time: AFTER_BILLING,
      data: {
        callId: 'm',
        name: 'web_search',
        arguments: JSON.stringify({ queries: ['a', 'b', 'c'] }),
      },
    },
    result('m', AFTER_BILLING),
  ];
  const { calls, amount } = foldWebCalls(events, { currency: 'USD' });
  assert.equal(calls, 3);
  assert.equal(Number(amount.toFixed(6)), Number((3 * 0.00075).toFixed(6)));
});

test('битые аргументы считаются одним вызовом', () => {
  const events = [
    {
      type: 'tool/call',
      time: AFTER_BILLING,
      data: { callId: 'm', name: 'web_search', arguments: 'not json' },
    },
    result('m', AFTER_BILLING),
  ];
  const { calls } = foldWebCalls(events, { currency: 'USD' });
  assert.equal(calls, 1);
});
