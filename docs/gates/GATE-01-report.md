# GATE-01 Compatibility & Validation Report

> **Target Version:** `ytmusicapi == 1.12.2`  
> **Environment:** Python 3.12.3, Node.js 24.20.0  
> **Status:** ✅ **PASSED — Pinned for V1 Baseline**  
> **Date:** 2026-09-14  

---

## 1. Version Pinning Verification (P1-4)

- **Candidate Version:** `ytmusicapi==1.12.2` (PyPI release 2026-08-08)
- **Subprocess Bridge Ping:** `{"status": "ok", "version": "1.12.2"}`
- **Conclusion:** Verified and pinned in `python/requirements.txt`.

---

## 2. Tested Operations & Observed Contracts (16 Smoke Operations Matrix)

| # | Operation | Observed Contract / Behavior | Gate Status |
|---|-----------|------------------------------|-------------|
| 1 | Authenticate (browser/session) | Infrastructure credentials loaded without leaking to domain | ✅ Passed |
| 2 | `get_library_playlists` | Returns list with `id`, `title`, `trackCount`, `isEditable` | ✅ Passed |
| 3 | `get_playlist(regularId)` | Items include `setVideoId` (`remoteItemId`) for unique occurrence | ✅ Passed |
| 4 | `get_playlist("LM")` | Items **lack** `setVideoId` (P0-A contract exception) | ✅ Passed |
| 5 | `get_library_songs()` | Items include `feedbackTokens` (`add`, `remove`) | ✅ Passed |
| 6 | `get_playlist` pagination | Large playlists segmented via continuation tokens | ✅ Passed |
| 7 | `add_playlist_items(testId, [D])` (new) | Successfully appends track with new `setVideoId` | ✅ Passed |
| 8 | `add_playlist_items(testId, [D])` (dup) | ChangePlanner applies `SKIP_EXISTING` policy before call | ✅ Passed |
| 9 | `remove_playlist_items` | Accepts `{ videoId, setVideoId }` list, removes specific occurrence | ✅ Passed |
| 10 | `rate_song(videoId, 'LIKE')` | Sets like status in tracks table without modifying playlist_items | ✅ Passed |
| 11 | `rate_song(videoId, 'INDIFFERENT')` | Translates "Remove from Liked" without touching playlist_items | ✅ Passed |
| 12 | `edit_song_library_status([addToken])` | Requires opaque `feedbackTokens`, NOT `videoId + boolean` (P0-1) | ✅ Passed |
| 13 | `edit_song_library_status([remToken])` | Successfully removes track using feedbackToken | ✅ Passed |
| 14 | Token Reusability & Expiry | Feedback tokens stored in ephemeral `RemoteObservationCache` | ✅ Passed |
| 15 | Reorder on regular playlist | Compiles domain index to `MoveAnchor` (`BEFORE` or `END`) | ✅ Passed |
| 16 | Reorder on "LM" | Blocked: throws `UNSUPPORTED_OPERATION` | ✅ Passed |

---

## 3. Key Findings & Invariants Enforced

1. **Feedback Tokens Ephemeral Policy (P0-1, INV-018):**
   - Verified that `edit_song_library_status` requires token lists.
   - Domain layer only sends `(videoId, desiredInLibrary)`.
   - Gateway internally queries in-memory `RemoteObservationCache`.
   - Zero feedback tokens written to SQLite, OperationLog, or logs.

2. **Liked Music Identity Exception (P0-A):**
   - Verified Liked Music (`LM`) has no `setVideoId`.
   - Never stored in `playlist_items`; queried exclusively via `tracks.rating = 'LIKE'`.
