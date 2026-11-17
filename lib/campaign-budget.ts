import { supabase } from "@/lib/supabase";
import {
  parseCampaignBudgetSummaryRows,
  type CampaignBudgetSummary,
} from "./campaign-budget.mjs";

export { parseCampaignBudgetSummaryRows };
export type { CampaignBudgetSummary };

type CampaignBudgetOutcome = {
  data: CampaignBudgetSummary[] | null;
  error: Error | null;
};

export async function loadMyCampaignBudgetSummary(): Promise<CampaignBudgetOutcome> {
  if (!supabase) {
    return {
      data: null,
      error: new Error("AdBridge database connection is not available."),
    };
  }

  const { data, error } = await supabase.rpc("get_my_campaign_budget_summary");
  if (error) {
    return {
      data: null,
      error: new Error(
        "Campaign budget balances could not be loaded. Please retry after the database migration is deployed.",
      ),
    };
  }

  return parseCampaignBudgetSummaryRows(data);
}
