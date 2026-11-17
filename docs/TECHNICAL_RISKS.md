# ĐÁNH GIÁ RỦI RO KỸ THUẬT & MA TRẬN PHÒNG NGỪA (TECHNICAL RISKS & MITIGATION)

**Dự án:** Stock Chart Extractor – Multi-Stock Management Architecture  
**Tài liệu:** Đánh giá các rủi ro kỹ thuật tiềm ẩn trong môi trường Runtime FireAnt và Phân hệ Xuất JSON Toàn diện (Export All JSON)  
**Phiên bản:** 2.1  
**Ngày cập nhật:** 17/11/2026  
**Trạng thái kiểm duyệt:** RISK ANALYSIS (Export All JSON Risks Integrated)

---

## 1. TỔNG QUAN

Khi mở rộng hệ thống Stock Chart Extractor từ chế độ đơn mã sang quản lý đa mã cổ phiếu và tích hợp tính năng **Xuất toàn bộ dữ liệu ra một tệp JSON duy nhất (Export All JSON)**, hệ thống phải đối mặt với các thách thức:
1. Xử lý đồng thời nhiều biểu đồ, tần suất thay đổi ngữ cảnh cao.
2. Lưu trữ và tuần tự hóa khối lượng lớn các đối tượng vẽ cũng như chỉ báo kỹ thuật.
3. Đảm bảo tính nhất quán của dữ liệu (Point-in-Time Consistency) khi xuất tệp.
4. Bảo vệ an toàn quyền riêng tư, tuyệt đối không rò rỉ token hay thông tin đăng nhập trong tệp xuất.

Tài liệu này xác định 12 rủi ro kỹ thuật trọng yếu và đề xuất các giải pháp kỹ thuật cụ thể đã được kiểm chứng.

---

## 2. MA TRẬN RỦI RO KỸ THUẬT VÀ PHÒNG NGỪA (RISK & MITIGATION MATRIX)

| STT | Rủi ro kỹ thuật | Mức độ nghiêm trọng | Xác suất xảy ra | Giải pháp phòng ngừa & Kiểm soát (Mitigation) |
|:---:|---|:---:|:---:|---|
| **1** | **Vượt hạn ngạch bộ nhớ Chrome Storage** (5MB Storage Quota) | **CAO** | Trung bình | Kích hoạt quyền `unlimitedStorage` trong Manifest; Phân vùng khóa lưu trữ; Thuật toán dọn dẹp LRU cho snapshot cũ. |
| **2** | **Rò rỉ bộ nhớ khi mở nhiều biểu đồ** (Memory Leaks) | **CAO** | Trung bình | Tuyệt đối không giữ tham chiếu mạnh (Strong References) tới `chartWidget` đã unmount; Hủy đăng ký listener khi đổi mã. |
| **3** | **Xung đột luồng khi chuyển mã liên tục** (Race Conditions) | **RẤT CAO** | **CAO** | Sử dụng cơ chế mã thế hệ đơn điệu tăng dần (**Generation ID**) để từ chối các snapshot trễ (Stale Snapshots). |
| **4** | **Mất dữ liệu do FireAnt hủy DOM biểu đồ** (DOM Eviction) | **CAO** | **CAO** | Tự động snapshot vào `chrome.storage.local` ngay trước khi chuyển tab; Đánh dấu `isOpened = false` nhưng bảo toàn snapshot. |
| **5** | **Nghẽn hiệu năng do tuần tự hóa JSON lớn** (Serialization Overhead) | Trung bình | Thấp | Lọc bỏ thuộc tính thừa (Deep Pruning); Debounce tần suất trích xuất ($300\text{ms}$ - $500\text{ms}$); Chỉ truyền dữ liệu thay đổi. |
| **6** | **Service Worker MV3 bị ngủ đông** (Worker Inactivity) | Trung bình | **CAO** | Lưu trạng thái liên tục trong `chrome.storage.local`; Side Panel tự động khôi phục state từ Storage khi khởi động lại. |
| **7** | **Rò rỉ thông tin riêng tư & Token người dùng** (Privacy & Security) | **RẤT CAO** | Thấp | Tuyệt đối không truy cập hoặc log các key chứa JWT, email, phone trong `localStorage` FireAnt; Chỉ đọc `persist:watchlists`. |
| **8** | **Tràn RAM khi tuần tự hóa tệp xuất lớn** (Export Heap Spike) | Trung bình | Thấp | Đọc từ Storage (không gọi FireAnt); Lọc bỏ trường rác; Tạo Blob trực tiếp từ chuỗi JSON duy nhất và giải phóng `URL.revokeObjectURL`. |
| **9** | **Không nhất quán bản chụp lưu trữ khi đang xuất** (Storage Inconsistency) | Trung bình | Trung bình | Đọc toàn bộ snapshot trong một lần gọi nguyên tử `browser.storage.local.get(null)` để thu được bản chụp nhất quán tại thời điểm xuất. |
| **10** | **Xung đột quyền Chrome Download** (Permission Friction) | Trung bình | Thấp | Sử dụng cơ chế Web API tiêu chuẩn (`Blob` + `<a download="...">`) trong Side Panel, **không xin quyền `"downloads"`** trong Manifest. |
| **11** | **Xung đột phiên bản Schema tệp Xuất** (Schema Version Mismatch) | **CAO** | Trung bình | Tách rời tệp xuất khỏi schema Storage nội bộ bằng envelope `schemaVersion: 1`; Có Zod schema kiểm thực trước khi ghi tệp. |
| **12** | **Rò rỉ thông tin đăng nhập trong tệp xuất JSON** (Credential Leak in Export) | **RẤT CAO** | Thấp | Áp dụng cơ chế **Allowlist Sanitization** bắt buộc; Kiểm tra Blacklist loại trừ từ khóa `token`, `cookie`, `password`, `email`. |

