# Официальные API хоста DSH 0.2.1-rc.5 для плагина «пиковые часы + стоимость»

Инвентаризация по установленным пакетам и официальному скиллу разработки плагинов.
Дата: 2026-11-05. Версия рантайма: `0.2.1-rc.5` (`dsh --version`), Node 24.14.0, pnpm 10.30.3.

Обозначения путей (далее в тексте — префиксы):

- `$PKG` = `/home/lega/.nvm/versions/node/v24.14.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai`
- `$SKILL` = `$PKG/dsh-agent-preset/skills/cordis-plugin-development`
- `$PROFILE` = `/home/lega/.dsh/profiles/web`
- `$DSH` = `/home/lega/.nvm/versions/node/v24.14.0/lib/node_modules/@deepseek-ai/dsh`

Как проверено: чтение `README.md`, `lib/types/**/*.d.ts` (JSDoc), JS-реализаций и сгенерированного каталога API
`$PKG/dsh-tool-cordis/lib/types/api-catalog.js`; профиль и его patch-слой прочитаны. Рантайм-эксперименты не
выполнялись (GUI не дёргался, пакет не устанавливался) — это отмечено в разделе «Пробелы».

---

## 1. Доступные API

### 1.1 Хостовый сервис `ctx.tokenMeter` (`dsh-token-meter`)

Сервис объявлен в `$PKG/dsh-token-meter/lib/types/index.d.ts:14-18`; каталог API — `$PKG/dsh-tool-cordis/lib/types/api-catalog.js:3297-3314`.

| Член                               | Что даёт                                                                                                                                   | Где документировано                                                                                    | Ограничения                                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `measure(session, requestHeader?)` | Снимок давления на текущем хвосте durable-лога: `logRevision`, `baseline`, `surfaceDeltaTokens`, `totalTokens`, `surfaceTokens`, `nodes[]` | `$PKG/dsh-token-meter/lib/types/index.d.ts:26-46`; `.../lib/types/types.d.ts:24-55`; `README.md:36-41` | Нужен хостовый объект `Session`; O(surface), каждый вызов клонирует узлы; `requestHeader` подменяет только envelope для цены/давления, набор узлов всегда текущий |
| `estimateMessage(message)`         | Эвристическая цена одного model-visible сообщения (фиксированная эвристика ~4 символа/токен + overhead блока/роли)                         | `.../index.d.ts:51-57`; `README.md:36`; `.../lib/types/estimate.d.ts:11-42`                            | Это не биллинг и не провайдерский токенайзер; для system-роли — `estimateSystemMessage`                                                                           |
| `TokenMeasurement.totalTokens`     | «Давление» запроса+ответа по последнему якорю (провайдерский usage либо эвристика)                                                         | `.../types.d.ts:23-37`; `README.md:36,43-45`                                                           | Значение зависит от того, совпал ли канонический envelope; иначе полная эвристическая переоценка                                                                  |
| `TokenMeasurement.surfaceTokens`   | Сумма route-цен `nodes[].tokens` текущей поверхности                                                                                       | `.../types.d.ts:33-34`; `README.md:36`                                                                 | Route-цена картинок — из `LlmImageRequestPricing` адаптера, файлы — как handle-текст                                                                              |
| `TokenMeasurement.nodes[]`         | Позиционные узлы `{seq, tokens, heuristicTokens}`                                                                                          | `.../types.d.ts:38-55`                                                                                 | Только цены, без типов/ролей сообщений                                                                                                                            |

Тип провайдерского usage (`TokenUsage`), который лежит в основе счётчиков — `$PKG/dsh-llm/lib/types/types.d.ts:160-174`:

```ts
inputTokens: number        // попадает в uncachedInputTokens БЕЗ вычитания кэша
outputTokens: number
totalTokens?: number
cacheReadTokens?: number
cacheWriteTokens?: number
reasoningTokens?: number   // подмножество outputTokens
```

Как из него строятся бакеты: `$PKG/dsh-token-meter/lib/types/usage-projection.js:14-19` (`uncachedInputTokens: usage.inputTokens`,
`cacheReadTokens ?? 0`, `cacheWriteTokens ?? 0`); давление промпта считается как `inputTokens + cacheRead + cacheWrite`,
без output — `usage-projection.js:58`.

### 1.2 Проекции `tokenUsage`, `contextPressure`, `contextBreakdown`

Регистрируются сервисом в реестре проекций (`README.md:47-53`). Клиент получает уже посчитанное значение через
`wire.view` (`$PKG/dsh-session-projection/README.md:36-58`), поэтому в браузере ничего складывать не нужно.

