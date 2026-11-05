// Границы периодов «сегодня» и «на этой неделе» по локальному времени машины.
//
// Пользователь считает расход в своём поясе, а не в UTC: полночь по Новосибирску
// и полночь по Гринвичу — разные «сегодня».

/** Локальная полночь момента. */
export function dayStart(instantMs) {
  const date = new Date(instantMs);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Локальный понедельник 00:00 недели, в которую попадает момент. */
export function weekStart(instantMs) {
  const date = new Date(dayStart(instantMs));
  const offset = (date.getDay() + 6) % 7; // понедельник = 0
  date.setDate(date.getDate() - offset);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}
