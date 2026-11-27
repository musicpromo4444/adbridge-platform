const EVENT_TYPES = new Set(["impression", "click", "video_view", "install", "conversion"]);

function count(value, field) {
  const parsed = typeof value === "number" ? value
    : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`AdBridge returned an invalid ${field} count.`);
  }
  return parsed;
}

function object(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`AdBridge returned an invalid ${field} response.`);
  }
  return value;
}

function metricRow(value, field) {
  const row = object(value, field);
  const eventType = String(row.event_type ?? "");
  if (!EVENT_TYPES.has(eventType)) throw new Error("AdBridge returned an unsupported event type.");
  return {
    event_type: eventType,
    total: count(row.total, field + " total"),
    verified: count(row.verified, field + " verified"),
    payable: count(row.payable, field + " payable"),
    under_review: count(row.under_review, field + " under-review"),
    blocked: count(row.blocked, field + " blocked"),
    rejected: count(row.rejected, field + " rejected"),
  };
}

function dailyRow(value) {
  const row = object(value, "daily performance");
  if (typeof row.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.day) || !Number.isFinite(Date.parse(row.day))) {
    throw new Error("AdBridge returned an invalid daily performance date.");
  }
  return {
    day: row.day,
    total: count(row.total, "daily total"),
    verified: count(row.verified, "daily verified"),
    payable: count(row.payable, "daily payable"),
    under_review: count(row.under_review, "daily under-review"),
    blocked: count(row.blocked, "daily blocked"),
    rejected: count(row.rejected, "daily rejected"),
  };
}

export function parsePublisherPerformance(value) {
  const row = object(value, "publisher performance");
  const days = count(row.days, "reporting window");
  if (days < 1 || days > 90) throw new Error("AdBridge returned an invalid reporting window.");
  for (const field of ["from", "generated_at"]) {
    if (typeof row[field] !== "string" || !Number.isFinite(Date.parse(row[field]))) {
      throw new Error(`AdBridge returned an invalid ${field} timestamp.`);
    }
  }
  if (!Array.isArray(row.event_types) || !Array.isArray(row.daily)) {
    throw new Error("AdBridge returned invalid performance series.");
  }
  return {
    days,
    from: row.from,
    generated_at: row.generated_at,
    total_events: count(row.total_events, "total events"),
    verified_events: count(row.verified_events, "verified events"),
    payable_events: count(row.payable_events, "payable events"),
    under_review_events: count(row.under_review_events, "under-review events"),
    blocked_events: count(row.blocked_events, "blocked events"),
    rejected_events: count(row.rejected_events, "rejected events"),
    event_types: row.event_types.map((item) => metricRow(item, "event type")),
    daily: row.daily.map(dailyRow),
  };
}
