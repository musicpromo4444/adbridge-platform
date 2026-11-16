import { supabase } from "@/lib/supabase";

export type CampaignAnalytics = {
  campaignCount: number;
  platformReportedViews: number;
  trackedClicks: number;
  approvedConversions: number;
  releasedEarnings: number;
};

type AnalyticsOutcome = {
  data: CampaignAnalytics | null;
  error: Error | null;
};

function nonNegativeInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function nonNegativeAmount(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function loadMyCampaignAnalytics(): Promise<AnalyticsOutcome> {
  if (!supabase) {
    return {
      data: null,
      error: new Error("AdBridge database connection is not configured."),
    };
  }

  const { data, error } = await supabase.rpc("get_my_campaign_analytics");
  if (error) {
    return {
      data: null,
      error: new Error("Campaign analytics could not be loaded. Please retry after the database update is deployed."),
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    return {
      data: null,
      error: new Error("AdBridge returned an incomplete analytics response."),
    };
  }

  const values = row as Record<string, unknown>;
  const campaignCount = nonNegativeInteger(values.campaign_count);
  const platformReportedViews = nonNegativeInteger(values.platform_reported_views);
  const trackedClicks = nonNegativeInteger(values.tracked_clicks);
  const approvedConversions = nonNegativeInteger(values.approved_conversions);
  const releasedEarnings = nonNegativeAmount(values.released_earnings);

  if (
    campaignCount === null ||
    platformReportedViews === null ||
    trackedClicks === null ||
    approvedConversions === null ||
    releasedEarnings === null
  ) {
    return {
      data: null,
      error: new Error("AdBridge returned invalid analytics values."),
    };
  }

  return {
    data: {
      campaignCount,
      platformReportedViews,
      trackedClicks,
      approvedConversions,
      releasedEarnings,
    },
    error: null,
  };
}
