import { StorageRepository } from '@/src/storage/storage-repository';
import type { RawExportSourceData } from './export.types';

/**
 * Collects all persisted data groups from storage repository without touching live FireAnt runtime.
 */
export async function collectExportSourceData(): Promise<RawExportSourceData> {
  const { stockRegistry, chartSnapshots, globalWatchlist } = await StorageRepository.getAllDataSnapshot();

  let extensionVersion = '0.1.0';
  try {
    if (typeof browser !== 'undefined' && browser.runtime?.getManifest) {
      extensionVersion = browser.runtime.getManifest().version || extensionVersion;
    }
  } catch {
    // Keep default version if unavailable
  }

  const storageKeysCount = 1 + Object.keys(chartSnapshots).length + (globalWatchlist ? 1 : 0);

  return {
    stockRegistry,
    chartSnapshots,
    globalWatchlist,
    storageKeysCount,
    extensionVersion,
  };
}
