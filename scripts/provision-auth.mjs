import { spawn } from 'node:child_process';
// Owner's private interactive terminal only. No credentials in argv or return values.
const python = process.env.YTM_PYTHON_PATH ?? (process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python3');
const child = spawn(python, ['python/provision_browser_auth.py'], { stdio: 'inherit', windowsHide: false });
child.on('error', () => { console.error('Unable to start local provisioning helper.'); process.exitCode = 1; });
child.on('close', code => { process.exitCode = code ?? 1; });
