import React, { useState } from 'react';
import {
  Folder as FolderIcon,
  Music,
  Heart,
  Library,
  ChevronRight,
  ChevronDown,
  Plus,
  ListMusic
} from 'lucide-react';
import { Folder } from '../../domain/folder.js';
import { PlaylistAggregate } from '../../domain/playlist.js';

interface FolderTreeProps {
  folders: Folder[];
  playlists: PlaylistAggregate[];
  playlistFolderMap: Map<string, string>; // playlistId -> folderId
  selectedCollection: { type: 'ALL' | 'LIKED' | 'LIBRARY' | 'PLAYLIST'; id?: string };
  onSelectCollection: (type: 'ALL' | 'LIKED' | 'LIBRARY' | 'PLAYLIST', id?: string) => void;
  onCreateFolder: (name: string) => void;
}

export const FolderTree: React.FC<FolderTreeProps> = ({
  folders,
  playlists,
  playlistFolderMap,
  selectedCollection,
  onSelectCollection,
  onCreateFolder
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const toggleFolder = (folderId: string) => {
    const next = new Set(expandedFolders);
    if (next.has(folderId)) {
      next.delete(folderId);
    } else {
      next.add(folderId);
    }
    setExpandedFolders(next);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim());
      setNewFolderName('');
      setIsCreatingFolder(false);
    }
  };

  return (
    <div
      style={{
        width: '260px',
        backgroundColor: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-color)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none'
      }}
    >
      <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Library Explorer</h2>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
        {/* Core Virtual Collections */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '4px 8px' }}>
            Collections
          </div>

          <button
            onClick={() => onSelectCollection('ALL')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 10px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: selectedCollection.type === 'ALL' ? 'var(--accent-subtle)' : 'transparent',
              color: selectedCollection.type === 'ALL' ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '13px',
              textAlign: 'left'
            }}
          >
            <Music size={16} /> All Tracks
          </button>

          <button
            onClick={() => onSelectCollection('LIKED')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 10px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: selectedCollection.type === 'LIKED' ? 'var(--accent-subtle)' : 'transparent',
              color: selectedCollection.type === 'LIKED' ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '13px',
              textAlign: 'left'
            }}
          >
            <Heart size={16} /> Liked Music
          </button>

          <button
            onClick={() => onSelectCollection('LIBRARY')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 10px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: selectedCollection.type === 'LIBRARY' ? 'var(--accent-subtle)' : 'transparent',
              color: selectedCollection.type === 'LIBRARY' ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '13px',
              textAlign: 'left'
            }}
          >
            <Library size={16} /> Library Songs
          </button>
        </div>

        {/* Local Folders (Strict 1:1) */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Virtual Folders
            </span>
            <button
              onClick={() => setIsCreatingFolder(true)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              title="Add New Folder"
            >
              <Plus size={14} />
            </button>
          </div>

          {isCreatingFolder && (
            <form onSubmit={handleCreateSubmit} style={{ padding: '4px 8px', marginBottom: '8px' }}>
              <input
                type="text"
                autoFocus
                placeholder="Folder name..."
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  fontSize: '12px'
                }}
              />
            </form>
          )}

          {folders.map(folder => {
            const isExpanded = expandedFolders.has(folder.id);
            const folderPlaylists = playlists.filter(p => playlistFolderMap.get(p.id) === folder.id);

            return (
              <div key={folder.id} style={{ marginBottom: '2px' }}>
                <div
                  onClick={() => toggleFolder(folder.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <FolderIcon size={16} color="#3b82f6" />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {folder.name}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{folderPlaylists.length}</span>
                </div>

                {isExpanded && (
                  <div style={{ paddingLeft: '22px' }}>
                    {folderPlaylists.map(pl => (
                      <button
                        key={pl.id}
                        onClick={() => onSelectCollection('PLAYLIST', pl.id)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '5px 8px',
                          borderRadius: '4px',
                          border: 'none',
                          backgroundColor:
                            selectedCollection.type === 'PLAYLIST' && selectedCollection.id === pl.id
                              ? 'var(--accent-subtle)'
                              : 'transparent',
                          color:
                            selectedCollection.type === 'PLAYLIST' && selectedCollection.id === pl.id
                              ? 'var(--accent)'
                              : 'var(--text-secondary)',
                          cursor: 'pointer',
                          fontSize: '12px',
                          textAlign: 'left'
                        }}
                      >
                        <ListMusic size={14} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {pl.title}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Unorganized Playlists */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '4px 8px' }}>
            Unorganized ({playlists.filter(p => !playlistFolderMap.has(p.id) && p.id !== 'LM').length})
          </div>
          {playlists
            .filter(p => !playlistFolderMap.has(p.id) && p.id !== 'LM')
            .map(pl => (
              <button
                key={pl.id}
                onClick={() => onSelectCollection('PLAYLIST', pl.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '5px 8px',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor:
                    selectedCollection.type === 'PLAYLIST' && selectedCollection.id === pl.id
                      ? 'var(--accent-subtle)'
                      : 'transparent',
                  color:
                    selectedCollection.type === 'PLAYLIST' && selectedCollection.id === pl.id
                      ? 'var(--accent)'
                      : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  textAlign: 'left'
                }}
              >
                <ListMusic size={14} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {pl.title}
                </span>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
};