---

## 3. PHÂN TÍCH CHI TIẾT VÀ GIẢI PHÁP THỰC THI

### 3.1. RỦI RO 1: HẠN NGẠCH BỘ NHỚ LƯU TRỮ (CHROME STORAGE QUOTA)
- **Bản chất rủi ro:** Mặc định, Chrome Extension Manifest V3 giới hạn `chrome.storage.local` ở mức $5\text{MB}$ ($5,242,880$ bytes). Khi người dùng theo dõi $50$ - $100$ mã cổ phiếu, mỗi mã lưu hàng chục nét vẽ và nhiều chỉ báo ở các khung thời gian khác nhau, dung lượng có thể vượt ngưỡng $5\text{MB}$, dẫn đến lỗi `QUOTA_BYTES exceeded` và hệ thống ngừng lưu dữ liệu mới.
- **Giải pháp phòng ngừa:**
  1. **Cấp quyền không giới hạn:** Bổ sung quyền `"unlimitedStorage"` vào `wxt.config.ts`.
  2. **Phân vùng khóa lưu trữ (Partitioned Storage Keys):** Mỗi biểu đồ được lưu ở key riêng `chartSnapshots:<compositeKey>`.
  3. **Thuật toán giải phóng bộ nhớ (LRU Eviction):** Tự động dọn dẹp các snapshot của những mã chỉ có nguồn `FIREANT` không còn mở trong hơn 30 ngày.

---