| Ключ проекции      | Поля (wire-вид)                                                                                                                     | Где документировано                                                                                                                                        | Ограничения                                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokenUsage`       | `uncachedInputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens` — суммы по **всему** durable-логу                      | `$PKG/dsh-token-meter/lib/types/projection.d.ts:6-17`; `lib/types/usage-projection.d.ts:57-148`; `README.md:49`                                            | Нет `reasoningTokens`, нет `totalTokens`, нет разбивки по turn/step (внутреннее состояние `last` не выходит на клиент — `usage-projection.d.ts:117-147`) |
| `contextPressure`  | `pressureTokens?` (размер промпта последнего запроса), `projectedTokens?` (сколько будет стоить следующий промпт), `contextWindow?` | `projection.d.ts:18-46`; `usage-projection.d.ts:170-221`; формула `usage-projection.js:178-187`: `max(0, pressure + surfaceTokens − sampledSurfaceTokens)` | Поля — не одно атомарное наблюдение (разные моменты); `pressureTokens` не видит компакцию, поэтому для UI берут `projectedTokens`                        |
| `contextBreakdown` | `systemTokens`, `toolsTokens`, `messageTokens` — эвристический состав контекста                                                     | `projection.d.ts:47-63`; `breakdown-projection.d.ts:44-130`; `README.md:49,53`                                                                             | Только эвристика; сумма не равна `projectedTokens` (`README.md:68`); строка `last` в `tokenUsage` не публикуется                                         |

Поведение замены сэмплов: один и тот же `turn/step` перезаписывает usage, `llm/retry-started` закрывает слот и ретрай
добавляет ещё одну оплаченную попытку — `usage-projection.js:86-118`.

### 1.3 `ctx.sessionStats` (`dsh-session-stats`)

| Что         | Значение                                                                                                                                           | Где                                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Поля        | `turns`, `steps`, `llmMs`, `toolMs`, `ttftMs`, `ttftSteps`, `decodeMs`, `decodeTokens`                                                             | `$PKG/dsh-session-stats/lib/types/types.d.ts:18-35`; `README.md:40-47` |
| Тип         | только fold шагов, **без токенов и без денег**                                                                                                     | `$PKG/dsh-session-stats/lib/types/projection.d.ts:25-44`               |
| Ограничения | счёт по логу, а не по поверхности (сжатые шаги считаются); отменённый шаг посчитан, но не протаймлен; юнита нет вне композиции с реестром проекций | `README.md:119-122`                                                    |

`sessionStats` и `tokenUsage` — независимые ключи; «скорость»/время берутся из stats, токены — из token-meter.

### 1.4 Usage по сессии, запросу и сообщению

| Уровень                          | Как получить                                                                                                                                 | Где                                                                                                                                                    | Замечания                                                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Сессия (весь лог)                | `useProjection('tokenUsage')` на клиенте; на хосте — `ctx.sessionProjections.snapshot(session).values.tokenUsage`                            | `$PKG/dsh-api-session-controller/lib/types/client/sessions/projection-store.d.ts:28-31`; `$PKG/dsh-session-projection/README.md:58`                    | Только суммы; per-message не выводится                                                                                                 |
| Текущий запрос / давление        | хост: `ctx.tokenMeter.measure(session)`; клиент: `useProjection('contextPressure')`                                                          | `index.d.ts:46`; `projection.d.ts:28-46`                                                                                                               | На клиенте доступно только `pressureTokens`/`projectedTokens`/`contextWindow`                                                          |
| Один Turn (точный провайдерский) | клиент: `TurnTailChatData.tokenUsage` (через `useChat`, см. 1.7) или `deriveTurnTokenUsage(events)` из `@deepseek-ai/dsh-token-meter/client` | `$PKG/dsh-client-ui-chat/lib/types/client/contract/chat-nodes.d.ts:58-79,88`; `$PKG/dsh-token-meter/lib/types/turn-usage.d.ts:8-32`; `client.d.ts:6-8` | Появляется только когда в загруженном окне есть `turn/start`/`turn/end` и у **каждой** попытки есть точный usage; иначе поля нет вовсе |
| Одна попытка/сообщение           | `assistant/message.data.usage: TokenUsage` в событии лога; на клиенте у assistant-узла `usage?: unknown`                                     | `$PKG/dsh-llm/lib/types/types.d.ts:160-174`; `$PKG/dsh-client-ui-conversation/lib/types/client/contract/records.d.ts:78`                               | Клиентский тип `unknown` — официального типизированного контракта на узле нет                                                          |
| Одно сообщение (эвристика)       | `ctx.tokenMeter.estimateMessage(message)`                                                                                                    | `index.d.ts:51-57`                                                                                                                                     | Только хост, только эвристика                                                                                                          |

Производные формулы, которые использует официальная пилюля `usage` (их проще повторить, чем импортировать):
`billedInput = uncachedInputTokens + cacheReadTokens + cacheWriteTokens`, cache-hit % = `cacheRead / billedInput`
(`$PKG/dsh-client-ui-chat/lib/client.js:7495-7506`).

### 1.5 Сабагенты

Отдельного агрегата нет: `tokenUsage` — это «полный durable-лог **одной** сессии» (`$PKG/dsh-token-meter/README.md:49`),
а сессия ребёнка — отдельный лог. Клиент официально суммирует четыре бакета каждого ребёнка сам:
`$PKG/dsh-client-ui-subagent/README.md:66` («Token totals sum the four disjoint `tokenUsage` buckets»),
данные берутся из `useSessions(...).projectionsBySession` (`$PKG/dsh-api-session-controller/lib/types/client/sessions/manager.d.ts:33`,
`service.d.ts:54`). Родительская `tokenUsage` сабагентов **не включает** — это надо проверять экспериментом, но иного
поведения установленные пакеты не описывают.

### 1.6 Пиковых часов и денег в API нет

Поиск по каталогу API и по типам: нет ни сервиса, ни проекции, ни поля с ценой за токен, тарифом, скидкой или пиковым
окном. `signature: '…price…'` встречается только в контексте картиночных токенов (`LlmImageRequestPricing`),
`discount|peak|tariff` — 0 совпадений в `api-catalog.js`. `LlmResolvedModelInfo` даёт только `context.contextWindow`,
`defaultMaxTokens`, `reasoning` (`$PKG/dsh-llm/lib/types/types.d.ts:394-405`), без денег.
Единственное «денежное» рядом — баланс аккаунта (`AccountDetails.balance`, `$PKG/dsh-deepseek-account/README.md:55`),
но это не стоимость токенов.

Вывод: тарифную таблицу (цена input-cache-hit / cache-miss / output, окно скидки и его таймзона) плагин должен
объявлять сам — в `Config` и/или в клиентском коде. Никакого официального источника этих чисел в установленных
пакетах нет (см. «Пробелы»).

### 1.7 Клиентская сторона: что получает плагин в `conversation.composer.dock`

Слот объявлен как `list`, `scope: 'session'`, без owner-props:
`$PKG/dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts:312-316`; рендерится как
`renderSlot("conversation.composer.dock", {})` (`$PKG/dsh-client-ui-conversation/lib/client.js:19362`).

Стандартные пропсы (фреймворк подмешивает их по scope слота):

| Проп                                                                          | Что это                                                                                                                               | Где                                                                                                                                                          |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sessionId`                                                                   | id текущей сессии                                                                                                                     | `$PKG/dsh-client-ui-session/lib/types/client/index.d.ts:80-88`                                                                                               |
| `useSession`                                                                  | селектор-hook по `SessionSnapshot` (lifecycle, running, blank, …)                                                                     | там же:80-88; тип снапшота — `$PKG/dsh-api-session-controller/lib/types/client/contract/snapshot.d.ts:58-80`                                                 |
| `useProjection`                                                               | чтение хостовых проекций по ключу: `useProjection('tokenUsage')`, `('contextPressure')`, `('contextBreakdown')`, `('modelSelection')` | `.../dsh-client-ui-session/.../index.d.ts:80-88`; `$PKG/dsh-api-session-controller/lib/types/client/sessions/projection-store.d.ts:19-31`                    |
| `useAccess`                                                                   | проверка права на Remote-действие                                                                                                     | `dsh-client-ui-session/.../index.d.ts:88`                                                                                                                    |
| `useSessions`, `useSessionStatus`, `useSessionRetainInfo`, `useSessionAccess` | глобальные (root) стандартные пропсы; `useSessions` отдаёт `projectionsBySession`                                                     | `dsh-client-ui-session/.../index.d.ts:72-79`; `manager.d.ts:33`                                                                                              |
| `useChat`                                                                     | селектор по `ChatSnapshot` (узлы, таймлайн) — объявлен ui-chat для всех session-слотов                                                | `$PKG/dsh-client-ui-chat/lib/types/client/contract/slots.d.ts:296-299`; подтверждение — `lib/types/client/chat/StatsPills.d.ts:57-62` и `lib/client.js:7598` |
| `t`                                                                           | локаль слота (приходит из опции `locale` при регистрации, `PropsLocale`)                                                              | `$PKG/dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts:619`; пример — `$PKG/dsh-client-ui-workspace/README.md:161-167`                        |

Важно: точного файла с определением `PropsRuntime`/`PropsLocale` локально нет — пакет `@deepseek-ai/dsh-client-ui-slots`
не установлен (он есть только как devDependency сборки фронтенда: `$PKG/dsh-web-frontend/package.json:34`),
поэтому состав пропсов подтверждён по объявлениям пакетов-потребителей и по коду (`README.md` + `.d.ts`), а не по
первоисточнику ui-slots. Живой ответ даёт клиентская инспекция `Slots.listSubTree`
(`$PKG/dsh-cordis-client-runner/lib/client.js:7075-7102`, вызывается через `cordis_inspect_query`, `$SKILL/SKILL.md:23`).

### 1.8 Официальные пилюли `activity` и `usage`

| Что               | Значение                                                                                                                                                                     | Где                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Регистрация       | два list-элемента в `conversation.composer.dock`: `activity` order 0, `usage` order 1, `locale: NS`, `inject: () => ({ hooks: { performanceUsage } })`                       | `$PKG/dsh-client-ui-chat/lib/client.js:13347-13362`                               |
| Данные `activity` | `sessionStats` + `tokenUsage` (скорость decode), открывает диалог                                                                                                            | `lib/client.js:7598-7634`                                                         |
| Данные `usage`    | `useProjection('tokenUsage')`: сумма billed input + output и cache-hit %                                                                                                     | `lib/client.js:7636-7692`                                                         |
| Замена            | тот же `id` + тот же `order`; заменяет меньший `priority` (динамическому плагину он назначается автоматически, статическому — задаётся явно); новый `id` — добавляет контрол | `$PKG/dsh-client-ui-chat/README.md:71`                                            |
| Разметка          | каждый контрол несёт `data-composer-stat="<id>"`                                                                                                                             | там же:71                                                                         |
| Режим показа      | `performanceUsage`: `detailed` (по умолчанию) или `compact`; хранится как `ui-chat.performanceUsage`                                                                         | `$PKG/dsh-client-ui-chat/README.md:69`; `lib/types/chat-settings.d.ts:4,45,50-55` |

