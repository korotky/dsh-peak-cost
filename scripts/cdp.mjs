// Минимальный CDP-драйвер без зависимостей: Node 24 умеет WebSocket из коробки.
// Использование:
//   node cdp.mjs shot <file.png>
//   node cdp.mjs eval "<js expression>"
//   node cdp.mjs url
const [, , command, ...rest] = process.argv;
// Порт и хост отладочного Chrome можно переопределить окружением.
const PORT = Number(process.env.CDP_PORT ?? 9222);
const HOST = process.env.CDP_HOST ?? '127.0.0.1';

async function pageTarget() {
  const list = await (await fetch(`http://${HOST}:${PORT}/json`)).json();
  const pages = list.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  const app = pages.filter((t) => (t.url || '').includes('3080'));
  return (app.length ? app[app.length - 1] : pages[pages.length - 1]) ?? null;
}

async function withPage(fn) {
  const target = await pageTarget();
  if (!target) throw new Error('нет страницы в 9222');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const messageId = ++id;
      pending.set(messageId, { resolve, reject });
      ws.send(JSON.stringify({ id: messageId, method, params }));
    });

  try {
    await send('Page.enable');
    await send('Runtime.enable');
    return await fn(send);
  } finally {
    ws.close();
  }
}

const commands = {
  async shot() {
    const file = rest[0] ?? 'shot.png';
    const { data } = await withPage((send) => send('Page.captureScreenshot', { format: 'png' }));
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, Buffer.from(data, 'base64'));
    console.log('saved', file);
  },
  async eval() {
    const expression = rest.join(' ');
    const result = await withPage((send) =>
      send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }),
    );
    console.log(JSON.stringify(result.result?.value ?? result, null, 2));
  },
  async click() {
    const text = rest.join(' ');
    const point = await withPage(async (send) => {
      const expr = `(() => {
        const nodes = [...document.querySelectorAll('*')];
        const el = nodes.find((n) => n.children.length === 0 && (n.textContent || '').includes(${JSON.stringify(text)}));
        if (!el) return null;
        let target = el;
        for (let i = 0; i < 4 && target.parentElement; i += 1) target = target.parentElement;
        target.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      })()`;
      const result = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      return result.result?.value ?? null;
    });
    if (!point) throw new Error('элемент не найден: ' + text);
    await withPage(async (send) => {
      await send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: point.x,
        y: point.y,
        button: 'left',
        clickCount: 1,
      });
      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: point.x,
        y: point.y,
        button: 'left',
        clickCount: 1,
      });
    });
    console.log('clicked', JSON.stringify(point));
  },
  async reload() {
    await withPage(async (send) => {
      await send('Page.reload', { ignoreCache: true });
    });
    console.log('reloaded without cache');
  },
  async clickAt() {
    const x = Number(rest[0]);
    const y = Number(rest[1]);
    await withPage(async (send) => {
      await send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x,
        y,
        button: 'left',
        clickCount: 1,
      });
      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x,
        y,
        button: 'left',
        clickCount: 1,
      });
    });
    console.log('clicked at', x, y);
  },
  async url() {
    const target = await pageTarget();
    console.log(target?.url ?? 'нет страницы');
  },
};

const run = commands[command];
if (!run) {
  console.error('команды: shot <file> | eval <js> | url');
  process.exit(1);
}
run().catch((error) => {
  console.error('error:', error.message);
  process.exit(1);
});
