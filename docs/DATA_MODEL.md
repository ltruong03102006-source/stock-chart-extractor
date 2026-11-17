# MÔ HÌNH DỮ LIỆU ĐA MÃ CỔ PHIẾU (MULTI-STOCK DATA MODEL)

**Dự án:** Stock Chart Extractor – Multi-Stock Management Architecture  
**Tài liệu:** Đặc tả mô hình dữ liệu TypeScript, lược đồ kiểm thực Zod, phân vùng lưu trữ Chrome Storage, chiến lược Migration và Mô hình Xuất JSON Toàn diện (Export All JSON)  
**Phiên bản:** 2.1  
**Ngày cập nhật:** 17/11/2026  
**Trạng thái kiểm duyệt:** DATA SPECIFICATION (Export All JSON Schema Integrated)

---

## 1. NGUYÊN TẮC THIẾT KẾ MÔ HÌNH DỮ LIỆU

Hệ thống dữ liệu của Stock Chart Extractor 2.1 được xây dựng dựa trên 4 nguyên tắc phân rã bắt buộc:

1. **Phân vùng độc lập theo Ngữ cảnh Biểu đồ (Per-Stock Context Isolation):**
   - Các đối tượng vẽ (Drawings) và chỉ báo kỹ thuật (Indicators) gắn liền với một biểu đồ cụ thể, được định danh bằng bộ ba `symbol + exchange + timeframe`.
   - Dữ liệu biểu đồ của mã `FPT` khung `15m` tuyệt đối không bị trộn lẫn hoặc ghi đè sang mã `VIC` khung `1D`.
2. **Tách biệt Dữ liệu Người dùng Toàn cục (Global User Data Decoupling):**
   - Watchlist (Danh sách theo dõi) là tài sản toàn cục của người dùng trên FireAnt.
   - Watchlist được lưu trữ độc lập ở khóa toàn cục; **tuyệt đối không nhân bản hoặc sao chép Watchlist vào từng bản ghi Chart Snapshot**.
3. **Trung tâm quản lý mã duy nhất (Unified Registry Single-Source-of-Truth):**
   - Mọi mã cổ phiếu (phát hiện từ FireAnt hay người dùng thêm thủ công) được định tuyến và quản lý tập trung thông qua `StockRegistry`.
4. **Tính độc lập của Chuẩn tệp Xuất (Export Schema Decoupling):**
   - Chuẩn tệp xuất ra tệp JSON (`ExportJsonEnvelope`, `schemaVersion: 1`) được thiết kế độc lập với cấu trúc phân vùng khóa trong `chrome.storage.local`.
   - Các thay đổi cấu trúc lưu trữ nội bộ trong tương lai sẽ không phá vỡ khả năng tương thích của các tệp JSON đã xuất của người dùng.

---

## 2. HỆ THỐNG KIỂU DỮ LIỆU TYPESCRIPT (TYPESCRIPT INTERFACES)

### 2.1. Định danh Ngữ cảnh Biểu đồ (Chart Context Identity)

```typescript
export interface ChartContextId {
  /** Mã cổ phiếu đã chuẩn hóa (ví dụ: 'FPT', 'VCB') */
  symbol: string;

  /** Sàn giao dịch nếu có (ví dụ: 'HOSE', 'HNX', 'UPCOM') */
  exchange?: string;

  /** Khung thời gian biểu đồ (ví dụ: '1', '5', '15', '60', 'D', 'W') */
  timeframe: string;

  /** Định danh biểu đồ trong multi-layout (ví dụ: 'chart-0', 'chart-1') */
  chartId: string;

  /** Khóa phức hợp duy nhất: symbol_exchange_timeframe */
  compositeKey: string;
}

/** Hàm tiện ích tạo Composite Key chuẩn hóa */
export function buildChartCompositeKey(symbol: string, timeframe: string, exchange?: string): string {
  const cleanSymbol = symbol.trim().toUpperCase();
  const cleanTimeframe = timeframe.trim().toUpperCase();
  const cleanExchange = exchange ? exchange.trim().toUpperCase() : 'VN';
  return `${cleanSymbol}_${cleanExchange}_${cleanTimeframe}`;
}
```