Ограничение для переиспользования: тип `PerformanceUsageInjected` (`hooks.performanceUsage`) **не экспортируется** из
`@deepseek-ai/dsh-client-ui-chat/client` (см. `lib/types/client/index.d.ts:22` — его там нет), т.е. чужой плагин не может
официально получить этот hook-источник. Практический путь — не заменять пилюли, а добавить свою с `id`, отличным от
`activity`/`usage`, и при желании уважать режим, прочитав настройку `ui-chat` через `ctx.configForms` (см. 1.9).

### 1.9 Настройки: `settings.section`, `Config`, где хранится

| Что                                                                      | Как                                                                                                                                                                                                         | Где                                                                                                                                                                  |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Секция в Settings                                                        | list-слот `settings.section`, `scope: 'root'`; опции `id` (ключ секции), `order` (позиция в навигации), `label` (локализованный текст; в коде — функция `() => t('…')`); owner-props дают только `close()`  | `$PKG/dsh-client-ui-settings/lib/types/client/contract/slots.d.ts:62-77,147-157`                                                                                     |
| Пример регистрации                                                       | `ctx.slots.inject('settings.section', () => ctx.slots.register({ name:'settings.section', id:'general', order:0, label:()=>t('general.nav'), locale:NS, children:{...} }, Section))`                        | `$PKG/dsh-client-ui-settings-general/lib/client.js:1299-1310`; второй пример с условной регистрацией — `$PKG/dsh-client-ui-settings-account/lib/client.js:4773-4796` |
| Если секция правит namespace другого плагина и не должна висеть без него | `ctx.configForms.whileServed([ns], register)` — регистрация живёт, пока хост отдаёт namespace                                                                                                               | `$PKG/dsh-client-ui-settings/README.md:40`; `lib/types/client/config-form.d.ts:139-151`                                                                              |
| Объявление `Config` у хостовой половины                                  | `export function apply(ctx, config)`, `export const Config` (schemastery) или `static Config` у default-класса; схема валидирует `config` строки при активации                                              | `$SKILL/references/host-plugin.md:57-64`; каталог: `$PKG/dsh-tool-cordis/lib/types/api-catalog.js` (`key: 'settings'`)                                               |
| JSON Schema                                                              | `dsh --profile web --dump-config-schema` печатает JSON Schema для entries/patches                                                                                                                           | `$DSH/README.md:48`                                                                                                                                                  |
| Что видит клиент                                                         | формы показывают **только volatile-поля** активных однозначно адресуемых строк профиля                                                                                                                      | `$PKG/dsh-settings/README.md:33`                                                                                                                                     |
| Как клиент читает конфиг                                                 | `ctx.configForms.get('<entry-id>')` → снапшот `{value, base, user, revision, writable}` + `set/unset/mutate`; запись идёт через `remote.settings`                                                           | `$PKG/dsh-client-ui-settings/lib/types/client/config-form.d.ts:44-151`; `README.md:34-36`                                                                            |
| Пример «volatile Config + чтение в браузере»                             | `ui-chat`: `Config.performanceUsage: Volatile<…>` и `ctx.configForms.get('ui-chat')`                                                                                                                        | `$PKG/dsh-client-ui-chat/lib/types/index.d.ts:5-27`; `lib/client.js:13151-13156`                                                                                     |
| Где хранится                                                             | запись формы попадает в **patch активного профиля** — `$PROFILE/cordis.patch.yml` (`profileContext.patchPath = join(profileDir,'cordis.patch.yml')`); home-patch и `--patch` только читаются для приоритета | `$PKG/dsh-config-editor/README.md:67`; `$PKG/dsh-app-boot/lib/index.js:509,1244`; `.../lib/types/profile-context.d.ts:15`                                            |
| Порядок слоёв                                                            | бандлы (`dsh.profile.bundles`) → `$PROFILE/cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` → `--patch`                                                                                                     | `$DSH/README.md:41-46`                                                                                                                                               |

Расхождение в документации: `$PKG/dsh-client-locale/README.md:12` утверждает, что `locale.preference` пишется в
`$DSH_HOME/cordis.patch.yml`, а `$PKG/dsh-config-editor/README.md:67` и реализация говорят, что цель записи — patch
активного профиля. Проверять экспериментом (см. «Пробелы»).

### 1.10 i18n клиентского плагина

Два независимых слоя:

1. **Метаданные пакета для Plugins/Settings** — `locale/<lang>.json` с `meta.title` и `meta.description`;
   читаются из экспортов пакета без активации плагина, язык выбирает клиент.
   `$SKILL/references/host-plugin.md:29-51`; пример — `$SKILL/templates/decoration/locale/en.json:1-6`;
   `$PKG/dsh-plugin-manager/README.md:44` («The Client selects a language from these values»).
2. **Рантайм-словари UI** — сервис `ctx.locale`:
   - `ctx.locale.register(ns, {zh, en})` — типизированная форма, требует оба встроенных языка;
   - `ctx.locale.register(ns, 'ru', {...})` — по-локальная форма для языковых пакетов и namespace вне merge-таблицы;
   - `ctx.locale.addLanguage({id:'ru', label:'Русский', fallback:'en'})` — добавляет язык в селектор;
   - `ctx.locale.bind(ns)` / инжектированный `t` — перевод; `ctx.locale.resolveText(text)` — для `LocalizedText`;
   - активный язык: `ctx.locale.getLocale().active`; событие `locale/change`.
     `$PKG/dsh-client-locale/lib/types/client/index.d.ts:20-27,58-71,97-209`; `$PKG/dsh-client-locale/README.md:32-66`.
     Словари, зарегистрированные после монтирования, подхватываются без перезагрузки (`README.md:38`).
     Текст виджетов должен идти через `t` (`$SKILL/references/ui-plugin.md:13`; `$PKG/dsh-client-locale/README.md:84`).

Куда класть переводы своего UI: в `client.js` (словари в коде) — клиентские бандлы **не** грузят `locale/*.json`
(проверено: ни один `lib/client.js` не требует locale-JSON; файлы `locale/*.json` служат только метаданным пакета).
Для `meta.title/description` — `locale/en.json` + `locale/ru.json` и экспорт `./locale/*.json`.

### 1.11 Слоты: полный список для web-профиля

Все клиентские пакеты, объявляющие слоты, входят в web-профиль (`$PKG/dsh-web-app/cordis.patch.yml:228-463`).
Полный список (103 слота, снят с `interface SlotMap` в `lib/types/**/*.d.ts`; `kind`/`scope` — из объявления):

<details>
<summary>Развернуть таблицу слотов</summary>

