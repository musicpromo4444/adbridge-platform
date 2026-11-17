function nonNegativeAmount(value) {
  if (typeof value === "string" && value.trim() === "") return null;
  if (typeof value !== "number" && typeof value !== "string") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function parseCampaignBudgetSummaryRows(value) {
  if (!Array.isArray(value)) {
    return {
      data: null,
      error: new Error("AdBridge returned an invalid campaign budget response."),
    };
  }

  const rows = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {
        data: null,
        error: new Error("AdBridge returned an incomplete campaign budget row."),
      };
    }

    const row = raw;
    const campaignId = typeof row.campaign_id === "string" ? row.campaign_id.trim() : "";
    const campaignName = typeof row.campaign_name === "string" ? row.campaign_name : null;
    const campaignStatus = typeof row.campaign_status === "string" ? row.campaign_status : null;
    const maxBudget = nonNegativeAmount(row.max_budget);
    const heldFunding = nonNegativeAmount(row.held_funding);
    const committedSpend = nonNegativeAmount(row.committed_spend);
    const remainingBudget = nonNegativeAmount(row.remaining_budget);

    if (
      !campaignId ||
      campaignName === null ||
      campaignStatus === null ||
      maxBudget === null ||
      heldFunding === null ||
      committedSpend === null ||
      remainingBudget === null
    ) {
      return {
        data: null,
        error: new Error("AdBridge returned invalid campaign budget values."),
      };
    }

    rows.push({
      campaignId,
      campaignName,
      campaignStatus,
      maxBudget,
      heldFunding,
      committedSpend,
      remainingBudget,
    });
  }

  return { data: rows, error: null };
}