### 2.2. Mô hình Đối tượng Vẽ (Drawing Entities)

```typescript
export type DrawingType = 
  | 'horizontal_line' 
  | 'trend_line' 
  | 'rectangle' 
  | 'ray' 
  | 'extended_line' 
  | 'pitchfork' 
  | 'fib_retracement' 
  | 'text' 
  | 'unknown';

export interface DrawingPoint {
  /** Thời gian của điểm (Unix timestamp ms) */
  time?: number;
  /** Chỉ số nến (Bar index) */
  index?: number;
  /** Mức giá tại điểm */
  price: number;
}

export interface DrawingStyle {
  linecolor?: string;
  color?: string;
  linewidth?: number;
  linestyle?: number; // 0: solid, 1: dotted, 2: dashed
  backgroundColor?: string;
  fillColor?: string;
  transparency?: number;
}

export interface DrawingItem {
  id: string;
  type: DrawingType | string;
  name: string;
  points: DrawingPoint[];
  properties: Record<string, unknown>;
  style: DrawingStyle;
  visible: boolean;
  locked: boolean;
  updatedAt: number;
}
```

### 2.3. Mô hình Chỉ báo Kỹ thuật (Technical Indicator Entities)

```typescript
export interface IndicatorItem {
  id: string;
  name: string;
  type: string;
  shortName: string;
  inputs: Record<string, unknown>;
  style: Record<string, unknown>;
  pane: {
    type: 'main' | 'separate';
  };
  values?: {
    latest: number | Record<string, number> | null;
  };
  metadata: {
    source: 'fireant';
    extractionStatus: 'VERIFIED' | 'PARTIALLY VERIFIED' | 'NOT AVAILABLE';
  };
}
```

### 2.4. Bản Snapshot Biểu đồ Cô lập (Isolated Chart Snapshot)

```typescript
export interface IsolatedChartSnapshot {
  /** Phiên bản schema snapshot nội bộ */
  version: '2.0';

  /** Thông tin định danh ngữ cảnh của snapshot */
  context: ChartContextId;

  /** Khóa phức hợp: symbol_exchange_timeframe */
  compositeKey: string;

  /** Mã thế hệ (Generation ID) ngăn ngừa race condition */
  generationId: number;

  /** Danh sách các đối tượng vẽ trích xuất được */
  drawings: DrawingItem[];

  /** Danh sách các chỉ báo kỹ thuật trích xuất được */
  indicators: IndicatorItem[];

  /** Tổng số đối tượng vẽ */
  drawingsCount: number;

  /** Tổng số chỉ báo */
  indicatorsCount: number;

  /** Thời điểm trích xuất hoàn tất (Unix timestamp ms) */
  extractedAt: number;
}
```

### 2.5. Mô hình Dữ liệu Danh mục Theo dõi Toàn cục (Global Watchlist Snapshot)

```typescript
export interface WatchlistItem {
  id: string;
  symbol: string;
  name?: string;
  exchange?: string;
  price?: number | null;
  referencePrice?: number | null;
  change?: number | null;
  changePercent?: number | null;
  volume?: number | null;
  position: number;
  metadata: {
    source: 'fireant';
    extractionStatus: 'VERIFIED' | 'PARTIALLY VERIFIED';
  };
}

export interface WatchlistGroup {
  id: string;
  name: string;
  isDefault: boolean;
  displayIndex: number;
  totalSymbols: number;
  items: WatchlistItem[];
}

export interface GlobalWatchlistSnapshot {
  activeWatchlistId: string;
  totalWatchlists: number;
  watchlists: WatchlistGroup[];
  activeItems: WatchlistItem[];
  timestamp: number;
}
```

### 2.6. Mô hình Quản lý Danh bạ Mã (Stock Registry Schema)

