import test from 'node:test';
import assert from 'node:assert/strict';

import { selectLedgerSessions } from '../lib/ledger.js';

const WS = '/work/example-project';

function record(id, cwd, origin) {
  return { header: { id, cwd, origin } };
}

test('в леджер попадают только сессии этой рабочей папки', () => {
  const ids = selectLedgerSessions([record('a', WS), record('b', '/other')], WS);
  assert.deepEqual(ids, ['a']);
});

test('форки не попадают в леджер: их токены уже в родителе', () => {
  const ids = selectLedgerSessions([record('a', WS), record('f', WS, 'fork')], WS);
  assert.deepEqual(ids, ['a']);
});

test('сабагент-сессии попадают: это те же деньги', () => {
  const ids = selectLedgerSessions([record('a', WS), record('s', WS, 'subagent')], WS);
  assert.deepEqual(ids, ['a', 's']);
});

test('без cwd леджер не считается, чтобы не суммировать чужие папки', () => {
  assert.deepEqual(selectLedgerSessions([record('a', WS)], undefined), []);
  assert.deepEqual(selectLedgerSessions([record('a', WS)], ''), []);
});

test('записи без заголовка пропускаются', () => {
  const ids = selectLedgerSessions([{ header: null }, record('a', WS)], WS);
  assert.deepEqual(ids, ['a']);
});

test('в режиме «все папки» берутся сессии любой папки, но форки всё равно нет', () => {
  const ids = selectLedgerSessions(
    [record('a', WS), record('b', '/other'), record('f', WS, 'fork')],
    null,
  );
  assert.deepEqual(ids, ['a', 'b']);
});
