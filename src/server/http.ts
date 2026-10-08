import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { readFileSync, realpathSync } from 'node:fs';
import * as path from 'node:path';
import { LibraryApplication } from '../application/service.js';
import { Collection } from '../application/contracts.js';

export function createApplicationServer(app: LibraryApplication, uiDirectory?: string) {
  // Freeze the build manifest at startup. Never enumerate arbitrary files for serving.
  const assets = new Map<string, string>([['/index.html', 'text/html'], ['/', 'text/html']]);
  const types: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
    '.woff': 'font/woff', '.woff2': 'font/woff2' };
  if (uiDirectory) {
    try {
      const root = realpathSync(uiDirectory);
      const manifestFile = path.join(root, '.vite/manifest.json');
      if (realpathSync(manifestFile) !== manifestFile) throw new Error('Linked manifest rejected');
      const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as
        Record<string, { file?: string; css?: string[]; assets?: string[] }>;
      for (const entry of Object.values(manifest)) {
        for (const name of [entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])]) {
          if (typeof name !== 'string' || !/^assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(name)) continue;
          if (/(?:browser|oauth|credential|secret|config|database)/i.test(name)) continue;
          const type = types[path.extname(name)];
          if (type) assets.set(`/${name}`, type);
        }
      }
    } catch { /* Missing or invalid build manifest: index only; fail closed for assets. */ }
  }
  const send = (res: ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(value));
  };
  const body = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
    let text = '';
    for await (const chunk of req) {
      text += chunk.toString();
      if (text.length > 8192) throw new Error('Request body too large');
    }
    return JSON.parse(text || '{}');
  };
  return createServer(async (req, res) => {
    try {
      const host = req.headers.host;
      if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) { send(res, 403, { error: 'Loopback host required' }); return; }
      const url = new URL(req.url ?? '/', `http://${host}`);
      // Same-origin requests only: no CORS, no remote origins, no DNS rebinding hosts.
      const origin = req.headers.origin;
      if ((origin && origin !== `http://${host}`) || req.headers['sec-fetch-site'] === 'cross-site') {
        send(res, 403, { error: 'Cross-origin request rejected' }); return;
      }
      if (req.method === 'POST' && !req.headers['content-type']?.startsWith('application/json')) {
        send(res, 415, { error: 'JSON content type required' }); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/status') send(res, 200, app.status());
      else if (req.method === 'GET' && url.pathname === '/api/playlists') {
        send(res, 200, { playlists: app.playlists.listPlaylists(), folders: app.folders.listFolders(),
          playlistFolderMap: app.playlists.listPlaylists().flatMap(p => {
            const folder = app.folders.getFolderForPlaylist(p.id); return folder ? [[p.id, folder]] : [];
          }) });
      } else if (req.method === 'GET' && url.pathname === '/api/tracks') {
        const collection = url.searchParams.get('collection') ?? 'ALL';
        const limit = Number(url.searchParams.get('limit') ?? 200);
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const query = url.searchParams.get('q') ?? '';
        if (!['ALL', 'LIKED', 'LIBRARY', 'PLAYLIST'].includes(collection) ||
          !Number.isInteger(limit) || limit < 1 || limit > 500 || !Number.isInteger(offset) || offset < 0 || query.length > 4096) {
          send(res, 400, { error: 'Invalid browse parameters' }); return;
        }
        try { send(res, 200, app.browse(query, collection as Collection, url.searchParams.get('playlistId') ?? undefined, limit, offset)); }
        catch { send(res, 400, { error: 'Invalid search query or playlist' }); }
      } else if (req.method === 'POST' && url.pathname === '/api/sync') {
        if (!app.connected) { send(res, 409, { error: 'Set YTM_AUTH_FILE to your auth file and restart the service' }); return; }
        if (app.status().syncing) { send(res, 409, { error: 'Sync already running' }); return; }
        // Respond promptly; the UI polls persisted status while the task runs.
        void app.sync().catch(() => {});
        send(res, 202, app.status());
      } else if (req.method === 'POST' && url.pathname === '/api/folders') {
        const data = await body(req);
        if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 200) {
          send(res, 400, { error: 'Folder name is required (maximum 200 characters)' }); return;
        }
        send(res, 201, app.folders.createFolder(data.name.trim()));
      } else if (url.pathname.startsWith('/api/')) {
        send(res, 404, { error: 'Endpoint unavailable; remote mutations are disabled' });
      } else if (req.method === 'GET' && uiDirectory) {
        const name = decodeURIComponent(url.pathname);
        const type = assets.get(name);
        if (!type) { send(res, 404, { error: 'File not found' }); return; }
        try {
          const root = await realpath(uiDirectory);
          const file = await realpath(path.resolve(root, `.${name === '/' ? '/index.html' : name}`));
          const relative = path.relative(root, file);
          if (relative.startsWith('..') || path.isAbsolute(relative) ||
            relative.split(path.sep).join('/') !== (name === '/' ? 'index.html' : name.slice(1))) {
            send(res, 403, { error: 'Forbidden' }); return;
          }
          const content = await readFile(file);
          res.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' }); res.end(content);
        } catch { send(res, 404, { error: 'File not found' }); }
      } else send(res, 404, { error: 'Not found' });
    } catch { send(res, 400, { error: 'Request failed' }); }
  });
}
