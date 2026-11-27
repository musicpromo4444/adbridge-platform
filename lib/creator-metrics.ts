import type { SupabaseClient } from "@supabase/supabase-js";

export type CreatorMetricPayoutResult = {
  paid?: boolean;
  duplicate?: boolean;
  reason?: string;
  amount?: number;
  payment_id?: string;
} | null;

export type CreatorMetricRefreshResult = {
  success: true;
  snapshot_id: string;
  platform: string;
  video_id: string;
  provider_views: number;
  views: number;
  target: number;
  reached: boolean;
  stale_snapshot: boolean;
  checked_at: string;
  payout: CreatorMetricPayoutResult;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function refreshCreatorSubmissionMetrics(
  client: SupabaseClient,
  submissionId: string,
): Promise<CreatorMetricRefreshResult> {
  if (!UUID_PATTERN.test(submissionId)) {
    throw new Error("A valid submission is required before refreshing metrics.");
  }

  const { data, error } = await client.functions.invoke<CreatorMetricRefreshResult>(
    "track-video-metrics",
    { body: { submission_id: submissionId } },
  );

  if (error) {
    throw new Error(error.message || "The platform metric check could not be completed.");
  }

  if (
    !data ||
    data.success !== true ||
    !Number.isSafeInteger(data.views) ||
    data.views < 0 ||
    !Number.isSafeInteger(data.target) ||
    data.target <= 0 ||
    typeof data.reached !== "boolean"
  ) {
    throw new Error("AdBridge returned an incomplete metric result. No success was recorded.");
  }

  return data;
}
