export const QUALITY_REPORT_SCHEMA_VERSION = 1;

export interface RecordFlow {
  sourceRecordsSeen: number;
  eligibleRecords: number;
  emittedRecords: number;
  filteredRecords: number;
  rejectedRecords: number;
}

export interface QualityReport {
  schemaVersion: typeof QUALITY_REPORT_SCHEMA_VERSION;
  source: {
    url: string;
    snapshotDate: string;
    digest: `sha256:${string}`;
    extractorRevision: string;
  };
  recordFlow: RecordFlow;
  artifact: {
    kind: "stress" | "morphology";
    bytes: number;
    digest: `sha256:${string}`;
  };
}

export function isBalancedRecordFlow(flow: RecordFlow): boolean {
  return (
    flow.eligibleRecords ===
      flow.emittedRecords + flow.filteredRecords + flow.rejectedRecords &&
    flow.sourceRecordsSeen >= flow.eligibleRecords
  );
}
