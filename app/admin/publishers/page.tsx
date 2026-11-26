"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Property = { id: string; publisher_id: string; property_type: string; name: string; url: string | null; platforms: string[]; ad_formats: string[]; verified: boolean };

type Application = {
  id: string;
  campaign_id: string;
  publisher_id: string;
  selected_platform: string | null;
  selected_format: string | null;
  status: string;
  applied_at: string;
  campaigns: { name: string } | { name: string }[] | null;
  profiles: { display_name: string | null; email: string | null } | { display_name: string | null; email: string | null }[] | null;
};

function first<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] || null : value;
}

export default function PublisherApplications() {
  const [rows, setRows] = useState<Application[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [filter, setFilter] = useState("applied");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    if (!supabase) { setError("Database connection is not ready."); setLoading(false); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { location.href = "/login"; return; }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role !== "admin") { setError("Administrator access required."); setLoading(false); return; }
    const [{ data, error: queryError }, { data: propertyRows, error: propertyError }] = await Promise.all([
      supabase.from("publisher_campaigns")
        .select("id,selected_property_id,campaign_id,publisher_id,selected_platform,selected_format,status,applied_at,campaigns(name),profiles(display_name,email)")
        .order("applied_at", { ascending: false }),
      supabase.from("publisher_properties")
        .select("id,publisher_id,property_type,name,url,platforms,ad_formats,verified")
        .order("created_at", { ascending: false }),
    ]);
    if (queryError) setError("Could not load publisher applications: " + queryError.message);
    else setRows((data || []) as unknown as Application[]);
    if (propertyError) setError("Could not load publisher properties: " + propertyError.message);
    else setProperties((propertyRows || []) as Property[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => rows.filter(row => filter === "all" || row.status === filter), [rows, filter]);

  async function decide(row: Application, status: "approved" | "rejected") {
    if (!supabase) return;
    setBusy(row.id); setError(""); setMessage("");
    const { data, error: rpcError } = await supabase.rpc("review_publisher_application", {
      p_application_id: row.id,
      p_status: status,
    });
    if (rpcError || data?.error) setError(rpcError?.message || data?.error || "Application could not be updated.");
    else {
      setMessage(status === "approved" ? "Publisher application approved." : "Publisher application rejected.");
      await load();
    }
    setBusy("");
  }

  async function verifyProperty(property: Property) {
    if (!supabase) return;
    setBusy(property.id); setError(""); setMessage("");
    const { error: rpcError } = await supabase.rpc("admin_set_publisher_property_verified", {
      p_property_id: property.id,
      p_verified: !property.verified,
    });
    if (rpcError) setError("Could not update property verification: " + rpcError.message);
    else {
      setProperties(current => current.map(item => item.id === property.id ? { ...item, verified: !item.verified } : item));
      setMessage(property.verified ? "Publisher property verification removed." : "Publisher property verified.");
    }
    setBusy("");
  }

  return <main className="formPage">
    <Link href="/admin" className="back">← Admin</Link>
    <div className="formCard wide">
      <span className="eyebrow">ADMIN · PUBLISHER APPLICATIONS</span>
      <h1>Review publisher <em>inventory.</em></h1>
      <p>Check the publisher's selected platform and delivery format before approving access to a campaign.</p>
      <div className="statsGrid">
        <div><b>Awaiting review</b><strong>{rows.filter(x => x.status === "applied").length}</strong></div>
        <div><b>Approved</b><strong>{rows.filter(x => x.status === "approved").length}</strong></div>
        <div><b>Rejected</b><strong>{rows.filter(x => x.status === "rejected").length}</strong></div>
        <div><b>Total applications</b><strong>{rows.length}</strong></div>
      </div>
      <div className="choices compact">
        {["applied", "approved", "rejected", "all"].map(value =>
          <button key={value} className={filter === value ? "selected" : ""} onClick={() => setFilter(value)}>{value}</button>
        )}
      </div>
      {error && <div className="successBox">{error}</div>}
      {message && <div className="successBox">✓ {message}</div>}
      {loading ? <div className="successBox">Loading publisher applications…</div> :
        <div className="opps">
          {filtered.map(row => {
            const campaign = first(row.campaigns);
            const publisher = first(row.profiles);
            return <article key={row.id}>
              <b>{row.status.toUpperCase()}</b>
              <h3>{campaign?.name || "Campaign"}</h3>
              <p>Publisher: {publisher?.display_name || "Unnamed publisher"} · {publisher?.email || row.publisher_id}</p>
              <p>Platform: {row.selected_platform || "Not specified"} · Format: {row.selected_format || "Not specified"}</p>\n              <p>Selected property: {properties.find(property => property.id === row.selected_property_id)?.name || "Legacy application — no property selected"}</p>\n              {properties.find(property => property.id === row.selected_property_id)?.url && <a href={properties.find(property => property.id === row.selected_property_id)?.url || "#"} target="_blank" rel="noreferrer">Review publisher property ↗</a>}
              <small>Applied {new Date(row.applied_at).toLocaleString()}</small>
              {row.status === "applied" && <div className="choiceRow">
                <button className="primary" disabled={!!busy} onClick={() => void decide(row, "approved")}>{busy === row.id ? "Saving…" : "Approve publisher"}</button>
                <button className="secondary" disabled={!!busy} onClick={() => void decide(row, "rejected")}>Reject</button>
              </div>}
            </article>;
          })}
          {!filtered.length && <div className="successBox">No publisher applications in this view.</div>}
        </div>
      }
      <div className="conversionInfo">
        <span className="eyebrow">PUBLISHER PROPERTY VERIFICATION</span>
        <h2>Websites and apps</h2>
        <p>Verify ownership and quality before publishers receive access to eligible campaigns.</p>
        <div className="opps">
          {properties.map(property => <article key={property.id}>
            <b>{property.verified ? "VERIFIED" : "NOT VERIFIED"} · {property.property_type}</b>
            <h3>{property.name}</h3>
            <p>Publisher ID: {property.publisher_id}</p>
            <p>{(property.platforms || []).join(" · ")} · {(property.ad_formats || []).join(" · ")}</p>
            {property.url && <a className="secondary" href={property.url} target="_blank" rel="noreferrer">Open property ↗</a>}
            <button className="secondary" disabled={!!busy} onClick={() => void verifyProperty(property)}>{busy === property.id ? "Saving…" : property.verified ? "Remove verification" : "Verify property"}</button>
          </article>)}
          {!properties.length && <div className="successBox">No publisher properties submitted yet.</div>}
        </div>
      </div>
    </div>
  </main>;
}
