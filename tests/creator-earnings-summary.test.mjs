import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseCreatorEarningsSummaryRows } from "../lib/creator-earnings.mjs";

const migrationPath = new URL(
  "../supabase/migrations/20261118062000_adbridge_creator_earnings_summary.sql",
  import.meta.url,
);
const payoutMigrationPath = new URL(
  "../supabase/migrations/20261119062000_adbridge_record_creator_withdrawal_payout.sql",
  import.meta.url,
);
const helperPath = new URL("../lib/creator-earnings.ts", import.meta.url);
const pagePath = new URL("../app/creator/earnings/page.tsx", import.meta.url);

test("creator earnings parser accepts server balances including completed withdrawals", () => {
  const parsed = parseCreatorEarningsSummaryRows([
    {
      released_earnings: "12500.50",
      pending_earnings: "2500.25",
      reserved_withdrawals: "1500.50",
      paid_withdrawals: "2500.00",
      available_balance: "8500.00",
      withdrawal_count: "3",
    },
  ]);

  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.data, {
    releasedEarnings: 12500.5,
    pendingEarnings: 2500.25,
    reservedWithdrawals: 1500.5,
    paidWithdrawals: 2500,
    availableBalance: 8500,
    withdrawalCount: 3,
  });
});

test("creator earnings parser rejects missing, negative, non-finite and inconsistent balances", () => {
  assert.equal(parseCreatorEarningsSummaryRows([]).data, null);
  assert.equal(parseCreatorEarningsSummaryRows({}).data, null);

  const base = {
    released_earnings: 1000,
    pending_earnings: 100,
    reserved_withdrawals: 200,
    paid_withdrawals: 100,
    available_balance: 700,
    withdrawal_count: 1,
  };

  for (const [field, value] of [
    ["released_earnings", -1],
    ["pending_earnings", "Infinity"],
    ["reserved_withdrawals", null],
    ["paid_withdrawals", -1],
    ["available_balance", "not-a-number"],
    ["withdrawal_count", 1.5],
  ]) {
    const result = parseCreatorEarningsSummaryRows([{ ...base, [field]: value }]);
    assert.equal(result.data, null, field);
    assert.ok(result.error instanceof Error, field);
  }

  const inconsistent = parseCreatorEarningsSummaryRows([
    { ...base, available_balance: 800 },
  ]);
  assert.equal(inconsistent.data, null);
  assert.match(inconsistent.error.message, /inconsistent/i);
});

test("withdrawal requests remain atomic and exclude amounts already recorded as paid", async () => {
  const sql = await readFile(payoutMigrationPath, "utf8");

  assert.match(sql, /create or replace function adbridge_private\.request_creator_withdrawal\(p_amount numeric\)/i);
  assert.match(sql, /security definer\s+set search_path = ''/i);
  assert.match(sql, /v_creator_id uuid := \(select auth\.uid\(\)\)/i);
  assert.match(sql, /p\.role = 'creator'/i);
  assert.match(sql, /pg_catalog\.pg_advisory_xact_lock/i);
  assert.match(sql, /cp\.type = 'creator_payment'[\s\S]*cp\.status = 'released'/i);
  assert.match(sql, /cw\.status in \('pending', 'approved', 'paid'\)/i);
  assert.match(sql, /round\(v_requested \* 100\) <> v_requested \* 100/i);
  assert.match(sql, /insert into public\.creator_withdrawals/i);
});

test("earnings summaries subtract paid withdrawals without breaking the old RPC signature", async () => {
  const sql = await readFile(payoutMigrationPath, "utf8");

  assert.match(sql, /create or replace function public\.get_my_creator_earnings_summary\(\)/i);
  assert.match(sql, /greatest\([\s\S]*pt\.released_earnings - wt\.reserved_withdrawals - wt\.paid_withdrawals/i);
  assert.match(sql, /create or replace function public\.get_my_creator_earnings_summary_v2\(\)/i);
  assert.match(sql, /paid_withdrawals numeric/i);
  assert.match(sql, /security invoker\s+set search_path = ''/i);
  assert.match(sql, /cw\.status = 'paid'/i);
  assert.match(sql, /revoke all on function public\.get_my_creator_earnings_summary_v2\(\)[\s\S]*from public, anon, authenticated[\s\S]*grant execute on function public\.get_my_creator_earnings_summary_v2\(\)\s+to authenticated/i);
});

test("creator earnings UI reads the versioned server summary and displays paid transfer references", async () => {
  const [helper, page] = await Promise.all([
    readFile(helperPath, "utf8"),
    readFile(pagePath, "utf8"),
  ]);

  assert.match(helper, /rpc\("get_my_creator_earnings_summary_v2"\)/);
  assert.match(page, /loadMyCreatorEarningsSummary\(\)/);
  assert.match(page, /summary\.availableBalance/);
  assert.match(page, /summary\.pendingEarnings/);
  assert.match(page, /summary\.reservedWithdrawals/);
  assert.match(page, /summary\.paidWithdrawals/);
  assert.match(page, /rpc\("request_creator_withdrawal"/);
  assert.match(page, /result\.status !== "pending"/);
  assert.match(page, /paid_at,payout_reference/);
  assert.doesNotMatch(page, /useMemo|\.reduce\(/);
});