| Слот                                        | kind     | scope         | Назначение                                         | Объявлен                              |
| ------------------------------------------- | -------- | ------------- | -------------------------------------------------- | ------------------------------------- |
| `conversation.approval.detail`              | single   | session       | Деталь Tool-вызова, связанного с запросом approval | dsh-client-ui-approval                |
| `conversation.chat.assistant-actions`       | list     | session       | Действия у финализированного assistant-сообщения   | dsh-client-ui-chat                    |
| `conversation.chat.commandview`             | keyed    | session       | Рендер командной строки по имени команды           | dsh-client-ui-chat                    |
| `conversation.chat.flow`                    | single   | session       | Лента Chat-строк                                   | dsh-client-ui-chat                    |
| `conversation.chat.message.images`          | single   | session       | Группа картинок message                            | dsh-client-ui-chat                    |
| `conversation.chat.node`                    | keyed    | session       | Финальный рендер Chat-узла по `ChatNodeKind`       | dsh-client-ui-chat                    |
| `conversation.chat.reasoning.body`          | single   | session       | Развёрнутое тело reasoning                         | dsh-client-ui-chat                    |
| `conversation.chat.turnTail`                | list     | session       | Вкладки перед строкой действий завершённого Turn   | dsh-client-ui-chat                    |
| `conversation.chat.user.images`             | single   | session       | Картинки пользовательского сообщения               | dsh-client-ui-chat                    |
| `conversation.composer`                     | chain    | session       | Замена резидентного composer по селектору          | dsh-client-ui-conversation            |
| `conversation.composer.bar`                 | single   | session-maybe | Тело composer (в т.ч. без сессии)                  | dsh-client-ui-conversation            |
| **`conversation.composer.dock`**            | **list** | **session**   | **Строки под карточкой composer**                  | **dsh-client-ui-conversation**        |
| `conversation.header`                       | single   | session-maybe | Навигационный контейнер                            | dsh-client-ui-conversation            |
| `conversation.header.leading`               | single   | root          | Навигация до заголовка сессии                      | dsh-client-ui-conversation            |
| `conversation.hero.agentPreset`             | single   | session-maybe | Пресет для новой сессии                            | dsh-client-ui-conversation            |
| `conversation.hero.brand.mark`              | single   | root          | Бренд-марка пустого состояния                      | dsh-client-ui-conversation            |
| `conversation.hero.options`                 | list     | session       | Компактные опции строки новой сессии               | dsh-client-ui-conversation            |
| `conversation.hero.workspace`               | single   | root          | Выбор workspace в hero                             | dsh-client-ui-conversation            |
| `conversation.hero.workspace.directoryFlow` | single   | root          | Directory-flow под picker'ом                       | dsh-client-ui-workspace               |
| `conversation.input.activity`               | single   | session       | Контрол после выбора модели                        | dsh-client-ui-conversation            |
| `conversation.input.attachments`            | single   | session-maybe | Рейка вложений                                     | dsh-client-ui-conversation            |
| `conversation.input.dock`                   | list     | session       | Полноширинные строки над composer                  | dsh-client-ui-conversation            |
| `conversation.input.left`                   | list     | session       | Контролы слева в тулбаре composer                  | dsh-client-ui-conversation            |
| `conversation.input.model`                  | single   | session       | Селектор модели                                    | dsh-client-ui-conversation            |
| `conversation.input.model.label`            | single   | session       | Неинтерактивная подпись модели                     | dsh-client-ui-model-selection         |
| `conversation.input.overlay`                | list     | session       | Плавающие элементы внутри карточки composer        | dsh-client-ui-conversation            |
| `conversation.input.permission`             | single   | session       | Контрол permission                                 | dsh-client-ui-conversation            |
| `conversation.input.plan`                   | single   | session       | Контрол plan                                       | dsh-client-ui-conversation            |
| `conversation.input.right`                  | list     | session       | Контролы перед Send                                | dsh-client-ui-conversation            |
| `conversation.plan-review.actions`          | list     | session       | Действия у плана на ревью                          | dsh-client-ui-user-questions          |
| `conversation.session`                      | single   | session       | Тело Conversation                                  | dsh-client-ui-conversation            |
| `conversation.session.header`               | single   | session       | Заголовок сессии                                   | dsh-client-ui-conversation            |
| `conversation.session.header.actions`       | list     | session       | Действия рядом с заголовком                        | dsh-client-ui-conversation            |
| `conversation.session.header.corner`        | single   | session       | Правый угол заголовка                              | dsh-client-ui-conversation            |
| `conversation.session.header.lineage`       | single   | session       | Замена breadcrumb                                  | dsh-client-ui-conversation            |
| `conversation.session.header.utilities`     | list     | session       | Утилиты справа в заголовке                         | dsh-client-ui-conversation            |
| `conversation.session.header.views.actions` | list     | root          | Ряды меню «More» вкладок View                      | dsh-client-ui-conversation            |
| `conversation.trajectory.images`            | single   | session       | Картинки Trajectory                                | dsh-client-ui-trajectory              |
| `conversation.user.text.node`               | keyed    | session       | Inline-рендер JSON-текста                          | dsh-client-ui-conversation            |
| `conversation.view`                         | list     | session       | Зарегистрированные View                            | dsh-client-ui-conversation            |
| `deliverables.file.actions`                 | list     | session       | Открыть файл по координатам события                | dsh-client-ui-deliverables            |
| `deliverables.review.file.actions`          | list     | session       | То же в review-табе                                | dsh-client-ui-deliverables            |
| `main`                                      | keyed    | root          | Центральная панель по id записи sidebar            | dsh-client-ui-layout                  |
| `main.conversation`                         | single   | session-maybe | Conversation под main-панелью                      | dsh-client-ui-conversation            |
| `plugins.add.actions`                       | list     | root          | Ряды меню после установки                          | dsh-client-ui-plugin-manager          |
| `plugins.bundle.activation`                 | keyed    | root          | Подсказка после включения бандла                   | dsh-client-ui-plugin-manager          |
| `plugins.bundle.config`                     | keyed    | root          | Конфиг бандла                                      | dsh-client-ui-plugin-manager          |
| `plugins.detail.actions`                    | list     | root          | Контролы в шапке деталей                           | dsh-client-ui-plugin-manager          |
| `plugins.detail.badge`                      | list     | root          | Теги рядом с заголовком деталей                    | dsh-client-ui-plugin-manager          |
| `plugins.detail.section`                    | list     | root          | Секции на странице деталей                         | dsh-client-ui-plugin-manager          |
| `plugins.item`                              | list     | root          | Карточка официального плагина                      | dsh-client-ui-plugin-manager          |
| `plugins.row.config`                        | keyed    | root          | Конфиг одной строки бандла                         | dsh-client-ui-plugin-manager          |
| `plugins.tab`                               | list     | root          | Дополнительные табы страницы Plugins               | dsh-client-ui-plugin-manager          |
| `rightbar`                                  | single   | root          | Правая колонка                                     | dsh-client-ui-layout                  |
| `rightbar.session`                          | single   | session       | Контент правого sidebar                            | dsh-client-ui-sidebar-right           |
| `root`                                      | single   | root          | Корень дерева рендера                              | dsh-client-ui-renderer                |
| `settings.action`                           | list     | root          | Действия в шапке Settings                          | dsh-client-ui-settings                |
| `settings.close`                            | single   | root          | Подпись кнопки закрытия                            | dsh-client-ui-settings                |
| `settings.general.item`                     | list     | root          | Одна строка в General                              | dsh-client-ui-settings                |
| `settings.header`                           | single   | root          | Заголовок панели Settings                          | dsh-client-ui-settings                |
| `settings.launcher`                         | single   | root          | Лончер настроек в sidebar                          | dsh-client-ui-settings                |
| `settings.models.footer`                    | list     | root          | Область после списка провайдеров                   | dsh-client-ui-settings-models         |
| `settings.models.provider-card`             | keyed    | root          | Расширение карточки провайдера                     | dsh-client-ui-settings-models         |
| `settings.models.sign-in`                   | single   | root          | Выбор логина перед редактором ключа                | dsh-client-ui-settings-models         |
| `settings.onboarding`                       | list     | root          | Шаги онбординга                                    | dsh-client-ui-settings                |
| `settings.plugins.tab`                      | list     | root          | Страница внутри секции Plugins                     | dsh-client-ui-settings                |
| **`settings.section`**                      | **list** | **root**      | **Страница настроек (`id`, `order`, `label`)**     | **dsh-client-ui-settings**            |
| `settings.trigger`                          | single   | root          | Содержимое триггера Settings                       | dsh-client-ui-settings                |
| `shell.bottom`                              | single   | root          | Полноширинный низ под колонками                    | dsh-client-ui-layout                  |
| `shell.leading`                             | single   | root          | Window-chrome слева сверху                         | dsh-client-ui-layout                  |
| **`shell.overlay`**                         | **list** | **root**      | **Плавающий слой поверх всего; click-through**     | **dsh-client-ui-layout**              |
| `shell.quota-notice`                        | chain    | root          | Цепочка уведомления о квоте                        | dsh-client-ui-chat                    |
| `sidebar`                                   | single   | root          | Вся левая колонка                                  | dsh-client-ui-layout                  |
| `sidebar.brand.mark`                        | single   | root          | Марка в бренд-строке                               | dsh-client-ui-sidebar                 |
| `sidebar.brand.name`                        | single   | root          | Имя бренда                                         | dsh-client-ui-sidebar                 |
| `sidebar.chat.conversation`                 | single   | session       | Conversation в чат-табе сайдбара                   | dsh-client-ui-subagent                |
| **`sidebar.footer.action`**                 | **list** | **root**      | **Действия рядом с Settings в подвале**            | **dsh-client-ui-sidebar**             |
| `sidebar.panellist`                         | list     | root          | Иконки глобальных панелей                          | dsh-client-ui-sidebar                 |
| `sidebar.panellist.actions`                 | list     | root          | Меню «More» списка панелей                         | dsh-client-ui-sidebar                 |
| `sidebar.right.pane.tab`                    | keyed    | session       | Тело таба правого sidebar (key = id типа)          | dsh-client-ui-sidebar-right           |
| `sidebar.right.pane.tab.title`              | keyed    | session       | Заголовок таба                                     | dsh-client-ui-sidebar-right           |
| `sidebar.right.tab.document`                | keyed    | session       | Тело документа (key = id реализации)               | dsh-client-ui-sidebar-documentpreview |
| `sidebar.right.tab.document.action`         | keyed    | session       | Контролы перед reload                              | dsh-client-ui-sidebar-documentpreview |
| `sidebar.right.tab.document.actions`        | list     | session       | Тулбар превью файла                                | dsh-client-ui-sidebar-documentpreview |
| `sidebar.right.tab.document.office.pdf`     | keyed    | session       | PDF из Office-конвертации                          | dsh-client-ui-sidebar-documentpreview |
| `sidebar.right.tab.document.unpreviewable`  | list     | session       | Пустое состояние непревьюемого файла               | dsh-client-ui-sidebar-documentpreview |
| `sidebar.right.tab.files.actions`           | list     | session       | Действия дерева файлов                             | dsh-client-ui-sidebar-files           |
| `sidebar.right.tab.guide`                   | chain    | session       | Тело guide-таба                                    | dsh-client-ui-sidebar-right           |
| `sidebar.right.tab.guide.actions`           | list     | root          | Меню «More» guide                                  | dsh-client-ui-sidebar-right           |
| `sidebar.right.tab.guide.entry`             | keyed    | session       | Карточка провайдера в guide                        | dsh-client-ui-sidebar-right           |
| `sidebar.right.tab.menu.item`               | list     | session       | Пункты меню таба                                   | dsh-client-ui-sidebar-right           |
| `sidebar.session.row.hover`                 | list     | root          | Секция hover-карточки сессии                       | dsh-client-ui-workspace               |
| `sidebar.session.row.leading`               | list     | root          | Декорация перед заголовком строки                  | dsh-client-ui-workspace               |
| `sidebar.settings`                          | single   | root          | Место Settings в подвале                           | dsh-client-ui-sidebar                 |
| `sidebar.toggle.badge`                      | single   | root          | Бейдж на кнопке разворота                          | dsh-client-ui-sidebar                 |
| `sidebar.workspaces`                        | single   | root          | Область workspace/сессий                           | dsh-client-ui-sidebar                 |
| `sidebar.workspaces.directoryFlow`          | single   | root          | Directory-flow под областью                        | dsh-client-ui-workspace               |
| `sidebar.workspaces.session.menu.item`      | list     | root          | Пункты меню «...» сессии                           | dsh-client-ui-workspace               |
| `sidebar.workspaces.session.row.action`     | list     | root          | Кнопки при hover на строке сессии                  | dsh-client-ui-workspace               |
| `tool.call.images`                          | single   | session       | Картинки Tool-вызова                               | dsh-client-ui-tool                    |
| `tool.call.toolview`                        | keyed    | session       | Рендер Tool-вызова по имени инструмента            | dsh-client-ui-tool                    |
| `tool.view.cordis`                          | keyed    | session       | Интерактивная зона пакета в cordis-инструменте     | dsh-client-ui-cordis                  |
| `workspace.toast`                           | keyed    | root          | Уведомления workspace                              | dsh-client-ui-workspace               |

