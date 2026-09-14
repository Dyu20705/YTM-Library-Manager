import React, { useState } from 'react';
import { UniversalSearchBar } from './components/UniversalSearchBar.js';
import { FolderTree } from './components/FolderTree.js';
import { VirtualTrackTable } from './components/VirtualTrackTable.js';
import { ChangePlanModal } from './components/ChangePlanModal.js';
import { ConflictReviewModal } from './components/ConflictReviewModal.js';
import { DataFreshnessBadge } from './components/DataFreshnessBadge.js';
import { LocalModeBanner } from './components/LocalModeBanner.js';
import { YtmTrack } from '../domain/track.js';
import { Folder } from '../domain/folder.js';
import { PlaylistAggregate } from '../domain/playlist.js';
import { DataFreshness, AppOperatingMode } from '../domain/types.js';
import { ChangePlan } from '../planner/change_planner.js';

// Initial sample data for demonstration / interactive verification
const SAMPLE_TRACKS: YtmTrack[] = [
  {
    id: 1,
    videoId: '9bZkp7q19f0',
    title: '夜に駆ける (Racing into the Night)',
    normalizedTitle: 'racing into the night',
    artists: [{ id: 1, name: 'YOASOBI' }],
    albumName: 'THE BOOK',
    durationSeconds: 261,
    year: 2019,
    isAvailable: true,
    libraryState: { inLibrary: true, rating: 'LIKE', updatedAt: new Date() },
    firstSeenAt: new Date(),
    lastSeenAt: new Date()
  },
  {
    id: 2,
    videoId: 'Qp3b-RXtz4w',
    title: 'Usseewa',
    normalizedTitle: 'usseewa',
    artists: [{ id: 2, name: 'Ado' }],
    albumName: 'Kyogen',
    durationSeconds: 204,
    year: 2020,
    isAvailable: true,
    libraryState: { inLibrary: true, rating: 'LIKE', updatedAt: new Date() },
    firstSeenAt: new Date(),
    lastSeenAt: new Date()
  },
  {
    id: 3,
    videoId: '1tk1pqwrOys',
    title: 'Kaikai Kitan',
    normalizedTitle: 'kaikai kitan',
    artists: [{ id: 3, name: 'Eve' }],
    albumName: 'Kaizin',
    durationSeconds: 220,
    year: 2020,
    isAvailable: true,
    libraryState: { inLibrary: true, rating: 'INDIFFERENT', updatedAt: new Date() },
    firstSeenAt: new Date(),
    lastSeenAt: new Date()
  },
  {
    id: 4,
    videoId: 'D-YDEiaUtcM',
    title: 'Gira Gira',
    normalizedTitle: 'gira gira',
    artists: [{ id: 2, name: 'Ado' }],
    albumName: 'Kyogen',
    durationSeconds: 276,
    year: 2021,
    isAvailable: true,
    libraryState: { inLibrary: false, rating: 'INDIFFERENT', updatedAt: new Date() },
    firstSeenAt: new Date(),
    lastSeenAt: new Date()
  },
  {
    id: 5,
    videoId: 'x8VYWazR5mE',
    title: 'Odoriko',
    normalizedTitle: 'odoriko',
    artists: [{ id: 4, name: 'Vaundy' }],
    albumName: 'strobo',
    durationSeconds: 215,
    year: 2021,
    isAvailable: true,
    libraryState: { inLibrary: true, rating: 'LIKE', updatedAt: new Date() },
    firstSeenAt: new Date(),
    lastSeenAt: new Date()
  }
];

