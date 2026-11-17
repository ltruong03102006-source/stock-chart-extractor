# KẾ HOẠCH TRIỂN KHAI THEO GIAI ĐOẠN (IMPLEMENTATION PLAN)

**Dự án:** Stock Chart Extractor – Multi-Stock Management Architecture  
**Tài liệu:** Kế hoạch thực thi chi tiết chia thành 5 Sprint phát triển, kiểm thử, tích hợp Phân hệ Xuất JSON Toàn diện và nghiệm thu  
**Phiên bản:** 2.1  
**Ngày cập nhật:** 17/11/2026  
**Trạng thái kiểm duyệt:** ROADMAP SPECIFICATION (Export All JSON Integrated)

---

## 1. TỔNG QUAN TIẾN ĐỘ VÀ NGUYÊN TẮC THỰC THI

Toàn bộ quá trình chuyển đổi Stock Chart Extractor sang kiến trúc Multi-Stock được tổ chức thành **5 Sprint phát triển lũy tiến (Progressive Sprints)**.

### Các nguyên tắc thực thi bất biến:
1. **Không phá vỡ chức năng đang chạy (Zero Regression):** Mỗi sprint bổ sung mã mới phải đảm bảo mã nguồn hiện tại biên dịch thành công (`npm run compile` không lỗi, `npm run build` không lỗi, `npm test` vượt qua 100%).
2. **Bảo tồn các Extractor cốt lõi:** Không sửa đổi thuật toán trích xuất hình học trong `src/extractors/` đã được kiểm chứng hoạt động.
3. **Kiểm thử tại chỗ (Automated & Manual Verification):** Mỗi sprint phải có các kịch bản kiểm thử rõ ràng với tiêu chí nghiệm thu cụ thể trước khi chuyển sang sprint tiếp theo.
4. **Quy chuẩn Xuất JSON Độc lập (Export Isolation):** Phân hệ Export All JSON chỉ tương tác thông qua `StorageRepository`, tuyệt đối không thăm dò hay làm chậm tiến trình DOM của FireAnt.

---

## 2. CHI TIẾT CÁC SPRINT PHÁT TRIỂN

### SPRINT 1: CHART TAB DISCOVERY & UNIFIED STOCK REGISTRY
*Mục tiêu: Xây dựng nền tảng phát hiện biểu đồ từ FireAnt và module quản lý danh bạ mã Stock Registry.*

- **Phạm vi công việc:**
  1. Xây dựng module `src/registry/stock-registry.ts` xử lý logic thuần của Stock Registry (thêm, xóa, auto-link, bảo toàn nguồn).
  2. Bổ sung `Chart Tab Detector` và `Active Chart Tracker` trong Main World Bridge (`entrypoints/fireant-bridge.content.ts`).
  3. Cập nhật các thông điệp định tuyến trong `src/messaging/message.types.ts` và `src/messaging/message.schemas.ts`.
  4. Cấu hình Background Service Worker để lưu trữ và cập nhật `stockRegistry` vào `chrome.storage.local`.
- **Danh sách File cần tạo / cập nhật:**
  - `src/registry/stock-registry.types.ts` *(Mới)*
  - `src/registry/stock-registry.ts` *(Mới)*
  - `src/messaging/message.types.ts` *(Cập nhật)*
  - `src/messaging/message.schemas.ts` *(Cập nhật)*
  - `entrypoints/fireant-bridge.content.ts` *(Cập nhật)*
  - `entrypoints/background.ts` *(Cập nhật)*
- **Phụ thuộc (Dependencies):** Không phụ thuộc sprint khác.
- **Kịch bản kiểm thử (Test Cases):**
  - *TC1.1:* Mở FireAnt với biểu đồ FPT -> Extension tự động ghi nhận mã `FPT` với `sources=['FIREANT']`, `isOpened=true`, `isActive=true`.
  - *TC1.2:* Người dùng nhập thủ công mã `VIC` -> Registry thêm mã `VIC` với `sources=['EXTENSION']`, `isOpened=false`, `isActive=false`.
  - *TC1.3:* Người dùng mở tiếp biểu đồ `VIC` trên FireAnt -> Auto-linking kích hoạt, mã `VIC` chuyển thành `sources=['EXTENSION', 'FIREANT']`, `isOpened=true`, `isActive=true`.
  - *TC1.4:* Người dùng bấm xóa mã `VIC` -> Nguồn `EXTENSION` bị gỡ bỏ, mã `VIC` vẫn được giữ trong Registry vì đang mở trên FireAnt.
