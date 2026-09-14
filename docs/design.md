# YTM Library Manager — khảo sát & thiết kế

## 1. Kết luận nghiên cứu

**YTM Library Manager nên được thiết kế như một “library intelligence layer” chạy phía trên YouTube Music, không phải một YouTube Music client mới.**

Lý do: YouTube Music hiện đã có Library với `Playlists / Songs / Albums / Artists / Podcasts`, filter theo loại nội dung và một số sort như recent activity, recently saved, recently played. Nhưng Google vẫn không cung cấp một lớp quản trị thư viện có cấu trúc như folder/tag/bulk operation/query nâng cao. ([Google Help][1])

Nhu cầu này không chỉ là suy đoán. Trong 2025–2026, người dùng tiếp tục yêu cầu playlist folders, custom sorting, search trong playlist, lọc genre bên trong playlist và hiển thị playlist nào đã chứa một bài. ([Google Help][2])

Đồng thời, khoảng trống không còn hoàn toàn “trống”: đã có các công cụ như **YTMusic Deleter** và **Soundiiz** xử lý bulk operations, sorting, duplicate removal, merge/transfer. Vì vậy YTM Library Manager phải đi xa hơn “bulk playlist editor”. ([GitHub][3])

---

# 2. Vấn đề thực sự

### Không phải:

> “YouTube Music thiếu folder.”

Mà là:

> **Khi thư viện tăng lên hàng trăm playlist và hàng nghìn track, người dùng không còn có một hệ thống để hiểu, truy vấn, làm sạch và tổ chức thư viện của mình.**

Ví dụ:

```text
My YouTube Music
│
├── 120 playlists
├── 4,500 liked tracks
├── 1,200 albums
├── 800 artists
└── rất nhiều version / duplicate
```

Native YTM chủ yếu cung cấp:

```text
Browse
→ filter
→ sort
→ open
→ play
```

YTM Library Manager cần biến nó thành:

```text
Ingest
→ Index
→ Search
→ Analyze
→ Organize
→ Clean
→ Apply changes
```

Đây mới là proposition có chiều sâu.

---

# 3. Evidence: pain point nào đáng ưu tiên?

| Pain point               | Evidence                                    | Priority |
| ------------------------ | ------------------------------------------- | -------: |
| Playlist folders         | Nhiều feature request chính thức + Reddit   |   **P0** |
| Search trong playlist    | Feature request + userscript workaround     |   **P0** |
| Custom sorting           | YTM hiện chỉ cung cấp một số sort ở Library |   **P0** |
| Bulk cleanup             | Native UX yếu; đã xuất hiện tool riêng      |   **P0** |
| Duplicate management     | Có nhu cầu và tool ngoài                    |   **P1** |
| Song thuộc playlist nào  | User request trực tiếp                      |   **P1** |
| Genre/language filtering | Feature request 2026                        |   **P1** |
| Smart tagging            | Native YTM gần như không có                 |   **P1** |
| Analytics                | Khoảng trống tốt nhưng không phải core MVP  |   **P2** |
| Recommendation engine    | Có giá trị nhưng dễ scope creep             |   **P2** |
| Music knowledge graph    | Rất mạnh nhưng nên để phase sau             |   **P3** |

Một điểm đáng chú ý: Reddit năm 2026 vẫn có người phản ánh việc với playlist lớn, họ phải cuộn để tìm track và phải dùng userscript để lọc theo title/artist. ([Reddit][4])

---

# 4. Competitive landscape

## Native YouTube Music

Google hiện hỗ trợ:

* Library categories
* filtering
* basic sorting
* playlist CRUD
* drag/reorder track
* library management
* history
* downloads

([Google Help][1])

Nhưng **library organization semantics còn yếu**.

---

## YTMusic Deleter

Đây là competitor quan trọng nhất về mặt kỹ thuật.

Nó đã có:

```text
bulk delete
playlist sorting
shuffle
duplicate removal
library reset
history deletion
bulk playlist operations
```

([GitHub][3])

### Nhưng positioning khác:

**YTMusic Deleter**

> “I need to clean/delete/manage things quickly.”

**YTM Library Manager**

> “I need to understand and organize my entire music library.”