```typescript
export type StockSource = 'FIREANT' | 'EXTENSION';

export interface ChartContextSummary {
  chartId: string;
  timeframe: string;
  compositeKey: string;
  lastSyncAt: number;
  drawingsCount: number;
  indicatorsCount: number;
}

export interface StockRegistryItem {
  symbol: string;
  exchange?: string;
  sources: StockSource[];
  isOpened: boolean;
  isActive: boolean;
  chartContexts: ChartContextSummary[];
  lastDetectedAt: number;
  createdAt: number;
}

export interface StockRegistryState {
  version: '2.0';
  activeSymbol: string | null;
  activeCompositeKey: string | null;
  items: Record<string, StockRegistryItem>;
  updatedAt: number;
}
```

---

## 3. LƯỢC ĐỒ KIỂM THỰC RUNTIME (ZOD SCHEMAS)

```typescript
import { z } from 'zod';

export const ChartContextPayloadSchema = z.object({
  symbol: z.string().min(1),
  exchange: z.string().optional(),
  timeframe: z.string().default('D'),
  chartId: z.string().default('chart-0'),
  compositeKey: z.string(),
  chartsCount: z.number().optional(),
});

export const DrawingPointSchema = z.object({
  index: z.number().optional(),
  price: z.number(),
  time: z.number().optional(),
});

export const DrawingObjectSchema = z.object({
  id: z.string(),
  platformId: z.string().optional(),
  type: z.string(),
  name: z.string(),
  points: z.array(DrawingPointSchema),
  properties: z.record(z.string(), z.unknown()).default({}),
  style: z.record(z.string(), z.unknown()).default({}),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  updatedAt: z.number().default(() => Date.now()),
});

export const IndicatorItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  shortName: z.string(),
  inputs: z.record(z.string(), z.unknown()).default({}),
  style: z.record(z.string(), z.unknown()).default({}),
  pane: z.object({
    type: z.enum(['main', 'separate']),
  }),
  values: z.object({
    latest: z.union([z.number(), z.record(z.string(), z.number())]).nullable().default(null),
  }).default({ latest: null }),
  metadata: z.object({
    source: z.literal('fireant').default('fireant'),
    extractionStatus: z.enum(['VERIFIED', 'PARTIALLY VERIFIED', 'NOT AVAILABLE']).default('VERIFIED'),
  }),
});

export const IsolatedChartSnapshotSchema = z.object({
  version: z.literal('2.0').default('2.0'),
  context: ChartContextPayloadSchema,
  compositeKey: z.string(),
  generationId: z.number().default(0),
  drawings: z.array(DrawingObjectSchema).default([]),
  indicators: z.array(IndicatorItemSchema).default([]),
  drawingsCount: z.number().default(0),
  indicatorsCount: z.number().default(0),
  extractedAt: z.number().default(() => Date.now()),
});

export const StockRegistryItemSchema = z.object({
  symbol: z.string().min(1),
  exchange: z.string().optional(),
  sources: z.array(z.enum(['FIREANT', 'EXTENSION'])),
  isOpened: z.boolean().default(false),
  isActive: z.boolean().default(false),
  chartContexts: z.array(z.any()).default([]),
  lastDetectedAt: z.number().default(() => Date.now()),
  createdAt: z.number().default(() => Date.now()),
});

export const StockRegistryStateSchema = z.object({
  version: z.literal('2.0').default('2.0'),
  activeSymbol: z.string().nullable().default(null),
  activeCompositeKey: z.string().nullable().default(null),
  items: z.record(z.string(), StockRegistryItemSchema).default({}),
  updatedAt: z.number().default(() => Date.now()),
});
```

---

## 4. PHÂN VÙNG LƯU TRỮ TRONG CHROME LOCAL STORAGE

Bộ nhớ `chrome.storage.local` được phân vùng bằng các tiền tố rõ ràng (Partitioned Keys):

