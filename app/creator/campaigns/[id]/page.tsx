"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Campaign={id:string;name:string;goal:string;instructions:string|null;platform:string|null;payment_method:string|null;payment_rate:number|null;max_budget:number|null};
type Asset={asset_type:string;asset_url:string|null};type CampaignFormat={format:string;status:string;requirements:string};
type CampaignTest={id:string;title:string;instructions:string;action_label:string;action_url:string|null;required:boolean};

export default function CampaignDetails(){
 const params=useParams<{id:string}>();const [campaign,setCampaign]=useState<Campaign|null>(null);const [assets,setAssets]=useState<Asset[]>([]);const [formats,setFormats]=useState<CampaignFormat[]>([]);const [campaignTest,setCampaignTest]=useState<CampaignTest|null>(null);const [loading,setLoading]=useState(true);const [phase,setPhase]=useState<"locked"|"understand"|"test"|"unlocked"|"verification">("locked");const [saving,setSaving]=useState(false);const [error,setError]=useState("");const [verificationRequired,setVerificationRequired]=useState(false);
 const storageKey="adbridge-unlocked-"+params.id;
 useEffect(()=>{async function load(){if(!supabase){setError("AdBridge database is not connected yet.");setLoading(false);return}const [{data,error:campaignError},{data:assetData},{data:formatData},{data:testData,error:testError},{data:settings}]=await Promise.all([
  supabase.from("campaigns").select("id,name,goal,instructions,platform,payment_method,payment_rate,max_budget").eq("id",params.id).single(),
  supabase.from("campaign_assets").select("asset_type,asset_url").eq("campaign_id",params.id),
  supabase.from("campaign_formats").select("format,status,requirements").eq("campaign_id",params.id),
  supabase.from("campaign_tests").select("id,title,instructions,action_label,action_url,required").eq("campaign_id",params.id).eq("required",true).order("created_at",{ascending:false}).limit(1).maybeSingle(),
  supabase.from("platform_settings").select("require_creator_verification").eq("id",1).maybeSingle()
 ]);
 if(campaignError||!data){setError("This campaign could not be found.");setLoading(false);return}if(testError){setError("The campaign test could not be loaded.");setLoading(false);return}
 setCampaign(data);setAssets(assetData??[]);setFormats(formatData??[]);setCampaignTest(testData??null);const required=Boolean(settings?.require_creator_verification);setVerificationRequired(required);
 const {data:{user}}=await supabase.auth.getUser();const creatorId=user?.id||null;let alreadyAccepted=false;
 if(creatorId){const {data:job}=await supabase.from("creator_campaigns").select("id,status").eq("campaign_id",params.id).eq("creator_id",creatorId).limit(1).maybeSingle();alreadyAccepted=Boolean(job)}
 if(localStorage.getItem(storageKey)==="yes"||alreadyAccepted)setPhase("unlocked");
 setLoading(false)}load()},[params.id,storageKey]);

 async function getCreatorId(){if(!supabase)return null;const {data:{user}}=await supabase.auth.getUser();if(!user)return null;const {data}=await supabase.from("profiles").select("id").eq("id",user.id).maybeSingle();return data?.id||null}

 async function completeTest(){setSaving(true);setError("");if(supabase&&campaignTest){const creatorId=await getCreatorId();if(!creatorId){setError("We could not create your creator profile yet.");setSaving(false);return}const {error:e}=await supabase.from("creator_campaign_tests").insert({campaign_test_id:campaignTest.id,creator_id:creatorId,understood:true,action_started:true,completed:true,completed_at:new Date().toISOString()});if(e){setError("We couldn't save the test completion yet.");setSaving(false);return}}localStorage.setItem(storageKey,"yes");setPhase("unlocked");setSaving(false)}

 if(loading)return <main className="formPage"><div className="formCard"><span className="eyebrow">CAMPAIGN</span><h1>Loading...</h1></div></main>;
 if(error||!campaign)return <main className="formPage"><Link href="/creator/campaigns" className="back">← Campaigns</Link><div className="formCard"><div className="successBox">{error||"Campaign unavailable."}</div></div></main>;
 const actionAsset=assets.find(a=>a.asset_type==="website_app_link"&&a.asset_url)||null;const formatNames:Record<string,string>={web:"Web",web_app:"Web App",android_app:"Android App",ios_app:"iOS App"};

 return <main className="formPage"><Link href="/creator/campaigns" className="back">← Campaigns</Link><div className="formCard wide">
 <span className="eyebrow">CAMPAIGN DETAILS</span><div className="lockHero"><div className="lockIcon">{phase==="unlocked"?"🔓":"🔒"}</div><div><h1>{campaign.name}</h1><p>{phase==="unlocked"?"Campaign unlocked. You can now participate.":"Complete the short campaign test before you can participate."}</p></div></div>
 <div className="detailGrid"><section><h2>What the advertiser wants</h2><p><strong>Goal:</strong> {campaign.goal}</p><p>{campaign.instructions||"Follow the advertiser's campaign instructions carefully."}</p>{campaign.platform&&<p><strong>Platform:</strong> {campaign.platform}</p>}</section><aside><span className="eyebrow">PAYMENT</span><h2>₦{Number(campaign.payment_rate??0).toLocaleString()}</h2><p>Payment is released after your completed work is approved.</p></aside></div>

 {phase==="locked"&&<div className="testModalBackdrop"><div className="testModal"><div className="lockIcon">🔒</div><span className="eyebrow">CAMPAIGN LOCKED</span><h2>Before you participate</h2><p>{campaign.instructions||"Read the campaign instructions carefully. You will need to understand and follow them before you can join."}</p><p className="modalHint">Do you understand what this advertiser wants you to do?</p><div className="choiceRow"><button className="primary" onClick={()=>setPhase("understand")}>Yes, I understand →</button><button className="secondary" onClick={()=>setPhase("locked")}>No, I don't</button></div></div></div>}
 {phase==="understand"&&<div className="unlockBox"><span className="eyebrow">STEP 1 · UNDERSTANDING CHECK</span><h2>Good. Now prove you understand it.</h2><p>{campaignTest?.instructions||"The advertiser requires a short understanding check before participation."}</p><div className="choiceRow"><button className="primary" onClick={()=>setPhase("test")}>Continue to test →</button><button className="secondary" onClick={()=>setPhase("locked")}>Show me again</button></div></div>}
 {phase==="test"&&<div className="unlockBox"><span className="eyebrow">STEP 2 · CAMPAIGN TEST</span><h2>{campaignTest?.title||"Complete this short campaign test"}</h2><p>{campaignTest?.instructions||"Review the campaign instructions, then confirm that you understand what a viewer must do."}</p>{campaignTest?.action_url&&<a className="secondary" href={campaignTest.action_url} target="_blank" rel="noreferrer">{campaignTest.action_label||"Open campaign resource"} ↗</a>}{actionAsset?.asset_url&&<a className="secondary" href={actionAsset.asset_url} target="_blank" rel="noreferrer">Open advertiser link ↗</a>}<button className="primary" disabled={saving} onClick={completeTest}>{saving?"Saving…":"I completed the test →"}</button><small>The completion is saved in AdBridge before the campaign is unlocked.</small></div>}
 {error&&<div className="successBox">{error}</div>}
 {phase==="unlocked"&&<><CampaignRequirements campaign={campaign}/><AcceptCampaign campaignId={campaign.id} getCreatorId={getCreatorId} verificationRequired={verificationRequired}/></>}
 </div></main>
}

function AcceptCampaign({campaignId,getCreatorId,verificationRequired}:{campaignId:string;getCreatorId:()=>Promise<string|null>;verificationRequired:boolean}){
 const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 async function accept(){if(!supabase)return;setBusy(true);setError("");const creatorId=await getCreatorId();if(!creatorId){setError("We could not create your creator profile yet.");setBusy(false);return}
  if(verificationRequired){const {data:profile}=await supabase.from("profiles").select("verified,role").eq("id",creatorId).single();if(!profile?.verified){setError("This campaign requires a verified creator. Please wait for AdBridge verification before accepting it.");setBusy(false);return}}
  const {data:existing}=await supabase.from("creator_campaigns").select("id").eq("campaign_id",campaignId).eq("creator_id",creatorId).limit(1).maybeSingle();
  if(existing?.id){const ids=JSON.parse(localStorage.getItem("adbridge-jobs")||"[]") as string[];if(!ids.includes(existing.id))ids.push(existing.id);localStorage.setItem("adbridge-jobs",JSON.stringify(ids));window.location.href="/creator/work";return}
  const {data,error:e}=await supabase.from("creator_campaigns").insert({campaign_id:campaignId,creator_id:creatorId,status:"accepted"}).select("id").single();if(e||!data){setError(e?.message||"Could not accept campaign.");setBusy(false);return}
  const ids=JSON.parse(localStorage.getItem("adbridge-jobs")||"[]") as string[];if(!ids.includes(data.id))ids.push(data.id);localStorage.setItem("adbridge-jobs",JSON.stringify(ids));window.location.href="/creator/work";
 }
 return <div className="unlockBox"><div className="successBox">✓ You completed the campaign test.</div><h2>Campaign unlocked</h2><p>{verificationRequired?"Your creator verification is required before you can accept this campaign.":"You have shown that you understand what the advertiser wants. You can now participate."}</p>{error&&<div className="successBox">{error}</div>}<button className="primary" disabled={busy} onClick={accept}>{busy?"Checking…":"Accept & start campaign →"}</button></div>
}
function CampaignRequirements({campaign}:{campaign:Campaign}){const m=(campaign.payment_method||"").toLowerCase();const p=campaign.platform||"";const auto=["views","cpm"].includes(m)&&!!p;return <div className="unlockBox"><span className="eyebrow">BEFORE YOU START</span><h2>Creator steps</h2><ol><li>Create and publish the required content exactly as instructed.</li>{auto&&<li>Connect your {p} account to AdBridge so results can be verified.</li>}<li>Keep the post public while the campaign is active.</li>{auto&&<li>AdBridge will check and record the campaign metric automatically.</li>}{!auto&&<li>Submit your published post link and any proof requested by the advertiser.</li>}<li>Payment is released according to the campaign payment rules after verification or approval.</li></ol>{auto&&<Link className="secondary" href="/creator/connections">Connect {p} account →</Link>}{auto&&(m==="views"||m==="cpm")&&<p><small>AdBridge verifies total views, not unique viewers.</small></p>}</div>}
