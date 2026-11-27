export function safeHttpUrlWithoutCredentials(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeManualMetricInput(claimedMetric, evidenceUrl) {
  const rawMetric = String(claimedMetric ?? "").replaceAll(",", "").trim();
  if (!/^\d+$/.test(rawMetric)) {
    throw new Error("Enter a whole-number view count of zero or more.");
  }
  const metric = Number(rawMetric);
  if (!Number.isSafeInteger(metric) || metric < 0) {
    throw new Error("The view count is outside the supported range.");
  }

  const normalizedEvidenceUrl = safeHttpUrlWithoutCredentials(evidenceUrl);
  if (!normalizedEvidenceUrl) {
    throw new Error("Enter a valid HTTP or HTTPS evidence URL without embedded credentials.");
  }

  return { claimedMetric: metric, evidenceUrl: normalizedEvidenceUrl };
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