- **Tiêu chí nghiệm thu (Acceptance Criteria):**
  - `chrome.storage.local.get('stockRegistry')` phản ánh chính xác cấu trúc dữ liệu theo `StockRegistryStateSchema`.
  - Không có cảnh báo hoặc lỗi type trong `npm run compile`.
- **Rủi ro & Giới hạn:**
  - FireAnt thay đổi cấu trúc DOM khiến việc lắng nghe `onSymbolChange` bị trễ $\rightarrow$ Giải pháp: Kèm fallback polling định kỳ 1.5 giây.

---

### SPRINT 2: MULTI-STOCK DRAWING EXTRACTION & ISOLATED STORAGE
*Mục tiêu: Đưa Drawing Extractor hiện có vào mô hình trích xuất đa mã cô lập và lưu trữ phân vùng.*

- **Phạm vi công việc:**
  1. Xây dựng hàm tạo Composite Key (`symbol_exchange_timeframe`).
  2. Nâng cấp `entrypoints/fireant-bridge.content.ts` để khi kích hoạt trích xuất Drawings, nó đóng gói kèm theo `ChartContextId` và `generationId`.
  3. Tái sử dụng 100% `src/extractors/` (Horizontal line, Trendline, Rectangle, Fallback).
  4. Cấu hình Background Service Worker để lưu trữ bản snapshot vào key riêng biệt: `chartSnapshots:<compositeKey>`.
  5. Cập nhật `chartContexts` tóm tắt trong `StockRegistry` (số lượng drawings, thời điểm sync).
- **Danh sách File cần tạo / cập nhật:**
  - `src/models/chart-snapshot.types.ts` *(Mới)*
  - `src/storage/storage-repository.ts` *(Mới)*
  - `entrypoints/fireant-bridge.content.ts` *(Cập nhật)*
  - `entrypoints/background.ts` *(Cập nhật)*
- **Phụ thuộc:** Hoàn thành Sprint 1.
- **Kịch bản kiểm thử (Test Cases):**
  - *TC2.1:* Vẽ 1 đường ngang trên FPT (khung 15m), kích hoạt sync -> Storage xuất hiện key `chartSnapshots:FPT_HOSE_15` chứa đúng 1 đối tượng vẽ.
  - *TC2.2:* Chuyển sang biểu đồ FPT (khung 1D), vẽ 1 hình chữ nhật, kích hoạt sync -> Storage xuất hiện thêm key `chartSnapshots:FPT_HOSE_D` chứa hình chữ nhật. Dữ liệu của key `FPT_HOSE_15` hoàn toàn không bị ảnh hưởng.
  - *TC2.3:* Chuyển sang mã VIC, vẽ trendline -> Snapshot của VIC được lưu riêng biệt vào `chartSnapshots:VIC_HOSE_D`.
- **Tiêu chí nghiệm thu:**
  - Mỗi ngữ cảnh biểu đồ lưu trữ thành công trong partition độc lập mà không đè chéo dữ liệu của nhau.
  - Quá trình trích xuất hoàn tất dưới 100ms.
- **Rủi ro & Giới hạn:**
  - Người dùng chuyển mã liên tục $\rightarrow$ Giải pháp: Sử dụng `generationId` để loại bỏ các bản snapshot đến muộn (stale snapshots).

---

### SPRINT 3: INDICATOR EXTRACTION & MULTI-STOCK SYNC
*Mục tiêu: Tích hợp module Indicator Extractor vào mô hình đa mã, trích xuất song song với đối tượng vẽ.*

- **Phạm vi công việc:**
  1. Tích hợp `src/extractors/indicators/indicator.extractor.ts` vào quy trình trích xuất snapshot của `fireant-bridge.content.ts`.
  2. Bóc tách danh sách các study (`allStudies()`) của biểu đồ đang active.
  3. Đóng gói indicators vào trường `indicators` của `IsolatedChartSnapshot`.
  4. Cập nhật số lượng chỉ báo (`indicatorsCount`) vào `StockRegistry`.
- **Danh sách File cần tạo / cập nhật:**
  - `entrypoints/fireant-bridge.content.ts` *(Cập nhật)*
  - `src/messaging/message.schemas.ts` *(Cập nhật)*
  - `entrypoints/background.ts` *(Cập nhật)*
