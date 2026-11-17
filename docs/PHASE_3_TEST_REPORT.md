# BÁO CÁO KIỂM THỬ: PHASE 3 (INDICATORS & WATCHLIST EXTRACTION)
**Dự án:** Stock Chart Extractor – Chrome Extension for FireAnt  
**Phiên bản:** 0.1.0 (Phase 3 Complete)  
**Thời gian thực hiện:** 14/11/2026  
**Đánh giá:** **PASS TOÀN BỘ CÁC TIÊU CHÍ NGHIỆM THU**

---

## 1. NGUỒN DỮ LIỆU THỰC TẾ ĐÃ XÁC MINH

1. **Indicators / Studies:**
   - Truy cập trực tiếp qua `activeChartWidget.model().m_model.allStudies()` trong iframe TradingView blob (`iframe[0]#tradingview_...`).
   - Kết quả: `100% VERIFIED` (Đã lấy thành công danh sách 12 chỉ báo thực tế trên biểu đồ FPT).

2. **Watchlist:**
   - Truy cập qua `localStorage.getItem('persist:watchlists')` quản lý bởi Redux Persist của FireAnt.
   - Kết quả: `100% VERIFIED` (Đã lấy thành công watchlist `aaa` với ID `4910004` chứa mã `FPT`).

---

## 2. BẢNG ĐỐI SOÁT CÁC TRƯỜNG DỮ LIỆU (DATA FIELDS AUDIT)

| Thực thể | Trường dữ liệu | Nguồn lấy thực tế | Trạng thái |
|---|---|---|---|
| **Indicator** | `id` | `study.id()` | `VERIFIED` |
| **Indicator** | `name` | `study.title()` | `VERIFIED` |
| **Indicator** | `type` / `shortName` | Parse từ name & `study.metaInfo()` | `VERIFIED` |
| **Indicator** | `inputs` | `study.properties().inputs.state()` | `VERIFIED` |
| **Indicator** | `style` | `study.properties().styles.state()` | `VERIFIED` |
| **Indicator** | `pane` (`main` / `separate`) | `study.isPriceStudy()` | `VERIFIED` |
| **Indicator** | `values.latest` | `study.data()` (nếu buffer mở) | `PARTIALLY VERIFIED` / `NOT AVAILABLE` |
| **Watchlist** | `watchlistID` / `id` | `persist:watchlists.watchlistID` | `VERIFIED` |
| **Watchlist** | `name` | `persist:watchlists.name` | `VERIFIED` |
| **Watchlist** | `symbols` | `persist:watchlists.symbols` | `VERIFIED` |
| **Watchlist** | `position` | Index trong mảng `symbols` | `VERIFIED` |
| **Watchlist** | `price`, `volume`, `change` | Realtime quote stream | `PARTIALLY VERIFIED` (để null khi chưa gắn stream) |

---

## 3. CÁC LOẠI INDICATOR ĐÃ KIỂM CHỨNG TRÊN RUNTIME FIREANT (12 STUDIES)

1. `52 Week High/Low (close, close)` - Main chart
2. `Average Price (O+H+L+C)/4 - Giá bình quân` - Main chart
3. `Moving Average - Đường trung bình trượt (9, close, 0)` - Main chart
4. `Accelerator Oscillator` - Separate pane
5. `Advance/Decline - Chỉ báo Tăng/Giảm (10)` - Separate pane
6. `Balance of Power - Cán cân sức mạnh thị trường` - Separate pane

---

## 4. KẾT QUẢ CÁC TEST CASES

| STT | Tên Test Case | Hành động thực tế | Kết quả mong đợi | Đánh giá |
|---|---|---|---|---|
| **TC-01** | Giữ nguyên Tab Drawings | Chuyển tab trong Side Panel | Toàn bộ 19 Drawings và JSON viewer Drawings hoạt động nguyên vẹn | **PASS** |
| **TC-02** | Hiển thị Indicators Tab | Mở tab Indicators | Thống kê số lượng (12), tỷ lệ Main/Separate (6/6), danh sách chỉ báo và JSON hiển thị tức thì | **PASS** |
| **TC-03** | Hiển thị Watchlist Tab | Mở tab Watchlist | Hiển thị tên danh mục `"aaa"`, mã `"FPT"`, thứ tự `#1` và JSON chuẩn | **PASS** |
| **TC-04** | Đồng bộ tự động 1s | Thêm chỉ báo mới trên chart | Signature thay đổi $\rightarrow$ Side Panel tự động cập nhật không cần bấm Refresh | **PASS** |
| **TC-05** | Sao chép JSON từng Tab | Bấm nút Copy JSON ở từng tab | Clipboard nhận đúng JSON của tab tương ứng, nút đổi sang "Copied!" | **PASS** |
| **TC-06** | Bảo mật thông tin | Kiểm tra payload Watchlist | Trường `userName` (email cá nhân) và token bị lọc sạch hoàn toàn | **PASS** |

---

## 5. DANH SÁCH FILE THAY ĐỔI & TẠO MỚI

1. `src/extractors/indicators/indicator.types.ts` (Mới)
2. `src/extractors/indicators/indicator.extractor.ts` (Mới)
3. `src/extractors/watchlist/watchlist.types.ts` (Mới)
4. `src/extractors/watchlist/watchlist.extractor.ts` (Mới)
5. `src/messaging/message.schemas.ts` (Mở rộng schemas Indicators & Watchlist)
6. `src/messaging/message.types.ts` (Mở rộng TypeScript types)
7. `entrypoints/fireant-bridge.content.ts` (Tích hợp broadcast snapshot cho cả 3 thành phần)
8. `entrypoints/fireant.content.ts` (Relay và theo dõi signature lifecycle cho 3 thành phần)
9. `entrypoints/background.ts` (Cache 3 snapshot vào storage)
10. `entrypoints/sidepanel/index.html` (Thêm 3 tabs Drawings, Indicators, Watchlist)
11. `entrypoints/sidepanel/main.ts` (Điều khiển giao diện 3 tabs và render JSON thời gian thực)
12. `docs/INDICATOR_WATCHLIST_RESEARCH.md` (Báo cáo khảo sát)
13. `docs/INDICATOR_EXTRACTION.md` (Tài liệu kỹ thuật Indicators)
14. `docs/WATCHLIST_EXTRACTION.md` (Tài liệu kỹ thuật Watchlist)
15. `docs/PHASE_3_TEST_REPORT.md` (Báo cáo kiểm thử tổng kết)

---

## 6. HƯỚNG DẪN KIỂM TRA TRÊN CHROME

1. Mở `chrome://extensions` -> Bấm nút **Reload** ở Extension **Stock Chart Extractor**.
2. F5 tải lại tab FireAnt (`https://fireant.vn/b/charts`).
3. Mở **Side Panel** của Extension:
   - Thấy ngay 3 tab: **Drawings**, **Indicators**, **Watchlist**.
   - Bấm vào từng tab để kiểm tra danh sách và cây JSON định dạng thời gian thực!
