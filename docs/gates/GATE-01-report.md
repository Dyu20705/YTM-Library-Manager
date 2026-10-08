# GATE-01 Compatibility & Validation Report

> **Target Version:** `ytmusicapi == 1.12.2`  
> **Environment:** Python 3.12.3, Node.js 24.20.0  
> **Status:** Tier 1 baseline passed; historical Tier 2 claims below are unverified
> **Date:** 2026-09-14  

> **2026-10-08 correction:** This historical report does not include reproducible evidence for its live-account assertions. Treat every Tier 2 check below as unverified. Current remediation uses public complete-snapshot APIs, stdin transport, and read-back mutation outcomes; see [the current report](../review-remediation.md). No live account operations were performed in this remediation.

---

## 1. Version Pinning & Verification Methodology (P1-4)

- **Candidate Version:** `ytmusicapi==1.12.2` (PyPI release 2026-08-08)
- **Subprocess Bridge Ping:** `{"status": "ok", "version": "1.12.2"}`
- **Test Tier Architecture:**
  - **Tier 1 (Automated Contract & Invariant Tests):** Executed in Vitest CI runner using `SubprocessYtmGateway`, isolated Python bridge process, and `MockYtmGateway` contract simulation. Verified on every git commit.
  - **Tier 2 (Live Network / Account Verification):** Requires active Google account session (`oauth.json` or `browser.json`), verified during live integration testing.

---

## 2. Tested Operations & Observed Contracts (16 Operations Matrix)

| # | Operation | Observed Contract / Behavior | Tier 1 (Automated) | Tier 2 (Live Account) |
|---|-----------|------------------------------|--------------------|------------------------|
| 1 | Authenticate (browser/session) | Infrastructure credentials loaded without leaking to domain | ✅ Mock/Session Stub | Unverified |
| 2 | `get_library_playlists` | Returns list with `id`, `title`, `trackCount`, real `isEditable` | ✅ Unit Contract | Unverified |
| 3 | `get_playlist(regularId)` | Items include `setVideoId` (`remoteItemId`) for unique occurrence | ✅ Unit Contract | Unverified |
| 4 | `get_playlist("LM")` | Items **lack** `setVideoId` (P0-A contract exception) | ✅ Unit Contract | Unverified |
| 5 | `get_library_songs()` | Items include `feedbackTokens` (`add`, `remove`) | ✅ Unit Contract | Unverified |
| 6 | `get_playlist` pagination | Large playlists segmented via continuation tokens (`cursor` & `nextCursor`) | ✅ Slicing & Bridge Parser | Unverified |
| 7 | `add_playlist_items(testId, [D])` (new) | Successfully appends track with new `setVideoId` | ✅ Mutation Outcome | Unverified |
| 8 | `add_playlist_items(testId, [D])` (dup) | ChangePlanner applies `SKIP_EXISTING` policy before call | ✅ Planner Verification | Unverified |
| 9 | `remove_playlist_items` | Accepts `{ videoId, setVideoId }` list, removes specific occurrence | ✅ Mutation Outcome | Unverified |
| 10 | `rate_song(videoId, 'LIKE')` | Sets like status in tracks table without modifying playlist_items | ✅ Mutation Outcome | Unverified |
| 11 | `rate_song(videoId, 'INDIFFERENT')` | Translates "Remove from Liked" without touching playlist_items | ✅ Mutation Outcome | Unverified |
| 12 | `edit_song_library_status([addToken])` | Requires opaque `feedbackTokens`, NOT `videoId + boolean` (P0-1) | ✅ Domain Isolation | Unverified |
| 13 | `edit_song_library_status([remToken])` | Successfully removes track using feedbackToken | ✅ Domain Isolation | Unverified |
| 14 | Token Reusability & Expiry | Feedback tokens stored in ephemeral `RemoteObservationCache` with `sessionId` scoping | ✅ Session Cache Audit | Unverified |
| 15 | Reorder on regular playlist | Compiles domain index to `MoveAnchor` (`BEFORE` or `END`) via native bridge | ✅ Move Anchor Contract | Unverified |
| 16 | Reorder on "LM" | Blocked: throws `UNSUPPORTED_OPERATION` | ✅ Invariant Enforced | Unverified |

---

## 3. Integration-Hardening Pass (P0 Contract Closures)

1. **Pagination Continuation (P0-1):**
   - Implemented `get_playlist_with_pagination` in `python/ytm_bridge.py` utilizing `yt._send_request("browse", {"continuation": cursor})` and `get_continuation_token`.
   - `SubprocessYtmGateway.getPlaylistItems` now forwards `cursor` and returns `nextCursor`.

2. **Native Reordering (P0-2):**
   - Implemented `move_playlist_item` in python bridge calling `yt.edit_playlist(playlistId, moveItem=(itemRemoteId, successorRemoteId) if successorRemoteId else itemRemoteId)`.
   - Reordering Liked Music (`LM`) is explicitly rejected with `UNSUPPORTED_OPERATION`.

3. **Structured Error Normalization (P0-3):**
   - Bridge catches HTTP 401, 403, 429, timeouts, and server errors, normalizing them into typed `RemoteErrorCode` (`RATE_LIMITED`, `AUTH_EXPIRED`, `NETWORK_UNAVAILABLE`, `PERMISSION_DENIED`, `REMOTE_UNAVAILABLE`).
   - `SubprocessYtmGateway.callBridge` constructs typed `RemoteError`.

4. **Occurrence Identity in 3-Way Rollback (P0-4):**
   - `ReconciliationEngine.reconcileRollback` identifies and compares items using occurrence keys (`remoteItemId || videoId`), ensuring duplicate songs within the same playlist are disambiguated without triggering false reordering conflicts.

5. **Session Scoping & Dedicated Token Resolver (P0-5):**
   - `RemoteObservationCache` scopes feedback tokens to `sessionId`, purging on session change or sync.
   - On cache miss, `setLibraryStatus` invokes `resolve_feedback_tokens` via `yt.get_watch_playlist(videoId, limit=1)`.

6. **Real Playlist Editability (P0-6):**
   - Gateway derives `isEditable: !isSystemPlaylist && Boolean(p.owned ?? p.isEditable ?? false)`. Liked Music (`LM`) is strictly non-editable.
