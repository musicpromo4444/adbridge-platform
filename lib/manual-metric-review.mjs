export function normalizeManualMetricInput(claimedMetric, evidenceUrl) {
  const rawMetric = String(claimedMetric ?? "").replaceAll(",", "").trim();
  if (!/^\d+$/.test(rawMetric)) {
    throw new Error("Enter a whole-number view count of zero or more.");
  }
  const metric = Number(rawMetric);
  if (!Number.isSafeInteger(metric) || metric < 0) {
    throw new Error("The view count is outside the supported range.");
  }

  let url;
  try {
    url = new URL(String(evidenceUrl ?? "").trim());
  } catch {
    throw new Error("Enter a valid public HTTP or HTTPS evidence URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Evidence must use HTTP or HTTPS.");
  }

  return { claimedMetric: metric, evidenceUrl: url.toString() };
}

export function parseManualMetricEvidenceResult(value) {
  if (!value || value.ok !== true || typeof value.id !== "string" || value.status !== "pending") {
    throw new Error("Manual metric evidence was not confirmed by AdBridge.");
  }
  return {
    id: value.id,
    status: "pending",
    duplicate: value.duplicate === true,
  };
}

export function parseManualMetricReviewResult(value) {
  if (!value || value.success !== true || value.ok !== true ||
      !["approved", "rejected"].includes(value.decision)) {
    throw new Error("The server did not confirm the metric review.");
  }
  const payout = value.payout && typeof value.payout === "object" ? value.payout : null;
  return {
    decision: value.decision,
    duplicate: value.duplicate === true,
    payout: payout ? {
      paid: payout.paid === true,
      duplicate: payout.duplicate === true,
      reason: typeof payout.reason === "string" ? payout.reason : null,
      amount: Number.isFinite(Number(payout.amount)) ? Number(payout.amount) : null,
    } : null,
  };
}