### 3.2. RỦI RO 2: RÒ RỈ BỘ NHỚ KHI CHUYỂN ĐỔI BIỂU ĐỒ (MEMORY LEAKS)
- **Bản chất rủi ro:** Khi người dùng liên tục chuyển mã hoặc chuyển tab trên FireAnt, đối tượng TradingView `chartWidget` cũ có thể bị React component unmount. Nếu Extension giữ lại biến toàn cục trỏ đến widget hoặc không gỡ bỏ các hàm callback đã đăng ký (`onSymbolChange`, `onIntervalChange`), bộ thu gom rác (Garbage Collector) của V8 engine không thể giải phóng DOM và Model cũ, gây tràn RAM trình duyệt.
- **Giải pháp phòng ngừa:**
  1. **Không lưu trữ thực thể widget trong biến toàn cục vĩnh viễn:** Luôn truy xuất widget động qua getter an toàn.
  2. **Hủy đăng ký sự kiện trước khi đăng ký mới.**
  3. **Cô lập dữ liệu trong hàm thuần túy:** Extractor chỉ nhận model, trích xuất dữ liệu thô dạng JSON primitives (string, number, boolean) rồi giải phóng ngay tham chiếu model.

---

### 3.3. RỦI RO 3: XUNG ĐỘT DỮ LIỆU ĐẾN TRỄ KHI CHUYỂN MÃ NHANH (RACE CONDITIONS & GENERATION ID)
- **Bản chất rủi ro:** Người dùng bấm liên tục vào các mã trong Watchlist (ví dụ: `FPT` $\rightarrow$ `VIC` $\rightarrow$ `MWG` trong vòng 1 giây). Quá trình trích xuất snapshot của `FPT` có thể hoàn tất sau khi FireAnt đã chuyển sang `MWG`. Nếu không có cơ chế kiểm soát, snapshot của `FPT` có thể ghi đè nhầm vào ngữ cảnh của `MWG`.
- **Giải pháp phòng ngừa:**
  1. **Cơ chế Mã thế hệ đơn điệu tăng dần (Monotonic Generation ID):** Mỗi khi sự kiện đổi biểu đồ diễn ra, Main World Bridge tăng `currentGenerationId++`.
  2. **Bộ lọc từ chối snapshot lỗi thời (Stale Snapshot Rejection):** Chỉ xử lý bản snapshot có `generationId` trùng khớp với thế hệ hiện tại.

---

### 3.4. RỦI RO 4: MẤT DỮ LIỆU DO FIREANT HỦY DOM BIỂU ĐỒ (DOM EVICTION TRÊN SPA)
- **Bản chất rủi ro:** Trên FireAnt Single Page Application (SPA), khi người dùng chuyển sang trang khác, iframe chứa biểu đồ bị xóa khỏi DOM. Mọi dữ liệu chưa kịp đồng bộ sẽ bị mất khỏi RAM.
- **Giải pháp phòng ngừa:**
  1. **Bắt sự kiện trước khi hủy (Before Unload & Page Hide):** Lắng nghe sự kiện `visibilitychange` và `beforeunload`.
  2. **Chiến lược Snapshot Cache bền vững:** Dữ liệu luôn được lưu vào `chrome.storage.local`. Khi FireAnt unmount biểu đồ, Extension chỉ chuyển trạng thái trong Registry thành `isOpened = false`, tuyệt đối không xóa dữ liệu snapshot đã lưu.

---

### 3.5. RỦI RO 5: NGHẼN ĐƯỜNG TRUYỀN DỮ LIỆU DO TUẦN TỰ HÓA JSON LỚN
- **Bản chất rủi ro:** Khi biểu đồ chứa hàng trăm đường vẽ hoặc chỉ báo phức tạp với chuỗi plot dài, việc serialize đối tượng qua `window.postMessage` và `chrome.runtime.sendMessage` có thể làm khựng khung hình của trang web (drop FPS).
- **Giải pháp phòng ngừa:**
  1. **Lọc sạch dữ liệu rác (Data Pruning):** Chỉ trích xuất các thuộc tính cần thiết (`id`, `type`, `points`, `price`, `time`, `style`).
  2. **Tiết chế tần suất (Debouncing):** Áp dụng kỹ thuật so sánh chữ ký (Signature Diffing) chỉ phát sóng khi thực sự có nét vẽ thay đổi.

---

