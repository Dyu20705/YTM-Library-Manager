# Chuẩn bị tài khoản thử nghiệm — theo từng gate

Ngày: 2026-10-08. Workspace đã xác định: `/workspace/YTM-Library-Manager`.

**Gate hiện tại: Phase A FAIL; authentication và live qualification BLOCKED.** Chỉ chuẩn bị cách ly tài khoản/browser ở bước B1. Chưa tạo auth file, chưa cấu hình credential, chưa chạy Sync. Xem [báo cáo](live-qualification-report.md). Tài liệu này là hướng dẫn cho owner trên máy cá nhân; không phải lệnh cho cloud agent thực thi.

## B1 — Bước được mở: chọn cách ly và tạo profile trống

Trạng thái owner đã xác nhận: chọn A; profile `YTM Test` đã tạo, chưa đăng nhập. B1 hoàn tất. Giữ profile chưa đăng nhập trong lúc xử lý preflight và terms/access.

| Lựa chọn | Mức cách ly | Quyết định |
| --- | --- | --- |
| A: Google test account riêng | Tách đăng nhập, thư viện và credential khỏi tài khoản chính. Vẫn chịu các điều khoản dịch vụ và rủi ro riêng của tài khoản test. | Ưu tiên. Owner tự tạo theo quy trình Google khi gate B2 được mở. |
| B: YouTube channel/Brand Account khác | Có thể vẫn dùng cùng đăng nhập Google/session. Không mặc nhiên có thư viện Music và credential tách biệt. | Chưa được xác minh. Không dùng làm thay thế cho tài khoản riêng trong qualification này. |

Thao tác ngay trên Windows 11:

1. Mở Chrome hoặc Edge trên máy cá nhân; mở menu profile → thêm profile mới.
2. Chọn tiếp tục không đăng nhập; đặt nhãn `YTM Test`. Không bật browser sync/import từ profile chính.
3. Kiểm tra profile mới không có tài khoản chính đăng nhập. Không mở DevTools để thu thập headers/cookies.
4. Dừng tại đây. Chỉ phản hồi: **“Chọn A; profile riêng đã tạo, chưa đăng nhập.”** Không gửi email, ảnh avatar, screenshot hoặc dữ liệu phiên.

Firefox có thể dùng profile riêng qua công cụ quản lý profile của Firefox. Đây cũng chỉ là cách ly browser; không phải account mới hay quyền automated access.

## Điều khoản — phải được giải quyết trước authenticated automation

Owner cần đọc trực tiếp các nguồn hiện hành:

- [YouTube Terms of Service](https://www.youtube.com/t/terms).
- [Google Terms of Service](https://policies.google.com/terms).
- [ytmusicapi browser-auth documentation](https://ytmusicapi.readthedocs.io/en/stable/setup/browser.html).

Ba URL trả HTTP 403 khi agent thử đọc trang công khai không đăng nhập. Không thể trích dẫn hay xác nhận nội dung hiện hành từ lượt kiểm tra này. Không thay đổi proxy/network để né phản hồi đó. Owner xác minh điều khoản áp dụng cho khu vực/tài khoản và cơ sở cho phép các thao tác automated read dự kiến; nếu chưa rõ, giữ BLOCKED hoặc xin hướng dẫn/quyền phù hợp từ bên cung cấp dịch vụ.

ytmusicapi là unofficial client. Tài khoản test và read-only requests không tự tạo ra quyền automated access. Documentation của thư viện chỉ mô tả kỹ thuật, không thay thế điều khoản Google/YouTube. Agent không đưa ra bảo đảm pháp lý.

## B2 — BLOCKED bởi preflight và terms/access: chuẩn bị tài khoản thủ công

Chỉ sau khi xử lý preflight, giải quyết terms/access và owner muốn tiếp tục gate này, hướng dẫn từng bước:

1. Tự tạo/chọn một Google account cá nhân riêng chỉ dùng để test, qua [quy trình chính thức](https://accounts.google.com/signup). Không liên kết thanh toán hoặc thư viện chính.
2. Dùng password riêng; owner tự cấu hình MFA phù hợp và account recovery do mình kiểm soát. Không tắt MFA hay thay đổi security settings để chiều theo unofficial client.
3. Đăng nhập account test trong profile `YTM Test` trên máy cá nhân. Không dùng cloud browser/AI automation.
4. Truy cập `https://music.youtube.com`, kiểm tra avatar và identity/account đang hoạt động ngay tại máy mình. Kiểm tra Library/Playlists bằng giao diện chính thức.
5. Dừng và xác nhận bằng trạng thái: “Tài khoản test riêng, MFA/recovery đã kiểm tra, identity test đúng.” Không cần email đầy đủ.

Đăng nhập thủ công trên UI chính thức khác với cho phép ứng dụng automated access. B2 không mở gate authentication cho ứng dụng.

## B3 — Fixture nhỏ, do owner thao tác trên UI chính thức

Chỉ mở khi B2 đã xác nhận và việc tạo fixture bằng UI được phép. Không yêu cầu agent thao tác tài khoản.

| Nhãn test | Fixture đề xuất | Expected do owner ghi nhận cục bộ |
| --- | --- | --- |
| EMPTY | Một playlist rỗng | 0 occurrence |
| SMALL | Một playlist nhỏ, ví dụ 3 bài dễ phân biệt | Count và thứ tự video; dùng nhãn A/B/C trong report |
| DUPLICATE | Playlist thêm cùng một bài nhiều lần, nếu UI cho phép | Count occurrence và vị trí; nếu không cho phép, NOT_RUN |
| LIBRARY | Một vài bài Save to library | Count riêng, không suy ra từ số Likes |
| LIKED | Một vài bài Like | Count riêng và phần giao với Library |
| LARGE | Chỉ playlist sẵn có phù hợp, được phép đọc, >500 occurrence | Count/thứ tự kiểm tra bằng UI; thiếu fixture → live case NOT_RUN |

Không tự động tạo hàng trăm bài/playlist, không dùng tài khoản chính để lấy coverage. Không tạo playlist lớn chỉ để đạt test. Pagination 501 occurrence đã có fixture SQLite offline; kết quả đó không thay thế live large-playlist evidence.

Chỉ chia sẻ số lượng và trạng thái fixture khi cần. Không gửi tên account, playlist ID riêng tư, danh sách nghe cá nhân hoặc browser requests. Sau mỗi gate, chờ owner xác nhận rồi mới hướng dẫn bước tiếp.

## Gate tiếp theo

Authentication vẫn đóng cho đến khi các finding ở Phase A được xử lý, browser smoke giữ sandbox bật, tài liệu/điều khoản được kiểm tra, và Windows local checks có evidence. [Checklist credential](credential-safety-checklist.md) là tài liệu tham khảo có điều kiện; không thực hiện toàn bộ lúc này.
