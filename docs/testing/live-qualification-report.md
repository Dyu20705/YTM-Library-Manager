# Secure test account & read-only qualification report

Ngày: 2026-10-08 (Asia/Bangkok). Workspace: `/workspace/YTM-Library-Manager`. Local HEAD: `146aacb`; working tree có các thay đổi remediation chưa commit và hướng dẫn testing mới. Môi trường thực chạy Linux, Node 24.19.0, Python 3.12.14, ytmusicapi 1.12.2. Đây không phải evidence Windows 11.

**Quyết định: BLOCKED cho authentication/live qualification.** Các local checks được phép pass, nhưng Phase A phát hiện security failures. Không credential thật được đọc/tạo, không authenticated request, không account creation/login, không remote mutation, không commit/push/release hay thay đổi/publish cloud settings trong lượt này.

## Phase A — Preflight

Output A phân biệt PASS/FAIL/UNKNOWN; UNKNOWN được ánh xạ thành BLOCKED/NOT_RUN trong bảng qualification phía dưới.

| Kiểm tra | Kết quả preflight | Evidence / giới hạn |
| --- | --- | --- |
| Harness chỉ gọi read operations | PASS | `scripts/live-read-smoke.mjs:20`, `src/application/service.ts`, `src/sync/sync_engine.ts`; chỉ playlist list/items và library songs |
| HTTP API không có remote mutation routes | PASS | `src/server/http.ts`; unknown `/api/*` trả 404; regression test kiểm tra `/api/mutations`; local folder creation không là YouTube mutation |
| Auth file không được static serve | FAIL | `src/server/http.ts:69` đọc mọi file có lexical path dưới uiDirectory; không sensitive-file deny/asset allowlist, không realpath containment |
| API không trả session/credential/token | PASS | Status/playlists/track hydration chọn domain fields; synthetic redaction tests pass; không kiểm tra payload live |
| Gateway không đưa secret trong argv | PASS | `src/gateway/ytm_gateway.ts` spawn chỉ script path, payload qua stdin; regression kiểm tra argv rỗng với synthetic token |
| Application errors không echo credential | PASS | Gateway suppress raw stderr/malformed response; bridge trả generic errors; redaction fixtures pass |
| Browser-auth console không lộ output | FAIL | Installed console wrapper `.venv/bin/ytmusicapi:8` gọi `sys.exit(main())`; `ytmusicapi/setup.py:94` trả JSON string. Synthetic return test xác nhận string sẽ đi ra stderr; không actual auth |
| SQLite không có credential fields | PASS | `src/storage/schema.sql`, `tests/gates/gate05_credential_boundary.test.ts`; staging/library upsert chỉ chọn metadata; không dump DB hay đọc auth |
| Backend/Vite bind loopback | PASS | `src/server/main.ts:18`, `vite.config.ts`, `scripts/dev.mjs`; owner không được override sang LAN/tunnel |
| Credential trong tracked workspace | UNKNOWN | Metadata: 0 tracked auth/credential-named files; limited high-confidence scan text: 0 candidate files. Không đọc credential files/values; không quét toàn Git history, untracked/private storage |
| Windows 11 hỗ trợ thực tế | UNKNOWN | Có platform paths, PowerShell hướng dẫn, CI matrix; chưa chạy Windows; không claim PASS |
| Browser test giữ security bật | FAIL | `scripts/browser-smoke.mjs:34` có `--no-sandbox`; không chạy command trong lượt này |
| Live workload/cancellation bounded | FAIL | `limit=None`, không hard cap HTTP requests/selected playlists/deadline chung; chỉ per-bridge 120s; descendant cancellation chưa qualify |

### Security findings đã tái hiện bằng non-secret fixtures

1. Auth filename static exposure: tạo fixture JSON chỉ chứa public test marker trong uiDirectory tạm. GET `/browser.json` → HTTP 200, markerServed=true. Không có credential thực.
2. Symlink escape: symlink `escape.txt` trong uiDirectory tạm tới marker file bên ngoài. GET `/escape.txt` → HTTP 200, markerServed=true. Server/DB/temp directory đã đóng/xóa. `dist` hiện tại có 0 symlink và 0 sensitive-named files; đây là code vulnerability, không phải phát hiện credential bị lộ trên instance.
3. Console auth output: thay `setup()` bằng stub trả chuỗi JSON giả và kiểm tra return/SystemExit của installed entrypoint. `would_print_auth_result_to_stderr=true`, actual_credentials_used=false, auth_file_created=false. Không chạy CLI tạo auth thật.

