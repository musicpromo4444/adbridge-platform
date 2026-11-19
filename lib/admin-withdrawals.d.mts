export type WithdrawalReviewStatus = "approved" | "rejected";

export type WithdrawalReviewResult = {
  withdrawalId: string;
  amount: number;
  status: WithdrawalReviewStatus;
  unchanged: boolean;
};

export type WithdrawalPayoutResult = {
  withdrawalId: string;
  amount: number;
  status: "paid";
  payoutReference: string;
  paidAt: string;
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

export function parseWithdrawalPayoutResult(
  value: unknown,
  expectedWithdrawalId: string,
  expectedReference: string,
): {
  data: WithdrawalPayoutResult | null;
  error: Error | null;
};
