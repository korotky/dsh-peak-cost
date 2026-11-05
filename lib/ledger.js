// Отбор сессий для леджера «сегодня / неделя».
//
// Считаем только сессии той же рабочей папки: иначе в сумму попадут чужие
// проекты. Форки исключаются — их токены уже посчитаны в родительской сессии;
// сабагент-сессии остаются, потому что это отдельные сессии с собственными
// токенами, которые иначе потерялись бы.

/**
 * @param records - записи sessionQuery.filterSessions
 * @param cwd - рабочая папка, по которой считаем; `null` — все папки
 * @returns идентификаторы сессий, которые входят в леджер
 */
export function selectLedgerSessions(records, cwd) {
  const allWorkspaces = cwd === null;
  if (!allWorkspaces && (typeof cwd !== 'string' || cwd === '')) return [];
  const ids = [];
  for (const record of records ?? []) {
    const header = record?.header;
    if (!header || typeof header.id !== 'string') continue;
    if (!allWorkspaces && header.cwd !== cwd) continue;
    if (header.origin === 'fork') continue;
    ids.push(header.id);
  }
  return ids;
}
