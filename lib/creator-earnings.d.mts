export type CreatorEarningsSummary = {
  releasedEarnings: number;
  pendingEarnings: number;
  reservedWithdrawals: number;
  availableBalance: number;
  withdrawalCount: number;
};

export type CreatorEarningsSummaryParseOutcome = {
  data: CreatorEarningsSummary | null;
  error: Error | null;
};

export function parseCreatorEarningsSummaryRows(
  value: unknown,
): CreatorEarningsSummaryParseOutcome;
