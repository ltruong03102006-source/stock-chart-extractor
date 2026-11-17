import {
  EXTENSION_SOURCE,
  type ChartSnapshot,
  type IndicatorsSnapshot,
  type WatchlistSnapshot,
  type StockRegistryState,
} from '@/src/messaging/message.types';
import { ExtensionMessageSchema } from '@/src/messaging/message.schemas';
import { getAllStocks, normalizeSymbol } from '@/src/registry/stock-registry';
import { ExportManager } from '@/src/export/export-manager';

// Global cache state for Side Panel
let currentRegistryState: StockRegistryState | null = null;
let currentDrawingsSnapshot: ChartSnapshot | null = null;
let currentIndicatorsSnapshot: IndicatorsSnapshot | null = null;
let currentWatchlistSnapshot: WatchlistSnapshot | null = null;
let updateCounter = 0;

// Smart DOM diffing caches to prevent UI jitter/flicker
let lastRenderedDrawingsJson = '';
let lastRenderedDrawingsListHtml = '';
let lastRenderedIndicatorsJson = '';
let lastRenderedIndicatorsListHtml = '';
let lastRenderedWatchlistJson = '';
let lastRenderedWatchlistListHtml = '';
let lastRenderedStockManagerHtml = '';

function updateBadge() {
  updateCounter++;
  const badgeEl = document.getElementById('sync-badge');
  if (badgeEl) {
    badgeEl.textContent = `Synced (#${updateCounter})`;
    badgeEl.className = 'badge badge-synced';
  }
}