</details>

Опции регистрации, подтверждённые кодом и документацией:

| Опция      | Смысл                                                                                                   | Где                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`     | имя слота (обязательно)                                                                                 | все примеры: `$SKILL/templates/decoration/client.js:16-18`                                                                                                               |
| `id`       | идентификатор записи в list/chain; в `keyed` вместо него `key`                                          | `$PKG/dsh-client-ui-chat/README.md:71`; `$PKG/dsh-client-ui-sidebar-right/README.md:84` (`register({name, key})`)                                                        |
| `order`    | порядок в list (по возрастанию)                                                                         | `$PKG/dsh-client-ui-workspace/README.md:161-167`; `$PKG/dsh-client-ui-chat/README.md:71`                                                                                 |
| `priority` | для single/chain: меньшее значение = замена; в chain — порядок (возрастание), затем порядок регистрации | `$PKG/dsh-client-ui-chat/README.md:71`; `$PKG/dsh-client-ui-conversation/README.md:165`                                                                                  |
| `locale`   | namespace для инжектированного `t`                                                                      | `$PKG/dsh-client-ui-workspace/README.md:165`; `$PKG/dsh-client-ui-chat/lib/client.js:13352`                                                                              |
| `inject`   | фабрика inject-face (хуки/колбэки, не сериализуется)                                                    | `$PKG/dsh-client-ui-workspace/README.md:166`; `$PKG/dsh-client-ui-chat/lib/client.js:13353`                                                                              |
| `select`   | для chain: чистая функция от owner-currency                                                             | `$PKG/dsh-client-ui-conversation/README.md:153-165`                                                                                                                      |
| `children` | декларация дочерних слотов владельцем                                                                   | `$PKG/dsh-client-ui-settings-general/lib/client.js:1305-1308`; `$PKG/dsh-client-ui-chat/lib/client.js:13322-13330` (объявление `children: { "shell.quota-notice": … })`) |
| `label`    | локализованный текст записи (в Settings — функция)                                                      | `$PKG/dsh-client-ui-settings/lib/types/client/contract/slots.d.ts:62-77`; `settings-general/lib/client.js:1303`                                                          |

Обязательный паттерн: `ctx.slots.inject(ownerKey, () => ctx.slots.register(...))` — ждёт объявления слота, снимает
вклад при его исчезновении и ставит заново (`$SKILL/references/practices.md:36`; `$PKG/dsh-client-ui-workspace/README.md:171`).

### 1.12 Прочие полезные сервисы/ключи для этого плагина

| API                                            | Что даёт                                                                            | Где                                                                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `modelSelection` (проекция)                    | `lastUsed` / `next`: `{provider, model, reasoningEffort?}` — маршрут для тарифа     | `$PKG/dsh-api-session-controller/lib/types/types.d.ts:92-110`                                              |
| `subagentCatalog`, `subagentTiming` (проекции) | дети и их тайминги; для их токенов — `tokenUsage` каждой дочерней сессии            | `$PKG/dsh-subagent/lib/types/projection-types.d.ts:70-72`; `$PKG/dsh-client-ui-subagent/README.md:66`      |
| `ctx.sessionProjections.register(definition)`  | своя проекция (например, посчитанная стоимость по сессии) с `wire.view` для клиента | `$PKG/dsh-session-projection/README.md:36-61`; `api-catalog.js:2238-2310`                                  |
| `ctx.get('sessionProjections')`                | проверка наличия реестра без падения                                                | `$PKG/dsh-session-projection/README.md:65`                                                                 |
| `ctx.modules.entries.releaseChange` (клиент)   | смена релиза хоста: `{page, previous, host}`, каждый — `{version, commit?}`         | `$PKG/dsh-client-modules/lib/types/client/release-change.d.ts:5-44`; `lib/types/client/entries.d.ts:44-46` |
| `window.__DSH_BOOT__.release`                  | релиз, с которым загрузилась страница                                               | `$PKG/dsh-client-modules/lib/types/client/manifest.d.ts:78-90`; `README.md:68`                             |
| `ctx.profileContext`                           | `{name, dir, patchPath, installAnchor, home, cwd, …}`, только в профильном запуске  | `$PKG/dsh-app-boot/lib/types/profile-context.d.ts:10-31`                                                   |
| `getDshRuntimeVersion()`                       | версия рантайма dsh (точное написание semver)                                       | `$PKG/dsh-app-boot/lib/types/plugin-compatibility.d.ts:16`; экспорт — `lib/types/index.d.ts:15`            |

---

## 2. Как плагин узнаёт, что API изменился

Официального события «API изменился» нет (кроме клиентского `releaseChange`). Ниже — проверки, которые стоит встроить,
от самых дешёвых к самым точным.

| Проверка                                                                                                         | Что ловит                                                                                  | Код/источник                                                                                                                         | Как деградировать                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engines.dsh` в `package.json`                                                                                   | несовместимый мажор/минор рантайма                                                         | `$PKG/dsh-app-boot/README.md:52`; установка и старт проверяют это (`$DSH/README.md:39`)                                              | не устанавливаться/не грузиться; менеджер покажет `incompatible-version`; обход — только точная exemption-пара (`$PKG/dsh-plugin-manager/README.md:66-75`) |
| `peerDependencies` на `@deepseek-ai/dsh*` (если нет `engines.dsh`)                                               | то же, по каждому peer-пакету                                                              | `$PKG/dsh-app-boot/README.md:52`                                                                                                     | то же                                                                                                                                                      |
| Наличие сервиса: `inject: ['tokenMeter']`, опционально `ctx.inject(['tokenMeter'], …)` / `ctx.get('tokenMeter')` | сервис не смонтирован (другая сборка/профиль)                                              | `$SKILL/references/practices.md:20`; `$PKG/dsh-session-projection/README.md:65`                                                      | не активировать фичу, показать «нет данных»; не бросать                                                                                                    |
| Значение проекции: `useProjection('tokenUsage') === undefined`                                                   | ключ не отдаётся (юнит не смонтирован / нет baseline)                                      | `$PKG/dsh-api-session-controller/lib/types/client/sessions/projection-store.d.ts:19-31`; `$PKG/dsh-session-projection/README.md:130` | скрыть виджет; **не** проверять «есть ли ключ» — таблица юнитов процесс-глобальна, ключ виден во всех сессиях                                              |
| Наличие поля в значении: `'projectedTokens' in pressure`, `typeof usage.cacheReadTokens === 'number'`            | изменение wire-вида при том же ключе                                                       | `$PKG/dsh-token-meter/lib/types/projection.d.ts:28-46`; версия юнита `stateVersion` — `usage-projection.d.ts:88,143`                 | показать частичные данные, не падать                                                                                                                       |
| `ctx.modules.entries.releaseChange` (браузер)                                                                    | хост перезапущен с другим релизом (`version`+`commit`)                                     | `$PKG/dsh-client-modules/lib/types/client/release-change.d.ts:5-12`; `README.md:46`                                                  | ничего не применять, предложить перезагрузку страницы                                                                                                      |
| `window.__DSH_BOOT__.release`                                                                                    | релиз, под который собран бандл страницы                                                   | `$PKG/dsh-client-modules/lib/types/client/manifest.d.ts:78-90`                                                                       | сравнить с ожидаемым диапазоном и скрыть фичу                                                                                                              |
| `ctx.profileContext.installAnchor` + чтение `package.json`                                                       | точная версия dsh на хосте без импорта чужих пакетов                                       | `$PKG/dsh-app-boot/lib/types/profile.d.ts:230`; `profile-context.d.ts:15`                                                            | лог-варнинг + мягкая деградация                                                                                                                            |
| `getDshRuntimeVersion()`                                                                                         | то же, «официальным» способом                                                              | `$PKG/dsh-app-boot/lib/types/plugin-compatibility.d.ts:16`                                                                           | — (см. «Пробелы»: резолвится ли пакет из профиля — не проверено)                                                                                           |
| `ctx.slots.inject(...)`                                                                                          | слот не объявлен/исчез                                                                     | `$PKG/dsh-client-ui-workspace/README.md:171`                                                                                         | вклад просто не появляется — это и есть деградация                                                                                                         |
| `try/catch` вокруг рендера                                                                                       | падение компонента обнуляет весь слот-элемент (в консоли `slot entry crashed in '<slot>'`) | `$SKILL/references/practices.md:35`                                                                                                  | локальный error boundary и текст «недоступно»                                                                                                              |
| `stateVersion` своей проекции                                                                                    | несовместимая версия юнита с чужим                                                         | `$PKG/dsh-session-projection/README.md:58`                                                                                           | не регистрировать при конфликте (регистрация бросит)                                                                                                       |

