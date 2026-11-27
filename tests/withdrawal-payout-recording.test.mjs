import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const admin=readFileSync(new URL("../app/admin/withdrawals/page.tsx",import.meta.url),"utf8");
const creator=readFileSync(new URL("../app/creator/earnings/page.tsx",import.meta.url),"utf8");

test("admin records an external transfer reference only after confirmation",()=>{
  assert.match(admin,/admin_update_creator_withdrawal/);
  assert.match(admin,/p_payment_reference/);
  assert.match(admin,/status==="paid"/);
  assert.match(admin,/external transfer has actually been completed/i);
  assert.doesNotMatch(admin,/from\("creator_withdrawals"\)\s*\.update/);
});

test("creator history displays the recorded payout time and transfer reference without claiming bank verification",()=>{
  assert.match(creator,/paid_at,payment_reference/);
  assert.match(creator,/w\.paid_at/);
  assert.match(creator,/w\.payment_reference/);
  assert.match(creator,/not independent bank verification/i);
});
