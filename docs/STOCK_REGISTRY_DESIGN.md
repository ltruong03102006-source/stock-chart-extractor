# TÀI LIỆU THIẾT KẾ: HỆ THỐNG QUẢN LÝ MÃ CỔ PHIẾU THỐNG NHẤT (UNIFIED STOCK REGISTRY)

**Dự án:** Stock Chart Extractor – Multi-Stock Management Architecture  
**Tài liệu:** Thiết kế chi tiết cấu trúc, quy tắc sở hữu và luồng dữ liệu của Stock Registry  
**Phiên bản:** 2.0  
**Ngày khởi tạo:** 17/11/2026  

---

## 1. MỤC TIÊU VÀ NGUYÊN TẮC CỐT LÕI

Hệ thống **Stock Registry** là trung tâm dữ liệu thống nhất (Single Source of Truth) chịu trách nhiệm quản lý toàn bộ danh sách mã cổ phiếu trong Extension, kết hợp hai nguồn cấp dữ liệu:
1. **Nguồn tự động từ FireAnt (FIREANT Source):** Tự động phát hiện khi người dùng mở, chuyển đổi hoặc chia biểu đồ trên trang FireAnt.
2. **Nguồn thủ công do người dùng quản lý (EXTENSION Source):** Cho phép người dùng chủ động thêm mã cần theo dõi hoặc xóa mã khỏi danh sách quản lý.

### Các nguyên tắc cốt lõi:
- **Nguyên tắc không trùng lặp (No Duplicates):** Mỗi mã cổ phiếu chỉ tồn tại duy nhất một bản ghi trong Registry, bất kể được phát hiện từ nguồn nào.
- **Nguyên tắc bảo toàn nguồn sở hữu (Source Ownership Preservation):** Thao tác của người dùng trên Extension không phá hỏng trạng thái phát hiện tự động từ FireAnt, và việc đóng biểu đồ trên FireAnt không làm mất đi các mã người dùng đã chủ động thêm vào Extension.
- **Nguyên tắc liên kết tự động (Auto-Linking):** Một mã cổ phiếu do người dùng thêm thủ công khi được phát hiện mở trên FireAnt sẽ tự động được liên kết và cập nhật trạng thái `isOpened = true` và `isActive = true`.

---

## 2. MÔ HÌNH DỮ LIỆU ENTITY (STOCK REGISTRY ITEM SCHEMA)

### 2.1. Định nghĩa cấu trúc TypeScript

```typescript
export type StockSource = 'FIREANT' | 'EXTENSION';

export interface ChartContextSummary {
  chartId: string;
  timeframe: string;
  lastSyncAt: number;
  drawingsCount: number;
  indicatorsCount: number;
}

export interface StockRegistryItem {
  /** Mã cổ phiếu chuẩn hóa (in hoa, trim) */
  symbol: string;

  /** Sàn giao dịch nếu xác định được (HOSE, HNX, UPCOM) */
  exchange?: string;

  /** Danh sách nguồn quản lý mã này: FIREANT, EXTENSION hoặc cả hai */
  sources: StockSource[];

  /** Trạng thái mã cổ phiếu có đang được mở trên tab/bố cục FireAnt hay không */
  isOpened: boolean;

  /** Trạng thái mã cổ phiếu có đang thuộc biểu đồ đang được người dùng chọn (Active Chart) hay không */
  isActive: boolean;

  /** Danh sách các ngữ cảnh biểu đồ liên quan (ví dụ các khung thời gian đã lưu) */
  chartContexts: ChartContextSummary[];

  /** Thời điểm phát hiện hoặc cập nhật gần nhất (Unix timestamp ms) */
  lastDetectedAt: number;

  /** Thời điểm tạo bản ghi */
  createdAt: number;
}

export interface StockRegistryState {
  version: string;
  activeSymbol: string | null;
  items: Record<string, StockRegistryItem>;
  updatedAt: number;
}
```

### 2.2. Quy chuẩn chuẩn hóa mã cổ phiếu (Normalization)
Mọi đầu vào từ người dùng hay FireAnt đều phải đi qua hàm chuẩn hóa:
```typescript
export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}
```

---

## 3. SƠ ĐỒ CHUYỂN ĐỔI TRẠNG THÁI (STATE TRANSITION DIAGRAM)