```
+-------------------------------------------------------------------------+
| chrome.storage.local                                                    |
+-------------------------------------------------------------------------+
| [Khóa] "stockRegistry"                                                  |
| -> Giá trị: StockRegistryState                                          |
| (Chứa toàn bộ danh bạ mã, trạng thái isOpened/isActive, summary counts)  |
+-------------------------------------------------------------------------+
| [Khóa] "chartSnapshots:FPT_HOSE_15"                                     |
| -> Giá trị: IsolatedChartSnapshot (Drawings + Indicators của FPT 15m)    |
+-------------------------------------------------------------------------+
| [Khóa] "chartSnapshots:VIC_HOSE_D"                                      |
| -> Giá trị: IsolatedChartSnapshot (Drawings + Indicators của VIC 1D)     |
+-------------------------------------------------------------------------+
| [Khóa] "chartSnapshots:<compositeKey>"                                  |
| -> Mỗi biểu đồ cô lập chiếm 1 key riêng biệt                             |
+-------------------------------------------------------------------------+
| [Khóa] "globalWatchlist"                                                |
| -> Giá trị: GlobalWatchlistSnapshot                                     |
| (Danh sách theo dõi toàn cục độc lập)                                   |
+-------------------------------------------------------------------------+
```

---

## 5. QUY TẮC CHUẨN HÓA DỮ LIỆU (DATA NORMALIZATION RULES)

Module `DataNormalizer` thi hành các quy chuẩn bắt buộc:

1. **Chuẩn hóa Mã cổ phiếu (`Symbol`):**
   - Loại bỏ khoảng trắng đầu/cuối, chuyển thành chữ in hoa toàn bộ, chỉ giữ ký tự chữ và số.
2. **Chuẩn hóa Khung thời gian (`Timeframe`):**
   - Khung phút: `'1'`, `'5'`, `'15'`, `'30'`, `'60'`, `'120'`, `'240'`.
   - Khung ngày/tuần/tháng: `'D'`, `'W'`, `'M'`.
3. **Chuẩn hóa Thời gian (`Timestamp`):**
   - Mọi mốc thời gian lưu trữ nội bộ là số nguyên Unix timestamp tính bằng mili-giây (`ms`).
   - Khi xuất JSON ra tệp, chuyển đổi sang chuỗi chuẩn ISO 8601 kèm múi giờ (`+07:00`).
4. **Chuẩn hóa Giá trị Số (`Price` & `Coordinates`):**
   - Loại bỏ `NaN`, `Infinity`.
   - Làm tròn tối đa 4 chữ số thập phân đối với giá chứng khoán Việt Nam.

---

## 6. CHIẾN LƯỢC CHUYỂN ĐỔI DỮ LIỆU TỪ MVP 1.0 (MIGRATION STRATEGY)

Tự động thực thi bởi `StorageRepository.migrateStorageV1toV2()` khi extension khởi động:
- Đọc các khóa MVP cũ: `latestSnapshot`, `latestIndicators`, `latestWatchlist`.
- Tạo `StockRegistryItem` với `sources: ['FIREANT']`.
- Phân vùng snapshot vào `chartSnapshots:<compositeKey>`.
- Chuyển `latestWatchlist` sang `globalWatchlist`.
- Khởi tạo `StockRegistryState` phiên bản 2.0.

---

## 7. MÔ HÌNH DỮ LIỆU XUẤT TOÀN DIỆN (EXPORT ALL JSON ENVELOPE)

Để đáp ứng tính năng **Xuất Toàn bộ Dữ liệu ra một tệp JSON duy nhất**, hệ thống định nghĩa một Envelope JSON độc lập, có phiên bản rõ ràng (`schemaVersion: 1`).

### 7.1. Cấu trúc Phong bì Tệp Xuất (Export JSON Envelope Contract)

