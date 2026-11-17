import {
  ExportAllDataEnvelopeSchema,
  type ExportAllDataEnvelope,
} from './export.types';

export interface ValidationResult {
  isValid: boolean;
  envelope?: ExportAllDataEnvelope;
  errors: string[];
  warnings: string[];
}

/**
 * Validates the serialized ExportAllDataEnvelope against the canonical Zod schema
 * and verifies referential integrity between the Stock Registry and Chart Snapshots.
 */
export function validateExportEnvelope(candidate: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Zod Schema Validation
  const parsed = ExportAllDataEnvelopeSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`[Schema] ${issue.path.join('.')}: ${issue.message}`);
    }
    return {
      isValid: false,
      errors,
      warnings,
    };
  }

  const envelope = parsed.data;

  // 2. Referential Integrity Verification
  // Check that every chartContext referenced in stockRegistry exists in chartSnapshots
  for (const stock of envelope.stockRegistry) {
    for (const ctx of stock.chartContexts) {
      if (!ctx.compositeKey) {
        errors.push(`[Referential] Stock '${stock.symbol}' has chartContext with empty compositeKey.`);
        continue;
      }
      if (!envelope.chartSnapshots[ctx.compositeKey]) {
        warnings.push(
          `[Referential Warning] Stock '${stock.symbol}' references chart snapshot '${ctx.compositeKey}' which has not yet been synced or stored.`
        );
      }
    }
  }

  // 3. Metadata sanity checks
  if (envelope.metadata.stats.totalStocks !== envelope.stockRegistry.length) {
    warnings.push(
      `[Metadata Warning] stats.totalStocks (${envelope.metadata.stats.totalStocks}) differs from stockRegistry.length (${envelope.stockRegistry.length}).`
    );
  }

  return {
    isValid: errors.length === 0,
    envelope: errors.length === 0 ? envelope : undefined,
    errors,
    warnings,
  };
}
