import { supabase } from "@/lib/supabase";
import {
  parseWithdrawalReviewResult,
  type WithdrawalReviewResult,
  type WithdrawalReviewStatus,
} from "./admin-withdrawals.mjs";

export { parseWithdrawalReviewResult };
export type { WithdrawalReviewResult, WithdrawalReviewStatus };

type ReviewOutcome = {
  data: WithdrawalReviewResult | null;
  error: Error | null;
};

export async function reviewCreatorWithdrawal(input: {
  withdrawalId: string;
  decision: WithdrawalReviewStatus;
  adminNote?: string | null;
}): Promise<ReviewOutcome> {
  if (!supabase) {
    return {
      data: null,
      error: new Error("AdBridge database connection is not available."),
    };
  }

  const { data, error } = await supabase.rpc("review_creator_withdrawal", {
    p_withdrawal_id: input.withdrawalId,
    p_decision: input.decision,
    p_admin_note: input.adminNote?.trim() || null,
  });

  if (error) {
    return {
      data: null,
      error: new Error(
        error.message || "The withdrawal decision could not be saved.",
      ),
    };
  }

  return parseWithdrawalReviewResult(
    data,
    input.withdrawalId,
    input.decision,
  );
}


export async function recordCreatorWithdrawalPayout(input: {
  withdrawalId: string;
  payoutReference: string;
}): Promise<{
  data: import("./admin-withdrawals.mjs").WithdrawalPayoutResult | null;
  error: Error | null;
}> {
  if (!supabase) {
    return {
      data: null,
      error: new Error("AdBridge database connection is not available."),
    };
  }

  const payoutReference = input.payoutReference.trim();
  if (!payoutReference || payoutReference.length > 120) {
    return {
      data: null,
      error: new Error("Enter a valid transfer reference of 1 to 120 characters."),
    };
  }

  const { data, error } = await supabase.rpc("record_creator_withdrawal_payout", {
    p_withdrawal_id: input.withdrawalId,
    p_payout_reference: payoutReference,
  });

  if (error) {
    return {
      data: null,
      error: new Error(error.message || "The payout could not be recorded."),
    };
  }

  const parsed = (await import("./admin-withdrawals.mjs")).parseWithdrawalPayoutResult(
    data,
    input.withdrawalId,
    payoutReference,
  );
  return parsed;
}
