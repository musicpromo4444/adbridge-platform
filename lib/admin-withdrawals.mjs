const decisions = new Set(["approved", "rejected"]);

function failure(message) {
  return { data: null, error: new Error(message) };
}

export function parseWithdrawalReviewResult(value, expectedWithdrawalId, expectedStatus) {
  if (!decisions.has(expectedStatus)) {
    return failure("The requested withdrawal decision is invalid.");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return failure("AdBridge returned an incomplete withdrawal review result.");
  }

  const amount =
    typeof value.amount === "number" || typeof value.amount === "string"
      ? Number(value.amount)
      : Number.NaN;

  if (
    value.success !== true ||
    typeof value.withdrawal_id !== "string" ||
    value.withdrawal_id !== expectedWithdrawalId ||
    value.status !== expectedStatus ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    typeof value.unchanged !== "boolean"
  ) {
    return failure("AdBridge did not confirm the requested withdrawal decision.");
  }

  return {
    data: {
      withdrawalId: value.withdrawal_id,
      amount,
      status: expectedStatus,
      unchanged: value.unchanged,
    },
    error: null,
  };
}
