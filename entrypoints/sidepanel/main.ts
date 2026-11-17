import {
  EXTENSION_SOURCE,
  type ChartSnapshot,
  type IndicatorsSnapshot,
  type WatchlistSnapshot,
} from '@/src/messaging/message.types';
import { ExtensionMessageSchema } from '@/src/messaging/message.schemas';

// Cache state
let currentDrawingsSnapshot: ChartSnapshot | null = null;
let currentIndicatorsSnapshot: IndicatorsSnapshot | null = null;
let currentWatchlistSnapshot: WatchlistSnapshot | null = null;
let updateCounter = 0;

function updateBadge() {
  updateCounter++;
  const badgeEl = document.getElementById('sync-badge');
  if (badgeEl) {
    badgeEl.textContent = `Synced (#${updateCounter})`;
    badgeEl.className = 'badge badge-synced';
  }
}

// ----------------------------------------------------
// TAB 1: DRAWINGS RENDERER
// ----------------------------------------------------
function renderDrawings(snapshot: ChartSnapshot) {
  if (!snapshot) return;
  currentDrawingsSnapshot = snapshot;
  updateBadge();

  const symbolEl = document.getElementById('stat-symbol');
  const countEl = document.getElementById('stat-count');
  const tabCountDrawingsEl = document.getElementById('tab-count-drawings');
  const drawingListEl = document.getElementById('drawing-list');
  const jsonViewerDrawingsEl = document.getElementById('json-viewer-drawings');

  if (symbolEl) symbolEl.textContent = snapshot.chart?.symbol || '---';
  const total = snapshot.drawings?.length ?? 0;
  if (countEl) countEl.textContent = String(total);
  if (tabCountDrawingsEl) tabCountDrawingsEl.textContent = String(total);

  if (drawingListEl) {
    if (!snapshot.drawings || snapshot.drawings.length === 0) {
      drawingListEl.innerHTML = `
        <div style="color: var(--text-secondary); text-align: center; padding: 12px;">
          No drawing objects on chart. Draw on FireAnt to test!
        </div>
      `;
    } else {
      drawingListEl.innerHTML = snapshot.drawings
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
  }

  if (jsonViewerDrawingsEl) {
    jsonViewerDrawingsEl.textContent = JSON.stringify(snapshot, null, 2);
  }
}

// ----------------------------------------------------
// TAB 2: INDICATORS RENDERER
// ----------------------------------------------------
function renderIndicators(snapshot: IndicatorsSnapshot) {
  if (!snapshot) return;
  currentIndicatorsSnapshot = snapshot;
  updateBadge();

  const statIndicatorsCountEl = document.getElementById('stat-indicators-count');
  const tabCountIndicatorsEl = document.getElementById('tab-count-indicators');
  const statIndicatorsPanesEl = document.getElementById('stat-indicators-panes');
  const indicatorsListEl = document.getElementById('indicators-list');
  const jsonViewerIndicatorsEl = document.getElementById('json-viewer-indicators');

  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const total = items.length;
  if (statIndicatorsCountEl) statIndicatorsCountEl.textContent = String(total);
  if (tabCountIndicatorsEl) tabCountIndicatorsEl.textContent = String(total);

  const mainCount = items.filter((i) => i.pane?.type === 'main').length;
  const sepCount = items.filter((i) => i.pane?.type === 'separate').length;
  if (statIndicatorsPanesEl) statIndicatorsPanesEl.textContent = `${mainCount} / ${sepCount}`;

  if (indicatorsListEl) {
    if (items.length === 0) {
      indicatorsListEl.innerHTML = `
        <div style="color: var(--text-secondary); text-align: center; padding: 12px;">
          No technical indicators found on chart.
        </div>
      `;
    } else {
      indicatorsListEl.innerHTML = items
        .map((item) => {
          const paneType = item.pane?.type || 'main';
          const paneBadgeClass = paneType === 'main' ? 'badge-pane-main' : 'badge-pane-sep';
          const inputsBrief = Object.entries(item.inputs || {})
            .map(([k, v]) => `${k}:${v}`)
            .slice(0, 3)
            .join(', ');

          return `
          <div class="list-item">
            <div>
              <div>
                <strong style="color: var(--text-primary); font-size: 12px;">${item.name}</strong>
                <span class="badge ${paneBadgeClass}" style="font-size: 9px; margin-left: 4px;">${paneType.toUpperCase()}</span>
              </div>
              <div style="color: var(--text-secondary); font-size: 10px; margin-top: 2px;">
                ${inputsBrief ? `[${inputsBrief}]` : 'Default parameters'}
              </div>
            </div>
            <div style="text-align: right; font-size: 11px; color: var(--text-secondary);">
              ID: <code style="color: var(--accent-blue);">${item.id}</code>
            </div>
          </div>
        `;
        })
        .join('');
    }
  }

  if (jsonViewerIndicatorsEl) {
    jsonViewerIndicatorsEl.textContent = JSON.stringify(snapshot, null, 2);
  }
}

// ----------------------------------------------------
// TAB 3: WATCHLIST RENDERER
// ----------------------------------------------------
function renderWatchlist(snapshot: WatchlistSnapshot) {
  if (!snapshot) return;
  currentWatchlistSnapshot = snapshot;
  updateBadge();

  const statWatchlistNameEl = document.getElementById('stat-watchlist-name');
  const statWatchlistCountEl = document.getElementById('stat-watchlist-count');
  const tabCountWatchlistEl = document.getElementById('tab-count-watchlist');
  const watchlistItemsListEl = document.getElementById('watchlist-items-list');
  const jsonViewerWatchlistEl = document.getElementById('json-viewer-watchlist');

  const watchlists = Array.isArray(snapshot.watchlists) ? snapshot.watchlists : [];
  const activeGroup = watchlists.find((w) => w.id === snapshot.activeWatchlistId) || watchlists[0];
  const groupName = activeGroup ? activeGroup.name : 'Default';
  if (statWatchlistNameEl) statWatchlistNameEl.textContent = groupName;

  const items = snapshot.activeItems || activeGroup?.items || [];
  if (statWatchlistCountEl) statWatchlistCountEl.textContent = String(items.length);
  if (tabCountWatchlistEl) tabCountWatchlistEl.textContent = String(items.length);

  if (watchlistItemsListEl) {
    if (items.length === 0) {
      watchlistItemsListEl.innerHTML = `
        <div style="color: var(--text-secondary); text-align: center; padding: 12px;">
          No stocks in current watchlist.
        </div>
      `;
    } else {
      watchlistItemsListEl.innerHTML = items
        .map(
          (item) => `
          <div class="list-item">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="color: var(--text-secondary); font-size: 11px; width: 20px;">#${item.position + 1}</span>
              <span class="tag-symbol">${item.symbol}</span>
            </div>
            <div style="font-size: 11px; color: var(--accent-green);">
              VERIFIED
            </div>
          </div>
        `
        )
        .join('');
    }
  }

  if (jsonViewerWatchlistEl) {
    jsonViewerWatchlistEl.textContent = JSON.stringify(snapshot, null, 2);
  }
}

// ----------------------------------------------------
// SYNC REQUEST TRIGGER
// ----------------------------------------------------
async function sendSyncRequest() {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      await browser.tabs.sendMessage(tabs[0].id, {
        source: EXTENSION_SOURCE,
        type: 'REQUEST_SYNC',
        timestamp: Date.now(),
      });
    }
  } catch (err) {
    console.warn('[Stock Chart Extractor] Failed to send sync request to active tab:', err);
  }
}