Không nên clone YTMusic Deleter.

---

## Soundiiz

Soundiiz đã có:

```text
merge
split
duplicate removal
bulk deletion
sync
transfer
export
```

([Soundiiz][5])

Nhưng trọng tâm của Soundiiz là **cross-service migration/playlist management**.

YTM Library Manager nên:

> **YTM-native + local-first + library intelligence**

thay vì trở thành Soundiiz mini.

---

# 5. Strategic positioning

Tôi chốt positioning:

> **YTM Library Manager is a local-first management and intelligence layer for large YouTube Music libraries.**

Không cạnh tranh bằng playback.

Không xây lại player.

Không tải nhạc.

Không thay thế YouTube Music.

### Nó quản lý:

```text
Your library
      ↓
Your metadata
      ↓
Your organization
      ↓
Your queries
      ↓
Your cleanup operations
```

---

# 6. UX concept

## Home

Không làm dashboard kiểu “AI SaaS”.

Màn hình chính nên giống **file manager / database browser**.

```text
┌──────────────────────────────────────────────────────┐
│ YTM Library Manager                  Sync ●          │
├──────────────────────────────────────────────────────┤
│ Search everything...                                 │
├───────────────┬──────────────────────────────────────┤
│ Library       │                                      │
│               │  4,281 Songs                        │
│ All Songs     │                                      │
│ Playlists     │  93 Playlists                       │
│ Albums        │  812 Albums                         │
│ Artists       │  531 Artists                        │
│               │                                      │
│ Smart Views   │  Recently changed                   │
│ Duplicates    │  17 duplicates                      │
│ Unorganized   │  38 playlists                       │
│ Large Lists   │  12 playlists > 500 tracks          │
│               │                                      │
└───────────────┴──────────────────────────────────────┘
```

### Core principle

> **Search first, navigation second.**

Không ép user đi:

```text
Library → Playlist → scroll → find
```

mà:

```text
Search
→ result
→ operation
```

---

# 7. Universal Search

Đây là feature quan trọng nhất.

Không chỉ:

```text
Song name
```

mà hỗ trợ query:

```text
artist:Ado
album:Kyougen
playlist:"J-Pop"
duration:<300
year:2024
liked:true
```

Sau đó mở rộng:

```text
genre:J-Pop
language:ja
duplicate:true
playlist_count:>3
```

Ví dụ:

```text
artist:YOASOBI year:2023+ liked:true
```

→ lập tức trả về subset.

### Đây là lý do phải xây local index.

Native YTM API không nên bị gọi cho mỗi lần user gõ một ký tự.

---

# 8. Playlist Explorer

Một playlist:

```text
Japanese Music
1,842 tracks
```

hiển thị dạng table:

| # | Title   | Artist  | Album    | Duration | Year | Playlists | Status |
| - | ------- | ------- | -------- | -------: | ---: | --------: | ------ |
| 1 | 夜に駆ける   | YOASOBI | THE BOOK |     4:21 | 2019 |         3 | ✓      |
| 2 | Usseewa | Ado     | Kyogen   |     3:24 | 2020 |         2 | ✓      |
| 3 | ...     | ...     | ...      |      ... |  ... |       ... | ...    |

### User có thể:

```text
filter
sort
multi-select
move
remove
deduplicate
tag
export
```

---

# 9. Playlist Folders

Đây là feature **P0 nhưng không phải điểm khác biệt duy nhất**.

```text
Music
├── Japanese
│   ├── J-Pop
│   ├── Anime
│   └── Vocaloid
│
├── English
│   ├── Rock
│   └── Study
│
├── Context
│   ├── Gym
│   ├── Coding
│   └── Sleep
```

Quan trọng:

### Folder không cần tồn tại trên YTM.

Đây nên là **local organization layer**.

```text
YTM playlist
      │
      └── playlistId
              │
              ▼
       Local folder metadata
```

Ưu điểm:

* không phụ thuộc YTM có folder API hay không
* không phá native YTM
* có thể nested
* có thể thêm tag
* rollback dễ

Spotify hiện đã hỗ trợ folder và nested folder; đây là một useful benchmark UX chứ không nên copy toàn bộ implementation. ([Spotify][6])

