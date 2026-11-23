import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  normalizeManualMetricInput,
  parseManualMetricEvidenceResult,
  parseManualMetricReviewResult,
} from "../lib/manual-metric-review.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const migration = await read("../supabase/migrations/20261123060000_adbridge_secure_manual_metric_review.sql");
const edge = await read("../supabase/functions/review-manual-metric/index.ts");
const adminPage = await read("../app/admin/review/page.tsx");
const creatorPage = await read("../app/creator/submit/submit-client.tsx");
const notificationPage = await read("../app/notifications/page.tsx");
const sqlAssertions = await read("../supabase/tests/manual_metric_review.sql");
const config = await read("../supabase/config.toml");

test("manual metric input accepts only safe whole-number counts and HTTP(S) evidence", () => {
  assert.deepEqual(normalizeManualMetricInput("1,250", "https://example.com/insights"), {
    claimedMetric: 1250,
    evidenceUrl: "https://example.com/insights",
  });
  assert.throws(() => normalizeManualMetricInput("12.5", "https://example.com"));
  assert.throws(() => normalizeManualMetricInput("-1", "https://example.com"));
  assert.throws(() => normalizeManualMetricInput("10", "javascript:alert(1)"));
});

test("creator evidence RPC is invoker-security, owner-scoped and idempotent", () => {
  assert.match(migration, /function public\.submit_manual_metric_evidence/i);
  assert.match(migration, /security invoker[\s\S]*set search_path = ''/i);
  assert.match(migration, /s\.creator_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /manual metric evidence is already awaiting review/i);
  assert.match(migration, /v_existing_metric = p_claimed_metric/);
  assert.match(migration, /grant execute on function public\.submit_manual_metric_evidence[\s\S]*to authenticated/i);
});

test("creators can insert evidence fields only; browser review updates are revoked", () => {
  assert.match(migration, /revoke all on table public\.metric_verifications from public, anon, authenticated/i);
  assert.match(migration, /grant insert \(submission_id, evidence_url, claimed_metric, note\)/i);
  assert.match(migration, /drop policy if exists "admin update metric verifications"/i);
  assert.doesNotMatch(adminPage, /\.from\("metric_verifications"\)\s*\.update/);
});

test("administrator review RPC is service-role-only, invoker-security and row-locked", () => {
  assert.match(migration, /function public\.admin_review_manual_metric_verification/i);
  assert.match(migration, /security invoker[\s\S]*set search_path = ''/i);
  assert.match(migration, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/i);
  assert.match(migration, /p\.role = 'admin'/i);
  assert.match(migration, /from public\.metric_verifications mv[\s\S]*for update/i);
  assert.match(migration, /from public\.submissions s[\s\S]*for update/i);
  assert.match(migration, /from public\.campaigns c[\s\S]*for update/i);
  assert.match(migration, /grant execute on function public\.admin_review_manual_metric_verification[\s\S]*to service_role/i);
});

test("approved evidence updates verified metrics before invoking the budget-gated CPM payout", () => {
  const verifiedAt = migration.indexOf("metric_status = 'verified'");
  const payoutAt = migration.indexOf("v_payout := public.release_cpm_submission_payment(v_submission.id)");
  assert.ok(verifiedAt >= 0 && payoutAt > verifiedAt);
  assert.match(migration, /greatest\(coalesce\(current_metric, 0\), v_metric\.claimed_metric\)/i);
  assert.match(migration, /No payment was released in this review/i);
  assert.match(migration, /available funded budget/i);
});

test("rejected evidence requires a reason and does not invoke the payout branch", () => {
  assert.match(migration, /v_decision = 'rejected' and v_review_note is null/i);
  assert.match(migration, /status = 'rejected'[\s\S]*review_note = v_review_note/i);
  assert.match(migration, /metric_evidence_rejected/i);
});

test("creator notifications are idempotent and owner-readable with read-state-only updates", () => {
  assert.match(migration, /create table if not exists public\.notifications/i);
  assert.match(migration, /notifications_metric_verification_once/i);
  assert.match(migration, /on conflict do nothing/i);
  assert.match(migration, /notifications_owner_select/i);
  assert.match(migration, /grant update \(is_read\)[\s\S]*to authenticated/i);
  assert.match(notificationPage, /from\("notifications"\)/);
  assert.match(notificationPage, /update\(\{is_read:true\}\)/);
});

test("Edge Function revalidates the user and administrator role before using service credentials", () => {
  assert.match(edge, /db\.auth\.getUser\(bearer\)/);
  assert.match(edge, /actor\?\.role !== "admin"/);
  assert.match(edge, /db\.rpc\("admin_review_manual_metric_verification"/);
  assert.match(edge, /p_reviewed_by: authData\.user\.id/);
  assert.doesNotMatch(edge, /console\.log|SUPABASE_SERVICE_ROLE_KEY.*Response/i);
  assert.match(config, /\[functions\.review-manual-metric\]\s+verify_jwt = true/i);
});

test("admin review UI invokes the Edge Function and never updates review rows directly", () => {
  assert.match(adminPage, /reviewManualMetricEvidence/);
  assert.match(adminPage, /metric_verifications/);
  assert.match(adminPage, /Approve evidence/);
  assert.match(adminPage, /Reject evidence/);
  assert.doesNotMatch(adminPage, /approveMetric\(/);
  assert.doesNotMatch(adminPage, /\.from\("metric_verifications"\)\s*\.update/);
});

test("creator submission UI offers optional CPM evidence and a retry after a transient save failure", () => {
  assert.match(creatorPage, /Manual view evidence/);
  assert.match(creatorPage, /submitManualMetricEvidence/);
  assert.match(creatorPage, /Retry manual evidence/);
  assert.match(creatorPage, /manualMetricError/);
  assert.match(creatorPage, /retryMode/);
  assert.match(creatorPage, /Submit corrected evidence/);
  assert.match(migration, /creator\\/submit\\?submission=/);
});

test("manual metric evidence and review response parsers reject unconfirmed results", () => {
  assert.equal(parseManualMetricEvidenceResult({ ok: true, id: "metric-id", status: "pending" }).status, "pending");
  assert.throws(() => parseManualMetricEvidenceResult({ ok: false }));
  assert.equal(parseManualMetricReviewResult({ success: true, ok: true, decision: "approved", payout: { paid: false, reason: "target_not_reached" } }).decision, "approved");
  assert.throws(() => parseManualMetricReviewResult({ success: false, ok: true, decision: "approved" }));
});

test("SQL assertion script checks function grants, RLS, and read-state privileges", () => {
  assert.match(sqlAssertions, /has_table_privilege\('authenticated', 'public\.metric_verifications', 'UPDATE'\)/i);
  assert.match(sqlAssertions, /has_function_privilege\('service_role'/i);
  assert.match(sqlAssertions, /notifications_owner_read_state/i);
});
