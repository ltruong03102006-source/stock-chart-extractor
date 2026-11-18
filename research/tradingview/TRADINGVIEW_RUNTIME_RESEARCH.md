# TRADINGVIEW RUNTIME ARCHITECTURE RESEARCH

**Document Version:** 1.0.0  
**Research Target:** TradingView Commercial Website (`https://www.tradingview.com/chart/`)  
**Project:** Stock Chart Extractor (`d:\Projects\stock-chart-extractor\`)  
**Scope:** Runtime Discovery, DOM Structure, Closure Isolation, and Global Namespace Inspection.

---

## 1. Executive Summary

In the **Stock Chart Extractor** project, drawing extraction on **FireAnt** (`fireant.vn`) was successfully implemented using the runtime API:
```javascript
window.chartWidget.model().m_model.allLineTools()
```
This investigation evaluated whether a similar direct JavaScript API exists on the commercial **TradingView Website** (`https://www.tradingview.com/chart/`).

### Primary Finding
> **TradingView Commercial Website encapsulates the entire charting runtime, model, and line tools inside private Webpack closures and internal React component trees. Neither `window.chartWidget` nor `window.tvWidget` is exposed on the global `window` object.**

While FireAnt self-hosts a version of TradingView Charting Library (Advanced Charts) with the global `window.chartWidget` explicitly exposed for host integration, TradingView's commercial SaaS platform compiles its charting engine into minified, obfuscated Webpack chunks, strictly sealing chart state away from the global namespace.

---

## 2. Global JavaScript Environment (`window` Scope)

### 2.1 Candidate Charting Globals Inspection
The runtime discovery probe (`01-runtime-discovery.js`) scanned the global `window` object on `https://www.tradingview.com/chart/` for symbols matching charting, widget, and model keywords:

| Variable Candidate | Status on TradingView Website | Status on FireAnt | Description |
|---|---|---|---|
| `window.chartWidget` | **NOT AVAILABLE** (`undefined`) | **VERIFIED** (Object) | Core entrypoint used by FireAnt to access chart model. |
| `window.chartWidget.model()` | **NOT AVAILABLE** (`undefined`) | **VERIFIED** (Function) | Retrieves FireAnt chart presenter model. |
| `window.tvWidget` | **NOT AVAILABLE** (`undefined`) | **NOT AVAILABLE** | Standard variable name recommended by TradingView Charting Library docs for third-party embeds; not used on the commercial website. |
| `window.TradingView` | **PARTIALLY VERIFIED** | **NOT AVAILABLE** | Exists primarily as a namespace for tracking, static utilities, and login session helpers; does not expose the active chart model instance. |
| `window.TradingView.widget` | **NOT AVAILABLE** (`undefined`) | **NOT AVAILABLE** | Embedded widget constructor, not bound to the active full chart. |
| `window.webpackChunktradingview` | **VERIFIED** (Array) | N/A | Production Webpack 5 chunk loader array containing compiled modules. |

### 2.2 Webpack Closure Architecture
TradingView uses Webpack with aggressive code splitting and scope hoisting. In development or unhardened environments, one might inspect modules via `webpackChunk.push()`. However, on TradingView commercial production:
1. The global Webpack `require` / `__webpack_require__` is stripped from public access.
2. Modules are encapsulated in factory functions executed once during initial page hydration.
3. Chart models and Line Tool controllers are stored in local lexical closures within Webpack module scopes, preventing direct external extraction via console without memory instrumentation.

---

## 3. DOM & Canvas Execution Environment

### 3.1 Iframe vs Direct DOM
- **Third-party TradingView Embeds:** Frequently run inside cross-origin `<iframe>` tags (`s.tradingview.com/widgetembed/...`), which block Chrome Extensions via same-origin policy unless specific permissions are declared.
- **TradingView Commercial Website (`https://www.tradingview.com/chart/`):**
  - **Does NOT run inside an iframe.** The charting canvas is mounted directly into the top-level document DOM.
  - The chart container hierarchy is structured as:
    ```
    div.chart-page
      └── div.layout__area--top
      └── div.layout__area--center
            └── div.chart-container-border
                  └── div.chart-gui-wrapper
                        ├── div.chart-container
                        │     ├── canvas (Main candle series, drawings, grid)
                        │     ├── canvas (Cursor, crosshair, dynamic overlays)
                        │     └── canvas (Price axis, time axis)
                        └── div.pane-separator (for indicators / sub-panes)
    ```

### 3.2 HTML5 Canvas Rendering
TradingView does not render drawings (trend lines, horizontal lines, rectangles) as SVG or HTML DOM elements. 
- All lines, text, handles, and anchors are rendered directly to HTML5 2D or WebGL `<canvas>` contexts.
- Consequently, drawing coordinates and text values cannot be scraped from the DOM tree.
- DOM interactions (clicking a drawing) are handled by an internal Hit-Test engine that translates mouse `(x, y)` screen pixels to price/time coordinates using internal scale models.

---

## 4. React Fiber Architecture

TradingView's UI (toolbars, dialogs, headers, legend items) is implemented in React 18+.

### 4.1 React Fiber Node Attachment
Every major container in the DOM attaches internal React Fiber properties:
- `__reactFiber$<randomHash>`
- `__reactProps$<randomHash>`

### 4.2 Traversal Assessment
By probing `.chart-container` or `.chart-gui-wrapper`, a script running in the Main World can traverse the Fiber linked list (`return`, `child`, `sibling`).
- **UI State in Fiber:** Fiber nodes retain props and memoized state for React UI components (e.g. Symbol Search Modal, Timeframe Bar, Settings Dialog).
- **Chart Core Engine Separation:** The underlying charting engine (written in TypeScript/C++ compiled to WebAssembly/JS) is instantiated as an imperative engine outside React's state tree. The React wrapper holds a reference to a bridge container, but the internal `m_model.allLineTools()` equivalent is protected behind private object properties and closures.

---

## 5. Security & Chrome Extension Context (Manifest V3)

| Security Aspect | Behavior on TradingView Website | Impact on Chrome Extension |
|---|---|---|
| **Isolated World Content Script** | Has access to DOM, but completely separated from Main World JavaScript variables. | Cannot read `window` objects or React Fiber properties directly. |
| **Main World Script Injection** | Supported in MV3 via `world: 'MAIN'` in `chrome.scripting.executeScript` or `manifest.json`. | Allows execution in the same context as TradingView scripts, enabling access to React Fiber and window-level probes. |
| **Content Security Policy (CSP)** | Enforces strict script-src and prevents inline `eval()` or unvetted external scripts. | Extension scripts must be injected via official WebExtensions APIs; inline string injection (`<script>code</script>`) is blocked. |
| **Authentication & Tokens** | Session cookies (`sessionid`) and auth headers are HttpOnly and protected. | Extension must strictly avoid credential tampering or token exposure (read-only architecture). |

---

## 6. Empirical Classification Summary

| Research Question | Classification | Verified Findings |
|---|---|---|
| Global objects on `window`? | **PARTIALLY VERIFIED** | `TradingView` namespace exists for static/session features; charting engine objects (`chartWidget`, `tvWidget`) are absent. |
| Chart runs in iframe? | **VERIFIED** | False. Executes in top-level DOM. |
| Drawing objects rendered in DOM? | **VERIFIED** | False. Rendered exclusively on HTML5 Canvas. |
| React Fiber accessible? | **VERIFIED** | True. Available on DOM containers in Main World. |
| Direct FireAnt API match? | **NOT AVAILABLE** | `window.chartWidget.model().m_model.allLineTools()` does not exist on TradingView Website. |
