import { spawn } from 'node:child_process';

// The Python qualification worker never spawns descendants. Wait for close before reporting cancellation.
export function runBoundedProcess(executable, args, input, { deadlineMs, signal, onStarted } = {}) {
  return new Promise((resolve, reject) => {
    if (!Number.isInteger(deadlineMs) || deadlineMs < 1) { reject(new Error('Explicit deadline required')); return; }
    if (signal?.aborted) { reject(new Error('Qualification cancelled')); return; }
    const child = spawn(executable, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    child.once('spawn', () => onStarted?.(child.pid));
    let output = '', stopped = false, failed = false;
    const stop = () => { stopped = true; child.kill('SIGKILL'); };
    const timer = setTimeout(stop, deadlineMs);
    signal?.addEventListener('abort', stop, { once: true });
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.stdout.on('data', chunk => {
      if (output.length + chunk.length > 8192) stop();
      else output += chunk.toString();
    });
    child.on('error', () => { failed = true; });
    child.on('close', code => {
      clearTimeout(timer); signal?.removeEventListener('abort', stop);
      if (stopped || failed || code !== 0) reject(new Error('Qualification stopped; worker closed'));
      else resolve(output);
    });
    child.stdin.end(JSON.stringify(input));
  });
}
