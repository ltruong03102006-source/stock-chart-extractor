# BÁO CÁO KHẢO SÁT NGUỒN DỮ LIỆU: INDICATORS & WATCHLIST TRÊN FIREANT
**Dự án:** Stock Chart Extractor – Phase 3  
**Tài liệu:** Khảo sát nguồn dữ liệu kỹ thuật trước triển khai (Stage A)  
**Ngày khởi tạo:** 14/11/2026  
**Quy chuẩn phân loại:**
- `VERIFIED`: Đã kiểm chứng thực nghiệm trên runtime FireAnt và lấy được dữ liệu chính xác.
- `PARTIALLY VERIFIED`: Đã xác định được đối tượng/phương thức nhưng dữ liệu mới lấy được một phần.
- `NOT VERIFIED`: Phương án thiết kế dựa trên đặc tả kỹ thuật, đang chờ log thực nghiệm runtime để đối soát.
- `NOT AVAILABLE`: Nguồn dữ liệu không cung cấp hoặc bị chặn bởi kiến trúc bảo mật.

---

## 1. KHẢO SÁT CHỈ BÁO KỸ THUẬT (INDICATORS / STUDIES)

### 1.1. Vị trí và Entry Point trong Chart Model
- **Thực thể quản lý:** `chartWidget.model().m_model` bên trong iframe TradingView blob (`iframe[0]#tradingview_...`).
- **Tình trạng truy cập:** Đã thông tuyến thành công từ Main World Bridge (`entrypoints/fireant-bridge.content.ts`).
- **Phân loại:** `VERIFIED` (Đã chạy thực tế, phát hiện và bóc tách thành công 12 studies đang gắn trên biểu đồ FPT).

### 1.2. Các API / Method thực tế đã kiểm chứng (`VERIFIED`)

| API / Method | Mục đích | Kết quả thực tế trên FireAnt | Trạng thái |
|---|---|---|---|
| `m_model.allStudies()` | Lấy danh sách toàn bộ Study trên chart | Trả về mảng 12 đối tượng Study thực tế | `VERIFIED` |
| `study.id()` | Lấy ID duy nhất của chỉ báo | Trả về chuỗi ID (ví dụ: `'c4F9uV'`, `'XHGjyC'`, `'ibu08v'`) | `VERIFIED` |
| `study.title()` / `name` | Tên hiển thị kèm mô tả song ngữ | Ví dụ: `'Moving Average - Đường trung bình trượt (9, close, 0)'` | `VERIFIED` |
| `study.isPriceStudy()` | Phân loại vị trí Main chart hay Pane phụ | `true` (`main`) cho MA, 52 Week High/Low; `false` (`separate`) cho Oscillator, Balance of Power | `VERIFIED` |
| `study.properties().inputs.state()` | Lấy toàn bộ tham số cấu hình inputs | Lấy chính xác `{"symbol":"","length":9,"source":"close","offset":0,"smoothingLine":"SMA","smoothingLength":9}` | `VERIFIED` |
| `study.properties().styles.state()` | Lấy cấu hình style (màu sắc, độ dày) | Thuộc tính styles đã được truy cập an toàn qua `.state()` | `PARTIALLY VERIFIED` |
| `study.data()` | Truy xuất chuỗi giá trị tính toán | Đang đối soát cấu trúc buffer thực tế | `NOT VERIFIED` |

### 1.3. Danh sách Indicators thực tế trên đồ thị đã ghi nhận (12 studies):
1. `#1` (`c4F9uV`): `52 Week High/Low (close, close)` - Pane: `main` - Inputs: `highestSource: close, lowestSource: close`
2. `#2` (`e1jtMn`): `52 Week High/Low (close, close)` - Pane: `main`
3. `#3` (`BTUM8o`): `Average Price (O+H+L+C)/4 - Giá bình quân` - Pane: `main`
4. `#4` (`FSDzrQ`): `52 Week High/Low (close, close)` - Pane: `main`
5. `#5` (`jYPiLH`): `52 Week High/Low (close, close)` - Pane: `main`
6. `#6` (`XHGjyC`): `Moving Average - Đường trung bình trượt` - Pane: `main` - Inputs: `length: 9, source: close, offset: 0, smoothingLine: SMA`
7. `#7` (`ibu08v`): `Accelerator Oscillator` - Pane: `separate`
8. `#8` (`ui6WNL`): `Accelerator Oscillator` - Pane: `separate`
9. `#9` (`f3zVzD`): `Advance/Decline - Chỉ báo Tăng/Giảm (10)` - Pane: `separate` - Inputs: `in_0: 10`
10. `#10` (`sjSBVK`): `Balance of Power - Cán cân sức mạnh thị trường` - Pane: `separate`
11. `#11` (`79ATDH`): `Balance of Power - Cán cân sức mạnh thị trường` - Pane: `separate`
12. `#12` (`T9v08X`): `Balance of Power - Cán cân sức mạnh thị trường` - Pane: `separate`

