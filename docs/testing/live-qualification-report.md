# Báo cáo qualification sau code review remediation

Ngày: 2026-10-08 (Asia/Bangkok). Nhánh `review/local-service-readonly-qualification`; remediation tiếp nối base `13796df`. Runtime thực kiểm tra Linux, Node 24, Python 3.12, ytmusicapi 1.12.2. Local results không phải GitHub CI/Windows evidence.

**Live/authentication: BLOCKED. Merge readiness: chưa được chứng minh.** Không dùng/tạo/đọc credential thật, không authenticated network run, không remote mutations. Owner xác nhận B1: chọn dedicated test account, profile YTM Test đã tạo và chưa đăng nhập. B2/account identity, access terms và fixture chưa xác nhận.

## Findings và remediation

| Finding | Actual sau remediation | Evidence | Status |
| --- | --- | --- | --- |
| P0 static file exposure | Chỉ index + hashed assets trong Vite manifest; manifest canonical, sensitive extensions/names không allow; request canonical path phải đúng path được allow, chặn links kể cả trỏ nội bộ | application_http.test.ts: fake browser.json/.env/DB/escape.txt trả 404; manifest-listed symlink/asset-directory escape trả 403/404; valid asset/index 200 | PASS |
| P1 credential CLI stderr leak | Không dùng dependency CLI; helper direct setup, hidden owner-local terminal input, suppress output, discard return, exclusive new file, Linux 700/600 và Windows owner ACL guard; generic errors | test_provisioning.py synthetic fixtures; no real auth | PASS |
| P1 Library/Likes completeness | Membership promotion yêu cầu VERIFIED independent expected count; malformed/unverified snapshots fail trước reset. LM thiếu count không promote. Pinned adapter Library UNVERIFIED; full sync FAILED, giữ membership/success freshness cũ | sync_completeness.test.ts missing Library/mismatched count/missing Likes fault injection | PASS |
| P1 bounded live workload | Tách khỏi full sync; 1 Python worker/shared transport, max 20 HTTP requests, 3 selected playlists, 100 items/resource, 180s deadline; no retry/redirect/mutation dispatch; cancellation chờ worker close | test_live_bounds.py; tests/process/cancellation.test.mjs; fake worker PID no longer exists after deadline | PASS |
| P1 browser sandbox disabled | Bỏ insecure flag; secure startup không khả dụng ở cloud → exit 2 BLOCKED, không fallback | npm run test:browser, sandbox giữ bật | BLOCKED |
| P2 sort/paging | Playlist default occurrence position; explicit sort + track/occurrence tie-breakers ở outer query, mọi collection có outer ORDER BY | application_http.test.ts adjacent pages có ties/duplicate occurrences | PASS |
| P2 independent CI/docs | README Tier 2 toàn NOT_RUN; workflow triggers review push + main PR, includes Linux/Windows security/provision/process/browser fixtures | workflow source; GitHub API GraphQL 403; chưa độc lập xác minh run | BLOCKED |

PASS provisioning/bounds là synthetic contract trên Linux, không auth thật hoặc Windows qualification. Original dependency CLI vẫn có nguy cơ output và vẫn bị cấm dùng trực tiếp. Static probes trước remediation từng trả 200 với fake markers; không có bằng chứng credential thật đã lộ. Lượt mới kiểm tra regression sau sửa.

## Local validation

| Test ID | Expected | Actual | Evidence | Status |
| --- | --- | --- | --- | --- |
| LOCAL-01 | TypeScript/SQLite/HTTP/fault tests | 83 tests, 12 files, exit 0 | npm test | PASS |
| LOCAL-02 | Python bridge/provisioning/transport-bound fixtures | 13 tests, exit 0 | npm run test:bridge | PASS |
| LOCAL-03 | Deadline/cancellation/no echoed worker error | 3 tests, exit 0 | npm run test:process | PASS |
| LOCAL-04 | Strict TypeScript + Vite manifest | exit 0 | npm run build | PASS |
| LOCAL-05 | Browser fixture giữ sandbox | startup unavailable, exit 2 | npm run test:browser | BLOCKED |
| CI-01 | Chính remediation HEAD pass Linux/Windows | GraphQL/REST API 403, kể cả explicit sandbox escalation; kết quả chưa kiểm chứng | GitHub API attempts, configured workflow | BLOCKED |
| WINDOWS-01 | Owner-machine ACL/auth/browser/cancellation | Không chạy máy Windows | Linux evidence không thay thế | NOT_RUN |

Offline fixture files chỉ dùng synthetic data, temp storage cleanup; no actual credential input. No debug capture of requests/headers/HAR. Secret filename/high-confidence checks trước push chỉ áp dụng candidate files, không chứng minh toàn Git history/mọi secret absent.

## Access và live gates

Ba public URLs đã thử ở preflight trước: YouTube Terms, Google Terms, stable ytmusicapi browser setup; mỗi URL HTTP 403/curl exit 22. Không bypass/proxy changes, không retry các trang đó trong remediation. Không xác minh được nội dung điều khoản hiện hành. Account ownership/documentation không thay quyền automation; chờ owner đọc trên máy cá nhân và giải quyết access.

| Test ID | Expected | Actual | Evidence | Status |
| --- | --- | --- | --- | --- |
| OWNER-B1 | Dedicated account choice + empty profile | Owner chọn A; YTM Test đã tạo, chưa đăng nhập | Safe owner confirmation | PASS |
| ACCESS-01 | Terms/access được giải quyết | Chưa xác nhận | Public sources 403 ở preflight | BLOCKED |
| LIVE-01 | Đúng identity/auth | Không chạy | Access/Windows/approval gates chưa đạt | BLOCKED |
| LIVE-02 | Library/Likes expected UI | Không chạy | Bounded plan chưa approve/run | BLOCKED |
| LIVE-03 | Small fixture counts/order/occurrence | Không chạy | Owner fixture chưa xác nhận | BLOCKED |
| LIVE-04 | >500 complete playlist | Không có eligible approved scope | Small runner không hỗ trợ >100/resource | NOT_RUN |
| LIVE-05 | Live snapshot persistence/restart | Không chạy | Bounded sampling không ghi DB | BLOCKED |
| LIVE-06 | Late-page fault trên live snapshot | Offline test PASS, live không chạy | Synthetic regression | NOT_RUN |
| LIVE-07 | Live UI/freshness | Không chạy | Sandbox local BLOCKED, no live data | BLOCKED |

## Gate tiếp theo

Giữ profile chưa đăng nhập. Cần independent CI/Windows sandbox + helper/cancellation evidence, giải quyết terms/access, và review completeness limitation trước khi mở authentication. Full sync không được coi là thành công khi upstream library completeness chưa có bằng chứng độc lập; per-playlist checkpoints có thể đã promote trước failure. Không tự bật remote mutations, không merge/release hoặc publish cloud settings. Sau prerequisites, owner xem [exact bounded plan](live-readonly-test-plan.md) và chấp thuận riêng một run trên máy mình; agent không chạy hộ.
