export type ManualMetricEvidenceInput = {
  submissionId: string;
  claimedMetric: number;
  evidenceUrl: string;
  note?: string | null;
};

export type ManualMetricEvidenceResult = {
  id: string;
  status: "pending";
  duplicate: boolean;
};

export type ManualMetricReviewDecision = "approved" | "rejected";

export type ManualMetricReviewResult = {
  decision: ManualMetricReviewDecision;
  duplicate: boolean;
  payout: {
    paid: boolean;
    duplicate: boolean;
    reason: string | null;
    amount: number | null;
  } | null;
};

export declare function normalizeManualMetricInput(
  claimedMetric: string | number,
  evidenceUrl: string
): { claimedMetric: number; evidenceUrl: string };

export declare function parseManualMetricEvidenceResult(value: unknown): ManualMetricEvidenceResult;
export declare function parseManualMetricReviewResult(value: unknown): ManualMetricReviewResult;
