# TÀI LIỆU KỸ THUẬT: WATCHLIST EXTRACTION MODULE
**Dự án:** Stock Chart Extractor – Phase 3  
**Module:** Watchlist Extractor (`src/extractors/watchlist/`)  
**Nền tảng:** FireAnt Web App State  

---

## 1. NGUỒN DỮ LIỆU & ĐIỂM TRUY CẬP (DATA SOURCE)

- **Entry Point:** `localStorage.getItem('persist:watchlists')` của ứng dụng FireAnt.
- **Thư viện quản lý:** `redux-persist` lưu trữ toàn bộ danh sách Watchlist, mã cổ phiếu và ID danh mục mặc định.
- **Fallback bổ trợ:** `localStorage.getItem('fireant.recentSymbols')`.
- **Phân loại nguồn:** **`100% VERIFIED`** trên runtime FireAnt.

---

## 2. CẤU TRÚC DỮ LIỆU CHUẨN HÓA (NORMALIZED SCHEMA)

### 2.1. Cổ phiếu trong Watchlist (`WatchlistItem`)
```typescript
export interface WatchlistItem {
  id: string;               // Mã duy nhất (e.g. "4910004-FPT-0")
  symbol: string;           // Mã cổ phiếu viết hoa (e.g. "FPT", "VCB")
  name?: string;            // Tên công ty (nếu có nguồn dữ liệu)
  exchange?: string;        // Sàn giao dịch (HSX, HNX, UPCOM)
  price?: number | null;    // Giá khớp lệnh hiện tại
  referencePrice?: number | null; // Giá tham chiếu
  change?: number | null;   // Mức thay đổi
  changePercent?: number | null; // % biến động
  volume?: number | null;   // Khối lượng khớp lệnh
  position: number;         // Vị trí/thứ tự trong danh mục (0, 1, 2...)
  metadata: {
    source: 'fireant';
    extractionStatus: 'VERIFIED' | 'PARTIALLY VERIFIED';
  };
}
```

### 2.2. Nhóm Watchlist (`WatchlistGroup`) & Snapshot
```typescript
export interface WatchlistGroup {
  id: string;               // ID danh mục (e.g. "4910004")
  name: string;             // Tên danh mục (e.g. "aaa", "Yêu thích")
  isDefault: boolean;       // Danh mục đang được người dùng chọn
  displayIndex: number;     // Thứ tự hiển thị
  totalSymbols: number;     // Số lượng mã
  items: WatchlistItem[];   // Danh sách các mã
}
```

---

## 3. AN TOÀN DỮ LIỆU & QUYỀN RIÊNG TƯ (STRICT SECURITY)

1. **Loại bỏ thông tin nhạy cảm:** Bỏ qua trường `userName` (chứa địa chỉ email cá nhân của người dùng có trong Redux state).
2. **Không đọc token:** Bỏ qua tất cả các khóa `localStorage` có chứa `token`, `auth`, `jwt`, `secret`, `credential`.
3. **Không gửi dữ liệu ra ngoài:** Dữ liệu Watchlist chỉ lưu chuyển nội bộ giữa Main World, Isolated World và Side Panel.

---

## 4. CƠ CHẾ PHÁT HIỆN VÒNG ĐỜI (LIFECYCLE DETECTION)

- Khi người dùng thêm mã mới, xóa mã hoặc kéo đổi vị trí trong Watchlist trên giao diện FireAnt:
  1. Redux Persist ghi đè bản cập nhật vào `localStorage.getItem('persist:watchlists')`.
  2. Main World Bridge định kỳ 1000ms tính toán signature của mảng danh mục.
  3. Khi signature thay đổi $\rightarrow$ tự động broadcast `WATCHLIST_SNAPSHOT` sang Side Panel.
