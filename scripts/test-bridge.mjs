import { spawnSync } from 'node:child_process';
const python = process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python3';
const result = spawnSync(python, ['-m', 'unittest', 'discover', '-s', 'python/tests'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