// ----------------------------------------------------
// CLIPBOARD COPY HELPER
// ----------------------------------------------------
function copyToClipboard(button: HTMLElement, getData: () => unknown) {
  const data = getData();
  if (!data) return;
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
  // 1. Tab Switching with Event Delegation (Bulletproof)
  document.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest('.tab-btn') as HTMLElement;
    if (!target) return;

    const targetTabId = target.getAttribute('data-tab');
    if (!targetTabId) return;

    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

    target.classList.add('active');
    const targetEl = document.getElementById(targetTabId);
    if (targetEl) targetEl.classList.add('active');
  });

  // 2. Button Click Handlers with Event Delegation
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (!target) return;

    if (target.id === 'btn-copy-drawings') {
      copyToClipboard(target, () => currentDrawingsSnapshot);
    } else if (target.id === 'btn-copy-indicators') {
      copyToClipboard(target, () => currentIndicatorsSnapshot);
    } else if (target.id === 'btn-copy-watchlist') {
      copyToClipboard(target, () => currentWatchlistSnapshot);
    } else if (target.id === 'btn-sync') {
      sendSyncRequest();
    }
  });

  // 3. Initial load from local storage cache
  try {
    browser.storage.local
      .get(['latestSnapshot', 'latestIndicators', 'latestWatchlist'])
      .then((res: Record<string, unknown>) => {
        if (res.latestSnapshot) renderDrawings(res.latestSnapshot as ChartSnapshot);
        if (res.latestIndicators) renderIndicators(res.latestIndicators as IndicatorsSnapshot);
        if (res.latestWatchlist) renderWatchlist(res.latestWatchlist as WatchlistSnapshot);
      })
      .catch((err) => {
        console.warn('[Stock Chart Extractor] Failed to read cached snapshots:', err);
      });
  } catch (err) {
    console.warn('[Stock Chart Extractor] Storage access error:', err);
  }

  // 4. Request fresh sync immediately and after a short tick
  sendSyncRequest();
  setTimeout(sendSyncRequest, 500);
  setTimeout(sendSyncRequest, 1500);
}

// Run immediately if DOM is ready, otherwise listen for DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSidePanel);
} else {
  initSidePanel();
}

// ----------------------------------------------------
// REAL-TIME MESSAGE LISTENER (ALWAYS ACTIVE)
// ----------------------------------------------------
browser.runtime.onMessage.addListener((message: unknown) => {
  const parsed = ExtensionMessageSchema.safeParse(message);
  if (!parsed.success) return;

  if (parsed.data.type === 'DRAWINGS_SNAPSHOT') {
    renderDrawings(parsed.data.payload as ChartSnapshot);
  } else if (parsed.data.type === 'INDICATORS_SNAPSHOT') {
    renderIndicators(parsed.data.payload as IndicatorsSnapshot);
  } else if (parsed.data.type === 'WATCHLIST_SNAPSHOT') {
    renderWatchlist(parsed.data.payload as WatchlistSnapshot);
  }
});
