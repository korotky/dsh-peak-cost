/** Host half of dsh-peak-cost: serves the billing period and the session cost. */

import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { phaseAt, PEAK_WINDOWS_UTC } from './lib/calendar.js';
import { BUILTIN_HOLIDAYS } from './lib/holidays.js';
import { mergeHolidays, normalizeDateList, remoteIsFresh } from './lib/holiday-source.js';
import { foldCost } from './lib/cost.js';
import { collectCostEvents } from './lib/aggregate.js';
import { foldWebCalls } from './lib/webcalls.js';
import { dayStart, weekStart } from './lib/periods.js';
import { selectLedgerSessions } from './lib/ledger.js';

/**
 * schemastery лежит в поставке dsh и в профиле, но не рядом с нашим пакетом:
 * он подключён ссылкой из workspace, поэтому обычный import его не находит.
 * Перебираем якоря резолва — среда профиля, запущенный CLI, каталоги профилей.
 */
/**
 * Якоря резолва: сам модуль (при обычной установке рядом лежит node_modules
 * профиля), среда профиля, запущенный CLI и каталоги профилей. Установка
 * ссылкой из workspace не имеет своих node_modules, поэтому первых якорей мало.
 */
function resolveAnchors() {
  const anchors = [[import.meta.url, 'self']];
  if (process.env.DSH_PROFILE_DIR)
    anchors.push([`${process.env.DSH_PROFILE_DIR}/package.json`, 'env']);
  if (process.argv[1]) anchors.push([process.argv[1], 'cli']);
  try {
    const profiles = join(homedir(), '.dsh', 'profiles');
    for (const name of readdirSync(profiles))
      anchors.push([join(profiles, name, 'package.json'), `profile:${name}`]);
  } catch {
    // каталога профилей нет — останутся предыдущие якоря
  }
  return anchors;
}

/** Резолв модуля по первому подходящему якорю. */
function resolveModule(name) {
  for (const [anchor, source] of resolveAnchors()) {
    try {
      return { value: createRequire(anchor)(name), source };
    } catch {
      // якорь не подошёл, пробуем следующий
    }
  }
  return { value: null, source: 'none' };
}

function loadSchemastery() {
  const { value, source } = resolveModule('@deepseek-ai/schemastery');
  return { z: value, source };
}

const { z: schemaBuilder, source: CONFIG_SOURCE } = loadSchemastery();

/** Схема настроек для формы на странице Plugins; только volatile-поля попадают в форму. */
function buildConfigSchema() {
  if (!schemaBuilder) return undefined;
  try {
    return schemaBuilder.object({
      currency: schemaBuilder
        .union(['USD', 'CNY'])
        .default('USD')
        .volatile()
        .description('Валюта в пилюле'),
      refreshMs: schemaBuilder
        .union([15000, 30000, 60000])
        .default(30000)
        .volatile()
        .description('Период обновления, мс'),
      lang: schemaBuilder
        .union(['auto', 'ru', 'en'])
        .default('auto')
        .volatile()
        .description('Язык плагина'),
      footer: schemaBuilder
        .boolean()
        .default(false)
        .volatile()
        .description('Строка в футере сайдбара'),
      scope: schemaBuilder
        .union(['workspace', 'all'])
        .default('workspace')
        .volatile()
        .description('Область леджера: эта папка или все'),
    });
  } catch {
    return undefined;
  }
}

const Config = buildConfigSchema();

/** Ожидаемый диапазон совместимости и версия хоста — для диагностики дрейфа API. */
const EXPECTED_HOST_RANGE = '^0.2.1-rc.1';

function hostVersion() {
  const { value } = resolveModule('@deepseek-ai/dsh/package.json');
  return value && typeof value.version === 'string' ? value.version : null;
}

const SETTINGS_DEFAULTS = Object.freeze({
  currency: 'USD',
  refreshMs: 30000,
  lang: 'auto',
  footer: false,
  scope: 'workspace',
});

/** Сложить разбивку по фазам из токенов и из web-вызовов. */
function mergePhases(tokens, web) {
  return {
    peak: {
      requests: tokens.peak.requests + web.peak.calls,
      total: tokens.peak.total + web.peak.amount,
    },
    offPeak: {
      requests: tokens.offPeak.requests + web.offPeak.calls,
      total: tokens.offPeak.total + web.offPeak.amount,
    },
  };
}

const VALID_VALUES = {
  currency: ['USD', 'CNY'],
  refreshMs: [15000, 30000, 60000],
  lang: ['auto', 'ru', 'en'],
  scope: ['workspace', 'all'],
};