```typescript
export interface ExportMetadata {
  /** Tên định danh ứng dụng */
  application: 'Stock Chart Extractor';

  /** Loại xuất dữ liệu */
  exportType: 'ALL';

  /** Phiên bản schema của tệp xuất (bắt đầu từ 1) */
  schemaVersion: 1;

  /** Thời điểm xuất dữ liệu chuẩn ISO 8601 kèm múi giờ */
  exportedAt: string; // e.g. "2026-11-17T11:30:00.000+07:00"

  /** Phiên bản extension (ví dụ: "0.1.0") */
  extensionVersion: string | null;

  /** Thông tin môi trường thực thi */
  environment: {
    platform: 'FireAnt';
    manifestVersion: 3;
    exportSource: 'StorageRepository';
  };

  /** Thống kê số lượng tổng hợp */
  summary: {
    totalStocks: number;
    totalSnapshots: number;
    totalDrawings: number;
    totalIndicators: number;
    totalWatchlistItems: number;
  };
}

export interface ExportedStockItem {
  symbol: string;
  exchange: string | null;
  sources: ('FIREANT' | 'EXTENSION')[];
  isOpened: boolean;
  isActive: boolean;
  chartContexts: string[]; // Danh sách các chartId hoặc compositeKey tương ứng
  lastDetectedAt: string | null; // ISO 8601
  createdAt: string; // ISO 8601
}

export type ExtractionDataStatus = 'SUCCESS' | 'EMPTY' | 'FAILED' | 'NOT_INVESTIGATED' | 'NOT_ACCESSIBLE';

export interface ExportedChartSnapshot {
  chartId: string;
  symbol: string;
  exchange: string | null;
  timeframe: string;
  compositeKey: string;
  status: ExtractionDataStatus;
  statusReason?: string;
  drawingsCount: number;
  indicatorsCount: number;
  drawings: DrawingItem[];
  indicators: IndicatorItem[];
  capturedAt: string | null; // ISO 8601
}

export interface ExportedWatchlistGroup {
  id: string;
  name: string;
  isDefault: boolean;
  displayIndex: number;
  totalSymbols: number;
  items: WatchlistItem[];
}

export interface ExportedWatchlist {
  status: ExtractionDataStatus;
  statusReason?: string;
  activeWatchlistId: string | null;
  totalWatchlists: number;
  watchlists: ExportedWatchlistGroup[];
  activeItems: WatchlistItem[];
  lastSyncedAt: string | null; // ISO 8601
}

export interface ExportAllDataEnvelope {
  metadata: ExportMetadata;
  stockRegistry: ExportedStockItem[];
  chartSnapshots: ExportedChartSnapshot[];
  watchlist: ExportedWatchlist;
}
```

### 7.2. Tính Độc lập của Schema Xuất (Schema Independence)
- **Lý do tách biệt:** Schema của tệp xuất đại diện cho giao ước dữ liệu công khai (Public Data Contract), dành cho người dùng và các hệ thống phân tích bên ngoài.
- `schemaVersion: 1` là một số nguyên độc lập. Khi cấu trúc lưu trữ nội bộ của Chrome Extension thay đổi (ví dụ nâng cấp từ `chrome.storage.local` partition sang IndexedDB), `Export Serializer` chỉ cần ánh xạ lại vào cấu trúc Envelope v1 mà **không làm hỏng tệp đã lưu của người dùng**.

### 7.3. Quan hệ Thực thể và Tính Toàn vẹn Tham chiếu (Referential Consistency)
1. **Quan hệ 1-Nhiều (Stock $\rightarrow$ Chart Snapshots):**
   - Mỗi mã trong `stockRegistry` chứa danh sách tham chiếu `chartContexts: ["FPT_HOSE_15", "FPT_HOSE_D"]`.
   - Mỗi snapshot trong `chartSnapshots` mang trường `compositeKey` hoặc `chartId` tương ứng.
2. **Quy tắc kiểm tra toàn vẹn (Integrity Rule):**
   - Mọi mã cổ phiếu xuất hiện trong `chartSnapshots` đều phải tồn tại bản ghi trong `stockRegistry`.
   - Không được phép có bản ghi mồ côi (Orphan Snapshots).

### 7.4. Phân định Trạng thái Dữ liệu (Data Completeness vs Failure)
Hệ thống **tuyệt đối không âm thầm chuyển lỗi trích xuất thành mảng rỗng** (`[]`):

| Trạng thái | Ý nghĩa kỹ thuật | Điều kiện kích hoạt |
|---|---|---|
| `SUCCESS` | Trích xuất thành công, có dữ liệu | Mảng `drawings` hoặc `indicators` có phần tử ($> 0$). |
| `EMPTY` | Trích xuất thành công, người dùng chưa vẽ | Biểu đồ kết nối tốt nhưng mảng rỗng ($= 0$). |
| `FAILED` | Trích xuất thất bại / Lỗi hệ thống | Bị chặn, crash model, hoặc lỗi serialize. Kèm `statusReason`. |
| `NOT_ACCESSIBLE` | Nguồn dữ liệu không thể truy cập | Tab bị đóng, cookie hết hạn hoặc phiên làm việc mất. |
| `NOT_INVESTIGATED` | Mã thủ công chưa từng được mở biểu đồ | Mã do người dùng nhập nhưng chưa mở trên FireAnt. |

