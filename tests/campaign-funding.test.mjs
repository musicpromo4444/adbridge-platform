import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(path)=>readFileSync(new URL(path,import.meta.url),"utf8");
const start=read("../supabase/functions/start-campaign-payment/index.ts");
const verify=read("../supabase/functions/verify-campaign-payment/index.ts");
const fundPage=read("../app/advertiser/fund/fund-client.tsx");
const config=read("../supabase/config.toml");
const workflow=read("../.github/workflows/build.yml");

test("start function derives advertiser and amount from the owned draft campaign",()=>{
  assert.match(start,/auth\.getUser\(token\)/);
  assert.match(start,/eq\("advertiser_id",user\.id\)/);
  assert.match(start,/c\.status!=="draft"/);
  assert.match(start,/Number\(c\.funded_amount\|\|0\)>0/);
  assert.match(start,/const amount=Number\(c\.max_budget\|\|0\)/);
  assert.match(start,/amount:Math\.round\(amount\*100\)/);
  assert.match(start,/type:"funding",status:"pending",provider:"paystack"/);
  assert.match(start,/checkout_url:data\.data\.authorization_url/);
  assert.match(start,/pendingPayment\?\.checkout_url/);
  assert.doesNotMatch(start,/body\.amount|body\.max_budget/);
});

test("verification checks the exact saved reference, currency, amount and campaign owner",()=>{
  assert.match(verify,/auth\.getUser\(\)/);
  assert.match(verify,/eq\("advertiser_id",authData\.user\.id\)/);
  assert.match(verify,/eq\("provider_reference",reference\)/);
  assert.match(verify,/pending\.status!=="pending"/);
  assert.match(verify,/result\?\.data\?\.status !== "success"/);
  assert.match(verify,/currency\|\| ""\)\.toUpperCase\(\) !== "NGN"/);
  assert.match(verify,/paidAmount/);
  assert.match(verify,/rpc\("confirm_campaign_funding"/);
  assert.doesNotMatch(verify,/from\("campaign_payments"\)\.(insert|update)/);
  assert.doesNotMatch(verify,/from\("campaigns"\)\.update/);
});

test("funding frontend starts checkout through the Edge Function and verifies returned references",()=>{
  assert.match(fundPage,/start-campaign-payment/);
  assert.match(fundPage,/verify-campaign-payment/);
  assert.match(fundPage,/authorization_url/);
  assert.match(fundPage,/checkout\.paystack\.com/);
});

test("payment Edge Functions require JWTs and are included in Deno CI",()=>{
  assert.match(config,/\[functions\.start-campaign-payment\]\s*verify_jwt = true/i);
  assert.match(config,/\[functions\.verify-campaign-payment\]\s*verify_jwt = true/i);
  assert.match(workflow,/supabase\/functions\/start-campaign-payment\/index\.ts/);
  assert.match(workflow,/supabase\/functions\/verify-campaign-payment\/index\.ts/);
});
