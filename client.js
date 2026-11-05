window.__ModuleLoader__.load({
  id: 'dsh-peak-cost',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    let createPortal = null;
    try {
      const reactDom = require('react-dom');
      createPortal = typeof reactDom.createPortal === 'function' ? reactDom.createPortal : null;
    } catch {
      createPortal = null;
    }

    const STATE_URL = '/api/dsh-peak-cost/state';
    const DEFAULT_SETTINGS = { currency: 'USD', refreshMs: 30_000, lang: 'auto', footer: false, reminder: false };

    // Размер задаёт обёртка (как официальный `anchor`), кнопка повторяет его
    // через `font: inherit`. Иначе шорткат `font` перебивает font-size и пилюля
    // вырастает до шрифта композера.
    const ANCHOR_STYLE = {
      display: 'inline-flex',
      minWidth: 0,
      fontSize: 'calc(var(--dsh-content-font-size-secondary, 13px) - 1px)',
      lineHeight: 'calc(20px + var(--dsh-content-font-delta-secondary, 0px))',
    };

    const PILL_STYLE = {
      boxSizing: 'border-box',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '1px 8px',
      borderRadius: 'var(--dsw-radius-sm)',
      color: 'var(--dsw-alias-label-tertiary)',
      font: 'inherit',
      fontVariantNumeric: 'tabular-nums',
      lineHeight: 'inherit',
      whiteSpace: 'nowrap',
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
    };

    const DOT_STYLE = { width: '7px', height: '7px', borderRadius: '50%', flex: 'none' };
    const SEP_STYLE = { color: 'var(--dsw-alias-separator-primary)', margin: '0 6px' };

    const COLOURS = {
      peak: 'var(--dsw-alias-state-warn-primary)',
      offPeak: 'var(--dsw-alias-state-success-primary)',
      unknown: 'var(--dsw-alias-label-caption)',
    };

    const PANEL_STYLE = {
      position: 'fixed',
      zIndex: 60,
      width: '300px',
      boxSizing: 'border-box',
      padding: '12px',
      borderRadius: 'var(--dsw-radius-md)',
      background: 'var(--dsw-alias-bg-module-platform)',
      border: '0.5px solid var(--dsw-alias-border-l2)',
      boxShadow: '0 8px 24px rgba(0,0,0,.24)',
      color: 'var(--dsw-alias-label-primary)',
      fontSize: '12px',
      lineHeight: '18px',
      fontVariantNumeric: 'tabular-nums',
    };

    const ROW_STYLE = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' };
    const MUTED = { color: 'var(--dsw-alias-label-tertiary)' };
    const HAIRLINE = {
      height: '0.5px',
      background: 'var(--dsw-alias-border-l2)',
      margin: '8px 0',
      border: 'none',
    };

    const RU = {
      __lang: 'ru',
      peak: 'Пик',
      offPeak: 'Вне пика',
      unknown: '—',
      hour: 'ч',
      minute: 'м',
      soon: '<1 мин',
      until: 'до',
      session: 'Сессия',
      requests: 'запросов',
      table: 'Таблица цен',
      cacheHit: 'Вход (кэш)',
      cacheMiss: 'Вход (промах)',
      cacheWrite: 'Запись кэша',
      output: 'Выход',
      rate: 'за 1M',
      unknownModel: 'цена неизвестна для модели',
      today: 'Сегодня',
      week: 'Неделя',
      web: 'Web',
      calls: 'вызовов',
      calendar: 'Календарь',
      settingsTitle: 'Пик и стоимость',
      currencyLabel: 'Валюта в пилюле',
      refreshLabel: 'Обновление',
      footerLabel: 'Строка в футере сайдбара',
      reminderLabel: 'Напоминание о входе в пик',
      seconds: 'с',
      calls: { one: 'вызов', few: 'вызова', many: 'вызовов' },
      langLabel: 'Язык плагина',
      langAuto: 'Как в Harness',
      langRu: 'Русский',
      langEn: 'English',
      peakStarted: 'Пик начался',
      footerPeak: 'Пик',
      footerOff: 'Вне пика',
      caps: 'Нет доступа к',
      diagTitle: 'Диагностика',
      recheck: 'проверить снова',
      diagHost: 'Хост',
      diagSchema: 'Схема',
      diagSettings: 'Запись настроек',
      diagExpected: 'ожидается',
      diagNoSchema: 'схема не загружена',
      diagNsOk: 'namespace есть',
      diagNsMissing: 'namespace нет',
      diagOk: 'ок',
      diagWriteFailed: 'ошибка записи',
      webFree: 'Бесплатных web-вызовов',
      estimate: 'Оценка по токенам, а не счёт',
      scopeLabel: 'Область леджера',
      scopeWorkspace: 'Эта папка',
      scopeAll: 'Все папки',
      subagents: 'Из них сабагенты',
      sessions: { one: 'сессия', few: 'сессии', many: 'сессий' },
      requests: { one: 'запрос', few: 'запроса', many: 'запросов' },
      noLog: 'лог сессии недоступен',
      noSession: 'сессия не передана в плагин',
    };
    const EN = {
      __lang: 'en',
      peak: 'Peak',
      offPeak: 'Off-peak',
      unknown: '—',
      hour: 'h',
      minute: 'm',
      soon: '<1 min',
      until: 'until',
      session: 'Session',
      requests: 'requests',
      table: 'Price table',
      cacheHit: 'Input (cache hit)',
      cacheMiss: 'Input (miss)',
      cacheWrite: 'Cache write',
      output: 'Output',
      rate: 'per 1M',
      unknownModel: 'unknown price for model',
      today: 'Today',
      week: 'Week',
      web: 'Web',
      calls: 'calls',
      calendar: 'Calendar',
      settingsTitle: 'Peak cost',
      currencyLabel: 'Pill currency',
      refreshLabel: 'Refresh',
      footerLabel: 'Sidebar footer row',
      reminderLabel: 'Remind me when peak starts',
      seconds: 's',
      calls: { one: 'call', few: 'calls', many: 'calls' },
      langLabel: 'Plugin language',
      langAuto: 'Follow Harness',
      langRu: 'Русский',
      langEn: 'English',
      peakStarted: 'Peak started',
      footerPeak: 'Peak',
      footerOff: 'Off-peak',
      caps: 'Unavailable',
      diagTitle: 'Diagnostics',
      recheck: 'check again',
      diagHost: 'Host',
      diagSchema: 'Schema',
      diagSettings: 'Settings write',
      diagExpected: 'expected',
      diagNoSchema: 'schema not loaded',
      diagNsOk: 'namespace present',
      diagNsMissing: 'namespace missing',
      diagOk: 'ok',
      diagWriteFailed: 'write failed',
      webFree: 'Free web calls',
      estimate: 'Token-based estimate, not a bill',
      scopeLabel: 'Ledger scope',
      scopeWorkspace: 'This workspace',
      scopeAll: 'All workspaces',
      subagents: 'of which subagents',
      sessions: { one: 'session', few: 'sessions', many: 'sessions' },
      requests: { one: 'request', few: 'requests', many: 'requests' },
      noLog: 'session log unavailable',
      noSession: 'no session id passed to the plugin',
    };

    /** Служба локали хоста, если она смонтирована: язык берём из настроек Harness. */
    let localeFace = null;

    function activeLocale() {
      try {
        const snapshot = localeFace && typeof localeFace.getSnapshot === 'function' ? localeFace.getSnapshot() : null;
        return snapshot && typeof snapshot.active === 'string' ? snapshot.active : '';
      } catch {
        return '';
      }
    }

    function words() {
      return wordsFor(activeLocale());
    }

    function wordsFor(active) {
      const lang = (active || (typeof navigator !== 'undefined' ? navigator.language : '') || '').toLowerCase();
      return lang.startsWith('ru') ? RU : EN;
    }

    /** Подписка на смену языка: строки обновляются без перезагрузки страницы. */
    function useWords(mode) {
      const [active, setActive] = React.useState(activeLocale);
      React.useEffect(() => {
        if (localeFace === null || typeof localeFace.subscribe !== 'function') return undefined;
        const unsubscribe = localeFace.subscribe(() => setActive(activeLocale()));
        return () => {
          if (typeof unsubscribe === 'function') unsubscribe();
        };
      }, []);
      if (mode === 'ru' || mode === 'en') return wordsFor(mode);
      return wordsFor(active);
    }

    function formatCountdown(ms, w) {
      if (!Number.isFinite(ms) || ms <= 0) return w.soon;
      const minutes = Math.round(ms / 60_000);
      if (minutes < 1) return w.soon;
      if (minutes < 60) return `${minutes} ${w.minute}`;
      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      return rest === 0 ? `${hours} ${w.hour}` : `${hours} ${w.hour} ${rest} ${w.minute}`;
    }

    function sign(currency) {
      return currency === 'CNY' ? '¥' : '$';
    }

    function formatMoney(value, currency, w) {
      const digits = value !== 0 && Math.abs(value) < 0.01 ? 4 : 2;
      try {
        return new Intl.NumberFormat(w.__lang, {
          style: 'currency',
          currency,
          currencyDisplay: 'narrowSymbol',
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        }).format(value);
      } catch {
        return `${sign(currency)}${value.toFixed(digits)}`;
      }
    }

    function formatTokens(value) {
      if (!Number.isFinite(value) || value === 0) return '0';
      if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
      if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
      return String(value);
    }

    function formatRate(cost, tokens, currency) {
      if (!tokens) return '—';
      const rate = Number(((cost / tokens) * 1_000_000).toPrecision(3));
      return `${sign(currency)}${rate}`;
    }

    // Склонение по языку словаря, а не по языку браузера: иначе английская
    // локаль подставляет форму «many» в русскую строку.
    function plural(count, forms, w) {
      try {
        const rule = new Intl.PluralRules(w.__lang).select(count);
        return forms[rule] ?? forms.many;
      } catch {
        return count === 1 ? forms.one : forms.many;
      }
    }

    function localTime(ms, w) {
      return new Date(ms).toLocaleTimeString(w.__lang, { hour: '2-digit', minute: '2-digit' });
    }

    const BUCKETS = [
      ['cacheHit', 'cacheHit'],
      ['cacheMiss', 'cacheMiss'],
      ['cacheWrite', 'cacheWrite'],
      ['output', 'output'],
    ];

    function diagRow(label, value) {
      return h(
        'div',
        { style: { ...ROW_STYLE, ...MUTED, fontSize: '11px', marginTop: '2px' } },
        h('span', null, label),
        h('span', null, value),
      );
    }

    function hostText(state, w) {
      const diag = state && state.diagnostics;
      if (!diag) return w.unknown;
      return `${diag.hostVersion || '?'} ${w.diagExpected} ${diag.expectedHostRange || '?'}`;
    }

    function schemaText(state, w) {
      const diag = state && state.diagnostics;
      if (!diag) return w.unknown;
      if (!diag.configSchema) return w.diagNoSchema;
      const ns = (diag.namespaces || []).some((name) => name === 'peak-cost' || name === 'dsh-peak-cost');
      return `${diag.configSource || '?'} · ${ns ? w.diagNsOk : w.diagNsMissing}`;
    }

    function settingsText(state, w) {
      const diag = state && state.diagnostics;
      if (!diag) return w.unknown;
      if (diag.settingsWritable === false) return `${w.diagWriteFailed}: ${diag.settingsError || '?'}`;
      return w.diagOk;
    }

    function Details({ state, w, currency, pos, onRecheck }) {
      const known = state && (state.phase === 'peak' || state.phase === 'off-peak');
      const offPeak = known && state.phase !== 'peak';
      const cost = state && state.cost ? state.cost : null;
      const totals = cost ? cost.totals : null;

      return h(
        'div',
        { style: { ...PANEL_STYLE, ...(pos || {}) }, role: 'dialog', 'aria-label': w.session },
        h(
          'div',
          { style: ROW_STYLE },
          h(
            'span',
            { style: { fontWeight: 500 } },
            known ? (offPeak ? w.offPeak : w.peak) : w.unknown,
          ),
          known ? h('span', { style: MUTED }, `${w.until} ${localTime(state.nextChangeAt, w)}`) : null,
        ),
        h(
          'div',
          { style: { ...ROW_STYLE, ...MUTED } },
          h('span', null, w.session),
          h('span', null, cost ? `${cost.requests} ${plural(cost.requests, w.requests, w)}` : '—'),
        ),
        totals
          ? h(
              'div',
              { style: { ...ROW_STYLE, marginTop: '4px', fontSize: '15px', lineHeight: '20px' } },
              h('span', { title: w.estimate }, `≈ ${formatMoney(totals[currency], currency, w)}`),
              h('span', { style: { ...MUTED, fontSize: '12px' } }, formatMoney(totals[currency === 'USD' ? 'CNY' : 'USD'], currency === 'USD' ? 'CNY' : 'USD', w)),
            )
          : null,
        cost && cost.subagents && cost.subagents.sessions > 0
          ? h(
              'div',
              { style: { ...ROW_STYLE, ...MUTED, marginTop: '2px' } },
              h('span', null, `${w.subagents}: ${cost.subagents.sessions} ${plural(cost.subagents.sessions, w.sessions, w)}`),
              h('span', null, formatMoney(cost.subagents.totals[currency], currency, w)),
            )
          : null,
        state && state.ledger
          ? h(
              React.Fragment,
              null,
              h('hr', { style: HAIRLINE }),
              ...['today', 'week'].map((period) =>
                h(
                  'div',
                  { key: period, style: ROW_STYLE },
                  h(
                    'span',
                    { style: MUTED },
                    period === 'today' ? w.today : w.week,
                    (state.settings && state.settings.scope === 'all' ? ` · ${w.scopeAll}` : ''),
                  ),
                  h(
                    'span',
                    { style: { display: 'inline-flex', gap: '10px', ...MUTED } },
                    h('span', null, `${state.ledger[period].requests} ${plural(state.ledger[period].requests, w.requests, w)}`),
                    h('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, formatMoney(state.ledger[period].totals[currency], currency, w)),
                  ),
                ),
              ),
            )
          : null,
        cost && cost.web && cost.web.calls > 0
          ? h(
              'div',
              { style: { ...ROW_STYLE, ...MUTED, marginTop: '2px' } },
              h('span', null, `${w.web}: ${cost.web.calls} ${plural(cost.web.calls, w.calls, w)}`),
              h('span', null, formatMoney(cost.web.totals[currency], currency, w)),
            )
          : null,
        cost && cost.byPhase && (cost.byPhase[currency].peak.requests > 0 || cost.byPhase[currency].offPeak.requests > 0)
          ? h(
              React.Fragment,
              null,
              h('hr', { style: HAIRLINE }),
              ...['peak', 'offPeak']
                .filter((phase) => cost.byPhase[currency][phase].requests > 0)
                .map((phase) => {
                  const row = cost.byPhase[currency][phase];
                  return h(
                    'div',
                    { key: phase, style: ROW_STYLE },
                    h('span', null, phase === 'peak' ? w.peak : w.offPeak),
                    h(
                      'span',
                      { style: { display: 'inline-flex', gap: '10px', ...MUTED } },
                      h('span', null, `${row.requests} ${plural(row.requests, w.requests, w)}`),
                      h('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, formatMoney(row.total, currency, w)),
                    ),
                  );
                }),
            )
          : null,
        cost && cost.requests > 0
          ? h(
              React.Fragment,
              null,
              h('hr', { style: HAIRLINE }),
              h(
                'div',
                { style: { ...ROW_STYLE, ...MUTED, fontSize: '11px' } },
                h('span', null, w.rate),
                h('span', null, sign(currency)),
              ),
              ...BUCKETS.map(([key, label]) => {
                const tokens = cost.byBucket[key];
                const amount = cost.byBucketCost[currency][key];
                return h(
                  'div',
                  { key, style: ROW_STYLE },
                  h('span', null, w[label]),
                  h(
                    'span',
                    { style: { display: 'inline-flex', gap: '10px', ...MUTED } },
                    h('span', null, formatTokens(tokens)),
                    h('span', null, formatRate(amount, tokens, currency)),
                    h('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, formatMoney(amount, currency, w)),
                  ),
                );
              }),
              cost.priceVersions && cost.priceVersions.length
                ? h(
                    'div',
                    { style: { ...ROW_STYLE, ...MUTED, marginTop: '8px', fontSize: '11px' } },
                    h('span', null, w.table),
                    h('span', null, cost.priceVersions.join(', ')),
                  )
                : null,
            )
          : null,
        cost && cost.unknownModels && cost.unknownModels.length
          ? h(
              'div',
              { style: { ...MUTED, marginTop: '8px' } },
              `${w.unknownModel}: ${cost.unknownModels.join(', ')}`,
            )
          : null,
        h('hr', { style: HAIRLINE }),
        h(
          'div',
          { style: { ...ROW_STYLE, ...MUTED, fontSize: '11px' } },
          h('span', null, w.diagTitle),
          h(
            'button',
            {
              type: 'button',
              onClick: () => onRecheck && onRecheck(),
              style: {
                background: 'transparent',
                border: 'none',
                padding: 0,
                font: 'inherit',
                color: 'var(--dsw-alias-label-secondary)',
                cursor: 'pointer',
              },
            },
            w.recheck,
          ),
        ),
        diagRow(w.diagHost, hostText(state, w)),
        diagRow(w.diagSchema, schemaText(state, w)),
        diagRow(w.diagSettings, settingsText(state, w)),
        state && state.calendar ? diagRow(w.calendar, `${state.calendar.source} · ${state.calendar.holidays}`) : null,
        state && state.capabilities && state.capabilities.length
          ? h('div', { style: { ...MUTED, marginTop: '4px', fontSize: '11px' } }, `${w.caps}: ${state.capabilities.join(', ')}`)
          : null,
        state && state.missing
          ? h(
              'div',
              { style: { ...MUTED, marginTop: '4px', fontSize: '11px' } },
              state.missing === 'session' ? w.noSession : w.noLog,
            )
          : null,
        cost && cost.web && cost.web.free > 0
          ? h(
              'div',
              { style: { ...MUTED, marginTop: '4px', fontSize: '11px' } },
              `${w.webFree}: ${cost.web.free}`,
            )
          : null,
      );
    }

    const SELECT_STYLE = {
      font: 'inherit',
      color: 'var(--dsw-alias-label-primary)',
      background: 'var(--dsw-alias-bg-module-platform)',
      border: '0.5px solid var(--dsw-alias-border-l2)',
      borderRadius: 'var(--dsw-radius-sm)',
      padding: '2px 6px',
    };

    function SettingsRow({ label, children }) {
      return h(
        'div',
        { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '4px 0' } },
        h('span', { style: { fontSize: '12px' } }, label),
        children,
      );
    }

    function SettingsControls({ w, settings, onWrite }) {
      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column' } },
        h(
          SettingsRow,
          { label: w.currencyLabel },
          h(
            'select',
            {
              style: SELECT_STYLE,
              value: settings.currency,
              onChange: (event) => onWrite({ currency: event.target.value }),
            },
            h('option', { value: 'USD' }, 'USD ($)'),
            h('option', { value: 'CNY' }, 'CNY (¥)'),
          ),
        ),
        h(
          SettingsRow,
          { label: w.langLabel },
          h(
            'select',
            {
              style: SELECT_STYLE,
              value: settings.lang,
              onChange: (event) => onWrite({ lang: event.target.value }),
            },
            h('option', { value: 'auto' }, w.langAuto),
            h('option', { value: 'ru' }, 'Русский'),
            h('option', { value: 'en' }, 'English'),
          ),
        ),
        h(
          SettingsRow,
          { label: w.refreshLabel },
          h(
            'select',
            {
              style: SELECT_STYLE,
              value: settings.refreshMs,
              onChange: (event) => onWrite({ refreshMs: Number(event.target.value) }),
            },
            h('option', { value: 15000 }, `15 ${w.seconds}`),
            h('option', { value: 30000 }, `30 ${w.seconds}`),
            h('option', { value: 60000 }, `60 ${w.seconds}`),
          ),
        ),
        h(
          SettingsRow,
          { label: w.scopeLabel },
          h(
            'select',
            {
              style: SELECT_STYLE,
              value: settings.scope,
              onChange: (event) => onWrite({ scope: event.target.value }),
            },
            h('option', { value: 'workspace' }, w.scopeWorkspace),
            h('option', { value: 'all' }, w.scopeAll),
          ),
        ),
        h(
          SettingsRow,
          { label: w.footerLabel },
          h('input', {
            type: 'checkbox',
            checked: settings.footer,
            onChange: (event) => onWrite({ footer: event.target.checked }),
          }),
        ),
        h(
          SettingsRow,
          { label: w.reminderLabel },
          h('input', {
            type: 'checkbox',
            checked: settings.reminder,
            onChange: (event) => onWrite({ reminder: event.target.checked }),
          }),
        ),
      );
    }

    /** Форма настроек в деталях плагина на странице Plugins. */
    function PluginsConfigForm() {
      const [state, setState] = React.useState(null);
      const w = useWords(state && state.settings ? state.settings.lang : undefined);
      const settings = (state && state.settings) || DEFAULT_SETTINGS;

      React.useEffect(() => {
        let alive = true;
        const load = async () => {
          try {
            const response = await fetch(STATE_URL, { cache: 'no-store' });
            if (!response.ok) throw new Error(String(response.status));
            const data = await response.json();
            if (alive) setState(data);
          } catch {
            // страница покажет значения по умолчанию
          }
        };
        load();
        return () => {
          alive = false;
        };
      }, []);

      const onWrite = async (patch) => {
        setState((prev) => (prev ? { ...prev, settings: { ...(prev.settings || DEFAULT_SETTINGS), ...patch } } : prev));
        try {
          const response = await fetch(STATE_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(patch),
          });
          if (!response.ok) return;
          const data = await response.json();
          if (data && data.settings) setState((prev) => (prev ? { ...prev, settings: data.settings } : prev));
        } catch {
          // значение применится после перезагрузки
        }
      };

      return h('div', { style: { marginTop: '8px' } }, h(SettingsControls, { w, settings, onWrite }));
    }

    // Строка в футере сайдбара: тот же запрос состояния, но компактнее.
    function FooterRow() {
      const [state, setState] = React.useState(null);
      const settings = (state && state.settings) || DEFAULT_SETTINGS;
      const w = useWords(settings.lang);

      React.useEffect(() => {
        if (!settings.footer) return undefined;
        let alive = true;
        const load = async () => {
          try {
            const response = await fetch(STATE_URL, { cache: 'no-store' });
            if (!response.ok) throw new Error(String(response.status));
            const data = await response.json();
            if (alive) setState(data);
          } catch {
            if (alive) setState(null);
          }
        };
        load();
        const timer = setInterval(load, settings.refreshMs);
        return () => {
          alive = false;
          clearInterval(timer);
        };
      }, [settings.footer, settings.refreshMs]);

      if (!settings.footer) return null;
      const known = state && (state.phase === 'peak' || state.phase === 'off-peak');
      const peak = known && state.phase === 'peak';
      return h(
        'span',
        { style: { display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px' } },
        h('span', {
          'aria-hidden': true,
          style: { width: '6px', height: '6px', borderRadius: '50%', background: peak ? COLOURS.peak : COLOURS.offPeak },
        }),
        known ? (peak ? w.footerPeak : w.footerOff) : w.unknown,
      );
    }

    function Pill({ sessionId }) {
      const [state, setState] = React.useState(null);
      const [failed, setFailed] = React.useState(false);
      const [nowMs, setNowMs] = React.useState(() => Date.now());
      const [open, setOpen] = React.useState(false);
      const [notice, setNotice] = React.useState(false);
      const prevPhase = React.useRef(null);
      const settings = (state && state.settings) || DEFAULT_SETTINGS;

      React.useEffect(() => {
        const phase = state && state.phase;
        if (phase !== 'peak' && phase !== 'off-peak') return undefined;
        prevPhase.current = phase;

        if (!settings.reminder || phase !== 'peak') {
          setNotice(false);
          return undefined;
        }

        setNotice(true);
        const hide = setTimeout(() => setNotice(false), 60_000);
        const repeat = setInterval(
          () => {
            setNotice(true);
            setTimeout(() => setNotice(false), 60_000);
          },
          Math.max(1, settings.reminderMinutes ?? 30) * 60_000,
        );

        return () => {
          clearTimeout(hide);
          clearInterval(repeat);
        };
      }, [state && state.phase, settings.reminder, settings.reminderMinutes]);
      const [pos, setPos] = React.useState(null);
      const rootRef = React.useRef(null);
      const panelRef = React.useRef(null);

      const aliveRef = React.useRef(true);
      React.useEffect(
        () => () => {
          aliveRef.current = false;
        },
        [],
      );

      const reload = React.useCallback(async () => {
        const params = new URLSearchParams();
        if (typeof sessionId === 'string' && sessionId !== '') params.set('session', sessionId);
        if (open) params.set('ledger', '1');
        const url = params.toString() === '' ? STATE_URL : `${STATE_URL}?${params.toString()}`;
        try {
          const response = await fetch(url, { cache: 'no-store' });
          if (!response.ok) throw new Error(String(response.status));
          const data = await response.json();
          if (!aliveRef.current) return;
          setState(data);
          setFailed(false);
        } catch {
          if (aliveRef.current) setFailed(true);
        }
      }, [sessionId, open]);

      React.useEffect(() => {
        const onVisible = () => {
          if (document.visibilityState === 'visible') reload();
        };

        reload();
        const refresh = setInterval(reload, settings.refreshMs);
        const clock = setInterval(() => setNowMs(Date.now()), settings.refreshMs);
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onVisible);

        return () => {
          clearInterval(refresh);
          clearInterval(clock);
          document.removeEventListener('visibilitychange', onVisible);
          window.removeEventListener('focus', onVisible);
        };
      }, [reload, settings.refreshMs]);

      React.useEffect(() => {
        if (!open) return;

        const rect = rootRef.current ? rootRef.current.getBoundingClientRect() : null;
        if (rect) {
          setPos({
            right: `${Math.max(8, window.innerWidth - rect.right)}px`,
            bottom: `${Math.round(window.innerHeight - rect.top + 6)}px`,
          });
        }

        const onDown = (event) => {
          const target = event.target;
          if (panelRef.current && panelRef.current.contains(target)) return;
          if (rootRef.current && rootRef.current.contains(target)) return;
          setOpen(false);
        };
        const onKey = (event) => {
          if (event.key === 'Escape') setOpen(false);
        };

        document.addEventListener('pointerdown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
          document.removeEventListener('pointerdown', onDown);
          document.removeEventListener('keydown', onKey);
        };
      }, [open]);

      const w = useWords(settings.lang);
      const known = !failed && state && (state.phase === 'peak' || state.phase === 'off-peak');
      const peak = known && state.phase === 'peak';
      const label = !known ? w.unknown : peak ? w.peak : w.offPeak;
      const colour = !known ? COLOURS.unknown : peak ? COLOURS.peak : COLOURS.offPeak;
      const countdown = known ? formatCountdown(state.nextChangeAt - nowMs, w) : null;
      const money =
        known && state.cost
          ? formatMoney(state.cost.totals[settings.currency], settings.currency, w)
          : null;

      const aria = [label, countdown, money].filter(Boolean).join(', ');



      const panel = h(Details, { state, w, currency: settings.currency, pos, onRecheck: reload });

      return h(
        React.Fragment,
        null,
        h(
          'span',
          { style: ANCHOR_STYLE },
          h(
            'button',
            {
              ref: rootRef,
              type: 'button',
              'data-dsh-peak-cost': 'pill',
              'aria-haspopup': 'dialog',
              'aria-expanded': open,
              'aria-label': aria,
              title: failed ? STATE_URL : undefined,
              onClick: () => setOpen((value) => !value),
              style: PILL_STYLE,
            },
            h('span', { 'aria-hidden': true, style: { ...DOT_STYLE, background: colour } }),
            h('span', null, label),
            notice
              ? h('span', { style: { color: 'var(--dsw-alias-state-warn-primary)' } }, `· ${w.peakStarted}`)
              : null,
            countdown
              ? h(
                  React.Fragment,
                  null,
                  h('span', { 'aria-hidden': true, style: SEP_STYLE }, '·'),
                  h('span', null, countdown),
                )
              : null,
            money
              ? h(
                  React.Fragment,
                  null,
                  h('span', { 'aria-hidden': true, style: SEP_STYLE }, '·'),
                  h('span', null, money),
                )
              : null,
            state?.cost?.unknownModels?.length
              ? h(
                  'span',
                  {
                    title: `${w.unknownModel}: ${state.cost.unknownModels.join(', ')}`,
                    style: { color: 'var(--dsw-alias-state-warn-primary)' },
                  },
                  '?',
                )
              : null,
          ),
        ),
        open
          ? createPortal
            ? createPortal(h('div', { ref: panelRef }, panel), document.body)
            : h('div', { ref: panelRef }, panel)
          : null,
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        try {
          localeFace = ctx.get('locale') ?? null;
        } catch {
          localeFace = null;
        }

        // Каждая регистрация изолирована и на синхронном вызове, и внутри
        // отложенного колбэка: слот может появиться позже или измениться в новой
        // версии хоста, и это не должно утаскивать за собой пилюлю.
        const warn = (error) => {
          if (typeof console !== 'undefined') console.warn('[dsh-peak-cost]', error);
        };

        const mount = (slotName, options, component) => {
          const register = () => {
            try {
              return ctx.slots.register(options, component);
            } catch (error) {
              warn(error);
              return undefined;
            }
          };
          try {
            ctx.slots.inject(slotName, register);
          } catch (error) {
            warn(error);
          }
        };

        mount(
          'conversation.composer.dock',
          { name: 'conversation.composer.dock', id: 'peak-cost', order: 6 },
          Pill,
        );

        // Форма настроек на странице Plugins: keyed-слот по ключу нашей записи.
        mount(
          'plugins.row.config',
          { name: 'plugins.row.config', key: 'peak-cost' },
          PluginsConfigForm,
        );

        mount(
          'plugins.bundle.config',
          { name: 'plugins.bundle.config', key: 'dsh-peak-cost' },
          PluginsConfigForm,
        );

        mount(
          'sidebar.footer.action',
          { name: 'sidebar.footer.action', id: 'peak-cost-footer', order: 50 },
          FooterRow,
        );
      },
    };
  },
});
