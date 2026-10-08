import { readFile, realpath } from 'node:fs/promises';
import * as path from 'node:path';
import { runBoundedProcess } from './bounded-process.mjs';

// Owner-local ONLY, after separate access/authentication/Windows gates and approval.
const controller = new AbortController();
const stop = () => controller.abort();
process.once('SIGINT', stop); process.once('SIGTERM', stop);
try {
  if (process.env.YTM_LIVE_APPROVED !== '1' || !process.env.YTM_AUTH_FILE || !process.env.YTM_LIVE_PLAN_FILE) {
    throw new Error('Owner approval and private local paths required');
  }
  const root = await realpath('.');
  const auth = await realpath(process.env.YTM_AUTH_FILE);
  const relative = path.relative(root, auth);
  if (!path.isAbsolute(process.env.YTM_AUTH_FILE) || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    throw new Error('Auth must be outside checkout');
  }
  const plan = JSON.parse(await readFile(process.env.YTM_LIVE_PLAN_FILE, 'utf8'));
  // Reject invalid deadline before starting the worker; worker validates every other bound before network use.
  if (!Number.isInteger(plan.deadlineSeconds) || plan.deadlineSeconds < 1 || plan.deadlineSeconds > 180) {
    throw new Error('Invalid deadline');
  }
  const python = process.env.YTM_PYTHON_PATH ?? (process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python3');
  const output = await runBoundedProcess(python, ['python/live_qualification.py'], { authFile: auth, plan },
    { deadlineMs: plan.deadlineSeconds * 1000, signal: controller.signal });
  const result = JSON.parse(output);
  const count = value => Number.isInteger(value) && value >= 0 && value <= plan.maxItems;
  if (result.status !== 'READ_COUNTS_MATCH' || !Number.isInteger(result.requests) || result.requests < 0 || result.requests > plan.maxRequests ||
    !Array.isArray(result.playlistCounts) || result.playlistCounts.length !== plan.playlists.length ||
    !result.playlistCounts.every(count) || !count(result.librarySongs) || !count(result.likedSongs)) throw new Error('Qualification stopped');
  // Only explicitly allowed aggregates leave the worker; never echo arbitrary stdout.
  console.log(JSON.stringify({ check: 'bounded-live-read', status: result.status, requests: result.requests,
    playlistCounts: result.playlistCounts, librarySongs: result.librarySongs, likedSongs: result.likedSongs,
    membershipPromoted: false, identityVerified: false, orderVerified: false, mutationsRun: 0 }));
} catch {
  console.error('Bounded read stopped. No full sync or mutations were run; verify scope and gates locally.');
  process.exitCode = 1;
} finally {
  process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
}