---

## 2. KHẢO SÁT DANH MỤC THEO DÕI (WATCHLIST)

### 2.1. Nguồn dữ liệu thực tế đã xác minh
- **Phát hiện quan trọng:** FireAnt sử dụng thư viện **Redux Persist** để lưu trữ toàn bộ trạng thái Watchlist vào `localStorage` dưới khóa:
  ```
  localStorage.getItem('persist:watchlists')
  ```
- **Cấu trúc JSON thực tế thu được (`VERIFIED`):**
  ```json
  {
    "requested": "true",
    "hintClosed": "false",
    "defaultWatchlistID": "4910004",
    "watchlists": "[{\"watchlistID\":4910004,\"name\":\"aaa\",\"symbols\":[\"FPT\"],\"displayIndex\":1}]",
    "_persist": "{\"version\":-1,\"rehydrated\":true}"
  }
  ```
- **Phân tích trường dữ liệu:**
  - `defaultWatchlistID`: ID danh mục mặc định người dùng đang kích hoạt.
  - `watchlists`: Mảng chuỗi JSON chứa danh sách các Watchlist của người dùng.
  - Mỗi Watchlist chứa:
    - `watchlistID` (number/string): ID danh mục.
    - `name` (string): Tên danh mục (e.g. `"aaa"`, `"Yêu thích"`).
    - `symbols` (array<string>): Mảng các mã cổ phiếu trong danh mục theo thứ tự sắp xếp (e.g. `["FPT"]`).
    - `displayIndex` (number): Thứ tự danh mục.
  - **Bảo mật & Quyền riêng tư (`STRICT FILTER`):** Bỏ qua trường `userName` (chứa email người dùng) và các trường phiên, không lưu hoặc gửi ra ngoài.

### 2.2. Khả năng đồng bộ Watchlist
- **CREATE (Thêm mã vào Watchlist):** Khi người dùng gõ thêm mã (ví dụ `VCB`, `HPG`), Redux Persist cập nhật ngay `localStorage.getItem('persist:watchlists')`.
- **DELETE (Xóa mã):** Mảng `symbols` bị cắt bớt, trigger thay đổi trong `localStorage`.
- **REORDER (Sắp xếp thứ tự):** Mảng `symbols` đổi thứ tự các phần tử.
- **Cơ chế bắt sự kiện:** Lắng nghe sự kiện `window.addEventListener('storage', ...)` kết hợp kiểm tra signature mỗi 1000ms.

### 2.2. Nguyên tắc an toàn & bảo mật thông tin
- **Tuyệt đối không thu thập:** JWT token (`access_token`, `refresh_token`), cookie xác thực, mật khẩu, thông tin tài khoản cá nhân.
- **Dữ liệu Watchlist chuẩn hóa chỉ gồm:**
  - `id`: Mã định danh mục
  - `symbol`: Mã cổ phiếu (e.g. `FPT`, `VCB`, `HPG`)
  - `name`: Tên doanh nghiệp (nếu có)
  - `exchange`: Sàn giao dịch (`HSX`, `HNX`, `UPCOM`)
  - `price`, `change`, `changePercent`: Giá và biến động (nếu có từ stream)
  - `position`: Thứ tự hiển thị trong danh mục

---

## 3. LỆNH KHẢO SÁT RUNTIME ĐÃ ĐƯỢC TÍCH HỢP

Để thu thập dữ liệu khách quan từ runtime FireAnt thực tế, extension đã được bổ sung 2 phương thức chẩn đoán an toàn vào `window.__STOCK_CHART_EXTRACTOR__`:

1. **Khảo sát Indicators:**
   ```javascript
   window.__STOCK_CHART_EXTRACTOR__.surveyIndicators();
   ```
2. **Khảo sát Watchlist:**
   ```javascript
   window.__STOCK_CHART_EXTRACTOR__.surveyWatchlist();
   ```

Kết quả của 2 lệnh này sẽ là cơ sở thực nghiệm để chuyển trạng thái từ `NOT VERIFIED` sang `VERIFIED` và thiết kế chính xác các Extractor trong Giai đoạn B & C.