Практический минимум для «пиковых часов + стоимость»:

1. Хост: `engines: { "dsh": "0.2.x" }` + `inject: ['tokenMeter']` (или опциональный `ctx.inject`).
2. Клиент: отсутствие фичи — это `typeof useProjection !== 'function' || useProjection('tokenUsage') === undefined`.
3. Логировать `window.__DSH_BOOT__?.release` и `releaseChange.host.version` один раз при активации — этого достаточно,
   чтобы по логу понять, на каком релизе сломалось.

---

## 3. Требования к пакету

Чеклист собран из `$SKILL/references/host-plugin.md`, `$SKILL/references/ui-plugin.md`,
`$SKILL/references/practices.md` и шаблона `$SKILL/templates/decoration/*`.

**Манифест (`package.json`)**

- [ ] `name`, `version` (semver), `private: true` для локального, `type: "module"`.
- [ ] `exports`: `"."` (index.js хоста), `"./client"` (client.js), `"./locale/*.json"`, `"./icon"` — `host-plugin.md:9-18,44-48`.
- [ ] `files`: `index.js`, `client.js`, `cordis.patch.yml`, `locale/*.json`, `icon.svg` — `host-plugin.md:35,47`.
- [ ] `dsh.bundle.patch`: `"./cordis.patch.yml"` — без этого пакет не слой профиля, а «просто зависимость»
      (установщик предупредит: `$PKG/dsh-plugin-manager/lib/types/operations.js:110-113`).
- [ ] `dsh.client`: `{ platform: "web", immediately: true, inject: ["@deepseek-ai/dsh-client-ui-conversation"] }`
      (порядок активации; сами модули не импортируются) — `ui-plugin.md:3`; `$PKG/dsh-package-manifest/lib/types/types.d.ts:76-89`.