// ----------------------------------------------------
// AREA A: STOCK MANAGER RENDERER
// ----------------------------------------------------
function renderStockManager(registry: StockRegistryState) {
  if (!registry) return;
  currentRegistryState = registry;

  const countEl = document.getElementById('stock-manager-count');
  const listEl = document.getElementById('stock-manager-list');
  const selectedStockTitleEl = document.getElementById('selected-stock-title');
  const selectedStockBadgesEl = document.getElementById('selected-stock-badges');

  const stocks = getAllStocks(registry);
  const countStr = `${stocks.length} mã`;
  if (countEl && countEl.textContent !== countStr) countEl.textContent = countStr;

  const activeItem = registry.activeSymbol ? registry.items[registry.activeSymbol] : null;
  if (selectedStockTitleEl) {
    let nextTitle = '---';
    if (activeItem) {
      const activeCtx = activeItem.chartContexts[0];
      const tfText = activeCtx ? ` • Khung: ${activeCtx.timeframe}` : '';
      const exText = activeItem.exchange ? ` • ${activeItem.exchange}` : '';
      nextTitle = `${activeItem.symbol}${exText}${tfText}`;
    }
    if (selectedStockTitleEl.textContent !== nextTitle) {
      selectedStockTitleEl.textContent = nextTitle;
    }
  }

  if (selectedStockBadgesEl) {
    const nextBadges = activeItem
      ? `<span class="badge ${activeItem.isActive ? 'badge-synced' : 'badge-pane-main'}">
          ${activeItem.isActive ? '● Active' : '○ Opened'}
        </span>`
      : '';
    if (selectedStockBadgesEl.innerHTML !== nextBadges) {
      selectedStockBadgesEl.innerHTML = nextBadges;
    }
  }

  if (listEl) {
    let nextHtml = '';
    if (stocks.length === 0) {
      nextHtml = `
        <div style="color: var(--text-secondary); text-align: center; padding: 12px; font-size: 11px;">
          Chưa có mã nào trong danh sách quản lý...
        </div>
      `;
    } else {
      nextHtml = stocks
        .map((item) => {
          const isCurrent = item.symbol === registry.activeSymbol;
          const activeCtx = item.chartContexts[0];
          const drawingsCount = activeCtx ? activeCtx.drawingsCount : 0;
          const indicatorsCount = activeCtx ? activeCtx.indicatorsCount : 0;

          let statusBadge = '';
          if (item.isActive) {
            statusBadge = '<span class="badge badge-synced" style="font-size: 10px;">● Active Chart</span>';
          } else if (item.isOpened) {
            statusBadge = '<span class="badge badge-pane-main" style="font-size: 10px;">○ FireAnt</span>';
          } else {
            statusBadge = '<span class="badge" style="background:#334155;color:#94a3b8;font-size:10px;">○ Manual</span>';
          }

          const borderStyle = isCurrent ? 'border-left: 3px solid #38bdf8; background: #1e293b;' : '';

          return `
            <div class="list-item stock-row" data-symbol="${item.symbol}" style="cursor: pointer; ${borderStyle}">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="tag-symbol">${item.symbol}</span>
                ${statusBadge}
                <span style="color: var(--text-secondary); font-size: 10px;">
                  ${drawingsCount > 0 ? `${drawingsCount}d` : ''} ${indicatorsCount > 0 ? `${indicatorsCount}i` : ''}
                </span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <button class="btn-delete-stock" data-symbol="${item.symbol}" title="Xóa mã khỏi danh sách quản lý" style="background: transparent; border: none; color: #ef4444; font-size: 14px; cursor: pointer; padding: 2px 6px; border-radius: 4px;">&times;</button>
              </div>
            </div>
          `;
        })
        .join('');
    }

    if (nextHtml !== lastRenderedStockManagerHtml) {
      lastRenderedStockManagerHtml = nextHtml;
      const scrollPos = listEl.scrollTop;
      listEl.innerHTML = nextHtml;
      listEl.scrollTop = scrollPos;

      // Attach row click to select active stock
      listEl.querySelectorAll('.stock-row').forEach((row) => {
        row.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          if (target.classList.contains('btn-delete-stock')) return;
          const symbol = row.getAttribute('data-symbol');
          if (symbol) {
            browser.runtime.sendMessage({
              source: EXTENSION_SOURCE,
              type: 'SET_ACTIVE_STOCK',
              payload: { symbol },
            }).catch(() => {});
          }
        });
      });

      // Attach delete button click
      listEl.querySelectorAll('.btn-delete-stock').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const symbol = btn.getAttribute('data-symbol');
          if (symbol) {
            browser.runtime.sendMessage({
              source: EXTENSION_SOURCE,
              type: 'REMOVE_MANUAL_STOCK',
              payload: { symbol },
            }).catch(() => {});
          }
        });
      });
    }
  }
}