### 3.6. RỦI RO 6: SERVICE WORKER MANIFEST V3 BỊ TẮT ĐỘT NGỘT
- **Bản chất rủi ro:** Theo đặc tả của Chrome MV3, Background Service Worker sẽ tự động bị chấm dứt (terminated) sau 30 giây không có sự kiện để tiết kiệm tài nguyên. Biến toàn cục trong Service Worker sẽ bị xóa sạch.
- **Giải pháp phòng ngừa:**
  1. **Không dựa vào biến nhớ RAM trong Background:** Toàn bộ trạng thái quan trọng (`stockRegistry`, `activeContext`) luôn được đọc/ghi trực tiếp từ `chrome.storage.local`.
  2. **Tự động phục hồi trạng thái:** Khi Service Worker được đánh thức, nó đọc lại trạng thái từ Storage trước khi xử lý logic tiếp theo.

---

### 3.7. RỦI RO 7: BẢO MẬT VÀ QUYỀN RIÊNG TƯ NGƯỜI DÙNG (DATA PRIVACY & TOKENS)
- **Bản chất rủi ro:** `localStorage` của FireAnt chứa các token xác thực cá nhân (`jwtToken`, `refreshToken`, `userInfo`, `userName`, email, số điện thoại). Nếu Extension trích xuất nhầm hoặc log các thông tin này ra console, sẽ vi phạm nghiêm trọng chính sách bảo mật.
- **Giải pháp phòng ngừa:**
  1. **Chỉ truy cập đúng khóa cho phép:** Watchlist Extractor chỉ được phép đọc duy nhất khóa `localStorage.getItem('persist:watchlists')`.
  2. **Khử trùng dữ liệu (Sanitization):** Lọc bỏ mọi trường nhạy cảm như `userName`, `email`, `userId`.
  3. **Không ghi log thông tin xác thực.**

---

### 3.8. RỦI RO 8: TIÊU THỤ BỘ NHỚ VÀ TRÀN RAM KHI XUẤT TỆP JSON LỚN (EXPORT HEAP SPIKE)
- **Bản chất rủi ro:** Khi người dùng quản lý hơn 50 mã cổ phiếu, với hàng trăm hình vẽ và chỉ báo kỹ thuật, việc gộp toàn bộ vào một đối tượng JavaScript rồi gọi `JSON.stringify()` có thể tạo ra chuỗi văn bản kích thước 10MB - 30MB, làm đột biến bộ nhớ Heap của tiến trình Side Panel.
- **Giải pháp phòng ngừa:**
  1. **Đọc trực tiếp từ Storage:** `Export Data Collector` đọc trực tiếp từ Storage, không triệu gọi FireAnt runtime để tránh nhân đôi tài nguyên.
  2. **Deep Pruning trước khi chuỗi hóa:** Loại bỏ triệt để các trường trung gian hoặc undefined trước khi đưa vào Serializer.
  3. **Thu hồi tài nguyên ngay lập tức:** Tạo `Blob` dạng UTF-8 và thu hồi Blob URL ngay sau khi click:
     ```typescript
     const url = URL.createObjectURL(blob);
     // click download
     URL.revokeObjectURL(url); // Giải phóng RAM trình duyệt ngay lập tức
     ```

---

### 3.9. RỦI RO 9: KHÔNG NHẤT QUÁN BẢN CHỤP KHI ĐANG XUẤT (STORAGE INCONSISTENCY DURING ACTIVE SYNC)
- **Bản chất rủi ro:** Trong lúc người dùng bấm nút "Export All JSON", tab FireAnt ở nền vẫn có thể đang nhận nến mới và kích hoạt đồng bộ snapshot cho một mã khác. Nếu các bản ghi được đọc bất đồng bộ lần lượt từng key, tệp xuất có thể chứa trạng thái không nhất quán giữa `StockRegistry` và các `chartSnapshots`.
- **Giải pháp phòng ngừa:**
  1. **Đọc nguyên tử một lần (Atomic Snapshot Read):** Trong Chrome Extension Storage, lệnh gọi `browser.storage.local.get(null)` trả về toàn bộ cây lưu trữ dưới dạng một bản chụp logic điểm thời gian (Point-in-Time Consistent View).
  2. **Khóa trạng thái trên giao diện Side Panel:** Khi quá trình xuất bắt đầu, nút chuyển sang trạng thái `Exporting` (disabled), ngăn chặn người dùng kích hoạt thao tác ghi mới từ Side Panel.

