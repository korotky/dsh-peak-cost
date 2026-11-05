import test from 'node:test';
import assert from 'node:assert/strict';

import { collectCostEvents } from '../lib/aggregate.js';

// Источник подменяется фейком на границе сервиса: тест проверяет только то,
// какие сессии и какие события попадают в сумму.

const PEAK_MOMENT = Date.parse('2026-11-05T02:00:00Z');

function messageEvent(secondsOffset = 0) {
  return {
    type: 'assistant/message',
    time: PEAK_MOMENT + secondsOffset * 1000,
    data: {
      message: { source: { kind: 'model', model: 'deepseek-flash' } },
      usage: { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  };
}

function fakeSource({ logs, trace = null, withoutTrace = false }) {
  return {
    readSession: async (id) => logs[id],
    traceSession: withoutTrace ? undefined : async () => trace ?? { descendants: [] },
  };
}

test('события собственной сессии попадают в сумму', async () => {
  const source = fakeSource({
    logs: { root: { events: [messageEvent(0), messageEvent(1)], inheritedEventCount: 0 } },
  });
  const result = await collectCostEvents(source, 'root');
  assert.equal(result.events.length, 2);
  assert.equal(result.subagentSessions, 0);
});

test('унаследованный префикс не считается дважды', async () => {
  const source = fakeSource({
    logs: {
      sub: { events: [messageEvent(0), messageEvent(1), messageEvent(2)], inheritedEventCount: 2 },
    },
  });
  const result = await collectCostEvents(source, 'sub');
  assert.equal(result.events.length, 1);
});

test('сабагент-сессии добавляются к сумме и считаются отдельно', async () => {
  const source = fakeSource({
    logs: {
      root: { events: [messageEvent(0)], inheritedEventCount: 0 },
      child: { events: [messageEvent(1)], inheritedEventCount: 0 },
    },
    trace: {
      descendants: [{ session: { header: { id: 'child', origin: 'subagent' } } }],
    },
  });
  const result = await collectCostEvents(source, 'root');
  assert.equal(result.events.length, 2);
  assert.equal(result.subagentSessions, 1);
  assert.equal(result.subagentEvents, 1);
  assert.equal(result.subagentEventList.length, 1);
  assert.equal(result.subagentEventList[0].data.usage.inputTokens, 1_000_000);
});

test('вложенный сабагент учитывается один раз', async () => {
  const source = fakeSource({
    logs: {
      root: { events: [messageEvent(0)], inheritedEventCount: 0 },
      child: { events: [messageEvent(1)], inheritedEventCount: 0 },
      grandchild: { events: [messageEvent(2)], inheritedEventCount: 0 },
    },
    trace: {
      descendants: [
        {
          session: { header: { id: 'child', origin: 'subagent' } },
          descendants: [{ session: { header: { id: 'grandchild', origin: 'subagent' } } }],
        },
      ],
    },
  });
  const result = await collectCostEvents(source, 'root');
  assert.equal(result.events.length, 3);
  assert.equal(result.subagentSessions, 2);
});

test('форк не добавляется в сумму', async () => {
  const source = fakeSource({
    logs: {
      root: { events: [messageEvent(0)], inheritedEventCount: 0 },
      fork: { events: [messageEvent(1), messageEvent(2)], inheritedEventCount: 1 },
    },
    trace: { descendants: [{ session: { header: { id: 'fork', origin: 'fork' } } }] },
  });
  const result = await collectCostEvents(source, 'root');
  assert.equal(result.events.length, 1);
  assert.equal(result.subagentSessions, 0);
});

test('без сервиса трассировки сумма по своей сессии сохраняется, ограничение помечается', async () => {
  const source = fakeSource({
    logs: { root: { events: [messageEvent(0)], inheritedEventCount: 0 } },
    withoutTrace: true,
  });
  const result = await collectCostEvents(source, 'root');
  assert.equal(result.events.length, 1);
  assert.deepEqual([...result.capabilities], ['traceSession']);
});

test('нечитаемый лог сабагента не обнуляет сумму родителя', async () => {
  const source = {
    readSession: async (id) => {
      if (id === 'child') throw new Error('broken log');
      return { events: [messageEvent(0)], inheritedEventCount: 0 };
    },
    traceSession: async () => ({
      descendants: [{ session: { header: { id: 'child', origin: 'subagent' } } }],
    }),
  };
  const result = await collectCostEvents(source, 'root');
  assert.equal(result.events.length, 1);
  assert.deepEqual([...result.capabilities], ['childLog']);
});
