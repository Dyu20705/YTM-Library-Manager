import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { DatabaseConnection } from '../.local/build/src/storage/connection.js';
import { LibraryApplication } from '../.local/build/src/application/service.js';
import { SubprocessYtmGateway } from '../.local/build/src/gateway/ytm_gateway.js';

// Opt-in Tier 2 qualification. All remote calls are read-only; evidence contains counts only.
if (!process.env.YTM_AUTH_FILE || !existsSync(process.env.YTM_AUTH_FILE)) {
  console.error('Set YTM_AUTH_FILE to an existing private browser-auth file before running live read checks.');
  process.exit(1);
}
const dir = await mkdtemp(path.join(tmpdir(), 'ytm-live-read-'));
const connection = new DatabaseConnection({ path: path.join(dir, 'library.db'), schemaPath: 'src/storage/schema.sql' });
try {
  const gateway = new SubprocessYtmGateway({ authFilePath: process.env.YTM_AUTH_FILE, pythonPath: process.env.YTM_PYTHON_PATH });
  const app = new LibraryApplication(connection, gateway, true);
  await app.sync();
  assert.equal(app.status().freshness.lastSyncResult, 'SUCCESS');
  const catalog = app.playlists.listPlaylists();
  let occurrences = 0;
  let largePlaylists = 0;
  for (const playlist of catalog) {
    const items = app.playlists.getPlaylistItems(playlist.id);
    assert.equal(items.length, playlist.trackCount);
    assert.equal(new Set(items.map(i => i.remoteItemId)).size, items.length);
    const first = app.browse('', 'PLAYLIST', playlist.id, 200, 0);
    assert.equal(first.tracks.length, Math.min(200, items.length));
    if (items.length > 500) largePlaylists++;
    occurrences += items.length;
  }
  const library = connection.db.prepare('SELECT COUNT(*) AS count FROM tracks WHERE in_library = 1').get().count;
  const likes = connection.db.prepare("SELECT COUNT(*) AS count FROM tracks WHERE rating = 'LIKE'").get().count;
  console.log(JSON.stringify({ check: 'live-read-only', passed: true, playlists: catalog.length, occurrences, playlistsOver500: largePlaylists,
    librarySongs: library, likedSongs: likes, mutationsRun: 0 }));
} catch {
  console.error('Live read validation failed. Check the auth file, account access, network policy, and remote snapshot completeness. No mutations were run.');
  process.exitCode = 1;
} finally {
  connection.close();
  await rm(dir, { recursive: true, force: true });
}
