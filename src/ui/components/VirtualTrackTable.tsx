import React from 'react';
import { YtmTrack } from '../../domain/track.js';
import { Heart, Check, Trash2, Plus, RefreshCw } from 'lucide-react';

interface VirtualTrackTableProps {
  tracks: YtmTrack[];
  selectedTrackIds: Set<string>;
  onToggleSelectTrack: (videoId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onDeduplicate?: () => void;
  onAddToPlaylist?: () => void;
  onRemoveSelected?: () => void;
  isPlaylistView?: boolean;
}

export const VirtualTrackTable: React.FC<VirtualTrackTableProps> = ({
  tracks,
  selectedTrackIds,
  onToggleSelectTrack,
  onSelectAll,
  onDeselectAll,
  onDeduplicate,
  onAddToPlaylist,
  onRemoveSelected,
  isPlaylistView
}) => {
  const allSelected = tracks.length > 0 && selectedTrackIds.size === tracks.length;

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainder = sec % 60;
    return `${mins}:${remainder.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Action Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {selectedTrackIds.size > 0 ? (
              <strong>{selectedTrackIds.size} selected</strong>
            ) : (
              `${tracks.length} tracks`
            )}
          </span>

          {selectedTrackIds.size > 0 && (
            <button
              onClick={onDeselectAll}
              style={{
                fontSize: '12px',
                background: 'transparent',
                border: 'none',
                color: 'var(--accent)',
                cursor: 'pointer'
              }}
            >
              Clear
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {isPlaylistView && onDeduplicate && (
            <button
              onClick={onDeduplicate}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={14} /> Detect Duplicates
            </button>
          )}

          {selectedTrackIds.size > 0 && onAddToPlaylist && (
            <button
              onClick={onAddToPlaylist}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: 'var(--accent)',
                border: 'none',
                color: '#fff',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: 500
              }}
            >
              <Plus size={14} /> Add to Playlist...
            </button>
          )}

          {selectedTrackIds.size > 0 && isPlaylistView && onRemoveSelected && (
            <button
              onClick={onRemoveSelected}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid var(--danger)',
                color: 'var(--danger)',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              <Trash2 size={14} /> Remove ({selectedTrackIds.size})
            </button>
          )}
        </div>
      </div>

      {/* Table Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '40px 40px 3fr 2fr 2fr 70px 60px 40px',
          padding: '8px 12px',
          borderBottom: '1px solid var(--border-color)',
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          userSelect: 'none'
        }}
      >
        <div>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={e => (e.target.checked ? onSelectAll() : onDeselectAll())}
            style={{ cursor: 'pointer' }}
          />
        </div>
        <div>#</div>
        <div>Title</div>
        <div>Artist</div>
        <div>Album</div>
        <div>Time</div>
        <div>Year</div>
        <div>Status</div>
      </div>

      {/* Table Body (Virtualized or standard list) */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tracks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)', fontSize: '13px' }}>
            No tracks found matching criteria.
          </div>
        ) : (
          tracks.map((track, idx) => {
            const isSelected = selectedTrackIds.has(track.videoId);
            return (
              <div
                key={`${track.videoId}_${idx}`}
                onClick={() => onToggleSelectTrack(track.videoId)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 40px 3fr 2fr 2fr 70px 60px 40px',
                  padding: '10px 12px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                  fontSize: '13px',
                  alignItems: 'center',
                  backgroundColor: isSelected ? 'var(--accent-subtle)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s'
                }}
              >
                <div>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}} // handled by row onClick
                    style={{ cursor: 'pointer' }}
                  />
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{idx + 1}</div>
                <div
                  style={{
                    color: 'var(--text-primary)',
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {track.title}
                </div>
                <div
                  style={{
                    color: 'var(--text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {track.artists.map(a => a.name).join(', ')}
                </div>
                <div
                  style={{
                    color: 'var(--text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {track.albumName || '—'}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                  {formatDuration(track.durationSeconds)}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{track.year || '—'}</div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {track.libraryState.rating === 'LIKE' && <Heart size={14} color="#ef4444" fill="#ef4444" />}
                  {track.libraryState.inLibrary && <Check size={14} color="#10b981" />}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
