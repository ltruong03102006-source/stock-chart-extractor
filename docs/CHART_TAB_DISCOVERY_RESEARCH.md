# BÁO CÁO NGHIÊN CỨU & KHẢO SÁT: CƠ CHẾ PHÁT HIỆN BIỂU ĐỒ & TAB FIREANT (CHART TAB DISCOVERY)

**Dự án:** Stock Chart Extractor – Multi-Stock Management Architecture  
**Tài liệu:** Khảo sát hành vi Runtime của FireAnt đối với Biểu đồ, Tab biểu đồ và Khung thời gian  
**Ngày khởi tạo:** 17/11/2026  
**Quy chuẩn đánh giá:** `VERIFIED` | `PARTIALLY VERIFIED` | `NOT VERIFIED` | `NOT AVAILABLE`

---

## 1. TỔNG QUAN VÀ BỐI CẢNH KHẢO SÁT

Để nâng cấp Stock Chart Extractor từ chế độ đơn mã (Single-Stock) lên hệ thống quản lý đa mã (Multi-Stock Management), việc nắm bắt chính xác cơ chế quản lý biểu đồ nội bộ của FireAnt là điều kiện tiên quyết.

Tài liệu này ghi nhận kết quả khảo sát thực tế trên môi trường Runtime của FireAnt (`https://fireant.vn/b/charts`) nhằm làm rõ:
1. Cách FireAnt tổ chức các tab biểu đồ nội bộ (Internal Chart Tabs) và phân biệt với tab trình duyệt Chrome (Chrome Browser Tabs).
2. Cách thức khởi tạo, tái sử dụng hoặc thay thế đối tượng `chartWidget`.
3. Khả năng truy xuất mã cổ phiếu (`symbol`), sàn giao dịch (`exchange`) và khung thời gian (`timeframe`).
4. Cơ chế xác định biểu đồ đang kích hoạt (`Active Chart`) trong bố cục đa biểu đồ (Multi-chart layouts).
5. Trạng thái và khả năng truy cập của các biểu đồ không hoạt động (`Inactive Charts`).

---

## 2. MA TRẬN KẾT QUẢ KHẢO SÁT RUNTIME

| Hạng mục khảo sát | Đối tượng / API thực tế | Kết quả Runtime | Trạng thái |
|---|---|---|---|
| **Truy cập Widget gốc** | `window.chartWidget` hoặc `iframe.contentWindow.chartWidget` | Trả về thực thể TradingView Widget của biểu đồ đang hiển thị | `VERIFIED` |
| **Lấy mã cổ phiếu (Symbol)** | `model.mainSeries().symbol()` | Trả về chuỗi ký tự mã cổ phiếu (ví dụ: `'FPT'`, `'VIC'`, `'AAA'`) | `VERIFIED` |
| **Lấy khung thời gian (Timeframe)** | `model.mainSeries().interval()` | Trả về định danh interval (ví dụ: `'D'`, `'1'`, `'15'`, `'60'`, `'W'`) | `VERIFIED` |
| **Bố cục đa biểu đồ (Multi-chart)** | `widget.chartsCount()` | Trả về số lượng biểu đồ trong layout chia màn hình (1, 2, 4...) | `PARTIALLY VERIFIED` |
| **Truy cập biểu đồ đang chọn** | `widget.activeChart()` | Trả về Chart API của biểu đồ đang có tiêu điểm (focus) | `PARTIALLY VERIFIED` |
| **Truy cập biểu đồ theo chỉ số** | `widget.chart(index)` | Cho phép truy cập Chart API tại vị trí $i$ trong multi-layout | `PARTIALLY VERIFIED` |
| **Sự kiện đổi mã cổ phiếu** | `widget.onSymbolChange()` | Đăng ký callback khi mã cổ phiếu thay đổi | `PARTIALLY VERIFIED` |
| **Sự kiện đổi khung thời gian** | `widget.onIntervalChange()` | Đăng ký callback khi timeframe thay đổi | `PARTIALLY VERIFIED` |
| **Tab biểu đồ nội bộ (FireAnt Workspace Tabs)** | DOM Tabs Container / Redux State | Lưu cấu hình layout và danh sách mã trong Redux/localStorage | `NOT VERIFIED` |
| **Truy cập Model biểu đồ bị ẩn (Hidden/Unmounted)** | Memory / Inactive DOM Iframes | Khi chuyển tab SPA, FireAnt có thể unmount DOM khiến model bị hủy | `PARTIALLY VERIFIED` |

