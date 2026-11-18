# TRADINGVIEW DRAWING LIFECYCLE & EVENT OBSERVATION RESEARCH

**Document Version:** 1.0.0  
**Research Target:** TradingView Website (`https://www.tradingview.com/chart/`)  
**Project:** Stock Chart Extractor (`d:\Projects\stock-chart-extractor\`)  
**Focus:** Lifecycle Stages, Event Detection Strategies, Floating Toolbar Hooks, and Extension Synchronization.

---

## 1. Drawing Lifecycle Overview

A drawing object on TradingView progresses through distinct lifecycle phases:

```
[Tool Selected from Left Palette]
              │
              ▼
    [1. Creation / Click Anchor] ──(Canvas MouseDown/Up)──> [Object Created in Engine]
              │                                                     │
              ▼                                                     ▼
     [2. Active Selection] <───(Click Existing Drawing)─── [Mounted to Active LineTools]
              │                                                     │
              ├──> [3. Floating Toolbar Appears in DOM]             │
              ├──> [4. Drag / Reposition Anchors] ──(Modifications)─┤
              ├──> [5. Style Tweaks via Toolbar]                    │
              │                                                     │
              ├──(Click Away)──> [6. Deselection] (Toolbar Unmounts)│
              │                                                     │
              └──(Press Del / Trash)──> [7. Deletion] ──────────────┘
```

---

## 2. Event Observation Strategies Comparison

Unlike FireAnt, where some internal observables or direct model polling can be evaluated against `window.chartWidget`, TradingView Website encapsulates its event bus (`chart.onChartReady`, `createShape`, etc.). We evaluated four observation architectures:

| Observation Strategy | Feasibility on TradingView Website | Overhead / CPU Impact | Detection Latency | Implementation Complexity |
|---|---|---|---|---|
| **Strategy A: Native JS Event Bus** | **NOT AVAILABLE** (Internal bus hidden inside closures). | Very Low | Real-time (0ms) | Blocked (Requires reverse engineering minified symbols). |
| **Strategy B: Floating Toolbar MutationObserver** | **VERIFIED & WORKING** | Minimal (DOM-targeted observer) | Immediate on click (<50ms) | Low |
| **Strategy C: Network Traffic Hook (Fetch / WS)** | **FEASIBLE** (Via Main World wrapper) | Low | When synced (<500ms) | Medium |
| **Strategy D: Polling / Diff Engine** | **HIGHLY FEASIBLE** (Fallback) | Configurable (e.g. 2s interval) | Polling Interval (1-2s) | Low |

---

## 3. Deep Dive: Floating Toolbar Observer (Strategy B)

### 3.1 Mechanism
When a user clicks any drawing object on the canvas:
1. TradingView's canvas Hit-Test engine identifies the clicked line tool.
2. The UI mounts a floating quick-action toolbar to the DOM:
   - Root Container: `div.floating-toolbar-react-wrapper` or `div[data-name="drawing-toolbar"]`
   - Position: Dynamically styled with `style="top: ...px; left: ...px;"` near the selected shape.

### 3.2 Information Exposed by Floating Toolbar
Inspecting the floating toolbar reveals:
- **Drawing Category / Actions:**
  - Color picker icon button (`[data-name="line-tool-color"]`)
  - Line thickness popup button (`[data-name="line-tool-width"]`)
  - Line style (Solid/Dashed) selector
  - Settings dialog button (opens comprehensive modal)
  - Lock / Unlock button
  - Clone / Copy button
  - Remove / Trash icon button (`[data-name="remove"]`)
- **Lifecycle Indicators:**
  - **Drawing Selected:** Node added to `document.body` matching `[class*="floating-toolbar"]`.
  - **Drawing Deselected:** Node removed from `document.body`.
  - **Drawing Deleted via UI:** Click on the trash button triggers unmount and deletion in engine.

### 3.3 Prototype Verification
In prototype `06-lifecycle-observer.js`, a `MutationObserver` targeting `document.body` cleanly detected:
- Selection: Triggered `DRAWING_TOOLBAR_MOUNTED` with zero CPU penalty when idle.
- Deselection: Triggered `DRAWING_TOOLBAR_UNMOUNTED`.

---

## 4. Deep Dive: Network Traffic Interception (Strategy C)

When drawings are created, edited, or deleted, TradingView saves state to its cloud:
1. **REST Sync:**
   - Triggers `POST https://layout.tradingview.com/v1/charts/<layoutId>/save/`
   - Request payload contains the updated JSON layout including all line tools.
2. **WebSocket Sync:**
   - Client sends binary/text framed messages over `wss://data.tradingview.com/socket.io/`.

By injecting a lightweight proxy into `window.fetch` or `window.WebSocket` in the Main World (`world: 'MAIN'`), a Chrome Extension can intercept layout payloads passively as they are sent or received by TradingView, with zero polling overhead.

---

## 5. Architectural Recommendation for Stock Chart Extractor

For a future TradingView integration module within Stock Chart Extractor:
- **Primary Live Trigger:** DOM `MutationObserver` on the Floating Toolbar (`.floating-toolbar-react-wrapper`) combined with `History API` hooks (`pushState`/`replaceState`) for symbol/interval changes.
- **Snapshot Extraction:** Network hook on layout synchronization responses or storage cache diffing.
- **Teardown Safety:** All observers and listeners must cleanly disconnect when navigating away or unmounting the extension side panel to avoid memory leaks.
