"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Campaign = {
  id: string;
  name: string;
  goal: string;
  platform: string | null;
  payment_rate: number | null;
  max_budget: number | null;
  status: string;
};

export default function Campaigns() {
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("All");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
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

      const { data, error: queryError } = await supabase
        .from("campaigns")
        .select("id,name,goal,platform,payment_rate,max_budget,status")
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (!mounted) return;
      if (queryError) {
        setError("We couldn't load campaigns right now.");
      } else {
        setCampaigns(data ?? []);
      }
      setLoading(false);
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(
    () =>
      campaigns.filter(
        (c) =>
          (platform === "All" || c.platform === platform) &&
          [c.name, c.goal, c.platform ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(search.toLowerCase())
      ),
    [campaigns, search, platform]
  );

  const platforms = Array.from(
    new Set(campaigns.map((c) => c.platform).filter(Boolean))
  ) as string[];

  return (
    <main className="formPage">
      <Link href="/creator" className="back">← Creator Dashboard</Link>
      <div className="formCard wide">
        <span className="eyebrow">CAMPAIGNS FOR YOU</span>
        <h1>Choose your next <em>opportunity.</em></h1>
        <p>Live campaigns from advertisers are shown here.</p>

        <div className="filterRow">
          <input
            className="textInput"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns, brands or goals..."
          />
          <select
            className="textInput"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            <option>All</option>
            {platforms.map((item) => <option key={item}>{item}</option>)}
          </select>
        </div>

        {loading && <div className="successBox">Loading live campaigns...</div>}
        {!loading && error && <div className="successBox">{error}</div>}

        {!loading && !error && filtered.length > 0 && (
          <div className="opps">
            {filtered.map((c) => (
              <article key={c.id}>
                <b>{c.name}</b>
                <h3>{c.goal}</h3>
                <p>{c.platform || "Any platform"} · Live campaign</p>
                {c.payment_rate !== null && (
                  <strong>₦{Number(c.payment_rate).toLocaleString()}</strong>
                )}
                <Link href={"/creator/campaigns/" + c.id}>View campaign →</Link>
              </article>
            ))}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="successBox">
            No live campaigns are available yet.
          </div>
        )}
      </div>
    </main>
  );
}
