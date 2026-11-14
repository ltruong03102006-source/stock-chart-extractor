import { EXTENSION_SOURCE, type ChartSnapshot } from '@/src/messaging/message.types';
import { ExtensionMessageSchema } from '@/src/messaging/message.schemas';

const badgeEl = document.getElementById('sync-badge') as HTMLElement;
const symbolEl = document.getElementById('stat-symbol') as HTMLElement;
const countEl = document.getElementById('stat-count') as HTMLElement;
const drawingListEl = document.getElementById('drawing-list') as HTMLElement;
const jsonViewerEl = document.getElementById('json-viewer') as HTMLElement;
const btnCopy = document.getElementById('btn-copy') as HTMLButtonElement;
const btnSync = document.getElementById('btn-sync') as HTMLButtonElement;

let currentSnapshot: ChartSnapshot | null = null;
let updateCounter = 0;

function renderSnapshot(snapshot: ChartSnapshot) {
  currentSnapshot = snapshot;
  updateCounter++;

  // Update Status Badge with update count
  if (snapshot.sync?.status === 'synced') {
    badgeEl.textContent = `Synced (#${updateCounter})`;
    badgeEl.className = 'badge badge-synced';
  } else {
    badgeEl.textContent = snapshot.sync?.status || 'Syncing';
    badgeEl.className = 'badge badge-syncing';
  }

  // Update Stats
  symbolEl.textContent = snapshot.chart?.symbol || '---';
  countEl.textContent = String(snapshot.drawings?.length ?? 0);

  // Update Drawing List
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
        <div class="drawing-item">
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

  // Update JSON Viewer
  jsonViewerEl.textContent = JSON.stringify(snapshot, null, 2);
}

// 1. Initial Load from storage
browser.storage.local.get('latestSnapshot').then((res) => {
  if (res.latestSnapshot) {
    renderSnapshot(res.latestSnapshot as ChartSnapshot);
  }
});

// 2. Real-time listener for runtime messages
browser.runtime.onMessage.addListener((message: unknown) => {
  const parsed = ExtensionMessageSchema.safeParse(message);
  if (parsed.success && parsed.data.type === 'DRAWINGS_SNAPSHOT') {
    renderSnapshot(parsed.data.payload as ChartSnapshot);
  }
});

// 3. Copy button
btnCopy?.addEventListener('click', () => {
  if (currentSnapshot) {
    navigator.clipboard.writeText(JSON.stringify(currentSnapshot, null, 2)).then(() => {
      const originalText = btnCopy.textContent;
      btnCopy.textContent = 'Copied!';
      setTimeout(() => {
        btnCopy.textContent = originalText;
      }, 1500);
    });
  }
});

// 4. Request sync function
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

// Auto-request sync on side panel mount
setTimeout(sendSyncRequest, 300);