---

# 10. Smart Views

Đây mới là thứ khiến project vượt khỏi “folder extension”.

Ví dụ:

### `Large Playlists`

```text
tracks > 500
```

### `Duplicates`

```text
same canonical track
```

### `Unorganized`

```text
playlist folder = null
```

### `Recently Changed`

```text
updated_at > 7 days
```

### `Forgotten`

```text
saved > 1 year
AND
played = 0
```

### `Overloaded`

```text
same artist > 20%
```

Smart View thực chất là:

> **saved queries**

---

# 11. Duplicate Engine

Không nên bắt đầu bằng audio fingerprint.

### V1

Exact duplicate:

```text
videoId identical
```

### V2

Metadata similarity:

```text
normalized title
+ artist
+ duration
+ album
```

Ví dụ:

```text
夜に駆ける
夜に駆ける - YOASOBI
YOASOBI - 夜に駆ける
夜に駆ける (Official Audio)
```

→ nhóm:

```text
Track Cluster #481
```

sau đó:

```text
Canonical candidate
├── official audio
├── music video
├── live
└── fan upload
```

### V3

Audio fingerprint / embedding.

Tách riêng để tránh MVP biến thành research monster.

---

# 12. “Where is this song?”

Một feature nhỏ nhưng cực hữu ích.

Click track:

```text
Ado - Usseewa
```

hiện:

```text
Saved in:

✓ Japanese
✓ Favorites
✓ Workout
✓ 2024
```

Thậm chí:

```text
4 playlists
```

Đây chính là giải pháp cho pain point “tôi không nhớ bài này đã nằm ở playlist nào”. Một feature request cụ thể về YouTube Music cũng đề xuất indicator cho biết bài đang được lưu trong playlist nào. ([Google Help][7])

---

# 13. Bulk Operations

Multi-select:

```text
[✓] track 1
[✓] track 2
[✓] track 3
```

Actions:

```text
Add to playlist
Remove from playlist
Move
Tag
Remove duplicates
Export
```

Nhưng **không được execute destructive operations ngay**.

Thay vào đó:

```text
Preview changes

42 tracks selected

+ add to "Japanese"
- remove from "Old J-Pop"

[Cancel] [Apply 42 changes]
```

Sau Apply:

```text
Operation complete
42 applied
0 failed
```

---

# 14. Change Plan — điểm tôi rất khuyến nghị

Không cho UI gọi mutation trực tiếp.

Architecture:

```text
User Action
    ↓
Intent
    ↓
Change Planner
    ↓
Diff
    ↓
Preview
    ↓
Apply
    ↓
Verification
```

Ví dụ:

```text
BEFORE
Playlist A = 100 tracks

Plan:
remove 7 duplicates
add 3 tracks
move 4 tracks

AFTER
Playlist A = 92 tracks
```

Đây làm system an toàn hơn rất nhiều.

---

# 15. Undo / rollback

YTM API không nhất thiết cung cấp transaction.

Vì vậy YTM Library Manager phải xây transaction layer của riêng nó.

```text
Operation #182

Before:
playlist A = [...]

Action:
remove tracks [x,y,z]

After:
playlist A = [...]

Rollback:
restore [x,y,z]
```

Không phải mọi thay đổi đều rollback hoàn hảo được, nhưng hệ thống nên lưu **operation log**.

---

# 16. Architecture

Tôi không khuyến nghị browser extension thuần túy ngay từ đầu.

### Kiến trúc tốt hơn

```text
┌───────────────────────────────┐
│         Web/Desktop UI        │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│       Application Layer       │
│                               │
│ Search                        │
│ Smart Views                   │
│ Change Planner                │
│ Duplicate Detection           │
│ Organization                  │
└───────────────┬───────────────┘
                │
        ┌───────┴────────┐
        ▼                ▼
┌──────────────┐  ┌───────────────┐
│ Local Store  │  │ YTM Adapter    │
│              │  │               │
│ SQLite       │  │ ytmusicapi    │
│ FTS5         │  │ / Web client   │
└──────────────┘  └───────┬───────┘
                          │
                          ▼
                   YouTube Music
```

---

# 17. Vì sao Local-first?

