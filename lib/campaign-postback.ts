import { supabase } from "@/lib/supabase";

export type CampaignPostbackStatus = {
  configured: boolean;
  rotatedAt: string | null;
  lastUsedAt: string | null;
};

export type RotatedCampaignPostbackSecret = {
  secret: string;
  rotatedAt: string | null;
};

type Outcome<T> = {
  data: T | null;
  error: Error | null;
};

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function loadCampaignPostbackStatus(campaignId: string): Promise<Outcome<CampaignPostbackStatus>> {
  if (!supabase) {
    return { data: null, error: new Error("AdBridge database connection is not available.") };
  }

  const { data, error } = await supabase.functions.invoke("manage-campaign-postback-secret", {
    body: { campaign_id: campaignId, action: "status" },
  });
  if (error) return { data: null, error: new Error(error.message || "Postback status could not be loaded.") };

  const result = recordOf(data);
  if (result?.success !== true || typeof result.configured !== "boolean") {
    return { data: null, error: new Error("AdBridge returned an invalid postback status.") };
  }

  return {
    data: {
      configured: result.configured,
      rotatedAt: typeof result.rotated_at === "string" ? result.rotated_at : null,
      lastUsedAt: typeof result.last_used_at === "string" ? result.last_used_at : null,
    },
    error: null,
  };
}

export async function rotateCampaignPostbackSecret(campaignId: string): Promise<Outcome<RotatedCampaignPostbackSecret>> {
  if (!supabase) {
    return { data: null, error: new Error("AdBridge database connection is not available.") };
  }

  const { data, error } = await supabase.functions.invoke("manage-campaign-postback-secret", {
    body: { campaign_id: campaignId, action: "rotate" },
  });
  if (error) return { data: null, error: new Error(error.message || "Postback secret could not be rotated.") };

  const result = recordOf(data);
  if (result?.success !== true || typeof result.secret !== "string" || !result.secret.startsWith("abp_")) {
    return { data: null, error: new Error("AdBridge did not return a valid one-time campaign secret.") };
  }

  return {
    data: {
      secret: result.secret,
      rotatedAt: typeof result.rotated_at === "string" ? result.rotated_at : null,
    },
    error: null,
  };
}
