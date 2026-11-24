function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function countText(value, field, nullable = false) {
  if (value === null && nullable) return null;
  const text = typeof value === "number" && Number.isSafeInteger(value)
    ? String(value)
    : typeof value === "string" ? value : "";
  if (!/^\d+$/.test(text)) {
    throw new Error("Manual CPM review history contains an invalid " + field + ".");
  }
  return text.replace(/^0+(?=\d)/, "");
}

function safeEvidenceUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function parseAdminMetricReviewHistory(value) {
  if (!isRecord(value) || value.ok !== true || !Array.isArray(value.items)) {
    throw new Error("Manual CPM review history returned an invalid response.");
  }

  const items = value.items.map((row, index) => {
    if (!isRecord(row) || typeof row.id !== "string" || !row.id) {
      throw new Error("Manual CPM review history contains an invalid record at position " + index + ".");
    }
    if (!["approved", "rejected"].includes(row.status)) {
      throw new Error("Manual CPM review history contains an invalid decision.");
    }
    if (typeof row.campaign_name !== "string" || !isDate(row.created_at) || !isDate(row.reviewed_at)) {
      throw new Error("Manual CPM review history contains incomplete review details.");
    }
    if (row.tracking_platform !== null && typeof row.tracking_platform !== "string") {
      throw new Error("Manual CPM review history contains an invalid platform.");
    }
    for (const key of ["creator_note", "review_note"]) {
      if (row[key] !== null && typeof row[key] !== "string") {
        throw new Error("Manual CPM review history contains an invalid note.");
      }
    }

    return {
      id: row.id,
      campaignName: row.campaign_name,
      trackingPlatform: row.tracking_platform,
      evidenceUrl: safeEvidenceUrl(row.evidence_url),
      claimedMetric: countText(row.claimed_metric, "claimed count"),
      targetMetric: countText(row.target_metric, "target count", true),
      currentMetric: countText(row.current_metric, "saved count", true),
      creatorNote: row.creator_note,
      reviewNote: row.review_note,
      status: row.status,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
    };
  });

  let nextCursor = null;
  if (value.next_cursor !== null) {
    const cursor = value.next_cursor;
    if (!isRecord(cursor) || typeof cursor.id !== "string" || !cursor.id || !isDate(cursor.reviewed_at)) {
      throw new Error("Manual CPM review history contains an invalid pagination cursor.");
    }
    nextCursor = { id: cursor.id, reviewedAt: cursor.reviewed_at };
  }

  return { items, nextCursor };
}