`ytmusicapi` hiện cung cấp khá nhiều primitives:

* library playlists
* library songs
* albums
* artists
* history
* ratings
* playlist CRUD
* add/move/remove playlist tracks

([GitHub][8])

Nó hoạt động bằng cách mô phỏng YouTube Music web client và dùng credential/cookie của user. Đây là **unofficial API**, nên không nên xây architecture phụ thuộc vào server cloud trung gian. ([GitHub][8])

### Recommendation

```text
User machine
   │
   ├── Auth
   ├── Sync
   ├── SQLite
   └── Search index
          │
          ▼
      UI
```

Không:

```text
User
 ↓
Your server
 ↓
Google credential
 ↓
YouTube Music
```

Credential handling là vùng rủi ro không đáng có.

---

# 18. Data model

Tôi đề xuất bắt đầu với SQLite.

### `tracks`

```sql
track_id
video_id
title
normalized_title
artist_id
album_id
duration_ms
year
thumbnail_url
library_status
like_status
first_seen_at
last_seen_at
```

### `artists`

```sql
artist_id
name
normalized_name
browse_id
```

### `albums`

```sql
album_id
name
artist_id
year
```

### `playlists`

```sql
playlist_id
title
description
track_count
owner
updated_at
```

### `playlist_tracks`

```sql
playlist_id
track_id
position
added_at
```

### `folders`

```sql
folder_id
parent_id
name
position
```

### `playlist_folders`

```sql
playlist_id
folder_id
```

### `tags`

```sql
tag_id
name
```

### `track_tags`

```sql
track_id
tag_id
```

### `operations`

```sql
operation_id
type
created_at
status
before_snapshot
after_snapshot
```

---

# 19. Search architecture

SQLite FTS5 là đủ cho MVP.

```text
raw YTM metadata
       ↓
normalization
       ↓
FTS5
       +
structured indexes
```

Query parser:

```text
artist:Ado
year:2024
playlist:"J-Pop"
duration:<300
liked:true
```

→

```text
AST
```

Ví dụ:

```text
AND(
    artist = Ado,
    year >= 2024,
    liked = true
)
```

Sau đó query SQLite.

### Không cần Elasticsearch.

Với personal library:

```text
1k
10k
50k
100k tracks
```

SQLite vẫn là lựa chọn hợp lý trước khi benchmark cho thấy ngược lại.

---

# 20. Sync engine

Đây là thành phần quan trọng nhất về reliability.

```text
Initial sync
    ↓
full snapshot
    ↓
local database
```

Sau đó:

```text
incremental sync
    ↓
detect changes
    ↓
update local index
```

UI luôn đọc:

```text
Local DB
```

chứ không đọc:

```text
YTM API → mỗi interaction
```

### UI state

```text
Synced
Syncing...
Changes detected
Conflict
Failed
```

---

# 21. Conflict model

Ví dụ:

```text
YTM:
Playlist A = [1,2,3,4]

Local:
Playlist A = [1,2,4]
```

Trong lúc manager offline, user chỉnh playlist trực tiếp trên YTM.

Khi sync:

```text
CONFLICT DETECTED
```

Không silently overwrite.

Cho phép:

```text
Keep YTM
Keep local intent
Merge
Review diff
```

Đây là thứ nhiều extension nhỏ bỏ qua.

---

# 22. UX của sync

Không nên bắt user login lại vào Google.

Flow tốt:

```text
First launch

Connect YouTube Music
        ↓
Authenticate
        ↓
Scan library
        ↓
2,431 tracks found
813 playlists found
        ↓
Indexing...
        ↓
Ready
```

Sau đó:

```text
● Synced 2 min ago
```

---

# 23. MVP tôi chốt

Không làm toàn bộ feature ở trên.

## YTM Library Manager v0.1

### P0

**1. Connect YTM**

**2. Full local library sync**

**3. SQLite database**

**4. Universal search**

**5. Playlist table**

**6. Search/filter trong playlist**

**7. Sort**

```text
title
artist
album
duration
date added
```

**8. Multi-select**

**9. Add/remove playlist items**

**10. Local playlist folders**

**11. Change preview**

**12. Operation log**

---

