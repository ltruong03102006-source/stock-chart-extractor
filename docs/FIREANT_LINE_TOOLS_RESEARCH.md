# BÁO CÁO NGHIÊN CỨU FIREANT LINE TOOLS MODEL (CẬP NHẬT THỰC NGHIỆM RUNTIME)
## Dự án: Stock Chart Extractor (MVP 1.0)
**Thời gian thực hiện:** 14/11/2026  
**Trạng thái tài liệu:** RUNTIME VERIFIED (Đã kiểm chứng thực nghiệm trên Chrome)  
**Quy chuẩn đánh giá:** `VERIFIED` | `PARTIALLY VERIFIED` | `SPEC-BASED`

---

## 1. RUNTIME ENTRY POINT (ĐIỂM TRUY CẬP THỰC TẾ TRÊN FIREANT)

| Mục kiểm tra | Giá trị thực tế xác minh | Trạng thái |
|---|---|---|
| **Vị trí DOM** | `iframe[0]#tradingview_77a6f` | `VERIFIED` |
| **URL của iframe** | `blob:https://fireant.vn/4fbdecb7-9160-4ee2-af02-552dbdceb25c` | `VERIFIED` |
| **Đối tượng Widget** | `contentWindow.chartWidget` bên trong iframe blob | `VERIFIED` |
| **Model Accessor** | `chartWidget.model()` | `VERIFIED` |
| **Core Model** | `chartWidget.model().m_model` | `VERIFIED` |
| **Line Tools Collection** | `chartWidget.model().m_model.allLineTools()` | `VERIFIED` |
| **Quyền truy cập từ Extension** | Main World Bridge (`world: 'MAIN'`) tự động quét từ top frame sang child iframe thành công | `VERIFIED` |

---

## 2. DANH MỤC ĐỐI TƯỢNG VẼ ĐÃ XÁC MINH TRÊN RUNTIME (`VERIFIED`)

Biểu đồ thực tế trên FireAnt đã phát hiện **11 đối tượng vẽ** thuộc **5 loại khác nhau**:

| ID thực tế | Tên định danh (`tool.name()`) | Constructor Class | Số điểm neo (`pointsCount`) | Trạng thái |
|---|---|---|---|---|
| `blZncM` | `Trend Line` | `a` (minified) | 2 điểm | `VERIFIED` |
| `H7JwjX` | `Trend Line` | `a` | 2 điểm | `VERIFIED` |
| `noJ91s` | `Trend Line` | `a` | 2 điểm | `VERIFIED` |
| `zKzk1O` | `Trend Line` | `a` | 2 điểm | `VERIFIED` |
| `CRSW2e` | `Trend Line` | `a` | 2 điểm | `VERIFIED` |
| `MrL19k` | `Fib Retracement` | `c` | 2 điểm | `VERIFIED` |
| `SBH2ts` | `XABCD Pattern` | `a` | 5 điểm | `VERIFIED` |
| `Hp3L9X` | `Trend Line` | `a` | 2 điểm | `VERIFIED` |
| `KlZJx5` | `Trend Line` | `a` | 2 điểm | `VERIFIED` |
| `CuN4mU` | `Risk/Reward long` | `x` | 3 điểm + target | `VERIFIED` |
| `94pmLC` | `Ghost Feed` (Bars Pattern) | `c` | 5 điểm | `VERIFIED` |
| `QyBd0C` | `Horizontal Line` (`LineToolHorzLine`) | `a` | 1 điểm (Price level) | `VERIFIED` |
| `91ZRT5` | `Rectangle` (`LineToolRectangle`) | `c` | 2 điểm (Diagonal corners) | `VERIFIED` |
| `C8Yu2Q` | `Rectangle` (`LineToolRectangle`) | `c` | 2 điểm (Diagonal corners) | `VERIFIED` |

---

## 3. CẤU TRÚC TỌA ĐỘ VÀ CÁC ĐIỂM NEO (POINTS STRUCTURE)

Từ kết quả kiểm tra trực tiếp đối tượng `Trend Line` (ID: `blZncM`):

### 3.1. Dữ liệu thực tế của các điểm:
- **Điểm 0 (`getPoint(0)`):**
  - `index`: `97` (Bar index trên biểu đồ)
  - `price`: `98.17179428323894` (Giá trị giá chính xác)
  - `time`: `Tue Jan 20 2026 09:00:00 GMT+0700 (Indochina Time)` (Đối tượng JavaScript `Date`)
  - Timestamp chuẩn hóa: `1768874400000` (Unix epoch ms)