/**
 * Volatile-поля приходят объектами-заглушками, пока их не заполнили настройки,
 * поэтому каждое значение проверяется, а не подставляется как есть.
 */
function sanitizeSettings(raw, base) {
  const out = { ...base };
  if (raw === null || typeof raw !== 'object') return out;
  if (VALID_VALUES.currency.includes(raw.currency)) out.currency = raw.currency;
  if (VALID_VALUES.refreshMs.includes(raw.refreshMs)) out.refreshMs = raw.refreshMs;
  if (VALID_VALUES.lang.includes(raw.lang)) out.lang = raw.lang;
  if (typeof raw.footer === 'boolean') out.footer = raw.footer;
  if (VALID_VALUES.scope.includes(raw.scope)) out.scope = raw.scope;
  return out;
}

const STATE_ROUTE = '/api/dsh-peak-cost/state';
const LEDGER_TTL_MS = 60_000;
const RULES_TTL_MS = 60_000;
const REMOTE_TTL_MS = 24 * 3600 * 1000;
const CONFIG_FILE = () => join(homedir(), '.dsh', 'peak-cost-holidays.json');
const CACHE_FILE = () => join(homedir(), '.dsh', 'peak-cost-holidays-cache.json');

let rulesCache = null;

async function readJsonSafe(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Правила пиков на сейчас: встроенный календарь, оверрайд файла и, если задан URL,
 * удалённое обновление с суточным кэшем. Любой источник может отсутствовать.
 */
async function currentRules(now) {
  if (rulesCache !== null && now - rulesCache.at < RULES_TTL_MS) return rulesCache.value;

  const overrides = await readJsonSafe(CONFIG_FILE());
  const cached = await readJsonSafe(CACHE_FILE());
  const url =
    overrides !== null && typeof overrides === 'object' && typeof overrides.url === 'string'
      ? overrides.url
      : null;

  let remoteDates = null;
  let source = 'builtin';

  if (Array.isArray(cached?.dates) && remoteIsFresh(cached, now, REMOTE_TTL_MS)) {
    remoteDates = normalizeDateList(cached.dates);
    source = 'builtin+cache';
  } else if (url !== null) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const body = await response.json();
      remoteDates = normalizeDateList(body.dates ?? body.holidays);
      source = 'builtin+remote';
      await writeFile(
        CACHE_FILE(),
        JSON.stringify({ url, fetchedAt: now, dates: remoteDates }),
        'utf8',
      ).catch(() => {});
    } catch {
      remoteDates = Array.isArray(cached?.dates) ? normalizeDateList(cached.dates) : null;
      if (remoteDates !== null) source = 'builtin+cache';
    }
  }

  const fileDates = normalizeDateList(overrides?.dates);
  if (fileDates.length > 0) source += '+file';

  const holidays = mergeHolidays(BUILTIN_HOLIDAYS, {
    dates: [...fileDates, ...(remoteDates ?? [])],
    remove: overrides?.remove,
  });

  const value = {
    rules: { windowsUtc: PEAK_WINDOWS_UTC, holidays },
    info: {
      source,
      holidays: holidays.size,
      years: [...new Set([...holidays].map((date) => date.slice(0, 4)))].sort(),
    },
  };
  rulesCache = { at: now, value };
  return value;
}

let ledgerCache = { at: 0, key: '', value: null };

/**
 * Расход за сегодня и за неделю по сессиям рабочей папки: свой файл состояния
 * не заводим, всё выводится из логов. Кэш в памяти на минуту, потому что логов
 * может быть много, а цифра нужна не чаще.
 */
