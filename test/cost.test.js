import test from 'node:test';
import assert from 'node:assert/strict';

import { priceUsage, foldCost } from '../lib/cost.js';

// Официальные ставки за 1M токенов (api-docs.deepseek.com/quick_start/pricing),
// пик; off-peak вдвое ниже.
//   deepseek-flash  USD: cache hit 0.006, cache miss 0.30, output 1.20
//   deepseek-v4-pro USD: cache hit 0.044, cache miss 1.32, output 3.96
//   deepseek-flash  CNY: cache hit 0.04,  cache miss 2.00, output 8.00
//   deepseek-v4-pro CNY: cache hit 0.30,  cache miss 9.00, output 27.00

const PEAK_MOMENT = Date.parse('2026-11-05T02:00:00Z'); // среда, 01:00-04:00 UTC
const OFF_PEAK_MOMENT = Date.parse('2026-11-05T04:30:00Z');
const BEFORE_PRICE_CUT = Date.parse('2026-09-01T02:00:00Z');

const ONE_MILLION = {
  inputTokens: 1_000_000,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
};

test('cache-miss вход в пик стоит 0.30 USD за миллион у flash', () => {
  const { amount, byBucket } = priceUsage(ONE_MILLION, 'deepseek-flash', PEAK_MOMENT, {
    currency: 'USD',
  });
  assert.equal(amount, 0.3);
  assert.equal(byBucket.cacheMiss, 0.3);
  assert.equal(byBucket.cacheHit, 0);
});

test('тот же вход в off-peak стоит вдвое дешевле', () => {
  const { amount } = priceUsage(ONE_MILLION, 'deepseek-flash', OFF_PEAK_MOMENT, {
    currency: 'USD',
  });
  assert.equal(amount, 0.15);
});

test('cache-write тарифицируется по ставке cache-miss', () => {
  const usage = { ...ONE_MILLION, inputTokens: 0, cacheWriteTokens: 1_000_000 };
  const { amount } = priceUsage(usage, 'deepseek-flash', PEAK_MOMENT, { currency: 'USD' });
  assert.equal(amount, 0.3);
});

test('cache-hit вход дешевле на два порядка', () => {
  const usage = { ...ONE_MILLION, inputTokens: 0, cacheReadTokens: 1_000_000 };
  const { amount } = priceUsage(usage, 'deepseek-flash', PEAK_MOMENT, { currency: 'USD' });
  assert.equal(amount, 0.006);
});

test('output тарифицируется по своей ставке', () => {
  const usage = { ...ONE_MILLION, inputTokens: 0, outputTokens: 1_000_000 };
  const { amount } = priceUsage(usage, 'deepseek-flash', PEAK_MOMENT, { currency: 'USD' });
  assert.equal(amount, 1.2);
});

test('deepseek-v4-pro считается по собственной таблице, а не по Flash', () => {
  const { amount } = priceUsage(ONE_MILLION, 'deepseek-v4-pro', PEAK_MOMENT, { currency: 'USD' });
  assert.equal(amount, 1.32);
});

test('legacy-алиасы Flash считаются как Flash', () => {
  for (const model of ['deepseek-v4-flash', 'deepseek-v4-flash-vision-exp']) {
    const { amount, unknownModel } = priceUsage(ONE_MILLION, model, PEAK_MOMENT, {
      currency: 'USD',
    });
    assert.equal(amount, 0.3);
    assert.equal(unknownModel, undefined);
  }
});

test('CNY считается по своей таблице, без пересчёта по курсу', () => {
  const { amount } = priceUsage(ONE_MILLION, 'deepseek-flash', PEAK_MOMENT, { currency: 'CNY' });
  assert.equal(amount, 2);
});

test('неизвестная модель не подменяется Flash-ценой', () => {
  const { amount, unknownModel } = priceUsage(ONE_MILLION, 'some-future-model', PEAK_MOMENT, {
    currency: 'USD',
  });
  assert.equal(amount, 0);
  assert.equal(unknownModel, 'some-future-model');
});

test('момент до первой известной таблицы цен помечается, а не считается наугад', () => {
  const { amount, priceVersion, unknownPeriod } = priceUsage(
    ONE_MILLION,
    'deepseek-flash',
    BEFORE_PRICE_CUT,
    { currency: 'USD' },
  );
  assert.equal(amount, 0);
  assert.equal(priceVersion, null);
  assert.equal(unknownPeriod, 'before-first-version');
});

test('свёртка событий суммирует запросы разных фаз по их собственным моментам', () => {
  const events = [
    {
      type: 'assistant/message',
      time: PEAK_MOMENT,
      data: { message: { source: { kind: 'model', model: 'deepseek-flash' } }, usage: ONE_MILLION },
    },
    {
      type: 'assistant/message',
      time: OFF_PEAK_MOMENT,
      data: { message: { source: { kind: 'model', model: 'deepseek-flash' } }, usage: ONE_MILLION },
    },
  ];
  const { total, requests } = foldCost(events, { currency: 'USD' });
  assert.equal(requests, 2);
  assert.equal(Math.round(total * 1000) / 1000, 0.45);
});