# 24. v0.2

```text
Smart Views
Duplicate detection
Where is this song?
Tags
Bulk cleanup
Saved searches
Export/import
```

---

# 25. v0.3

```text
Version Resolver
Canonical Track
Genre/language classification
Similarity search
Music Knowledge Graph
```

---

# 26. Những thứ KHÔNG làm ở V1

Đây là phần quan trọng để tránh scope creep.

### Không làm:

```text
❌ Music player
❌ Download music
❌ Audio ripping
❌ Streaming proxy
❌ Recommendation LLM
❌ Spotify clone
❌ Cross-platform migration
❌ Mobile app
❌ Cloud sync
❌ Social features
```

Soundiiz đã mạnh ở migration/cross-platform rồi; YTM Library Manager không cần cạnh tranh ở đó. ([Google Help][9])

---

# 27. Killer workflow

Một MVP tốt phải thắng được workflow này:

### Scenario

User có:

```text
87 playlists
3,800 songs
```

Một playlist:

```text
J-Pop
1,240 songs
```

User muốn:

> “Tìm tất cả bài của Ado sau 2022, chưa có trong Workout.”

Native YTM:

```text
khó / nhiều thao tác
```

YTM Library Manager:

```text
artist:Ado
year:>2022
NOT playlist:Workout
```

→ 37 tracks

```text
Select all
↓
Preview
↓
Add to Workout
↓
37 applied
```

**Đây là product moment.**

---

# 28. Một workflow khác còn quan trọng hơn

User muốn dọn playlist:

```text
J-Pop
1,240 tracks
```

Manager:

```text
117 exact duplicates
32 likely duplicates
8 playlists contain same track
14 live versions
```

User:

```text
Review
```

→

```text
Cluster 001

夜に駆ける

○ Official Audio
○ MV
○ Live 2023
○ Lyrics video

Recommended canonical:
Official Audio

[Keep] [Remove duplicates]
```

Đây chính là lúc project bắt đầu chuyển từ:

> playlist manager

sang:

> **music library intelligence system**

---

# 29. Product boundary

Tôi đề xuất phân biệt rõ ba tầng:

### Level 1 — Management

```text
search
sort
filter
folders
tags
bulk operations
```

### Level 2 — Intelligence

```text
duplicates
canonical tracks
smart views
classification
recommendations
```

### Level 3 — Knowledge

```text
artist graph
track graph
version graph
music discovery
analytics
```

**MVP chỉ cần Level 1.**

Level 2 là competitive moat.

Level 3 mới là hướng research.

---

# 30. Technical stack tôi chốt

Với mục tiêu project nghiêm túc, tôi chọn:

```text
Frontend:
React + TypeScript
        +
Tauri

Backend/core:
Rust
hoặc Python service ở prototype

Storage:
SQLite
FTS5

YTM integration:
ytmusicapi
        ↓
adapter layer

Search:
SQLite FTS5 + SQL

Validation:
Vitest / Rust tests
```

### Nhưng implementation strategy:

**Prototype nhanh:**

```text
Python
+ ytmusicapi
+ SQLite
+ React
```

Sau khi domain model ổn mới cân nhắc:

```text
Rust core
+ Tauri
```

Không nên bắt đầu bằng Rust chỉ vì muốn “production”.

---

# 31. Một quyết định kiến trúc quan trọng

Không để code UI biết `ytmusicapi`.

Sai:

```text
React
 ↓
ytmusicapi
```

Đúng:

```text
React
 ↓
Application API
 ↓
YTM Repository
 ↓
ytmusicapi
```

Ví dụ:

```typescript
interface MusicLibraryRepository {
  getTracks(query: TrackQuery): Promise<Track[]>;
  getPlaylists(): Promise<Playlist[]>;
  addTracksToPlaylist(...): Promise<void>;
  removeTracksFromPlaylist(...): Promise<void>;
}
```

Sau này đổi:

```text
ytmusicapi
→ official API
→ browser adapter
→ mock
```

không phá domain.

---

# 32. Reliability requirements

Tôi sẽ đặt các tiêu chí này ngay từ V1:

| Requirement                          | Target          |
| ------------------------------------ | --------------- |
| No silent destructive mutation       | **100%**        |
| Every mutation previewable           | **100%**        |
| Local database consistent after sync | **100% tested** |
| Retry failed operations              | Có              |
| Operation log                        | Có              |
| Partial failure reporting            | Có              |
| Duplicate application prevention     | Có              |
| API failure doesn't corrupt local DB | Có              |
| Search works offline after sync      | Có              |

---

# 33. Một caveat rất quan trọng

`ytmusicapi` là **unofficial API**. Nó rất hữu dụng và hiện hỗ trợ library/playlist operations, nhưng YouTube Music có thể thay đổi web-client internals khiến adapter cần cập nhật; lịch sử issue của project cho thấy đã từng có thay đổi phía YTM làm các library functions lỗi. ([GitHub][10])

Vì vậy:

```text
Domain
   ↓
Application
   ↓
Repository interface
   ↓
YTM adapter
```

không phải overengineering; nó là **boundary bắt buộc**.

---

# 34. Definition of Done cho v0.1

Tôi sẽ không dùng “có UI chạy được” làm DoD.

### Functional

```text
[ ] Connect YTM
[ ] Sync library
[ ] Persist SQLite
[ ] Search all tracks
[ ] Search playlists
[ ] Search within playlist
[ ] Filter
[ ] Sort
[ ] Multi-select
[ ] Add/remove tracks
[ ] Local folders
[ ] Preview mutations
[ ] Apply mutations
[ ] Operation log
```

### Reliability

```text
[ ] retry
[ ] timeout
[ ] partial failure handling
[ ] sync resume
[ ] duplicate mutation prevention
[ ] local DB remains valid after API failure
```

### UX

```text
[ ] first useful result < 10 sec after index exists
[ ] search latency feels instant locally
[ ] destructive operations require confirmation
[ ] sync state always visible
```

### Verification

Test bằng một library giả lập:

```text
5 playlists
500 tracks
duplicates
same track in multiple playlists
large playlist
failed mutation
partial sync
conflict
```

Sau đó mới thử account thật.

---

# 35. Research questions mở ra từ project

Nếu sau này muốn academicize dự án, YTM Library Manager có thể dẫn tới các bài toán:

### RQ1 — Playlist organization

> Có thể tự động tổ chức một music library lớn thành các semantic clusters mà vẫn giữ user control hay không?

### RQ2 — Track entity resolution

> Có thể xác định các YouTube uploads đại diện cho cùng một canonical track bằng metadata + semantic/audio signals đến mức nào?

### RQ3 — Human-in-the-loop curation

> Khi hệ thống đưa ra cleanup suggestions, UI nào giúp user xác nhận nhanh mà vẫn tránh destructive mistakes?

### RQ4 — Personal music retrieval

> Structured query + semantic search có giúp retrieval hiệu quả hơn search title/artist truyền thống không?

Như vậy project có thể phát triển:

```text
software engineering
        ↓
data engineering
        ↓
information retrieval
        ↓
entity resolution
        ↓
recommender / knowledge graph research
```

---

# 36. Kiến trúc cuối cùng tôi khuyên chốt

```text
                 YouTube Music
                       │
                       │
                 YTM Adapter
                       │
                       ▼
                Sync Engine
                       │
             ┌─────────┴─────────┐
             │                   │
             ▼                   ▼
        Raw Snapshot        Change Log
             │                   │
             └─────────┬─────────┘
                       ▼
                  SQLite Store
                       │
              ┌────────┼────────┐
              ▼        ▼        ▼
             FTS     Queries   Graph*
              │        │        │
              └────────┼────────┘
                       ▼
               Application Layer
                       │
      ┌────────────────┼────────────────┐
      ▼                ▼                ▼
 Library           Smart Views       Planner
 Explorer          & Filters         & Diff
      │                │                │
      └────────────────┼────────────────┘
                       ▼
                       UI

* later phase
```

---

# 37. Product thesis

Tôi sẽ ghi thesis của project như sau:

> **YouTube Music is good at playing and discovering music, but large personal libraries remain difficult to query, organize, inspect and clean. YTM Library Manager adds a local-first intelligence layer that turns a passive library into a searchable, structured and controllable personal music database.**