// ----------------------------------------------------
// TAB 1: DRAWINGS RENDERER (SMART DIFFING)
// ----------------------------------------------------
function renderDrawings(snapshot: ChartSnapshot) {
  if (!snapshot) return;
  currentDrawingsSnapshot = snapshot;

  const symbolEl = document.getElementById('stat-symbol');
  const countEl = document.getElementById('stat-count');
  const tabCountDrawingsEl = document.getElementById('tab-count-drawings');
  const drawingListEl = document.getElementById('drawing-list');
  const jsonViewerDrawingsEl = document.getElementById('json-viewer-drawings');

  const symbol = snapshot.chart?.symbol || '---';
  if (symbolEl && symbolEl.textContent !== symbol) {
    symbolEl.textContent = symbol;
  }

  const total = snapshot.drawings?.length ?? 0;
  const totalStr = String(total);
  if (countEl && countEl.textContent !== totalStr) countEl.textContent = totalStr;
  if (tabCountDrawingsEl && tabCountDrawingsEl.textContent !== totalStr) tabCountDrawingsEl.textContent = totalStr;

  // 1. Render Drawing List only if content actually changed
  if (drawingListEl) {
    let nextListHtml = '';
    if (!snapshot.drawings || snapshot.drawings.length === 0) {
      nextListHtml = `
        <div style="color: var(--text-secondary); text-align: center; padding: 12px;">
          Chưa có hình vẽ nào trên biểu đồ. Hãy thử vẽ trên FireAnt!
        </div>
      `;
    } else {
      nextListHtml = snapshot.drawings
        .map(
          (d) => `
          <div class="list-item">
            <div>
              <strong style="color: var(--accent-blue);">${d.name}</strong>
              <span style="color: var(--text-secondary); font-size: 11px;">(${d.points.length} pts)</span>
            </div>
            <div style="font-size: 11px; color: var(--text-secondary);">
              ${d.locked ? '🔒' : ''} ${d.visible ? '👁️' : '🙈'}
            </div>
          </div>
        `
        )
        .join('');
    }

    if (nextListHtml !== lastRenderedDrawingsListHtml) {
      lastRenderedDrawingsListHtml = nextListHtml;
      const scrollPos = drawingListEl.scrollTop;
      drawingListEl.innerHTML = nextListHtml;
      drawingListEl.scrollTop = scrollPos;
    }
  }

  // 2. Render JSON Viewer only if JSON content actually changed
  if (jsonViewerDrawingsEl) {
    const nextJson = JSON.stringify(snapshot, null, 2);
    if (nextJson !== lastRenderedDrawingsJson) {
      lastRenderedDrawingsJson = nextJson;
      const scrollPos = jsonViewerDrawingsEl.scrollTop;
      jsonViewerDrawingsEl.textContent = nextJson;
      jsonViewerDrawingsEl.scrollTop = scrollPos;
      updateBadge();
    }
  }
}

// ----------------------------------------------------
// TAB 2: INDICATORS RENDERER (SMART DIFFING)
// ----------------------------------------------------
function renderIndicators(snapshot: IndicatorsSnapshot) {
  if (!snapshot) return;
  currentIndicatorsSnapshot = snapshot;

  const statIndicatorsCountEl = document.getElementById('stat-indicators-count');
  const tabCountIndicatorsEl = document.getElementById('tab-count-indicators');
  const statIndicatorsPanesEl = document.getElementById('stat-indicators-panes');
  const indicatorsListEl = document.getElementById('indicators-list');
  const jsonViewerIndicatorsEl = document.getElementById('json-viewer-indicators');

  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const total = items.length;
  const totalStr = String(total);
  if (statIndicatorsCountEl && statIndicatorsCountEl.textContent !== totalStr) statIndicatorsCountEl.textContent = totalStr;
  if (tabCountIndicatorsEl && tabCountIndicatorsEl.textContent !== totalStr) tabCountIndicatorsEl.textContent = totalStr;

  const mainCount = items.filter((i) => i.pane?.type === 'main').length;
  const sepCount = items.filter((i) => i.pane?.type === 'separate').length;
  const panesStr = `${mainCount} / ${sepCount}`;
  if (statIndicatorsPanesEl && statIndicatorsPanesEl.textContent !== panesStr) statIndicatorsPanesEl.textContent = panesStr;

  // 1. Render Indicators List only if changed
  if (indicatorsListEl) {
    let nextListHtml = '';
    if (items.length === 0) {
      nextListHtml = `
        <div style="color: var(--text-secondary); text-align: center; padding: 12px;">
          Chưa có chỉ báo nào trên biểu đồ.
        </div>
      `;
    } else {
      nextListHtml = items
        .map(
          (ind) => `
          <div class="list-item">
            <div>
              <strong style="color: var(--accent-blue);">${ind.name}</strong>
              <span style="color: var(--text-secondary); font-size: 11px;">(${ind.shortName || ind.type})</span>
            </div>
            <div>
              <span class="badge ${ind.pane?.type === 'main' ? 'badge-pane-main' : 'badge-pane-sep'}">
                ${ind.pane?.type === 'main' ? 'Main' : 'Pane'}
              </span>
            </div>
          </div>
        `
        )
        .join('');
    }

    if (nextListHtml !== lastRenderedIndicatorsListHtml) {
      lastRenderedIndicatorsListHtml = nextListHtml;
      const scrollPos = indicatorsListEl.scrollTop;
      indicatorsListEl.innerHTML = nextListHtml;
      indicatorsListEl.scrollTop = scrollPos;
    }
  }

  // 2. Render JSON Viewer only if changed
  if (jsonViewerIndicatorsEl) {
    const nextJson = JSON.stringify(snapshot, null, 2);
    if (nextJson !== lastRenderedIndicatorsJson) {
      lastRenderedIndicatorsJson = nextJson;
      const scrollPos = jsonViewerIndicatorsEl.scrollTop;
      jsonViewerIndicatorsEl.textContent = nextJson;
      jsonViewerIndicatorsEl.scrollTop = scrollPos;
      updateBadge();
    }
  }
}

