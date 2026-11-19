"use client";
import Link from "next/link";import{useSearchParams}from"next/navigation";import{useState}from"react";import{supabase}from"@/lib/supabase";
const assetMap:Record<string,string>={"Product photos/video":"product_media","Product or sample":"sample","Logo + brand assets":"brand_assets","Website/app link":"website_app_link"};
export default function Fund(){const p=useSearchParams();const[campaignId,setCampaignId]=useState(""),[saving,setSaving]=useState(false),[paying,setPaying]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState(false);
const goal=p.get("goal")||"video",platforms=p.get("platforms")||"tiktok",method=p.get("method")||"job",formats=p.get("formats")||"web";const name=p.get("name")||"Untitled campaign",instructions=p.get("instructions")||"",assets=p.get("assets")||"",destination=p.get("destination")||"",assetPaths=p.get("assetPaths")||"",rate=p.get("rate")||"0",budget=p.get("budget")||"0",results=p.get("results")||"0";
const platformMeta:Record<string,{label:string}>={instagram:{label:"Instagram"},tiktok:{label:"TikTok"},youtube:{label:"YouTube"},facebook:{label:"Facebook"},x:{label:"X"},snapchat:{label:"Snapchat"},linkedin:{label:"LinkedIn"},website:{label:"Website"},web_app:{label:"Web App"},android_app:{label:"Android App"},ios_app:{label:"iOS App"}};
const selectedPlatforms=platforms.split(",").map(x=>x.trim()).filter(x=>platformMeta[x]);
const label=method==="cpm"?"CPM":method==="cpc"?"CPC":method==="cpi"?"CPI":method==="cpa"?"CPA":method==="link_traffic"?"Link traffic":method==="product_placement"?"Product placement":method==="brand_mention"?"Brand mention":method==="partnership"?"Partnership":"Creator post/job";
async function createCampaign(){
if(!supabase){setError("Database connection is not ready.");return}
const{data:{user},error:authError}=await supabase.auth.getUser();
if(authError||!user){location.href="/login";return}
if(!name.trim()||!instructions.trim()){setError("Add a campaign name and clear creator instructions first.");return}
if(!selectedPlatforms.length){setError("Select at least one target platform.");return}
const selectedFormats=formats.split(",").map(x=>x.trim()).filter(Boolean);
if(!selectedFormats.length){setError("Select at least one delivery format.");return}
const numericRate=Number(rate),numericBudget=Number(budget),numericResults=Number(results.replaceAll(",",""));
if(!Number.isFinite(numericRate)||numericRate<=0){setError("Enter a valid payment rate or agreed creator fee greater than zero.");return}
if(!Number.isFinite(numericBudget)||numericBudget<=0){setError("Enter a maximum campaign budget greater than zero.");return}
if(!Number.isFinite(numericResults)||numericResults<=0){setError("Enter a target result greater than zero.");return}
if(["cpc","link_traffic","cpi","cpa"].includes(method)){
try{const u=new URL(destination);if(!["http:","https:"].includes(u.protocol))throw new Error()}
catch{setError("Add a valid website or app destination URL.");return}
}
const selectedAssetTypes=assets.split(",").map(x=>assetMap[x]).filter(Boolean);
const uploadedPaths=assetPaths.split(",").map(x=>x.trim()).filter(Boolean);
const uploadedUrls=uploadedPaths.map(path=>supabase!.storage.from("campaign-assets").getPublicUrl(path).data.publicUrl);
setSaving(true);setError("");
const{data,error:e}=await supabase.rpc("create_advertiser_campaign",{
p_name:name.trim(),
p_goal:goal,
p_instructions:instructions.trim(),
p_platforms:selectedPlatforms,
p_formats:selectedFormats,
p_payment_method:method,
p_payment_rate:numericRate,
p_max_budget:numericBudget,
p_desired_results:Math.floor(numericResults),
p_destination_url:destination.trim()||null,
p_asset_types:selectedAssetTypes,
p_asset_urls:uploadedUrls
});
if(e||!data?.campaign_id){
setError(e?.message||"We couldn't create the campaign. Please check the details and try again.");
setSaving(false);return
}
setCampaignId(data.campaign_id);
setSaved(true);
setSaving(false)
}
async function pay(){if(!supabase||!campaignId)return;setPaying(true);setError("");const{data,error}=await supabase.functions.invoke("start-campaign-payment",{body:{campaign_id:campaignId}});if(error||data?.error){setError(data?.error||error?.message||"Payment could not be started.");setPaying(false);return}if(data?.authorization_url)location.href=data.authorization_url;else setError("Payment provider did not return a checkout URL.");setPaying(false)}
return <main className="formPage"><Link href={"/advertiser/new/payment?goal="+encodeURIComponent(goal)+"&platforms="+encodeURIComponent(platforms)} className="back">← Payment</Link><div className="formCard wide"><span className="eyebrow">STEP 4 OF 5</span><h1>Review and <em>fund your campaign.</em></h1><p>Review the campaign before saving it. Payment is handled by a configured provider.</p><div className="summary"><b>{name}</b><span>Campaign platforms: {selectedPlatforms.map(x=>platformMeta[x]?.label||x).join(" · ")}</span><span>Uploaded campaign files: {assetPaths.split(",").filter(Boolean).length}</span><span>Ad delivery formats: {formats.split(",").filter(Boolean).map(x=>({web_banner:"Web Banner",web_native:"Web Native",web_interstitial:"Web Interstitial",web_video:"Web Video",web:"Web",web_app:"Web App",app_banner:"App Banner",app_native:"App Native",app_interstitial:"App Interstitial",app_video:"App Video",app_rewarded_video:"Rewarded Video",android_app:"Android App",ios_app:"iOS App",social_post:"Social Post",social_story:"Social Story",social_reel:"Social Reel",social_video:"Social Video"} as Record<string,string>)[x]||x).join(" · ")}</span><span>Payment model: {label}</span><span>Rate / fee: ₦{Number(rate||0).toLocaleString()}</span><span>Maximum budget: ₦{Number(budget||0).toLocaleString()}</span>{destination&&<span>Destination: {destination}</span>}</div><div className="infoBox"><b>Real payment only</b><p>AdBridge will never mark a campaign funded because a budget was entered. A campaign becomes funded only after the payment provider confirms the payment.</p></div>{error&&<div className="successBox">{error}</div>}{!saved?<button className="primary fullButton" disabled={saving} onClick={createCampaign}>{saving?"Saving campaign…":"Save campaign draft →"}</button>:<><div className="successBox"><b>Draft saved.</b><br/>Your campaign is not live yet. Complete payment to fund it.</div><button className="primary fullButton" disabled={paying} onClick={pay}>{paying?"Opening secure checkout…":"Pay securely with Paystack →"}</button><Link className="secondary fullButton" href="/advertiser">Keep as draft</Link></>}</div></main>}