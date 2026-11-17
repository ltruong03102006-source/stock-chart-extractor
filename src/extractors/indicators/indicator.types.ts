export interface IndicatorItem {
  id: string;
  name: string;
  type: string;
  shortName: string;
  inputs: Record<string, unknown>;
  style: Record<string, unknown>;
  pane: {
    type: 'main' | 'separate';
  };
  values: {
    latest: number | Record<string, number> | null;
  };
  metadata: {
    source: 'fireant';
    extractionStatus: 'VERIFIED' | 'PARTIALLY VERIFIED' | 'NOT AVAILABLE';
  };
}

export interface IndicatorsSnapshot {
  totalIndicators: number;
  items: IndicatorItem[];
  timestamp: number;
}
