import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parsePublisherPerformance } from "../lib/publisher-performance.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const migration = await read("../supabase/migrations/20261127193500_publisher_verified_delivery_performance.sql");
const page = await read("../app/publisher/performance/page.tsx");
const dashboard = await read("../app/publisher/page.tsx");

const sample = {
  days: 30, from: "2026-10-28T00:00:00.000Z", generated_at: "2026-11-27T18:00:00.000Z",
  total_events: 12, verified_events: 9, payable_events: 7, under_review_events: 2,
  blocked_events: 1, rejected_events: 0,
  event_types: [{ event_type: "click", total: 12, verified: 9, payable: 7, under_review: 2, blocked: 1, rejected: 0 }],
  daily: [{ day: "2026-11-27", total: 12, verified: 9, payable: 7, under_review: 2, blocked: 1, rejected: 0 }],
};

test("publisher report accepts aggregate metrics and separates verified from payable", () => {
  const result = parsePublisherPerformance(sample);
  assert.equal(result.total_events, 12);
  assert.equal(result.verified_events, 9);
  assert.equal(result.payable_events, 7);
  assert.equal(result.under_review_events, 2);
});

test("publisher report rejects malformed counts, dates and event types", () => {
  assert.throws(() => parsePublisherPerformance({ ...sample, payable_events: -1 }));
  assert.throws(() => parsePublisherPerformance({ ...sample, generated_at: "not-a-date" }));
  assert.throws(() => parsePublisherPerformance({ ...sample, event_types: [{ ...sample.event_types[0], event_type: "identity" }] }));
  assert.throws(() => parsePublisherPerformance({ ...sample, daily: [{ ...sample.daily[0], day: "yesterday" }] }));
});

test("reporting window is bounded to ninety days", () => {
  assert.throws(() => parsePublisherPerformance({ ...sample, days: 365 }));
});

test("RPC derives publisher identity from auth and only returns aggregate assessment data", () => {
  assert.match(migration, /auth\.uid\(\)/i);
  assert.match(migration, /p\.role = 'publisher'/i);
  assert.match(migration, /a\.publisher_id = v_uid/i);
  assert.match(migration, /a\.source_table = 'ad_placement_events'/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /revoke all[\s\S]*from public, anon/i);
  assert.match(migration, /grant execute[\s\S]*to authenticated/i);
  assert.doesNotMatch(migration, /ip_hash|visitor_hash|session_hash|user_agent_hash/i);
});

test("publisher performance page uses the live RPC and distinguishes payable events", () => {
  assert.match(page, /loadPublisherPerformance/);
  assert.match(page, /Verified events/);
  assert.match(page, /Payable events/);
  assert.match(page, /Under review/);
  assert.match(page, /Blocked/);
  assert.match(page, /No verified publisher events/);
  assert.match(dashboard, /href="\/publisher\/performance"/);
});