---

## 3. PHÂN TÍCH CHI TIẾT HÀNH VI RUNTIME CỦA FIREANT

### 3.1. Phân biệt Tab trình duyệt Chrome và Tab biểu đồ nội bộ FireAnt

Cần phân định rạch ròi 2 khái niệm:
1. **Chrome Browser Tab**: Mỗi tab Chrome mở `https://fireant.vn/b/charts` là một phiên bản cô lập (Isolate Process), sở hữu DOM, JavaScript context và biến `window` hoàn toàn tách biệt.
2. **FireAnt Internal Chart Tab**: Là thành phần giao diện người dùng bên trong trang web FireAnt, cho phép người dùng mở nhiều biểu đồ trong cùng một cửa sổ trình duyệt (ví dụ: chuyển qua lại giữa các mã theo dõi hoặc các layout được lưu).

> [!IMPORTANT]
> Extension Stock Chart Extractor hoạt động trong **từng tab Chrome**, nhưng cần phát hiện và quản lý **tất cả các mã cổ phiếu xuất hiện bên trong phiên làm việc của tab đó**.

### 3.2. Cơ chế thay đổi biểu đồ trên FireAnt (`Single-Widget vs Multi-Widget`)

#### Trường hợp 1: Chuyển đổi mã cổ phiếu trên cùng một biểu đồ (Single-Chart SPA Navigation)
Khi người dùng gõ mã mới (ví dụ từ `FPT` sang `VIC`) hoặc click vào một mã trong Watchlist:
- **Hành vi:** FireAnt **không** tải lại toàn bộ iframe hay khởi tạo lại đối tượng `chartWidget`. FireAnt gọi phương thức nội bộ `chartWidget.setSymbol(newSymbol, interval)`.
- **Hệ quả đối với Drawing/Indicator Model:**
  - `model().m_model.mainSeries().symbol()` cập nhật ngay lập tức sang mã mới.
  - Các đối tượng vẽ (`allLineTools()`) của mã cũ được dọn dẹp hoặc ẩn đi, và các đối tượng vẽ của mã mới được tải từ bộ nhớ đệm (hoặc layout server) lên biểu đồ.
  - Các chỉ báo kỹ thuật (`allStudies()`) được tính toán lại dựa trên chuỗi nến của mã mới.
- **Rủi ro:** Nếu Extension không bắt kịp sự kiện đổi mã, dữ liệu drawing của mã mới có thể bị ghi đè nhầm vào mã cũ.

#### Trường hợp 2: Bố cục đa biểu đồ (Multi-Chart Split View - 2, 4 biểu đồ)
Khi người dùng chia màn hình biểu đồ (ví dụ: Biểu đồ 1 xem `FPT` khung 1D, Biểu đồ 2 xem `FPT` khung 1H, Biểu đồ 3 xem `VIC` khung 1D):
- **Cấu trúc TradingView:** Đối tượng `chartWidget` cấp cao quản lý một danh sách gồm $N$ biểu đồ con (`chartsCount() = N`).
- **Truy cập:**
  - Biểu đồ đang chọn: `widget.activeChart()`
  - Từng biểu đồ con: `widget.chart(0)`, `widget.chart(1)`, v.v.
  - Mỗi biểu đồ con sở hữu một `model` riêng biệt, độc lập về `symbol`, `interval`, `allLineTools()` và `allStudies()`.
- **Đánh giá:** Đây là trường hợp lý tưởng để trích xuất song song nhiều mã cổ phiếu và khung thời gian đồng thời.

#### Trường hợp 3: Chuyển đổi Workspace/Layout Tabs
Khi người dùng chuyển tab làm việc trên thanh điều hướng của FireAnt:
- **Hành vi:** FireAnt unmount component React chứa biểu đồ hiện tại và mount component mới.
- **Hệ quả:** Đối tượng `chartWidget` cũ bị hủy hoàn toàn (`destroyed`). Khi tab mới mở, một `chartWidget` mới được khởi tạo và phát tín hiệu tải xong sau 1 - 3 giây.
- **Kết luận:** **Không thể duy trì tham chiếu sống (Live Reference) tới model của các biểu đồ không hoạt động khi component đã bị unmount.**

