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
