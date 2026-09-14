-- ═══════════════════════════════════════════════════
--  PRAGMAS
-- ═══════════════════════════════════════════════════
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ═══════════════════════════════════════════════════
--  SCHEMA MIGRATIONS
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════
--  1. SHARED CATALOG
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    normalized_title TEXT NOT NULL,
    album_name TEXT,                                    -- Denormalized (V1)
    duration_seconds INTEGER NOT NULL,
    year INTEGER,
    in_library INTEGER NOT NULL DEFAULT 0,
    rating TEXT NOT NULL DEFAULT 'INDIFFERENT',          -- LIKE | DISLIKE | INDIFFERENT
    is_available INTEGER NOT NULL DEFAULT 1,
    artist_names_fts TEXT NOT NULL DEFAULT '',           -- Materialized for FTS only
    first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tracks_video_id ON tracks(video_id);
CREATE INDEX IF NOT EXISTS idx_tracks_rating_library ON tracks(rating, in_library);

-- ═══════════════════════════════════════════════════
--  2. ARTISTS (NORMALIZED)
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS artists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_artists_normalized ON artists(normalized_name);

CREATE TABLE IF NOT EXISTS track_artists (
    track_id INTEGER NOT NULL,
    artist_id INTEGER NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(track_id, artist_id),
    FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE,
    FOREIGN KEY(artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

-- ═══════════════════════════════════════════════════
--  3. PLAYLISTS
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,                                -- Remote YTM Playlist ID
    title TEXT NOT NULL,
    description TEXT,
    track_count INTEGER NOT NULL DEFAULT 0,
    owner_name TEXT,
    is_editable INTEGER NOT NULL DEFAULT 1,
    observed_fingerprint_hash TEXT,                     -- Client-computed SHA-256
    observed_fingerprint_at DATETIME,
    local_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════
--  4. PLAYLIST ITEMS (USER PLAYLISTS ONLY — NOT LM)
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS playlist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id TEXT NOT NULL,
    track_id INTEGER NOT NULL,
    remote_item_id TEXT NOT NULL,                       -- setVideoId
    position INTEGER NOT NULL,
    added_at DATETIME,
    FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE,
    UNIQUE(playlist_id, remote_item_id)
);

CREATE INDEX IF NOT EXISTS idx_pi_playlist_position ON playlist_items(playlist_id, position);

-- ═══════════════════════════════════════════════════
--  5. VIRTUAL FOLDERS (LOCAL ONLY, STRICT 1:1)
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,                                -- UUID v4
    parent_id TEXT,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(parent_id) REFERENCES folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS playlist_folders (
    playlist_id TEXT PRIMARY KEY,                       -- 1:1 mapping
    folder_id TEXT NOT NULL,
    FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE CASCADE
);

-- ═══════════════════════════════════════════════════
--  6. SYNC INFRASTRUCTURE
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sync_sessions (
    id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,                                 -- FULL | INCREMENTAL | SINGLE_PLAYLIST
    status TEXT NOT NULL,                               -- PENDING | IN_PROGRESS | COMPLETED | FAILED | PAUSED
    total_playlists INTEGER NOT NULL DEFAULT 0,
    completed_playlists INTEGER NOT NULL DEFAULT 0,
    total_tracks_indexed INTEGER NOT NULL DEFAULT 0,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS sync_checkpoints (
    session_id TEXT NOT NULL,
    resource_type TEXT NOT NULL,                        -- PLAYLIST_LIST | PLAYLIST_ITEMS | LIBRARY_SONGS
    resource_id TEXT NOT NULL,
    state TEXT NOT NULL,                                -- NOT_STARTED | FETCHING | STAGED | COMMITTED | FAILED
    page_index INTEGER NOT NULL DEFAULT 0,
    next_cursor TEXT,
    committed_through_cursor TEXT,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(session_id, resource_type, resource_id),
    FOREIGN KEY(session_id) REFERENCES sync_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sync_staging (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    playlist_id TEXT NOT NULL,
    video_id TEXT NOT NULL,
    title TEXT NOT NULL,
    normalized_title TEXT NOT NULL,
    artist_names TEXT NOT NULL,                         -- JSON array (flat, for staging)
    album_name TEXT,
    duration_seconds INTEGER NOT NULL,
    year INTEGER,
    remote_item_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    added_at DATETIME
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sync_staging_item
    ON sync_staging(session_id, playlist_id, remote_item_id);

-- ═══════════════════════════════════════════════════
--  7. OPERATIONS & AUDIT LOG
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS operations (
    id TEXT PRIMARY KEY,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    target_playlist_id TEXT NOT NULL,
    type TEXT NOT NULL,                                 -- ADD_TRACKS | REMOVE_TRACKS | MOVE_TRACK | DEDUPLICATE
    state TEXT NOT NULL,                                -- MutationState value
    failure_reason TEXT,                                -- MutationFailureReason (nullable)
    failure_message TEXT,
    preconditions TEXT NOT NULL,                        -- JSON: { expectedTrackCount, observedFingerprint }
    intended_changes TEXT NOT NULL,                     -- JSON: MutationIntent[]
    actual_results TEXT,                                -- JSON: RemoteMutationResult
    rollback_intent TEXT,                               -- JSON: RollbackIntent
    FOREIGN KEY(target_playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
);

-- ═══════════════════════════════════════════════════
--  8. FTS5 FULL-TEXT SEARCH INDEX
-- ═══════════════════════════════════════════════════
CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
    title,
    artist_names_fts,
    album_name,
    content='tracks',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS tracks_ai AFTER INSERT ON tracks BEGIN
    INSERT INTO tracks_fts(rowid, title, artist_names_fts, album_name)
    VALUES (new.id, new.title, new.artist_names_fts, new.album_name);
END;

CREATE TRIGGER IF NOT EXISTS tracks_ad AFTER DELETE ON tracks BEGIN
    INSERT INTO tracks_fts(tracks_fts, rowid, title, artist_names_fts, album_name)
    VALUES ('delete', old.id, old.title, old.artist_names_fts, old.album_name);
END;

CREATE TRIGGER IF NOT EXISTS tracks_au AFTER UPDATE ON tracks BEGIN
    INSERT INTO tracks_fts(tracks_fts, rowid, title, artist_names_fts, album_name)
    VALUES ('delete', old.id, old.title, old.artist_names_fts, old.album_name);
    INSERT INTO tracks_fts(rowid, title, artist_names_fts, album_name)
    VALUES (new.id, new.title, new.artist_names_fts, new.album_name);
END;
