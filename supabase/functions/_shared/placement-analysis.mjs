const anchors = new Set([
  "top_left", "top_center", "top_right",
  "center_left", "center", "center_right",
  "bottom_left", "bottom_center", "bottom_right",
]);

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validateRect(value, labelRequired = false) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { x, y, width, height } = value;
  if (![x, y, width, height].every(finiteNumber)) return null;
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1.000001 || y + height > 1.000001) return null;
  if (labelRequired && (typeof value.label !== "string" || !value.label.trim() || value.label.length > 80)) return null;
  return { x, y, width, height, ...(labelRequired ? { label: value.label.trim() } : {}) };
}

export function validateFrames(frames, durationSeconds, frameWidth, frameHeight) {
  if (!Array.isArray(frames) || frames.length < 4 || frames.length > 6) throw new Error("invalid_frame_count");
  if (!finiteNumber(durationSeconds) || durationSeconds < 1 || durationSeconds > 600) throw new Error("invalid_video_duration");
  if (!Number.isInteger(frameWidth) || !Number.isInteger(frameHeight) || frameWidth < 1 || frameHeight < 1 || frameWidth > 7680 || frameHeight > 7680) throw new Error("invalid_video_dimensions");

  let totalLength = 0;
  let previousTimestamp = -1;
  const cleaned = frames.map((frame) => {
    if (!frame || typeof frame !== "object") throw new Error("invalid_frame");
    const timestamp = frame.timestamp_seconds;
    const image = frame.image_data_url;
    if (!finiteNumber(timestamp) || timestamp < 0 || timestamp > durationSeconds || timestamp <= previousTimestamp) throw new Error("invalid_frame_timestamp");
    if (typeof image !== "string" || image.length > 1_100_000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) throw new Error("invalid_frame_image");
    previousTimestamp = timestamp;
    totalLength += image.length;
    return { timestamp_seconds: Number(timestamp.toFixed(2)), image_data_url: image };
  });

  if (totalLength > 4_800_000) throw new Error("frame_payload_too_large");
  return cleaned;
}

export function validatePlacementResult(raw, durationSeconds) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid_placement_result");
  const reasoning = typeof raw.reasoning === "string" ? raw.reasoning.trim().slice(0, 500) : "";
  if (!reasoning) throw new Error("missing_placement_reasoning");

  const warnings = Array.isArray(raw.warnings)
    ? raw.warnings.filter((item) => typeof item === "string").slice(0, 8).map((item) => item.trim().slice(0, 200)).filter(Boolean)
    : [];

  const regions = (value, kind) => {
    if (value == null) return [];
    if (!Array.isArray(value) || value.length > 8) throw new Error("invalid_placement_regions");
    return value.map((item) => validateRect(item, true)).filter(Boolean).map((item) => ({ ...item, kind }));
  };

  const safeAreas = regions(raw.safe_areas, "safe");
  const blockedAreas = regions(raw.blocked_areas, "blocked");

  if (raw.placement === null) {
    return {
      placement: null,
      reasoning,
      confidence: 0,
      safe_areas: safeAreas,
      blocked_areas: blockedAreas,
      warnings,
    };
  }

  const placement = raw.placement;
  const rect = validateRect(placement);
  if (!rect || !finiteNumber(placement.start_seconds) || !finiteNumber(placement.end_seconds) || !finiteNumber(placement.confidence)) {
    throw new Error("invalid_placement_geometry");
  }
  if (placement.start_seconds < 0 || placement.end_seconds <= placement.start_seconds || placement.end_seconds > durationSeconds) {
    throw new Error("invalid_placement_timing");
  }
  if (placement.confidence < 0 || placement.confidence > 1) throw new Error("invalid_placement_confidence");
  if (typeof placement.anchor !== "string" || !anchors.has(placement.anchor)) throw new Error("invalid_placement_anchor");

  return {
    placement: {
      ...rect,
      start_seconds: Number(placement.start_seconds.toFixed(2)),
      end_seconds: Number(placement.end_seconds.toFixed(2)),
      confidence: placement.confidence,
      anchor: placement.anchor,
    },
    reasoning,
    confidence: placement.confidence,
    safe_areas: safeAreas,
    blocked_areas: blockedAreas,
    warnings,
  };
}
