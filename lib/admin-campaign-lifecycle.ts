import { supabase } from "@/lib/supabase";
import {
  parseAdminCampaignBudgetReconciliation,
  parseAdminCampaignLifecycleOverview
} from "./admin-campaign-lifecycle.mjs";
import type {
  AdminCampaignBudgetReconciliation,
  AdminCampaignLifecycleOverview,
  CampaignLifecycleFilter
} from "./admin-campaign-lifecycle.mjs";

export async function loadAdminCampaignLifecycleOverview(
  status: CampaignLifecycleFilter
): Promise<AdminCampaignLifecycleOverview> {
  if (!supabase) throw new Error("AdBridge database is not configured.");

  const { data, error } = await supabase.rpc("admin_campaign_lifecycle_overview", {
    p_status: status,
    p_limit: 200
  });

  if (error) throw new Error(error.message || "Campaign lifecycle could not be loaded.");
  return parseAdminCampaignLifecycleOverview(data);
}


export async function reconcileAdminCampaignBudget(
  campaignId: string
): Promise<AdminCampaignBudgetReconciliation> {
  if (!supabase) throw new Error("AdBridge database is not configured.");
  if (!campaignId || campaignId.trim().length === 0) {
    throw new Error("A campaign must be selected for reconciliation.");
  }

  const { data, error } = await supabase.rpc("admin_reconcile_campaign_budget", {
    p_campaign_id: campaignId
  });

  if (error) throw new Error(error.message || "Campaign budget reconciliation failed.");
  return parseAdminCampaignBudgetReconciliation(data);
}
