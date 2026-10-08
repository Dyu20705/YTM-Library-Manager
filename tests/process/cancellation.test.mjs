import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBoundedProcess } from '../../scripts/bounded-process.mjs';

test('total deadline kills the worker and waits until it no longer exists', async () => {
  let pid;
  await assert.rejects(runBoundedProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {}, { deadlineMs: 100, onStarted: value => { pid = value; } }), /worker closed/);
  assert.ok(pid);
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});
test('owner cancellation closes an active worker', async () => {
  const controller = new AbortController();
  const run = runBoundedProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {}, { deadlineMs: 10000, signal: controller.signal });
  setTimeout(() => controller.abort(), 100);
  await assert.rejects(run, /worker closed/);
});
test('pre-cancelled work never starts and malformed worker errors are suppressed', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runBoundedProcess(process.execPath, [], {}, { deadlineMs: 100, signal: controller.signal }), /cancelled/);
  await assert.rejects(runBoundedProcess(process.execPath, ['-e', 'console.error("synthetic-secret"); process.exit(1)'], {}, { deadlineMs: 1000 }), error => !error.message.includes('synthetic-secret'));
});
