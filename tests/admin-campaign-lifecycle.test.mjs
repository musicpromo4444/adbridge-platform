import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseAdminCampaignBudgetReconciliation,
  parseAdminCampaignLifecycleOverview
} from "../lib/admin-campaign-lifecycle.mjs";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const migration = await read("../supabase/migrations/20261122063500_adbridge_admin_campaign_lifecycle_overview.sql");
const sqlTest = await read("../supabase/tests/admin_campaign_lifecycle_overview.sql");
const page = await read("../app/admin/campaign-lifecycle/page.tsx");
const adminHome = await read("../app/admin/page.tsx");
const reconciliationMigration = await read("../supabase/migrations/20261122171700_adbridge_admin_campaign_budget_reconciliation.sql");
const reconciliationSqlTest = await read("../supabase/tests/admin_campaign_budget_reconciliation.sql");
const reconciliationAdapter = await read("../lib/admin-campaign-lifecycle.ts");

function payload(overrides = {}) {
  return {
    ok: true,
    generated_at: "2026-11-22T05:30:00.000Z",
    summary: {
      total: 1, draft: 0, funded: 0, active: 1, paused: 0,
      completed: 0, closed: 0, cancelled: 0, needs_reconciliation: 0
    },
    campaigns: [{
      id: "campaign-1",
      name: "Test campaign",
      goal: "Verified traffic",
      platform: "website",
      payment_method: "cpc",
      payment_rate: 5,
      max_budget: 1000,
      funded_amount: 1000,
      committed_spend: 100,
      remaining_funded_budget: 900,
      desired_results: 100,
      status: "active",
      completion_reason: null,
      completed_at: null,
      created_at: "2026-11-21T10:00:00.000Z",
      required_next_result: 5,
      can_fund_next_result: true,
      needs_reconciliation: false
    }],
    truncated: false,
    ...overrides
  };
}

test("parses a valid admin lifecycle response and preserves ledger-derived values", () => {
  const result = parseAdminCampaignLifecycleOverview(payload());
  assert.equal(result.summary.active, 1);
  assert.equal(result.campaigns[0].committed_spend, 100);
  assert.equal(result.campaigns[0].remaining_funded_budget, 900);
  assert.equal(result.campaigns[0].can_fund_next_result, true);
});

test("rejects unsuccessful or incomplete lifecycle responses", () => {
  assert.throws(() => parseAdminCampaignLifecycleOverview({ ...payload(), ok: false }));
  assert.throws(() => parseAdminCampaignLifecycleOverview({ ...payload(), campaigns: null }));
});

test("rejects invalid statuses and negative financial values", () => {
  const invalidStatus = payload();
  invalidStatus.campaigns[0].status = "unknown";
  assert.throws(() => parseAdminCampaignLifecycleOverview(invalidStatus));

  const negativeBalance = payload();
  negativeBalance.campaigns[0].remaining_funded_budget = -1;
  assert.throws(() => parseAdminCampaignLifecycleOverview(negativeBalance));
});

test("rejects malformed completion timestamps and reconciliation flags", () => {
  const invalidDate = payload();
  invalidDate.campaigns[0].completed_at = "not-a-date";
  assert.throws(() => parseAdminCampaignLifecycleOverview(invalidDate));

  const invalidFlag = payload();
  invalidFlag.campaigns[0].needs_reconciliation = "false";
  assert.throws(() => parseAdminCampaignLifecycleOverview(invalidFlag));
});

