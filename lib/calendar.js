// Календарь тарифицируемых окон DeepSeek.
//
// Официальные правила (api-docs.deepseek.com/quick_start/pricing):
//   пик    — 01:00-04:00 и 06:00-10:00 UTC, будни, кроме праздников КНР;
//   off-peak — всё остальное, включая выходные и праздники целиком;
//   off-peak вдвое дешевле пика.
//
// Окна заданы в UTC, а календарь праздников и день недели — по Пекину:
// окна 01-04 и 06-10 UTC попадают в один и тот же пекинский день (09-12 и 14-18),
// поэтому расхождения между двумя календарями на этих часах не возникает.

import { BUILTIN_HOLIDAYS } from './holidays.js';

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
const BEIJING_OFFSET_MS = 8 * HOUR_MS;

export const PEAK_WINDOWS_UTC = [
  [1, 4],
  [6, 10],
];

const EDGE_HOURS = PEAK_WINDOWS_UTC.flat();
const MAX_DAYS_AHEAD = 16;

export const DEFAULT_RULES = Object.freeze({
  windowsUtc: PEAK_WINDOWS_UTC,
  holidays: new Set(BUILTIN_HOLIDAYS),
});

/** Пекинская календарная дата момента: 'YYYY-MM-DD'. */
export function beijingDateKey(instantMs) {
  return new Date(instantMs + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}

/** День недели по Пекину: 0 — воскресенье. */
function beijingWeekday(instantMs) {
  return new Date(instantMs + BEIJING_OFFSET_MS).getUTCDay();
}

function isWeekend(instantMs) {
  const day = beijingWeekday(instantMs);
  return day === 0 || day === 6;
}

function isHoliday(instantMs, holidays) {
  return holidays.has(beijingDateKey(instantMs));
}

function isInWindow(instantMs, windowsUtc) {
  const hour = new Date(instantMs).getUTCHours();
  for (const [start, end] of windowsUtc) {
    if (hour >= start && hour < end) return true;
  }
  return false;
}

/** Действует ли момент как пиковый. */
export function isPeak(instantMs, rules = DEFAULT_RULES) {
  if (isHoliday(instantMs, rules.holidays)) return false;
  if (isWeekend(instantMs)) return false;
  return isInWindow(instantMs, rules.windowsUtc);
}

/**
 * Фаза момента и момент ближайшего переключения.
 * @returns {{ phase: 'peak'|'off-peak', nextChangeAt: number }}
 */
export function phaseAt(instantMs, rules = DEFAULT_RULES) {
  const phase = isPeak(instantMs, rules) ? 'peak' : 'off-peak';
  const nextChangeAt = nextPeakChangeAt(instantMs, rules);
  return { phase, nextChangeAt };
}

/**
 * Ближайший момент, когда фаза сменится. Переключения возможны только на краях
 * окон: выходные и праздники занимают целые дни, а их границы лежат вне окон.
 */
export function nextPeakChangeAt(instantMs, rules = DEFAULT_RULES) {
  const current = isPeak(instantMs, rules);
  const dayStart = Math.floor(instantMs / DAY_MS) * DAY_MS;
  for (let day = 0; day <= MAX_DAYS_AHEAD; day += 1) {
    for (const hour of EDGE_HOURS) {
      const candidate = dayStart + day * DAY_MS + hour * HOUR_MS;
      if (candidate <= instantMs) continue;
      if (isPeak(candidate, rules) !== current) return candidate;
    }
  }
  return null;
}

/** Сколько миллисекунд осталось до переключения. */
export function msUntilChange(instantMs, rules = DEFAULT_RULES) {
  const next = nextPeakChangeAt(instantMs, rules);
  return next === null ? null : next - instantMs;
}
