import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseWithdrawalPayoutResult } from "../lib/admin-withdrawals.mjs";

const migrationPath = new URL(
  "../supabase/migrations/20261119062000_adbridge_record_creator_withdrawal_payout.sql",
  import.meta.url,
);
const adminHelperPath = new URL("../lib/admin-withdrawals.ts", import.meta.url);
const adminPagePath = new URL("../app/admin/withdrawals/page.tsx", import.meta.url);
const creatorPagePath = new URL("../app/creator/earnings/page.tsx", import.meta.url);

test("payout parser accepts only the exact server-confirmed withdrawal and transfer reference", () => {
  const parsed = parseWithdrawalPayoutResult(
    {
      success: true,
      withdrawal_id: "withdrawal-1",
      amount: "2500.50",
      status: "paid",
      payout_reference: "TRF-123456",
      paid_at: "2026-11-19T06:20:00.000Z",
      unchanged: false,
    },
    "withdrawal-1",
    "TRF-123456",
  );

  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.data, {
    withdrawalId: "withdrawal-1",
    amount: 2500.5,
    status: "paid",
    payoutReference: "TRF-123456",
    paidAt: "2026-11-19T06:20:00.000Z",
    unchanged: false,
  });
});

test("payout parser rejects mismatched ids, references, statuses, amounts and timestamps", () => {
  const valid = {
    success: true,
    withdrawal_id: "withdrawal-1",
    amount: 2500,
    status: "paid",
    payout_reference: "TRF-123456",
    paid_at: "2026-11-19T06:20:00.000Z",
    unchanged: true,
  };

  assert.equal(parseWithdrawalPayoutResult(null, "withdrawal-1", "TRF-123456").data, null);
  assert.equal(parseWithdrawalPayoutResult({ ...valid, withdrawal_id: "other" }, "withdrawal-1", "TRF-123456").data, null);
  assert.equal(parseWithdrawalPayoutResult({ ...valid, status: "approved" }, "withdrawal-1", "TRF-123456").data, null);
  assert.equal(parseWithdrawalPayoutResult({ ...valid, payout_reference: "OTHER" }, "withdrawal-1", "TRF-123456").data, null);
  assert.equal(parseWithdrawalPayoutResult({ ...valid, amount: "Infinity" }, "withdrawal-1", "TRF-123456").data, null);
  assert.equal(parseWithdrawalPayoutResult({ ...valid, paid_at: "not-a-date" }, "withdrawal-1", "TRF-123456").data, null);
  assert.equal(parseWithdrawalPayoutResult({ ...valid, unchanged: 1 }, "withdrawal-1", "TRF-123456").data, null);
  const caseInsensitiveRetry = parseWithdrawalPayoutResult(
    { ...valid, payout_reference: "trf-123456" },
    "withdrawal-1",
    "TRF-123456",
  );
  assert.equal(caseInsensitiveRetry.error, null);
  assert.equal(caseInsensitiveRetry.data.unchanged, true);
});

test("payout recording is administrator-only, row-locked, approved-only and idempotent", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /add column if not exists paid_by uuid/i);
  assert.match(sql, /add column if not exists paid_at timestamptz/i);
  assert.match(sql, /add column if not exists payout_reference text/i);
  assert.match(sql, /create unique index if not exists creator_withdrawals_payout_reference_unique/i);
  assert.match(sql, /create or replace function adbridge_private\.record_creator_withdrawal_payout\(\s*p_withdrawal_id uuid,\s*p_payout_reference text\s*\)/i);
  assert.match(sql, /security definer\s+set search_path = ''/i);
  assert.match(sql, /v_admin_id uuid := \(select auth\.uid\(\)\)/i);
  assert.match(sql, /v_admin_role is distinct from 'admin'/i);
  assert.match(sql, /from public\.creator_withdrawals w[\s\S]*for update/i);
  assert.match(sql, /v_current_status = 'paid'[\s\S]*v_current_reference[\s\S]*unchanged', true/i);
  assert.match(sql, /v_current_status is distinct from 'approved'/i);
  assert.match(sql, /set status = 'paid',[\s\S]*paid_by = v_admin_id,[\s\S]*paid_at = pg_catalog\.now\(\),[\s\S]*payout_reference = v_reference/i);
  assert.match(sql, /insert into public\.notifications \(user_id, title, body, kind, link\)/i);
  assert.match(sql, /not independently verified by your bank or payment provider/i);
  assert.match(sql, /create or replace function public\.record_creator_withdrawal_payout[\s\S]*language sql\s+security invoker\s+set search_path = ''[\s\S]*adbridge_private\.record_creator_withdrawal_payout/i);
  assert.match(sql, /revoke all on function public\.record_creator_withdrawal_payout\(uuid, text\)[\s\S]*from public, anon, authenticated[\s\S]*grant execute on function public\.record_creator_withdrawal_payout\(uuid, text\)\s+to authenticated/i);
});

test("admin and creator screens use the payout RPC and disclose the manual verification boundary", async () => {
  const [helper, admin, creator] = await Promise.all([
    readFile(adminHelperPath, "utf8"),
    readFile(adminPagePath, "utf8"),
    readFile(creatorPagePath, "utf8"),
  ]);

  assert.match(helper, /rpc\("record_creator_withdrawal_payout"/);
  assert.match(admin, /recordCreatorWithdrawalPayout\(/);
  assert.match(admin, /Bank or transfer reference \(required/);
  assert.match(admin, /Record payout sent/);
  assert.match(admin, /not independent bank verification/i);
  assert.match(creator, /paid_at,payout_reference/);
  assert.match(creator, /summary\.paidWithdrawals/);
  assert.match(creator, /does not independently verify bank settlement/i);
  assert.doesNotMatch(admin, /\.from\("creator_withdrawals"\)\s*\.update\(/);
});
