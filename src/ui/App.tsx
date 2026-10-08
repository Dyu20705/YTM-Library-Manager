import React, { useEffect, useState } from 'react';
import { UniversalSearchBar } from './components/UniversalSearchBar.js';
import { FolderTree } from './components/FolderTree.js';
import { VirtualTrackTable } from './components/VirtualTrackTable.js';
import { DataFreshnessBadge } from './components/DataFreshnessBadge.js';
import { Folder } from '../domain/folder.js';
import { PlaylistAggregate } from '../domain/playlist.js';
import { DataFreshness } from '../domain/types.js';
import { ApplicationStatus, Collection, TrackRow } from '../application/contracts.js';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Request failed');
  return data as T;
}

export const App: React.FC = () => {
  const [tracks, setTracks] = useState<TrackRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [folders, setFolders] = useState<Folder[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistAggregate[]>([]);
  const [folderMap, setFolderMap] = useState<Map<string, string>>(new Map());
  const [collection, setCollection] = useState<{ type: Collection; id?: string }>({ type: 'ALL' });
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ApplicationStatus | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    let lastOutcome = '';
    const refresh = async () => {
      try {
        const next = await request<ApplicationStatus>('/api/status');
        if (!active) return;
        setStatus(next);
        const outcome = JSON.stringify(next.freshness);
        if (!next.syncing && outcome !== lastOutcome) {
          setRevision(v => v + 1);
          if (next.freshness.lastSyncResult === 'FAILED') setError('Sync failed; the last committed local snapshots are retained.');
        }
        lastOutcome = outcome;
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Service unavailable'); }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    void request<{ playlists: PlaylistAggregate[]; folders: Folder[]; playlistFolderMap: Array<[string, string]> }>(
      '/api/playlists', { signal: abort.signal }
    ).then(data => {
      setPlaylists(data.playlists); setFolders(data.folders); setFolderMap(new Map(data.playlistFolderMap));
    }).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [revision]);

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setSelected(new Set());
    setError('');
    const params = new URLSearchParams({ q: query, collection: collection.type, limit: '200', offset: String(offset) });
    if (collection.id) params.set('playlistId', collection.id);
    void request<{ tracks: TrackRow[]; hasMore: boolean }>(`/api/tracks?${params}`, { signal: abort.signal })
      .then(data => { setTracks(data.tracks); setHasMore(data.hasMore); })
      .catch(e => { if (!abort.signal.aborted) { setError(e.message); setTracks([]); setHasMore(false); } })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [query, collection, offset, revision]);

  const sync = async () => {
    try {
      setError('');
      setStatus(await request<ApplicationStatus>('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
      setRevision(v => v + 1);
    } catch (e) { setError(e instanceof Error ? e.message : 'Sync failed'); }
  };
  const freshness: DataFreshness = {
    lastSuccessfulSyncAt: status?.freshness.lastSuccessfulSyncAt ? new Date(status.freshness.lastSuccessfulSyncAt) : null,
    lastSyncAttemptAt: status?.freshness.lastSyncAttemptAt ? new Date(status.freshness.lastSyncAttemptAt) : null,
    lastSyncResult: status?.freshness.lastSyncResult ?? null,
    source: status?.freshness.source ?? 'LOCAL_ONLY'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <header style={{ padding: 16, display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)' }}>
        <h1 style={{ fontSize: 18 }}>YTM Library Manager</h1>
        <DataFreshnessBadge freshness={freshness} isSyncing={status?.syncing} onTriggerSync={status?.connected ? () => void sync() : undefined} />
      </header>
      <div style={{ padding: '8px 16px', color: 'var(--text-secondary)', fontSize: 13 }}>
        {status?.connected ? 'Read-only account sync enabled. Remote mutations are disabled.' : 'Browse your local library offline. To sync, set YTM_AUTH_FILE to your private auth file and restart the service.'}
      </div>
      {error && <div role="alert" style={{ padding: '8px 16px', color: 'var(--danger)' }}>{error}</div>}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <FolderTree folders={folders} playlists={playlists} playlistFolderMap={folderMap} selectedCollection={collection}
          onSelectCollection={(type, id) => { setCollection({ type, id }); setOffset(0); }}
          onCreateFolder={name => {
            void request('/api/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
              .then(() => setRevision(v => v + 1)).catch(e => setError(e.message));
          }} />
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, minWidth: 0 }}>
          <UniversalSearchBar onSearch={q => { setQuery(q); setOffset(0); }} isLoading={loading} />
          {loading && <div role="status">Loading local tracks…</div>}
          <VirtualTrackTable tracks={tracks} selectedTrackIds={selected}
            onToggleSelectTrack={id => setSelected(previous => {
              const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next;
            })}
            onSelectAll={() => setSelected(new Set(tracks.map(t => t.selectionId)))} onDeselectAll={() => setSelected(new Set())}
            isPlaylistView={collection.type === 'PLAYLIST'} />
          <div style={{ display: 'flex', gap: 16, padding: 8 }}>
            <button disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - 200))}>Previous</button>
            <span>{tracks.length ? `${offset + 1}–${offset + tracks.length}` : 'No tracks'}</span>
            <button disabled={loading || !hasMore} onClick={() => setOffset(offset + 200)}>Next</button>
          </div>
        </main>
      </div>
    </div>
  );
};