---

### 3.10. RỦI RO 10: XUNG ĐỘT QUYỀN TẢI XUỐNG CHROME DOWNLOAD (PERMISSION FRICTION)
- **Bản chất rủi ro:** Nếu sử dụng API `chrome.downloads.download()`, Manifest bắt buộc phải khai báo quyền `"downloads"`. Khi người dùng cài đặt extension, Chrome sẽ hiển thị cảnh báo bảo mật nguy hiểm: *"Quản lý tệp tải xuống của bạn"*, gây tâm lý e ngại và giảm tỷ lệ cài đặt.
- **Giải pháp phòng ngừa:**
  1. **Sử dụng cơ chế Web API tiêu chuẩn:** Side Panel là một trang HTML DOM hoàn chỉnh, có thể kích hoạt tải tệp thông qua thẻ neo ảo:
     ```typescript
     const a = document.createElement('a');
     a.href = URL.createObjectURL(blob);
     a.download = `stock-chart-extractor_all_${timestamp}.json`;
     document.body.appendChild(a);
     a.click();
     document.body.removeChild(a);
     ```
  2. **Tuyệt đối không xin thêm quyền:** Giữ nguyên danh sách quyền hiện tại (`storage`, `sidePanel`, `tabs`, `unlimitedStorage`), không thêm quyền `"downloads"`.

---

### 3.11. RỦI RO 11: TÍNH TƯƠNG THÍCH PHIÊN BẢN SCHEMA XUẤT (SCHEMA VERSIONING & COMPATIBILITY)
- **Bản chất rủi ro:** Khi cấu trúc lưu trữ nội bộ của Extension được tối ưu hóa trong tương lai, nếu tệp xuất phụ thuộc vào schema nội bộ, các tệp JSON xuất ra trong quá khứ sẽ không thể đọc được bởi các công cụ phân tích hoặc tính năng Import trong tương lai.
- **Giải pháp phòng ngừa:**
  1. **Phong bì dữ liệu độc lập (Decoupled Envelope):** Tệp xuất tuân theo schema riêng có trường bắt buộc `schemaVersion: 1`.
  2. **Kiểm thực bằng Zod trước khi xuất:** `Export Validator` sử dụng `ExportAllDataEnvelopeSchema` để đảm bảo tệp xuất luôn đúng chuẩn giao ước.

---

### 3.12. RỦI RO 12: NGUY CƠ RÒ RỈ THÔNG TIN ĐĂNG NHẬP TRONG TỆP XUẤT JSON (CREDENTIAL LEAK)
- **Bản chất rủi ro:** Người dùng xuất tệp JSON để chia sẻ với người khác hoặc lưu trữ lên kho lưu trữ ngoài. Nếu trong tệp xuất vô tình chứa token đăng nhập FireAnt, cookie phiên hoặc số điện thoại/email, người nhận tệp có thể chiếm đoạt tài khoản FireAnt của người dùng.
- **Giải pháp phòng ngừa:**
  1. **Áp dụng cơ chế Danh sách trường cho phép (Strict Allowlist):** Mọi object trước khi serialize phải đi qua hàm lọc trường allowlist. Bất kỳ trường nào không có trong danh mục đều bị loại bỏ.
  2. **Bộ lọc quét từ khóa nhạy cảm (Sanitization Regex):** Tự động quét toàn bộ chuỗi JSON trước khi tạo Blob; nếu phát hiện các từ khóa cấm (`jwt`, `Bearer`, `password`, `secret`), hệ thống hủy bỏ tiến trình xuất và báo lỗi `SECURITY_VIOLATION`.
