# Kế hoạch live read-only — HOLD, chưa được phép chạy

Ngày: 2026-10-08. Target chính: Windows 11 trên máy cá nhân của owner. Credential không được đưa lên cloud agent, cloud IDE hoặc CI.

**Quyết định hiện tại: BLOCKED.** Phase A có security findings; browser smoke hiện vi phạm yêu cầu sandbox; điều khoản/tài liệu công khai chưa đọc được; owner chưa xác nhận profile/account/fixtures và chưa chấp thuận một lần chạy cụ thể. Plan này không phải approval. [Báo cáo hiện tại](live-qualification-report.md) không có live PASS nào.

## Phân biệt ba loại thao tác

| Loại | Có credential? | Ai thực hiện / gate |
| --- | --- | --- |
| Tests local, mock gateway, SQLite fixture | Không | Agent đã chạy những checks được phép; browser smoke giữ BLOCKED |
| Chuẩn bị browser auth thủ công | Có, chỉ máy owner | Owner; chờ A–D, điều khoản và phương thức output-safe |
| Live authenticated network reads | Có, chỉ máy owner | Một approval riêng cho exact command/scope, không tự thực hiện sau khi trình plan |

Local fixtures không thay thế bằng chứng live. Test account ownership không thay thế quyền automated access. Không chạy `npm run test:live:read` trong agent terminal, không upload auth file để agent chạy hộ.

## Những điều phải sửa/kiểm chứng trước approval

1. Static serving có allowlist build assets, kiểm tra realpath/containment, chặn sensitive files và không theo symlink thoát webroot. Kiểm thử phải dùng non-secret markers, gồm symlink/junction trên Windows.
2. Phương thức browser-auth generation không sử dụng console entry point bị in JSON qua stderr. Return value phải discard, lỗi/input không bị log, file chỉ ghi trong private storage. Không chạy phương thức đó trước khi owner xác nhận điều kiện sử dụng.
3. Browser smoke giữ Chromium sandbox/security bật. Nếu môi trường không hỗ trợ sandbox thì BLOCKED, không thêm `--no-sandbox` hoặc disable security để làm test pass. Profile test phải ephemeral, không có Google session.
4. Thêm giới hạn thực thi live rõ ràng, kiểm chứng bằng fixture offline: danh sách playlist được phép, max item/page/request, deadline toàn run, cancellation dừng cả Python child, và stop ngay khi có lỗi/challenge. Không tự retry.
5. Xác minh identity test cục bộ và expected counts/order do owner ghi trước. `connected=true` hoặc auth file tồn tại không đủ cho LIVE-01.
6. Chạy A–D trên Windows 11. Matrix CI được cấu hình nhưng chưa có evidence Windows ở lượt này. Không đưa auth vào CI để kiểm tra.
7. Owner đọc điều khoản/tài liệu hiện hành và ghi cơ sở cho phép phù hợp. Nếu chưa xác định được, gate vẫn BLOCKED dù tests kỹ thuật pass.

Lượt advisory này không sửa source, không mở mutation controls, không auto commit/push/merge/release/publish.

## Preview exact command hiện có — không chạy

Tại checkout cục bộ trên Windows của owner, script hiện khai báo:

```powershell
npm run test:live:read
```

Nó triển khai thành:

```text
npm run build:server && node scripts/live-read-smoke.mjs
```

Đây là mô tả executable hiện tại, **không phải command đã qualify để chạy live**. Nó đọc mọi playlist của account với `limit=None`, không có playlist allowlist, không có hard cap cho tổng internal requests/items và không có deadline/cancellation toàn run. Không giả định các flag giới hạn chưa tồn tại. Sau hardening phải cập nhật exact command và reviewed scope rồi mới xin approval riêng.

## Remote operations và dữ liệu có thể đọc

Call chain hiện tại: `live-read-smoke.mjs` → `LibraryApplication.sync()` → `SyncEngine.syncAllPlaylists()` → read methods của `SubprocessYtmGateway` → Python adapter.

| Operation | Dữ liệu đọc | Endpoint/ngữ nghĩa |
| --- | --- | --- |
| `get_library_playlists(limit=None)` | Playlist IDs, titles, counts, ownership metadata | YouTube Music browse requests; có continuation |
| `get_playlist(playlistId, limit=None)`, gồm LM | Video metadata, order, setVideoId khi có, library/like flags; phản hồi có thể có ephemeral feedback tokens | Browse playlist và các continuation; không mutation |
| `get_library_songs(limit=None)` | Saved library songs, độc lập với LM | Browse library và các continuation; không mutation |
| Client initialization nếu cần | Website/visitor initialization data | Có thể GET YouTube Music để chuẩn bị client |

Pinned client dùng HTTP POST cho browse-read; POST ở đây không đồng nghĩa remote mutation. Destination dự kiến: **music.youtube.com**, thường `/youtubei/v1/browse`, và website initialization khi client yêu cầu. Không cần tải thumbnails/media hay gọi mutation endpoints cho plan này. Redirect hoặc destination ngoài scope cần review; không mở rộng access tự động.

