# ĐÁNH GIÁ RỦI RO KỸ THUẬT & MA TRẬN PHÒNG NGỪA (TECHNICAL RISKS & MITIGATION)

**Dự án:** Stock Chart Extractor – Multi-Stock Management Architecture  
**Tài liệu:** Đánh giá các rủi ro kỹ thuật tiềm ẩn trong môi trường Runtime FireAnt và giải pháp phòng ngừa  
**Phiên bản:** 2.0  
**Ngày khởi tạo:** 17/11/2026  
**Trạng thái kiểm duyệt:** RISK ANALYSIS (Ready for Review)

---

## 1. TỔNG QUAN

Khi mở rộng hệ thống Stock Chart Extractor từ chế độ đơn mã sang quản lý đa mã cổ phiếu, hệ thống phải xử lý đồng thời nhiều biểu đồ, tần suất thay đổi ngữ cảnh cao, và lưu trữ khối lượng lớn các đối tượng vẽ cũng như chỉ báo kỹ thuật.

Tài liệu này xác định 7 rủi ro kỹ thuật trọng yếu và đề xuất các giải pháp kỹ thuật cụ thể đã được kiểm chứng.

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

---

## 3. PHÂN TÍCH CHI TIẾT VÀ GIẢI PHÁP THỰC THI

### 3.1. RỦI RO 1: HẠN NGẠCH BỘ NHỚ LƯU TRỮ (CHROME STORAGE QUOTA)

- **Bản chất rủi ro:** Mặc định, Chrome Extension Manifest V3 giới hạn `chrome.storage.local` ở mức $5\text{MB}$ ($5,242,880$ bytes). Khi người dùng theo dõi $50$ - $100$ mã cổ phiếu, mỗi mã lưu hàng chục nét vẽ và nhiều chỉ báo ở các khung thời gian khác nhau, dung lượng có thể vượt ngưỡng $5\text{MB}$, dẫn đến lỗi `QUOTA_BYTES exceeded` và hệ thống ngừng lưu dữ liệu mới.
- **Giải pháp phòng ngừa:**
  1. **Cấp quyền không giới hạn:** Bổ sung quyền `"unlimitedStorage"` vào `wxt.config.ts`:
     ```typescript
     manifest: {
       permissions: ['storage', 'sidePanel', 'tabs', 'unlimitedStorage'],
     }
     ```
  2. **Phân vùng khóa lưu trữ (Partitioned Storage Keys):**
     - Thay vì lưu tất cả vào một mảng khổng lồ, mỗi biểu đồ được lưu ở key riêng `chartSnapshots:<compositeKey>`.
  3. **Thuật toán giải phóng bộ nhớ (LRU Eviction):**
     - Khi số lượng snapshot vượt quá $200$ bản ghi, hệ thống tự động xóa bớt các snapshot của những mã chỉ có nguồn `FIREANT` đã không còn được mở trong hơn 30 ngày.

---

### 3.2. RỦI RO 2: RÒ RỈ BỘ NHỚ KHI CHUYỂN ĐỔI BIỂU ĐỒ (MEMORY LEAKS)

- **Bản chất rủi ro:** Khi người dùng liên tục chuyển mã hoặc chuyển tab trên FireAnt, đối tượng TradingView `chartWidget` cũ có thể bị React component unmount. Nếu Extension giữ lại biến toàn cục trỏ đến widget hoặc không gỡ bỏ các hàm callback đã đăng ký (`onSymbolChange`, `onIntervalChange`), bộ thu gom rác (Garbage Collector) của V8 engine không thể giải phóng DOM và Model cũ, gây tràn RAM trình duyệt.
- **Giải pháp phòng ngừa:**
  1. **Không lưu trữ thực thể widget trong biến toàn cục vĩnh viễn:** Luôn truy xuất widget động qua getter an toàn:
     ```typescript
     function getActiveChartWidget(): any {
       const iframe = document.querySelector('iframe[id*="tradingview"]') as HTMLIFrameElement;
       return iframe?.contentWindow?.chartWidget || (window as any).chartWidget || null;
     }
     ```
  2. **Hủy đăng ký sự kiện trước khi đăng ký mới:**
     - Lưu trữ subscription token và gọi hàm `unsubscribe()` khi biểu đồ thay đổi.
  3. **Cô lập dữ liệu trong hàm thuần túy:** Extractor chỉ nhận model, trích xuất dữ liệu thô dạng JSON primitives (string, number, boolean) rồi giải phóng ngay tham chiếu model.

---

### 3.3. RỦI RO 3: XUNG ĐỘT DỮ LIỆU ĐẾN TRỄ KHI CHUYỂN MÃ NHANH (RACE CONDITIONS & GENERATION ID)

- **Bản chất rủi ro:** Người dùng bấm liên tục vào các mã trong Watchlist (ví dụ: `FPT` $\rightarrow$ `VIC` $\rightarrow$ `MWG` trong vòng 1 giây). Quá trình trích xuất snapshot của `FPT` có thể mất $200\text{ms}$ và hoàn tất sau khi FireAnt đã chuyển sang `MWG`. Nếu không có cơ chế kiểm soát, snapshot của `FPT` có thể ghi đè nhầm vào ngữ cảnh của `MWG` hoặc cập nhật trạng thái UI sai lệch.
- **Giải pháp phòng ngừa:**
  1. **Cơ chế Mã thế hệ đơn điệu tăng dần (Monotonic Generation ID):**
     - Mỗi khi sự kiện đổi biểu đồ diễn ra, Main World Bridge tăng `currentGenerationId++`.
     - Bản snapshot khi gửi đi bắt buộc phải mang theo `generationId` lúc bắt đầu trích xuất.
  2. **Bộ lọc từ chối snapshot lỗi thời (Stale Snapshot Rejection):**
     ```typescript
     let currentGenerationId = 0;

     export function notifyChartChanged(newContext: ChartContextId) {
       currentGenerationId++;
       const thisGen = currentGenerationId;

       // Bắt đầu trích xuất bất đồng bộ
       setTimeout(() => {
         if (thisGen !== currentGenerationId) {
           console.warn(`[Sync Engine] Stale extraction discarded for gen ${thisGen}, current is ${currentGenerationId}`);
           return;
         }
         // Chỉ gửi đi nếu generationId vẫn trùng khớp
         performSnapshotExtraction(newContext, thisGen);
       }, 150);
     }
     ```

