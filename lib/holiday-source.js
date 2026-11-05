// Источники календаря праздников КНР.
//
// Приоритет: встроенная таблица → файл пользователя → удалённое обновление.
// Любой источник может быть битым или недоступным: тогда работают остальные,
// потому что цена ошибки — неверная фаза, а цена падения — пустая пилюля.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Настоящая ли это календарная дата: 2027-13-40 отбрасывается, как и мусор. */
function isCalendarDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** Оставить только корректные даты формата YYYY-MM-DD. */
export function normalizeDateList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(isCalendarDate);
}

/**
 * Слить встроенный календарь с оверрайдами.
 * @param builtin - даты встроенной таблицы
 * @param overrides - { dates?: string[], remove?: string[] }
 * @returns множество дат, когда действует off-peak
 */
export function mergeHolidays(builtin, overrides) {
  const set = new Set(normalizeDateList(builtin));
  if (overrides === null || typeof overrides !== 'object') return set;
  for (const date of normalizeDateList(overrides.dates)) set.add(date);
  for (const date of normalizeDateList(overrides.remove)) set.delete(date);
  return set;
}

/** Свеж ли кэш удалённого календаря. */
export function remoteIsFresh(cache, now, ttlMs) {
  if (cache === null || typeof cache !== 'object') return false;
  if (typeof cache.fetchedAt !== 'number') return false;
  const age = now - cache.fetchedAt;
  return age >= 0 && age < ttlMs;
}
