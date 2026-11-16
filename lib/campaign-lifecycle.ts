import { supabase } from "@/lib/supabase";

export type CampaignStatus = "active" | "paused" | "closed";

export type CampaignStatusTransition = {
  success: true;
  status: CampaignStatus;
  available_budget: number;
};

type TransitionOutcome = {
  data: CampaignStatusTransition | null;
  error: Error | null;
};

export async function transitionCampaignStatus(
  campaignId: string,
  targetStatus: CampaignStatus,
): Promise<TransitionOutcome> {
  if (!supabase) {
    return {
      data: null,
      error: new Error("AdBridge database connection is not available."),
    };
  }

  const { data, error } = await supabase.rpc("transition_campaign_status", {
    p_campaign_id: campaignId,
    p_target_status: targetStatus,
  });

  if (error) return { data: null, error };

  const result = data as Partial<CampaignStatusTransition> | null;
  if (
    !result ||
    result.success !== true ||
    !["active", "paused", "closed"].includes(String(result.status))
  ) {
    return {
      data: null,
      error: new Error("The campaign status change was not confirmed by AdBridge."),
    };
  }

  return {
    data: result as CampaignStatusTransition,
    error: null,
  };
}