// ----------------------------------------------------
// TAB 3: WATCHLIST RENDERER (SMART DIFFING)
// ----------------------------------------------------
function renderWatchlist(snapshot: WatchlistSnapshot) {
  if (!snapshot) return;
  currentWatchlistSnapshot = snapshot;

  const statWatchlistNameEl = document.getElementById('stat-watchlist-name');
  const statWatchlistCountEl = document.getElementById('stat-watchlist-count');
  const tabCountWatchlistEl = document.getElementById('tab-count-watchlist');
  const watchlistItemsListEl = document.getElementById('watchlist-items-list');
  const jsonViewerWatchlistEl = document.getElementById('json-viewer-watchlist');

  const activeGroup = (snapshot.watchlists || []).find((g) => g.id === snapshot.activeWatchlistId) || snapshot.watchlists?.[0];
  const items = snapshot.activeItems || activeGroup?.items || [];
  const total = items.length;
  const nameStr = activeGroup?.name || 'Mặc định';
  const totalStr = String(total);

  if (statWatchlistNameEl && statWatchlistNameEl.textContent !== nameStr) statWatchlistNameEl.textContent = nameStr;
  if (statWatchlistCountEl && statWatchlistCountEl.textContent !== totalStr) statWatchlistCountEl.textContent = totalStr;
  if (tabCountWatchlistEl && tabCountWatchlistEl.textContent !== totalStr) tabCountWatchlistEl.textContent = totalStr;

  // 1. Render Watchlist List only if changed
  if (watchlistItemsListEl) {
    let nextListHtml = '';
    if (items.length === 0) {
      nextListHtml = `
        <div style="color: var(--text-secondary); text-align: center; padding: 12px;">
          Chưa có danh mục theo dõi nào được tải.
        </div>
      `;
    } else {
      nextListHtml = items
        .map(
          (item) => `
          <div class="list-item">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="tag-symbol">${item.symbol}</span>
              <span style="color: var(--text-secondary); font-size: 11px;">${item.exchange || 'VN'}</span>
            </div>
            <div style="font-weight: 600; font-family: monospace;">
              ${item.price !== null && item.price !== undefined ? item.price.toFixed(2) : '---'}
            </div>
          </div>
        `
        )
        .join('');
    }

    if (nextListHtml !== lastRenderedWatchlistListHtml) {
      lastRenderedWatchlistListHtml = nextListHtml;
      const scrollPos = watchlistItemsListEl.scrollTop;
      watchlistItemsListEl.innerHTML = nextListHtml;
      watchlistItemsListEl.scrollTop = scrollPos;
    }
  }

  // 2. Render JSON Viewer only if changed
  if (jsonViewerWatchlistEl) {
    const nextJson = JSON.stringify(snapshot, null, 2);
    if (nextJson !== lastRenderedWatchlistJson) {
      lastRenderedWatchlistJson = nextJson;
      const scrollPos = jsonViewerWatchlistEl.scrollTop;
      jsonViewerWatchlistEl.textContent = nextJson;
      jsonViewerWatchlistEl.scrollTop = scrollPos;
      updateBadge();
    }
  }
}

