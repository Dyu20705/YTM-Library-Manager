# YouTube Music (YTM) Library Manager

A local-first YouTube Music library manager with a local Node.js service, SQLite storage, and a React Web UI.

The application currently exposes **read-only account sync, local search, playlist browsing, and local folders**. Remote mutations are disabled in the HTTP API and UI. The gateway and planner contain mutation logic with conservative read-back outcomes, but live-account qualification, an approved mutation execution workflow, desktop packaging, and release artifacts remain outstanding. This is not a release-qualified build.

---

## 🌟 Architecture & Core Principles

- **Local-First SQLite Core:** Fast local search, custom playlist hierarchy/folders, and offline querying backed by SQLite with WAL mode, foreign keys, triggers, and FTS5 full-text indexing.
- **Port & Adapter (Hexagonal):** The core domain is 100% isolated from Google/YouTube APIs. Infrastructure transport uses a dedicated, isolated Python bridge (`ytmusicapi==1.12.2`).
- **Plan-Before-Execute:** All user mutations generate an explicit, inspectable `ChangePlan` (with `SKIP_EXISTING` deduplication policy). No destructive action executes without user review and confirmation.
- **Occurrence Identity & 3-Way Rollback:** Every track occurrence is identified by `setVideoId` (`remoteItemId`), allowing accurate handling of duplicate songs within playlists and conflict-free rollbacks.
- **Secret & Boundary Isolation:** Auth tokens and credentials are never stored in SQLite, ChangePlans, OperationLogs, or error logs. Feedback tokens are kept exclusively in an ephemeral, session-scoped memory cache.

---

## 🛡️ Domain Invariants (INV-001 through INV-023)

The system formally guarantees 23 domain invariants across 5 critical implementation gates:

- **INV-001 & INV-002:** Canonical `tracks.video_id` uniqueness and stable surrogate key mapping across syncs.
- **INV-003, INV-004 & INV-005:** Relational integrity, unique occurrence per playlist, and strict monotonic ordering.
- **INV-006:** All mutations require an approved `ChangePlan`.
- **INV-007:** `UNKNOWN` mutation state transitions require active postcondition reconciliation before retry.
- **INV-008 & INV-009:** Immutability of committed `OperationLog` and rollback intent tracking.
- **INV-010 & INV-011:** Atomic checkpoint commitment with resumable sync staging.
- **INV-013, INV-014 & INV-018:** Complete credential boundary isolation and log sanitization.
- **INV-016:** Instantaneous FTS5 index synchronization via triggers.
- **INV-017:** Session-scoped sync staging uniqueness.

---

## 🔬 Implementation Gates

| Gate | Description | Tier 1 (Automated CI) | Tier 2 (Live Account) |
|---|---|---|---|
| **GATE-01** | Remote API Compatibility (`ytmusicapi==1.12.2`) | Subprocess bridge ping, contract tests, error code mapping | Verified with real `browser.json` / session credentials |
| **GATE-02** | Sync Atomicity, Crash Resilience & FTS Consistency | Simulated power-loss, staging rollback, FTS triggers | Large-library sync verification |
| **GATE-03** | Mutation Outcome Determinism | Planned vs applied outcomes, idempotency, deduplication | Live add/remove/reorder execution |
| **GATE-04** | Reconciliation & 3-Way Conflict Engine | Postcondition probe evaluations, external reordering conflict detection | Live probe reconciliation |
| **GATE-05** | Credential & Storage Boundary Enforcement | Schema inspection, log sanitization, session cache scoping | Process memory audit |

---

## 🔍 Universal Search Query Syntax

The library manager includes a lexer, recursive-descent parser, AST compiler, and parameterized SQL query engine:

- **Field filters:** `artist:"Ado"`, `album:"Kyogen"`, `title:"Usseewa"`
- **Numeric & Range filters:** `year:2020..2024`, `duration:>180`
- **Full-Text Search:** `query terms` compiled to parameterized SQLite FTS5 phrase/prefix matching
- **Sorting:** `sort:dateAdded:desc`, `sort:title:asc`, `sort:duration:desc`

---

## 🚀 Quickstart & Development

### Requirements
- **Node.js:** v24+
- **Python:** 3.12+

