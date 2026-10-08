# Credential safety — Windows 11 và Linux

**HOLD: chưa được thực hiện authentication.** Static serving và provisioning có remediation + synthetic regressions; browser sandbox cloud vẫn BLOCKED, Windows/independent CI và terms/access chưa đạt. Owner xác nhận profile YTM Test đã tạo, chưa đăng nhập. Các lệnh bên dưới chỉ dành cho gate C tương lai trên máy owner sau khi blocker được xử lý; agent không thực thi trên credential thật.

## Credential có quyền gì?

Browser auth tái sử dụng headers/cookies của một phiên browser. Client có thể truy cập tài khoản theo quyền của phiên đó; credential không có bảo đảm read-only chỉ vì UI ứng dụng khóa mutation. `browser.json` có thể chứa session secrets. Coi file này như vật liệu đăng nhập: không chia sẻ, không đưa vào chat, Git, CI, cloud agent, screenshot, HAR hay artifacts.

Phiên có thể hết hạn/bị thu hồi; kết quả thường là lỗi authentication hoặc challenge. Khi đó dừng, để owner xử lý trực tiếp. Không retry/bypass MFA/challenge, đổi tài khoản né rate limit, hoặc tự sửa Account security settings.

## Version và phương pháp auth

Package thực tế là `ytmusicapi==1.12.2`. Đã kiểm tra `ytmusicapi --help` và `ytmusicapi browser --help` mà không dùng credential. CLI của bản này đánh dấu browser cookies là **deprecated**; nhận `browser` và tùy chọn `--file`. Không nâng cấp tự động và không suy ra documentation stable hiện hành khớp hoàn toàn bản pin.

**Không dùng trực tiếp lệnh `ytmusicapi browser` để tạo auth ở trạng thái hiện tại.** Console entry point gọi `sys.exit(main())`, trong khi `main()` trả về chuỗi JSON của `setup()`. Với kết quả kiểu chuỗi, Python in chuỗi ra stderr và trả exit code lỗi. Kiểm tra với kết quả giả đã xác nhận đường này; không dùng/đọc credential thật. Trên Windows phải xác minh console wrapper riêng trước khi cho phép dùng.

Phương thức được review hiện có: `npm run auth:provision` → `scripts/provision-auth.mjs` → `python/provision_browser_auth.py`. Chỉ máy owner/private interactive terminal sau gates; agent/CI không dùng credential thật. Helper dùng `ytmusicapi.setup(filepath=None, headers_raw=...)`, suppress stdout/stderr dependency và discard return sau khi ghi file. Headers nhập từng dòng bằng `getpass`, blank kết thúc; nếu hidden input không khả dụng thì dừng, không fallback echo. Không paste headers vào shell command/argv, chat hay agent terminal. Không bật transcript/recording. Dependency exception không được in traceback.

Helper yêu cầu YTM_AUTH_FILE là absolute path tới file mới ngoài checkout, parent không symlink/junction/reparse point. Linux parent phải owned 700, file exclusive 600. Windows helper kiểm tra metadata ACL owner hiện tại, chỉ Allow current owner hoặc SYSTEM trước input; owner vẫn phải chuẩn bị và review directory/file ACL theo phần dưới. Không overwrite file có sẵn, không sửa ACL storage cũ. Synthetic helper tests chạy Linux; Windows path được đưa vào matrix CI nhưng chưa có kết quả độc lập. CLI gốc vẫn không được dùng.

Preview tương lai sau gate C: đặt **path** YTM_AUTH_FILE trong local session, chạy `npm run auth:provision`, kiểm tra metadata/ACL rồi unset path nếu chưa chạy app. Chưa chạy preview này lúc hiện tại. Không đổi OAuth, MFA, security settings, TLS hoặc browser sandbox để workaround.

## C3 — Storage Windows: ngoài Git, webroot và vùng đồng bộ

Ví dụ vị trí: thư mục riêng dưới `%LOCALAPPDATA%`, không phải OneDrive, Documents đồng bộ, repository hoặc `dist`. Owner kiểm tra vị trí thật; đừng giả định biến môi trường luôn trỏ tới storage không đồng bộ.

Chỉ chuẩn bị thư mục mới sau khi gate storage được mở. Lệnh không đọc secrets; không chạy nếu thư mục đã có dữ liệu/ACL chưa biết:

```powershell
$authDir = Join-Path $env:LOCALAPPDATA 'YTM-Library-Manager-TestAuth'
if (Test-Path -LiteralPath $authDir) { throw 'Thư mục đã tồn tại: kiểm tra metadata/ACL thủ công trước.' }
New-Item -ItemType Directory -Path $authDir | Out-Null
$ownerSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
icacls.exe $authDir /setowner "*$($ownerSid)"
if ($LASTEXITCODE -ne 0) { throw 'Thiết lập owner thất bại; dừng.' }
icacls.exe $authDir /inheritance:r /grant:r "*$($ownerSid):(OI)(CI)F"
if ($LASTEXITCODE -ne 0) { throw 'Thiết lập ACL thất bại; dừng.' }
(Get-Acl -LiteralPath $authDir).Access |
  Select-Object IdentityReference, FileSystemRights, AccessControlType, IsInherited
```