// ----------------------------------------------------
// SYNC DISPATCHER FUNCTION
// ----------------------------------------------------
async function sendSyncRequest(button?: HTMLElement) {
  if (button) {
    button.textContent = 'Syncing...';
    setTimeout(() => {
      button.textContent = 'Request Sync';
    }, 1500);
  }

  // 1. Broadcast to extension background
  try {
    browser.runtime.sendMessage({
      source: EXTENSION_SOURCE,
      type: 'REQUEST_SYNC',
      timestamp: Date.now(),
    }).catch(() => {});
  } catch {}

  // 2. Query FireAnt tabs directly and send sync request
  try {
    const tabs = await browser.tabs.query({});
    const fireantTabs = tabs.filter((t) => t.url && t.url.includes('fireant'));
    for (const tab of fireantTabs) {
      if (tab.id) {
        browser.tabs.sendMessage(tab.id, {
          source: EXTENSION_SOURCE,
          type: 'REQUEST_SYNC',
          timestamp: Date.now(),
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[Stock Chart Extractor] Failed to query tabs for sync:', err);
  }
}

// ----------------------------------------------------
// CLIPBOARD COPY HELPER
// ----------------------------------------------------
function copyToClipboard(button: HTMLElement, getData: () => unknown) {
  const data = getData();
  if (!data) {
    const orig = button.textContent;
    button.textContent = 'No Data Yet';
    setTimeout(() => {
      button.textContent = orig;
    }, 1200);
    return;
  }
  navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
    const originalText = button.textContent;
    button.textContent = 'Copied!';
    setTimeout(() => {
      button.textContent = originalText;
    }, 1500);
  });
}

// ----------------------------------------------------
// INITIALIZATION FUNCTION (RUNS WHEN DOM IS READY)
// ----------------------------------------------------
function initSidePanel() {
  console.log('[Stock Chart Extractor][SidePanel] Initializing Side Panel UI...');

  // 1. Direct Click Handlers for Tabs
  const tabBtns = document.querySelectorAll<HTMLButtonElement>('.tab-btn');
  tabBtns.forEach((btn) => {
    btn.onclick = (e) => {
      e.preventDefault();
      const targetTabId = btn.getAttribute('data-tab');
      if (!targetTabId) return;

      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

      btn.classList.add('active');
      const targetEl = document.getElementById(targetTabId);
      if (targetEl) targetEl.classList.add('active');
    };
  });

  // 2. Action Buttons Click Handlers
  const btnSync = document.getElementById('btn-sync') as HTMLElement | null;
  if (btnSync) {
    btnSync.onclick = (e) => {
      e.preventDefault();
      sendSyncRequest(btnSync);
    };
  }

  const btnCopyDrawings = document.getElementById('btn-copy-drawings') as HTMLElement | null;
  if (btnCopyDrawings) {
    btnCopyDrawings.onclick = (e) => {
      e.preventDefault();
      copyToClipboard(btnCopyDrawings, () => currentDrawingsSnapshot);
    };
  }

  const btnCopyIndicators = document.getElementById('btn-copy-indicators') as HTMLElement | null;
  if (btnCopyIndicators) {
    btnCopyIndicators.onclick = (e) => {
      e.preventDefault();
      copyToClipboard(btnCopyIndicators, () => currentIndicatorsSnapshot);
    };
  }

  const btnCopyWatchlist = document.getElementById('btn-copy-watchlist') as HTMLElement | null;
  if (btnCopyWatchlist) {
    btnCopyWatchlist.onclick = (e) => {
      e.preventDefault();
      copyToClipboard(btnCopyWatchlist, () => currentWatchlistSnapshot);
    };
  }

  const btnExportAll = document.getElementById('btn-export-all') as HTMLButtonElement | null;
  if (btnExportAll) {
    btnExportAll.onclick = async (e) => {
      e.preventDefault();
      if (ExportManager.getState() === 'exporting') return;

      const originalText = btnExportAll.textContent || '📥 Export All JSON';
      const originalBg = btnExportAll.style.backgroundColor;

      // Visual State: Exporting
      btnExportAll.disabled = true;
      btnExportAll.style.cursor = 'wait';
      btnExportAll.style.backgroundColor = '#d97706';
      btnExportAll.textContent = '⏳ Đang đóng gói JSON...';

      try {
        const result = await ExportManager.executeExport();
        if (result.success) {
          // Visual State: Success
          btnExportAll.style.backgroundColor = '#10b981';
          const stockCount = result.stats?.totalStocks ?? 0;
          btnExportAll.textContent = `✓ Đã xuất (${stockCount} mã)`;
          setTimeout(() => {
            btnExportAll.disabled = false;
            btnExportAll.style.cursor = 'pointer';
            btnExportAll.style.backgroundColor = originalBg;
            btnExportAll.textContent = originalText;
          }, 3000);
        } else {
          // Visual State: Error
          btnExportAll.style.backgroundColor = '#ef4444';
          btnExportAll.textContent = '❌ Lỗi xuất file';
          console.error('[SidePanel] Export failed:', result.error);
          setTimeout(() => {
            btnExportAll.disabled = false;
            btnExportAll.style.cursor = 'pointer';
            btnExportAll.style.backgroundColor = originalBg;
            btnExportAll.textContent = originalText;
          }, 4000);
        }
      } catch (err) {
        btnExportAll.style.backgroundColor = '#ef4444';
        btnExportAll.textContent = '❌ Lỗi bất ngờ';
        console.error('[SidePanel] Export unhandled error:', err);
        setTimeout(() => {
          btnExportAll.disabled = false;
          btnExportAll.style.cursor = 'pointer';
          btnExportAll.style.backgroundColor = originalBg;
          btnExportAll.textContent = originalText;
        }, 4000);
      }
    };
  }

  // 3. Stock Manager Add Stock Handler
  const inputManual = document.getElementById('input-manual-symbol') as HTMLInputElement | null;
  const btnAddStock = document.getElementById('btn-add-stock') as HTMLButtonElement | null;

  function handleAddStock() {
    if (!inputManual) return;
    const raw = inputManual.value.trim();
    if (!raw) return;
    const symbol = normalizeSymbol(raw);
    if (!symbol) return;

    browser.runtime.sendMessage({
      source: EXTENSION_SOURCE,
      type: 'ADD_MANUAL_STOCK',
      payload: { symbol },
    }).catch(() => {});

    inputManual.value = '';
  }

  if (btnAddStock) {
    btnAddStock.onclick = (e) => {
      e.preventDefault();
      handleAddStock();
    };
  }

  if (inputManual) {
    inputManual.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddStock();
      }
    };
  }

  // 4. Initial load from local storage cache
  try {
    browser.storage.local
      .get(['stockRegistry', 'latestSnapshot', 'latestIndicators', 'latestWatchlist', 'globalWatchlist'])
      .then((res: Record<string, unknown>) => {
        if (res.stockRegistry) renderStockManager(res.stockRegistry as StockRegistryState);
        if (res.latestSnapshot) renderDrawings(res.latestSnapshot as ChartSnapshot);
        if (res.latestIndicators) renderIndicators(res.latestIndicators as IndicatorsSnapshot);
        if (res.globalWatchlist) {
          renderWatchlist(res.globalWatchlist as WatchlistSnapshot);
        } else if (res.latestWatchlist) {
          renderWatchlist(res.latestWatchlist as WatchlistSnapshot);
        }
      })
      .catch((err) => {
        console.warn('[Stock Chart Extractor] Failed to read cached snapshots:', err);
      });
  } catch (err) {
    console.warn('[Stock Chart Extractor] Storage access error:', err);
  }

  // 5. Staggered sync requests
  sendSyncRequest(btnSync || undefined);
  setTimeout(() => sendSyncRequest(), 400);
  setTimeout(() => sendSyncRequest(), 1200);
}

