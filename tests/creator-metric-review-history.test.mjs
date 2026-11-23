import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseCreatorMetricReviewHistory } from "../lib/creator-metric-review-history.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const migration = await read("../supabase/migrations/20261123184500_adbridge_creator_metric_review_history.sql");
const component = await read("../app/creator/submit/metric-review-history.tsx");
const page = await read("../app/creator/submit/submit-client.tsx");
const adapter = await read("../lib/creator-metric-review-history.ts");
const sqlAssertions = await read("../supabase/tests/creator_metric_review_history.sql");

const validPayload = {
  ok: true,
  items: [{
    id: "metric-1",
    claimed_metric: "12500",
    target_metric: "20000",
    evidence_url: "https://www.example.com/insights",
    creator_note: "Updated public insights",
    status: "rejected",
    review_note: "Please provide a clearer public insights page.",
    created_at: "2026-11-23T08:00:00.000Z",
    reviewed_at: "2026-11-23T09:00:00.000Z",
  }],
  next_cursor: {
    created_at: "2026-11-23T08:00:00.000Z",
    id: "metric-1",
  },
};

test("creator evidence history parser accepts a valid status and keyset cursor", () => {
  const page = parseCreatorMetricReviewHistory(validPayload);
  assert.equal(page.items[0].claimedMetric, "12500");
  assert.equal(page.items[0].status, "rejected");
  assert.equal(page.items[0].reviewNote, "Please provide a clearer public insights page.");
  assert.deepEqual(page.nextCursor, {
    createdAt: "2026-11-23T08:00:00.000Z",
    id: "metric-1",
  });
});

test("creator evidence history rejects unconfirmed payloads and unknown statuses", () => {
  assert.throws(() => parseCreatorMetricReviewHistory({ ok: false, items: [] }));
  assert.throws(() => parseCreatorMetricReviewHistory({
    ...validPayload,
    items: [{ ...validPayload.items[0], status: "paid" }],
  }));
});

test("creator evidence history rejects unsafe URLs, malformed counts and timestamps", () => {
  assert.throws(() => parseCreatorMetricReviewHistory({
    ...validPayload,
    items: [{ ...validPayload.items[0], evidence_url: "javascript:alert(1)" }],
  }));
  assert.throws(() => parseCreatorMetricReviewHistory({
    ...validPayload,
    items: [{ ...validPayload.items[0], claimed_metric: "12.5" }],
  }));
  assert.throws(() => parseCreatorMetricReviewHistory({
    ...validPayload,
    items: [{ ...validPayload.items[0], created_at: "not-a-date" }],
  }));
});

test("creator history RPC is invoker-security, owner-scoped, bounded and keyset-paginated", () => {
  assert.match(migration, /function public\.get_creator_metric_review_history/i);
  assert.match(migration, /security invoker[\s\S]*set search_path = ''/i);
  assert.match(migration, /p\.role = 'creator'/i);
  assert.match(migration, /s\.creator_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /p_page_size < 1[\s\S]*p_page_size > 20/i);
  assert.match(migration, /\(mv\.created_at, mv\.id\) < \(p_before_created_at, p_before_id\)/i);
  assert.match(migration, /limit \(p_page_size \+ 1\)/i);
  assert.match(migration, /metric_verifications_creator_history_idx/i);
  assert.match(migration, /grant execute on function public\.get_creator_metric_review_history[\s\S]*to authenticated/i);
  assert.doesNotMatch(migration, /'reviewed_by'/i);
});

test("creator history returns no account or reviewer identifiers and relies on existing RLS", () => {
  assert.doesNotMatch(migration, /jsonb_build_object\([\s\S]*'creator_id'/i);
  assert.doesNotMatch(migration, /'reviewed_by'/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /public\.metric_verifications mv/i);
});

test("creator history adapter calls the authenticated RPC and validates its response", () => {
  assert.match(adapter, /get_creator_metric_review_history/);
  assert.match(adapter, /parseCreatorMetricReviewHistory/);
  assert.match(adapter, /p_submission_id: submissionId/);
});

test("creator UI uses the RPC history component rather than direct review-table reads", () => {
  assert.match(component, /loadCreatorMetricReviewHistory/);
  assert.match(component, /AdBridge review feedback/);
  assert.match(component, /Any eligible CPM payment is recorded separately/i);
  assert.doesNotMatch(component, /\.from\(["']metric_verifications/);
  assert.match(page, /CreatorMetricReviewHistory/);
  assert.match(page, /submissionId=\{retrySubmissionId\}/);
  assert.match(page, /submissionId=\{savedSubmissionId\}/);
});

test("read-only SQL assertions cover RLS, narrow column grants, RPC privileges and invoker security", () => {
  assert.match(sqlAssertions, /relrowsecurity/i);
  assert.match(sqlAssertions, /has_column_privilege/i);
  assert.match(sqlAssertions, /has_function_privilege\('authenticated'/i);
  assert.match(sqlAssertions, /has_function_privilege\('anon'/i);
  assert.match(sqlAssertions, /SECURITY INVOKER/i);
  assert.match(sqlAssertions, /reviewed_by/i);
});
