// Официальные ставки DeepSeek за 1M токенов.
//
// Источник: api-docs.deepseek.com/quick_start/pricing. Ставки в таблице — пиковые;
// off-peak вдвое ниже (официальная формулировка: «Off-peak rates are half of the
// peak rates»). Каждая валюта считается по своей таблице: пересчёта по курсу нет.

/** Модели, которые официально обслуживаются Flash-моделью и биллятся по её ставке. */
export const FLASH_ALIASES = Object.freeze([
  'deepseek-v4-flash',
  'deepseek-v4-flash-vision-exp',
]);

/** Каноническое имя модели для таблицы цен. */
export function canonicalModel(model) {
  return FLASH_ALIASES.includes(model) ? 'deepseek-flash' : model;
}

// 2026-09-10 12:00 по Пекину — снижение цен вместе с выпуском V4.1 Flash.
const PRICE_CUT_AT = Date.parse('2026-09-10T04:00:00Z');

/**
 * Таблицы цен по валютам. Каждая запись — версия с датой вступления; версия
 * выбирается по моменту события, а не по моменту подсчёта.
 *
 * Ставки за 1M токенов: cacheHit — попадание в кэш, cacheMiss — промах и запись
 * в кэш (cache-write биллится по ставке промаха), output — выход.
 */
export const PRICE_BOOK = Object.freeze({
  USD: Object.freeze([
    Object.freeze({
      version: '2026-09-10',
      effectiveFrom: PRICE_CUT_AT,
      models: Object.freeze({
        'deepseek-flash': Object.freeze({ cacheHit: 0.006, cacheMiss: 0.3, output: 1.2 }),
        'deepseek-v4-pro': Object.freeze({ cacheHit: 0.044, cacheMiss: 1.32, output: 3.96 }),
      }),
    }),
  ]),
  CNY: Object.freeze([
    Object.freeze({
      version: '2026-09-10',
      effectiveFrom: PRICE_CUT_AT,
      models: Object.freeze({
        'deepseek-flash': Object.freeze({ cacheHit: 0.04, cacheMiss: 2, output: 8 }),
        'deepseek-v4-pro': Object.freeze({ cacheHit: 0.3, cacheMiss: 9, output: 27 }),
      }),
    }),
  ]),
});

/** Версия таблицы, действующая в момент instantMs, или undefined. */
export function priceVersionAt(currency, instantMs) {
  const entries = PRICE_BOOK[currency];
  if (entries === undefined) return undefined;
  let found;
  for (const entry of entries) {
    if (entry.effectiveFrom <= instantMs) found = entry;
  }
  return found;
}
