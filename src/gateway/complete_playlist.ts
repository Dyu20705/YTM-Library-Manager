import { PlaylistPage, RemoteTrackItem } from './interfaces.js';

/** Collect an exhaustive snapshot; never allow a failed/truncated probe to prove absence. */
export async function readCompletePlaylist(
  fetchPage: (cursor?: string) => Promise<PlaylistPage>,
  onPage?: (page: PlaylistPage, offset: number, pageIndex: number) => void
): Promise<RemoteTrackItem[]> {
  const items: RemoteTrackItem[] = [];
  const cursors = new Set<string>();
  const occurrences = new Set<string>();
  let cursor: string | undefined;
  let expected: number | undefined;
  let pageIndex = 0;
  do {
    const page = await fetchPage(cursor);
    if (page.expectedItemCount !== undefined) {
      if (expected !== undefined && expected !== page.expectedItemCount) {
        throw new Error('Playlist changed during pagination');
      }
      expected = page.expectedItemCount;
    }
    for (const item of page.items) {
      if (!item.videoId || typeof item.title !== 'string') {
        throw new Error('Playlist contains an unsupported or incomplete track');
      }
      if (item.remoteItemId) {
        if (occurrences.has(item.remoteItemId)) throw new Error('Duplicate occurrence across pages');
        occurrences.add(item.remoteItemId);
      }
    }
    onPage?.(page, items.length, pageIndex++);
    items.push(...page.items);
    cursor = page.nextCursor;
    if (cursor) {
      if (cursors.has(cursor) || page.items.length === 0) throw new Error('Pagination made no progress');
      cursors.add(cursor);
    }
  } while (cursor);
  if (expected !== undefined && items.length !== expected) throw new Error('Incomplete playlist snapshot');
  return items;
}