- **Phụ thuộc:** Hoàn thành Sprint 2.
- **Kịch bản kiểm thử (Test Cases):**
  - *TC3.1:* Thêm chỉ báo MA 20 và RSI 14 trên FPT -> Snapshot `chartSnapshots:FPT_HOSE_15` lưu trữ đủ 2 chỉ báo cùng với các nét vẽ.
  - *TC3.2:* Chuyển sang VIC chỉ có MACD -> Snapshot `chartSnapshots:VIC_HOSE_D` lưu đúng chỉ báo MACD, không lẫn MA 20 của FPT.
- **Tiêu chí nghiệm thu:**
  - Snapshot chứa đầy đủ cả `drawings` và `indicators` của đúng mã và khung thời gian tương ứng.
- **Rủi ro & Giới hạn:**
  - Một số custom study của FireAnt có thể chứa hàm đệ quy không thể serialize $\rightarrow$ Giải pháp: Giữ nguyên cơ chế làm sạch dữ liệu trong `indicator.extractor.ts`.

---

### SPRINT 4: GLOBAL WATCHLIST, TARGET SIDE PANEL UI & EXPORT ALL JSON
*Mục tiêu: Độc lập hóa dữ liệu Watchlist toàn cục, hoàn thiện giao diện Side Panel 2 khu vực và triển khai tính năng Xuất toàn bộ dữ liệu ra 1 tệp JSON duy nhất.*

- **Phạm vi công việc:**
  1. **Độc lập hóa Watchlist:** Trích xuất từ `localStorage.getItem('persist:watchlists')` và lưu thẳng vào key `globalWatchlist`. Tuyệt đối không sao chép vào snapshot biểu đồ.
  2. **Giao diện Side Panel 2 khu vực:**
     - Khu vực A (Stock Manager): Ô nhập mã, danh sách mã, huy hiệu trạng thái (Active / Opened / Manual), nút xóa.
     - Khu vực B (Selected Stock Detail): Tiêu đề chi tiết, 3 tab: Drawings, Indicators, Watchlist.
  3. **Phân hệ Xuất Toàn diện (Export All JSON):**
     - Xây dựng `Export Data Collector`: Đọc nhất quán từ `StorageRepository` (`stockRegistry`, tất cả `chartSnapshots`, `globalWatchlist`).
     - Xây dựng `Export Serializer`: Chuyển đổi sang Envelope v1, format ISO 8601 kèm múi giờ, áp dụng bộ lọc trường an toàn (Security Allowlist Sanitization) khử trùng token, cookie, password.
     - Xây dựng `Export Validator`: Kiểm thực cấu trúc theo `ExportAllDataEnvelopeSchema` và tính toàn vẹn tham chiếu.
     - Xây dựng `Export Downloader`: Tạo tệp UTF-8 JSON Blob và kích hoạt tải về qua DOM `a[download]` (không cần thêm quyền Chrome).
     - Xây dựng `Export Manager`: Điều phối quy trình và quản lý 4 trạng thái giao diện Side Panel: `Idle`, `Exporting`, `Success`, `Error`.
- **Danh sách File cần tạo / cập nhật:**
  - `src/export/export.types.ts` *(Mới)*
  - `src/export/export-collector.ts` *(Mới)*
  - `src/export/export-serializer.ts` *(Mới)*
  - `src/export/export-validator.ts` *(Mới)*
  - `src/export/export-downloader.ts` *(Mới)*
  - `src/export/export-manager.ts` *(Mới)*
  - `entrypoints/sidepanel/index.html` *(Cập nhật trạng thái nút Export All JSON)*
  - `entrypoints/sidepanel/main.ts` *(Gắn Export Manager vào sự kiện click)*
- **Phụ thuộc:** Hoàn thành Sprint 1, 2, 3.
- **Kịch bản kiểm thử (Test Cases):**
  - *TC4.1:* Khu vực Stock Manager hiển thị đúng danh sách các mã đang mở trên FireAnt và mã do người dùng tự nhập.
  - *TC4.2:* Click vào mã `VIC` trong Stock Manager -> Khu vực Detail ngay lập tức hiển thị Drawings và Indicators của mã `VIC`.
  - *TC4.3:* Chuyển qua Tab Watchlist -> Hiển thị danh mục theo dõi toàn cục mà không phụ thuộc mã nào đang chọn.
  - *TC4.4:* Bấm Copy JSON trên từng tab -> Clipboard nhận đúng cấu trúc JSON của tab đó.
  - *TC4.5 (Export):* Bấm "Export All JSON" khi có 3 mã quản lý -> Tải về duy nhất 1 tệp có định dạng tên `stock-chart-extractor_all_YYYY-MM-DD_HH-mm-ss.json` chứa đủ 4 nhóm: `metadata`, `stockRegistry`, `chartSnapshots`, `watchlist`.
  - *TC4.6 (Export Completeness):* Mã có biểu đồ mở nhưng chưa vẽ hình nào -> Được ghi nhận trạng thái `"EMPTY"`, không bị đánh dấu lỗi.
  - *TC4.7 (Export Security):* Kiểm tra tệp JSON đã xuất -> Xác nhận không chứa bất kỳ token, jwt, cookie, password hay thông tin cá nhân nào của người dùng.
  - *TC4.8 (UI States):* Khi đang xuất dữ liệu, nút bị disable hiển thị `⏳ Đang đóng gói...`; khi hoàn tất hiển thị `✓ Đã tải...` và tự reset sau 3s.
