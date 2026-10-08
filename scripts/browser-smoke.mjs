import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { DatabaseConnection } from '../.local/build/src/storage/connection.js';
import { TrackRepository } from '../.local/build/src/storage/repositories/track_repository.js';
import { LibraryApplication } from '../.local/build/src/application/service.js';
import { MockYtmGateway } from '../.local/build/src/gateway/mock_gateway.js';
import { createApplicationServer } from '../.local/build/src/server/http.js';

// Local fixture data only. No credentials, account access, or remote mutations.
const dir = await mkdtemp(path.join(tmpdir(), 'ytm-browser-'));
const connection = new DatabaseConnection({ path: path.join(dir, 'fixture.db'), schemaPath: 'src/storage/schema.sql' });
const app = new LibraryApplication(connection, new MockYtmGateway(), false);
const server = createApplicationServer(app, path.resolve('dist'));
let browser, ws;
try {
  const tracks = new TrackRepository(connection.db);
  app.playlists.upsertPlaylist({ id: 'SMOKE', title: 'Browser smoke fixture', isEditable: false });
  connection.transaction(() => {
    const items = [];
    for (let i = 0; i < 500; i++) {
      const track = tracks.upsert({ videoId: `smoke-${i}`, title: `Boundary Track ${i}`, artistNames: ['Ado'], durationSeconds: 200, year: 2020 });
      items.push({ trackId: track.id, videoId: track.videoId, remoteItemId: `occ-${i}`, position: i });
    }
    items.push({ ...items[0], remoteItemId: 'duplicate-occurrence', position: 500 });
    app.playlists.replaceItems('SMOKE', items);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const appUrl = `http://127.0.0.1:${server.address().port}/`;
  browser = spawn(process.env.YTM_BROWSER ?? 'chromium', [
    '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--disable-breakpad',
    '--remote-debugging-port=0', `--user-data-dir=${dir}/chrome`, 'about:blank'
  ], { stdio: 'ignore', env: { ...process.env, XDG_CACHE_HOME: path.join(dir, 'cache'), XDG_CONFIG_HOME: path.join(dir, 'config') } });
  let spawnError;
  browser.on('error', error => { spawnError = error; });
  let port;
  for (let i = 0; i < 100; i++) {
    if (spawnError) throw spawnError;
    if (browser.exitCode !== null) throw new Error('Chromium exited before startup');
    try { port = (await readFile(path.join(dir, 'chrome/DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!port) throw new Error('Chromium startup timed out');
  const browserUrl = `http://127.0.0.1:${port}`;
  const target = await (await fetch(`${browserUrl}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await once(ws, 'open');
  let nextId = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.id) {
      const p = pending.get(message.id); pending.delete(message.id);
      if (p) message.error ? p.reject(message.error) : p.resolve(message.result);
    }
  });
  function cdp(method, params = {}) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 10000);
      pending.set(id, { resolve: result => { clearTimeout(timer); resolve(result); }, reject: error => { clearTimeout(timer); reject(error); } });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  }
  async function until(expression) {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(`document.body && (${expression})`)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out: ${expression}`);
  }
  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Page.navigate', { url: appUrl });
  await until('document.body.innerText.includes("Boundary Track")');
  assert.equal(await evaluate('document.body.innerText.includes("Never synced")'), true);
  assert.equal(await evaluate('document.body.innerText.includes("Synced just now")'), false);
  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.includes("Browser smoke fixture")).click()');
  await new Promise(resolve => setTimeout(resolve, 200));
  await until('document.body.innerText.includes("Boundary Track 0") && !document.body.innerText.includes("Loading local")');
  assert.equal(await evaluate('document.body.innerText.includes("1–200")'), true);
  assert.ok(await evaluate('document.querySelectorAll("input[type=checkbox]").length < 40'));
  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent === "Next").click()');
  await until('document.body.innerText.includes("201–400")');
  await evaluate(`(() => {
    const input = document.querySelector('input[type=text]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'title:"Boundary Track 0"');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await evaluate('document.querySelector("form").requestSubmit()');
  await until('document.body.innerText.includes("1–2")');
  assert.equal(await evaluate('document.querySelectorAll("input[type=checkbox]").length'), 3);
  await evaluate('document.querySelectorAll("input[type=checkbox]")[1].click()');
  assert.equal(await evaluate('[...document.querySelectorAll("input[type=checkbox]")].filter(i => i.checked).length'), 1);
  assert.equal(await evaluate('document.querySelectorAll("input[type=checkbox]")[2].checked'), false);
  assert.equal(await evaluate('document.body.innerText.includes("Apply")'), false);
  assert.deepEqual(errors, []);
  console.log('Browser smoke passed: SQLite search, 501-occurrence pagination, independent duplicate selection, windowed rendering, truthful freshness, disabled mutations.');
} finally {
  ws?.close();
  if (browser && browser.exitCode === null && !browser.killed) {
    const exited = once(browser, 'exit'); browser.kill(); await exited;
  }
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  connection.close();
  await rm(dir, { recursive: true, force: true });
}