Theo yêu cầu dừng khi có finding quan trọng, không mở gate authentication. Không sửa source trong lượt L2 advisory + bounded read-only này; đề xuất hardening trong [test plan](live-readonly-test-plan.md).

## Terms/access references

| Nguồn | Actual | Kết luận |
| --- | --- | --- |
| `https://www.youtube.com/t/terms` | Public unauthenticated GET: HTTP 403, curl exit 22 | Không đọc được điều khoản hiện hành |
| `https://policies.google.com/terms` | Public unauthenticated GET: HTTP 403, curl exit 22 | Không đọc được điều khoản hiện hành |
| `https://ytmusicapi.readthedocs.io/en/stable/setup/browser.html` | Public unauthenticated GET: HTTP 403, curl exit 22 | Không đối chiếu được stable docs; đã kiểm tra installed CLI/source bản pin |

Không disable TLS, không đổi proxy/cấu hình access để bypass, không retry các URL đó. Chưa xác định cơ sở cho phép authenticated automation. Owner phải đọc nguồn hiện hành trên máy cá nhân và giải quyết quyền sử dụng trước gate E. Documentation kỹ thuật và sở hữu account riêng không thay quyền/điều khoản dịch vụ.

## Phase D — Local validation mới trong lượt này

Không cung cấp YTM_AUTH_FILE; chỉ kiểm tra tên/presence và nhận kết quả unset. Không dump process environment. Test fixtures/mutation simulations đều cục bộ, không gọi mutation service thật.

| Command/check | Exit code | Evidence đã sanitize | Status |
| --- | --- | --- | --- |
| `npm test` | 0 | 78 tests, 12 files pass; HTTP/SQLite integration, 101/501 occurrence completeness, late-page rollback, duplicate selection, boundary/redaction | PASS |
| `npm run test:bridge` | 0 | 3 Python tests pass; public unlimited snapshot contract, truncated snapshot rejected, nonexistent configured auth rejected | PASS |
| `npm run build` | 0 | Strict TypeScript + Vite build pass, 1592 modules transformed | PASS |
| `npm run test:browser` | — | Not executed: hard-coded --no-sandbox trái mandatory constraint. Historical smoke PASS không qualify task mới | BLOCKED |
| Isolated backend startup/SIGTERM | 0 | Ephemeral port/DB, auth unset; idle server shutdown code=0, signal=null; fixture cleaned | PASS |
| Dev supervisor/in-flight Python shutdown | — | Không có test chứng minh Windows/process-tree cancellation; không stop processes có sẵn của owner | NOT_RUN |
| Limited scan của new local test logs | 0 | 0 high-confidence credential-pattern matches; không load actual auth; heuristic không là bảo đảm toàn diện | PASS |
| Staged filename metadata | 0 | 0 staged files ở thời điểm kiểm tra; không stage/commit | PASS |

Raw credential-free command logs của lượt này lưu tạm ở `/tmp/ytm-qualification-evidence/` (npm-test.log, bridge.log, build.log); report này là summary bền vững. Không upload logs hoặc credential. Test `npm test` được chạy với HTTP(S)/ALL_PROXY trỏ tới loopback không phục vụ để chặn egress qua proxy của HTTP clients; không thay TLS checks. Đây là precaution cho clients dùng proxy, không phải chứng minh chặn mọi raw socket.

## Qualification cases

Trạng thái hợp lệ trong bảng này: PASS, FAIL, BLOCKED, NOT_RUN. Không ghi live PASS khi chưa chạy.

