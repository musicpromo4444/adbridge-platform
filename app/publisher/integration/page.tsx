"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Property = { id: string; name: string; property_type: string; url: string | null; verified: boolean; platforms: string[]; ad_formats: string[] };
type KeyStatus = { has_key: boolean; active: boolean; key_version: number | null; rotated_at: string | null; revoked_at: string | null; property_verified: boolean };

export default function PublisherIntegration() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [servePlatform, setServePlatform] = useState("");
  const [serveFormat, setServeFormat] = useState("");
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusReady, setStatusReady] = useState(false);

  async function loadKeyStatus(id: string) {
    if (!supabase || !id) { setKeyStatus(null); setStatusReady(false); setStatusLoading(false); return; }
    setStatusReady(false);
    setStatusLoading(true);
    const { data, error: statusError } = await supabase.functions.invoke("publisher-tracking-key", { body: { action: "status", property_id: id } });
    if (statusError || !data?.success || !data?.status) {
      setKeyStatus(null);
      setError("Signing-key status could not be loaded. Retry before rotating or revoking a key.");
    } else {
      setKeyStatus(data.status as KeyStatus);
      setStatusReady(true);
    }
    setStatusLoading(false);
  }

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
        .from("publisher_properties")
        .select("id,name,property_type,url,verified,platforms,ad_formats")
        .eq("publisher_id", user.id)
        .order("created_at", { ascending: false });
      if (!live) return;
      if (queryError) setError("Your publisher properties could not be loaded.");
      else {
        const list = (data || []) as Property[];
        setProperties(list);
        const firstVerified = list.find(item => item.verified);
        setPropertyId(firstVerified?.id || "");
        setServePlatform(firstVerified?.platforms?.[0] || "");
        setServeFormat(firstVerified?.ad_formats?.[0] || "");
        if (firstVerified?.id) void loadKeyStatus(firstVerified.id);
        else { setKeyStatus(null); setStatusReady(false); }
      }
      setLoading(false);
    }
    void load();
    return () => { live = false; };
  }, []);

  async function issueKey() {
    if (!supabase || !propertyId || !selected?.verified || !statusReady) return;
    setBusy(true);
    setError("");
    setMessage("");
    setSecret("");
    const { data, error: invokeError } = await supabase.functions.invoke("publisher-tracking-key", {
      body: { action: "rotate", property_id: propertyId },
    });
    if (invokeError || !data?.tracking_secret) {
      setError(data?.error || invokeError?.message || "A tracking key could not be issued.");
      setBusy(false);
      return;
    }
    setSecret(String(data.tracking_secret));
    if (data.status) { setKeyStatus(data.status as KeyStatus); setStatusReady(true); }
    setMessage("A new property signing key was issued or rotated. This is the only time this key will be shown.");
    setBusy(false);
  }

  async function revokeKey() {
    if (!supabase || !propertyId || !keyStatus?.has_key || keyStatus.revoked_at) return;
    if (!window.confirm("Revoke this property's signing key now? Signed server events using it will be rejected.")) return;
    setBusy(true); setError(""); setMessage(""); setSecret("");
    const { data, error: invokeError } = await supabase.functions.invoke("publisher-tracking-key", {
      body: { action: "revoke", property_id: propertyId },
    });
    if (invokeError || !data?.success || !data?.status) {
      setError(data?.error || invokeError?.message || "The signing key could not be revoked.");
      setBusy(false); return;
    }
    setKeyStatus(data.status as KeyStatus); setStatusReady(true);
    setMessage("The property signing key has been revoked. Signed events using that key will no longer be accepted.");
    setBusy(false);
  }

  const selected = properties.find(property => property.id === propertyId) || null;
  const serveUrl = selected && servePlatform && serveFormat ? `https://wilfmtzxxnkdcyiozamq.supabase.co/functions/v1/serve-ad?property_id=${selected.id}&platform=${encodeURIComponent(servePlatform)}&format=${encodeURIComponent(serveFormat)}` : "";
  const serveSnippet = serveUrl ? `const response = await fetch(${JSON.stringify(serveUrl)});
const { ads } = await response.json();

// Render each approved campaign creative from ads[];
// attach the placement_key to your event tracker.` : "";

  return (
    <main className="formPage">
      <Link href="/publisher" className="back">← Publisher Delivery Center</Link>
      <div className="formCard wide">
        <span className="eyebrow">PUBLISHER SERVER INTEGRATION</span>
        <h1>Connect your inventory to <em>AdBridge tracking.</em></h1>
        <p>Website and app publishers send ad events from their own server. AdBridge checks property ownership, event signatures, duplicate IDs and fraud signals before events can qualify for payment.</p>

        {loading && <div className="successBox">Loading your publisher properties…</div>}
        {error && <div className="successBox" role="alert">{error}</div>}
        {!loading && (
          <>
            <label htmlFor="publisher-property">Verified website or app</label>
            <select id="publisher-property" className="textInput" value={propertyId} onChange={event => { const id = event.target.value; const next = properties.find(p => p.id === id); setPropertyId(id); setServePlatform(next?.platforms?.[0] || ""); setServeFormat(next?.ad_formats?.[0] || ""); setSecret(""); setMessage(""); setError(""); setKeyStatus(null); if (id) void loadKeyStatus(id); else { setStatusReady(false); setStatusLoading(false); } }} >
              <option value="">Choose a verified property</option>
              {properties.filter(property => property.verified).map(property => (
                <option value={property.id} key={property.id}>{property.name} · {property.property_type}</option>
              ))}
            </select>
            {selected && (
              <div className="infoBox">
                <b>{selected.name}</b>
                <p>{selected.property_type} · {selected.url || "No public URL saved"}</p>
                <p>Only the verified owner can issue a signing key for this property.</p>
              </div>
            )}            {selected && (
              <div className="infoBox">
                <b>Server signing key</b>
                {statusLoading ? <p>Checking key status…</p> : keyStatus?.has_key ? (
                  <>
                    <p><strong>{keyStatus.active ? "Active" : keyStatus.revoked_at ? "Revoked" : "Inactive — property not verified"}</strong> · Version {keyStatus.key_version ?? "—"}</p>
                    {keyStatus.rotated_at && <p>Last issued or rotated: {new Date(keyStatus.rotated_at).toLocaleString()}</p>}
                    {keyStatus.revoked_at && <p>Revoked: {new Date(keyStatus.revoked_at).toLocaleString()}</p>}
                  </>
                ) : <p>No signing key has been issued for this property.</p>}
              </div>
            )}
            {!properties.some(property => property.verified) && (
              <div className="successBox">No verified properties yet. Add your website or app in the Publisher Delivery Center and wait for AdBridge review before requesting a key.</div>
            )}
            <button className="primary" disabled={busy || statusLoading || !statusReady || !propertyId || !selected?.verified} onClick={() => void issueKey()}>
              {busy ? "Saving secure key…" : keyStatus?.active ? "Rotate server signing key →" : "Issue server signing key →"}
            </button>
            {keyStatus?.has_key && !keyStatus.revoked_at && (
              <button className="secondary" disabled={busy || statusLoading} onClick={() => void revokeKey()}>
                Revoke active signing key
              </button>
            )}
          </>
        )}

        {message && <div className="successBox">{message}</div>}
        {secret && (
          <div className="unlockBox">
            <span className="eyebrow">SHOWN ONCE · STORE SERVER-SIDE ONLY</span>
            <h2>Your property signing secret</h2>
            <textarea className="textInput" readOnly rows={3} value={secret} />
            <button className="secondary" onClick={() => {
              void navigator.clipboard.writeText(secret).then(() => setMessage("Signing key copied. Store it in your private server environment."));
            }}>Copy signing key</button>
            <p><b>Important:</b> Do not place this key in browser JavaScript, a public repository, or a public Android/iOS app bundle. Issuing another key rotates the old one.</p>
          </div>
        )}

        <div className="quick">
          <h2>1. Fetch approved campaign ads</h2>
          <p>Select the verified property, platform and format. AdBridge returns only placements approved for that property and campaign, with the campaign live/funded and the creative URL/destination included.</p>
          {selected && <>
            <label>Platform</label>
            <select className="textInput" value={servePlatform} onChange={event => {setServePlatform(event.target.value);setServeFormat(selected.ad_formats?.[0]||"");}}>
              {(selected.platforms||[]).map(platform=><option key={platform} value={platform}>{platform.replaceAll("_"," ")}</option>)}
            </select>
            <label>Format</label>
            <select className="textInput" value={serveFormat} onChange={event=>setServeFormat(event.target.value)}>
              {(selected.ad_formats||[]).map(format=><option key={format} value={format}>{format.replaceAll("_"," ")}</option>)}
            </select>
            {serveSnippet&&<div className="unlockBox"><b>Fetch approved ads</b><pre style={{whiteSpace:"pre-wrap",overflowX:"auto"}}>{serveSnippet}</pre><button className="secondary" onClick={()=>void navigator.clipboard.writeText(serveSnippet).then(()=>setMessage("Ad fetch snippet copied."))}>Copy snippet</button></div>}
          </>}
          <h2>2. Send verified event signals</h2>
          <ol>
            <li>Fetch approved campaign ads using the property ID, platform and ad format. Render the returned creative and destination URL.</li>
            <li>Keep the signing secret in a private server environment variable.</li>
            <li>Build the exact event JSON on your server and sign <code>unix_timestamp_seconds + "." + exact_request_body</code> using HMAC-SHA256.</li>
            <li>Send the event to the AdBridge <code>track-ad-event</code> endpoint with <code>x-adbridge-timestamp</code> and <code>x-adbridge-signature</code> headers. Use the placement key returned from the ad fetch endpoint.</li>
            <li>For native apps, also send <code>x-adbridge-app-id</code> matching the verified app identifier.</li>
            <li>Use a unique event ID for every event. Duplicate events are rejected; browser-only telemetry is not automatically payable.</li>
          </ol>
          <p>Supported event types include impression, click, video_view, install and conversion. Only events that pass AdBridge's verification and fraud assessment can qualify for publisher earnings.</p>
          <Link href="/publisher/applications">View campaign application decisions →</Link>
        </div>
        <div className="infoBox">
          <b>Technical reference</b>
          <p>The complete signing contract and example payloads are maintained in the AdBridge repository.</p>
          <a href="https://github.com/musicpromo4444/adbridge-platform/blob/main/docs/publisher-event-signing.md" target="_blank" rel="noreferrer">Open publisher event signing guide ↗</a>
        </div>
      </div>
    </main>
  );
}
