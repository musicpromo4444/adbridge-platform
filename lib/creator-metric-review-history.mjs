const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function requiredText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Creator metric review history contains an invalid " + label + ".");
  }
  return value.trim();
}

function optionalText(value, label) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    throw new Error("Creator metric review history contains an invalid " + label + ".");
  }
  return value;
}

function countText(value, label) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value);
  if (!/^(0|[1-9][0-9]*)$/.test(normalized)) {
    throw new Error("Creator metric review history contains an invalid " + label + ".");
  }
  return normalized;
}

function timestamp(value, label, nullable = false) {
  if (nullable && (value === null || value === undefined)) return null;
  const normalized = requiredText(value, label);
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new Error("Creator metric review history contains an invalid " + label + ".");
  }
  return normalized;
}

function safeEvidenceUrl(value) {
  const normalized = optionalText(value, "evidence URL");
  if (normalized === null) return null;
  try {
    const url = new URL(normalized);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      throw new Error("unsafe URL");
    }
    return url.toString();
  } catch {
    throw new Error("Creator metric review history contains an unsafe evidence URL.");
  }
}

function parseCursor(value) {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) {
    throw new Error("Creator metric review history contains an invalid pagination cursor.");
  }
  return {
    createdAt: timestamp(value.created_at, "cursor timestamp"),
    id: requiredText(value.id, "cursor ID"),
  };
}

export function parseCreatorMetricReviewHistory(payload) {
  if (!isRecord(payload) || payload.ok !== true || !Array.isArray(payload.items)) {
    throw new Error("Creator metric review history could not be confirmed.");
  }

  const items = payload.items.map((item) => {
    if (!isRecord(item)) {
      throw new Error("Creator metric review history contains an invalid item.");
    }
    const status = requiredText(item.status, "review status");
    if (!["pending", "approved", "rejected"].includes(status)) {
      throw new Error("Creator metric review history contains an unknown review status.");
    }

    return {
      id: requiredText(item.id, "record ID"),
      claimedMetric: countText(item.claimed_metric, "claimed metric"),
      targetMetric: countText(item.target_metric, "target metric"),
      evidenceUrl: safeEvidenceUrl(item.evidence_url),
      creatorNote: optionalText(item.creator_note, "creator note"),
      status,
      reviewNote: optionalText(item.review_note, "review note"),
      createdAt: timestamp(item.created_at, "submission timestamp"),
      reviewedAt: timestamp(item.reviewed_at, "review timestamp", true),
    };
  });

  return {
    items,
    nextCursor: parseCursor(payload.next_cursor),
  };
}