### Setup (Linux/macOS)

```bash
npm ci
python3 -m venv .venv
.venv/bin/python -m pip install -r python/requirements.txt
npm run build
npm test
npm run test:bridge
```

### Setup (Windows PowerShell)

```powershell
npm ci
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r python/requirements.txt
npm run build
npm test
npm run test:bridge
```

Virtualenv activation is unnecessary. The gateway selects `.venv/bin/python3` on Unix or `.venv/Scripts/python.exe` on Windows. Windows CI is configured; it has not been run in the current Linux environment.

### Run the local application

```bash
npm run dev
```

This starts the loopback-only Node service on port 5174 and Vite on port 5173, with same-origin `/api` proxying. Restart `npm run dev` after editing backend TypeScript. Vite reloads frontend changes automatically. For a production bundle, run `npm run build` followed by `npm start`; the Node service serves both the API and built UI on port 5174.

The app starts with an empty/local SQLite library, not sample tracks. Previously committed snapshots remain available offline. The default database is `.local/library.db`. `YTM_DB_PATH` overrides its location, `YTM_PYTHON_PATH` overrides the Python executable, and `YTM_PORT` overrides the production service port. Development proxying expects backend port 5174.

### Connect and sync (read-only)

Prepare a browser authentication file using the pinned ytmusicapi browser-auth instructions on your own machine. Keep it outside the repository; never paste credentials into chat or logs. Common auth filenames and `.local/` are ignored by Git, but an arbitrary filename is not automatically protected.

Set the **path**, not the credential contents, before starting the service:

```bash
export YTM_AUTH_FILE=/private/path/browser.json
npm run dev
```

On Windows PowerShell:

```powershell
$env:YTM_AUTH_FILE = 'C:\private\browser.json'
npm run dev
```

The UI enables Sync when the configured file exists; a successful sync verifies account access. Authentication failures display failed status rather than simulated success. Cloud account sync additionally requires environment network access to `music.youtube.com`. OAuth client provisioning is not implemented by this application.

Sync uses the pinned public `get_playlist(limit=None)` API to follow all continuations. The sync engine also supports paginated gateway adapters, stages every page with global positions, and commits each playlist only after exhaustive fetch and completeness checks. A failed page, repeated cursor, duplicate occurrence, missing occurrence identity, or count mismatch leaves the previous playlist snapshot intact. Retrying an incomplete playlist restarts it from page one and clears its old staging. Full sync is atomic per playlist, not across the whole account.

Liked Music (`LM`) and library songs are read separately. Library membership and likes are applied from their respective sources; playlist metadata refreshes do not erase those flags. A playlist with unavailable entries that cannot be identified, or a remote count that changes during fetch, currently fails conservatively rather than committing a partial snapshot. Deleted remote playlists retain their last local snapshots.

Search executes the query compiler against SQLite, including `artist:Ado`, `title:"Usseewa"`, `year:2020..2024`, `duration:>180`, boolean expressions, and `sort:duration:desc`. Browsing uses pages of 200 rows with windowed rendering; duplicate occurrences have independent selection IDs.

### Validation

```bash
npm test                 # includes HTTP/SQLite integration and regression suites
npm run test:invariants
npm run test:gates
npm run test:bridge      # Python public-API snapshot contract tests
npm run build
```

With Chromium installed, the optional browser smoke check uses an isolated fixture database and never contacts YouTube:

```bash
npm run test:browser
```

Set `YTM_BROWSER` to the Chromium executable if it is not named `chromium`. The smoke check exercises the built UI, SQLite search, 501-occurrence browsing, pagination, virtualization, duplicate selection, and truthful freshness. See [the remediation report](docs/review-remediation.md) for validation evidence and the remaining release gates.

An opt-in live harness is available as `npm run test:live:read` after configuring `YTM_AUTH_FILE`. It uses a temporary database, makes read-only remote calls, verifies persisted playlist counts and browsing, and prints aggregate counts without account metadata or tokens. It was not run during remediation. Qualifying large-library behavior on a real account requires at least one playlist over 500 entries; zero such playlists in its report does not qualify that live scenario.

---

## 📄 License

[MIT License](LICENSE) © 2026 YTM Library Manager Contributors
