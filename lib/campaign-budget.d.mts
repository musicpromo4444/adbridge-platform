export type CampaignBudgetSummary = {
  campaignId: string;
  campaignName: string;
  campaignStatus: string;
  maxBudget: number;
  heldFunding: number;
  committedSpend: number;
  remainingBudget: number;
};

export type CampaignBudgetParseOutcome = {
  data: CampaignBudgetSummary[] | null;
  error: Error | null;
};

export function parseCampaignBudgetSummaryRows(
  value: unknown,
): CampaignBudgetParseOutcome;
