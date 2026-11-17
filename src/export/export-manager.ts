import { collectExportSourceData } from './export-collector';
import { serializeExportData, formatExportFilename } from './export-serializer';
import { validateExportEnvelope } from './export-validator';
import { triggerFileDownload } from './export-downloader';
import type { ExportAllDataEnvelope } from './export.types';

export type ExportState = 'idle' | 'exporting' | 'success' | 'error';

export interface ExportManagerResult {
  success: boolean;
  filename?: string;
  envelope?: ExportAllDataEnvelope;
  stats?: {
    totalStocks: number;
    totalSnapshots: number;
    totalDrawings: number;
    totalIndicators: number;
    watchlistSymbolsCount: number;
  };
  error?: string;
  warnings?: string[];
  jsonString?: string;
}

export class ExportManager {
  private static currentState: ExportState = 'idle';

  public static getState(): ExportState {
    return this.currentState;
  }

  /**
   * Executes the full export pipeline:
   * 1. Collect from Storage
   * 2. Serialize to Envelope v1 & sanitize
   * 3. Validate against Zod schema & referential integrity
   * 4. Trigger download
   */
  public static async executeExport(customDate?: Date): Promise<ExportManagerResult> {
    if (this.currentState === 'exporting') {
      return {
        success: false,
        error: 'Another export operation is already in progress.',
      };
    }

    this.currentState = 'exporting';

    try {
      // Step 1: Collect
      const rawData = await collectExportSourceData();

      // Step 2: Serialize
      const envelope = serializeExportData(rawData);

      // Step 3: Validate
      const validation = validateExportEnvelope(envelope);
      if (!validation.isValid) {
        this.currentState = 'error';
        return {
          success: false,
          error: `Export schema validation failed:\n${validation.errors.join('\n')}`,
          warnings: validation.warnings,
        };
      }

      // Step 4: Stringify & Download
      const jsonString = JSON.stringify(envelope, null, 2);
      const filename = formatExportFilename(customDate);

      const downloadSuccess = triggerFileDownload(jsonString, filename);
      if (!downloadSuccess) {
        this.currentState = 'error';
        return {
          success: false,
          error: 'Browser failed to trigger file download.',
          warnings: validation.warnings,
        };
      }

      this.currentState = 'success';
      return {
        success: true,
        filename,
        envelope,
        stats: envelope.metadata.stats,
        warnings: validation.warnings,
        jsonString,
      };
    } catch (err) {
      this.currentState = 'error';
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Unexpected export error: ${msg}`,
      };
    } finally {
      // Revert to idle after delay
      setTimeout(() => {
        this.currentState = 'idle';
      }, 3000);
    }
  }
}