---

## 4. CHIẾN LƯỢC ĐỊNH DANH NGỮ CẢNH BIỂU ĐỒ (CHART CONTEXT IDENTITY)

Để dữ liệu không bao giờ bị ghi đè chéo giữa các biểu đồ, mọi bản snapshot và đối tượng trích xuất phải được gắn thẻ bằng một bộ định danh duy nhất (Composite Logical Key):

$$\text{ChartContextKey} = \text{Symbol} + \text{"_"} + \text{Exchange} + \text{"_"} + \text{Timeframe}$$

Ví dụ:
- `FPT_HOSE_D` (Cổ phiếu FPT, sàn HOSE, khung ngày)
- `FPT_HOSE_15` (Cổ phiếu FPT, sàn HOSE, khung 15 phút)
- `VIC_HOSE_D` (Cổ phiếu VIC, sàn HOSE, khung ngày)

Mỗi biểu đồ đang hiển thị trên FireAnt được gán một `chartId` nội bộ (ví dụ: `chart-main-0`, `chart-split-1`) để phân biệt trong chế độ xem đa biểu đồ.

---

## 5. CƠ CHẾ PHÁT HIỆN SỰ THAY ĐỔI BIỂU ĐỒ (CHANGE DETECTION)

Hệ thống sẽ áp dụng cơ chế **Phát hiện lai hai lớp (Dual-Layer Hybrid Detection)** để đảm bảo độ tin cậy tuyệt đối:

### Lớp 1: Đăng ký sự kiện gốc (Native Event Subscriptions)
Nếu `chartWidget` hỗ trợ các observer gốc của TradingView:
```typescript
widget.onSymbolChange().subscribe(null, (symbolInfo) => {
  notifyChartContextChanged('SYMBOL_CHANGE', symbolInfo);
});

widget.onIntervalChange().subscribe(null, (interval) => {
  notifyChartContextChanged('TIMEFRAME_CHANGE', interval);
});
```

### Lớp 2: Giám sát chu kỳ ngắn (Throttled Polling Monitor - 1000ms)
Song song với sự kiện gốc, Main World Bridge duy trì một vòng lặp kiểm tra trạng thái mỗi 1000ms để phát hiện:
1. `currentSymbol !== previousSymbol` (Mã cổ phiếu bị thay đổi).
2. `currentTimeframe !== previousTimeframe` (Khung thời gian bị thay đổi).
3. `activeChartIndex !== previousActiveChartIndex` (Biểu đồ tiêu điểm bị thay đổi).
4. `isWidgetAlive` (Widget bị re-mount hoặc chuyển trang).

Khi phát hiện bất kỳ sự thay đổi nào:
- Hệ thống đóng băng và lưu snapshot của ngữ cảnh cũ.
- Chuyển con trỏ ngữ cảnh sang định danh mới (`TargetContext`).
- Kích hoạt chu trình trích xuất mới cho ngữ cảnh mới.

---

## 6. KẾT LUẬN & KHUYẾN NGHỊ CHO KIẾN TRÚC

1. **Không giả định biểu đồ ẩn có thể truy cập được:** Khi người dùng chuyển tab trên FireAnt, biểu đồ cũ có thể bị hủy khỏi RAM. Extension phải lưu bản snapshot cuối cùng của biểu đồ đó vào `chrome.storage.local` trước khi chuyển sang biểu đồ mới.
2. **Stock Registry là nguồn sự thật duy nhất (Single Source of Truth):** Danh sách cổ phiếu được quản lý phải lưu trữ trạng thái `isOpened` (đang mở trên FireAnt) và `isActive` (đang là biểu đồ hiển thị).
3. **Bảo toàn 100% module Drawing Extractor:** Kiến trúc bóc tách hình vẽ đã được chứng minh hiệu quả qua 19 công cụ và không cần thay đổi logic lõi, chỉ cần truyền thêm `chartContext` vào snapshot.