- **Tiêu chí nghiệm thu:**
  - Tệp JSON xuất ra đúng chuẩn Envelope v1 và vượt qua Zod schema validation.
  - Quá trình xuất diễn ra mượt mà, không giật lag giao diện, không làm treo tab FireAnt.
- **Rủi ro & Giới hạn:**
  - Dữ liệu Watchlist có kích thước lớn $\rightarrow$ Giải pháp: Tối ưu hóa chuỗi hóa JSON và giải phóng blob URL ngay sau khi click download.

---

### SPRINT 5: INTEGRATION, RESILIENCE, EXPORT VALIDATION & REGRESSION TESTING
*Mục tiêu: Kiểm thử tích hợp toàn diện, kiểm tra rò rỉ bộ nhớ, kiểm tra sức chịu tải của phân hệ Export và đóng gói bản phát hành.*

- **Phạm vi công việc:**
  1. Kiểm thử di chuyển dữ liệu (Migration) từ các bản MVP trước đó sang schema v2.0.
  2. Kiểm thử sức chịu tải trong trường hợp chia màn hình (Multi-Chart Split View: 2 hoặc 4 biểu đồ).
  3. Kiểm thử phân hệ Export với cơ sở dữ liệu lớn (> 50 mã, hàng trăm nét vẽ).
  4. Kiểm thử khả năng phục hồi khi tab FireAnt bị reload, crash hoặc đóng đột ngột.
  5. Chạy bộ kiểm tra tự động `npm test`, `npm run compile` và `npm run build` tạo gói đóng gói `.output/chrome-mv3`.
  6. Cập nhật tài liệu hướng dẫn và báo cáo kỹ thuật.
- **Danh sách File cần tạo / cập nhật:**
  - `tests/test-export-pipeline.ts` *(Mới - Kiểm thử toàn trình Export)*
  - `docs/MIGRATION_GUIDE.md` *(Mới)*
  - `README.md` *(Cập nhật tài liệu sản phẩm)*
- **Phụ thuộc:** Hoàn thành toàn bộ Sprint 1 - 4.
- **Kịch bản kiểm thử (Test Cases):**
  - *TC5.1:* Mở layout 4 biểu đồ trên FireAnt (`FPT`, `VIC`, `MWG`, `VCB`) -> Extension phát hiện chính xác cả 4 biểu đồ và xác định đúng Active Chart.
  - *TC5.2:* Tắt trình duyệt, mở lại -> Dữ liệu lưu trong Chrome Local Storage vẫn toàn vẹn.
  - *TC5.3:* Kiểm tra kích thước RAM của Side Panel sau 1 giờ hoạt động liên tục -> Không có rò rỉ bộ nhớ (Memory Leak < 50MB).
  - *TC5.4 (Export Stress):* Kiểm thử xuất kho dữ liệu lớn gồm 50 mã và 500 hình vẽ -> Thời gian đóng gói và sinh tệp < 500ms, bộ nhớ RAM Side Panel tăng không quá 20MB.
  - *TC5.5 (Logical Snapshot Consistency):* Kích hoạt Export trong lúc tab FireAnt đang vẽ nét mới -> Bản snapshot xuất ra vẫn bảo toàn tính toàn vẹn logic điểm thời gian (Point-in-Time Consistency).
  - *TC5.6 (Export Resilience):* Mô phỏng dữ liệu snapshot bị hỏng khóa -> Export Validator phát hiện lỗi, hiển thị thông báo lỗi trên UI và không tải về tệp rác.
- **Tiêu chí nghiệm thu:**
  - 100% test case đạt yêu cầu (Pass).
  - Bản build độc lập chạy ổn định trên Google Chrome MV3.