---

### 3.4. RỦI RO 4: MẤT DỮ LIỆU DO FIREANT HỦY DOM BIỂU ĐỒ (DOM EVICTION TRÊN SPA)

- **Bản chất rủi ro:** Trên FireAnt Single Page Application (SPA), khi người dùng chuyển sang trang khác (ví dụ từ Biểu đồ sang Tin tức, Bảng giá, hoặc Chuyển tab workspace), iframe chứa biểu đồ bị xóa khỏi DOM. Mọi dữ liệu chưa kịp đồng bộ sẽ bị mất vĩnh viễn khỏi RAM.
- **Giải pháp phòng ngừa:**
  1. **Bắt sự kiện trước khi hủy (Before Unload & Page Hide):**
     - Lắng nghe sự kiện `visibilitychange` và `beforeunload` trên window để kích hoạt sync khẩn cấp các thay đổi chưa lưu.
  2. **Chiến lược Snapshot Cache bền vững:**
     - Dữ liệu luôn được lưu vào `chrome.storage.local`. Khi FireAnt unmount biểu đồ, Extension chỉ chuyển trạng thái trong Registry thành `isOpened = false`, tuyệt đối không xóa dữ liệu snapshot đã lưu.
     - Khi người dùng mở lại mã đó, Side Panel lập tức hiển thị lại các nét vẽ và chỉ báo từ bộ nhớ đệm trước đó.

---

### 3.5. RỦI RO 5: NGHẼN ĐƯỜNG TRUYỀN DỮ LIỆU DO TUẦN TỰ HÓA JSON LỚN

- **Bản chất rủi ro:** Khi biểu đồ chứa hàng trăm đường vẽ hoặc chỉ báo phức tạp với chuỗi plot dài, việc serialize đối tượng qua `window.postMessage` và `chrome.runtime.sendMessage` có thể làm khựng khung hình của trang web (drop FPS).
- **Giải pháp phòng ngừa:**
  1. **Lọc sạch dữ liệu rác (Data Pruning):**
     - Chỉ trích xuất các thuộc tính cần thiết (`id`, `type`, `points`, `price`, `time`, `style`).
     - Loại bỏ các con trỏ hàm, các thuộc tính DOM, hoặc các mảng cache nội bộ của TradingView.
  2. **Tiết chế tần suất (Debouncing):**
     - Áp dụng kỹ thuật debounce với thời gian chờ $300\text{ms}$ - $500\text{ms}$ đối với các thao tác vẽ liên tục.

---

### 3.6. RỦI RO 6: SERVICE WORKER MANIFEST V3 BỊ TẮT ĐỘT NGỘT

- **Bản chất rủi ro:** Theo đặc tả của Chrome MV3, Background Service Worker sẽ tự động bị chấm dứt (terminated) sau 30 giây không có sự kiện để tiết kiệm tài nguyên. Biến toàn cục trong Service Worker sẽ bị xóa sạch.
- **Giải pháp phòng ngừa:**
  1. **Không dựa vào biến nhớ RAM trong Background:**
     - Toàn bộ trạng thái quan trọng (`stockRegistry`, `activeContext`) luôn được đọc/ghi trực tiếp từ `chrome.storage.local`.
  2. **Tự động phục hồi trạng thái:**
     - Khi Service Worker được đánh thức bởi một message mới, nó đọc lại trạng thái từ Storage trước khi xử lý logic tiếp theo.

---

### 3.7. RỦI RO 7: BẢO MẬT VÀ QUYỀN RIÊNG TƯ NGƯỜI DÙNG (DATA PRIVACY & TOKENS)

- **Bản chất rủi ro:** `localStorage` của FireAnt chứa các token xác thực cá nhân (`jwtToken`, `refreshToken`, `userInfo`, `userName`, email, số điện thoại). Nếu Extension trích xuất nhầm hoặc log các thông tin này ra console, sẽ vi phạm nghiêm trọng chính sách bảo mật và tiêu chuẩn an toàn của người dùng.
- **Giải pháp phòng ngừa:**
  1. **Chỉ truy cập đúng khóa cho phép:**
     - Watchlist Extractor chỉ được phép đọc duy nhất khóa `localStorage.getItem('persist:watchlists')`.
     - Nghiêm cấm truy cập bất kỳ khóa nào khác như `persist:auth`, `user`, `token`.
  2. **Khử trùng dữ liệu (Sanitization):**
     - Lọc bỏ mọi trường nhạy cảm như `userName`, `email`, `userId` trước khi gửi dữ liệu sang Side Panel hoặc lưu vào Storage.
  3. **Không ghi log thông tin xác thực:**
     - Kiểm tra toàn bộ mã nguồn để đảm bảo không có lệnh `console.log` nào in nội dung nhạy cảm của người dùng.
