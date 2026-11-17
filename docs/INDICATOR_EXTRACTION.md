# TÀI LIỆU KỸ THUẬT: INDICATOR EXTRACTION MODULE
**Dự án:** Stock Chart Extractor – Phase 3  
**Module:** Indicator Extractor (`src/extractors/indicators/`)  
**Nền tảng:** FireAnt TradingView Chart Model  

---

## 1. NGUỒN DỮ LIỆU & ĐIỂM TRUY CẬP (DATA SOURCE)

- **Entry Point:** `activeChartWidget.model().m_model` bên trong iframe TradingView blob (`iframe[0]#tradingview_...`).
- **Method chính:** `m_model.allStudies()` hoặc duyệt qua `m_model.panes()[i].sources()`.
- **Phân loại nguồn:** `VERIFIED` trên runtime FireAnt (đã trích xuất thành công 12 studies trên biểu đồ FPT).

---

## 2. CẤU TRÚC DỮ LIỆU CHUẨN HÓA (NORMALIZED SCHEMA)

Mỗi Indicator/Study được chuẩn hóa theo Zod Schema:

```typescript
export interface IndicatorItem {
  id: string;                         // ID duy nhất của study (e.g. "c4F9uV", "XHGjyC")
  name: string;                       // Tên hiển thị đầy đủ kèm mô tả
  type: string;                       // Mã định danh loại indicator (e.g. "Moving_Average")
  shortName: string;                  // Tên viết tắt ngắn gọn (e.g. "MA", "RSI")
  inputs: Record<string, unknown>;    // Các tham số cấu hình (length, source, offset...)
  style: Record<string, unknown>;     // Cấu hình style (màu sắc, độ dày nét vẽ...)
  pane: {
    type: 'main' | 'separate';        // Vị trí: 'main' (vẽ trên nến) hay 'separate' (pane phụ bên dưới)
  };
  values: {
    latest: number | Record<string, number> | null; // Giá trị tính toán gần nhất
  };
  metadata: {
    source: 'fireant';
    extractionStatus: 'VERIFIED' | 'PARTIALLY VERIFIED' | 'NOT AVAILABLE';
  };
}
```

---

## 3. CÁC THÀNH PHẦN CỦA MODULE

1. **`indicator.types.ts`**: Định nghĩa kiểu dữ liệu `IndicatorItem` và `IndicatorsSnapshot`.
2. **`indicator.extractor.ts`**:
   - `extractIndicator(study)`: Trích xuất an toàn từng study, bẻ khóa các property tròn (`_listeners`), unwrap `.state()` của inputs/styles.
   - `extractAllIndicators(model)`: Duyệt qua toàn bộ danh sách `allStudies()` trong chart model.

---

## 4. CƠ CHẾ PHÁT HIỆN VÒNG ĐỜI (LIFECYCLE DETECTION)

- Bridge định kỳ mỗi 1000ms tính toán signature nhận dạng:
  $$\text{signature} = \sum (\text{id} : \text{inputs} : \text{style})$$
- **Khi thêm Indicator mới**: Số lượng ID tăng $\rightarrow$ signature thay đổi $\rightarrow$ tự động broadcast `INDICATORS_SNAPSHOT`.
- **Khi xóa Indicator**: ID biến mất $\rightarrow$ signature thay đổi $\rightarrow$ tự động broadcast cập nhật.
- **Khi thay đổi Inputs hoặc Style**: Thuộc tính inputs/style thay đổi $\rightarrow$ signature thay đổi $\rightarrow$ tự động broadcast cập nhật.

---

## 5. GIỚI HẠN & ĐÁNH GIÁ INDICATOR VALUES

- **Metadata & Cấu hình:** **`100% VERIFIED`** (Lấy được toàn bộ ID, tên, inputs, style, pane).
- **Calculation Values:** Phân loại **`PARTIALLY VERIFIED` / `NOT AVAILABLE`**. TradingView trên FireAnt thực hiện render phần lớn đường chỉ báo trực tiếp lên WebGL Canvas; phương thức `study.data()` có thể không lưu mảng buffer hoàn chỉnh trên tất cả các loại custom indicator. Hệ thống gán `values.latest = null` khi buffer không khả dụng, đảm bảo tính trung thực và không tạo dữ liệu giả.
