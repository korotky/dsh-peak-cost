// Сборка артефакта для распространения: пакуем npm-tarball в dist/ и проверяем,
// что в него попали все файлы, без которых плагин не запустится.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');

const REQUIRED = [
  'index.js',
  'client.js',
  'cordis.patch.yml',
  'icon.svg',
  'locale/en.json',
  'locale/ru.json',
  'lib/aggregate.js',
  'lib/calendar.js',
  'lib/cost.js',
  'lib/holidays.js',
  'lib/holiday-source.js',
  'lib/ledger.js',
  'lib/periods.js',
  'lib/prices.js',
  'lib/webcalls.js',
];

const FORBIDDEN = [/^test\//, /^docs\//, /^scripts\//, /\.tgz$/, /^CONTEXT\.md$/];

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// Кэш npm — во временном каталоге: dist должен содержать только артефакт.
const cache = mkdtempSync(join(tmpdir(), 'dsh-peak-cost-pack-'));
const output = execFileSync(
  'npm',
  ['pack', '--json', '--pack-destination', dist, '--cache', cache],
  {
    cwd: root,
    encoding: 'utf8',
  },
);
rmSync(cache, { recursive: true, force: true });
const [packed] = JSON.parse(output);
const files = packed.files.map((file) => file.path);

const missing = REQUIRED.filter((file) => !files.includes(file));
const leaked = files.filter((file) => FORBIDDEN.some((pattern) => pattern.test(file)));

if (missing.length > 0) {
  console.error('в пакет не попали обязательные файлы:', missing.join(', '));
  process.exit(1);
}
if (leaked.length > 0) {
  console.error('в пакет попали лишние файлы:', leaked.join(', '));
  process.exit(1);
}

const tarball = join(dist, packed.filename);
const hash = createHash('sha256').update(readFileSync(tarball)).digest('hex');
console.log(`собрано: ${packed.filename}`);
console.log(`файлов: ${files.length}, размер: ${packed.size} байт`);
console.log(`sha256: ${hash}`);
console.log(
  `в dist: ${readdirSync(dist)
    .filter((name) => name.endsWith('.tgz'))
    .join(', ')}`,
);
