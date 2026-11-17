import {
  EXTENSION_SOURCE,
  type ChartSnapshot,
  type IndicatorsSnapshot,
  type WatchlistSnapshot,
} from '@/src/messaging/message.types';
import { ExtensionMessageSchema } from '@/src/messaging/message.schemas';

// Common Elements
const badgeEl = document.getElementById('sync-badge') as HTMLElement;
const btnSync = document.getElementById('btn-sync') as HTMLButtonElement;

// Tab 1: Drawings Elements
const tabCountDrawingsEl = document.getElementById('tab-count-drawings') as HTMLElement;
const symbolEl = document.getElementById('stat-symbol') as HTMLElement;
const countEl = document.getElementById('stat-count') as HTMLElement;
const drawingListEl = document.getElementById('drawing-list') as HTMLElement;
const jsonViewerDrawingsEl = document.getElementById('json-viewer-drawings') as HTMLElement;
const btnCopyDrawings = document.getElementById('btn-copy-drawings') as HTMLButtonElement;

// Tab 2: Indicators Elements
const tabCountIndicatorsEl = document.getElementById('tab-count-indicators') as HTMLElement;
const statIndicatorsCountEl = document.getElementById('stat-indicators-count') as HTMLElement;
const statIndicatorsPanesEl = document.getElementById('stat-indicators-panes') as HTMLElement;
const indicatorsListEl = document.getElementById('indicators-list') as HTMLElement;
const jsonViewerIndicatorsEl = document.getElementById('json-viewer-indicators') as HTMLElement;
const btnCopyIndicators = document.getElementById('btn-copy-indicators') as HTMLButtonElement;

// Tab 3: Watchlist Elements
const tabCountWatchlistEl = document.getElementById('tab-count-watchlist') as HTMLElement;
const statWatchlistNameEl = document.getElementById('stat-watchlist-name') as HTMLElement;
const statWatchlistCountEl = document.getElementById('stat-watchlist-count') as HTMLElement;
const watchlistItemsListEl = document.getElementById('watchlist-items-list') as HTMLElement;
const jsonViewerWatchlistEl = document.getElementById('json-viewer-watchlist') as HTMLElement;
const btnCopyWatchlist = document.getElementById('btn-copy-watchlist') as HTMLButtonElement;

// Cache state
let currentDrawingsSnapshot: ChartSnapshot | null = null;
let currentIndicatorsSnapshot: IndicatorsSnapshot | null = null;
let currentWatchlistSnapshot: WatchlistSnapshot | null = null;
let updateCounter = 0;

function updateBadge() {
  updateCounter++;
  badgeEl.textContent = `Synced (#${updateCounter})`;
  badgeEl.className = 'badge badge-synced';
}

// ----------------------------------------------------
// TAB 1: DRAWINGS RENDERER
// ----------------------------------------------------
function renderDrawings(snapshot: ChartSnapshot) {
  currentDrawingsSnapshot = snapshot;
  updateBadge();

  symbolEl.textContent = snapshot.chart?.symbol || '---';
  const total = snapshot.drawings?.length ?? 0;
  countEl.textContent = String(total);
  if (tabCountDrawingsEl) tabCountDrawingsEl.textContent = String(total);

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

  jsonViewerDrawingsEl.textContent = JSON.stringify(snapshot, null, 2);
}

