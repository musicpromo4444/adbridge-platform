import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseManualMetricEvidenceResult,
  parseManualMetricReviewResult,
  type ManualMetricEvidenceInput,
  type ManualMetricReviewResult,
  type ManualMetricReviewDecision,
} from "./manual-metric-review.mjs";

export async function submitManualMetricEvidence(
  client: SupabaseClient,
  input: ManualMetricEvidenceInput
) {
  const { data, error } = await client.rpc("submit_manual_metric_evidence", {
    p_submission_id: input.submissionId,
    p_claimed_metric: input.claimedMetric,
    p_evidence_url: input.evidenceUrl,
    p_note: input.note ?? null,
  });
  if (error) throw new Error(error.message || "Manual metric evidence could not be saved.");
  return parseManualMetricEvidenceResult(data);
}

export async function reviewManualMetricEvidence(
  client: SupabaseClient,
  input: {
    metricVerificationId: string;
    decision: ManualMetricReviewDecision;
    reviewNote?: string | null;
  }
): Promise<ManualMetricReviewResult> {
  const { data, error } = await client.functions.invoke("review-manual-metric", {
    body: {
      metric_verification_id: input.metricVerificationId,
      decision: input.decision,
      review_note: input.reviewNote ?? null,
    },
  });
  if (error) throw new Error(error.message || "Manual metric review could not be completed.");
  return parseManualMetricReviewResult(data);
}
