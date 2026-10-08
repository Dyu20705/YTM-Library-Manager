import { afterEach, describe, expect, it, vi } from 'vitest';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { DatabaseConnection } from '../../src/storage/connection.js';
import { LibraryApplication } from '../../src/application/service.js';
import { createApplicationServer } from '../../src/server/http.js';
import { MockYtmGateway } from '../../src/gateway/mock_gateway.js';
import { AdaptiveSyncController } from '../../src/sync/policy.js';
import { TrackRepository } from '../../src/storage/repositories/track_repository.js';
import { LogSanitizer } from '../../src/gateway/sanitizer.js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VirtualTrackTable } from '../../src/ui/components/VirtualTrackTable.js';
import { TrackRow } from '../../src/application/contracts.js';

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const clean of cleanup.splice(0).reverse()) await clean(); });
async function setup(connected = true) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ytm-http-')); cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'library.db');
  const connection = new DatabaseConnection({ path: file }); cleanup.push(() => connection.close());
  const gateway = new MockYtmGateway();
  const app = new LibraryApplication(connection, gateway, connected, new AdaptiveSyncController({ currentDelayMs: 0 }));
  const server = createApplicationServer(app);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  cleanup.push(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  return { app, gateway, connection, base, file };
}

describe('Read-only application integration', () => {
  it('syncs through HTTP, persists SQLite, searches real data, and distinguishes duplicate occurrences', async () => {
    const { app, gateway, base, file } = await setup();
    gateway.addExternalItem('PL_JPOP', { videoId: 'v1_ado', remoteItemId: 'duplicate', title: 'Usseewa', artistNames: ['Ado'], durationSeconds: 204, year: 2020 });
    const before = await (await fetch(`${base}/api/status`)).json();
    expect(before.freshness.lastSuccessfulSyncAt).toBeNull();
    const response = await fetch(`${base}/api/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: '{}' });
    expect(response.status).toBe(202);
    await vi.waitFor(() => expect(app.status().syncing).toBe(false));
    expect(app.status().freshness.lastSyncResult).toBe('SUCCESS');
    const data = await (await fetch(`${base}/api/tracks?collection=PLAYLIST&playlistId=PL_JPOP&q=${encodeURIComponent('artist:Ado year:2020..2024')}`)).json();
    expect(data.tracks).toHaveLength(2);
    expect(new Set(data.tracks.map((t: TrackRow) => t.selectionId)).size).toBe(2);
    const reopened = new DatabaseConnection({ path: file });
    try {
      const offline = new LibraryApplication(reopened, new MockYtmGateway(), false);
      expect(offline.status().freshness.lastSuccessfulSyncAt).not.toBeNull();
      expect(offline.browse('title:Usseewa', 'ALL', undefined, 200, 0).tracks).toHaveLength(1);
    } finally { reopened.close(); }
  });

  it('paginates beyond the first 100 tracks and applies real compiler sorting and filters', async () => {
    const { connection, base } = await setup(false);
    const repo = new TrackRepository(connection.db);
    for (let i = 0; i < 501; i++) repo.upsert({ videoId: `v${i}`, title: `Track ${i}`, artistNames: ['Ado'], durationSeconds: i, year: 2020 });
    const first = await (await fetch(`${base}/api/tracks?limit=200&q=${encodeURIComponent('artist:Ado sort:duration:desc')}`)).json();
    expect(first.tracks).toHaveLength(200); expect(first.hasMore).toBe(true);
    expect(first.tracks[0].durationSeconds).toBe(500);
    const last = await (await fetch(`${base}/api/tracks?limit=200&offset=400`)).json();
    expect(last.tracks).toHaveLength(101); expect(last.hasMore).toBe(false);
    expect((await fetch(`${base}/api/tracks?q=${encodeURIComponent('year:banana')}`)).status).toBe(400);
    expect((await fetch(`${base}/api/tracks?q=${encodeURIComponent('"unclosed')}`)).status).toBe(400);
    expect((await fetch(`${base}/api/tracks?q=${encodeURIComponent('Ado ) ignored')}`)).status).toBe(400);
  });

  it('persists local folders, rejects remote mutation routes and cross-origin requests', async () => {
    const { app, base } = await setup(false);
    expect((await fetch(`${base}/api/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(409);
    expect((await fetch(`${base}/api/mutations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(404);
    expect((await fetch(`${base}/api/folders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.example' }, body: '{"name":"Injected"}' })).status).toBe(403);
    expect((await fetch(`${base}/api/folders`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{"name":"Injected"}' })).status).toBe(415);
    expect((await fetch(`${base}/api/folders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: '{"name":"Favorites"}' })).status).toBe(201);
    expect(app.folders.listFolders().map(f => f.name)).toEqual(['Favorites']);
  });

  it('records an authentication/list failure rather than reporting successful freshness', async () => {
    const { app, gateway } = await setup();
    vi.spyOn(gateway, 'getPlaylists').mockRejectedValue(new Error('Cookie: sentinel-secret'));
    await expect(app.sync()).rejects.toThrow();
    expect(app.status().freshness).toMatchObject({ lastSuccessfulSyncAt: null, lastSyncResult: 'FAILED' });
  });
});

it('redacts nested structured tokens', () => {
  const input = JSON.stringify({ feedbackTokens: { add: 'sentinel-secret', remove: 'other-secret' }, nested: [{ authorization: 'auth-secret' }] });
  const output = LogSanitizer.sanitize(input);
  expect(output).not.toContain('sentinel-secret'); expect(output).not.toContain('other-secret'); expect(output).not.toContain('auth-secret');
});

it('renders only visible rows and selects duplicated songs by occurrence', () => {
  const connection = new DatabaseConnection();
  try {
    const track = new TrackRepository(connection.db).upsert({ videoId: 'same', title: 'Same song', artistNames: ['Ado'], durationSeconds: 1 });
    const tracks = Array.from({ length: 1000 }, (_, i) => ({ ...track, selectionId: `occurrence:${i}` }));
    const html = renderToStaticMarkup(createElement(VirtualTrackTable, {
      tracks, selectedTrackIds: new Set(['occurrence:1']), onToggleSelectTrack() {}, onSelectAll() {}, onDeselectAll() {}
    }));
    expect((html.match(/Same song/g) ?? []).length).toBeLessThan(30);
    expect((html.match(/checked=""/g) ?? []).length).toBe(1);
  } finally { connection.close(); }
});