| Test ID | Expected | Actual | Evidence | Status |
| --- | --- | --- | --- | --- |
| PREFLIGHT-STATIC | Auth/sensitive file và outside-webroot symlink bị từ chối | Hai synthetic marker endpoints trả 200 | Fixture probe, `src/server/http.ts:69` | FAIL |
| PREFLIGHT-CLI | Setup không in credential JSON | Installed entrypoint chuyển JSON return tới stderr | Synthetic return probe, installed setup/console source | FAIL |
| LOCAL-01 | UI/API/SQLite/search path hoạt động | HTTP on-disk integration và compiler checks pass | application_http suite trong 78 tests | PASS |
| LOCAL-02 | 501 occurrence sync hoàn chỉnh; lỗi giữ snapshot | Offline completeness/fault tests pass | sync_completeness suite | PASS |
| LOCAL-03 | Duplicate occurrence chọn riêng; bounded rendering | SSR fixture pass | application_http render check | PASS |
| LOCAL-04 | Không remote mutation route/control giả | Source không nối mutation callbacks; unknown API route 404 | UI source + HTTP regression | PASS |
| LOCAL-05 | Freshness không giả lập | Persisted session/unsynced/error checks pass | application_http suite | PASS |
| LOCAL-06 | Browser on-disk fixture với sandbox bật | Command chưa được phép chạy | scripts/browser-smoke.mjs:34 | BLOCKED |
| LOCAL-07 | Backend idle shutdown sạch | Own isolated backend SIGTERM → 0 | Startup/shutdown probe | PASS |
| LOCAL-08 | Full process-tree cancellation, Windows execution | Chưa kiểm chứng | Source review only | NOT_RUN |
| ACCESS-01 | Điều khoản và cơ sở cho phép phù hợp | Public references 403; owner chưa xác nhận | Three public GET attempts | BLOCKED |
| OWNER-01 | Account riêng + profile riêng đúng identity | B1 hoàn tất: owner chọn A, xác nhận profile YTM Test đã tạo và chưa đăng nhập; B2/identity chưa kiểm chứng | Owner confirmation in chat; no credentials supplied | NOT_RUN |
| CREDENTIAL-01 | Private local file, ACL, outside Git/webroot, safe generation | Không credential được cung cấp/tạo/đọc; generation chưa an toàn | Presence-only checks; preflight failures | BLOCKED |
| LIVE-01 | Đúng test account, authentication thành công | Không chạy | Gate A–D/access/owner approval chưa đạt | BLOCKED |
| LIVE-02 | Library và Likes khớp UI official | Không chạy | No authenticated requests | BLOCKED |
| LIVE-03 | Fixture playlist count/order/occurrence đúng | Không chạy | Owner fixture chưa xác nhận | BLOCKED |
| LIVE-04 | Playlist >500 hợp lệ đầy đủ | Chưa có fixture live được xác nhận; offline 501 pass không thay thế | Offline tests only | NOT_RUN |
| LIVE-05 | Snapshot live persist/restart/query | Không chạy | Temp live harness không được execute | BLOCKED |
| LIVE-06 | Local fault injection bảo vệ snapshot | Offline failure safety pass; chưa kết luận trên snapshot live | Late-page failure regression | NOT_RUN |
| LIVE-07 | UI trên data đã sync live, đúng freshness | Không chạy | No live DB/UI verification | BLOCKED |

## Gate tiếp theo và cleanup

B1 đã hoàn tất theo xác nhận của owner: chọn dedicated Google test account, profile YTM Test đã tạo và chưa đăng nhập. Giữ profile chưa đăng nhập; owner đọc ba nguồn điều khoản/hướng dẫn trên máy cá nhân. Chưa có xác nhận terms/access. Xem [hướng dẫn B1](test-account-setup.md#b1--bước-được-mở-chọn-cách-ly-và-tạo-profile-trống).

Chờ xử lý security findings, kiểm chứng browser sandbox/cancellation và Windows, cùng giải quyết terms/access. Sau đó hướng dẫn B2/B3/C theo từng gate; không suy diễn permission live từ việc chuẩn bị account. Owner phải xem exact plan và đồng ý riêng một lần chạy live trên máy cá nhân. Không mang browser auth vào cloud/CI/settings.

Fixture server/DB/process do các probes mới tạo đã được cleanup. Tests local không credential thật; auth environment không được đặt. Không thu hồi account, không xóa remote fixture, không đổi security settings. Mutation vẫn bị khóa trong UI/HTTP API; infrastructure mutation methods vẫn tồn tại và không được gọi live.
