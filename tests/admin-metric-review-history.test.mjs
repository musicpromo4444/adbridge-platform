import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseAdminMetricReviewHistory } from "../lib/admin-metric-review-history.mjs";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const migration = await read("../supabase/migrations/20261123071500_adbridge_admin_metric_review_history.sql");
const component = await read("../app/admin/review/metric-review-history.tsx");
const page = await read("../app/admin/review/page.tsx");
const client = await read("../lib/admin-metric-review-history.ts");
const sqlAssertions = await read("../supabase/tests/admin_metric_review_history.sql");

const sample = {
  ok: true,
  items: [{
    id: "review-1",
    campaign_name: "Launch campaign",
    tracking_platform: "youtube",
    evidence_url: "https://youtube.com/analytics",
    claimed_metric: "12000",
    target_metric: "10000",
    current_metric: "12000",
    creator_note: "Public insights are available.",
    review_note: "Accepted after manual inspection.",
    status: "approved",
    created_at: "2026-11-22T09:00:00.000Z",
    reviewed_at: "2026-11-22T10:00:00.000Z"
  }],
  next_cursor: { id: "review-1", reviewed_at: "2026-11-22T10:00:00.000Z" }
};

test("history parser validates decisions, exact count strings, dates and cursor", () => {
  const result = parseAdminMetricReviewHistory(sample);
  assert.equal(result.items[0].status, "approved");
  assert.equal(result.items[0].claimedMetric, "12000");
  assert.deepEqual(result.nextCursor, { id: "review-1", reviewedAt: "2026-11-22T10:00:00.000Z" });
  assert.throws(() => parseAdminMetricReviewHistory({ ...sample, ok: false }));
  assert.throws(() => parseAdminMetricReviewHistory({ ...sample, items: [{ ...sample.items[0], status: "pending" }] }));
  assert.throws(() => parseAdminMetricReviewHistory({ ...sample, next_cursor: { id: "", reviewed_at: "bad" } }));
});

test("history parser never returns unsafe evidence links", () => {
  const unsafe = { ...sample, items: [{ ...sample.items[0], evidence_url: "javascript:alert(1)" }] };
  assert.equal(parseAdminMetricReviewHistory(unsafe).items[0].evidenceUrl, null);
  const credentialed = { ...sample, items: [{ ...sample.items[0], evidence_url: "https://user:pass@example.com/private" }] };
  assert.equal(parseAdminMetricReviewHistory(credentialed).items[0].evidenceUrl, null);
});

test("admin history RPC is invoker-security, role-gated, bounded and keyset-paginated", () => {
  assert.match(migration, /security invoker[\s\S]*set search_path = ''/i);
  assert.match(migration, /p\.role = 'admin'/i);
  assert.match(migration, /p_page_size < 1 or p_page_size > 50/i);
  assert.match(migration, /pg_catalog\.pg_advisory_xact_lock|\(mv\.reviewed_at, mv\.id\) < \(p_before_reviewed_at, p_before_id\)/i);
  assert.match(migration, /limit \(p_page_size \+ 1\)/i);
  assert.match(migration, /metric_verifications_review_history_idx/i);
  assert.match(migration, /grant execute on function public\.get_admin_metric_review_history[\s\S]*to authenticated/i);
});

test("history response deliberately excludes creator and reviewer identifiers", () => {
  assert.doesNotMatch(migration, /creator_id|reviewed_by/i);
  assert.match(migration, /campaign_name/);
  assert.match(migration, /review_note/);
  assert.match(migration, /'status', v\.status/i);
});

test("admin review page uses the dedicated history component and RPC adapter", () => {
  assert.match(page, /AdminMetricReviewHistory/);
  assert.match(component, /loadAdminMetricReviewHistory/);
  assert.match(component, /Load older decisions/);
  assert.match(component, /No completed manual CPM evidence reviews yet/);
  assert.match(client, /get_admin_metric_review_history/);
  assert.doesNotMatch(component, /\.from\(["']metric_verifications/);
});

test("SQL assertions cover admin RLS, function grants, invoker security and identity minimization", () => {
  assert.match(sqlAssertions, /participants read metric verifications/i);
  assert.match(sqlAssertions, /has_function_privilege\('authenticated'/i);
  assert.match(sqlAssertions, /has_function_privilege\('anon'/i);
  assert.match(sqlAssertions, /pg_get_functiondef/i);
  assert.match(sqlAssertions, /reviewed_by/i);
});