Bridge/gateway vẫn chứa các method mutation ở infrastructure. Chúng không nằm trong call chain của live harness/HTTP UI hiện tại; không được gọi trực tiếp bằng bridge hoặc script khác. Không bật Add/Remove/Move/Rate/Delete/Bulk/Rollback execution.

## Workload, timeout và cancellation

Hiện tại với P playlists (gồm LM), có khoảng P + 2 bridge calls: một playlist listing, P playlist reads, một library read. Đây **không** phải P + 2 HTTP requests: mỗi operation có thể phân trang nội bộ. `limit=None` không tạo hard workload cap.

Gateway mặc định timeout mỗi subprocess 120 giây và kill child của call đó. Installed requests session có timeout 30 giây/request. Không có deadline chung toàn run; Ctrl+C hiện chưa được qualify để đảm bảo mọi descendant đã dừng. Không coi per-call timeout là bounded live qualification.

Đề xuất scope cho lần nhỏ đầu tiên, phải được owner chấp thuận sau khi runner có khả năng enforce:

- Account test riêng; tối đa 3 playlist đã xác định, thêm LM và library reads cần thiết.
- Tối đa 20 remote HTTP requests, 100 songs/library và 100 occurrence/playlist ở small case; nếu vượt budget, dừng và không promote partial data.
- Deadline toàn run 180 giây; không retry. Giới hạn thật phải ở tầng transport, không chỉ kiểm tra sau khi đã tải hết dữ liệu.
- Cancellation: owner Ctrl+C; runner dừng toàn process tree/children, xác minh không còn listener/Python process do run tạo. Kiểm chứng offline trước khi dùng credential.
- LIVE-04 >500 items có plan/budget riêng dựa trên playlist sẵn có; không tự tăng scope hoặc tạo remote fixture lớn.

Các số trên là **đề xuất tương lai**, chưa được implementation enforce và chưa được owner approve. Exhaustive sync và fixed budget có thể xung đột; khi không đủ budget, giữ snapshot cũ và kết quả BLOCKED/NOT_RUN cho case đó, không ghi PASS cho dữ liệu thiếu.

## Execution gates và test cases

Trình exact command, scopes/operations, dữ liệu đọc, destinations, budgets, timeout/cancellation và report fields cho owner. Chờ owner đồng ý một lần cụ thể trên máy cá nhân. Không suy diễn đồng ý từ việc chuẩn bị account, tạo file hay đọc plan. Agent không chạy live thay owner.

| Test ID | Kiểm chứng yêu cầu | Bằng chứng được phép |
| --- | --- | --- |
| LIVE-01 | Owner xác minh profile/account test đúng; ứng dụng auth thành công | Trạng thái xác nhận identity cục bộ, không email/headers/ảnh |
| LIVE-02 | Library và Likes khớp expected theo UI; không conflation | Expected/actual counts riêng và số overlap |
| LIVE-03 | EMPTY/SMALL/DUPLICATE có count, order, occurrence identity đúng | Nhãn fixture, count và boolean order/uniqueness checks |
| LIVE-04 | Playlist sẵn có >500 đầy đủ, không mất/nhân đôi occurrence | Count, order checks, verified/not verified; không có fixture → NOT_RUN |
| LIVE-05 | Persist → dừng/restart service → query lại đúng DB | Counts trước/sau và trạng thái query; không export account DB |
| LIVE-06 | Local fault injection late-page không promote dữ liệu thiếu | Offline test result, snapshot retention; không gây lỗi lên YouTube |
| LIVE-07 | UI browse/search/freshness đúng trên snapshot đã sync, không mutation controls/routes | Check booleans cục bộ; không chụp màn hình tài khoản/credential |

Runner hiện chỉ in aggregate counts và xóa temp DB trong finally. Nó chưa so sánh UI official, chưa xác minh identity, chưa restart UI service, chưa kiểm tra content/order against expected. `passed:true` hiện có chỉ là các assertion nội bộ, không phải PASS toàn bộ LIVE-01…07. LIVE-05/07 cần thiết kế rõ cách giữ snapshot cục bộ ở private storage và app restart; không tự chạy lại sync để thay bằng chứng persistence.

## Stop conditions và evidence

Gặp 401, 403, 429, CAPTCHA, challenge, account warning hoặc hành vi bất thường: dừng ngay, không retry/bypass, không đổi account né giới hạn. Owner xử lý trực tiếp. Giữ error code và trạng thái đã sanitize; không lưu response body, headers, traceback, tokens hoặc account metadata.

Report chỉ gồm test ID, fixture label không định danh cá nhân, expected/actual counts, order/uniqueness booleans, exit code, duration, budget đã dùng, trạng thái stop/cancel và PASS/FAIL/BLOCKED/NOT_RUN. Không ghi raw requests/responses, browser.json, account ID/email, playlist IDs riêng tư hay credential path cá nhân.

Sau một run, thực hiện [cleanup](credential-safety-checklist.md#f--cleanup-và-ứng-phó-lộ-credential), review kết quả rồi quyết định scope tiếp theo. Không auto repeat để đạt PASS.
