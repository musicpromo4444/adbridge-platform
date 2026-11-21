export type AdvertiserCampaignAnalyticsRow = {
  campaign_id: string;
  campaign_name: string;
  goal: string;
  platform: string | null;
  campaign_status: string;
  payment_method: string | null;
  payment_rate: number | null;
  max_budget: number | null;
  desired_results: number | null;
  verified_views: number;
  verified_submissions: number;
  tracked_submissions: number;
  latest_metric_check_at: string | null;
  stale_metric_submissions: number;
  tracking_clicks: number;
  unique_tracking_clicks: number;
  approved_conversions: number;
  confirmed_funding: number;
};

export function parseAdvertiserCampaignAnalyticsRows(
  value: unknown,
): AdvertiserCampaignAnalyticsRow[];
