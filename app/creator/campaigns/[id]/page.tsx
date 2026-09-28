"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Campaign = {
  id: string; name: string; goal: string; instructions: string | null;
  platform: string | null; payment_method: string | null;
  payment_rate: number | null; max_budget: number | null;
};
type Asset = { asset_type: string; asset_url: string | null };
type CampaignTest = { id: string; title: string; instructions: string; action_label: string; action_url: string | null; required: boolean };

export default function CampaignDetails({ params }: { params: { id: string } }) {
  const [campaign,setCampaign]=useState<Campaign|null>(null);
  const [assets,setAssets]=useState<Asset[]>([]);
  const [campaignTest,setCampaignTest]=useState<CampaignTest|null>(null);
  const [loading,setLoading]=useState(true);
  const [phase,setPhase]=useState<"locked"|"understand"|"test"|"unlocked">("locked");
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");

  const storageKey="adbridge-unlocked-"+params.id;

  useEffect(()=>{
    if(localStorage.getItem(storageKey)==="yes") setPhase("unlocked");
    async function load(){
      if(!supabase){setError("AdBridge database is not connected yet.");setLoading(false);return}
      const [{data,error:campaignError},{data:assetData},{data:testData,error:testError}]=await Promise.all([
        supabase.from("campaigns").select("id,name,goal,instructions,platform,payment_method,payment_rate,max_budget").eq("id",params.id).single(),
        supabase.from("campaign_assets").select("asset_type,asset_url").eq("campaign_id",params.id),
        supabase.from("campaign_tests").select("id,title,instructions,action_label,action_url,required").eq("campaign_id",params.id).eq("required",true).order("created_at",{ascending:false}).limit(1).maybeSingle()
      ]);
      if(campaignError||!data){setError("This campaign could not be found.");setLoading(false);return}
      if(testError){setError("The campaign test could not be loaded.");setLoading(false);return}
      setCampaign(data); setAssets(assetData??[]); setCampaignTest(testData??null); setLoading(false);
    }
    load();
  },[params.id,storageKey]);

  if(loading)return <main className="formPage"><div className="formCard"><span className="eyebrow">CAMPAIGN</span><h1>Loading...</h1></div></main>;
  if(error||!campaign)return <main className="formPage"><Link href="/creator/campaigns" className="back">← Campaigns</Link><div className="formCard"><div className="successBox">{error||"Campaign unavailable."}</div></div></main>;

  const actionAsset=assets.find(a=>a.asset_type==="website_app_link"&&a.asset_url)||null;

  async function completeTest(){
    setSaving(true); setError("");
    if(supabase&&campaignTest){
      const {error:e}=await supabase.from("creator_campaign_tests").insert({
        campaign_test_id:campaignTest.id, creator_id:null, understood:true, action_started:true, completed:true, completed_at:new Date().toISOString()
      });
      if(e){setError("We couldn't save the test completion yet.");setSaving(false);return}
    }
    localStorage.setItem(storageKey,"yes"); setPhase("unlocked"); setSaving(false);
  }

  return <main className="formPage">
    <Link href="/creator/campaigns" className="back">← Campaigns</Link>
    <div className="formCard wide">
      <span className="eyebrow">CAMPAIGN DETAILS</span>
      <div className="lockHero"><div className="lockIcon">{phase==="unlocked"?"🔓":"🔒"}</div><div><h1>{campaign.name}</h1><p>{phase==="unlocked"?"Campaign unlocked. You can now participate.":"Complete the short campaign test before you can participate."}</p></div></div>

      <div className="detailGrid">
        <section><h2>What the advertiser wants</h2><p><strong>Goal:</strong> {campaign.goal}</p><p>{campaign.instructions||"Follow the advertiser's campaign instructions carefully."}</p>{campaign.platform&&<p><strong>Platform:</strong> {campaign.platform}</p>}</section>
        <aside><span className="eyebrow">PAYMENT</span><h2>₦{Number(campaign.payment_rate??0).toLocaleString()}</h2><p>Payment is released after your completed work is approved.</p></aside>
      </div>

      {phase==="locked"&&<div className="testModalBackdrop"><div className="testModal"><div className="lockIcon">🔒</div><span className="eyebrow">CAMPAIGN LOCKED</span><h2>Before you participate</h2><p>{campaign.instructions||"Read the campaign instructions carefully. You will need to understand and follow them before you can join."}</p><p className="modalHint">Do you understand what this advertiser wants you to do?</p><div className="choiceRow"><button className="primary" onClick={()=>setPhase("understand")}>Yes, I understand →</button><button className="secondary" onClick={()=>setPhase("locked")}>No, I don't</button></div></div></div>}

      {phase==="understand"&&<div className="unlockBox"><span className="eyebrow">STEP 1 · UNDERSTANDING CHECK</span><h2>Good. Now prove you understand it.</h2><p>{campaignTest?.instructions||"The advertiser requires a short understanding check before participation."}</p><div className="choiceRow"><button className="primary" onClick={()=>setPhase("test")}>Continue to test →</button><button className="secondary" onClick={()=>setPhase("locked")}>Show me again</button></div></div>}

      {phase==="test"&&<div className="unlockBox"><span className="eyebrow">STEP 2 · CAMPAIGN TEST</span><h2>{campaignTest?.title||"Complete this short campaign test"}</h2><p>{campaignTest?.instructions||"Review the campaign instructions, then confirm that you understand what a viewer must do."}</p>{campaignTest?.action_url&&<a className="secondary" href={campaignTest.action_url} target="_blank" rel="noreferrer">{campaignTest.action_label||"Open campaign resource"} ↗</a>}{actionAsset?.asset_url&&<a className="secondary" href={actionAsset.asset_url} target="_blank" rel="noreferrer">Open advertiser link ↗</a>}<button className="primary" disabled={saving} onClick={completeTest}>{saving?"Saving…":"I completed the test →"}</button><small>The completion is saved in AdBridge before the campaign is unlocked.</small></div>}

      {error&&<div className="successBox">{error}</div>}

      {phase==="unlocked"&&<div className="unlockBox"><div className="successBox">✓ You completed the campaign test.</div><h2>Campaign unlocked</h2><p>You have shown that you understand what the advertiser wants. You can now participate.</p><Link className="primary" href={"/creator/work?campaign="+campaign.id}>Accept & start campaign →</Link></div>}
    </div>
  </main>;
}