async function ledgerFor(ctx, cwd, now, rules, wanted, scope) {
  if (!wanted) return { ledger: null, missing: null };
  const allWorkspaces = scope === 'all';
  const query = ctx.get('sessionQuery');
  if (query === undefined || typeof query.filterSessions !== 'function') {
    return { ledger: null, missing: 'filterSessions' };
  }

  const day = dayStart(now);
  const week = weekStart(now);
  // Область входит в ключ кэша: иначе смена области отдаёт старую цифру до истечения TTL.
  const key = `${scope ?? 'workspace'}|${cwd ?? ''}|${day}`;
  if (ledgerCache.key === key && now - ledgerCache.at < LEDGER_TTL_MS) {
    return { ledger: ledgerCache.value, missing: null };
  }

  try {
    /** @type {Array<{ kind: string, from?: number, values?: string[] }>} */
    const filters = [{ kind: 'created-at', from: week }];
    if (!allWorkspaces && typeof cwd === 'string' && cwd !== '')
      filters.push({ kind: 'cwd', values: [cwd] });
    const records = await query.filterSessions(filters);
    const sessionIds = selectLedgerSessions(records, allWorkspaces ? null : cwd);
    if (sessionIds.length === 0 && !allWorkspaces) return { ledger: null, missing: 'cwd' };

    const acc = {
      today: { requests: 0, totals: { USD: 0, CNY: 0 } },
      week: { requests: 0, totals: { USD: 0, CNY: 0 } },
    };

    for (const id of sessionIds) {
      try {
        const log = await query.readSession(id);
        const events = (log.events ?? []).slice(Math.max(0, log.inheritedEventCount ?? 0));
        const weekUsd = foldCost(events, { currency: 'USD', since: week, rules });
        const weekCny = foldCost(events, { currency: 'CNY', since: week, rules });
        const dayUsd = foldCost(events, { currency: 'USD', since: day, rules });
        const dayCny = foldCost(events, { currency: 'CNY', since: day, rules });
        const webUsd = foldWebCalls(events, { currency: 'USD', rules });
        const webCny = foldWebCalls(events, { currency: 'CNY', rules });
        acc.week.requests += weekUsd.requests;
        acc.week.totals.USD += weekUsd.total + webUsd.amount;
        acc.week.totals.CNY += weekCny.total + webCny.amount;
        acc.today.requests += dayUsd.requests;
        acc.today.totals.USD += dayUsd.total + webUsd.amount;
        acc.today.totals.CNY += dayCny.total + webCny.amount;
      } catch {
        // одна нечитаемая сессия не должна обнулять леджер
      }
    }

    ledgerCache = { at: now, key, value: acc };
    return { ledger: acc, missing: null };
  } catch {
    return { ledger: null, missing: 'filterSessions' };
  }
}

/**
 * Рабочая папка сессии. `readSession` может не отдавать заголовок, поэтому
 * спрашиваем запись сессии отдельно — без cwd леджер не к чему привязать.
 */
