import { supabase } from "@/lib/supabase";
import { parseAdminMetricReviewHistory } from "./admin-metric-review-history.mjs";
import type {
  AdminMetricReviewHistoryCursor,
  AdminMetricReviewHistoryPage,
} from "./admin-metric-review-history.mjs";

const PAGE_SIZE = 25;

export async function loadAdminMetricReviewHistory(
  cursor: AdminMetricReviewHistoryCursor | null = null,
): Promise<AdminMetricReviewHistoryPage> {
  if (!supabase) {
    throw new Error("AdBridge database connection is not ready.");
  }

  const { data, error } = await supabase.rpc("get_admin_metric_review_history", {
    p_before_reviewed_at: cursor?.reviewedAt ?? null,
    p_before_id: cursor?.id ?? null,
    p_page_size: PAGE_SIZE,
  });

  if (error) {
    throw new Error("Manual CPM review history could not be loaded. Refresh and try again.");
  }

  return parseAdminMetricReviewHistory(data);
}