test("admin RPC is invoker-secured, admin-gated and explicitly granted", () => {
  assert.match(migration, /security invoker/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /p\.role = 'admin'/i);
  assert.match(migration, /revoke all on function public\.admin_campaign_lifecycle_overview\(text, integer\)[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.admin_campaign_lifecycle_overview\(text, integer\)[\s\S]*to authenticated/i);
  assert.match(sqlTest, /has_function_privilege\([\s\S]*'anon'/i);
  assert.match(sqlTest, /v_security_definer/i);
});

test("budget calculations match the campaign completion ledger contract", () => {
  assert.match(migration, /cp\.type = 'creator_payment'/i);
  assert.match(migration, /cp\.status in \('pending', 'held', 'released'\)/i);
  assert.match(migration, /least\([\s\S]*c\.max_budget[\s\S]*c\.funded_amount/i);
  assert.match(migration, /'cpc', 'link_traffic', 'cpi', 'cpa', 'actions'/i);
  assert.match(migration, /when lower\(coalesce\(c\.payment_method, ''\)\) = 'cpm' then 0\.01/i);
});

test("lifecycle response does not expose advertiser or creator identifiers", () => {
  assert.doesNotMatch(migration, /advertiser_id|creator_id/i);
  assert.match(migration, /'remaining_funded_budget'/);
  assert.match(migration, /'completion_reason'/);
});

test("admin lifecycle page uses the typed RPC and never queries financial tables directly", () => {
  assert.match(page, /loadAdminCampaignLifecycleOverview/);
  assert.match(page, /completionReasonLabel/);
  assert.match(page, /needs_reconciliation/);
  assert.doesNotMatch(page, /\.from\(["']campaigns["']\)|\.from\(["']campaign_payments["']\)/);
  assert.match(adminHome, /href="\/admin\/campaign-lifecycle"/);
});


function reconciliationPayload(overrides = {}) {
  return {
    ok: true,
    changed: true,
    outcome: "completed",
    status: "completed",
    completion_reason: "budget_exhausted",
    completed_at: "2026-11-22T09:00:00.000Z",
    remaining_funded_budget: 3,
    required_next_result: 5,
    ...overrides
  };
}

test("parses a confirmed budget-exhausted reconciliation result", () => {
  const result = parseAdminCampaignBudgetReconciliation(reconciliationPayload());
  assert.equal(result.changed, true);
  assert.equal(result.outcome, "completed");
  assert.equal(result.status, "completed");
  assert.equal(result.completion_reason, "budget_exhausted");
  assert.equal(result.remaining_funded_budget, 3);
});

test("parses a safe no-change result when the locked ledger can still fund another result", () => {
  const result = parseAdminCampaignBudgetReconciliation(reconciliationPayload({
    changed: false,
    outcome: "not_exhausted",
    status: "active",
    completion_reason: null,
    completed_at: null,
    remaining_funded_budget: 10
  }));
  assert.equal(result.changed, false);
  assert.equal(result.outcome, "not_exhausted");
  assert.equal(result.status, "active");
});

test("rejects malformed or contradictory reconciliation responses", () => {
  assert.throws(() => parseAdminCampaignBudgetReconciliation({ ok: false }));
  assert.throws(() => parseAdminCampaignBudgetReconciliation(reconciliationPayload({ changed: "true" })));
  assert.throws(() => parseAdminCampaignBudgetReconciliation(reconciliationPayload({ outcome: "paid" })));
  assert.throws(() => parseAdminCampaignBudgetReconciliation(reconciliationPayload({ status: "unknown" })));
  assert.throws(() => parseAdminCampaignBudgetReconciliation(reconciliationPayload({ remaining_funded_budget: -1 })));
  assert.throws(() => parseAdminCampaignBudgetReconciliation(reconciliationPayload({ completion_reason: "manual" })));
  assert.throws(() => parseAdminCampaignBudgetReconciliation(reconciliationPayload({ completed_at: null })));
});

test("admin reconciliation RPC locks the campaign and rechecks only committed creator-payment rows", () => {
  assert.match(reconciliationMigration, /security definer/i);
  assert.match(reconciliationMigration, /set search_path = ''/i);
  assert.match(reconciliationMigration, /p\.role = 'admin'/i);
  assert.match(reconciliationMigration, /from public\.campaigns c[\s\S]*for update/i);
  assert.match(reconciliationMigration, /cp\.type = 'creator_payment'/i);
  assert.match(reconciliationMigration, /cp\.status in \('pending', 'held', 'released'\)/i);
  assert.match(reconciliationMigration, /v_remaining < v_required/i);
  assert.match(reconciliationMigration, /completion_reason = 'budget_exhausted'/i);
  assert.match(reconciliationMigration, /grant execute on function public\.admin_reconcile_campaign_budget\(uuid\)[\s\S]*to authenticated/i);
  assert.match(reconciliationMigration, /revoke all on function public\.admin_reconcile_campaign_budget\(uuid\)[\s\S]*from public, anon, authenticated/i);
  assert.match(reconciliationSqlTest, /has_function_privilege\([\s\S]*'anon'/i);
  assert.match(reconciliationSqlTest, /campaign_completion_notification/i);
});

test("admin UI requires explicit confirmation and only offers reconciliation for flagged campaigns", () => {
  assert.match(page, /window\.confirm/);
  assert.match(page, /row\.needs_reconciliation/);
  assert.match(page, /reconcileAdminCampaignBudget\(row\.id\)/);
  assert.match(page, /await load\(\)/);
  assert.match(page, /does not approve payments or release creator earnings/i);
  assert.doesNotMatch(page, /\.from\(["']campaigns["']\)|\.from\(["']campaign_payments["']\)/);
  assert.match(reconciliationAdapter, /supabase\.rpc\(["']admin_reconcile_campaign_budget["']/);
});