async function sessionCwd(query, sessionId) {
  try {
    if (typeof query.filterSessions !== 'function') return undefined;
    const records = await query.filterSessions([{ kind: 'id', values: [sessionId] }]);
    const header = records && records[0] ? records[0].header : undefined;
    return header && typeof header.cwd === 'string' ? header.cwd : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Свернуть события сессии в стоимость, если хост умеет их отдать.
 * Отсутствие сервиса или нечитаемый лог — это капабилити, а не ошибка ответа.
 */
async function sessionCost(ctx, sessionId, now, rules) {
  const query = ctx.get('sessionQuery');
  if (query === undefined || typeof query.readSession !== 'function') {
    return { cost: null, missing: 'sessionQuery', cwd: undefined };
  }
  if (typeof sessionId !== 'string' || sessionId === '') {
    return { cost: null, missing: 'session', cwd: undefined };
  }

  try {
    const collected = await collectCostEvents(query, sessionId);
    const header = collected.header ?? {};
    const usd = foldCost(collected.events, { currency: 'USD', rules });
    const cny = foldCost(collected.events, { currency: 'CNY', rules });
    const subUsd = foldCost(collected.subagentEventList, { currency: 'USD', rules });
    const subCny = foldCost(collected.subagentEventList, { currency: 'CNY', rules });
    const webUsd = foldWebCalls(collected.events, { currency: 'USD', rules });
    const webCny = foldWebCalls(collected.events, { currency: 'CNY', rules });
    return {
      cost: {
        requests: usd.requests,
        totals: { USD: usd.total + webUsd.amount, CNY: cny.total + webCny.amount },
        web: {
          calls: webUsd.calls,
          free: webUsd.free,
          totals: { USD: webUsd.amount, CNY: webCny.amount },
        },
        byBucket: usd.byBucket,
        byBucketCost: { USD: usd.byBucketCost, CNY: cny.byBucketCost },
        byPhase: {
          USD: mergePhases(usd.byPhase, webUsd.byPhase),
          CNY: mergePhases(cny.byPhase, webCny.byPhase),
        },
        subagents: {
          sessions: collected.subagentSessions,
          totals: { USD: subUsd.total, CNY: subCny.total },
        },
        unknownModels: [...usd.unknownModels],
        priceVersions: [...usd.priceVersions],
        capabilities: (() => {
          const caps = [...collected.capabilities];
          const messages = collected.events.filter(
            (event) => event && event.type === 'assistant/message',
          ).length;
          if (messages > 0 && usd.requests === 0) caps.push('usage');
          return caps;
        })(),
      },
      missing: null,
      cwd:
        typeof header.cwd === 'string' && header.cwd !== ''
          ? header.cwd
          : await sessionCwd(query, sessionId),
    };
  } catch {
    return { cost: null, missing: 'sessionLog', cwd: undefined };
  }
}

export function apply(ctx, config) {
  const applied = sanitizeSettings(config, SETTINGS_DEFAULTS);
  let cached = null;
  let saved = true;
  let lastError = null;

  /** Значение из settings-документа хоста, если наша строка туда попала. */
  const fromSettingsDocument = () => {
    try {
      const descriptors = ctx.get('settings')?.describe?.() ?? [];
      const hit = descriptors.find(
        (item) => item.ns === 'peak-cost' || item.ns === 'dsh-peak-cost',
      );
      if (hit && hit.value && typeof hit.value === 'object') return hit.value;
    } catch {
      // сервис настроек недоступен
    }
    return null;
  };

  /** Текущие настройки: значения из settings-документа хоста поверх дефолтов схемы. */
  const currentSettings = async (now) => {
    if (cached !== null && now - cached.at < 2000) return cached.value;
    const value = sanitizeSettings(fromSettingsDocument(), applied);
    cached = { at: now, value };
    return value;
  };

  const saveSettings = async (patch) => {
    const next = sanitizeSettings(
      { ...(await currentSettings(Date.now())), ...(patch ?? {}) },
      applied,
    );
    try {
      await ctx.get('settings').update('peak-cost', patch ?? {});
      saved = true;
    } catch (error) {
      // Единственный источник правды — settings-документ; второй путь не заводим,
      // а сообщаем о проблеме в диагностике.
      saved = false;
      lastError = error instanceof Error ? error.message : String(error);
    }
    cached = { at: Date.now(), value: next };
    return next;
  };

  ctx.inject(['webServer'], (ctx) => {
    ctx.effect(() =>
      ctx.webServer.register({
        kind: 'exact',
        path: STATE_ROUTE,
        handler: async (req, res) => {
          // 401 — нет валидной cookie браузера, 403 — не тот Host/Origin;
          // undefined означает, что запрос можно обслуживать.
          const rejection = ctx.get('connection')?.requestRejection?.(req);
          if (rejection) {
            res.statusCode = rejection;
            res.end();
            return;
          }

          if (req.method === 'POST') {
            const chunks = [];
            let size = 0;
            for await (const chunk of req) {
              size += chunk.length;
              if (size > 4096) {
                res.statusCode = 413;
                res.end();
                return;
              }
              chunks.push(chunk);
            }
            let patch = null;
            try {
              patch = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            } catch {
              patch = null;
            }
            const saved = await saveSettings(patch);
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.setHeader('cache-control', 'no-store');
            res.end(JSON.stringify({ settings: saved }));
            return;
          }

          const url = new URL(req.url ?? '/', 'http://localhost');
          const now = Date.now();
          const { rules, info: calendar } = await currentRules(now);
          const { phase, nextChangeAt } = phaseAt(now, rules);
          const sessionId = url.searchParams.get('session');
          const { cost, missing, cwd } = await sessionCost(ctx, sessionId, now, rules);
          const ledgerWanted = url.searchParams.get('ledger') === '1';
          const { ledger, missing: ledgerMissing } = await ledgerFor(
            ctx,
            cwd,
            now,
            rules,
            ledgerWanted,
            (await currentSettings(now)).scope,
          );

          const capabilities = [];
          if (cost && cost.capabilities) capabilities.push(...cost.capabilities);
          if (ledgerMissing) capabilities.push(ledgerMissing);

          const namespaces = (() => {
            try {
              const descriptors = ctx.get('settings')?.describe?.() ?? [];
              return descriptors.map((item) => item.ns);
            } catch {
              return [];
            }
          })();

          const body = {
            phase,
            nextChangeAt,
            now,
            calendar,
            diagnostics: {
              configSchema: Config !== undefined,
              configSource: CONFIG_SOURCE,
              hostVersion: hostVersion(),
              expectedHostRange: EXPECTED_HOST_RANGE,
              settingsWritable: saved,
              settingsError: lastError,
              namespaces,
            },
            settings: await currentSettings(now),
            cost,
            ledger,
            missing: missing ?? ledgerMissing ?? null,
            capabilities,
          };

          res.statusCode = 200;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.setHeader('cache-control', 'no-store');
          res.end(JSON.stringify(body));
        },
      }),
    );
  });
}

export { Config };
