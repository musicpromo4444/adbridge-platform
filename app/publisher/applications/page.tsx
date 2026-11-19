"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Application = {
  id: string;
  campaign_id: string;
  selected_platform: string;
  selected_format: string;
  status: string;
  applied_at: string | null;
  approved_at: string | null;
  campaigns: { name: string; goal: string; payment_rate: number | null } | { name: string; goal: string; payment_rate: number | null }[] | null;
};

type Property = {
  id: string;
  property_type: string;
  name: string;
  url: string | null;
  verified: boolean;
};

const first = <T,>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? value[0] ?? null : value ?? null;

const pretty = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());

export default function PublisherApplications() {
  const [rows, setRows] = useState<Application[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [filter, setFilter] = useState("all");
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
      const [{ data: applications, error: applicationError }, { data: propertyRows, error: propertyError }] = await Promise.all([
        supabase.from("publisher_campaigns")
          .select("id,campaign_id,selected_platform,selected_format,status,applied_at,approved_at,campaigns(name,goal,payment_rate)")
          .eq("publisher_id", user.id)
          .order("applied_at", { ascending: false }),
        supabase.from("publisher_properties")
          .select("id,property_type,name,url,verified")
          .eq("publisher_id", user.id)
          .order("created_at", { ascending: false }),
      ]);
      if (!live) return;
      if (applicationError) setError("Your publisher applications could not be loaded.");
      else setRows((applications || []) as unknown as Application[]);
      if (propertyError) setError("Your publisher properties could not be loaded.");
      else setProperties((propertyRows || []) as Property[]);
      setLoading(false);
    }
    void load();
    return () => { live = false; };
  }, []);

  const visible = useMemo(
    () => rows.filter(row => filter === "all" || row.status === filter),
    [rows, filter]
  );

  const counts = useMemo(() => ({
    applied: rows.filter(row => row.status === "applied").length,
    approved: rows.filter(row => row.status === "approved").length,
    changes: rows.filter(row => row.status === "changes_requested").length,
    rejected: rows.filter(row => row.status === "rejected").length,
  }), [rows]);

  return (
    <main className="formPage">
      <Link href="/publisher" className="back">← Publisher Delivery Center</Link>
      <div className="formCard wide">
        <span className="eyebrow">PUBLISHER APPLICATIONS</span>
        <h1>Track your <em>ad placements.</em></h1>
        <p>See each website and app campaign application, its review decision and the format you applied to deliver. Advertisers and AdBridge review applications; you cannot approve your own inventory.</p>

        <section className="statsGrid">
          <div><b>AWAITING REVIEW</b><strong>{loading ? "—" : counts.applied}</strong></div>
          <div><b>APPROVED</b><strong>{loading ? "—" : counts.approved}</strong></div>
          <div><b>CHANGES REQUESTED</b><strong>{loading ? "—" : counts.changes}</strong></div>
          <div><b>NOT APPROVED</b><strong>{loading ? "—" : counts.rejected}</strong></div>
        </section>

        <label htmlFor="publisher-application-filter">Application status</label>
        <select id="publisher-application-filter" className="textInput" value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="all">All applications</option>
          <option value="applied">Awaiting review</option>
          <option value="approved">Approved</option>
          <option value="changes_requested">Changes requested</option>
          <option value="rejected">Rejected</option>
        </select>

        {error && <div className="successBox" role="alert">{error}</div>}
        {loading && <div className="successBox">Loading your applications…</div>}
        {!loading && !error && visible.length > 0 && (
          <div className="opps">
            {visible.map(row => {
              const campaign = first(row.campaigns);
              return (
                <article key={row.id}>
                  <b>{pretty(row.status)}</b>
                  <h3>{campaign?.name || "Campaign"}</h3>
                  <p>{campaign?.goal || "Campaign delivery"} · {pretty(row.selected_platform)} · {pretty(row.selected_format)}</p>
                  {campaign?.payment_rate !== null && campaign?.payment_rate !== undefined && (
                    <strong>₦{Number(campaign.payment_rate).toLocaleString("en-NG")} per campaign result</strong>
                  )}
                  <small>Applied {row.applied_at ? new Date(row.applied_at).toLocaleString() : "date not available"}</small>
                  {row.approved_at && <small>Approved {new Date(row.approved_at).toLocaleString()}</small>}
                  {row.status === "approved" && <p>Your placement combination has been approved. Follow the campaign delivery instructions before serving ads.</p>}
                  {row.status === "changes_requested" && <p>AdBridge or the advertiser requested changes. Review your property details and contact the platform through the official support route if needed.</p>}
                </article>
              );
            })}
          </div>
        )}
        {!loading && !error && visible.length === 0 && (
          <div className="notificationEmpty">
            <h2>No applications in this view</h2>
            <p>Apply to an active campaign from the Publisher Delivery Center. Choose only platforms and ad formats your property genuinely supports.</p>
            <Link href="/publisher">Browse publisher opportunities →</Link>
          </div>
        )}

        <div className="quick">
          <h2>Your publisher properties</h2>
          <p>Property ownership is reviewed separately. An application decision does not automatically verify a website or app.</p>
          {properties.length ? properties.map(property => (
            <article className="reviewSummary" key={property.id}>
              <b>{property.name}</b>
              <p>{pretty(property.property_type)} · {property.verified ? "Verified property" : "Awaiting property verification"}</p>
              {property.url && <a href={property.url} target="_blank" rel="noreferrer">Open property ↗</a>}
            </article>
          )) : <div className="successBox">No properties saved yet. Add your website or app in the Publisher Delivery Center.</div>}
          <Link href="/publisher">Manage publisher properties →</Link>
          <p><Link href="/publisher/integration">Set up server-side ad tracking →</Link></p>
        </div>

        <div className="infoBox">
          <b>Need your earnings or payout details?</b>
          <p>Creator and publisher earnings use the same protected payout profile and withdrawal workflow.</p>
          <Link href="/creator/earnings">Open earnings and payouts →</Link>
        </div>
      </div>
    </main>
  );
}