- [ ] `dsh.client.external`: только не-базовые модули; React/`react-dom` брать из таблицы модулей, **не** ставить своей копией —
      `$PKG/dsh-client-modules/README.md:48-50`; `ui-plugin.md:9`.
- [ ] `engines.dsh` (или peer-зависимости на `@deepseek-ai/dsh*`) — `app-boot/README.md:52`.
- [ ] Никаких install-скриптов и сборки для чистого JS: шаблон и документация это разрешают (`host-plugin.md:7`).

**Патч и хостовый код**

- [ ] `cordis.patch.yml`: `- insert: [{ id: <уникальный>, name: '<package>' }]` — `host-plugin.md:20-27`.
- [ ] `index.js`: `export function apply(ctx, config) {}` **или** default-класс сервиса; не смешивать; опционально
      `export const inject = [...]` и `export const Config` — `host-plugin.md:57-64`.
- [ ] Все регистрации внутри `apply` через `ctx.effect`/`ctx.on` с возвратом cleanup — там же:64.
- [ ] Настраиваемое — в `Config` (schemastery), чтобы пользователь менял в `cordis.patch.yml`; патч пользователя переживает
      апгрейд — `practices.md:22`.
- [ ] Для чтения настроек из браузера нужны **volatile**-поля (`Volatile<…>`) — `$PKG/dsh-settings/README.md:33`.

**Отображение в Plugins/Settings**

- [ ] `locale/en.json` (+ `locale/ru.json`): `meta.title` и `meta.description` — осмысленные, не шаблонные
      (`host-plugin.md:31-42`).
- [ ] Иконка: SVG/PNG/JPEG/WebP ≤ 256 KiB, внутри пакета; абсолютные пути/URL/симлинки наружу запрещены;
      `icon` в корне `package.json` имеет приоритет над `./icon` — `host-plugin.md:51`.
- [ ] Если иконки нет — панель подставит дефолт, но это считается исключением, которое надо объяснить (`host-plugin.md:51,55`).
- [ ] Плагин обязан быть виден в инвентаре Plugins (даже host-only/конфигурационный бандл) — `host-plugin.md:55`.
- [ ] Проверить title/description/иконку в EN и RU и отсутствие диагностик метаданных — `host-plugin.md:53`.

**Клиентская половина**

- [ ] Формат модуля: `window.__ModuleLoader__.load({ id: '<package-name>', factory(require) { … return { inject, apply } } })`;
      `id` равен имени пакета — `$SKILL/templates/decoration/client.js:1-21`; `ui-plugin.md:9`.
- [ ] React — `require('react')` из таблицы модулей; никакого CDN/UMD/своего бандлера — `ui-plugin.md:9`;
      `$PKG/dsh-client-modules/README.md:50`.
- [ ] Фабрика без побочных эффектов; стили/таймеры/слушатели — внутри `apply` через `ctx.effect`/`ctx.on`, с cleanup —
      `ui-plugin.md:13`.
- [ ] Не импортировать клиентские пакеты Harness (в т.ч. `dsh-client-ui-primitives`) — копировать разметку/поведение и
      использовать только токены темы `--dsw-alias-*` — `practices.md:34-35`.
- [ ] Не писать в DOM вне компонента, не заменять корень приложения — `practices.md:36`; `ui-plugin.md:13`.
- [ ] Весь видимый текст — через локаль (`t`), а не литералами — `ui-plugin.md:13`.
- [ ] Внешний вид: радиусы/типографика как у хостовых контролов, светлая/тёмная тема — `practices.md:34`.

**Обновляемость/диагностика**

- [ ] Версия пакета меняется при изменении поведения (менеджер показывает версию и обновляет пакет).
- [ ] После установки проверять `application`/`warnings`, а не логи (`host-plugin.md:68-70`).
- [ ] Помнить: замена уже запущенного пакета требует рестарта; HMR подхватывает конфиг, но не новую JS-генерацию —
      `host-plugin.md:70`.

---

### 3.1 Установка локального пакета (папка на диске)