### 7.5. Cơ chế Khử trùng An toàn & Danh sách Cho phép (Security Allowlist Sanitization)
Để đảm bảo an toàn tuyệt đối cho người dùng, `Export Serializer` bắt buộc thi hành bộ lọc Allowlist trước khi xuất tệp:

```typescript
// Danh sách trường cho phép (Allowlist)
const ALLOWED_WATCHLIST_ITEM_FIELDS = [
  'id', 'symbol', 'name', 'exchange', 'price', 
  'referencePrice', 'change', 'changePercent', 'volume', 'position', 'metadata'
];

// Danh sách trường cấm tuyệt đối (Blacklist Sanitize)
const FORBIDDEN_FIELDS = [
  'token', 'jwt', 'accessToken', 'refreshToken', 'cookie', 
  'password', 'sessionId', 'authorization', 'secret', 'email', 'phone'
];
```

Mọi thuộc tính thừa từ `localStorage.persist:watchlists` hoặc TradingView model không nằm trong allowlist hoặc chứa từ khóa nhạy cảm đều bị loại bỏ hoàn toàn.

### 7.6. Lược đồ Kiểm thực Zod cho Tệp Xuất (Export Zod Schema)

```typescript
export const ExportMetadataSchema = z.object({
  application: z.literal('Stock Chart Extractor'),
  exportType: z.literal('ALL'),
  schemaVersion: z.literal(1),
  exportedAt: z.string().datetime({ offset: true }),
  extensionVersion: z.string().nullable(),
  environment: z.object({
    platform: z.literal('FireAnt'),
    manifestVersion: z.literal(3),
    exportSource: z.literal('StorageRepository'),
  }),
  summary: z.object({
    totalStocks: z.number().int().nonnegative(),
    totalSnapshots: z.number().int().nonnegative(),
    totalDrawings: z.number().int().nonnegative(),
    totalIndicators: z.number().int().nonnegative(),
    totalWatchlistItems: z.number().int().nonnegative(),
  }),
});

export const ExportedStockItemSchema = z.object({
  symbol: z.string().min(1),
  exchange: z.string().nullable(),
  sources: z.array(z.enum(['FIREANT', 'EXTENSION'])),
  isOpened: z.boolean(),
  isActive: z.boolean(),
  chartContexts: z.array(z.string()),
  lastDetectedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const ExportedChartSnapshotSchema = z.object({
  chartId: z.string(),
  symbol: z.string().min(1),
  exchange: z.string().nullable(),
  timeframe: z.string(),
  compositeKey: z.string(),
  status: z.enum(['SUCCESS', 'EMPTY', 'FAILED', 'NOT_INVESTIGATED', 'NOT_ACCESSIBLE']),
  statusReason: z.string().optional(),
  drawingsCount: z.number().int().nonnegative(),
  indicatorsCount: z.number().int().nonnegative(),
  drawings: z.array(DrawingObjectSchema),
  indicators: z.array(IndicatorItemSchema),
  capturedAt: z.string().nullable(),
});

export const ExportedWatchlistSchema = z.object({
  status: z.enum(['SUCCESS', 'EMPTY', 'NOT_ACCESSIBLE']),
  statusReason: z.string().optional(),
  activeWatchlistId: z.string().nullable(),
  totalWatchlists: z.number().int().nonnegative(),
  watchlists: z.array(WatchlistGroupSchema),
  activeItems: z.array(WatchlistItemSchema),
  lastSyncedAt: z.string().nullable(),
});

export const ExportAllDataEnvelopeSchema = z.object({
  metadata: ExportMetadataSchema,
  stockRegistry: z.array(ExportedStockItemSchema),
  chartSnapshots: z.array(ExportedChartSnapshotSchema),
  watchlist: ExportedWatchlistSchema,
});
```
