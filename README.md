# YouTube Music (YTM) Library Manager

A local-first management, advanced query, and safe mutation layer for YouTube Music. Designed with hexagonal architecture, strict domain invariant verification, and conservative reconciliation policies.

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
- **Full-Text Search:** `query terms` compiled to SQLite FTS5 `NEAR()` and prefix matching
- **Sorting:** `sort:dateAdded:desc`, `sort:title:asc`, `sort:duration:desc`

---

## 🚀 Quickstart & Development

### Requirements
- **Node.js:** v24+
- **Python:** 3.12+

### Setup

```bash
# Clone repository
git clone https://github.com/Dyu20705/YTM-Library-Manager.git
cd YTM-Library-Manager

# Install Node dependencies
npm install

# Setup Python virtual environment & bridge dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install -r python/requirements.txt
```

### Running Tests & Verification

```bash
# Run all vitest suites
npm test

# Run domain invariants suite (INV-001 - INV-023)
npm run test:invariants

# Run gate validation suites (GATE-01 - GATE-05)
npm run test:gates

# Compile TypeScript and Vite production bundle
npm run build
```

---

## 📄 License

[MIT License](LICENSE) © 2026 YTM Library Manager Contributors
