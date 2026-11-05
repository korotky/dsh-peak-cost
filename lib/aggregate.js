// Сбор событий, которые входят в стоимость сессии.
//
// Своя сессия учитывается целиком, сабагент-сессии — тоже: это те же деньги.
// Форки не учитываются: их токены уже посчитаны в родительской сессии. Унаследованный
// префикс событий отбрасывается, иначе вложенный сабагент посчитал бы историю родителя.

const SUBAGENT_ORIGIN = 'subagent';

/** События одной сессии без унаследованного префикса. */
async function ownEvents(source, sessionId) {
  const log = await source.readSession(sessionId);
  const events = Array.isArray(log?.events) ? log.events : [];
  const inherited = typeof log?.inheritedEventCount === 'number' ? log.inheritedEventCount : 0;
  return events.slice(Math.max(0, inherited));
}

/** Обойти дерево потомков и собрать id сабагент-сессий. */
export function subagentIdsFrom(trace) {
  const ids = [];
  const walk = (nodes) => {
    for (const node of nodes ?? []) {
      const header = node?.session?.header;
      if (header?.id !== undefined && header.origin === SUBAGENT_ORIGIN) ids.push(header.id);
      walk(node?.descendants);
    }
  };
  walk(trace?.descendants);
  return ids;
}

/**
 * Собрать события, из которых складывается стоимость сессии.
 * @param source - сервис с readSession и, если есть, traceSession
 * @param sessionId - корневая сессия
 * @returns события, число учтённых сабагент-сессий и список отсутствующих возможностей
 */
export async function collectCostEvents(source, sessionId) {
  const capabilities = new Set();
  const rootLog = await source.readSession(sessionId);
  const header = rootLog?.header;
  const events = (rootLog?.events ?? []).slice(Math.max(0, rootLog?.inheritedEventCount ?? 0));

  if (typeof source.traceSession !== 'function') {
    capabilities.add('traceSession');
    return {
      events,
      header,
      subagentSessions: 0,
      subagentEvents: 0,
      subagentEventList: [],
      capabilities,
    };
  }

  let trace;
  try {
    trace = await source.traceSession(sessionId);
  } catch {
    capabilities.add('traceSession');
    return {
      events,
      header,
      subagentSessions: 0,
      subagentEvents: 0,
      subagentEventList: [],
      capabilities,
    };
  }

  const ids = [...new Set(subagentIdsFrom(trace))];
  const subagentEventList = [];
  let subagentSessions = 0;
  let subagentEvents = 0;

  for (const id of ids) {
    try {
      const own = await ownEvents(source, id);
      events.push(...own);
      subagentEventList.push(...own);
      subagentSessions += 1;
      subagentEvents += own.length;
    } catch {
      capabilities.add('childLog');
    }
  }

  return { events, header, subagentSessions, subagentEvents, subagentEventList, capabilities };
}
