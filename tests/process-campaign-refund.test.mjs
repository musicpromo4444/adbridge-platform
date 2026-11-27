import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../supabase/functions/process-campaign-refund/index.ts", import.meta.url), "utf8");

test("refund endpoint rejects missing profiles and non-admin/non-advertiser roles before refund lookup", () => {
  assert.match(source, /const role=profile\?\.role/);
  assert.match(source, /if\(role!=="admin"&&role!=="advertiser"\) return json/);
  assert.ok(source.indexOf("if(role!==\"admin\"&&role!==\"advertiser\")") < source.indexOf("from(\"campaign_payments\")"));
});

test("refund ownership check safely handles object and array relationship shapes", () => {
  assert.match(source, /Array\.isArray\(campaignRelation\)\?campaignRelation\[0\]:campaignRelation/);
  assert.match(source, /campaignAdvertiserId!==auth\.user\.id/);
});

test("non-admin refund requests remain bound to the authenticated advertiser", () => {
  assert.match(source, /if\(role!=="admin"&&campaignAdvertiserId!==auth\.user\.id\)/);
  assert.match(source, /You do not own this campaign refund/);
});
