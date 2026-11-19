"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Job = {
  id: string;
  status: string;
  campaigns: { name: string; payment_rate: number | null; platform: string | null } | { name: string; payment_rate: number | null; platform: string | null }[] | null;
};

const first = <T,>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? value[0] ?? null : value ?? null;

export default function Creator() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    async function load() {
      if (!supabase) {
        setError("AdBridge database is not connected.");
        setLoading(false);
        return;
      }
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        window.location.href = "/login";
        return;
      }
      const { data, error: queryError } = await supabase
        .from("creator_campaigns")
        .select("id,status,campaigns(name,payment_rate,platform)")
        .eq("creator_id", user.id)
        .order("created_at", { ascending: false });
      if (!live) return;
      if (queryError) setError("Your campaign work could not be loaded. Please refresh.");
      else setJobs((data || []) as unknown as Job[]);
      setLoading(false);
    }
    void load();
    return () => { live = false; };
  }, []);

  const counts = useMemo(() => ({
    active: jobs.filter(j => ["accepted", "in_progress"].includes(j.status)).length,
    submitted: jobs.filter(j => j.status === "submitted").length,
    approved: jobs.filter(j => ["approved", "completed", "paid"].includes(j.status)).length,
  }), [jobs]);

  return (
    <main className="dashboard creatorDash">
      <div className="dashTop">
        <Link href="/" className="back">← AdBridge</Link>
        <span className="testBadge">CREATOR WORKSPACE</span>
        <Link href="/advertiser" className="switch">Advertiser side →</Link>
      </div>
      <section className="dashHero">
        <div>
          <span className="eyebrow">CREATOR DASHBOARD</span>
          <h1>Find ads.<br /><em>Create. Get paid.</em></h1>
          <p>Discover compatible campaigns, deliver your work and track approved earnings. Website and app publishers have a dedicated delivery centre too.</p>
        </div>
        <Link className="primary" href="/creator/campaigns">Browse creator campaigns ↗</Link>
      </section>

      {error && <div className="successBox" role="alert">{error}</div>}
      <section className="statsGrid" aria-label="Creator work summary">
        <div><b>ACTIVE JOBS</b><strong>{loading ? "—" : counts.active}</strong><small>Accepted and in progress</small></div>
        <div><b>SUBMITTED</b><strong>{loading ? "—" : counts.submitted}</strong><small>Awaiting review</small></div>
        <div><b>APPROVED / COMPLETED</b><strong>{loading ? "—" : counts.approved}</strong><small>Approved campaign work</small></div>
        <div><b>TOTAL JOBS</b><strong>{loading ? "—" : jobs.length}</strong><small>Your campaign history</small></div>
      </section>

      <div className="dashGrid">
        <section>
          <div className="sectionHead"><h2>Your work</h2><Link href="/creator/work">Open all work →</Link></div>
          {loading && <div className="successBox">Loading your campaign work…</div>}
          {!loading && !error && jobs.slice(0, 5).map(job => {
            const campaign = first(job.campaigns);
            return (
              <article className="campaign" key={job.id}>
                <div className="campaignIcon">▶</div>
                <div className="campaignInfo">
                  <b>{campaign?.name || "Campaign"}</b>
                  <small>{campaign?.platform || "Multiple platforms"}</small>
                  <small>₦{Number(campaign?.payment_rate || 0).toLocaleString()}</small>
                </div>
                <span className={["approved", "completed", "paid"].includes(job.status) ? "live" : "review"}>{job.status.replaceAll("_", " ")}</span>
              </article>
            );
          })}
          {!loading && !error && jobs.length === 0 && <div className="successBox">No accepted campaigns yet. <Link href="/creator/campaigns">Browse live campaigns →</Link></div>}
        </section>
        <aside>
          <span className="eyebrow">QUICK ACCESS</span>
          <h3>Creator tools</h3>
          <p>Manage your public creator listing, verify your account and track payouts.</p>
          <Link href="/creator/earnings">Earnings & withdrawals →</Link>
          <p><Link href="/creator/verification">Verify creator listing →</Link></p>
          <p><Link href="/creator/connections">Connect social accounts →</Link></p>
          <p><Link href="/notifications">Notifications →</Link></p>
        </aside>
      </div>

      <section className="quick">
        <h2>Creator and publisher workspace</h2>
        <div className="quickGrid">
          <Link href="/creator/campaigns"><b>✦</b><span>Creator campaigns</span><small>Find social content opportunities</small></Link>
          <Link href="/creator/work"><b>▤</b><span>My work</span><small>Submit and manage accepted campaigns</small></Link>
          <Link href="/publisher"><b>↗</b><span>Publisher delivery</span><small>Apply with websites and apps</small></Link>
          <Link href="/publisher/applications"><b>✓</b><span>Publisher applications</span><small>Track application decisions</small></Link>
          <Link href="/creator/connections"><b>◎</b><span>Social connections</span><small>Connect accounts for supported verification</small></Link>
          <Link href="/creator/analytics"><b>▥</b><span>Analytics</span><small>Track campaign performance</small></Link>
          <Link href="/creator/earnings"><b>₦</b><span>Earnings</span><small>Balances, withdrawals and payment history</small></Link>
          <Link href="/creator/profile"><b>●</b><span>Profile</span><small>Update your creator profile</small></Link>
          <Link href="/rankings"><b>№</b><span>Global rankings</span><small>Worldwide top 20 creators and advertisers</small></Link>
        </div>
      </section>
    </main>
  );
}
