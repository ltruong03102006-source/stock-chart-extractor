# TRADINGVIEW DRAWING MODEL & PERSISTENCE RESEARCH

**Document Version:** 1.0.0  
**Research Target:** TradingView Website (`https://www.tradingview.com/chart/`)  
**Project:** Stock Chart Extractor (`d:\Projects\stock-chart-extractor\`)  
**Focus:** Data Models, Line Tools Representation, Persistence Layers, and Normalization Feasibility.

---

## 1. Comparative Analysis: FireAnt vs TradingView Commercial Website

| Architectural Dimension | FireAnt Runtime Model | TradingView Website Runtime Model |
|---|---|---|
| **Base Engine** | Self-hosted TradingView Charting Library (Advanced Charts). | Proprietary, server-synced SaaS Commercial Platform. |
| **Model Access Point** | Exposed globally at `window.chartWidget.model().m_model`. | Encapsulated in Webpack module closures and private React component state. |
| **Line Tool Enumerator** | `allLineTools()` returning an array of live class instances. | Stored within internal `panes[].sources[]` or `LineToolsAndGroupsState`. |
| **Getter Methods** | Instances implement `.id()`, `.name()`, `.points()`, `.properties()`. | Internal classes/records; direct method access guarded behind minified symbols. |
| **Persistence Mechanism** | Local browser cache / FireAnt profile API. | Synchronized live to TradingView cloud via WebSocket & Layout REST API. |

---

## 2. TradingView Drawing Objects Internal Structure

Based on reverse engineering of TradingView's serialized layout representations (`LineToolsAndGroupsState`) and Charting Library specifications, drawings are structured as follows:

### 2.1 Identifier (`id`)
- **Format:** 6 to 12 alphanumeric characters (e.g. `"g1829abc"`, `"e8e6f1"`).
- **Scope:** Unique within a chart layout pane.
- **Persistence:** Persists across reloads if the user saves the layout (`/chart/<layoutId>/`); regenerated or ephemeral in anonymous sessions.

### 2.2 Tool Types (`name` / `type`)
TradingView internal class names follow the `LineTool<Type>` naming convention:
- Trend Line: `LineToolTrendLine` (type: `"trend_line"`)
- Horizontal Line: `LineToolHorzLine` (type: `"horizontal_line"`)
- Horizontal Ray: `LineToolHorzRay` (type: `"horizontal_ray"`)
- Ray: `LineToolRay` (type: `"ray"`)
- Extended Line: `LineToolExtended` (type: `"extended_line"`)
- Parallel Channel: `LineToolParallelChannel` (type: `"parallel_channel"`)
- Fibonacci Retracement: `LineToolFibRetracement` (type: `"fib_retracement"`)
- Rectangle: `LineToolRectangle` (type: `"rectangle"`)
- Text Note / Callout: `LineToolText` / `LineToolCallout` (type: `"text"`)

### 2.3 Coordinates & Points (`points`)
A drawing object contains 1 to $N$ anchor points:
```typescript
interface TradingViewPoint {
  index?: number;    // Bar index along the X time-axis
  time_t?: number;   // Unix timestamp in seconds (or ms)
  price: number;     // Numeric value along the Y price-axis
}
```
- Single-point tools (Horizontal Line, Price Label): 1 anchor point.
- Two-point tools (Trend Line, Rectangle): 2 anchor points.
- Multi-point tools (Fibonacci Retracement, Polyline, Head & Shoulders): 3 to 10+ points.

### 2.4 Visual Styles & Properties
TradingView maintains drawing visual state as an internal property object:
- `linecolor`: RGBA hex or CSS color string (e.g. `"#2962FF"` or `"rgba(41, 98, 255, 1)"`).
- `linewidth`: Integer line thickness (e.g. `1`, `2`, `3`, `4`).
- `linestyle`: Integer constant: `0` (Solid), `1` (Dotted), `2` (Dashed).
- `transparency`: Integer opacity (`0` = opaque, `100` = transparent).
- `fillBackground`: Boolean for enclosed shapes (Rectangles, Channels).
- `backgroundColor`: Fill color for enclosed shapes.
- `text`: String content for annotations, callouts, or line labels.
- `visible`: Boolean flag indicating visibility toggle.
- `frozen` / `locked`: Boolean preventing accidental dragging.

---

## 3. Persistence & Data Flow Architecture

TradingView synchronizes drawing and chart layout data through a multi-tier pipeline:

```
[User Canvas Interaction]
         │
         ▼
[Internal Chart Engine Model]
         │
         ├──> [HTML5 Canvas Render Engine] (Immediate 60fps draw)
         │
         ├──> [WebSocket Client: wss://data.tradingview.com/socket.io/]
         │       └─> Dispatches layout diffs to TradingView servers
         │
         ├──> [Layout REST API: https://layout.tradingview.com/]
         │       └─> POST /save/ or PUT /charts/<id>
         │
         └──> [Local Cache (IndexedDB / LocalStorage)]
                 └─> Fallback offline session recovery
```

### 3.1 Network REST & Storage Endpoints
1. `GET/POST https://layout.tradingview.com/v1/charts/<layoutId>`:
   Returns serialized layout containing:
   - `content`: Base64 or JSON-encoded payload.
   - `panes`: Array of chart sub-windows (main pane, indicator panes).
   - `sources`: Array of line tools with coordinate states.
2. `POST https://charts-storage.tradingview.com/`:
   Cloud synchronization for user chart templates and drawings.

### 3.2 WebSocket Traffic (`wss://data.tradingview.com/socket.io/`)
- TradingView establishes a persistent duplex WebSocket connection for quotes, market depth, and real-time layout syncing.
- Frame messages follow the engine.io / socket.io framing format (`~m~<length>~m~<json>`).
- When a user modifies a drawing, the client transmits layout delta messages upstream.

---

## 4. Normalization Mapping: TradingView to Stock Chart Extractor

The Stock Chart Extractor defines a strictly validated `DrawingObject` schema (`src/messaging/message.schemas.ts`). The table below outlines how TradingView internal drawing attributes map to `DrawingObject`:

| Stock Chart Extractor Field | Type | FireAnt Source | TradingView Mapping Target | Feasibility |
|---|---|---|---|---|
| `id` | `string` | `tool.id()` | `lineTool.id` \|\| `lineTool._id` | **HIGH** |
| `platformId` | `string` (opt) | N/A | `"tradingview"` | **VERIFIED** |
| `type` | `string` | Subclass / `name()` | `lineTool.name.replace('LineTool', '').toLowerCase()` | **HIGH** |
| `name` | `string` | `tool.name()` | `lineTool.name` (e.g. `LineToolTrendLine`) | **HIGH** |
| `points` | `DrawingPoint[]` | `extractSafePoints(tool)` | Extracted from `points` array: `{ time, price, index }` | **HIGH** |
| `properties` | `Record<string, unknown>` | `tool.properties().state()` | Properties state dict | **HIGH** |
| `style.linecolor` | `string` | `p.linecolor.value()` | `lineTool.state.linecolor` | **HIGH** |
| `style.linewidth` | `number` | `p.linewidth.value()` | `lineTool.state.linewidth` | **HIGH** |
| `style.linestyle` | `number` | `p.linestyle.value()` | `lineTool.state.linestyle` | **HIGH** |
| `visible` | `boolean` | `p.visible.value()` | `lineTool.state.visible ?? true` | **HIGH** |
| `locked` | `boolean` | `tool.isLocked()` | `lineTool.state.frozen ?? false` | **HIGH** |
| `updatedAt` | `number` | Timestamp | `Date.now()` or server modification timestamp | **HIGH** |

### Normalization Conclusion
If the drawing state is intercepted (via Main World runtime hook, network payload capture, or layout cache extraction), its data structure is **100% compatible** with Stock Chart Extractor's `DrawingObject` and `NormalizedDrawing` models. The challenge lies solely in data acquisition, not data schema compatibility.
