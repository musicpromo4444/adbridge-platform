import { supabase } from "@/lib/supabase";
import { parseCreatorMetricReviewHistory } from "./creator-metric-review-history.mjs";
import type {
  CreatorMetricReviewHistoryCursor,
  CreatorMetricReviewHistoryPage,
} from "./creator-metric-review-history.mjs";

const PAGE_SIZE = 10;

export async function loadCreatorMetricReviewHistory(
  submissionId: string,
  cursor: CreatorMetricReviewHistoryCursor | null = null,
): Promise<CreatorMetricReviewHistoryPage> {
  if (!supabase) {
    throw new Error("AdBridge database connection is not ready.");
  }
  if (!submissionId.trim()) {
    throw new Error("A campaign submission is required.");
  }

  const { data, error } = await supabase.rpc("get_creator_metric_review_history", {
    p_submission_id: submissionId,
    p_before_created_at: cursor?.createdAt ?? null,
    p_before_id: cursor?.id ?? null,
    p_page_size: PAGE_SIZE,
  });

  if (error) {
    throw new Error("Your manual CPM evidence history could not be loaded. Refresh and try again.");
  }

  return parseCreatorMetricReviewHistory(data);
}