// Ensure initSidePanel runs reliably
console.log('[Stock Chart Extractor][SidePanel] Loading main.ts script (readyState: ' + document.readyState + ')');
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSidePanel);
} else {
  initSidePanel();
}
window.addEventListener('load', initSidePanel);

// ----------------------------------------------------
// REAL-TIME MESSAGE LISTENER (ALWAYS ACTIVE)
// ----------------------------------------------------
browser.runtime.onMessage.addListener((message: unknown) => {
  const parsed = ExtensionMessageSchema.safeParse(message);
  if (!parsed.success) return;

  if (parsed.data.type === 'STOCK_REGISTRY_UPDATED') {
    renderStockManager(parsed.data.payload as StockRegistryState);
  } else if (parsed.data.type === 'DRAWINGS_SNAPSHOT') {
    renderDrawings(parsed.data.payload as ChartSnapshot);
  } else if (parsed.data.type === 'INDICATORS_SNAPSHOT') {
    renderIndicators(parsed.data.payload as IndicatorsSnapshot);
  } else if (parsed.data.type === 'WATCHLIST_SNAPSHOT') {
    renderWatchlist(parsed.data.payload as WatchlistSnapshot);
  }
});

// ----------------------------------------------------
// STORAGE LISTENER (SYNCS AUTOMATICALLY ACROSS ALL CONTEXTS)
// ----------------------------------------------------
browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  if (changes.stockRegistry?.newValue) {
    renderStockManager(changes.stockRegistry.newValue as StockRegistryState);
  }
  if (changes.latestSnapshot?.newValue) {
    renderDrawings(changes.latestSnapshot.newValue as ChartSnapshot);
  }
  if (changes.latestIndicators?.newValue) {
    renderIndicators(changes.latestIndicators.newValue as IndicatorsSnapshot);
  }
  if (changes.globalWatchlist?.newValue) {
    renderWatchlist(changes.globalWatchlist.newValue as WatchlistSnapshot);
  } else if (changes.latestWatchlist?.newValue) {
    renderWatchlist(changes.latestWatchlist.newValue as WatchlistSnapshot);
  }
});

