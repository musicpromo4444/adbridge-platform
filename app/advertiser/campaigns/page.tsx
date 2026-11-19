"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { transitionCampaignStatus, type CampaignStatus } from "@/lib/campaign-lifecycle";
import {
  loadMyCampaignBudgetSummary,
  type CampaignBudgetSummary,
} from "@/lib/campaign-budget";

type Campaign = {
  id: string;
  name: string;
  goal: string;
  platform: string | null;
  status: string;
  max_budget: number | null;
  desired_results: number | null;
  payment_method: string | null;
  payment_rate: number | null;
  funded_amount: number | null;
  created_at: string;
};

const pretty = (value: string | null | undefined) =>
  (value || "Not specified").replaceAll("_", " ");

const money = (value: number) =>
  "₦" + value.toLocaleString("en-NG", { maximumFractionDigits: 2 });

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [budgets, setBudgets] = useState<CampaignBudgetSummary[]>([]);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [budgetError, setBudgetError] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    if (!supabase) {
      setError("AdBridge database is not connected yet.");
      setBudgetError("The campaign funding ledger is unavailable.");
      setLoading(false);
      return;
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      window.location.href = "/login";
      return;
    }

    const [campaignResult, budgetResult] = await Promise.all([
      supabase
        .from("campaigns")
        .select("id,name,goal,platform,status,max_budget,desired_results,payment_method,payment_rate,funded_amount,created_at")
        .eq("advertiser_id", user.id)
        .order("created_at", { ascending: false }),
      loadMyCampaignBudgetSummary(),
    ]);

    if (campaignResult.error) {
      setError("We couldn't load your campaigns right now.");
    } else {
      const nextCampaigns = campaignResult.data ?? [];
      setCampaigns(nextCampaigns);
      setError("");

      if (budgetResult.error || !budgetResult.data) {
        setBudgets([]);
        setBudgetError(
          budgetResult.error?.message || "The campaign funding ledger could not be loaded.",
        );
      } else {
        const returnedIds = new Set(budgetResult.data.map((row) => row.campaignId));
        const missingCampaign = nextCampaigns.some((campaign) => !returnedIds.has(campaign.id));

        if (missingCampaign) {
          setBudgets([]);
          setBudgetError(
            "The funding ledger did not return every campaign. Balances are hidden until the data can be refreshed.",
          );
        } else {
          setBudgets(budgetResult.data);
          setBudgetError("");
        }
      }
    }

    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(
    () =>
      campaigns.filter(
        (campaign) =>
          (tab === "all" || campaign.status === tab) &&
          [
            campaign.name,
            campaign.goal,
            campaign.platform || "",
            campaign.payment_method || "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [campaigns, tab, search],
  );

  const budgetByCampaign = useMemo(
    () => new Map(budgets.map((budget) => [budget.campaignId, budget])),
    [budgets],
  );

  const totals = useMemo(
    () =>
      budgets.reduce(
        (result, budget) => ({
          heldFunding: result.heldFunding + budget.heldFunding,
          committedSpend: result.committedSpend + budget.committedSpend,
          remainingBudget: result.remainingBudget + budget.remainingBudget,
        }),
        { heldFunding: 0, committedSpend: 0, remainingBudget: 0 },
      ),
    [budgets],
  );

  async function changeStatus(id: string, status: CampaignStatus) {
    if (!supabase) return;

    setBusy(id);
    setError("");
    setMessage("");

    const { data, error: transitionError } = await transitionCampaignStatus(id, status);
    if (transitionError || !data?.success) {
      setError(transitionError?.message || "The campaign status change was not confirmed.");
    } else {
      setMessage(
        status === "paused"
          ? "Campaign paused."
          : status === "closed"
            ? "Campaign closed."
            : "Campaign reopened.",
      );
      await load();
    }

    setBusy("");
  }

  return (
    <main className="formPage">
      <Link href="/advertiser" className="back">
        ← Advertiser Dashboard
      </Link>

      <div className="formCard wide">
        <span className="eyebrow">YOUR CAMPAIGNS</span>
        <h1>
          Everything you're <em>running.</em>
        </h1>
        <p>Manage campaigns, update details, review results and control campaign status.</p>
        <Link className="primary" href="/advertiser/new">
          ＋ Start a new campaign
        </Link>

        {!loading && (
          <section className="quick" aria-labelledby="funding-ledger-title">
            <h2 id="funding-ledger-title">Campaign funding ledger</h2>
            {budgetError ? (
              <p className="fieldHint" role="alert">
                {budgetError}
              </p>
            ) : (
              <>
                <div className="statsGrid">
                  <div>
                    <b>Confirmed held funding</b>
                    <strong>{money(totals.heldFunding)}</strong>
                  </div>
                  <div>
                    <b>Committed creator payments</b>
                    <strong>{money(totals.committedSpend)}</strong>
                  </div>
                  <div>
                    <b>Remaining funded budget</b>
                    <strong>{money(totals.remainingBudget)}</strong>
                  </div>
                </div>
                <p>
                  Committed payments include creator ledger entries marked pending, approved or
                  released. Remaining budget is calculated from held funding, capped by each
                  campaign's maximum budget.
                </p>
              </>
            )}
          </section>
        )}

        <div className="filterRow">
          <input
            className="textInput"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search campaigns..."
          />
          <select className="textInput" value={tab} onChange={(event) => setTab(event.target.value)}>
            <option value="all">All campaigns</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {loading && <div className="successBox">Loading campaigns...</div>}
        {!loading && error && (
          <div className="successBox" role="alert">
            {error}
          </div>
        )}
        {!loading && !error && message && <div className="successBox">✓ {message}</div>}

        {!loading && !error && filtered.length > 0 && (
          <div className="opps">
            {filtered.map((campaign) => {
              const budget = budgetByCampaign.get(campaign.id);

              return (
                <article key={campaign.id}>
                  <b>{campaign.status.toUpperCase()}</b>
                  <h3>{campaign.name}</h3>
                  <p>
                    {campaign.platform || "Any platform"} · {campaign.goal}
                  </p>
                  <p>
                    {pretty(campaign.payment_method)} · {money(Number(campaign.payment_rate || 0))}{" "}
                    per result
                  </p>
                  <strong>{money(Number(campaign.max_budget || 0))} maximum budget</strong>
                  {budget ? (
                    <small>
                      Held {money(budget.heldFunding)} · Committed {money(budget.committedSpend)} ·
                      Remaining {money(budget.remainingBudget)}
                    </small>
                  ) : (
                    <small>
                      {budgetError ? "Campaign ledger details unavailable." : "Loading ledger details…"}
                    </small>
                  )}
                  <small>{campaign.desired_results ?? 0} desired results</small>

                  <div className="choiceRow">
                    <Link className="secondary" href={"/advertiser/campaigns/" + campaign.id + "/edit"}>
                      Edit campaign
                    </Link>
                    {["cpa", "cpi", "actions"].includes(String(campaign.payment_method || "").toLowerCase()) && (
                      <Link className="secondary" href={"/advertiser/campaigns/" + campaign.id + "/postback"}>
                        Conversion setup
                      </Link>
                    )}
                    <Link className="secondary" href={"/advertiser/results?campaign=" + campaign.id}>
                      Results
                    </Link>
                    <Link className="secondary" href={"/advertiser/review?campaign=" + campaign.id}>
                      Review work
                    </Link>
                    {campaign.status === "active" && (
                      <button
                        className="secondary"
                        disabled={busy === campaign.id}
                        onClick={() => changeStatus(campaign.id, "paused")}
                      >
                        {busy === campaign.id ? "Saving…" : "Pause"}
                      </button>
                    )}
                    {campaign.status === "paused" && (
                      <button
                        className="primary"
                        disabled={busy === campaign.id}
                        onClick={() => changeStatus(campaign.id, "active")}
                      >
                        {busy === campaign.id ? "Saving…" : "Reopen"}
                      </button>
                    )}
                    {campaign.status !== "closed" && (
                      <button
                        className="secondary"
                        disabled={busy === campaign.id}
                        onClick={() => changeStatus(campaign.id, "closed")}
                      >
                        {busy === campaign.id ? "Saving…" : "Close"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="successBox">No campaigns match this view.</div>
        )}
      </div>
    </main>
  );
}
