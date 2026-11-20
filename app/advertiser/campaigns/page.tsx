"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

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

const money = (value: number | null) => "₦" + Number(value || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 });
const pretty = (value: string | null | undefined) => (value || "Not specified").replaceAll("_", " ");
const statuses = [
  ["all", "All campaigns"],
  ["draft", "Draft"],
  ["funded", "Funded"],
  ["active", "Active"],
  ["paused", "Paused"],
  ["completed", "Completed"],
  ["closed", "Closed"],
  ["cancelled", "Cancelled"]
];

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async (initial = false) => {
    if (!supabase) {
      setError("AdBridge database is not connected yet.");
      setLoading(false);
      return;
    }
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError("");
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      window.location.href = "/login";
      return;
    }
    const { data, error: queryError } = await supabase
      .from("campaigns")
      .select("id,name,goal,platform,status,max_budget,desired_results,payment_method,payment_rate,funded_amount,created_at")
      .eq("advertiser_id", user.id)
      .order("created_at", { ascending: false });
    if (queryError) setError("We couldn't load your campaigns right now. Please refresh and try again.");
    else setCampaigns((data || []) as Campaign[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { void load(true); }, [load]);

  const counts = useMemo(() => ({
    all: campaigns.length,
    draft: campaigns.filter(c => c.status === "draft").length,
    funded: campaigns.filter(c => c.status === "funded").length,
    active: campaigns.filter(c => c.status === "active").length,
    paused: campaigns.filter(c => c.status === "paused").length,
    completed: campaigns.filter(c => c.status === "completed").length,
    closed: campaigns.filter(c => c.status === "closed").length,
    cancelled: campaigns.filter(c => c.status === "cancelled").length
  }), [campaigns]);

  const filtered = useMemo(() => campaigns.filter(c =>
    (tab === "all" || c.status === tab) &&
    [c.name, c.goal, c.platform || "", c.payment_method || "", c.status]
      .join(" ").toLowerCase().includes(search.toLowerCase().trim())
  ), [campaigns, tab, search]);

  async function changeStatus(id: string, status: string) {
    if (!supabase) return;
    setBusy(id);
    setError("");
    setMessage("");
    const { error: rpcError } = await supabase.rpc("set_campaign_status", {
      p_campaign_id: id,
      p_status: status
    });
    if (rpcError) {
      setError(rpcError.message || "We couldn't update this campaign. Check its funding and status, then try again.");
    } else {
      setMessage(status === "paused" ? "Campaign paused." : status === "closed" ? "Campaign closed." : status === "active" ? "Campaign activated." : "Campaign status updated.");
      await load();
    }
    setBusy("");
  }

  return (
    <main className="formPage">
      <Link href="/advertiser" className="back">← Advertiser Dashboard</Link>
      <div className="formCard wide">
        <span className="eyebrow">YOUR CAMPAIGNS</span>
        <h1>Everything you're <em>running.</em></h1>
        <p>Manage campaign drafts, activate fully funded campaigns, pause delivery, close campaigns and review performance.</p>
        <div className="choiceRow">
          <Link className="primary" href="/advertiser/new">＋ Start a new campaign</Link>
          <button className="secondary" type="button" onClick={() => void load()} disabled={loading || refreshing || !!busy}>
            {refreshing ? "Refreshing…" : "Refresh campaigns"}
          </button>
        </div>

        <div className="statsGrid" aria-label="Campaign status totals">
          <div><b>ALL CAMPAIGNS</b><strong>{loading ? "—" : counts.all}</strong></div>
          <div><b>DRAFTS</b><strong>{loading ? "—" : counts.draft}</strong></div>
          <div><b>FUNDED</b><strong>{loading ? "—" : counts.funded}</strong></div>
          <div><b>ACTIVE</b><strong>{loading ? "—" : counts.active}</strong></div>
          <div><b>PAUSED</b><strong>{loading ? "—" : counts.paused}</strong></div>
          <div><b>COMPLETED</b><strong>{loading ? "—" : counts.completed}</strong></div>
        </div>

        <div className="filterRow">
          <input className="textInput" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by campaign, goal, platform or status…" aria-label="Search campaigns" />
          <select className="textInput" value={tab} onChange={e => setTab(e.target.value)} aria-label="Filter campaigns by status">
            {statuses.map(([value, label]) => <option key={value} value={value}>{label} ({counts[value as keyof typeof counts]})</option>)}
          </select>
        </div>

        {loading && <div className="successBox">Loading campaigns…</div>}
        {!loading && error && <div className="successBox" role="alert">{error}</div>}
        {!loading && !error && message && <div className="successBox" role="status">✓ {message}</div>}

        {!loading && !error && filtered.length > 0 && (
          <div className="opps">
            {filtered.map(c => {
              const isTerminal = ["closed", "cancelled", "completed"].includes(c.status);
              const canActivate = c.status === "funded" || c.status === "paused";
              return (
                <article key={c.id}>
                  <div className="choiceRow">
                    <b>{pretty(c.status).toUpperCase()}</b>
                    <small>{new Date(c.created_at).toLocaleDateString()}</small>
                  </div>
                  <h3>{c.name}</h3>
                  <p>{pretty(c.goal)} · {c.platform || "Multiple platforms"}</p>
                  <p>{pretty(c.payment_method)} · {money(c.payment_rate)} per result</p>
                  <div className="statsGrid">
                    <div><b>MAXIMUM BUDGET</b><strong>{money(c.max_budget)}</strong></div>
                    <div><b>CONFIRMED FUNDING</b><strong>{money(c.funded_amount)}</strong></div>
                    <div><b>TARGET RESULTS</b><strong>{Number(c.desired_results || 0).toLocaleString("en-NG")}</strong></div>
                  </div>
                  <div className="choiceRow">
                    <Link className="secondary" href={"/advertiser/results?campaign=" + c.id}>Results</Link>
                    <Link className="secondary" href={"/advertiser/review?campaign=" + c.id}>Review work</Link>
                    <Link className="secondary" href="/advertiser/budget">Budget control</Link>
                    {c.status === "draft" && Number(c.funded_amount || 0) === 0 && <Link className="secondary" href={"/advertiser/campaigns/" + c.id + "/edit"}>Edit draft</Link>}
                    {c.status === "active" && <button className="secondary" disabled={busy === c.id} onClick={() => void changeStatus(c.id, "paused")}>{busy === c.id ? "Saving…" : "Pause campaign"}</button>}
                    {canActivate && <button className="primary" disabled={busy === c.id} onClick={() => void changeStatus(c.id, "active")}>{busy === c.id ? "Saving…" : c.status === "funded" ? "Activate campaign" : "Resume campaign"}</button>}
                    {!isTerminal && <button className="secondary" disabled={busy === c.id} onClick={() => void changeStatus(c.id, "closed")}>{busy === c.id ? "Saving…" : "Close campaign"}</button>}
                  </div>
                  {c.status === "funded" && <small>Funding is confirmed. Activation is permitted only when the full campaign budget has been received.</small>}
                  {isTerminal && <small>This campaign is in a terminal state. Create a new campaign to launch different work.</small>}
                </article>
              );
            })}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="notificationEmpty">
            <h2>{campaigns.length ? "No campaigns match this filter" : "No campaigns yet"}</h2>
            <p>{campaigns.length ? "Try another status or search term." : "Create your first campaign to start working with AdBridge creators and publishers."}</p>
            {!campaigns.length && <Link href="/advertiser/new">Create a campaign →</Link>}
          </div>
        )}
      </div>
    </main>
  );
}