// ----------------------------------------------------
// DIAGNOSTIC EXPOSURE IN SIDE PANEL WINDOW
// ----------------------------------------------------
(window as any).__STOCK_CHART_EXTRACTOR__ = {
  version: '2.0.0 (SidePanel Multi-Stock)',
  getRegistry: () => currentRegistryState,
  getDrawings: () => currentDrawingsSnapshot,
  getIndicators: () => currentIndicatorsSnapshot,
  getWatchlist: () => currentWatchlistSnapshot,
  sync: () => sendSyncRequest(),
  exportAll: () => ExportManager.executeExport(),
  status: () => {
    const badgeText = document.getElementById('sync-badge')?.textContent || 'INITIALIZING';
    return {
      context: 'SidePanel',
      badge: badgeText,
      stocksCount: Object.keys(currentRegistryState?.items || {}).length,
      activeSymbol: currentRegistryState?.activeSymbol || null,
      drawingsCount: currentDrawingsSnapshot?.drawings?.length ?? 0,
      indicatorsCount: currentIndicatorsSnapshot?.items?.length ?? 0,
      watchlistCount: currentWatchlistSnapshot?.activeItems?.length ?? 0,
      cachedSnapshots: {
        registry: Boolean(currentRegistryState),
        drawings: Boolean(currentDrawingsSnapshot),
        indicators: Boolean(currentIndicatorsSnapshot),
        watchlist: Boolean(currentWatchlistSnapshot),
      },
    };
  },
};
