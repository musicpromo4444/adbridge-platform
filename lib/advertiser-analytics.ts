import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseAdvertiserCampaignAnalyticsRows,
  type AdvertiserCampaignAnalyticsRow,
} from "./advertiser-analytics.mjs";

export type { AdvertiserCampaignAnalyticsRow };

export async function loadAdvertiserCampaignAnalytics(
  client: SupabaseClient,
): Promise<AdvertiserCampaignAnalyticsRow[]> {
  const { data, error } = await client.rpc("get_my_advertiser_campaign_analytics");

  if (error) {
    throw new Error("Campaign analytics could not be loaded. Please retry.");
  }

  return parseAdvertiserCampaignAnalyticsRows(data);
}
