function nonNegativeAmount(value) {
  if (typeof value === "string" && value.trim() === "") return null;
  if (typeof value !== "number" && typeof value !== "string") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function nonNegativeCount(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function parseCreatorEarningsSummaryRows(value) {
  if (!Array.isArray(value) || value.length !== 1) {
    return {
      data: null,
      error: new Error("AdBridge returned an unavailable creator earnings summary."),
    };
  }

  const row = value[0];
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return {
      data: null,
      error: new Error("AdBridge returned an incomplete creator earnings summary."),
    };
  }

  const releasedEarnings = nonNegativeAmount(row.released_earnings);
  const pendingEarnings = nonNegativeAmount(row.pending_earnings);
  const reservedWithdrawals = nonNegativeAmount(row.reserved_withdrawals);
  const availableBalance = nonNegativeAmount(row.available_balance);
  const withdrawalCount = nonNegativeCount(row.withdrawal_count);

  if (
    releasedEarnings === null ||
    pendingEarnings === null ||
    reservedWithdrawals === null ||
    availableBalance === null ||
    withdrawalCount === null
  ) {
    return {
      data: null,
      error: new Error("AdBridge returned invalid creator earnings values."),
    };
  }

  const expectedAvailableKobo = Math.round(
    Math.max(0, releasedEarnings - reservedWithdrawals) * 100,
  );
  const actualAvailableKobo = Math.round(availableBalance * 100);

  if (expectedAvailableKobo !== actualAvailableKobo) {
    return {
      data: null,
      error: new Error("AdBridge returned an inconsistent available balance."),
    };
  }

  return {
    data: {
      releasedEarnings,
      pendingEarnings,
      reservedWithdrawals,
      availableBalance,
      withdrawalCount,
    },
    error: null,
  };
}
