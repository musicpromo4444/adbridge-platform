import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const migration = await read("../supabase/migrations/20261121175000_adbridge_campaign_budget_completion_and_notifications.sql");
const advertiserPage = await read("../app/advertiser/campaigns/page.tsx");
const creatorPage = await read("../app/creator/work/page.tsx");
const notificationPage = await read("../app/notifications/page.tsx");
const publisherPage = await read("../app/publisher/page.tsx");
const lifecycleTypes = await read("../lib/campaign-lifecycle.ts");

test("campaign completion metadata is persisted", () => {
  assert.match(migration, /add column if not exists completion_reason text/i);
  assert.match(migration, /add column if not exists completed_at timestamptz/i);
  assert.match(advertiserPage, /completion_reason,completed_at/);
});

test("committed spend counts creator-payment ledger rows only", () => {
  assert.match(migration, /cp\.type = 'creator_payment'/);
  assert.match(migration, /cp\.status in \('pending', 'held', 'released'\)/);
  assert.match(migration, /least\([\s\S]*new\.max_budget[\s\S]*new\.funded_amount/i);
});

test("fixed-price campaigns stop when another payable result cannot be funded", () => {
  assert.match(migration, /'cpc', 'link_traffic', 'cpi', 'cpa', 'actions'/);
  assert.match(migration, /v_remaining < v_required/);
});

test("CPM retains partial-cent-aware budget handling", () => {
  assert.match(migration, /v_remaining < 0\.01/);
  assert.match(migration, /CPM can consume a final partial amount/i);
});

test("all payable activity paths trigger campaign budget reconciliation", () => {
  for (const trigger of [
    "campaign_budget_after_creator_payment",
    "campaign_budget_after_tracking_click",
    "campaign_budget_after_conversion",
    "campaign_budget_after_publisher_event",
    "campaign_budget_after_verified_submission_metric"
  ]) {
    assert.ok(migration.includes(trigger), "missing trigger " + trigger);
  }
  assert.match(migration, /private\.reconcile_campaign_budget_completion/);
});

test("completed campaigns are terminal and cannot be reactivated without payable budget", () => {
  assert.match(migration, /completed campaigns cannot be reactivated or reopened/i);
  assert.match(migration, /campaign budget cannot fund another payable result/i);
  assert.match(migration, /before update of status on public\.campaigns/i);
});

test("shared notifications are owner-scoped and only read state is client-updatable", () => {
  assert.match(migration, /create table if not exists public\.notifications/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /grant update \(is_read\)[\s\S]*to authenticated/i);
  assert.match(migration, /grant insert on table public\.notifications to service_role/i);
  assert.match(migration, /using \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(migration, /revoke all on table public\.notifications from public, anon, authenticated/i);
  assert.match(migration, /on conflict \(campaign_id, user_id, kind\)/i);
});

test("frontend exposes completion reason and uses the shared notification inbox", () => {
  assert.match(advertiserPage, /completionReasonLabel/);
  assert.match(creatorPage, /completionReasonSummary/);
  assert.doesNotMatch(creatorPage, /Completed and paid\./i);
  assert.match(creatorPage, /campaign\?\.status === "completed" \?/);
  assert.match(notificationPage, /from\("notifications"\)/);
  assert.match(publisherPage, /href="\/notifications"/);
  assert.match(notificationPage, /update\(\{ is_read: true \}\)/);
  assert.match(lifecycleTypes, /budget_exhausted/);
  assert.match(lifecycleTypes, /target_reached/);
});
