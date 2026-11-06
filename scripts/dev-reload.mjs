// Перезагрузка плагина в запущенном Harness через браузер: открыть Plugins,
// выключить и включить строку плагина, дождаться пересборки, обновить страницу.
//
// Зачем: при установке ссылкой (link:) горячая замена хост-модулей не срабатывает —
// путь события канонизируется в реальный, а кэш модулей держит путь через симлинк
// профиля (ADR 0005). Переключение бандла запускает пересборку композиции, и она
// заменяет модули по факту изменённых файлов.
//
// Окружение: CDP_PORT (по умолчанию 9222), PLUGIN_LABEL (по умолчанию "Peak Cost").
import { execFileSync } from 'node:child_process';

const here = new URL('.', import.meta.url).pathname;
const label = process.env.PLUGIN_LABEL ?? 'Peak Cost';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const run = (...args) =>
  execFileSync('node', [`${here}cdp.mjs`, ...args], { encoding: 'utf8' }).trim();

async function openPluginsPage() {
  const clicked = run(
    'eval',
    `(() => {
      const item = [...document.querySelectorAll('a, button, [role=link], [role=button]')]
        .find((el) => (el.textContent || '').trim() === 'Plugins' && el.getBoundingClientRect().x < 280);
      if (!item) return 'no-nav';
      item.click();
      return 'ok';
    })()`,
  );
  if (clicked.includes('no-nav')) throw new Error('не нашёл пункт Plugins в сайдбаре');
}

function findSwitchIndex() {
  const result = run(
    'eval',
    `(() => {
      const switches = [...document.querySelectorAll('[role=switch]')];
      const leaf = [...document.querySelectorAll('*')].find(
        (el) => el.children.length === 0 && (el.textContent || '').trim() === ${JSON.stringify(label)},
      );
      if (!leaf) return -1;
      let node = leaf;
      for (let i = 0; i < 10 && node; i += 1) {
        const found = switches.findIndex((s) => node.contains(s));
        if (found >= 0) return found;
        node = node.parentElement;
      }
      return -1;
    })()`,
  );
  return Number(result);
}

async function main() {
  await openPluginsPage();
  await sleep(2000);

  const index = findSwitchIndex();
  if (!Number.isInteger(index) || index < 0) throw new Error(`переключатель «${label}» не найден`);

  console.log(`переключатель найден: ${index}`);
  run('eval', `document.querySelectorAll('[role=switch]')[${index}].click(); 'off'`);
  await sleep(4000);
  run('eval', `document.querySelectorAll('[role=switch]')[${index}].click(); 'on'`);
  await sleep(6000);
  run('reload');
  await sleep(5000);

  const pill = run(
    'eval',
    `document.querySelector('[data-dsh-peak-cost="pill"]') ? 'pill' : 'no-pill'`,
  );
  console.log('после перезагрузки:', pill);
}

main().catch((error) => {
  console.error('ошибка:', error.message);
  process.exit(1);
});
