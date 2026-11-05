// Сборы за web search и fetch.
//
// Официально они биллятся за успешный запрос, а не за токены: $0.75 за 1000
// запросов (¥5 за 1000) с 2026-11-01 00:00 по Пекину; неуспешные бесплатны.

import { isPeak, DEFAULT_RULES } from './calendar.js';

const WEB_TOOLS = new Set(['web_search', 'web_fetch']);

/** $0.75 и ¥5 за 1000 успешных запросов. */
export const WEB_FEE_PER_CALL = Object.freeze({ USD: 0.00075, CNY: 0.005 });

/** Начало биллинга: 2026-11-01 00:00 по Пекину. */
export const WEB_BILLING_FROM = Date.parse('2026-11-01T00:00:00+08:00');

/** Сколько запросов биллит один вызов: у поиска их может быть несколько. */
function queryCount(data) {
  try {
    const parsed = JSON.parse(data.arguments ?? '{}');
    const queries = parsed && parsed.queries;
    if (Array.isArray(queries) && queries.length > 0) return queries.length;
  } catch {
    // аргументы не JSON — считаем один запрос
  }
  return 1;
}

/**
 * Свернуть вызовы web-инструментов.
 * Учитываются только вызовы, у которых есть результат и он не ошибочный.
 * @param events - события durable-лога
 * @param options.currency - 'USD' или 'CNY'
 * @returns число учтённых вызовов, сумма и число бесплатных (до начала биллинга)
 */
export function foldWebCalls(events, options = {}) {
  const currency = options.currency ?? 'USD';
  const rules = options.rules ?? DEFAULT_RULES;
  const fee = WEB_FEE_PER_CALL[currency] ?? WEB_FEE_PER_CALL.USD;
  const byPhase = { peak: { calls: 0, amount: 0 }, offPeak: { calls: 0, amount: 0 } };

  const results = new Map();
  for (const event of events ?? []) {
    if (event?.type !== 'tool/result') continue;
    const message = event.data?.message;
    const id = message?.toolCallId;
    if (typeof id !== 'string') continue;
    results.set(id, { isError: message?.isError === true, time: event.time });
  }

  let calls = 0;
  let amount = 0;
  let free = 0;

  for (const event of events ?? []) {
    if (event?.type !== 'tool/call') continue;
    const data = event.data ?? {};
    if (!WEB_TOOLS.has(data.name)) continue;
    const match = results.get(data.callId);
    if (match === undefined || match.isError) continue;

    const hits = queryCount(data);
    calls += hits;
    const landedAt = typeof match.time === 'number' ? match.time : event.time;
    const billable = typeof landedAt === 'number' && landedAt >= WEB_BILLING_FROM;
    const slot = isPeak(typeof landedAt === 'number' ? landedAt : event.time, rules)
      ? byPhase.peak
      : byPhase.offPeak;
    slot.calls += hits;
    if (billable) {
      amount += fee * hits;
      slot.amount += fee * hits;
    } else {
      free += 1;
    }
  }

  return { calls, amount, free, byPhase };
}
