# Аудит конкурентов: пик/off-peak и стоимость в DSH-плагинах

Дата: 2026-11-05. Задача: разобрать существующие плагины про пиковые часы и стоимость, чтобы спланировать
свой плагин (пилюля в `conversation.composer.dock`) и не повторять чужих ошибок.

Окружение проверки: `@deepseek-ai/dsh` **0.2.1-rc.5**, профиль `web` (локальный чекаут
`/home/lega/.nvm/versions/node/v24.14.0/lib/node_modules/@deepseek-ai/dsh`), хост в зоне
`Asia/Novosibirsk` (+07) — это важно: часть плагинов считает пик по **локальным** часам и на нашей машине
ошибается на час.

Все ссылки — на конкретные коммиты, чтобы строки не уехали.

| Сокращение | Репозиторий                                                                                           | Версия | Коммит                     |
| ---------- | ----------------------------------------------------------------------------------------------------- | ------ | -------------------------- |
| PR         | [54nanmiao/dsh-peak-reminder](https://github.com/54nanmiao/dsh-peak-reminder)                         | 0.3.0  | `9569e58`                  |
| COST       | [Arun1016/dsh-cost](https://github.com/Arun1016/dsh-cost)                                             | 1.3.1  | `e579772`                  |
| WHALE      | [MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget) | 0.4.2  | `5247dd6`                  |
| DASH       | [Cassius0924/dsh-usage-dashboard](https://github.com/Cassius0924/dsh-usage-dashboard)                 | 0.9.0  | `aee5085` (ветка `master`) |
| API        | [133563825as-ai/dsh-api-dashboard](https://github.com/133563825as-ai/dsh-api-dashboard)               | 1.7.0  | `b57f953`                  |

Что читали: PR — целиком (`lib/peak.js`, `lib/ledger.js`, `lib/index.js`, `lib/pause.js`, `lib/client.js`,
`cordis.patch.yml`, `package.json`, `test/run.mjs`, README). COST — `src/index.ts`, `src/client/*`,
`tests/cost-stats.spec.ts`, оба README, `package.json`, `cordis.patch.yml`. WHALE — только части про
пик/цену/учёт (`lib/index.js` в районе строк 545–700, 930–992, 1440–1560, 3070–3150; `lib/accounting.mjs`;
README §«定价表»), ассеты/звуки/маскот игнорировались. DASH и API — выборочно: как считают расход и где
показывают (для DASH — весь `src/pricing.ts`, ключевые места `src/usage.ts`, `src/index.ts`, `src/client/index.tsx`;
для API — таблицы цен/праздников, маршруты, регистрация слота, `AGENTS.md` как источник авторских заметок).

---

## 0. TL;DR

- **Ни один плагин не закрывает задачу целиком.** PR знает время, но не деньги (читает чужой файл);
  COST ближе всех к «правильным деньгам», но врёт по часам вне Пекина; WHALE считает «наблюдаемый расход»
  по балансу, но не умеет сессию/кэш-запись/web-fee; DASH — дашборд без праздников; API — самый зрелый
  по деньгам, но тяжёлый и с авто-апдейтом.
- **Пик/off-peak:** четыре плагина из пяти считают корректно (PR, WHALE, DASH, API — через `+8h`), COST —
  по локальным часам. Наш хост в +07: это не мелочь, а час разницы каждый день.
- **Лучший референс по учёту — COST:** пер-запросная цена по `event.time`, четыре бакета, сабагенты
  через `sessionQuery`, web-fee по `tool/call`+`tool/result`. Его таймзону, молчаливое скрытие пилюли и
  спорный `pro → flash` копировать нельзя.
- **Праздники:** таблицы только на 2026 у всех, у PR есть часть 2027 и внешний JSON с merge; у DASH
  праздников нет вообще. Никто не умеет обновлять таблицу из сети.
- **Web search/fetch fee** реализован только в COST (¥0.005/запрос, с 2026-11-01).
- **Баланс:** два пути — API-ключ через `credentials` (COST, DASH) или `deepseekAccount` без ключа
  (DASH, WHALE); в хосте есть оба.
- **UI:** `conversation.composer.dock` — список, официальные пилюли занимают order 0 и 1, сторонние — 2 и 5;
  сортировка стабильная. Свою пилюлю лучше ставить order ≥ 6.
- **Сигнал об изменении API хоста** есть только у API (манифест совместимости) и частично у WHALE
  (warn при отсутствии `connection.requestRejection`); COST в этом случае просто молча исчезает.

## 1. Сводная таблица

Колонки — плагины, строки — то, что нам нужно решить у себя.

| Критерий                   | PR (peak-reminder)                                                                                    | COST (dsh-cost)                                                                | WHALE (whale-widget)                                                                                           | DASH (usage-dashboard)                                                                                                                                | API (api-dashboard)                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Часы для пика**          | Пекинское время через сдвиг `+8h` и чтение UTC-полей; клиент берёт `now` у хоста                      | **Локальные часы машины** (`new Date().getHours()`) — на нашей +07 машине врёт | Пекинское время `+8h`                                                                                          | Пекинское время `+8h` (`BEIJING_OFFSET_MS`)                                                                                                           | Пекинское время `+8h`                                                    |
| **Окна пика**              | `[9,12)`, `[14,18)`, настраиваются (`peakHours`)                                                      | `[9,12)`, `[14,18)`, хардкод                                                   | `[9,12)`, `[14,18)`, хардкод                                                                                   | `[9,12)`, `[14,18)`; до 2026-09-10 — **каждый день**, после — только пн–пт                                                                            | `[9,12)`, `[14,18)`, хардкод                                             |
| **Выходные**               | Вся суббота/воскресенье —谷, но только с 2026-08-23 (до этого — пик)                                  | Всегда谷 (без historical-границы)                                              | Всегда谷 с 2026-08-23                                                                                          | 谷 только с 2026-09-10; до этого пик-окна действовали и в выходные                                                                                    | Всегда谷                                                                 |
| **Праздники КНР**          | Есть таблица 2026 + часть 2027; действует с 2026-09-19                                                | Есть таблица **только 2026**; в конфиге **заменяется**, не дополняется         | Есть таблица 2026; действует с 2026-09-19                                                                      | **Нет вообще**                                                                                                                                        | Есть диапазоны 2026 (`CN_HOLIDAY_RANGES`), «нет года → не праздник»      |
| **调休 (рабочие субботы)** | Явно: считаются谷, т.к. это выходной                                                                  | Явно: «выходной, ставший рабочим» =谷                                          | Явно: перечислены даты 调休, все на выходных →谷                                                               | Не рассматривается                                                                                                                                    | Явно: 调休 не в таблице, т.к. это выходной                               |
| **Учёт токенов**           | **Своего нет** — читает чужой файл `.dshw-usage.json`                                                 | Своё: `assistant/message` + `usage`, пер-запросно                              | Своё: агрегат по (session,turn), пишет событие на `turn/end`                                                   | Своё: перечитывает все логи через `sessionPersistence`                                                                                                | Своё: проекция `queryBalanceCost` с фазовыми бакетами                    |
| **Бакеты**                 | —                                                                                                     | cacheRead / uncachedInput / output; **cacheWrite по цене input**               | input / cacheRead / output; **cacheWrite не учитывается**                                                      | input / cacheRead / output; **cacheWrite не читается**                                                                                                | uncached / cacheRead / cacheWrite / output (**cacheWrite по cacheMiss**) |
| **Момент цены**            | —                                                                                                     | Время события (`event.time`)                                                   | `Date.now()` в момент обработки сообщения                                                                      | Время события                                                                                                                                         | Время события (фаза в проекции)                                          |
| **Сабагенты**              | —                                                                                                     | Да: `sessionQuery.traceSession`, `origin: subagent`, любой уровень             | Нет атрибуции (общий глобальный журнал)                                                                        | Нет: каждая сессия отдельно                                                                                                                           | Да, отдельной строкой, «только своё» через `inheritedEventCount`         |
| **Форки**                  | —                                                                                                     | Исключает унаследованный префикс (`ownEvents()`)                               | Не рассматриваются                                                                                             | **Не исключаются**                                                                                                                                    | Исключает префикс по `inheritedEventCount`                               |
| **Web search/fetch fee**   | Нет                                                                                                   | **Да**: ¥0.005/успешный запрос, с 2026-11-01, по времени результата            | Нет                                                                                                            | Нет                                                                                                                                                   | Нет                                                                      |
| **Валюта цен**             | USD-таблица в `/state` (клиент её **не читает**); строка `¥` — из CNY-леджера WHALE                   | CNY                                                                            | CNY (`[谷, 峰]`), кастомные цены CNY/USD + курс                                                                | CNY                                                                                                                                                   | CNY и USD — **две официальные таблицы**, без пересчёта                   |
| **Обновление цен**         | Константа в коде + релиз                                                                              | Константы + датированные «эры» (срез 2026-09-10)                               | Константы + пользовательские цены                                                                              | Константы + «эры» (2026-08-17 / 09-10 / 09-14)                                                                                                        | Константы + релиз                                                        |
| **Сеть**                   | Нет                                                                                                   | `GET api.deepseek.com/user/balance` (ключ), таймаут 15 с                       | Много провайдеров + DeepSeek + account, TTL 25 с                                                               | DeepSeek balance или `deepseekAccount`, TTL 60 с                                                                                                      | Много провайдеров, state-файл, авто-апдейт                               |
| **Файлы на диске**         | `~/.dsh/peak-reminder.json`, `~/.dsh/peak-reminder-paused.json`; **читает** `~/.dsh/.dshw-usage.json` | Ничего                                                                         | `.dshw-usage.json`, `.dshw-usage-archive.json`, `.dshw-size.json`, `.dshw-api.json`, `.dshw-bubble.json` и др. | Ничего (memo в памяти)                                                                                                                                | `$DSH_HOME/dsh-api-dashboard.json` (0600, **ключи明文**)                 |
| **i18n**                   | **Нет** (только китайский, строки в клиенте)                                                          | `ctx.locale.register('cost-stats', {zh,en})`, 20 ключей                        | Нет (китайский)                                                                                                | Свой `locales` + `NS`, zh/en                                                                                                                          | `ctx.locale.register('apiDashboard', {zh,en})`, zh/en                    |
| **Слоты**                  | `sidebar.footer.action` (order 90), `settings.section` (order 880)                                    | `conversation.composer.dock`, `id: cost-stats`, `order: 2`                     | **Слотов нет**: скрипт-инъекция + плавающий маскот                                                             | `shell.overlay`, `composer.dock` (order 2), `sidebar.footer.action` (order 10), `sidebar.panellist`, `main`, `conversation.view`, `assistant-actions` | `composer.dock` (`order: 5`) + собственные DOM-оверлеи                   |
| **Поведение при поломке**  | Клиент показывает «не подключено»; хост кидает 500 с `reason`                                         | **Молча скрывает всю пилюлю**; ошибки баланса — 200 без поля                   | Fallback-проверки, warn в лог; фронт считает пик сам                                                           | Возвращает `ok:false` + `error`, UI показывает ошибку                                                                                                 | `allowRequest` → 401/403, иначе 200 + `ok:false`                         |

---

## 2. Точные правила пик/off-peak

### 2.1 PR: пекинский календарь, две исторические границы

Ключевое: время не «локальное», а **сдвинутое на +8h** и читаемое через UTC-геттеры. Это единственный
корректный способ не зависеть от TZ машины (и он же нужен нам).

```js
// 54nanmiao/dsh-peak-reminder/lib/peak.js:100-132
function beijingDate(timeSec) {
  return new Date(Number(timeSec) * 1000 + 8 * 3600 * 1000);
}
export function isWeekend(timeSec) {
  const n = Number(timeSec);
  if (!isFinite(n) || n < WEEKEND_VALLEY_FROM_SEC) return false;
  const dow = beijingDate(n).getUTCDay();
  return dow === 0 || dow === 6;
}
export function isHolidayValley(timeSec, rules = DEFAULT_RULES) {
  const n = Number(timeSec);
  if (!isFinite(n) || n < HOLIDAY_VALLEY_FROM_SEC) return false;
  return Boolean(rules.holidays[beijingDate(n).toISOString().slice(0, 10)]);
}
export function isPeakTime(timeSec, rules = DEFAULT_RULES) {
  const n = Number(timeSec);
  if (!isFinite(n)) return false;
  if (isWeekend(n)) return false;
  if (isHolidayValley(n, rules)) return false;
  const hour = beijingDate(n).getUTCHours();
  for (const [start, end] of rules.peakHours) if (hour >= start && hour < end) return true;
  return false;
}
```

Границы «с какого момента правило действует» ([peak.js:22-24](https://github.com/54nanmiao/dsh-peak-reminder/blob/9569e58/lib/peak.js#L22)):

```js
export const WEEKEND_VALLEY_FROM_SEC = Math.floor(Date.UTC(2026, 7, 22, 16, 0, 0) / 1000); // 北京 2026-08-23 00:00
export const HOLIDAY_VALLEY_FROM_SEC = Math.floor(Date.UTC(2026, 8, 18, 16, 0, 0) / 1000); // 北京 2026-09-19 00:00
```

То есть плагин умеет пересчитывать **историю**: запрос 2026-08-22 (суббота) считается пиковым, потому что
тогда выходные ещё не были谷. Это правильно, но цена — мёртвые записи в таблице: даты 2026-01…2026-06
в `HOLIDAY_VALLEY` (строки 27–37) никогда не сработают, т.к. отсечены `HOLIDAY_VALLEY_FROM_SEC`
(2026-09-19). Автор это знает и в комментарии объясняет, что в 2026 году между 8/17 и 9/19 не было
праздников на буднях, так что на практику не влияет — но таблица вводит в заблуждение.

Примерка «сколько до переключения» — тот же источник правил, скан 12 дней по граничным часам:

```js
// lib/peak.js:145-159
export function nextPeakChangeAt(timeSec, rules = DEFAULT_RULES) {
  const n = Number(timeSec);
  if (!isFinite(n)) return null;
  const cur = isPeakTime(n, rules);
  const day0 = Math.floor((n + 8 * 3600) / 86400) * 86400;
  const edges = hourEdges(rules);
  for (let d = 0; d <= 12; d++)
    for (const edge of edges) {
      const cand = day0 + d * 86400 + edge * 3600 - 8 * 3600;
      if (cand <= n + 1) continue;
      if (isPeakTime(cand, rules) !== cur) return cand;
    }
  return null;
}
```

Замечание: `hourEdges` всегда добавляет `0` (полночь), потому что в полночь может закончиться
праздничный/выходной день — ок.

### 2.2 COST: локальные часы — на нашей машине это баг

```ts
// Arun1016/dsh-cost/src/index.ts:227-250
function localDateKey(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`; // ЛОКАЛЬНАЯ дата
}
export function isPeakPeriod(now: Date, holidays = DEFAULT_HOLIDAY_SET): boolean {
  const day = now.getDay(); // ЛОКАЛЬНЫЙ день недели
  if (day === 0 || day === 6) return false;
  if (holidays.has(localDateKey(now))) return false;
  const minutes = now.getHours() * 60 + now.getMinutes(); // ЛОКАЛЬНЫЕ часы
  return (minutes >= 9 * 60 && minutes < 12 * 60) || (minutes >= 14 * 60 && minutes < 18 * 60);
}
```

README это честно признаёт: «Clock used — the local clock of the machine running dsh … only exact on a
Beijing-time host» ([README.md:67](https://github.com/Arun1016/dsh-cost/blob/e579772/README.md#L67)).
На нашем +07 хосте пик сдвинется на час; хуже — `holidays` сравниваются с локальной датой, поэтому около
полуночи праздник может «съехать» на день.

Это самый важный урок: **никогда не `new Date().getHours()`** для пекинских окон.

### 2.3 WHALE: пекинское время, но цена берётся «сейчас»

```js
// MeteorNOX/.../lib/index.js:643-657
function isPeakTime(timeSec) {
  const n = Number(timeSec)
  const bj = new Date(n * 1000 + 8 * 3600 * 1000)
  if (n >= WEEKEND_VALLEY_FROM_SEC) {
    const dow = bj.getUTCDay()
    if (dow === 0 || dow === 6) return false
  }
  if (n >= HOLIDAY_VALLEY_FROM_SEC && isHolidayValley(bj)) return false
  const hour = bj.getUTCHours()
  ...
}
```

Само правило — то же, с теми же двумя историческими границами (2026-08-23 и 2026-09-19,
[строки 611/634](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/blob/5247dd6/lib/index.js#L611)).
Но при расчёте стоимости в `handleSessionEvent` вызывается `isPeakTime(Math.floor(Date.now()/1000))`
([строка 977](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/blob/5247dd6/lib/index.js#L977)),
а не время события — см. §4.4.

### 2.4 DASH: эры правил, праздников нет

DASH единственный, кто моделирует **три** эпохи, включая доковый период: до 2026-08-17 — плоская цена;
2026-08-17…09-10 — пик-окна **каждый день**; с 2026-09-10 — только пн–пт.

```ts
// Cassius0924/dsh-usage-dashboard/src/pricing.ts:77-87, 140-144
const PRICE_ERAS = [
  { fromMs: PEAK_PRICING_FROM_MS, peak: PEAK_RATES_08_17, weekdaysOnly: false },
  { fromMs: V41_FLASH_PRICING_FROM_MS, peak: PEAK_RATES_09_10, weekdaysOnly: true },
];
export function isPeak(timeMs: number): boolean {
  if (eraAt(timeMs).weekdaysOnly && !isBeijingWeekday(timeMs)) return false;
  const hour = Math.floor(
    ((((timeMs + BEIJING_OFFSET_MS) % 86_400_000) + 86_400_000) % 86_400_000) / 3_600_000,
  );
  return PEAK_WINDOWS.some(([from, to]) => hour >= from && hour < to);
}
```

Праздники КНР **не реализованы вообще** — ни таблицы, ни упоминания в коде и README (`grep -ri holiday`
по `src/` и README даёт пусто). То есть в 33 праздничных дня года DASH завышает оценку вдвое. Для своего
плагина это неприемлемо, для аудита — важный факт.

### 2.5 API: праздники как диапазоны, правило «нет года → не праздник»

```js
// 133563825as-ai/dsh-api-dashboard/src/index.js:1175-1212
const CN_HOLIDAY_RANGES = {
  2026: [
    ['2026-01-01', '2026-01-03'],
    ['2026-02-15', '2026-02-23'],
    ['2026-04-04', '2026-04-06'],
    ['2026-05-01', '2026-05-05'],
    ['2026-06-19', '2026-06-21'],
    ['2026-09-25', '2026-09-27'],
    ['2026-10-01', '2026-10-07'],
  ],
};
const isCnHoliday = (ymd) => {
  const ranges = CN_HOLIDAY_RANGES[Number(String(ymd).slice(0, 4))];
  if (!Array.isArray(ranges)) return false;
  return ranges.some(([from, to]) => ymd >= from && ymd <= to);
};
export const isPeakTime = (timestamp = Date.now()) => {
  const { weekday, hour, ymd } = bjtParts(timestamp);
  if (weekday === 0 || weekday === 6) return false;
  if (isCnHoliday(ymd)) return false;
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18);
};
```

Диапазоны — компактнее, чем перечисление дней; поведение при отсутствии года — «считать рабочим днём»
(то есть переоценить, а не недооценить). В комментарии на
[строке 1143](https://github.com/133563825as-ai/dsh-api-dashboard/blob/b57f953/src/index.js#L1143) написано
«см. известный пробел в `isPeakTime`», хотя код праздники уже учитывает — **устаревший комментарий**,
мелочь, но показывает, как легко разъехаться с реальностью.

### 2.6 Разногласия, которые надо решить нам

| Вопрос                             | PR                          | COST                          | WHALE                    | DASH                               | API                      |
| ---------------------------------- | --------------------------- | ----------------------------- | ------------------------ | ---------------------------------- | ------------------------ |
| Часовой пояс                       | +8                          | **локальный**                 | +8                       | +8                                 | +8                       |
| Начало peak-тарификации            | 2026-08-17 (в комментарии)  | не моделирует                 | 2026-08-17               | 2026-08-17                         | не моделирует            |
| Выходные谷 с                       | 2026-08-23                  | всегда                        | 2026-08-23               | 2026-09-10 (до — пик и в выходные) | всегда                   |
| Праздники谷 с                      | 2026-09-19                  | всегда (для всех дат)         | 2026-09-19               | —                                  | всегда                   |
| `deepseek-v4-pro` после 2026-09-14 | —                           | **переходит на Flash-цену**   | **остаётся по Pro-цене** | **переходит на Flash**             | **остаётся по Pro-цене** |
| Праздники: merge или replace       | merge (builtin+file+config) | **replace** (`default(2026)`) | только builtin           | —                                  | только builtin           |

Расхождение по pro — самое дорогое: у COST/DASH есть `PRO_ROUTED_TO_FLASH_MS` и тест, у WHALE/API в
комментариях прямо написано, что официальное объявление 2026-09-22 отменило маршрутизацию и Pro
продолжает продаваться по своей цене
([WHALE:573-575](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/blob/5247dd6/lib/index.js#L573),
[API:1137-1139](https://github.com/133563825as-ai/dsh-api-dashboard/blob/b57f953/src/index.js#L1137)).
Два против двух — надо идти на официальную страницу цен и не верить никому на слово (см. §13, вопрос 1).

---

## 3. Праздники КНР

|                           | PR                                                                       | COST                                                    | WHALE                                                                          | DASH | API                         |
| ------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------ | ---- | --------------------------- |
| Источник                  | ручная таблица + внешний JSON                                            | `DEFAULT_HOLIDAYS` из уведомления 国办发明电〔2025〕7号 | ручная таблица                                                                 | —    | диапазоны, ссылка на gov.cn |
| Годы                      | 2026 полностью + 2027 частично                                           | **только 2026**                                         | только 2026                                                                    | —    | только 2026                 |
| Формат                    | `{'YYYY-MM-DD': 1}`                                                      | массив строк                                            | `{'YYYY-MM-DD': 1}`                                                            | —    | массив `[from, to]`         |
| Обновление                | правка кода **или** `~/.dsh/peak-reminder-holidays.json`                 | правка `Config.holidays` (заменяет таблицу)             | правка кода                                                                    | —    | правка кода                 |
| Нет года                  | «как обычный рабочий день» (пере-напоминает) — задокументировано         | то же, молча                                            | то же, молча                                                                   | —    | то же, молча                |
| Сигнал «таблица устарела» | **нет** (только комментарий в коде)                                      | нет                                                     | нет (упомянут внешний «探针» `_peak-holiday-check.mjs`, в репозитории его нет) | —    | нет                         |
| 2027                      | 元旦/春节/清明/端午/中秋/国庆, **劳动节 4/30–5/4 намеренно отсутствует** | нет                                                     | нет                                                                            | —    | нет                         |

Таблица 2027 у PR ([peak.js:39-50](https://github.com/54nanmiao/dsh-peak-reminder/blob/9569e58/lib/peak.js#L39))
интересна как пример честного отношения: даты взяты из перепечаток, где 劳动节 помечен «预计»; автор
сознательно не добавил их, потому что «добавить неверную дату = пропустить напоминание, что хуже, чем
лишнее напоминание». Для нашего плагина это готовый аргумент в пользу правила «при отсутствии года
считаем рабочим днём» + явный бейдж «праздники за 2027 не загружены».

Ни один плагин не умеет **обновлять** таблицу из сети — все требуют релиза или ручной правки файла.

---

## 4. Учёт стоимости

### 4.1 Какие бакеты токенов

| Плагин | cache hit                     | cache miss (uncached input)       | cache write                                  | output                  | reasoning                         |
| ------ | ----------------------------- | --------------------------------- | -------------------------------------------- | ----------------------- | --------------------------------- |
| COST   | `cacheReadTokens × cacheRead` | `inputTokens × input`             | `cacheWriteTokens × input` (как miss)        | `outputTokens × output` | не отдельно (входит в output)     |
| WHALE  | `cacheReadTokens × hit`       | `inputTokens × miss`              | **не читает вообще**                         | `outputTokens × out`    | явно не суммируется (issue #89)   |
| DASH   | `cacheReadTokens × cacheHit`  | `inputTokens × input`             | **не читает вообще**                         | `outputTokens × output` | считается, но в стоимость не идёт |
| API    | `cacheReadTokens × cacheHit`  | `uncachedInputTokens × cacheMiss` | `cacheWriteTokens × cacheWrite ?? cacheMiss` | `outputTokens × output` | не отдельно                       |

Хост `0.2.1-rc.5` даёт в проекции `tokenUsage` все четыре поля:
`uncachedInputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `outputTokens`
(`@deepseek-ai/dsh-token-meter/lib/index.js:321-330`). То есть WHALE и DASH **теряют бакет**, который
хост отдаёт; COST и API его учитывают, но по разной цене (COST — по цене input, API — по `cacheWrite`,
иначе `cacheMiss`). Официальная цена кэш-записи для DeepSeek нигде в этих репозиториях не подтверждена —
это открытый вопрос (см. §13).

### 4.2 Откуда берутся токены

**COST** — «горячая» сессия из `ctx.get('sessions')`, свои события (без унаследованного форк-префикса),
по одному `assistant/message` c `data.usage` и `message.source.model`:

```ts
// Arun1016/dsh-cost/src/index.ts:540-570
for (const event of events) {
  if (event.type !== 'assistant/message') continue
  const source = data.message?.source
  if (source === undefined || source.kind !== 'model' || typeof source.model !== 'string') continue
  if (data.usage === undefined) continue
  const model = canonicalModel(source.model)
  ...
  accumulateUsage(data.usage, acc, pricesAt(model, event.time, holidays))
}
```

Отдельно — «холодная» сессия (не привязана к хосту): берётся `sessionProjections.snapshot(...).tokenUsage`
и цена **на сейчас**, без разбивки по моделям и без web-fee (README:90-91, код
[1073-1095](https://github.com/Arun1016/dsh-cost/blob/e579772/src/index.ts#L1073)).

**WHALE** — слушает поток событий сессии, агрегирует по `(session, turn)`, на `turn/end` пишет в
`.dshw-usage.json` одну запись на модель с `ts: agg.lastTs`:

```js
// MeteorNOX/.../lib/index.js:953-991, 1507-1516
if (type !== 'assistant/message') return
const input = Number(usage.inputTokens) || 0
const cache = Number(usage.cacheReadTokens) || 0
const output = Number(usage.outputTokens) || 0
const outputBilled = output // DSH outputTokens already includes reasoningTokens.
const p = priceFor(model)
const off = isPeakTime(Math.floor(Date.now() / 1000)) ? 1 : 0
let costMsg = (cache/1e6)*p.hit[off] + (input/1e6)*p.miss[off] + (outputBilled/1e6)*p.out[off]
...
led.events.push({ ts, day: dayKeyFromTs(ts), model, cost: preciseMoney(...), tokens })
```

**DASH** — перечитывает **все** логи через `sessionPersistence.list()` + `readSession(id)`; на каждый
`assistant/message` берёт `inputTokens/outputTokens/cacheReadTokens/reasoningTokens` (обратите внимание —
`cacheWriteTokens` в списке нет):

```ts
// Cassius0924/dsh-usage-dashboard/src/usage.ts:295-300
const values = [
  usage.inputTokens,
  usage.outputTokens,
  usage.cacheReadTokens,
  usage.reasoningTokens,
].map((value) => (value === undefined ? 0 : Number(value)));
```

**API** — своя проекция `queryBalanceCost` на `sessionProjections`, с фазовыми бакетами (`phaseBuckets`),
историю читает по `event.time`, а не «на момент просмотра» (это прямо описано в `AGENTS.md` как
исправление 2026-09-22).

### 4.3 Сабагенты и форки

**COST** — самый полный вариант: обходит дерево и вливает сабагентов в те же цифры (с оговорками).

```ts
// src/index.ts:893-918 — обход дерева через sessionQuery
const trace = await query.traceSession(root.id as never);
const visit = (nodes) => {
  for (const node of nodes) {
    const { id, origin } = node.session.header;
    if (origin !== 'subagent') continue; // пользовательский форк — не считается
    records.push({ id: String(id), live: node.session.live === true });
    visit(node.descendants);
  }
};
```

Живые дети читаются из `sessions`, закрытые — через `query.readSession(id)` с `inheritedEventCount`
(отсекает унаследованный префикс) и кэшем на 256 записей
([953-970](https://github.com/Arun1016/dsh-cost/blob/e579772/src/index.ts#L953),
[1003-1018](https://github.com/Arun1016/dsh-cost/blob/e579772/src/index.ts#L1003)). Стоимость сабагентов
**не отдельной строкой**, а вливается в общий итог, бакеты, web-строки и модели; в UI появляется пометка
«(incl. subagents)» и число сессий
([BalancePill.tsx:299-316](https://github.com/Arun1016/dsh-cost/blob/e579772/src/client/BalancePill.tsx#L299)).

**API** — сабагенты отдельной строкой, «только своё»: `init(header, inheritedEventCount)`, фолд с
`seq >= inheritedEventCount`, и **не** складывать с основным числом (это осознанное решение, см.
`AGENTS.md` §«子代理消耗是怎么算出来的» и `stateVersion`).

**WHALE** — атрибуции нет: события пишутся в один глобальный журнал без `sessionId`
([1510-1516](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/blob/5247dd6/lib/index.js#L1510)),
поэтому «стоимость сессии» в его терминах — это не сессия, а «сегодня по всем».

**DASH** — ни сабагентов, ни форков: каждая сессия из `persistence.list()` агрегируется отдельно
([usage.ts:506-513](https://github.com/Cassius0924/dsh-usage-dashboard/blob/aee5085/src/usage.ts#L506)).
Следствия: (а) сабагент виден как отдельная сессия, к родителю не приписан; (б) если персистентный лог
форка содержит унаследованный префикс, он **посчитается второй раз** (в COST для этого есть
`ownEvents()`/`inheritedEventCount`, в DASH — ничего).

### 4.4 Цена на момент запроса vs на момент подсчёта

| Плагин | Что используется                                                                    | Корректно?                                                                                                                                                                |
| ------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| COST   | `event.time` каждого `assistant/message`, `pricesAt(model, event.time)`             | да                                                                                                                                                                        |
| DASH   | `event.time` + `ratesAt(timeMs, model)` с эрами                                     | да                                                                                                                                                                        |
| API    | фаза, посчитанная при фолде события (`event.time`)                                  | да (после фикса)                                                                                                                                                          |
| WHALE  | `Date.now()` при обработке сообщения; запись в журнал — с `ts` последнего сообщения | **частично**: цена фиксируется «сейчас», а в журнал попадает одна агрегированная запись на турн → турн, пересекающий 12:00/14:00/18:00, целиком оценивается по одной фазе |
| PR     | не считает                                                                          | —                                                                                                                                                                         |

WHALE-баг воспроизводим: длинный турн, начавшийся в 11:55 и закончившийся в 12:05, будет целиком
посчитан по той фазе, в которую пришло последнее `assistant/message`; при этом `ts` записи = `lastTs`,
поэтому при пересчёте «исторической» цены из журнала (как это делает PR в `ledger.js`) фаза определится
по последнему сообщению тура. Двойная потеря точности.

### 4.5 Web search / fetch

Реализовано **только в COST**, и это самая подробная часть. Логика: сопоставить `tool/call` c
`tool/result` по `callId`; первый результат считается настоящим (последующие — «прунинг контента», а не
второй запрос); `isError` — бесплатно; `web_search` с маркером «No results found.» — бесплатно; число
запросов = число **уникальных** queries; цена — по времени результата.

```ts
// src/index.ts:419-469 (сокращено)
if (event.type === 'tool/call') {
  if (data.name !== 'web_search' && data.name !== 'web_fetch') continue
  calls.set(data.callId, { name: data.name, queries: webSearchQueries(data.arguments) })
}
if (event.type !== 'tool/result') continue
if (results.has(message.toolCallId)) continue          // замена контента ≠ второй запрос
...
if (result.message.isError === true) continue
const price = webCallPriceYuan(result.time)           // ¥0.005 с 2026-11-01, иначе 0
if (call.name === WEB_FETCH_TOOL) { fetch.calls += 1; fetch.amount += price; continue }
if (toolResultText(result.message).includes('No results found.')) continue
const requests = call.queries.length
search.calls += requests; search.amount += requests * price
```

```ts
// src/index.ts:120-127
const WEB_CALL_PRICE_YUAN = 5 / 1000; // ¥5 / 1000 успешных запросов
const WEB_CALL_BILLING_START_MS = Date.parse('2026-11-01T00:00:00+08:00');
```

Ограничения автор перечислил сам (README:91-93): у «холодной» сессии web-fee нет (лог не загружается);
мультизапросный `web_search`, где часть запросов пустая, **переоценивается** (нельзя разделить после
мержа результатов); запрос, попавший ровно на границу 2026-11-01 00:00, может уехать на секунды.

У WHALE/DASH/API web-fee нет вообще (`grep web_search` по их коду даёт 0).

---

## 5. Таблица цен и валюта

**COST** — CNY, только peak-ставки, off-peak = ровно половина; датированные «эры»:

```ts
// src/index.ts:87-106
const FLASH_PRICES_BEFORE_CUT = { input: 3.0, cacheRead: 0.1, output: 9.0 };
const FLASH_PRICES_AFTER_CUT = { input: 2.0, cacheRead: 0.04, output: 8.0 };
const PRO_PRICES = { input: 9.0, cacheRead: 0.3, output: 27.0 };
const FLASH_CUT_MS = Date.parse('2026-09-10T12:00:00+08:00');
const PRO_ROUTED_TO_FLASH_MS = Date.parse('2026-09-14T12:00:00+08:00');
```

**WHALE** — CNY, пары `[谷, 峰]`, плюс пользовательские цены по подстроке и валюта/курс:

```js
// lib/index.js:572-583
const BASE_PRICE = { hit: [0.02, 0.04], miss: [1, 2], out: [4, 8] };
const PRO_PRICE = { hit: [0.15, 0.3], miss: [4.5, 9.0], out: [13.5, 27.0] };
const PRICING = {
  'deepseek-flash': BASE_PRICE,
  'deepseek-v4-flash': BASE_PRICE,
  'deepseek-v4-flash-vision-exp': BASE_PRICE,
  'deepseek-v4-pro': PRO_PRICE,
  _default: BASE_PRICE,
};
```

**DASH** — CNY, «эры» + доковый плоский тариф до 2026-08-17; неизвестная модель → **pro** (дороже,
консервативно):

```ts
// src/pricing.ts:44-66, 98-103
const FLAT_RATES = { pro: { cacheHit: 0.025, input: 3, output: 6 }, flash: {...} }
const PEAK_RATES_08_17 = { pro: { cacheHit: 0.3, input: 9, output: 27 }, flash: { cacheHit: 0.1, input: 3, output: 9 } }
const PEAK_RATES_09_10 = { pro: { cacheHit: 0.3, input: 9, output: 27 }, flash: { cacheHit: 0.04, input: 2, output: 8 } }
export function tierOf(model) { if (name.includes('vision')) return 'vision'; if (name.includes('flash')) return 'flash'; return 'pro' }
```

**API** — **две официальные таблицы**: CNY и USD (USD — прямой официальный прайс, не пересчёт по курсу):

```js
// src/index.js:1144-1153
export const V4_RATES = {
  CNY: { peak: { 'deepseek-flash': { cacheHit: 0.04, cacheMiss: 2, output: 8 },
                 'deepseek-v4-pro': { cacheHit: 0.3, cacheMiss: 9, output: 27 } },
         offPeak: { ... } },
  USD: { peak: { 'deepseek-flash': { cacheHit: 0.006, cacheMiss: 0.3, output: 1.2 }, ... } },
}
```

**PR** — USD-таблица (`PRICES`, [peak.js:177-188](https://github.com/54nanmiao/dsh-peak-reminder/blob/9569e58/lib/peak.js#L177))
уходит в `/state` вместе с `rateMultiplier`, но **клиент их не читает** (`grep prices lib/client.js` — пусто);
единственная показанная сумма — `¥` из чужого CNY-леджера WHALE
([client.js:321](https://github.com/54nanmiao/dsh-peak-reminder/blob/9569e58/lib/client.js#L321)). То есть
две валюты на экране не смешиваются, но в `/state` лежит мёртвое поле в USD, по которому нельзя считать.

Практический вывод: официальные CNY- и USD-цены **не** относятся друг к другу как 7:1 (у DeepSeek
USD — прямой прайс, отношение ≈6,67). Если мы будем показывать USD, надо брать официальную USD-таблицу
(как API), а не делить CNY на курс.

---

## 6. Сеть, приватность, файлы

|       | Сеть                                                                                                                                                | Диск                                                                                                                                                                                                                                    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR    | **нет** (README:13)                                                                                                                                 | пишет `~/.dsh/peak-reminder.json`, `~/.dsh/peak-reminder-paused.json`; **читает** `~/.dsh/.dshw-usage.json` — файл чужого плагина                                                                                                       |
| COST  | `GET https://api.deepseek.com/user/balance`, Bearer-ключ, timeout 15 s; кэш 30 s                                                                    | **ничего** (README:25,86)                                                                                                                                                                                                               |
| WHALE | десятки эндпоинтов провайдеров (DeepSeek, OpenRouter, Moonshot, SiliconFlow, Novita, StepFun, Zhipu, …), `/user/balance`, account service; TTL 25 s | `.dshw-usage.json`, `.dshw-usage-archive.json`, `.dshw-size.json`, `.dshw-api.json`, `.dshw-bubble.json`, `.dshw-roles.json` и др.; ключи не пишутся, только `apiKeyEnv`-ссылки (заявлено)                                              |
| DASH  | `api.deepseek.com/user/balance` через `credentials` **или** `deepseekAccount.getBalance` (без ключа); timeout 20 s                                  | ничего                                                                                                                                                                                                                                  |
| API   | балансы множества провайдеров, probing, `/app/notify` мост                                                                                          | `$DSH_HOME/dsh-api-dashboard.json` с режимом 0600 — **в нём ключи明文** (комментарий на [596-600](https://github.com/133563825as-ai/dsh-api-dashboard/blob/b57f953/src/index.js#L596)), плюс авто-апдейт перезаписывает каталог плагина |

Интересный и полезный для нас паттерн — **источник «истины» по деньгам**: WHALE не верит расчёту по
токенам, а ведёт «наблюдаемый расход» по падению баланса, с коррекциями на пополнения/бонусы и
детекцией неполного дня:

```js
// lib/accounting.mjs:22-49
export function beijingDay(time = Date.now()) {
  const d = new Date(Number(time) + 8 * 3600000);
  return d.toISOString().slice(0, 10);
}
const PARTIAL_GAP_MS = 10 * 60 * 1000;
function partialDayOf(day, row, now) {
  const start = Date.parse(String(day) + 'T00:00:00+08:00');
  const end = start + 86400000;
  const beforeGap = first - start;
  const afterGap = Number(now) >= end ? end - last : 0;
  return beforeGap > PARTIAL_GAP_MS || afterGap > PARTIAL_GAP_MS;
}
```

Это дороже по коду, но единственный способ показать «сколько реально списано», а не «сколько мы
насчитали». Для пилюли в композере это, скорее всего, избыточно; но идею «рядом с оценкой можно показать
дельту баланса» стоит держать в голове.

---

## 7. i18n

| Плагин | Механизм                                                                                                                                                                                                                                                                                                                                               | Языки     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| COST   | `NS = 'cost-stats'`, два словаря `zh`/`en`, 20 ключей, `ctx.locale.register(NS, { zh, en })`, `locale: NS` в опциях слота, `t(...)` в компоненте ([locales.ts:12-57](https://github.com/Arun1016/dsh-cost/blob/e579772/src/client/locales.ts#L12), [client/index.ts:38-46](https://github.com/Arun1016/dsh-cost/blob/e579772/src/client/index.ts#L38)) | zh, en    |
| DASH   | собственный `locales.ts` + `NS`; в `LEARNINGS.md` отдельный вывод: «DSH уже даёт locale-регистр и `t` в props слота; свой переключатель языка делать не надо»                                                                                                                                                                                          | zh, en    |
| API    | `ctx.locale.register('apiDashboard', { zh, en })`, `locale: NS` в `composer.dock`                                                                                                                                                                                                                                                                      | zh, en    |
| PR     | **нет**: `NAV_LABEL = '峰谷提醒'` и все тексты тостов/настроек — литералы в `client.js` ([строки 22, 249–256, 413–464](https://github.com/54nanmiao/dsh-peak-reminder/blob/9569e58/lib/client.js#L22))                                                                                                                                                 | только zh |
| WHALE  | **нет**: китайские строки в `lib/index.js` и в `assets/whale-widget.js`                                                                                                                                                                                                                                                                                | только zh |

Вывод: русский/английский надо делать через `ctx.locale.register`, как COST; текстов в пилюле будет
больше 20, так что словарь стоит вынести в отдельный файл с типом ключей (`keyof typeof ru`), как в COST.

---

## 8. Обработка поломок

| Ситуация             | PR                                                                                        | COST                                                                                                                                            | WHALE                                                                                       | DASH                                                               | API                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Нет сервиса/слота    | `slots` опционален (`if (slots && ...)`), при ошибке `applyClient` — `try/catch` и тишина | `inject: ['webServer']`; клиент без route — скрыт                                                                                               | `ctx.get(...)` везде, warn в лог                                                            | `inject` жёсткий, при отсутствии — плагин не грузится              | ленивый `ctx.inject(['webServer'], …)`; без сервиса маршруты просто не появляются |
| Ошибка своего route  | 500 + `{ok:false, reason}`; клиент рисует «не подключено»                                 | **пилюля исчезает молча** (README:99, [BalancePill.tsx:274](https://github.com/Arun1016/dsh-cost/blob/e579772/src/client/BalancePill.tsx#L274)) | `{ok:false}` + текст в UI; при отсутствии `connection.requestRejection` — warn + свой fence | `{ok:false, error}` в теле, UI показывает ошибку                   | `allowRequest` → 401/403; иначе `ok:false`                                        |
| Битый конфиг/файл    | `catch` → дефолты, не падает                                                              | `catch` → дефолты                                                                                                                               | `catch` → дефолты                                                                           | —                                                                  | —                                                                                 |
| Нет ключа/баланса    | —                                                                                         | 200 **без** `balance_infos`; ошибка кэшируется на 30 с (README:102)                                                                             | `{ok:false, error}`                                                                         | `ok:false` + текст причины (различает «нет ключа» и «сервис упал») | ok:false                                                                          |
| Нет данных по сессии | `week.ok=false` + reason                                                                  | `sessionCost` отсутствует → сегмент скрыт                                                                                                       | оценка по журналу                                                                           | пустые карточки                                                    | `waiting: true` / `cost: -1` — отдельное состояние «ещё считаем»                  |

PR не скрывает: вместо этого строка «峰谷提醒（未连接）» и tooltip с причиной. COST — прямая
противоположность (DASH/API тоже показывают причину, так что COST тут одиночка, а не норма): при смене
API хоста или падении маршрута пользователь просто перестаёт видеть пилюлю и не понимает, почему.

---

## 9. Слоты UI

Официальная строка статистики под композером в хосте — это слот `conversation.composer.dock`
(`kind: "list"`, `scope: "session"`), в него сам хост кладёт две пилюли:
`activity` (order 0) и `usage` (order 1) — см.
`@deepseek-ai/dsh-client-ui-chat/lib/client.js:13347-13360`. Сортировка — по `order` (**стабильная**:
`[...rows].sort((a,b) => a.order - b.order)` в `dsh-client-ui-renderer/lib/client.js:1218`), поэтому
order 2 — сразу после официальных.

| Плагин | Что регистрирует                                                                                                                          | Опции                                                                                                                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| COST   | `conversation.composer.dock`                                                                                                              | `id: 'cost-stats'`, `order: 2`, `locale: NS`                                                                                                                                                        |
| DASH   | `conversation.composer.dock`                                                                                                              | `id: 'quota-cost'`, `order: 2` (конфликт порядка с COST, если стоят оба) + `sidebar.footer.action` order 10, `shell.overlay`, `sidebar.panellist`, `main`, `conversation.view`, `assistant-actions` |
| API    | `conversation.composer.dock`                                                                                                              | `id: 'dsh-api-dashboard'`, `order: 5`, `locale: NS`, `inject: (sessionId) => ({ modelStore })`                                                                                                      |
| PR     | `sidebar.footer.action` (order 90, id `dsh-peak-reminder`), `settings.section` (order 880)                                                | свой `showSidebar`, настройки в отдельной секции                                                                                                                                                    |
| WHALE  | **никаких слотов** — вставляет `<script src="/dsh-whale/widget.js">` через `tapIndex`/строку инъекции и рисует плавающий DOM поверх всего | —                                                                                                                                                                                                   |

Детализация: COST делает это «нативно» — `createPortal` + `useAnchoredPosition` +
`useDismissOnOutsidePointer` из `@deepseek-ai/dsh-client-ui-primitives`
([BalancePill.tsx:164-180](https://github.com/Arun1016/dsh-cost/blob/e579772/src/client/BalancePill.tsx#L164)),
поэтому попап ведёт себя как официальные. API и DASH для большой панели используют собственные
оверлеи/страницы (`main`, `conversation.view`).

Важное ограничение композер-дока, которое видно у API в CSS-комментариях: хост кладёт **всех**
контрибьюторов в одну flex-строку, и длинный текст распирает композер; в `client/client.js:570-593`
там стоят хаки `:has(> [data-slot="conversation.composer.dock"]) { flex-wrap: wrap }` и
`[data-composer-stats] { flex: 0 0 100% }`. Для нашей пилюли это значит: строка должна быть короткой,
а детали — в попапе, а не в самой пилюле.

---

## 10. Известные баги и ограничения

### 10.1 Что авторы сами перечислили

**COST, README:88-108** — самое ценное, переписываю сжато:

- «Холодная» (не привязанная) сессия считается хостом как **один агрегат по текущим Flash-ценам** и **без
  пометки об оценке**; локальный fallback клиента тоже по текущим ценам, но помечен `(est)`.
- Web-fee у холодных сессий и в fallback-оценке отсутствует; лог, обрезанный компакцией, недосчитывает.
- Мультизапросный `web_search` с частично пустыми запросами — переоценка; провалившийся батч не считает
  успевшие братские запросы — недооценка.
- Web-fee считается по времени прихода результата → запрос на границе 2026-11-01 может уехать на секунды.
- Сабагенты зависят от `sessionQuery`: без него считаются только резидентные в памяти.
- Кэш закрытых сабагентов — 256 записей; нечитаемый лог пропускается.
- Живой сабагент может отставать на один интервал опроса.
- Унаследованный форк-префикс исключается; пользовательский форк — не считается вообще.
- Подсчёт по **имени инструмента**, не по провайдеру: с другим search/fetch-провайдером плагин всё равно
  посчитает вызовы и покажет неоплаченные как оплаченные.
- «Каждое чтение условно»: нет баланса — скрыт только баланс; `¥0.00` — скрыт сегмент стоимости; **ошибка
  маршрута — исчезает вся пилюля молча**.
- Все суммы печатаются с `¥` независимо от валюты аккаунта; 2/4/3 знака после запятой для разных величин.
- Посессионная разбивка по моделям — только когда хост умеет; id моделей нормализуются
  (`deepseek-v4-flash` и `-vision-exp` → `deepseek-flash`).
- Ошибки баланса молчаливы и кэшируются 30 с; кэш процессный, общий для сессий; пополнение видно с
  задержкой до 30 с.
- Незнакомые модели — по Flash-таблице.
- Округление по запросам может отличаться от биллинга.
- Попап без ограничения высоты и без общей модальности с официальными пилюлями.
- Праздники — только 2026.

**PR, README:81-82, 94-105, 179-182**:

- 2027 劳动节 намеренно не внесён (только медиа-перепечатки, «预计»), до внесения — как рабочий день
  («больше напоминаний, но не пропуск»).
- Установка: `dsh plugin` не несёт pnpm; `minimumReleaseAge` у pnpm может тихо поставить старую версию.
- Пауза работает только на границе хода: уже запущенный tool call доигрывается; «продолжить» — обычный
  промпт, а не чекпоинт.

**WHALE** (README, выборочно по теме):

- Кастомные цены **не** разделяются на пик/谷 (два периода — одна цена), и для встроенного DeepSeek
  кастомные цены не поддерживаются («всегда内置峰谷价»).
- Валюты: кастомные USD-цены переводятся по курсу, который вводит пользователь; учёт — в CNY.
- «记账» — единственный режим; если баланс не наблюдался (интерфейс закрыт), день считается неполным.

**DASH** (README:231-236): «расход — оценка, не биллинг»; изображения оцениваются по правилу ресайза;
если после картинки не было успешного вызова — не учитываются.

**API** (`AGENTS.md`): отдельно фиксирует, что раньше считал всю историю по `Date.now()` («谷时跑的
token 在峰时查看会被翻倍»), и что теперь фаза берётся из `event.time`; `stateVersion` для этого поднят;
«cacheWrite не区分» — осознанная упрощёнка (для DeepSeek не влияет, т.к. кэш автоматический).

### 10.2 Что нашёл сам (с кодом)

1. **PR: тесты не проходят на Linux.** `test/run.mjs` подменяет домашний каталог через
   `process.env.USERPROFILE` (строки 99–100, 142–143, 177–178), но Node на POSIX берёт `HOME`.
   Проверено запуском: `FAIL in group "week ledger"` на `ok: got false want true`
   ([test/run.mjs:104](https://github.com/54nanmiao/dsh-peak-reminder/blob/9569e58/test/run.mjs#L104)).
   Т.е. заявленные «12 groups» зелёные только на Windows.
2. **PR: `credentials: 'omit'` в fetch к своим же маршрутам** ([client.js:128](https://github.com/54nanmiao/dsh-peak-reminder/blob/9569e58/lib/client.js#L128),
   [514](https://github.com/54nanmiao/dsh-peak-reminder/blob/9569e58/lib/client.js#L514)) — на хостах с
   логин-гейтом (`dsh-web-auth`, см. LEARNINGS у DASH) запрос уйдёт без cookie и пилюля навсегда
   останется «未连接». На нашем локальном хосте гейта нет, поэтому не воспроизводится, но это латентный баг.
3. **PR: маршруты без проверки доверия.** `POST /plugins/dsh-peak-reminder/config` пишет файл в
   `~/.dsh`, `POST /pause` и `/resume` дёргают `sessionController` — и всё это без
   `connection.requestRejection`/Host-проверки ([index.js:157-258](https://github.com/54nanmiao/dsh-peak-reminder/blob/9569e58/lib/index.js#L157)).
   Любой локальный процесс (и любая страница в браузере при отсутствии CORS-заголовков — не прочитает
   ответ, но POST отправит) может писать конфиг и ставить задачи на паузу.
4. **PR: `ledger.js` зависит от файла другого плагина** (`.dshw-usage.json`, [строки 11-13, 42](https://github.com/54nanmiao/dsh-peak-reminder/blob/9569e58/lib/ledger.js#L11)).
   Нет WHALE — нет цифры; формат чужой и может измениться. Своя таблица цен (`PRICES`, USD) при этом
   лежит в `/state` и клиентом не используется — то есть цифру своего счёта плагин не умеет вывести сам.
5. **PR: конфиг читается на каждый запрос** (`loadConfig` в `statePayload`, [index.js:126](https://github.com/54nanmiao/dsh-peak-reminder/blob/9569e58/lib/index.js#L126))
   — при 30-секундном опросе не проблема, но при `showLedger` каждый опрос ещё и читает журнал на
   1,4k событий ([index.js:140](https://github.com/54nanmiao/dsh-peak-reminder/blob/9569e58/lib/index.js#L140));
   автор это понимает и отключает чтение при выключенном леджере.
6. **COST: маршрут без проверки доверия.** `/api/dsh-balance` не вызывает `connection.requestRejection`
   ([index.ts:1029-1034](https://github.com/Arun1016/dsh-cost/blob/e579772/src/index.ts#L1029)), т.е.
   любой локальный процесс может заставить хост сходить в `api.deepseek.com` с ключом пользователя
   (и получить тайминг/факт наличия ключа). Ответ без CORS-заголовков прочитать из браузера нельзя,
   но сам факт запроса — уже побочный эффект.
7. **COST: кэш баланса без дедупликации in-flight запросов и с кэшированием ошибки**
   ([816-824](https://github.com/Arun1016/dsh-cost/blob/e579772/src/index.ts#L816)): при нескольких
   параллельных опросах (несколько вкладок) каждый промах кэша идёт в сеть; `undefined` (ошибка)
   кладётся в кэш на 30 с, и в течение этого времени баланс не появится даже если ключ поправили.
8. **COST: `Config.holidays` заменяет встроенную таблицу**, а не дополняет
   ([68-70](https://github.com/Arun1016/dsh-cost/blob/e579772/src/index.ts#L68)): пользователь, желающий
   добавить один день 2027, должен переписать весь 2026-й. PR эту же задачу решает merge'ом
   (builtin + file + config) — правильнее.
9. **COST: `pro → flash` c 2026-09-14** — расходится с WHALE/API (см. §2.6). Если правота WHALE/API,
   COST занижает стоимость Pro-сессий втрое.
10. **WHALE: цена берётся по `Date.now()`, а не по `event.time`** ([977](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/blob/5247dd6/lib/index.js#L977));
    плюс агрегат на турн с `ts = lastTs` ([960, 1511](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/blob/5247dd6/lib/index.js#L960)).
11. **WHALE: нет `cacheWriteTokens`** ([963-978](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/blob/5247dd6/lib/index.js#L963)) —
    при длинных сессиях с кэш-записью расход занижается.
12. **WHALE: нет атрибуции по сессиям** — в журнале нет `sessionId`, поэтому «сессия» в интерфейсе
    невозможна в принципе; только «за день/по моделям».
13. **WHALE: журнал теряет историю** — 90 дней / 20 000 событий, остальное в архив
    ([1444-1501](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/blob/5247dd6/lib/index.js#L1444)).
    Для «стоимости сессии за всё время» это непригодно.
14. **DASH: нет праздников** — 33 дня в году двойная переоценка (см. §2.4).
15. **DASH: день/час по локальной TZ, а пик — по Пекину** ([usage.ts:522-524](https://github.com/Cassius0924/dsh-usage-dashboard/blob/aee5085/src/usage.ts#L522)) —
    на нашей машине дневные корзины будут сдвинуты относительно пиковых окон.
16. **DASH: не читает `cacheWriteTokens`** ([295-300](https://github.com/Cassius0924/dsh-usage-dashboard/blob/aee5085/src/usage.ts#L295)).
17. **DASH: не исключает форк-префикс** — потенциальный двойной счёт при наличии форков
    (в коде нет ни `ownEvents`, ни `inheritedEventCount`).
18. **API: state-файл с ключами** (0600, но明文) и **авто-апдейт**, который скачивает tarball и
    перезаписывает каталог плагина ([3609-3630](https://github.com/133563825as-ai/dsh-api-dashboard/blob/b57f953/src/index.js#L3609)).
    Механизм с подтверждением и проверкой версии, но это ровно тот класс «AUTO_UPDATE», который
    официальный аудит DSH называет главным риском.
19. **API: устаревший комментарий про «известный пробел isPeakTime»** при уже работающей проверке
    праздников ([1143](https://github.com/133563825as-ai/dsh-api-dashboard/blob/b57f953/src/index.js#L1143) vs
    [1209-1211](https://github.com/133563825as-ai/dsh-api-dashboard/blob/b57f953/src/index.js#L1209)).
20. **Порядок в доке может совпасть**: COST и DASH оба `order: 2` — при совместной установке позиция
    зависит от порядка регистрации (стабильная сортировка). Нам нужен order ≥ 6, чтобы не спорить.

---

## 11. Что взять (конкретные решения)

1. **Хост — единственный источник правды, и он живёт в пекинском календаре.** PR: `isPeakTime` в
   `lib/peak.js`, клиент никогда не пересчитывает, а берёт `now` из `/state` и корректирует сдвиг часов
   ([client.js:116-118, 136](https://github.com/54nanmiao/dsh-peak-reminder/blob/9569e58/lib/client.js#L116)).
   Время — только через `+8h` и UTC-геттеры: `beijingDate` у PR, `BEIJING_OFFSET_MS` у DASH, `bjtParts`
   у API, `new Date(n*1000 + 8*3600*1000)` у WHALE. Наш хост в +07 — это не теория, а ежедневный сдвиг
   на час, если сделать как COST.
2. **Цена каждого запроса — по времени события, с датированными «эрами».** COST:
   `pricesAt(model, event.time)` + `FLASH_CUT_MS`/`peakPricesAt` ([index.ts:299-323](https://github.com/Arun1016/dsh-cost/blob/e579772/src/index.ts#L299));
   DASH: `PRICE_ERAS` с `weekdaysOnly`. Никогда `Date.now()` (баг WHALE).
3. **Четыре бакета, включая cacheWrite.** Проекция `tokenUsage` хоста даёт `uncachedInputTokens`,
   `cacheReadTokens`, `cacheWriteTokens`, `outputTokens` (`dsh-token-meter`). Формула COST
   (`cacheWrite → input`) — разумный дефолт, пока официальная цена записи не подтверждена; важно хотя бы
   не терять токены, как WHALE/DASH.
4. **Праздники: builtin + внешний override + merge, а не replace.** PR: `makeRules({peakHours, holidays})`
   мержит `BUILTIN_HOLIDAYS` + файл + config ([peak.js:92-97](https://github.com/54nanmiao/dsh-peak-reminder/blob/9569e58/lib/peak.js#L92)),
   нормализует мусор (`normalizeHolidays`, строки 79-89) и не падает на битом JSON. Плюс диапазоны, как
   у API, — компактнее для 7 праздников × 3–9 дней.
5. **Web-fee считать по паре `tool/call` + первый `tool/result`, с `isError` и «No results found.»,
   по времени результата, и показывать «Free» для периода до 2026-11-01.** Это всё есть в COST
   ([419-469](https://github.com/Arun1016/dsh-cost/blob/e579772/src/index.ts#L419),
   [webCallPriceYuan](https://github.com/Arun1016/dsh-cost/blob/e579772/src/index.ts#L348)). Если не
   хотим считать — лучше не показывать строку вовсе, чем показывать ноль.
6. **Сабагенты — через `sessionQuery.traceSession`, фильтр `origin === 'subagent'`, закрытые — через
   `readSession` с `inheritedEventCount`, кэш по id.** COST — рабочая реализация; для пилюли можно
   ограничиться живыми + одной «холодной» выборкой, но фильтр по origin обязателен, иначе форки
   пользователя попадут в счёт.
7. **Проверка доверия на маршрутах.** Хост `0.2.1-rc.5` даёт `connection.requestRejection(req)`
   (`dsh-client-connection/lib/index.js:710`); API и DASH используют его напрямую, WHALE — с fallback
   на собственный loopback/Host/Origin-чек и отдельным правилом «запись только с localhost»
   ([795-874](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/blob/5247dd6/lib/index.js#L795)).
   Важная деталь от автора API: `ctx.get('connection')` на fiber плагина возвращает `undefined` —
   брать только вложенным `ctx.inject(['connection'], c => …)`, а пока сервис не пришёл, отвечать
   **fail-closed 503**, а не пускать запрос
   ([index.js:3495-3510](https://github.com/133563825as-ai/dsh-api-dashboard/blob/b57f953/src/index.js#L3495)).
   Нам нужен минимум `requestRejection` + `cache-control: no-store`.
8. **i18n через `ctx.locale.register(NS, {zh, en})` + `locale: NS` в опциях слота** (COST, DASH, API).
   Свои переключатели языка не делать — в DASH `LEARNINGS.md` это отдельный вывод.
9. **Прозрачность: помечать оценку и показывать покрытие.** COST — `(est)`, DASH — `coverage`
   (`listedSessions/scannedSessions/usageRecords/skippedRecords/failedSessions/earliestAt/latestAt`,
   [usage.ts:416-425](https://github.com/Cassius0924/dsh-usage-dashboard/blob/aee5085/src/usage.ts#L416)),
   API — `waiting: true`/`cost: -1`. Это дешёво и снимает половину вопросов «почему цифра не как в
   биллинге».
10. **Баланс — «мягкий» сегмент: явная причина, таймаут, TTL, ошибку не кэшировать как успех.** DASH
    различает «нет ключа» / «сервис недоступен» и отдаёт текст
    ([usage.ts:79-112](https://github.com/Cassius0924/dsh-usage-dashboard/blob/aee5085/src/usage.ts#L79)),
    COST — 15 с и кэш 30 с, но кэширует и неудачу ([816-824](https://github.com/Arun1016/dsh-cost/blob/e579772/src/index.ts#L816)).
    Для пилюли разумно 15–20 с, TTL 30–60 с, ошибка — отдельное состояние.

---

## 12. Чего не повторять

Сгруппировано по типу; везде — конкретный код/строка.

**Время и правила**

1. Локальные часы для пекинских окон — COST `isPeakPeriod` ([index.ts:243-250](https://github.com/Arun1016/dsh-cost/blob/e579772/src/index.ts#L243)).
   Наш хост +07 → сдвиг на час.
2. `Date.now()` вместо `event.time` при цене — WHALE ([977](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/blob/5247dd6/lib/index.js#L977)).
3. Мёртвые записи в таблице праздников (даты до даты вступления правила) — PR
   ([peak.js:27-37 vs 22-24](https://github.com/54nanmiao/dsh-peak-reminder/blob/9569e58/lib/peak.js#L27)).
   Если делаем исторические границы — либо чистим таблицу, либо явно документируем.
4. Таблица праздников только на 2026 **без** сигнала «год не покрыт» — COST/WHALE/API. Пользователь
   узнает об этом, только увидев завышенный счёт.

**Учёт** 5. Игнорировать `cacheWriteTokens` — WHALE ([963-978](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/blob/5247dd6/lib/index.js#L963)),
DASH ([usage.ts:295-300](https://github.com/Cassius0924/dsh-usage-dashboard/blob/aee5085/src/usage.ts#L295)). 6. Агрегировать турн одной записью с `ts` последнего сообщения — WHALE
([960, 1511](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/blob/5247dd6/lib/index.js#L960));
турн через границу 12:00 получает одну фазу. 7. Складывать сабагентов в общий котёл без атрибуции (WHALE). Если вливаем их в итог — только с явной
пометкой «включая сабагентов», как COST; если показываем отдельной строкой — не прибавлять её к
основному числу (как API). 8. Не исключать унаследованный форк-префикс — DASH. COST делает правильно:
`session.ownEvents()` ([index.ts:599-600](https://github.com/Arun1016/dsh-cost/blob/e579772/src/index.ts#L599)),
`foldSessionLogCost({ inheritedEventCount })` ([633-636](https://github.com/Arun1016/dsh-cost/blob/e579772/src/index.ts#L633)). 9. Хардкодить `¥` независимо от валюты — COST ([locales.ts:13,37](https://github.com/Arun1016/dsh-cost/blob/e579772/src/client/locales.ts#L13)).
У нас будет как минимум CNY и, возможно, USD: нужен выбор по валюте аккаунта и отдельная официальная
USD-таблица (как у API), а не деление на курс. 10. Отдавать в API мёртвые поля в чужой валюте — PR кладёт в `/state` `prices` в USD
([peak.js:177-188](https://github.com/54nanmiao/dsh-peak-reminder/blob/9569e58/lib/peak.js#L177)) и
`rateMultiplier`, которые клиент не читает, а показывает `¥` из чужого CNY-леджера. Если поле есть в
контракте — оно должно быть либо используемым, либо удалённым; иначе следующий разработчик посчитает
по нему и получит доллары вместо юаней. 11. Зависеть от файла другого плагина — PR `ledger.js` читает `.dshw-usage.json`
([11-13](https://github.com/54nanmiao/dsh-peak-reminder/blob/9569e58/lib/ledger.js#L11)). У нас не
должно быть необъявленных зависимостей от чужих форматов.

**Надёжность и API хоста** 12. **Молча скрывать пилюлю** при ошибке маршрута — COST
([BalancePill.tsx:274](https://github.com/Arun1016/dsh-cost/blob/e579772/src/client/BalancePill.tsx#L274),
README:99). Пользователь должен видеть «нет данных / API изменился», а не пустоту. PR с его
«未连接» — лучше. 13. Маршруты без проверки доверия — COST (`/api/dsh-balance`) и PR (`/config`, `/pause`, `/resume`).
В 0.2.1-rc.5 есть `connection.requestRejection`; используем. 14. Кэшировать ошибку как успех — COST ([816-824](https://github.com/Arun1016/dsh-cost/blob/e579772/src/index.ts#L816)). 15. `credentials: 'omit'` для собственных маршрутов — PR
([client.js:128](https://github.com/54nanmiao/dsh-peak-reminder/blob/9569e58/lib/client.js#L128)) —
ломается на хостах с логин-гейтом. 16. Заменять встроенную таблицу праздников пользовательской — COST `z.array(String).default(DEFAULT_HOLIDAYS)`
([68-70](https://github.com/Arun1016/dsh-cost/blob/e579772/src/index.ts#L68)). Merge безопаснее. 17. Хранить ключи明文 и/или делать авто-апдейт, перезаписывающий каталог — API
([509, 596-600](https://github.com/133563825as-ai/dsh-api-dashboard/blob/b57f953/src/index.js#L509),
[3609-3630](https://github.com/133563825as-ai/dsh-api-dashboard/blob/b57f953/src/index.js#L3609)). 18. Тесты, зависящие от платформенной переменной домашнего каталога — PR
([test/run.mjs:99-100](https://github.com/54nanmiao/dsh-peak-reminder/blob/9569e58/test/run.mjs#L99)).
У нас — внедрять `home`/`now` параметром, а не читать окружение. 19. Писать тесты, зависящие от текущего часа. Антипример — COST: там тест специально читает
`session.snapshotEvents()[0].time`, чтобы не зависеть от часа запуска
([cost-stats.spec.ts:220-227](https://github.com/Arun1016/dsh-cost/blob/e579772/tests/cost-stats.spec.ts#L220)).
У нас все функции пика должны принимать `timeSec` параметром. 20. Один и тот же `order` у нескольких плагинов — COST и DASH оба `order: 2`. Берём ≥ 6.

---

## 13. Открытые вопросы к нам

1. **`deepseek-v4-pro` после 2026-09-14: своя цена или Flash?** COST/DASH реализуют маршрутизацию на
   Flash, WHALE/API утверждают, что официальное объявление 2026-09-22 её отменило. Надо открыть
   официальную страницу цен и решить; от этого зависит, показывать ли Pro отдельной строкой и во сколько
   раз она может расходиться.
2. **Моделируем ли исторические эры?** У DASH их три (flat → peak-каждый-день → peak-по-будням), у COST
   одна (срез 09-10), у PR — две границы. Для новой сессии это неважно, но если показываем «стоимость
   сессии за всё время», старые сессии надо считать по их правилам. Минимальный вариант: датированные
   цены + пик по будням с 2026-09-10, без доковой эпохи.
3. **调休:** все четыре плагина считают рабочие субботы谷 просто потому, что это выходной. Официальная
   формулировка (по цитате в API) — «Monday through Friday» + «excluding Chinese public holidays»,
   так что это, похоже, верно. Но стоит зафиксировать в тестах: «воскресенье 2026-09-20 (调休) —谷», чтобы
   будущий рефакторинг не сделал из неё рабочий день.
4. **Валюта:** официальные CNY и USD — разные таблицы (USD не равен CNY/7). Если аккаунт в USD, какой
   набор показывать? Вариант API (две официальные таблицы) корректен; вариант COST (всегда ¥) — нет.
   Плюс вопрос: печатать ли `¥`/`$` или символ валюты аккаунта из `/user/balance`.
5. **Web search/fetch:** считать ли вообще (только COST), и если да — как поступать с мультизапросным
   `web_search` (переоценка, README:92) и с «бесплатным» периодом до 2026-11-01. Мой вывод: считать,
   но показывать «Free» и отдельной строкой, чтобы не раздувать итог незаметно.
6. **Сабагенты в пилюле:** полный обход через `sessionQuery` на каждый шаг — это чтение persisted-логов
   и кэш на 256 записей. Для «строки под композером» может быть слишком дорого. Варианты: только живые
   дети из памяти + пометка «+N закрытых не посчитано», или кэш с TTL, или отдельная кнопка «посчитать
   точно» в попапе.
7. **Баланс:** нужен ли он нам вообще и через что. В 0.2.1-rc.5 есть `deepseekAccount` (без ключа) и
   `credentials` + `/user/balance` (с ключом). COST использует только ключ, DASH — сначала аккаунт, потом
   ключ. Второй путь дружелюбнее, но добавляет зависимость от сервиса аккаунта.
8. **Праздники: как обновлять?** Варианты: (а) таблица в коде + релиз (все конкуренты), (б) внешний JSON
   с merge (PR), (в) сеть (никто не делает). Для «своего» плагина, вероятно, (а)+(б) и явный бейдж
   «нет данных за 2027 — считаю рабочими днями». Открытый вопрос — нужен ли автоподтяг из сети и как
   тогда решать вопрос доверия к источнику.
9. **i18n:** нужен ли русский? Все конкуренты — zh/en. Если да, `ctx.locale.register` принимает
   произвольные словари, но надо проверить, как хост выбирает локаль и что делает fallback (в хосте
   английский — база, см. `dsh-client-locale`). Плюс вопрос про суффикс `(RU)` в названии пилюли.
10. **Сигнал «API хоста изменился»:** что считаем признаком? Варианты: отсутствие сервиса при
    `ctx.get(...)`, отсутствие проекции `tokenUsage`/`sessionStats`, несовпадение схемы ответа,
    несовпадение версии `dsh` (как `dsh.compatibility.dshReleases` у API). Нам нужно решить, показываем ли
    мы бейдж «API изменился» прямо в пилюле (и как он выглядит), или пишем в лог + `settings.section`.
11. **Где хранить конфиг:** файл в `~/.dsh` (PR), `Config` в cordis-патче (COST), state-файл в
    `$DSH_HOME` (API). У нас есть настройки (порог, включение сегментов, язык), и надо выбрать, что
    переживает обновление плагина.
12. **Поллинг:** PR — 30 с state + 1 с тик; COST — на каждый шаг + 60 с; DASH — TTL 5 мин на usage;
    API — 1–60 с настраиваемо. Для пилюли в доке разумно: шаг сессии + 60 с + локальный тик для
    обратного отсчёта. Но надо решить бюджет запросов при открытых нескольких вкладках.

---

## 14. Приложение: что подтверждено в хосте 0.2.1-rc.5

Проверял по локальному чекауту `@deepseek-ai/dsh` (не по документации конкурентов):

| Факт                                                                                                                       | Где                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Слот `conversation.composer.dock` существует, `kind: "list"`, `scope: "session"`                                           | `dsh-client-ui-conversation/lib/client.js:20128`                                                                                                |
| Официальные пилюли: `activity` order 0, `usage` order 1, обе с `locale: NS`                                                | `dsh-client-ui-chat/lib/client.js:13347-13360`                                                                                                  |
| Сортировка слотов — `sort((a,b) => a.order - b.order)`, стабильная                                                         | `dsh-client-ui-renderer/lib/client.js:1218`                                                                                                     |
| `webServer.register` с `kind: 'exact'` или `'prefix'`; дубликат `(kind, path)` **бросает**                                 | `dsh-host-webserver/lib/index.js:326-338`                                                                                                       |
| `connection.requestRejection(req)` — есть (сервис `connection`)                                                            | `dsh-client-connection/lib/index.js:710`                                                                                                        |
| Проекции `tokenUsage` (4 бакета, включая `cacheWriteTokens`) и `sessionStats`                                              | `dsh-token-meter/lib/index.js:321-330, 393-396`; `dsh-session-stats/lib/index.js:67`                                                            |
| Сервисы `sessions`, `sessionProjections`, `sessionQuery`, `sessionPersistence`, `deepseekAccount`, `credentials`, `agents` | `dsh-session`, `dsh-session-projection`, `dsh-session-query`, `dsh-session-persistence`, `dsh-deepseek-account`, `dsh-credentials`, `dsh-agent` |
| `ctx.locale.register(ns, { zh, en })`                                                                                      | `dsh-client-locale/lib/client.js:1387`                                                                                                          |

Практический вывод для «сигнала об изменении API»: у нас есть дешёвый способ — на старте проверить
наличие слотов/сервисов/проекций и **отдать это в `/state` как `capabilities`**; клиент при
несовпадении рисует бейдж, а не исчезает. Дополнительно можно сверять версию хоста с известным
диапазоном (у API это `dsh.compatibility.dshReleases` в `package.json`) — но версия не заменяет
проверку конкретных полей, потому что «совместимость по semver» у плагинов сплошь и рядом заявляется
шире, чем реально работает.
