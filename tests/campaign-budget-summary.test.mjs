import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseCampaignBudgetSummaryRows } from "../lib/campaign-budget.mjs";

const migrationPath = new URL(
  "../supabase/migrations/20261117060000_adbridge_advertiser_budget_summary.sql",
  import.meta.url,
);
const helperPath = new URL("../lib/campaign-budget.ts", import.meta.url);
const pagePath = new URL("../app/advertiser/campaigns/page.tsx", import.meta.url);

test("campaign budget parser accepts ledger amounts and preserves decimal precision", () => {
  const parsed = parseCampaignBudgetSummaryRows([
    {
      campaign_id: "campaign-1",
      campaign_name: "Launch",
      campaign_status: "active",
      max_budget: "15000.00",
      held_funding: "15000",
      committed_spend: "4250.75",
      remaining_budget: "10749.25",
    },
  ]);

  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.data, [
    {
      campaignId: "campaign-1",
      campaignName: "Launch",
      campaignStatus: "active",
      maxBudget: 15000,
      heldFunding: 15000,
      committedSpend: 4250.75,
      remainingBudget: 10749.25,
    },
  ]);
});

test("campaign budget parser accepts an empty result and rejects unsafe balances", () => {
  assert.deepEqual(parseCampaignBudgetSummaryRows({}).data, null);
  assert.deepEqual(parseCampaignBudgetSummaryRows([]), { data: [], error: null });

  for (const invalidAmount of [-1, "Infinity", "", null, "not-a-number"]) {
    const result = parseCampaignBudgetSummaryRows([
      {
        campaign_id: "campaign-1",
        campaign_name: "Launch",
        campaign_status: "active",
        max_budget: 15000,
        held_funding: 15000,
        committed_spend: 0,
        remaining_budget: invalidAmount,
      },
    ]);
    assert.equal(result.data, null);
    assert.ok(result.error instanceof Error);
  }
});

test("budget RPC is advertiser-scoped and follows the payout ledger states", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /create or replace function adbridge_private\.get_my_campaign_budget_summary\(\)/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /select auth\.uid\(\)/i);
  assert.match(sql, /coalesce\(v_actor_role, ''\) <> 'advertiser'/i);
  assert.match(sql, /where c\.advertiser_id = v_actor_id/i);
  assert.match(sql, /cp\.type = 'funding'[\s\S]*cp\.status = 'held'/i);
  assert.match(
    sql,
    /cp\.type = 'creator_payment'[\s\S]*cp\.status in \('released', 'approved', 'pending'\)/i,
  );
  assert.match(sql, /least\(\s*coalesce\(c\.max_budget, 0\),\s*funding\.amount/i);
  assert.match(sql, /greatest\([\s\S]*spend\.amount/i);
});

test("only authenticated users can execute the aggregate RPC; no ledger table grants are widened", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(
    sql,
    /revoke all on function adbridge_private\.get_my_campaign_budget_summary\(\)\s+from public, anon, authenticated/i,
  );
  assert.match(
    sql,
    /grant execute on function adbridge_private\.get_my_campaign_budget_summary\(\)\s+to authenticated/i,
  );
  assert.match(sql, /language sql\s+stable\s+security invoker\s+set search_path = ''[\s\S]*adbridge_private\.get_my_campaign_budget_summary/i);
  assert.match(
    sql,
    /revoke all on function public\.get_my_campaign_budget_summary\(\)\s+from public, anon, authenticated/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.get_my_campaign_budget_summary\(\)\s+to authenticated/i,
  );
  assert.doesNotMatch(sql, /grant\s+[^;]+\s+on table public\.(campaigns|campaign_payments)/i);
});

test("advertiser campaign page displays balances returned by the RPC, not browser ledger reads", async () => {
  const [helper, page] = await Promise.all([
    readFile(helperPath, "utf8"),
    readFile(pagePath, "utf8"),
  ]);

  assert.match(helper, /rpc\("get_my_campaign_budget_summary"\)/);
  assert.match(page, /loadMyCampaignBudgetSummary\(\)/);
  assert.match(page, /Confirmed held funding/);
  assert.match(page, /Committed creator payments/);
  assert.match(page, /Remaining funded budget/);
  assert.doesNotMatch(page, /from\("campaign_payments"\)/);
});
