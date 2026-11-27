"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const platforms = ["TikTok", "Instagram", "YouTube", "Facebook", "X", "Snapchat", "LinkedIn"];

export default function Profile() {
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("TikTok");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    let live = true;
    async function load() {
      if (!supabase) { setError("AdBridge database connection is not ready."); setLoading(false); return; }
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) { window.location.href = "/login"; return; }
      const { data, error: queryError } = await supabase.from("profiles").select("display_name,platform,bio,role").eq("id", user.id).maybeSingle();
      if (!live) return;
      if (queryError) setError("Your creator profile could not be loaded. Please refresh.");
      else if (data?.role !== "creator") { window.location.href = "/"; return; }
      else { setName(data.display_name || ""); setPlatform(data.platform || "TikTok"); setBio(data.bio || ""); }
      setLoading(false);
    }
    void load();
    return () => { live = false; };
  }, []);

  async function save() {
    if (!supabase) { setError("AdBridge database connection is not ready."); return; }
    if (!name.trim()) { setError("Enter your creator name before saving."); return; }
    setSaving(true); setError(""); setSaved("");
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) { setError("Your session expired. Please sign in again."); setSaving(false); return; }
    const { error: updateError } = await supabase.from("profiles").update({ display_name: name.trim(), platform, bio: bio.trim() }).eq("id", user.id);
    if (updateError) setError("Profile save failed. Check your details and try again.");
    else setSaved("Creator profile updated.");
    setSaving(false);
  }

  return <main className="formPage"><Link href="/creator" className="back">← Creator Dashboard</Link><div className="formCard">
    <span className="eyebrow">CREATOR PROFILE</span><h1>Make your profile <em>ready.</em></h1>
    <p>Keep your public creator name, primary platform and bio current so advertisers can understand your profile.</p>
    {loading ? <div className="successBox">Loading profile…</div> : <>
      {error && <div className="successBox" role="alert">{error}</div>}
      {saved && <div className="successBox" role="status">✓ {saved}</div>}
      <label>Creator name</label><input className="textInput" value={name} onChange={e => setName(e.target.value)} placeholder="Your creator name" maxLength={100}/>
      <label>Main platform</label><div className="choices">{platforms.map(x=><button type="button" key={x} className={platform===x?"selected":""} onClick={()=>setPlatform(x)}>{x}</button>)}</div>
      <label>About you</label><textarea value={bio} onChange={e=>setBio(e.target.value)} placeholder="Tell advertisers what you create." maxLength={1000}/>
      <button className="primary" disabled={saving} onClick={()=>void save()}>{saving?"Saving…":"Save profile"}</button>
      <Link className="secondary" href="/creator/connections">Connect social accounts →</Link>
    </>}
  </div></main>;
}