Đây là điểm khác biệt mà tôi cho rằng đáng bảo vệ.

Không phải:

> “thêm vài feature cho YTM”.

Mà là:

> **“biến music library thành dữ liệu mà người dùng thực sự sở hữu và kiểm soát.”**

---

## Sources chính

Google xác nhận Library hiện hỗ trợ categories, filters, basic sorting, playlist editing và downloads. ([Google Help][1])

Các yêu cầu về folders, granular organization và custom playlist management tiếp tục xuất hiện trên YouTube Music Community trong 2023–2026. ([Google Help][11])

YTMusic Deleter đã chứng minh nhu cầu thực tế cho bulk operations, playlist sorting và duplicate removal. ([GitHub][3])

Soundiiz đã chứng minh nhu cầu lớn hơn cho merge/split/duplicate management và library operations, nhưng định vị chủ yếu là cross-platform. ([Soundiiz][5])

`ytmusicapi` cung cấp đủ primitives để xây management layer: library, playlist CRUD, history và mutations, nhưng là unofficial API và có risk phụ thuộc vào web-client behavior. ([GitHub][8])

---

### Checkpoint

**Đã chốt:** YTM Library Manager không nên là playlist editor đơn giản; core là **local-first library management + query + safe bulk operations**, sau đó tiến tới **duplicate/entity resolution**.

**MVP mặc định:** `Sync → SQLite → Search → Filter/Sort → Playlist Explorer → Folders → Bulk Preview/Apply → Operation Log`.

**Moat dài hạn:** `Canonical Track / Version Resolver → Smart Views → Music Knowledge Graph`.

**Rủi ro lớn nhất:** unofficial YTM integration và destructive mutation; vì vậy adapter boundary, change planner, diff và operation log phải được thiết kế ngay từ đầu. ([GitHub][10])

**Bước kỹ thuật tiếp theo có giá trị nhất:** viết **V1 Product Spec + domain model + repository interfaces + 5 user flows**, rồi mới bắt đầu code.

[1]: https://support.google.com/youtubemusic/answer/6313542?hl=en&utm_source=chatgpt.com "Customize your music & podcasts - YouTube Music Help"
[2]: https://support.google.com/youtubemusic/thread/395400532/playlist-folders-and-pinning?utm_source=chatgpt.com "Playlist folders and pinning - YouTube Music Community"
[3]: https://github.com/apastel/ytmusic-deleter?utm_source=chatgpt.com "GitHub - apastel/ytmusic-deleter: Easily delete your YouTube Music library (and manage playlists) · GitHub"
[4]: https://www.reddit.com/r/YoutubeMusic/comments/1t0k60l/how_does_youtube_music_still_not_have_playlist/?utm_source=chatgpt.com "How does YouTube Music still not have playlist search?(webapp and browser versions)"
[5]: https://support.soundiiz.com/hc/en-us/categories/360000893853-Using-Soundiiz?utm_source=chatgpt.com "Transfers, Playlists & Matching – Soundiiz Support"
[6]: https://support.spotify.com/ph-en/article/playlist-folders/?utm_source=chatgpt.com "Playlist folders - Spotify"
[7]: https://support.google.com/youtubemusic/thread/447309055/feature-request-smarter-playlist-save-indicator-management?hl=en&utm_source=chatgpt.com "Feature Request: Smarter Playlist Save Indicator & Management - YouTube Music Community"
[8]: https://github.com/sigma67/ytmusicapi?utm_source=chatgpt.com "GitHub - sigma67/ytmusicapi: Unofficial API for YouTube Music · GitHub"
[9]: https://support.google.com/youtubemusic/answer/14729358?hl=en&utm_source=chatgpt.com "Transfer your playlists from another service - YouTube Music Help"
[10]: https://github.com/sigma67/ytmusicapi/issues/301?utm_source=chatgpt.com "get_library_playlists(), get_library_songs() and other get_library functions failing · Issue #301 · sigma67/ytmusicapi · GitHub"
[11]: https://support.google.com/youtubemusic/thread/250099731/feature-request-folders?hl=en&utm_source=chatgpt.com "Feature Request - Folders - YouTube Music Community"