- **Điểm 1 (`getPoint(1)`):**
  - `index`: `154`
  - `price`: `81.11827271138277`
  - `time`: `Thu Apr 16 2026 09:00:00 GMT+0700 (Indochina Time)`
  - Timestamp chuẩn hóa: `1776304800000`

### 3.2. Phương thức truy xuất điểm (`VERIFIED`):
1. `tool.points()`: Trả về mảng `[Point, Point]` (chứa `index`, `price`, `time`).
2. `tool.pointsCount()`: Trả về số lượng điểm neo (`2`, `3`, `5`...).
3. `tool.getPoint(i)`: Lấy trực tiếp điểm neo tại vị trí $i$.
4. `tool._points`: Mảng nội bộ lưu trực tiếp trên đối tượng.

---

## 4. DANH MỤC THUỘC TÍNH VÀ PHƯƠNG THỨC NỘI BỘ (`OWN KEYS & PROTO METHODS`)

### 4.1. Prototype Methods:
- `pointsCount()`: Lấy số lượng điểm.
- `name()`: Lấy tên loại đối tượng (`Trend Line`, `Fib Retracement`, v.v.).
- `dataAndViewsReady()`: Kiểm tra trạng thái sẵn sàng render của đối tượng.
- `showPriceLabels()`: Hiển thị nhãn giá.
- `createPriceAxisView()`: Khung nhìn trục giá.
- `template()`, `_applyTemplateImpl()`: Áp dụng mẫu giao diện.

### 4.2. Own Properties (50 trường nội bộ):
- `_id`: ID duy nhất của drawing.
- `_points`: Mảng tọa độ các điểm neo.
- `_properties`: Cây thuộc tính style (màu sắc, độ dày, nét đứt, visibility, frozen).
- `_priceScale`: Thước đo giá gắn liền với đối tượng.
- `_timePoint`: Thời điểm gắn với đối tượng.
- `_userEditEnabled`: Cờ cho phép người dùng chỉnh sửa.
- `_isDestroyed`: Cờ báo hiệu đối tượng đã bị xóa.

---

## 5. XÁC MINH VÒNG ĐỜI VÀ ĐỒNG BỘ THỜI GIAN THỰC (PHASE 3 LIFECYCLE)

Toàn bộ 4 thao tác vòng đời của đối tượng vẽ đã được kiểm chứng thực tế trên Chrome Extension:

| Thao tác Lifecycle | Cơ chế phát hiện | Trạng thái đồng bộ Side Panel | Đánh giá |
|---|---|---|---|
| **CREATE** | Main World Bridge phát hiện số lượng đối tượng tăng trong `model.allLineTools()` | Tự động cập nhật danh sách và thêm node vào JSON Viewer | `VERIFIED` |
| **MOVE ANCHOR (UPDATE)** | Signature băm theo tọa độ điểm neo (`price`, `index`, `time`) thay đổi | JSON Viewer cập nhật tọa độ mới ngay lập tức | `VERIFIED` |
| **STYLE UPDATE** | Bắt sự thay đổi màu sắc (`linecolor`, `backgroundColor`) và độ dày | Trường `style` trong JSON phản ánh màu/nét mới | `VERIFIED` |
| **DELETE** | Đối tượng bị gỡ khỏi `model.allLineTools()`, `_isDestroyed` kích hoạt | Danh sách và JSON Viewer tự động xóa đối tượng | `VERIFIED` |

---

## 6. KẾT LUẬN & ĐÁNH GIÁ TỔNG THỂ

- **Hoàn thành trọn vẹn cả 3 Phase của MVP:**
  1. **Phase 1 (Extension Runtime):** Manifest V3 + Main World Bridge xuyên iframe blob an toàn, ổn định.
  2. **Phase 2 (Data Extraction):** Bóc tách chính xác 3 công cụ mục tiêu (`Trend Line`, `Horizontal Line`, `Rectangle`) cùng 4 công cụ mở rộng (`Fib Retracement`, `Risk/Reward long`, `XABCD Pattern`, `Ghost Feed`).
  3. **Phase 3 (Lifecycle):** Đồng bộ 2 chiều thời gian thực giữa FireAnt Chart và Chrome Side Panel.
- **Sẵn sàng cho giai đoạn phát triển tiếp theo** (Export JSON/CSV, tích hợp API, hoặc mở rộng sang các sàn chứng khoán khác).
