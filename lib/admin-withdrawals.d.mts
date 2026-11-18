export type WithdrawalReviewStatus = "approved" | "rejected";

export type WithdrawalReviewResult = {
  withdrawalId: string;
  amount: number;
  status: WithdrawalReviewStatus;
  unchanged: boolean;
};

export function parseWithdrawalReviewResult(
  value: unknown,
  expectedWithdrawalId: string,
  expectedStatus: WithdrawalReviewStatus,
): {
  data: WithdrawalReviewResult | null;
  error: Error | null;
};
