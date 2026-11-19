"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

const formats = [
  ["web","Web","Website / browser"],["web_app","Web App","Web application"],["android_app","Android App","Android application"],["ios_app","iOS App","iPhone / iPad application"],
  ["social_post","Social Post","Feed / timeline post"],["social_story","Social Story","Story placement"],["social_reel","Social Reel","Short vertical reel"],["social_video","Social Video","Video placement"],
  ["web_banner","Web Banner","Website banner"],["web_native","Web Native","Native website placement"],["web_interstitial","Web Interstitial","Full-screen web ad"],["web_video","Web Video","Website video"],
  ["app_banner","App Banner","In-app banner"],["app_native","App Native","Native in-app placement"],["app_interstitial","App Interstitial","Full-screen in-app ad"],["app_video","App Video","In-app video"],["app_rewarded_video","Rewarded Video","Rewarded video placement"]
];
const platforms = [
  ["instagram","Instagram"],["tiktok","TikTok"],["youtube","YouTube"],["facebook","Facebook"],["x","X"],["snapchat","Snapchat"],["linkedin","LinkedIn"],
  ["website","Website"],["web_app","Web App"],["android_app","Android App"],["ios_app","iOS App"]
];
const allowedTypes = ["image/jpeg","image/png","image/webp","video/mp4","application/pdf"];
const maxFileBytes = 100 * 1024 * 1024;

export default function Details() {
  const p = useSearchParams();
  const router = useRouter();
  const goal = p.get("goal") || "video";
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [assets, setAssets] = useState<string[]>([]);
  const [destination, setDestination] = useState("");
  const [selectedFormats, setSelectedFormats] = useState<string[]>(["web_banner"]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["tiktok"]);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const toggleAsset = (x: string) => setAssets(a => a.includes(x) ? a.filter(v => v !== x) : [...a, x]);
  const toggleFormat = (x: string) => setSelectedFormats(a => a.includes(x) ? a.filter(v => v !== x) : [...a, x]);
  const togglePlatform = (x: string) => setSelectedPlatforms(a => a.includes(x) ? a.filter(v => v !== x) : [...a, x]);
  const allFormats = selectedFormats.length === formats.length;
  const allPlatforms = selectedPlatforms.length === platforms.length;

  function chooseFiles(fileList: FileList | null) {
    if (!fileList) return;
    const picked = Array.from(fileList);
    if (picked.length > 5) { setFiles([]); setError("You can upload up to 5 campaign files."); return; }
    const invalid = picked.find(file => !allowedTypes.includes(file.type) || file.size > maxFileBytes);
    if (invalid) { setFiles([]); setError("Files must be JPG, PNG, WebP, MP4 or PDF, and each file must be 100 MB or smaller."); return; }
    setFiles(picked);
    setError("");
  }

  async function continueToPayment() {
    if (!selectedPlatforms.length || !selectedFormats.length) { setError("Choose at least one platform and one delivery format."); return; }
    if (!name.trim() || !instructions.trim()) { setError("Add a campaign name and clear partner instructions."); return; }
    setError("");
    setUploading(true);
    const uploadedPaths: string[] = [];
    if (files.length) {
      if (!supabase) { setError("AdBridge storage is not connected."); setUploading(false); return; }
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) { window.location.href = "/login"; return; }
      for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-100);
        const path = user.id + "/" + crypto.randomUUID() + "-" + safeName;
        const { error: uploadError } = await supabase.storage.from("campaign-assets").upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) {
          if (uploadedPaths.length) await supabase.storage.from("campaign-assets").remove(uploadedPaths);
          setError(uploadError.message || "A campaign file could not be uploaded.");
          setUploading(false);
          return;
        }
        uploadedPaths.push(path);
      }
    }
    const params = new URLSearchParams({
      goal,
      platforms: selectedPlatforms.join(","),
      name: name.trim(),
      instructions: instructions.trim(),
      assets: assets.join(","),
      destination: destination.trim(),
      formats: selectedFormats.join(","),
      assetPaths: uploadedPaths.join(",")
    });
    setUploading(false);
    router.push("/advertiser/new/payment?" + params.toString());
  }

  return (
    <main className="formPage">
      <Link href={"/advertiser/new?goal=" + encodeURIComponent(goal)} className="back">← Back</Link>
      <div className="formCard wide">
        <span className="eyebrow">STEP 2 OF 5</span>
        <h1>Tell AdBridge exactly <em>where and how to deliver it.</em></h1>
        <p>Set your campaign brief, target platforms and ad placements. Creators and publishers only receive compatible opportunities.</p>

        <label>Campaign name</label>
        <input className="textInput" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Summer product launch" />
        <label>What should the partner do?</label>
        <textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Describe what should be shown, said, posted, linked or achieved." />

        <label>What can you provide?</label>
        <div className="choices compact">
          {["Product photos/video","Product or sample","Logo + brand assets","Website/app link"].map(x => (
            <button type="button" key={x} className={assets.includes(x) ? "selected" : ""} onClick={() => toggleAsset(x)}>{x}</button>
          ))}
        </div>

        <label>Upload campaign media and brand files</label>
        <p className="fieldHint">Upload up to 5 files: JPG, PNG, WebP, MP4 or PDF. Maximum 100 MB each. These are campaign materials, not creator submissions.</p>
        <input className="textInput" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,application/pdf" multiple onChange={e => chooseFiles(e.target.files)} />
        {files.length > 0 && <div className="infoBox"><b>{files.length} file(s) selected</b>{files.map(file => <small key={file.name}>{file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB</small>)}</div>}

        <label>Target platforms</label>
        <p className="fieldHint">Choose one, several, or <b>All platforms</b>.</p>
        <div className="formatChoiceGrid">
          <button type="button" className={"formatChoice all " + (allPlatforms ? "selected" : "")} onClick={() => setSelectedPlatforms(allPlatforms ? [] : platforms.map(x => x[0]))}><strong>All platforms</strong><small>Social + Website + Web App + Android + iOS</small></button>
          {platforms.map(([id, title]) => <button type="button" key={id} className={"formatChoice " + (selectedPlatforms.includes(id) ? "selected" : "")} onClick={() => togglePlatform(id)}><strong>{title}</strong><small>{id.includes("app") ? "App inventory" : id === "website" ? "Website inventory" : "Social platform"}</small></button>)}
        </div>

        <label>Ad formats / placements</label>
        <p className="fieldHint">Choose one, several, or <b>All formats</b>.</p>
        <div className="formatChoiceGrid">
          <button type="button" className={"formatChoice all " + (allFormats ? "selected" : "")} onClick={() => setSelectedFormats(allFormats ? [] : formats.map(x => x[0]))}><strong>All formats</strong><small>Social + web + app placements</small></button>
          {formats.map(([id, title, desc]) => <button type="button" key={id} className={"formatChoice " + (selectedFormats.includes(id) ? "selected" : "")} onClick={() => toggleFormat(id)}><strong>{title}</strong><small>{desc}</small></button>)}
        </div>

        <label>Website / app destination URL</label>
        <input className="textInput" value={destination} onChange={e => setDestination(e.target.value)} placeholder="https://example.com" />
        <p className="fieldHint">Required if you choose CPC, link traffic, CPI or CPA. Optional for creator-post and placement campaigns.</p>

        {error && <div className="successBox" role="alert">{error}</div>}
        <button type="button" className="primary" disabled={uploading || !selectedPlatforms.length || !selectedFormats.length} onClick={continueToPayment}>
          {uploading ? "Uploading campaign files…" : "Continue →"}
        </button>
      </div>
    </main>
  );
}
