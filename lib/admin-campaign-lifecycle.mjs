const campaignStatuses = new Set([
  "draft", "funded", "active", "paused", "completed", "closed", "cancelled"
]);
const completionReasons = new Set(["budget_exhausted", "target_reached", "manual"]);

function objectValue(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(field + " must be an object");
  }
  return value;
}

function textValue(value, field, nullable = false) {
  if (nullable && value == null) return null;
  if (typeof value !== "string") throw new TypeError(field + " must be text");
  return value;
}

function numberValue(value, field, nullable = false, integer = false) {
  if (nullable && value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isSafeInteger(parsed))) {
    throw new TypeError(field + " must be a non-negative " + (integer ? "safe integer" : "number"));
  }
  return parsed;
}

function dateValue(value, field, nullable = false) {
  if (nullable && value == null) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(field + " must be a valid timestamp");
  }
  return value;
}

function booleanValue(value, field, nullable = false) {
  if (nullable && value == null) return null;
  if (typeof value !== "boolean") throw new TypeError(field + " must be boolean");
  return value;
}

function parseCampaign(value, index) {
  const row = objectValue(value, "campaigns[" + index + "]");
  const status = textValue(row.status, "campaign status");
  if (!campaignStatuses.has(status)) throw new TypeError("campaign status is unsupported");

  const reason = textValue(row.completion_reason, "completion_reason", true);
  if (reason !== null && !completionReasons.has(reason)) {
    throw new TypeError("completion_reason is unsupported");
  }

  return {
    id: textValue(row.id, "campaign id"),
    name: textValue(row.name, "campaign name", true),
    goal: textValue(row.goal, "campaign goal", true),
    platform: textValue(row.platform, "campaign platform", true),
    payment_method: textValue(row.payment_method, "payment_method", true),
    payment_rate: numberValue(row.payment_rate, "payment_rate", true),
    max_budget: numberValue(row.max_budget, "max_budget"),
    funded_amount: numberValue(row.funded_amount, "funded_amount"),
    committed_spend: numberValue(row.committed_spend, "committed_spend"),
    remaining_funded_budget: numberValue(row.remaining_funded_budget, "remaining_funded_budget"),
    desired_results: numberValue(row.desired_results, "desired_results", true, true),
    status,
    completion_reason: reason,
    completed_at: dateValue(row.completed_at, "completed_at", true),
    created_at: dateValue(row.created_at, "created_at"),
    required_next_result: numberValue(row.required_next_result, "required_next_result", true),
    can_fund_next_result: booleanValue(row.can_fund_next_result, "can_fund_next_result", true),
    needs_reconciliation: booleanValue(row.needs_reconciliation, "needs_reconciliation")
  };
}

export function parseAdminCampaignLifecycleOverview(value) {
  const payload = objectValue(value, "campaign lifecycle response");
  if (payload.ok !== true) throw new TypeError("campaign lifecycle response is not successful");

  const summary = objectValue(payload.summary, "summary");
  const summaryFields = [
    "total", "draft", "funded", "active", "paused",
    "completed", "closed", "cancelled", "needs_reconciliation"
  ];
  const parsedSummary = {};
  for (const field of summaryFields) {
    parsedSummary[field] = numberValue(summary[field], "summary." + field, false, true);
  }

  if (!Array.isArray(payload.campaigns)) throw new TypeError("campaigns must be an array");
  if (typeof payload.truncated !== "boolean") throw new TypeError("truncated must be boolean");

  return {
    generated_at: dateValue(payload.generated_at, "generated_at"),
    summary: parsedSummary,
    campaigns: payload.campaigns.map(parseCampaign),
    truncated: payload.truncated
  };
}
