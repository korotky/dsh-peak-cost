// Стоимость токенов по официальным ставкам.
//
// Каждый запрос ценится на свой момент: своя версия таблицы цен и своя фаза
// (пик или off-peak). Поэтому сессия, пересекающая границу пика или снижение
// цен, не смешивает ставки в одну цифру.

import { isPeak, DEFAULT_RULES } from './calendar.js';
import { canonicalModel, priceVersionAt } from './prices.js';

const MILLION = 1_000_000;

/**
 * @typedef {object} PriceOptions
 * @property {string} [currency] - 'USD' или 'CNY'
 * @property {import('./calendar.js').PeakRules} [rules] - правила пиков
 * @property {number} [since] - считать только события не раньше этого момента
 */

/**
 * Стоимость одного запроса.
 * @param usage - бакеты токенов: uncachedInputTokens, cacheReadTokens, cacheWriteTokens, outputTokens
 * @param model - идентификатор модели из источника сообщения
 * @param instantMs - момент запроса
 * @param {PriceOptions} [options] - валюта и правила пиков
 * @returns стоимость, версия таблицы и признаки неизвестных данных
 */
export function priceUsage(usage, model, instantMs, options = {}) {
  const currency = options.currency ?? 'USD';
  const rules = options.rules ?? DEFAULT_RULES;

  const version = priceVersionAt(currency, instantMs);
  if (version === undefined) {
    return { amount: 0, priceVersion: null, unknownPeriod: 'before-first-version' };
  }

  const canonical = canonicalModel(model);
  const rates = version.models[canonical];
  if (rates === undefined) {
    return { amount: 0, priceVersion: version.version, unknownModel: model };
  }

  const peak = isPeak(instantMs, rules);
  const factor = peak ? 1 : 0.5;
  // Провайдерский usage называет промах `inputTokens`; нормализованная форма
  // плагина — `uncachedInputTokens`. Принимаем обе.
  const uncached = usage.inputTokens ?? usage.uncachedInputTokens ?? 0;
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const output = usage.outputTokens ?? 0;

  // Деление до умножения: миллион токенов даёт ровно ставку, без ошибок
  // плавающей точки на порядках 1e6.
  const byBucket = {
    cacheHit: (cacheRead / MILLION) * rates.cacheHit * factor,
    cacheMiss: (uncached / MILLION) * rates.cacheMiss * factor,
    cacheWrite: (cacheWrite / MILLION) * rates.cacheMiss * factor,
    output: (output / MILLION) * rates.output * factor,
  };
  const amount = byBucket.cacheHit + byBucket.cacheMiss + byBucket.cacheWrite + byBucket.output;

  return { amount, byBucket, priceVersion: version.version, phase: peak ? 'peak' : 'off-peak' };
}

/** Пустая аккумуляторная структура свёртки. */
function emptyTotals() {
  return {
    total: 0,
    requests: 0,
    byBucket: { cacheHit: 0, cacheMiss: 0, cacheWrite: 0, output: 0 },
    byBucketCost: { cacheHit: 0, cacheMiss: 0, cacheWrite: 0, output: 0 },
    byPhase: { peak: { requests: 0, total: 0 }, offPeak: { requests: 0, total: 0 } },
    unknownModels: new Set(),
    priceVersions: new Set(),
    unknownPeriods: new Set(),
  };
}

/**
 * Свернуть события сессии в стоимость.
 * Учитываются только события `assistant/message` с точным usage и моделью.
 * @param events - события durable-лога
 * @param {PriceOptions} [options] - валюта и правила пиков
 * @returns сумма, число учтённых запросов, бакеты и признаки неизвестных данных
 */
export function foldCost(events, options = {}) {
  const totals = emptyTotals();
  const since = typeof options.since === 'number' ? options.since : undefined;

  for (const event of events ?? []) {
    if (event?.type !== 'assistant/message') continue;
    if (since !== undefined && typeof event.time === 'number' && event.time < since) continue;
    const data = event.data ?? {};
    // DSH 0.2.1: модель лежит на сообщении (`data.message.source`), а не на данных
    // события; `data.source` оставлен как терпимость к другой раскладке.
    const source = data.message?.source ?? data.source;
    if (source === undefined || source.kind !== 'model' || typeof source.model !== 'string')
      continue;
    const usage = data.usage;
    if (usage === undefined || usage === null) continue;
    if (typeof event.time !== 'number') continue;

    const priced = priceUsage(usage, source.model, event.time, options);
    totals.requests += 1;
    totals.total += priced.amount;
    if (priced.priceVersion) totals.priceVersions.add(priced.priceVersion);
    if (priced.unknownModel) totals.unknownModels.add(priced.unknownModel);
    if (priced.unknownPeriod) totals.unknownPeriods.add(priced.unknownPeriod);

    const phaseSlot = priced.phase === 'peak' ? totals.byPhase.peak : totals.byPhase.offPeak;
    phaseSlot.requests += 1;
    phaseSlot.total += priced.amount;

    if (priced.byBucket) {
      totals.byBucketCost.cacheHit += priced.byBucket.cacheHit;
      totals.byBucketCost.cacheMiss += priced.byBucket.cacheMiss;
      totals.byBucketCost.cacheWrite += priced.byBucket.cacheWrite;
      totals.byBucketCost.output += priced.byBucket.output;
    }

    totals.byBucket.cacheMiss += usage.inputTokens ?? usage.uncachedInputTokens ?? 0;
    totals.byBucket.cacheHit += usage.cacheReadTokens ?? 0;
    totals.byBucket.cacheWrite += usage.cacheWriteTokens ?? 0;
    totals.byBucket.output += usage.outputTokens ?? 0;
  }

  return totals;
}
