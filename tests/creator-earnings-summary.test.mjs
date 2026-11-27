import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page=readFileSync(new URL("../app/creator/earnings/page.tsx",import.meta.url),"utf8");

test("creator earnings uses server summary and withdrawal request RPCs",()=>{
  assert.match(page,/rpc\("get_creator_earnings_summary"/);
  assert.match(page,/rpc\("request_creator_withdrawal"/);
  assert.match(page,/rpc\("mark_creator_withdrawal_notification_read"/);
  assert.match(page,/available_balance/);
  assert.match(page,/minimum_withdrawal_usd/);
  assert.doesNotMatch(page,/from\("creator_withdrawals"\)\s*\.(insert|update|delete)/);
});

test("creator sees payout audit details and notification read state",()=>{
  assert.match(page,/paid_at,payment_reference/);
  assert.match(page,/read_at/);
  assert.match(page,/markNoticeRead/);
});
