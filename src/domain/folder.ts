export interface Folder {
  id: string; // UUID v4
  parentId: string | null;
  name: string;
  position: number;
}

export interface PlaylistFolderMapping {
  playlistId: string; // strict 1:1 mapping: one playlist belongs to at most one folder
  folderId: string;
}