// ----------------------------------------------------
// TAB 2: INDICATORS RENDERER
// ----------------------------------------------------
function renderIndicators(snapshot: IndicatorsSnapshot) {
  currentIndicatorsSnapshot = snapshot;
  updateBadge();

  const total = snapshot.items?.length ?? 0;
  statIndicatorsCountEl.textContent = String(total);
  if (tabCountIndicatorsEl) tabCountIndicatorsEl.textContent = String(total);

  const mainCount = snapshot.items.filter((i) => i.pane.type === 'main').length;
  const sepCount = snapshot.items.filter((i) => i.pane.type === 'separate').length;
  statIndicatorsPanesEl.textContent = `${mainCount} / ${sepCount}`;

  if (!snapshot.items || snapshot.items.length === 0) {
    indicatorsListEl.innerHTML = `
      <div style="color: var(--text-secondary); text-align: center; padding: 12px;">
        No technical indicators found on chart.
      </div>
    `;
  } else {
    indicatorsListEl.innerHTML = snapshot.items
      .map((item) => {
        const paneBadgeClass = item.pane.type === 'main' ? 'badge-pane-main' : 'badge-pane-sep';
        const inputsBrief = Object.entries(item.inputs || {})
          .map(([k, v]) => `${k}:${v}`)
          .slice(0, 3)
          .join(', ');

        return `
        <div class="list-item">
          <div>
            <div>
              <strong style="color: var(--text-primary); font-size: 12px;">${item.name}</strong>
              <span class="badge ${paneBadgeClass}" style="font-size: 9px; margin-left: 4px;">${item.pane.type.toUpperCase()}</span>
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

  jsonViewerIndicatorsEl.textContent = JSON.stringify(snapshot, null, 2);
}

// ----------------------------------------------------
// TAB 3: WATCHLIST RENDERER
// ----------------------------------------------------
function renderWatchlist(snapshot: WatchlistSnapshot) {
  currentWatchlistSnapshot = snapshot;
  updateBadge();

  const activeGroup = snapshot.watchlists?.find((w) => w.id === snapshot.activeWatchlistId) || snapshot.watchlists?.[0];
  const groupName = activeGroup ? activeGroup.name : 'Default';
  statWatchlistNameEl.textContent = groupName;

  const items = snapshot.activeItems || activeGroup?.items || [];
  statWatchlistCountEl.textContent = String(items.length);
  if (tabCountWatchlistEl) tabCountWatchlistEl.textContent = String(items.length);

  if (!items || items.length === 0) {
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

  jsonViewerWatchlistEl.textContent = JSON.stringify(snapshot, null, 2);
}

// ----------------------------------------------------
// TAB SWITCHING LOGIC
// ----------------------------------------------------
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetTabId = btn.getAttribute('data-tab');
    if (!targetTabId) return;

    tabButtons.forEach((b) => b.classList.remove('active'));
    tabContents.forEach((c) => c.classList.remove('active'));

    btn.classList.add('active');
    document.getElementById(targetTabId)?.classList.add('active');
  });
});

// ----------------------------------------------------
// COPY ACTIONS
// ----------------------------------------------------
function setupCopyButton(btn: HTMLButtonElement | null, getData: () => unknown) {
  btn?.addEventListener('click', () => {
    const data = getData();
    if (data) {
      navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 1500);
      });
    }
  });
}

setupCopyButton(btnCopyDrawings, () => currentDrawingsSnapshot);
setupCopyButton(btnCopyIndicators, () => currentIndicatorsSnapshot);
setupCopyButton(btnCopyWatchlist, () => currentWatchlistSnapshot);

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
    console.warn('Failed to send sync request to active tab:', err);
  }
}

btnSync?.addEventListener('click', sendSyncRequest);

// ----------------------------------------------------
// INITIAL LOAD FROM CACHE STORAGE
// ----------------------------------------------------
browser.storage.local
  .get(['latestSnapshot', 'latestIndicators', 'latestWatchlist'])
  .then((res: Record<string, unknown>) => {
    if (res.latestSnapshot) renderDrawings(res.latestSnapshot as ChartSnapshot);
    if (res.latestIndicators) renderIndicators(res.latestIndicators as IndicatorsSnapshot);
    if (res.latestWatchlist) renderWatchlist(res.latestWatchlist as WatchlistSnapshot);
  });

// ----------------------------------------------------
// REAL-TIME MESSAGE LISTENER
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

// Auto-request sync on side panel mount
setTimeout(sendSyncRequest, 300);