test('свёртка пропускает события без usage и без модели', () => {
  const events = [
    {
      type: 'assistant/message',
      time: PEAK_MOMENT,
      data: { message: { source: { kind: 'model', model: 'deepseek-flash' } } },
    },
    { type: 'assistant/message', time: PEAK_MOMENT, data: { usage: ONE_MILLION } },
    { type: 'user/message', time: PEAK_MOMENT, data: {} },
  ];
  const { total, requests } = foldCost(events, { currency: 'USD' });
  assert.equal(requests, 0);
  assert.equal(total, 0);
});

test('неизвестная модель в одном из запросов не обнуляет сумму остальных', () => {
  const events = [
    {
      type: 'assistant/message',
      time: PEAK_MOMENT,
      data: { message: { source: { kind: 'model', model: 'deepseek-flash' } }, usage: ONE_MILLION },
    },
    {
      type: 'assistant/message',
      time: PEAK_MOMENT,
      data: { message: { source: { kind: 'model', model: 'future-model' } }, usage: ONE_MILLION },
    },
  ];
  const { total, unknownModels } = foldCost(events, { currency: 'USD' });
  assert.equal(total, 0.3);
  assert.deepEqual([...unknownModels], ['future-model']);
});

test('реальное событие durable-лога ценится: модель в message.source, usage в inputTokens', () => {
  const realEvent = {
    type: 'assistant/message',
    seq: 42,
    time: Date.parse('2026-11-05T06:30:00Z'),
    data: {
      turn: 1,
      step: 1,
      message: {
        role: 'assistant',
        content: [],
        source: { kind: 'model', provider: 'deepseek-account', model: 'deepseek-flash' },
        id: 'x',
      },
      usage: {
        inputTokens: 5249,
        outputTokens: 623,
        cacheReadTokens: 8064,
        cacheWriteTokens: 0,
        totalTokens: 13936,
      },
    },
  };
  const { total, requests, byBucket, byBucketCost } = foldCost([realEvent], { currency: 'USD' });
  assert.equal(requests, 1);
  assert.deepEqual(byBucket, { cacheHit: 8064, cacheMiss: 5249, cacheWrite: 0, output: 623 });
  // пик, USD: 5249*0.30/1e6 + 8064*0.006/1e6 + 623*1.20/1e6
  const expected = (5249 * 0.3 + 8064 * 0.006 + 623 * 1.2) / 1e6;
  assert.ok(Math.abs(total - expected) < 1e-12, `${total} != ${expected}`);
  assert.ok(Math.abs(byBucketCost.cacheMiss - (5249 * 0.3) / 1e6) < 1e-12);
  assert.ok(Math.abs(byBucketCost.cacheHit - (8064 * 0.006) / 1e6) < 1e-12);
  assert.equal(byBucketCost.cacheWrite, 0);
  assert.ok(Math.abs(byBucketCost.output - (623 * 1.2) / 1e6) < 1e-12);
});

test('разбивка по фазам делит сумму на пик и off-peak', () => {
  const events = [
    {
      type: 'assistant/message',
      time: PEAK_MOMENT,
      data: { message: { source: { kind: 'model', model: 'deepseek-flash' } }, usage: ONE_MILLION },
    },
    {
      type: 'assistant/message',
      time: OFF_PEAK_MOMENT,
      data: { message: { source: { kind: 'model', model: 'deepseek-flash' } }, usage: ONE_MILLION },
    },
    {
      type: 'assistant/message',
      time: OFF_PEAK_MOMENT + 60_000,
      data: { message: { source: { kind: 'model', model: 'deepseek-flash' } }, usage: ONE_MILLION },
    },
  ];
  const { total, byPhase } = foldCost(events, { currency: 'USD' });
  assert.equal(byPhase.peak.requests, 1);
  assert.equal(byPhase.offPeak.requests, 2);
  assert.equal(Number(byPhase.peak.total.toFixed(3)), 0.3);
  assert.equal(Number(byPhase.offPeak.total.toFixed(3)), 0.3);
  assert.ok(Math.abs(byPhase.peak.total + byPhase.offPeak.total - total) < 1e-12);
});

test('разбивка по фазам не создаёт пустых фаз', () => {
  const events = [
    {
      type: 'assistant/message',
      time: OFF_PEAK_MOMENT,
      data: { message: { source: { kind: 'model', model: 'deepseek-flash' } }, usage: ONE_MILLION },
    },
  ];
  const { byPhase } = foldCost(events, { currency: 'USD' });
  assert.equal(byPhase.peak.requests, 0);
  assert.equal(byPhase.offPeak.requests, 1);
});

test('свёртка умеет ограничивать период: события до since пропускаются', () => {
  const events = [
    {
      type: 'assistant/message',
      time: PEAK_MOMENT,
      data: { message: { source: { kind: 'model', model: 'deepseek-flash' } }, usage: ONE_MILLION },
    },
    {
      type: 'assistant/message',
      time: OFF_PEAK_MOMENT,
      data: { message: { source: { kind: 'model', model: 'deepseek-flash' } }, usage: ONE_MILLION },
    },
  ];
  const { requests } = foldCost(events, { currency: 'USD', since: OFF_PEAK_MOMENT });
  assert.equal(requests, 1);
});
