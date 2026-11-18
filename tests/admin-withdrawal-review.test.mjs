import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseWithdrawalReviewResult } from "../lib/admin-withdrawals.mjs";

const migrationPath = new URL(
  "../supabase/migrations/20261118190000_adbridge_secure_admin_withdrawal_review.sql",
  import.meta.url,
);
const helperPath = new URL("../lib/admin-withdrawals.ts", import.meta.url);
const pagePath = new URL("../app/admin/withdrawals/page.tsx", import.meta.url);

test("withdrawal review parser accepts only the exact server-confirmed decision", () => {
  const parsed = parseWithdrawalReviewResult(
    {
      success: true,
      withdrawal_id: "withdrawal-1",
      amount: "2500.50",
      status: "approved",
      unchanged: false,
    },
    "withdrawal-1",
    "approved",
  );

  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.data, {
    withdrawalId: "withdrawal-1",
    amount: 2500.5,
    status: "approved",
    unchanged: false,
  });
});

test("withdrawal review parser rejects mismatched identity, status, amount and incomplete responses", () => {
  const valid = {
    success: true,
    withdrawal_id: "withdrawal-1",
    amount: 2500,
    status: "rejected",
    unchanged: true,
  };

  assert.equal(parseWithdrawalReviewResult(null, "withdrawal-1", "rejected").data, null);
  assert.equal(
    parseWithdrawalReviewResult({ ...valid, withdrawal_id: "other" }, "withdrawal-1", "rejected").data,
    null,
  );
  assert.equal(
    parseWithdrawalReviewResult({ ...valid, status: "approved" }, "withdrawal-1", "rejected").data,
    null,
  );
  assert.equal(
    parseWithdrawalReviewResult({ ...valid, amount: "Infinity" }, "withdrawal-1", "rejected").data,
    null,
  );
  assert.equal(
    parseWithdrawalReviewResult({ ...valid, amount: 0 }, "withdrawal-1", "rejected").data,
    null,
  );
  assert.equal(
    parseWithdrawalReviewResult({ ...valid, unchanged: "yes" }, "withdrawal-1", "rejected").data,
    null,
  );
});

test("admin withdrawal review is role-gated, row-locked and limited to pending decisions", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /add column if not exists reviewed_by uuid/i);
  assert.match(sql, /add column if not exists reviewed_at timestamptz/i);
  assert.match(sql, /add column if not exists admin_note text/i);
  assert.match(
    sql,
    /revoke update on table public\.creator_withdrawals from public, anon, authenticated/i,
  );
  assert.match(
    sql,
    /create or replace function adbridge_private\.review_creator_withdrawal\(\s*p_withdrawal_id uuid,\s*p_decision text,\s*p_admin_note text default null\\s*\\)/i,
  );
  assert.match(sql, /security definer\s+set search_path = ''/i);
  assert.match(sql, /v_admin_id uuid := \(select auth\.uid\(\)\)/i);
  assert.match(sql, /v_admin_role is distinct from 'admin'/i);
  assert.match(sql, /from public\.creator_withdrawals w[\s\S]*for update/i);
  assert.match(sql, /v_current_status is distinct from 'pending'/i);
  assert.match(sql, /pg_catalog\.pg_advisory_xact_lock[\s\S]*hashtextextended\(v_creator_id::text, 0\)/i);
  assert.match(sql, /set status = v_decision,[\s\S]*reviewed_by = v_admin_id,[\s\S]*reviewed_at = pg_catalog\.now\(\)/i);
  assert.match(sql, /insert into public\.notifications \(user_id, title, body, kind, link\)/i);
  assert.match(sql, /This is not confirmation that funds have been transferred/i);
  assert.match(
    sql,
    /create or replace function public\.review_creator_withdrawal[\s\S]*language sql\s+security invoker\s+set search_path = ''[\s\S]*adbridge_private\.review_creator_withdrawal/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.review_creator_withdrawal\(uuid, text, text\)[\s\S]*from public, anon, authenticated[\s\S]*grant execute on function public\.review_creator_withdrawal\(uuid, text, text\)\s+to authenticated/i,
  );
  assert.doesNotMatch(sql, /status\s*=\s*'paid'/i);
});

test("admin withdrawal UI uses the review RPC and never mutates status directly", async () => {
  const [helper, page] = await Promise.all([
    readFile(helperPath, "utf8"),
    readFile(pagePath, "utf8"),
  ]);

  assert.match(helper, /rpc\("review_creator_withdrawal"/);
  assert.match(page, /reviewCreatorWithdrawal\(/);
  assert.match(page, /profile\?\.role !== "admin"/);
  assert.match(page, /maxLength=\{500\}/);
  assert.match(page, /Approve for payout/);
  assert.match(page, /Reject and release reserve/);
  assert.match(page, /No bank transfer is recorded by this action/);
  assert.doesNotMatch(page, /\.from\("creator_withdrawals"\)\s*\.update\(/);
});
