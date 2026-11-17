# KẾ HOẠCH TRIỂN KHAI THEO GIAI ĐOẠN (IMPLEMENTATION PLAN)

**Dự án:** Stock Chart Extractor – Multi-Stock Management Architecture  
**Tài liệu:** Kế hoạch thực thi chi tiết chia thành 5 Sprint phát triển, kiểm thử và nghiệm thu  
**Phiên bản:** 2.0  
**Ngày khởi tạo:** 17/11/2026  
**Trạng thái kiểm duyệt:** ROADMAP SPECIFICATION (Ready for Review)

---

## 1. TỔNG QUAN TIẾN ĐỘ VÀ NGUYÊN TẮC THỰC THI

Toàn bộ quá trình chuyển đổi Stock Chart Extractor sang kiến trúc Multi-Stock được tổ chức thành **5 Sprint phát triển lũy tiến (Progressive Sprints)**.

### Các nguyên tắc thực thi bất biến:
1. **Không phá vỡ chức năng đang chạy (Zero Regression):** Mỗi sprint bổ sung mã mới phải đảm bảo mã nguồn hiện tại biên dịch thành công (`npm run compile` không lỗi, `npm run build` không lỗi).
2. **Bảo tồn các Extractor cốt lõi:** Không sửa đổi thuật toán trích xuất hình học trong `src/extractors/` đã được kiểm chứng hoạt động.
3. **Kiểm thử tại chỗ (Automated & Manual Verification):** Mỗi sprint phải có các kịch bản kiểm thử rõ ràng với tiêu chí nghiệm thu cụ thể trước khi chuyển sang sprint tiếp theo.

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
  - `src/messaging/message.types.ts` *(Cập nhật - bổ sung message v2)*
  - `src/messaging/message.schemas.ts` *(Cập nhật - bổ sung Zod schemas v2)*
  - `entrypoints/fireant-bridge.content.ts` *(Cập nhật - tích hợp Tab Detector & Active Tracker)*
  - `entrypoints/background.ts` *(Cập nhật - xử lý lưu trữ `stockRegistry`)*
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
  - `src/storage/storage-repository.ts` *(Mới - quản lý partition keys và migration)*
  - `entrypoints/fireant-bridge.content.ts` *(Cập nhật - gọi Drawing Extractor và đính kèm context)*
  - `entrypoints/background.ts` *(Cập nhật - ghi snapshot phân vùng)*
- **Phụ thuộc:** Hoàn thành Sprint 1.
- **Kịch bản kiểm thử (Test Cases):**
  - *TC2.1:* Vẽ 1 đường ngang trên FPT (khung 15m), kích hoạt sync -> Storage xuất hiện key `chartSnapshots:FPT_HOSE_15` chứa đúng 1 đối tượng vẽ.
  - *TC2.2:* Chuyển sang biểu đồ FPT (khung 1D), vẽ 1 hình chữ nhật, kích hoạt sync -> Storage xuất hiện thêm key `chartSnapshots:FPT_HOSE_D` chứa hình chữ nhật. Dữ liệu của key `FPT_HOSE_15` hoàn toàn không bị ảnh hưởng.
  - *TC2.3:* Chuyển sang mã VIC, vẽ trendline -> Snapshot của VIC được lưu riêng biệt vào `chartSnapshots:VIC_HOSE_D`.
- **Tiêu chí nghiệm thu:**
  - Mỗi ngữ cảnh biểu đồ lưu trữ thành công trong partition độc lập mà không đè chéo dữ liệu của nhau.
  - Quá trình trích xuất hoàn tất dưới 100ms.
- **Rủi ro & Giới hạn:**
  - Khi người dùng vẽ rất nhanh và chuyển mã liên tục $\rightarrow$ Giải pháp: Sử dụng `generationId` để loại bỏ các bản snapshot đến muộn (stale snapshots).

---

### SPRINT 3: INDICATOR EXTRACTION & MULTI-STOCK SYNC
*Mục tiêu: Tích hợp module Indicator Extractor vào mô hình đa mã, trích xuất song song với đối tượng vẽ.*

- **Phạm vi công việc:**
  1. Tích hợp `src/extractors/indicators/indicator.extractor.ts` vào quy trình trích xuất snapshot của `fireant-bridge.content.ts`.
  2. Bóc tách danh sách các study (`allStudies()`) của biểu đồ đang active.
  3. Đóng gói indicators vào trường `indicators` của `IsolatedChartSnapshot`.
  4. Cập nhật số lượng chỉ báo (`indicatorsCount`) vào `StockRegistry`.
- **Danh sách File cần tạo / cập nhật:**
  - `entrypoints/fireant-bridge.content.ts` *(Cập nhật - tích hợp IndicatorExtractor)*
  - `src/messaging/message.schemas.ts` *(Đảm bảo schema snapshot chứa indicators)*
  - `entrypoints/background.ts` *(Kiểm tra định tuyến và cập nhật summary)*
- **Phụ thuộc:** Hoàn thành Sprint 2.
- **Kịch bản kiểm thử (Test Cases):**
  - *TC3.1:* Thêm chỉ báo MA 20 và RSI 14 trên FPT -> Snapshot `chartSnapshots:FPT_HOSE_15` lưu trữ đủ 2 chỉ báo cùng với các nét vẽ.
  - *TC3.2:* Chuyển sang VIC chỉ có MACD -> Snapshot `chartSnapshots:VIC_HOSE_D` lưu đúng chỉ báo MACD, không lẫn MA 20 của FPT.
