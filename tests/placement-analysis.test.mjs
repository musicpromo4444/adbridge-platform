import test from "node:test";
import assert from "node:assert/strict";
import { validateFrames, validatePlacementResult } from "../supabase/functions/_shared/placement-analysis.mjs";

const frame = (timestamp) => ({ timestamp_seconds: timestamp, image_data_url: "data:image/jpeg;base64,QUJDRA==" });

test("accepts four ordered, bounded JPEG frames", () => {
  const frames = validateFrames([frame(1), frame(2), frame(3), frame(4)], 10, 1280, 720);
  assert.equal(frames.length, 4);
  assert.equal(frames[2].timestamp_seconds, 3);
});

test("rejects duplicate or out-of-order frame timestamps", () => {
  assert.throws(() => validateFrames([frame(1), frame(2), frame(2), frame(4)], 10, 1280, 720), /invalid_frame_timestamp/);
});

test("rejects non-JPEG frame payloads", () => {
  assert.throws(() => validateFrames([frame(1), frame(2), frame(3), { timestamp_seconds: 4, image_data_url: "data:image/png;base64,QUJD" }], 10, 1280, 720), /invalid_frame_image/);
});

test("rejects video metadata outside configured limits", () => {
  assert.throws(() => validateFrames([frame(1), frame(2), frame(3), frame(4)], 601, 1280, 720), /invalid_video_duration/);
  assert.throws(() => validateFrames([frame(1), frame(2), frame(3), frame(4)], 10, 0, 720), /invalid_video_dimensions/);
});

test("accepts a normalized placement and removes unrecognized fields", () => {
  const result = validatePlacementResult({
    placement: { x: 0.72, y: 0.7, width: 0.18, height: 0.12, start_seconds: 2, end_seconds: 5.5, confidence: 0.86, anchor: "bottom_right" },
    reasoning: "Clear area away from the subject and captions.",
    safe_areas: [{ x: 0.7, y: 0.68, width: 0.2, height: 0.16, label: "lower right" }],
    blocked_areas: [],
    warnings: ["Check the platform interface before posting."],
    secret: "discarded",
  }, 12);
  assert.equal(result.placement.anchor, "bottom_right");
  assert.equal(result.safe_areas[0].kind, "safe");
  assert.equal("secret" in result, false);
});

test("rejects placement rectangles outside the video frame", () => {
  assert.throws(() => validatePlacementResult({
    placement: { x: 0.9, y: 0.8, width: 0.2, height: 0.2, start_seconds: 1, end_seconds: 2, confidence: 0.7, anchor: "bottom_right" },
    reasoning: "No safe area.",
  }, 10), /invalid_placement_geometry/);
});

test("rejects invalid timing and confidence", () => {
  const base = { x: 0.2, y: 0.2, width: 0.2, height: 0.2, start_seconds: 2, end_seconds: 4, confidence: 0.7, anchor: "center" };
  assert.throws(() => validatePlacementResult({ placement: { ...base, end_seconds: 11 }, reasoning: "Clear area." }, 10), /invalid_placement_timing/);
  assert.throws(() => validatePlacementResult({ placement: { ...base, confidence: 1.4 }, reasoning: "Clear area." }, 10), /invalid_placement_confidence/);
});

test("allows the AI to decline placement when no safe area exists", () => {
  const result = validatePlacementResult({
    placement: null,
    reasoning: "The subject and captions occupy the available frame.",
    warnings: ["Try a different video segment."],
  }, 20);
  assert.equal(result.placement, null);
  assert.equal(result.confidence, 0);
});