| Шаг                     | Что происходит                                                                                                                                                                                                                                                                | Где                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Команда                 | `dsh plugin --profile web add /abs/path` — CLI разбирает только свои `allow-version`/`revoke-version`/`version-exemptions`, остальное **дословно** передаёт в pnpm, запущенный в каталоге профиля                                                                             | `$DSH/lib/bin.js:116-120`; `$DSH/lib/plugin-BiveYA7h.js:63-98`; `$DSH/README.md:18`                                      |
| Проверка совместимости  | до запуска pnpm читается `package.json` локального пути и сверяются `engines.dsh` (или dsh-peer'ы) с версией рантайма; при отказе ничего не скачивается и не собирается                                                                                                       | `$PKG/dsh-plugin-manager/README.md:69`; `$PKG/dsh-app-boot/README.md:52`                                                 |
| pnpm                    | обязателен в `PATH`; его отсутствие даёт exit 127 и подсказку «pnpm was not found» (локально стоит 10.30.3, не 11)                                                                                                                                                            | `$DSH/lib/plugin-BiveYA7h.js:94`                                                                                         |
| `package.json` профиля  | pnpm добавляет пакет в `dependencies` (для локальной папки — `file:`/`link:`-спек; точный вид pnpm не проверен) и обновляет `pnpm-lock.yaml`                                                                                                                                  | `$PKG/dsh-plugin-manager/README.md:44,60`                                                                                |
| `dsh.profile.bundles`   | после успешного pnpm `reconcile` дописывает **новые** прямые зависимости, у которых есть `dsh.bundle.patch`, в конец `dsh.profile.bundles`; пакет без `dsh.bundle` получает предупреждение «installed as a plain dependency, not a profile layer» и в bundles не попадает     | `$PKG/dsh-plugin-manager/lib/types/operations.js:96-124` (особенно 106-119)                                              |
| Активация               | при включённом HMR (в профиле включён) новый бандл поднимается без рестарта; замена уже запущенного пакета требует рестарта; при выключенном HMR — `restart-required`                                                                                                         | `$PKG/dsh-base/cordis.patch.yml:28-32`; `$PKG/dsh-plugin-manager/README.md:73-74`; `$SKILL/references/host-plugin.md:70` |
| Build-approvals         | нужны только если у зависимости есть install/prepare-скрипты: pnpm 11 их блокирует, менеджер собирает `pendingBuilds`, разрешение пишется как `allowBuilds` в `$PROFILE/pnpm-workspace.yaml` и переживает неудачную установку. Чистый JS-пакет без скриптов ничего не требует | `$PKG/dsh-plugin-manager/README.md:64`; `$PROFILE/pnpm-workspace.yaml:1-4`                                               |
| Откат                   | провал/отмена установки восстанавливают `package.json` и `pnpm-lock.yaml`; уже скачанные модули остаются на диске                                                                                                                                                             | `$PKG/dsh-plugin-manager/README.md:60,64`                                                                                |
| Официальный путь скилла | `plugin_manager` action `install_bundle` с абсолютным каталогом пакета делает те же операции; скилл прямо запрещает писать `package.json`/`cordis.patch.yml` профиля руками и запускать pnpm в каталоге профиля                                                               | `$SKILL/SKILL.md:8,10`; `$SKILL/references/host-plugin.md:68`                                                            |
| Несовместимая версия    | отказ `incompatible-version`; обход — `dsh plugin --profile web allow-version <pkg@ver> --dsh-version <ver> --accept-risk` (пишется в `$PROFILE/compatibility.json`)                                                                                                          | `$PKG/dsh-plugin-manager/README.md:66-75`                                                                                |

Практический вывод для этого плагина: пакет без сборки и без install-скриптов ставится одной командой, pnpm нужен,
build-approvals не нужны, после установки имя пакета обязано оказаться и в `dependencies` профиля, и в
`dsh.profile.bundles` — иначе браузерная половина не появится в `window.__DSH_BOOT__` (`$PKG/dsh-client-modules/README.md:34`).

---

## 4. Пробелы (чего нет в документации/пакетах)

1. **`@deepseek-ai/dsh-client-ui-slots` не установлен.** Нет ни README, ни `.d.ts` этого пакета в `node_modules`
   (`$PKG/dsh-web-frontend/package.json:34` — только devDependency сборки). Поэтому точные определения `PropsRuntime`,
   `PropsLocale`, `PropsRenderSlots`, `InjectFace`, полный список опций `register()` и семантика `priority` для всех
   видов слотов недоступны локально — только по потребителям и рантайм-инспекции. Проверять через `Slots.listSubTree`
   в живом клиенте.
2. **Денег/тарифов нет вообще.** Ни сервиса, ни поля, ни проекции с ценой, скидкой, пиковым окном или таймзоной
   провайдера. Таблицу цен и окно скидки придётся задавать конфигом плагина; сверить цифры по официальному прайсу
   DeepSeek (внешний источник, в пакетах его нет).
3. **Нет API «стоимость запроса/сообщения».** Только токены: суммы по сессии, `TurnTokenUsage` по Turn'у, `TokenUsage`
   в событии `assistant/message` и эвристика `estimateMessage`. Точный usage отдельного **сообщения** вне Turn
   (например, после ручного вмешательства) официально не типизирован на клиенте (`usage?: unknown`).
4. **`reasoningTokens` не доходит до проекции.** Есть в `TokenUsage` и в `TurnTokenUsage`, но не в `tokenUsage`
   (`projection.d.ts:6-17`). Для отображения reasoning-доли нужен Turn-уровень или хостовый доступ к событиям.
5. **Сабагенты не агрегируются.** Суммирование детей — ручное, по `projectionsBySession`; официального «total с детьми»
   нет. Поведение «родитель не включает детей» выведено из устройства логов, но экспериментально не подтверждено.
6. **Нет клиентского пути к `measure()`.** `ctx.tokenMeter.measure` требует хостовый `Session`; официального Remote,
   отдающего `TokenMeasurement`, в пакетах не найдено. Значит, `surfaceTokens`, `nodes`, `baseline` в браузере недоступны
   без собственного Remote-эндпоинта (Typert) — а его API в этой задаче не изучался.
7. **Нет уведомления об изменении API хоста.** Есть только клиентский `releaseChange` (и он про релиз, а не про схему
   слотов/пропсов). Дрейф слотов/пропсов ловится исключительно `try/catch` + `slots.inject`.
8. **`getDshRuntimeVersion()` из профильного плагина** — не проверено, резолвится ли `@deepseek-ai/dsh-app-boot` из
   `$PROFILE/node_modules` (в профиле его нет). Надёжный обход — читать `package.json` по `ctx.profileContext.installAnchor`,
   но это неофициальный по духу путь.
9. **Расхождение про место записи настроек:** `dsh-client-locale/README.md:12` — `$DSH_HOME/cordis.patch.yml`,
   `dsh-config-editor/README.md:67` + код — patch активного профиля. Проверить на живой записи (`locale.preference`
   после смены языка).
10. **`performanceUsage` (режим compact/detailed) не является публичным hook-контрактом** для чужих плагинов: тип
    `PerformanceUsageInjected` не экспортируется из `ui-chat/client`. Читать настройку можно только через `configForms`.
11. **Не проверено экспериментально:** активация локально установленного бандла через HMR (в профиле HMR включён —
    `$PKG/dsh-base/cordis.patch.yml:28-32`), фактический спек зависимости, который pnpm запишет для `/abs/path`
    (`file:` или `link:`), и поведение `settings.section` при отсутствии namespace.
12. **`sessionStats`/`tokenUsage` — не «биллинг».** Оба документированы как справочные; провайдерский usage может
    отсутствовать — тогда `tokenUsage` просто не растёт (нули), а `measure()`/`contextPressure` уходят в эвристику; `contextBreakdown` заведомо занижает CJK и JSON-схемы
    (`$PKG/dsh-token-meter/README.md:68,140-144`).

---

## Резюме

1. Токены даёт `ctx.tokenMeter` (хостовый): `measure(session)` — снимок давления/поверхности, `estimateMessage(msg)` —
   цена одного сообщения. Для клиента сервис регистрирует три проекции: `tokenUsage` (4 бакета за весь лог),
   `contextPressure` (`pressureTokens`/`projectedTokens`/`contextWindow`), `contextBreakdown` (system/tools/messages).
2. `cache hit/miss/write` и `output` есть в `tokenUsage`; `reasoningTokens` — только в `TokenUsage` события и в
   `TurnTokenUsage`; в проекцию он не попадает.
3. `dsh-session-stats` добавляет только счётчики/времена (`sessionStats`), без токенов; для «стоимости» он не нужен.
4. По сессии usage читается как `useProjection('tokenUsage')`; по Turn'у — `TurnTailChatData.tokenUsage` (через `useChat`)
   либо `deriveTurnTokenUsage(events)`; по сообщению — только `assistant/message.data.usage` (`unknown` на клиенте).
5. Сабагенты — отдельные сессии: родительская `tokenUsage` их не суммирует, суммы по детям считаются вручную через
   `useSessions().projectionsBySession`.
6. Плагин в `conversation.composer.dock` (list, session-scope, без owner-props) получает `sessionId`, `useSession`,
   `useProjection`, `useAccess`, глобальные `useSessions`/`useSessionStatus`, `useChat` и `t`.
7. Официальные пилюли — `activity` (order 0) и `usage` (order 1); заменять их можно тем же `id`+`order` и меньшим
   `priority`, но их inject-face не публичен — проще добавить свою запись с новым `id`.
8. Настройки: Host `Config` (schemastery, volatile-поля видны браузеру) + клиентская страница `settings.section`
   (`id`/`order`/`label`), чтение — `ctx.configForms.get('<entry-id>')`; запись ложится в `$PROFILE/cordis.patch.yml`.
9. i18n: `locale/<lang>.json` с `meta.title/description` для инвентаря + рантайм-словари `ctx.locale.register`/
   `addLanguage` и `t`; активный язык — `ctx.locale.getLocale().active`.
10. Слотов в web-профиле 103 (полная таблица в 1.11); для задачи хватает `conversation.composer.dock`,
    `sidebar.footer.action`, `shell.overlay`, `settings.section`; регистрация — только через `ctx.slots.inject` + `register`.
11. Дрейф API: `engines.dsh`/peer-диапазоны (проверяются установкой и стартом), проверка наличия сервиса/значения проекции,
    клиентский `releaseChange`/`__DSH_BOOT__.release`, `try/catch` вокруг компонента — другого официального механизма нет.
12. **Цен и пиковых часов в API нет** — тарифную таблицу и окно скидки плагин обязан объявить сам; это главный
    недостающий кусок и единственное место, где нужны внешние данные.
13. Ключевой риск: `@deepseek-ai/dsh-client-ui-slots` не установлен, поэтому контракт пропсов слотов подтверждён
    косвенно; перед реализацией стоит один раз снять `Slots.listSubTree` в живом клиенте.
14. Пакет собирается без сборки: чистый ESM `index.js` + `client.js` в формате `window.__ModuleLoader__.load`,
    `dsh.bundle.patch`, `dsh.client`, `locale/*.json`, иконка ≤256 KiB; установка — `dsh plugin --profile web add /abs/path`
    (нужен pnpm; пакет без install-скриптов не требует build-approvals).