- **Tiêu chí nghiệm thu:**
  - Snapshot chứa đầy đủ cả `drawings` và `indicators` của đúng mã và khung thời gian tương ứng.
- **Rủi ro & Giới hạn:**
  - Một số custom study của FireAnt có thể chứa hàm đệ quy không thể serialize $\rightarrow$ Giải pháp: Giữ nguyên cơ chế làm sạch dữ liệu trong `indicator.extractor.ts`.

---

### SPRINT 4: GLOBAL WATCHLIST DECOUPLING & TARGET SIDE PANEL UI
*Mục tiêu: Độc lập hóa dữ liệu Watchlist toàn cục và xây dựng giao diện Side Panel 2 khu vực.*

- **Phạm vi công việc:**
  1. Độc lập hóa Watchlist: Trích xuất từ `localStorage.getItem('persist:watchlists')` và lưu thẳng vào key `globalWatchlist`. Tuyệt đối không sao chép vào snapshot biểu đồ.
  2. Tái cấu trúc giao diện `entrypoints/sidepanel/index.html` và `main.ts` thành 2 khu vực:
     - **Khu vực A (Stock Manager):** Ô nhập mã thủ công, nút thêm mã, danh sách mã quản lý, trạng thái (Active / Opened / Manual), nút xóa.
     - **Khu vực B (Selected Stock Detail):** Tiêu đề mã và khung thời gian đang chọn, 3 Tab điều hướng:
       - Tab 1: Drawings (Lọc theo mã và timeframe đang chọn).
       - Tab 2: Indicators (Lọc theo mã và timeframe đang chọn).
       - Tab 3: Watchlist (Hiển thị danh sách toàn cục, danh mục nhóm, chuyển đổi nhóm).
  3. Cung cấp các nút: Copy Tab JSON, Export All Data JSON, và Request Sync.
- **Danh sách File cần tạo / cập nhật:**
  - `entrypoints/sidepanel/index.html` *(Tái cấu trúc HTML 2 khu vực)*
  - `entrypoints/sidepanel/main.ts` *(Viết lại logic render UI, quản lý state Side Panel)*
  - `entrypoints/sidepanel/style.css` *(Bổ sung giao diện hiện đại, responsive)*
- **Phụ thuộc:** Hoàn thành Sprint 1, 2, 3.
- **Kịch bản kiểm thử (Test Cases):**
  - *TC4.1:* Khu vực Stock Manager hiển thị đúng danh sách các mã đang mở trên FireAnt và mã do người dùng tự nhập.
  - *TC4.2:* Click vào mã `VIC` trong Stock Manager -> Khu vực Detail ngay lập tức tải và hiển thị Drawings và Indicators của mã `VIC`.
  - *TC4.3:* Chuyển qua Tab Watchlist -> Hiển thị danh mục theo dõi toàn cục mà không phụ thuộc vào việc mã nào đang được chọn ở Khu vực A.
  - *TC4.4:* Bấm Copy JSON trên từng tab -> Clipboard nhận đúng cấu trúc JSON của tab đó.
- **Tiêu chí nghiệm thu:**
  - Giao diện người dùng mượt mà, không giật lag.
  - Thao tác chuyển đổi giữa các mã và các tab phản hồi tức thì (< 50ms).
- **Rủi ro & Giới hạn:**
  - Số lượng mã theo dõi trong Watchlist quá lớn (> 500 mã) có thể làm chậm DOM render $\rightarrow$ Giải pháp: Render danh sách theo danh mục (Category filter).

---

### SPRINT 5: INTEGRATION, RESILIENCE & REGRESSION TESTING
*Mục tiêu: Kiểm thử tích hợp toàn diện, kiểm tra rò rỉ bộ nhớ, di chuyển dữ liệu cũ và đóng gói bản phát hành.*

- **Phạm vi công việc:**
  1. Kiểm thử di chuyển dữ liệu (Migration) từ các bản MVP trước đó sang schema v2.0.
  2. Kiểm thử sức chịu tải trong trường hợp chia màn hình (Multi-Chart Split View: 2 hoặc 4 biểu đồ).
  3. Kiểm thử khả năng phục hồi khi tab FireAnt bị reload, crash hoặc đóng đột ngột.
  4. Chạy bộ kiểm tra `npm run compile` và `npm run build` tạo gói đóng gói `.output/chrome-mv3`.
  5. Cập nhật tài liệu hướng dẫn và báo cáo kỹ thuật.
- **Danh sách File cần tạo / cập nhật:**
  - `docs/MIGRATION_GUIDE.md` *(Mới)*
  - `README.md` *(Cập nhật tài liệu sản phẩm)*
- **Phụ thuộc:** Hoàn thành toàn bộ Sprint 1 - 4.
- **Kịch bản kiểm thử (Test Cases):**
  - *TC5.1:* Mở layout 4 biểu đồ trên FireAnt (`FPT`, `VIC`, `MWG`, `VCB`) -> Extension phát hiện chính xác cả 4 biểu đồ và xác định đúng Active Chart.
  - *TC5.2:* Tắt trình duyệt, mở lại -> Dữ liệu lưu trong Chrome Local Storage vẫn toàn vẹn, Side Panel hiển thị ngay lập tức danh bạ mã và các snapshot đã lưu.
  - *TC5.3:* Kiểm tra kích thước RAM của Side Panel sau 1 giờ hoạt động liên tục -> Không có rò rỉ bộ nhớ (Memory Leak < 50MB).
- **Tiêu chí nghiệm thu:**
  - 100% test case đạt yêu cầu (Pass).
  - Bản build độc lập chạy ổn định trên Google Chrome MV3.
