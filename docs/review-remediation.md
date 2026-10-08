# Review remediation — 2026-10-08

The local Node/SQLite read-only vertical slice remains under review. The latest remediation addresses static file exposure, provisioning output, membership completeness, bounded qualification reads, sandbox preservation and stable sorting. No real credential or live account was used. Remote mutations remain disabled in HTTP/UI.

| Finding | Final behavior |
| --- | --- |
| Static arbitrary-file/symlink exposure | Serve index and safe hashed assets in the frozen Vite manifest only. Verify manifest and requested canonical paths; reject symlink/junction aliases and sensitive/config/database files. Synthetic exposure regressions pass. |
| Dependency CLI prints auth JSON | Owner-local helper uses direct setup, hidden interactive input, suppressed dependency output, exclusive private file, generic errors, no auth return/argv. Never use the dependency console CLI; Windows real provisioning remains unqualified. |
| Incomplete Library silently clears membership | VERIFIED snapshot + independent count required. Missing/truncated Library or unverified Likes fail without resetting flags. Real pinned Library adapter stays UNVERIFIED because no independent total is available, so full sync cannot report success; per-playlist commits remain possible before failure. |
| Qualification reads entire account | Separate one-worker transport-budgeted sampler: selected playlists only, finite item limits, total request/deadline caps, read-endpoint allowlist, no retry/redirect, verified TLS, stop on errors/challenges, wait for worker closure. No account DB/membership promotion. |
| Browser disables sandbox | Removed insecure flag; cloud Chromium secure startup returns BLOCKED/exit 2. CI runs sandboxed Chrome fixtures on both platforms. Local system fonts avoid external font downloads. |
| Playlist sort overwritten/unstable outer ordering | Default playlist position or explicit requested sort, with deterministic track/occurrence tie-breakers in the outer paginated query. |
| CI/docs claim live verification | All README Tier 2 outcomes NOT_RUN; workflow triggers review branch pushes and main PRs. Independent CI evidence is pending; API access returned 403. |

Local Linux checks: 83 Vitest tests, 13 Python fixtures and 3 process tests pass; strict TypeScript/Vite build passes. Sandboxed browser fixture is BLOCKED, not PASS. Earlier browser evidence used an insecure sandbox flag and does not qualify the current security policy. Actual Windows execution, independent CI, terms/access, identity, real credentials and LIVE-01…07 remain outstanding. See [qualification report](testing/live-qualification-report.md) and [bounded plan](testing/live-readonly-test-plan.md).

The original remediation also replaced sample UI data with SQLite/API, staged exhaustive playlist pages, repaired occurrence-aware reconciliation and conservative mutation outcomes, used consistent WAL backups, sanitized logs, and added offline regressions. Those local checks do not establish live compatibility or production readiness. No OAuth provisioning, approved mutation workflow, desktop release or release artifacts are provided. Do not merge/release or run authentication on the strength of synthetic PASS alone.
