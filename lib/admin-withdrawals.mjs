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


export function parseWithdrawalPayoutResult(value, expectedWithdrawalId, expectedReference) {
  const reference = typeof expectedReference === "string" ? expectedReference.trim() : "";
  const returnedReference =
    value && typeof value === "object" && !Array.isArray(value) &&
    typeof value.payout_reference === "string"
      ? value.payout_reference.trim()
      : "";
  const amount =
    value && typeof value === "object" && !Array.isArray(value) &&
    (typeof value.amount === "number" || typeof value.amount === "string")
      ? Number(value.amount)
      : Number.NaN;
  const paidAt =
    value && typeof value === "object" && !Array.isArray(value) &&
    typeof value.paid_at === "string"
      ? value.paid_at
      : "";

  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.success !== true ||
    value.withdrawal_id !== expectedWithdrawalId ||
    value.status !== "paid" ||
    !reference ||
    returnedReference !== reference ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isFinite(Date.parse(paidAt)) ||
    typeof value.unchanged !== "boolean"
  ) {
    return failure("AdBridge did not confirm the recorded payout.");
  }

  return {
    data: {
      withdrawalId: value.withdrawal_id,
      amount,
      status: "paid",
      payoutReference: returnedReference,
      paidAt,
      unchanged: value.unchanged,
    },
    error: null,
  };
}
