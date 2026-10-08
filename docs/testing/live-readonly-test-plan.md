# Kế hoạch bounded live read-only — BLOCKED, chưa được phép chạy

Ngày: 2026-10-08. Target chính: Windows 11 trên máy owner. Không đưa credential lên cloud/CI/agent. Plan không phải approval; không tự chạy sau khi trình plan.

## Trạng thái và gates

B1 hoàn tất: owner chọn Google test account riêng, profile YTM Test đã tạo và chưa đăng nhập. Giữ trạng thái chưa đăng nhập. Các lỗi static serving/provisioning output đã có remediation và synthetic regression, nhưng browser sandbox local BLOCKED; Windows và CI độc lập chưa được xác minh. Ba nguồn công khai trước đó trả 403; owner chưa xác nhận terms/access. Authentication và live vẫn BLOCKED.

Owner cần đọc [YouTube Terms](https://www.youtube.com/t/terms), [Google Terms](https://policies.google.com/terms) và [browser-auth documentation](https://ytmusicapi.readthedocs.io/en/stable/setup/browser.html). Documentation và sở hữu account không thay quyền automated access. Nếu chưa giải quyết được quyền sử dụng, tiếp tục BLOCKED; không bypass challenge/rate limit/access policy.

Trước một approval riêng: A–D phải đạt trên Windows, credential helper/private ACL được kiểm chứng, owner xác minh identity cục bộ và fixture nhỏ qua UI chính thức. Không tự tạo hàng trăm remote records. Không gửi email, IDs riêng tư, headers/cookies/HAR/ảnh credential vào chat.

## Runner hiện tại, khác với full sync

`npm run test:live:read` triển khai đúng thành `node scripts/live-read-smoke.mjs`. Nó không gọi `app.sync()`, không list toàn account, không tạo DB, không promote snapshot/membership. Một Python worker `python/live_qualification.py` dùng chung một `BoundedSession` qua public `requests_session` injection của ytmusicapi 1.12.2. Worker này không spawn children. Node đặt deadline tổng, kill worker khi hết hạn/Ctrl+C và chờ `close` trước khi báo dừng. Các kiểm thử cancellation chạy bằng child giả không có credential; Windows evidence phải xem CI/owner check, không suy diễn từ Linux.

Runtime cần owner-local paths `YTM_AUTH_FILE`, `YTM_LIVE_PLAN_FILE`; `YTM_LIVE_APPROVED=1` chỉ được owner đặt sau approval cho exact scope. Biến này là guard của script, không phải bằng chứng agent được phép chạy hộ. Auth phải absolute, tồn tại và canonical path ngoài checkout; credential/storage checks trong checklist vẫn bắt buộc. Không lưu `.env`, `setx`, cloud settings hay CI secrets.

Private JSON plan do owner giữ trên máy cá nhân, không upload/commit. Schema mẫu (IDs bên dưới chỉ placeholder, không chạy):

```json
{
  "playlists": [{"id": "OWNER_LOCAL_SELECTED_PLAYLIST", "expectedCount": 3}],
  "libraryCount": 2,
  "likesCount": 2,
  "maxRequests": 20,
  "maxItems": 100,
  "deadlineSeconds": 180
}
```

Yêu cầu 1–3 playlist IDs khác nhau, không LM; LM đọc riêng. Counts phải do owner ghi nhận độc lập trên UI trước run, integer 0–maxItems. Budgets explicit, integer 1–ceiling như mẫu; có thể giảm, không tăng vượt ceiling. Agent không nhận private plan. Không có flags tăng scope cho >500 items.

## Remote operations và giới hạn được enforce

| Operation | Scope/giới hạn |
| --- | --- |
| Client initialization | GET `https://music.youtube.com/` nếu dependency cần; tính vào cùng request budget |
| `get_playlist` | Chỉ selected playlists và LM, finite `limit=maxItems+1`; returned items/count phải khớp independent expected, không vượt maxItems |
| `get_library_songs` | Finite `limit=maxItems+1`, `validate_responses=False` để không bật SDK validation retries; returned count phải khớp owner expected |
| HTTP transport | Chỉ POST `/youtubei/v1/browse` và GET `/` tại HTTPS music.youtube.com:443; không mutation endpoints/host khác |

Tối đa 20 outbound HTTP dispatches toàn session, gồm internal pagination và initialization. Chặn request thứ 21 trước gửi, latch stop. TLS verification giữ bật. Không redirect, không HTTPAdapter retries; một lỗi network/status/JSON/challenge dừng cả session. Mỗi request timeout tối đa 10 giây và remaining budget; tổng worker deadline tối đa 180 giây được supervisor enforce cả khi request body bị treo. SDK có thể trả một page nhiều hơn requested limit; runner dừng nếu số items vượt cap, không promote partial data. Transport cap giới hạn requests, không tuyên bố giới hạn byte response.

401/403/429, mọi non-200, redirect, HTML khi POST cần JSON, error/challenge action hoặc lỗi bất thường: dừng, không retry/bypass. Không đọc media/thumbnails và không gọi mutation methods. Raw response/headers/tokens/traceback không xuất khỏi worker; Node không echo arbitrary stdout/stderr.

## Exact preview trước gate E — không chạy lúc này

Sau khi prerequisites đạt, owner xem scope/counts/budgets và đồng ý riêng một lần trên máy cá nhân. Command được review là:

```powershell
npm run test:live:read
```

Agent không chạy command live. Các path/approval env chỉ được owner đặt trong local session sau khi exact plan được approve. Sau run owner Ctrl+C nếu cần, xác minh worker đã đóng, unset approval/path env, thực hiện [cleanup](credential-safety-checklist.md#f--cleanup-và-ứng-phó-lộ-credential). Không auto repeat để đạt PASS.

## Evidence và giới hạn qualification

Output allowlist: `check`, `status=READ_COUNTS_MATCH`, request count, selected playlist counts, Library/Likes counts và booleans `membershipPromoted=false`, `identityVerified=false`, `orderVerified=false`, `mutationsRun=0`. Không in IDs/titles/account/email/auth path. Error output generic; không response body/headers. Count match chỉ là bounded read sample, không live compatibility đầy đủ. Full application sync vẫn fail-closed vì library completeness UNVERIFIED.

| Test ID | Expected | Trạng thái trước owner run |
| --- | --- | --- |
| LIVE-01 | Test identity và auth được xác minh cục bộ | BLOCKED; file presence/runner count không chứng minh identity |
| LIVE-02 | Library/Likes theo expected UI độc lập | BLOCKED; counts chưa chạy, completeness không tự chứng minh từ độ dài |
| LIVE-03 | EMPTY/SMALL/DUP count, order, identity | BLOCKED; runner check count/occurrence nhưng không đối chiếu order UI |
| LIVE-04 | Playlist >500 đầy đủ | NOT_RUN; ngoài bounded small plan, cần plan riêng với fixture sẵn có |
| LIVE-05 | Persist/restart service | BLOCKED; bounded runner không ghi DB |
| LIVE-06 | Late-page failure giữ snapshot | Offline regression PASS; live NOT_RUN |
| LIVE-07 | UI/search/freshness trên snapshot live | BLOCKED; browser sandbox local BLOCKED và chưa snapshot live |

Report chỉ ghi counts/booleans/status, exit/duration/budget nếu được kiểm chứng. Không chuyển mock/synthetic/local PASS thành live/Windows/CI PASS.
