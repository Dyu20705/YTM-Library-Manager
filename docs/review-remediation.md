# Review remediation — 2026-10-08

The application now has a read-only vertical slice: configure a private browser-auth file → exhaustive remote reads → per-playlist atomic SQLite promotion → compiled search → playlist browsing in the Web UI. The HTTP API and UI expose no remote mutations. The local Node service architecture was selected by the owner for this work.

| Review finding | Result |
| --- | --- |
| UI uses sample tracks, hard-coded search, simulated sync/apply | Replaced with the local Node API and SQLite queries. Freshness comes from persisted sync sessions; folders persist locally. Fake Apply and mutation controls were removed. |
| Sync truncates playlists at one page | All cursor pages are staged with global positions; repeated cursors, duplicate occurrences, count mismatches, and missing occurrence IDs prevent promotion. The Python adapter uses the pinned public unlimited snapshot API rather than private renderer parsing. |
| Incomplete resume staging | A failed playlist restarts from its first page with its old staging cleared. Session playlist membership is persisted atomically; counters are derived from committed checkpoints. |
| Gateway claims requested items all succeeded | Playlist mutations use complete remote read-back and reconciliation; only satisfied effects count as applied. Missing/unobservable effects stay UNKNOWN, partial outcomes stay partial, and ratings without a probe stay UNKNOWN. No automatic retry of uncertain mutations. |
| Credentials/tokens in subprocess argv and errors | Payload travels through stdin. Process startup and timeout failures are handled. Raw stderr/malformed responses and remote exception messages are suppressed; structured log fields are sanitized. Common auth filenames and local state are ignored by Git. |
| Wrong rollback anchors and no-op undo | Planner stores occurrence IDs in occurrence anchor fields. Reconciliation implements UNDO_ADDED and UNDO_MOVED, resolves adjacent restore chains against the evolving result, preserves external additions, and conflicts on ambiguous identities/reordering. It returns an occurrence-aware target order; it does not execute remote rollback. |
| Only 100 playlists/library songs; likes conflated with library | Unlimited public API reads; LM is fetched separately. Library flags and likes are updated from independent sources, and metadata-only upserts preserve them. |
| UI cannot select duplicates separately; no virtualization | Selection keys include playlist occurrence identity. Table renders a window of fixed-height rows; server pagination exposes all results in 200-row pages. |
| Unix-only Python path and quickstart | Platform-specific virtualenv executable selection, cross-platform Node startup/test scripts, PowerShell setup, and Linux/Windows CI matrix. Windows execution remains unverified locally. |
| File copy loses SQLite WAL data | Destructive migrations use SQLite VACUUM INTO before the transaction. A regression checks committed WAL data and failed-migration rollback. |
| Token cache session scoping missing | Sync invokes startSession before account reads; the cache resets when the session changes. |
| Unsubstantiated live compatibility report | Historical Tier 2 claims are marked unverified. Added an opt-in read-only live harness; no live account calls were made in this work. |

## Validation evidence

On the current Linux environment with Node 24 and Python 3.12:

- `npm test`: 78 tests passed across 12 files, including the original 49 tests and 29 regression/integration checks.
- `npm run test:bridge`: 3 Python tests passed.
- `npm run build`: strict TypeScript compilation and Vite production build passed.
- `npm run test:browser`: Chromium ran the built application against an isolated on-disk SQLite fixture. Verified 501-occurrence paging, compiled search, independent duplicate selection, bounded rendered rows, truthful never-synced state, and no Apply control.
- `npm run dev -- --port 5175`: both the Node backend and Vite started; proxied API requests and Chromium interaction succeeded.

Fixtures and injected gateway simulations validate failure handling and local integration; they do not establish YouTube Music live compatibility. No release or remote repository update is implied by these local checks.

## Remaining qualification

The environment has no YTM_AUTH_FILE binding. Run `npm run test:live:read` with a securely stored browser-auth file and network access to music.youtube.com, including a real playlist exceeding 500 entries, before claiming live read integration readiness. Browser-auth handling is supported; OAuth client provisioning is not implemented. The pinned ytmusicapi 1.12.2 remains unchanged; upgrading requires authoritative release/changelog review and compatibility qualification.

Unavailable playlist entries without usable IDs or changing remote counts currently fail conservatively and retain the previous snapshot. Full-account sync is atomic per playlist rather than a single account-wide transaction. Deleted remote playlists retain their local snapshots. Token cache state is session scoped and ephemeral.

Mutation qualification still needs an application workflow with stored preview/approval, durable execution logs, conflict review, and live postcondition checks on a disposable test playlist. The repaired gateway and rollback algorithms are building blocks for that workflow, not authorization to enable bulk mutation. Desktop packaging, release artifacts, and actual Windows execution are still separate release gates.
