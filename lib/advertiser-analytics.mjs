const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`AdBridge returned an invalid ${field} value.`);
  }
  return value;
}

function nullableText(value, field) {
  if (value === null || value === undefined) return null;
  return requiredText(value, field);
}

function safeCount(value, field) {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`AdBridge returned an invalid ${field} count.`);
  }
  return parsed;
}

function optionalCount(value, field) {
  return value === null || value === undefined ? null : safeCount(value, field);
}

function safeMoney(value, field) {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`AdBridge returned an invalid ${field} amount.`);
  }
  return parsed;
}

function optionalMoney(value, field) {
  return value === null || value === undefined ? null : safeMoney(value, field);
}

function metricTimestamp(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("AdBridge returned an invalid metric check timestamp.");
  }
  return value;
}

export function parseAdvertiserCampaignAnalyticsRows(value) {
  if (!Array.isArray(value)) {
    throw new Error("AdBridge returned an invalid campaign analytics response.");
  }

  return value.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("AdBridge returned an invalid campaign analytics row.");
    }

    const campaignId = requiredText(row.campaign_id, "campaign id");
    if (!UUID_PATTERN.test(campaignId)) {
      throw new Error("AdBridge returned an invalid campaign id.");
    }

    return {
      campaign_id: campaignId,
      campaign_name: requiredText(row.campaign_name, "campaign name"),
      goal: requiredText(row.goal, "campaign goal"),
      platform: nullableText(row.platform, "campaign platform"),
      campaign_status: requiredText(row.campaign_status, "campaign status"),
      payment_method: nullableText(row.payment_method, "payment method"),
      payment_rate: optionalMoney(row.payment_rate, "payment rate"),
      max_budget: optionalMoney(row.max_budget, "maximum budget"),
      desired_results: optionalCount(row.desired_results, "desired results"),
      verified_views: safeCount(row.verified_views, "verified views"),
      verified_submissions: safeCount(row.verified_submissions, "verified submissions"),
      tracked_submissions: safeCount(row.tracked_submissions, "tracked submissions"),
      latest_metric_check_at: metricTimestamp(row.latest_metric_check_at),
      stale_metric_submissions: safeCount(row.stale_metric_submissions, "stale metric submissions"),
      tracking_clicks: safeCount(row.tracking_clicks, "tracking clicks"),
      unique_tracking_clicks: safeCount(row.unique_tracking_clicks, "unique tracking clicks"),
      approved_conversions: safeCount(row.approved_conversions, "approved conversions"),
      confirmed_funding: safeMoney(row.confirmed_funding, "confirmed funding"),
    };
  });
}
