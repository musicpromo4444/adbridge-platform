"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Campaign = {
  id: string;
  name: string;
  goal: string;
  instructions: string | null;
  platform: string | null;
  payment_method: string | null;
  payment_rate: number | null;
  max_budget: number | null;
  desired_results: number | null;
  status: string;
  created_at: string;
};

type AcceptedJob = {
  campaign_id: string;
  status: string;
};

const label = (value: string | null | undefined) =>
  (value || "Not specified").replaceAll("_", " ").replace(/\\b\\w/g, (c) => c.toUpperCase());

export default function Campaigns() {
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("All");
  const [tab, setTab] = useState<"available" | "joined" | "completed">("available");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [accepted, setAccepted] = useState<AcceptedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!supabase) {
        setError("AdBridge database is not connected yet.");
        setLoading(false);
        return;
      }

      const creatorId = localStorage.getItem("adbridge-creator-id");
      const [{ data, error: queryError }, acceptedResult] = await Promise.all([
        supabase
          .from("campaigns")
          .select("id,name,goal,instructions,platform,payment_method,payment_rate,max_budget,desired_results,status,created_at")
          .eq("status", "active")
          .order("created_at", { ascending: false }),
        creatorId
          ? supabase.from("creator_campaigns").select("campaign_id,status").eq("creator_id", creatorId)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      if (!mounted) return;
      if (queryError) {
        setError("We couldn't load campaigns right now.");
      } else {
        setCampaigns(data ?? []);
        setAccepted(acceptedResult?.data ?? []);
      }
      setLoading(false);
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const acceptedMap = useMemo(
    () => new Map(accepted.map((job) => [job.campaign_id, job.status])),
    [accepted]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return campaigns.filter((c) => {
      const joinedStatus = acceptedMap.get(c.id);
      const isJoined = Boolean(joinedStatus);
      const isCompleted = ["completed", "approved", "paid"].includes(joinedStatus || "");

      if (tab === "available" && isJoined) return false;
      if (tab === "joined" && (!isJoined || isCompleted)) return false;
      if (tab === "completed" && !isCompleted) return false;

      if (platform !== "All" && c.platform !== platform) return false;

      return !q || [c.name, c.goal, c.platform || "", c.payment_method || "", c.instructions || ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [campaigns, acceptedMap, search, platform, tab]);

  const platforms = Array.from(
    new Set(campaigns.map((c) => c.platform).filter(Boolean))
  ) as string[];

  return (
    <main className="formPage">
      <Link href="/creator" className="back">← Creator Dashboard</Link>
      <div className="formCard wide">
        <span className="eyebrow">CREATOR CAMPAIGNS</span>
        <h1>Find your next <em>opportunity.</em></h1>
        <p>Live advertiser campaigns, your accepted jobs, and completed work in one place.</p>

        <div className="filterRow">
          <input
            className="textInput"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns, brands or goals..."
          />
          <select className="textInput" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option>All</option>
            {platforms.map((item) => <option key={item}>{item}</option>)}
          </select>
        </div>

        <div className="choiceRow">
          <button className={tab === "available" ? "primary" : "secondary"} onClick={() => setTab("available")}>Available</button>
          <button className={tab === "joined" ? "primary" : "secondary"} onClick={() => setTab("joined")}>My campaigns</button>
          <button className={tab === "completed" ? "primary" : "secondary"} onClick={() => setTab("completed")}>Completed</button>
        </div>

        {loading && <div className="successBox">Loading live campaigns...</div>}
        {!loading && error && <div className="successBox">{error}</div>}

        {!loading && !error && filtered.length > 0 && (
          <div className="opps">
            {filtered.map((c) => {
              const joinedStatus = acceptedMap.get(c.id);
              const completed = ["completed", "approved", "paid"].includes(joinedStatus || "");
              return (
                <article key={c.id}>
                  <b>{c.name}</b>
                  <h3>{c.goal}</h3>
                  <p>{c.platform || "Any platform"} · {label(c.payment_method)}</p>
                  <p>{c.instructions || "Follow the advertiser's campaign instructions."}</p>
                  <div>
                    {c.payment_rate !== null && <strong>₦{Number(c.payment_rate).toLocaleString()}</strong>}
                    {c.max_budget !== null && <span> · Budget ₦{Number(c.max_budget).toLocaleString()}</span>}
                  </div>
                  {c.desired_results !== null && <small>Target: {Number(c.desired_results).toLocaleString()}</small>}
                  {joinedStatus && <small>Status: {label(joinedStatus)}</small>}
                  {completed ? (
                    <Link href="/creator/work">View completed work →</Link>
                  ) : (
                    <Link href={"/creator/campaigns/" + c.id}>
                      {joinedStatus ? "Continue campaign →" : "View & join campaign →"}
                    </Link>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="successBox">
            {tab === "available"
              ? "No new live campaigns are available yet."
              : tab === "joined"
                ? "You have no active campaign jobs yet."
                : "No completed campaigns yet."}
          </div>
        )}
      </div>
    </main>
  );
}
