import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page=readFileSync(new URL("../app/advertiser/budget/page.tsx",import.meta.url),"utf8");

test("advertiser budget page reads campaign and payment ledgers without writing financial state",()=>{
  assert.match(page,/from\("campaigns"\)/);
  assert.match(page,/from\("campaign_payments"\)/);
  assert.match(page,/confirmedStatuses = \["held", "released"\]/);
  assert.match(page,/committedStatuses = \["pending", "held", "released"\]/);
  assert.match(page,/confirmed - refunded - committed/);
  assert.match(page,/Planned budget is not treated as funded money/i);
  assert.doesNotMatch(page,/from\("campaign_payments"\)\s*\.(insert|update|delete)/);
  assert.doesNotMatch(page,/from\("campaigns"\)\s*\.(insert|update|delete)/);
});
