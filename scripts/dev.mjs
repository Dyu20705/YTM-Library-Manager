import { spawn } from 'node:child_process';

// Native Node and direct CLI paths also work on Windows; no Unix shell syntax.
const children = [
  spawn(process.execPath, ['.local/build/src/server/main.js'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--strictPort', ...process.argv.slice(2)], { stdio: 'inherit' })
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', () => stop(1));
  child.on('exit', code => stop(code ?? 1));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
