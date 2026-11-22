import { supabase } from "@/lib/supabase";
import { parseAdminCampaignLifecycleOverview } from "./admin-campaign-lifecycle.mjs";
import type {
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