Review ACL tại máy mình: owner cần Read/Write; chỉ giữ các principal hệ thống thực sự cần thiết. Không cấp Everyone/Users/Authenticated Users access vào file. Không tự thay ACL thư mục hệ thống hoặc storage hiện có. ACL giảm truy cập từ account khác, không chống malware/admin chạy cùng quyền owner.

Sau phương thức tạo auth đã được đánh giá, kiểm tra **metadata**, không `Get-Content`, không mở file bằng editor:

```powershell
$authFile = Join-Path $authDir 'browser.json'
Test-Path -LiteralPath $authFile -PathType Leaf
(Get-Item -LiteralPath $authFile).Attributes
(Get-Acl -LiteralPath $authFile).Access |
  Select-Object IdentityReference, FileSystemRights, AccessControlType, IsInherited
```

Nếu auth file hoặc bất kỳ thư mục cha có ReparsePoint/junction/symlink, dừng để review nơi lưu thực. Resolve-Path một mình không chứng minh target vật lý an toàn. Credential phải ngoài cả Git worktree và mọi thư mục served/static. Không tạo link từ `dist`/repository tới private auth storage.

Kiểm tra đường dẫn ngoài checkout từ terminal ở repository, không đọc file:

```powershell
$repoRoot = [IO.Path]::GetFullPath((git rev-parse --show-toplevel).Trim())
$filePath = [IO.Path]::GetFullPath($authFile)
$prefix = $repoRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if ($filePath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Auth file nằm trong checkout: dừng.'
}
```

Đây là kiểm tra lexical bổ sung, không thay thế review junction/symlink. Không đưa auth vào project `.env`. `.gitignore` không bảo vệ file đã tracked, tên tùy ý hoặc static serving.

## C4 — Runtime path chỉ ở session cục bộ của owner

**Chưa chạy các lệnh runtime bên dưới.** `YTM_AUTH_FILE` hiện hỗ trợ path qua environment; Node đưa path cùng payload qua stdin cho Python. `connected=true` chỉ nghĩa file tồn tại, không chứng minh đúng account hay quyền sử dụng.

Sau khi A–D và điều khoản đã pass, owner chấp thuận một lần cụ thể rồi mới cấu hình trên máy cá nhân:

```powershell
$env:YTM_AUTH_FILE = $authFile
# Không đặt bằng setx, không lưu vào .env, profile script hay cloud settings.
# Lệnh live riêng chỉ được chạy sau approval gate E, không tự chạy ở đây.
```

Chỉ xác minh presence, không in giá trị:

```powershell
[bool]$env:YTM_AUTH_FILE
```

Không mở profile test có credential trong browser automation. Test browser offline cần profile ephemeral trống và không có auth binding. Giữ service loopback; không thêm `--host 0.0.0.0`, tunnel hoặc LAN listener.

## Linux alternative, chỉ máy owner

Chọn directory mới ngoài repository/webroot và vùng sync. Không xử lý credential trên cloud environment này.

```bash
auth_dir="$HOME/.local/share/ytm-library-manager-test-auth"
test ! -e "$auth_dir" || { echo 'Existing storage: review permissions first'; exit 1; }
umask 077
mkdir -m 700 -p "$auth_dir"
# Authentication remains HOLD pending Windows/access/sandbox gates.
auth_file="$auth_dir/browser.json"
# After generation, metadata only:
test -f "$auth_file"
stat -c '%a %U %G' "$auth_dir" "$auth_file"
# Expected directory 700 and file 600, owned by the account running the app.
# Reject symlinks; inspect realpath locally and ensure it is outside all served/Git roots.
```

Khi gate E mở, `export YTM_AUTH_FILE="$auth_file"` chỉ chứa path, không credential contents. `unset YTM_AUTH_FILE` sau kiểm thử. Không thay TLS/checksum verification, MFA hoặc browser sandbox. Windows 11 vẫn là target chính; local Linux evidence không tự qualify Windows.

## F — Cleanup và ứng phó lộ credential

1. Tắt service/process do owner vừa khởi chạy; xác minh ports/PIDs metadata không còn listener. Không kill process không liên quan.
2. PowerShell: `Remove-Item Env:YTM_AUTH_FILE -ErrorAction SilentlyContinue`. Environment của child process còn chạy không tự bị xóa; phải stop child trước. Linux: `unset YTM_AUTH_FILE`.
3. Kiểm tra staged **filenames** với `git diff --cached --name-only`; không gửi nội dung diff có khả năng chứa secret. Nếu nghi lộ, không mở hay upload file để chứng minh.
4. Không export DB/logs của account mà chưa review riêng tư. Dùng counts và trạng thái đã sanitize cho report.
5. Owner giữ private storage hoặc tự thu hồi phiên nếu không cần. Không giả định logout xóa file local sẽ thu hồi mọi credential ngay lập tức.
6. Nếu nghi bị lộ: dừng ứng dụng, owner kiểm tra [thiết bị và phiên Google](https://support.google.com/accounts/answer/3067630), và [hướng dẫn bảo vệ tài khoản bị xâm phạm](https://support.google.com/accounts/answer/6294825). Owner tự quyết định sign-out/revoke, đổi password và security review; agent không thực hiện các hành động đó.
7. Không đưa browser auth vào cloud environment settings/CI. Draft cũ cần owner review thủ công; lượt này không save/publish settings. Duy trì mutation disabled.
