import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const migration = read("supabase/migrations/20261120175000_adbridge_atomic_verified_submission_metric_snapshots.sql");
const edgeFunction = read("supabase/functions/track-video-metrics/index.ts");
const client = read("lib/creator-metrics.ts");
const workPage = read("app/creator/work/page.tsx");

test("metric snapshot RPC is invoker-only, service-role-only and uses an empty search path", () => {
  assert.match(migration, /security invoker/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/i);
  assert.match(migration, /p_metric_value > 9007199254740991/);
  assert.match(migration, /grant usage on schema private to service_role/i);
  assert.match(migration, /revoke all on function public\.record_submission_metric_snapshot\([\s\S]*?from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.record_submission_metric_snapshot\([\s\S]*?to service_role/i);
  assert.doesNotMatch(migration, /security definer/i);
});

test("snapshot, submission summary and CPM payout are in one ordered transaction", () => {
  const insertAt = migration.indexOf("insert into public.submission_metrics");
  const updateAt = migration.indexOf("update public.submissions");
  const payoutAt = migration.indexOf("v_payout := public.release_cpm_submission_payment");
  assert.ok(insertAt >= 0, "immutable metric snapshot insert exists");
  assert.ok(updateAt > insertAt, "submission summary follows the snapshot insert");
  assert.ok(payoutAt > updateAt, "CPM payout follows the persisted snapshot and summary");
  assert.match(migration, /for update/i);
  assert.match(migration, /greatest\(coalesce\(v_submission\.current_metric, 0\), p_metric_value\)/i);
  assert.ok(migration.includes("metric_status = case\n           when v_reached then 'verified'\n           else 'tracking'"));
  assert.ok(migration.includes("metric_verified_at = case\n           when v_reached then coalesce(v_submission.metric_verified_at, v_checked_at)\n           else null"));
});

test("Edge Function validates provider counts and persists only through the atomic RPC", () => {
  assert.match(edgeFunction, /Number\.isSafeInteger\(views\)/);
  assert.match(edgeFunction, /db\.rpc\(\s*["']record_submission_metric_snapshot["']/);
  assert.match(edgeFunction, /No CPM payout was processed/);
  assert.doesNotMatch(edgeFunction, /\.from\(["']submission_metrics["']\)\s*\.insert/);
  assert.doesNotMatch(edgeFunction, /\.from\(["']submissions["']\)\s*\.update/);
});

test("creator work uses the authenticated metric endpoint and shows actual progress", () => {
  assert.match(workPage, /refreshCreatorSubmissionMetrics/);
  assert.match(workPage, /payment_method/);
  assert.match(workPage, /platform-reported views/i);
  assert.match(workPage, /submission\.current_metric/);
  assert.match(workPage, /submission\.target_metric/);
  assert.match(workPage, /Refresh platform metrics/);
});

test("typed metric client validates submission ids and RPC response before reporting success", () => {
  assert.match(client, /UUID_PATTERN\.test\(submissionId\)/);
  assert.match(client, /client\.functions\.invoke/);
  assert.match(client, /data\.success !== true/);
  assert.match(client, /Number\.isSafeInteger\(data\.views\)/);
  assert.match(client, /Number\.isSafeInteger\(data\.target\)/);
});