```mermaid
stateDiagram-v2
    [*] --> DiscoveredOnFireAnt: FireAnt mở biểu đồ mới
    [*] --> AddedByExtension: Người dùng gõ mã thủ công

    DiscoveredOnFireAnt --> MergedActive: Người dùng thêm mã này vào Extension list
    AddedByExtension --> MergedActive: FireAnt mở biểu đồ khớp với mã này

    state DiscoveredOnFireAnt {
        sources: ["FIREANT"]
        isOpened: true
        isActive: true/false
    }

    state AddedByExtension {
        sources: ["EXTENSION"]
        isOpened: false
        isActive: false
    }

    state MergedActive {
        sources: ["FIREANT", "EXTENSION"]
        isOpened: true
        isActive: true
    }

    MergedActive --> ClosedOnFireAnt: Đóng biểu đồ trên FireAnt
    ClosedOnFireAnt --> MergedActive: Mở lại biểu đồ trên FireAnt

    state ClosedOnFireAnt {
        sources: ["FIREANT", "EXTENSION"] -> ["EXTENSION"]
        isOpened: false
        isActive: false
    }

    ClosedOnFireAnt --> [*]: Người dùng bấm Xóa mã khỏi Extension
    DiscoveredOnFireAnt --> [*]: Đóng biểu đồ trên FireAnt (chỉ nguồn FIREANT)
```

---

## 4. QUY TẮC QUẢN LÝ QUYỀN SỞ HỮU NGUỒN DỮ LIỆU (SOURCE OWNERSHIP RULES)

Hệ thống xử lý nghiêm ngặt các ma trận hành động sau:

### 4.1. Hành động: Người dùng bấm "Xóa mã" khỏi Extension
```typescript
function removeManualStock(registry: StockRegistryState, symbol: string): void {
  const item = registry.items[symbol];
  if (!item) return;

  // Loại bỏ nguồn EXTENSION
  item.sources = item.sources.filter((s) => s !== 'EXTENSION');

  if (item.sources.includes('FIREANT') && item.isOpened) {
    // Vẫn đang mở trên FireAnt -> Giữ lại bản ghi, chỉ cập nhật sources
    console.log(`[Stock Registry] Removed manual flag for ${symbol}, kept in registry as it is opened on FireAnt.`);
  } else {
    // Không còn nguồn nào khác -> Xóa hẳn khỏi Registry
    delete registry.items[symbol];
    if (registry.activeSymbol === symbol) {
      registry.activeSymbol = null;
    }
    console.log(`[Stock Registry] Completely removed ${symbol} from registry.`);
  }
}
```

### 4.2. Hành động: Đóng tab hoặc chuyển mã trên FireAnt
Khi biểu đồ `AAA` bị thay thế bởi `VIC` trên FireAnt:
- Đối với mã `AAA`:
  - Đặt `isActive = false`.
  - Nếu mã `AAA` có chứa nguồn `'EXTENSION'` (người dùng đã theo dõi): Giữ lại bản ghi, chuyển `isOpened = false`.
  - Nếu mã `AAA` chỉ có nguồn `'FIREANT'` (người dùng chỉ vô tình lướt qua): Đặt `isOpened = false`. Bản ghi có thể được lưu ở mục lịch sử gần đây hoặc thu dọn theo cấu hình.
- Đối với mã `VIC`:
  - Nếu chưa có: Tạo bản ghi mới với `sources = ['FIREANT']`, `isOpened = true`, `isActive = true`.
  - Nếu đã có từ nguồn `'EXTENSION'`: Giữ nguyên danh sách sources, cập nhật thêm `'FIREANT'`, đặt `isOpened = true`, `isActive = true`.

---

## 5. CÁC API THAO TÁC REGISTRY (REGISTRY OPERATIONS INTERFACE)

Module `StockRegistry` cung cấp các API xử lý thuần logic (Pure Functions), dễ dàng kiểm thử và đảm bảo tính bất biến:

| Phương thức API | Đầu vào | Trách nhiệm |
|---|---|---|
| `upsertFromFireAnt(state, discoveryData)` | `symbol, exchange, timeframe, chartId` | Hợp nhất mã phát hiện từ FireAnt, cập nhật `isActive`, `isOpened` |
| `addManualStock(state, rawSymbol)` | `rawSymbol` | Chuẩn hóa mã, gán nguồn `EXTENSION`, kích hoạt auto-linking |
| `removeManualStock(state, rawSymbol)` | `rawSymbol` | Xử lý theo quy tắc bảo toàn nguồn sở hữu |
| `setActiveStock(state, symbol)` | `symbol` | Đặt con trỏ biểu đồ đang chọn cho giao diện Side Panel |
| `getAllStocks(state)` | `filter?: 'all' \| 'opened' \| 'manual'` | Trả về danh sách mã cổ phiếu theo bộ lọc |
| `getActiveStock(state)` | - | Trả về thông tin mã và ngữ cảnh biểu đồ đang hoạt động |

---

## 6. ĐỒNG BỘ VỚI CHROME LOCAL STORAGE

Stock Registry được lưu trữ độc lập tại khóa chuyên biệt trong Chrome Storage:
```
chrome.storage.local.get('stockRegistry', ...)
```

- Khi có bất kỳ thay đổi nào (thêm mã thủ công, phát hiện biểu đồ mới từ FireAnt), Registry cập nhật ngay vào `chrome.storage.local`.
- Side Panel lắng nghe `chrome.storage.onChanged` trên khóa `stockRegistry` để tái hiển thị danh sách trong khu vực **Stock Manager** theo thời gian thực mà không cần reload.
