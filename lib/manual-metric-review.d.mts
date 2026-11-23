import type { SupabaseClient } from "@supabase/supabase-js";

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

export declare function submitManualMetricEvidence(
  client: SupabaseClient,
  input: ManualMetricEvidenceInput
): Promise<ManualMetricEvidenceResult>;

export declare function reviewManualMetricEvidence(
  client: SupabaseClient,
  input: {
    metricVerificationId: string;
    decision: ManualMetricReviewDecision;
    reviewNote?: string | null;
  }
): Promise<ManualMetricReviewResult>;
