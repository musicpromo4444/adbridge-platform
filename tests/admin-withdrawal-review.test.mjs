import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page=readFileSync(new URL("../app/admin/withdrawals/page.tsx",import.meta.url),"utf8");

test("admin withdrawal actions use protected RPCs and preserve an audit trail",()=>{
  for(const rpc of ["admin_list_creator_withdrawals","admin_update_creator_withdrawal","admin_list_withdrawal_events","admin_list_withdrawal_payment_evidence","admin_add_withdrawal_payment_evidence"]) assert.ok(page.includes('rpc("'+rpc+'"'),"missing "+rpc);
  assert.match(page,/profile\?\.role !== "admin"|role !== "admin"/);
  assert.match(page,/paymentReference/);
  assert.match(page,/external transfer has actually been completed/i);
  assert.match(page,/createSignedUrl/);
  assert.doesNotMatch(page,/from\("creator_withdrawals"\)\s*\.update/);
});
