import { supabase } from "@/lib/supabase";
import {
  parseCreatorEarningsSummaryRows,
  type CreatorEarningsSummary,
} from "./creator-earnings.mjs";

export { parseCreatorEarningsSummaryRows };
export type { CreatorEarningsSummary };

type CreatorEarningsOutcome = {
  data: CreatorEarningsSummary | null;
  error: Error | null;
};

export async function loadMyCreatorEarningsSummary(): Promise<CreatorEarningsOutcome> {
  if (!supabase) {
    return {
      data: null,
      error: new Error("AdBridge database connection is not available."),
    };
  }

  const { data, error } = await supabase.rpc("get_my_creator_earnings_summary_v2");
  if (error) {
    return {
      data: null,
      error: new Error(
        "Creator earnings could not be loaded. Please retry after the database migration is deployed.",
      ),
    };
  }

  return parseCreatorEarningsSummaryRows(data);
}