export const App: React.FC = () => {
  const [tracks, setTracks] = useState<YtmTrack[]>(SAMPLE_TRACKS);
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [folders, setFolders] = useState<Folder[]>([
    { id: 'f1', name: 'Languages', parentId: null, position: 0 },
    { id: 'f2', name: 'Contexts', parentId: null, position: 1 }
  ]);
  const [playlists] = useState<PlaylistAggregate[]>([
    { id: 'PL_JPOP', title: 'Japanese Pop', description: 'J-Pop Favorites', trackCount: 3, ownerName: 'User', isEditable: true, localUpdatedAt: new Date() },
    { id: 'PL_WORKOUT', title: 'Workout Energy', description: 'High tempo', trackCount: 15, ownerName: 'User', isEditable: true, localUpdatedAt: new Date() }
  ]);
  const [playlistFolderMap] = useState<Map<string, string>>(
    new Map([['PL_JPOP', 'f1']])
  );
  const [selectedCollection, setSelectedCollection] = useState<{
    type: 'ALL' | 'LIKED' | 'LIBRARY' | 'PLAYLIST';
    id?: string;
  }>({ type: 'ALL' });

  const [activePlan, setActivePlan] = useState<ChangePlan | null>(null);
  const [conflictDiff, setConflictDiff] = useState<{
    isOpen: boolean;
    reason: string;
    diff?: { baseOrder: string[]; currentOrder: string[]; intentDescription: string };
  }>({ isOpen: false, reason: '' });

  const [operatingMode, setOperatingMode] = useState<AppOperatingMode>('FULL');
  const [freshness, setFreshness] = useState<DataFreshness>({
    lastSuccessfulSyncAt: new Date(Date.now() - 1000 * 60 * 2), // 2 min ago
    lastSyncAttemptAt: new Date(Date.now() - 1000 * 60 * 2),
    lastSyncResult: 'SUCCESS',
    source: 'REMOTE_SYNCED'
  });

  // Search filtering
  const handleSearch = (queryString: string) => {
    const q = queryString.trim().toLowerCase();
    if (!q) {
      setTracks(SAMPLE_TRACKS);
      return;
    }

    // Client-side quick filter matching our compiler rules
    const filtered = SAMPLE_TRACKS.filter(t => {
      if (q.includes('artist:ado') && !t.artists.some(a => a.name.toLowerCase().includes('ado'))) return false;
      if (q.includes('liked:true') && t.libraryState.rating !== 'LIKE') return false;
      if (q.includes('liked:false') && t.libraryState.rating === 'LIKE') return false;
      if (q.includes('year:>2020') && (!t.year || t.year <= 2020)) return false;

      // Free text fallback
      const cleanTerm = q.replace(/artist:\S+|liked:\S+|year:\S+|not\s+\S+/gi, '').trim();
      if (cleanTerm) {
        const matchesTitle = t.title.toLowerCase().includes(cleanTerm);
        const matchesArtist = t.artists.some(a => a.name.toLowerCase().includes(cleanTerm));
        return matchesTitle || matchesArtist;
      }
      return true;
    });

    setTracks(filtered);
  };

  const handleToggleSelectTrack = (videoId: string) => {
    const next = new Set(selectedTrackIds);
    if (next.has(videoId)) {
      next.delete(videoId);
    } else {
      next.add(videoId);
    }
    setSelectedTrackIds(next);
  };

  const handleSelectAll = () => {
    setSelectedTrackIds(new Set(tracks.map(t => t.videoId)));
  };

  const handleDeselectAll = () => {
    setSelectedTrackIds(new Set());
  };

  const handleCreateFolder = (name: string) => {
    const newFolder: Folder = {
      id: `f_${Date.now()}`,
      name,
      parentId: null,
      position: folders.length
    };
    setFolders([...folders, newFolder]);
  };

  // Preview mutation plan (ChangePlanner)
  const handleTriggerAddPlan = () => {
    const toAdd = Array.from(selectedTrackIds);
    const plan: ChangePlan = {
      targetPlaylistId: 'PL_WORKOUT',
      beforeTrackCount: 15,
      afterTrackCount: 15 + toAdd.length,
      intents: toAdd.map(v => ({
        action: 'ADD',
        playlistId: 'PL_WORKOUT',
        videoId: v,
        postcondition: { check: 'PRESENT', videoId: v }
      })),
      skippedVideoIds: [],
      summary: {
        addedCount: toAdd.length,
        removedCount: 0,
        movedCount: 0,
        skippedCount: 0
      },
      rollbackIntent: {
        kind: 'UNDO_ADDED',
        targetPlaylistId: 'PL_WORKOUT',
        undoMembership: toAdd.map(v => ({ videoId: v }))
      },
      isApproved: false
    };
    setActivePlan(plan);
  };

  const handleApplyPlan = () => {
    if (activePlan) {
      // Simulate successful mutation execution
      setActivePlan(null);
      setSelectedTrackIds(new Set());
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      {/* Top Header */}
      <header
        style={{
          height: '52px',
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'var(--accent)' }} />
          <h1 style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '-0.2px' }}>
            YTM Library Manager
          </h1>
          <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
            v1.1.2
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <DataFreshnessBadge
            freshness={freshness}
            onTriggerSync={() => {
              setFreshness({ ...freshness, lastSuccessfulSyncAt: new Date() });
            }}
          />

          <button
            onClick={() => setOperatingMode(operatingMode === 'FULL' ? 'LOCAL_ONLY' : 'FULL')}
            style={{
              fontSize: '11px',
              padding: '3px 8px',
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer'
            }}
          >
            Mode: {operatingMode}
          </button>
        </div>
      </header>

      {/* Local Mode Degradation Banner */}
      <LocalModeBanner mode={operatingMode} onConnectAccount={() => setOperatingMode('FULL')} />

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Navigation Tree */}
        <FolderTree
          folders={folders}
          playlists={playlists}
          playlistFolderMap={playlistFolderMap}
          selectedCollection={selectedCollection}
          onSelectCollection={(type, id) => {
            setSelectedCollection({ type, id });
            if (type === 'LIKED') {
              setTracks(SAMPLE_TRACKS.filter(t => t.libraryState.rating === 'LIKE'));
            } else if (type === 'LIBRARY') {
              setTracks(SAMPLE_TRACKS.filter(t => t.libraryState.inLibrary));
            } else {
              setTracks(SAMPLE_TRACKS);
            }
          }}
          onCreateFolder={handleCreateFolder}
        />

        {/* Right Content Area */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px', overflow: 'hidden' }}>
          <UniversalSearchBar onSearch={handleSearch} />

          <VirtualTrackTable
            tracks={tracks}
            selectedTrackIds={selectedTrackIds}
            onToggleSelectTrack={handleToggleSelectTrack}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
            onAddToPlaylist={handleTriggerAddPlan}
            isPlaylistView={selectedCollection.type === 'PLAYLIST'}
          />
        </main>
      </div>

      {/* Change Plan Diff Preview Modal */}
      <ChangePlanModal
        plan={activePlan}
        onApply={handleApplyPlan}
        onCancel={() => setActivePlan(null)}
      />

      {/* Conflict Review Modal */}
      <ConflictReviewModal
        isOpen={conflictDiff.isOpen}
        conflictReason={conflictDiff.reason}
        diff={conflictDiff.diff}
        onCancelRollback={() => setConflictDiff({ isOpen: false, reason: '' })}
        onClose={() => setConflictDiff({ isOpen: false, reason: '' })}
      />
    </div>
  );
};
