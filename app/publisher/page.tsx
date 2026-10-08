"use client";
import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {supabase} from "@/lib/supabase";

type Campaign={id:string;name:string;goal:string;platform:string|null;status:string};
type Format={campaign_id:string;format:string;status:string;requirements:string|null};
type Target={campaign_id:string;platform:string};
type Property={id:string;property_type:string;name:string;url:string|null;platforms:string[];ad_formats:string[];verified:boolean};

const platforms=[["instagram","Instagram"],["tiktok","TikTok"],["youtube","YouTube"],["facebook","Facebook"],["x","X"],["snapchat","Snapchat"],["linkedin","LinkedIn"],["website","Website"],["web_app","Web App"],["android_app","Android App"],["ios_app","iOS App"],["mobile_app","Mobile App"]];
const formats=[["web","Web"],["web_app","Web App"],["android_app","Android App"],["ios_app","iOS App"],["social_post","Social Post"],["social_story","Social Story"],["social_reel","Social Reel"],["social_video","Social Video"],["web_banner","Web Banner"],["web_native","Web Native"],["web_interstitial","Web Interstitial"],["web_video","Web Video"],["app_banner","App Banner"],["app_native","App Native"],["app_interstitial","App Interstitial"],["app_video","App Video"],["app_rewarded_video","Rewarded Video"]];
const label=(items:string[],map:Array<[string,string]>)=>items.map(x=>map.find(m=>m[0]===x)?.[1]||x).join(" · ");

export default function PublisherCenter(){
 const[campaigns,setCampaigns]=useState<Campaign[]>([]),[targets,setTargets]=useState<Target[]>([]),[allFormats,setAllFormats]=useState<Format[]>([]),[properties,setProperties]=useState<Property[]>([]);
 const[campaignId,setCampaignId]=useState(""),[selectedPlatforms,setSelectedPlatforms]=useState<string[]>([]),[selectedFormats,setSelectedFormats]=useState<string[]>([]),[propertyType,setPropertyType]=useState("website"),[propertyName,setPropertyName]=useState(""),[propertyUrl,setPropertyUrl]=useState(""),[saving,setSaving]=useState(false),[loading,setLoading]=useState(true),[message,setMessage]=useState(""),[error,setError]=useState("");

 async function load(){
  if(!supabase){setError("AdBridge database is not connected.");setLoading(false);return}
  const{data:{user}}=await supabase.auth.getUser(); if(!user){location.href="/login";return}
  const [{data:cs},{data:ts},{data:fs},{data:ps}]=await Promise.all([
   supabase.from("campaigns").select("id,name,goal,platform,status").eq("status","active").order("created_at",{ascending:false}),
   supabase.from("campaign_platforms").select("campaign_id,platform"),
   supabase.from("campaign_formats").select("campaign_id,format,status,requirements"),
   supabase.from("publisher_properties").select("id,property_type,name,url,platforms,ad_formats,verified").eq("publisher_id",user.id).order("created_at",{ascending:false})
  ]);
  setCampaigns(cs??[]);setTargets(ts??[]);setAllFormats(fs??[]);setProperties((ps??[]) as Property[]);
  if(cs?.[0])setCampaignId(cs[0].id);setLoading(false);
 }
 useEffect(()=>{load()},[]);

 const campaign=campaigns.find(c=>c.id===campaignId);
 const campaignTargets=useMemo(()=>targets.filter(t=>t.campaign_id===campaignId),[targets,campaignId]);
 const campaignFormats=useMemo(()=>allFormats.filter(f=>f.campaign_id===campaignId),[allFormats,campaignId]);
 const compatiblePlatforms=useMemo(()=>campaignTargets.some(t=>t.platform==="all")?platforms:platforms.filter(p=>campaignTargets.some(t=>t.platform===p[0])),[campaignTargets]);
 const compatibleFormats=campaignFormats.filter(f=>f.status!=="unavailable");
 const allPlatformSelected=compatiblePlatforms.length>0&&selectedPlatforms.length===compatiblePlatforms.length;
 const allFormatSelected=compatibleFormats.length>0&&selectedFormats.length===compatibleFormats.length;

 useEffect(()=>{setSelectedPlatforms([]);setSelectedFormats([])},[campaignId]);
 function toggle(setter:React.Dispatch<React.SetStateAction<string[]>>,id:string){setter(a=>a.includes(id)?a.filter(x=>x!==id):[...a,id])}
 function toggleAllPlatforms(){setSelectedPlatforms(allPlatformSelected?[]:compatiblePlatforms.map(x=>x[0]))}
 function toggleAllFormats(){setSelectedFormats(allFormatSelected?[]:compatibleFormats.map(x=>x.format))}

 async function saveProperty(){
  if(!supabase)return; const{data:{user}}=await supabase.auth.getUser();if(!user)return;
  if(!propertyName.trim()||!propertyUrl.trim()){setError("Add a property name and valid URL.");return}
  try{const u=new URL(propertyUrl.trim());if(!["http:","https:"].includes(u.protocol))throw 0}catch{setError("Use a valid http or https URL.");return}
  setSaving(true);setError("");
  const{error:e}=await supabase.from("publisher_properties").insert({publisher_id:user.id,property_type:propertyType,name:propertyName.trim(),url:propertyUrl.trim(),platforms:selectedPlatforms.length?selectedPlatforms:[propertyType],ad_formats:selectedFormats});
  if(e)setError("We couldn't save this publisher property.");else{setMessage("Publisher property saved.");setPropertyName("");setPropertyUrl("");await load()}
  setSaving(false);
 }

 async function apply(){
  if(!supabase||!campaignId)return;
  if(!selectedPlatforms.length||!selectedFormats.length){setError("Select at least one platform and one format.");return}
  setSaving(true);setError("");setMessage("");
  const{data:{user}}=await supabase.auth.getUser();if(!user){location.href="/login";return}
  const{data:existing}=await supabase.from("publisher_campaigns").select("selected_platform,selected_format").eq("publisher_id",user.id).eq("campaign_id",campaignId);
  const seen=new Set((existing??[]).map(x=>x.selected_platform+"|"+x.selected_format));
  const rows:string[]=[];
  for(const platform of selectedPlatforms)for(const format of selectedFormats)if(!seen.has(platform+"|"+format))rows.push(platform+"|"+format);
  if(!rows.length){setMessage("You already applied for all selected combinations.");setSaving(false);return}
  const{error:e}=await supabase.from("publisher_campaigns").insert(rows.map(pair=>{const[platform,format]=pair.split("|");return{campaign_id:campaignId,publisher_id:user.id,selected_platform:platform,selected_format:format,status:"applied"}}));
  if(e)setError("We couldn't submit the publisher application.");else setMessage("Application submitted. AdBridge will show the matching delivery package when approved.");
  setSaving(false);
 }

 return <main className="formPage publisherPage">
  <div className="dashTop"><Link href="/" className="back">← AdBridge</Link><span className="testBadge">PUBLISHER DELIVERY CENTER</span><Link href="/creator" className="switch">Creator Dashboard →</Link></div>
  <div className="formCard wide">
   <span className="eyebrow">PUBLISHERS · WEBSITES · APPS</span><h1>Apply for ads on <em>the property you actually own.</em></h1>
   <p>AdBridge is not limited to social creators. Website owners, web apps, Android apps, iOS apps and social publishers can all apply for compatible campaigns.</p>
   {loading?<div className="successBox">Loading publisher opportunities…</div>:<>
    <label>1. Active campaign</label><select className="textInput" value={campaignId} onChange={e=>setCampaignId(e.target.value)}><option value="">Select a campaign</option>{campaigns.map(c=><option key={c.id} value={c.id}>{c.name} · {c.goal}</option>)}</select>
    {campaign&&<div className="infoBox"><b>{campaign.name}</b><p>Advertiser targeting: {campaignTargets.some(t=>t.platform==="all")?"All platforms":label(campaignTargets.map(t=>t.platform),platforms)}</p><p>Available formats: {campaignFormats.length} compatible format(s).</p></div>}
    <label>2. Platforms you can publish on</label><div className="formatChoiceGrid"><button type="button" className={"formatChoice all "+(allPlatformSelected?"selected":"")} onClick={toggleAllPlatforms}><strong>All compatible platforms</strong><small>Select every platform allowed by this campaign</small></button>{compatiblePlatforms.map(([id,title])=><button type="button" key={id} className={"formatChoice "+(selectedPlatforms.includes(id)?"selected":"")} onClick={()=>toggle(setSelectedPlatforms,id)}><strong>{title}</strong><small>Publisher inventory</small></button>)}</div>
    <label>3. Ad formats you can accept</label><div className="formatChoiceGrid"><button type="button" className={"formatChoice all "+(allFormatSelected?"selected":"")} onClick={toggleAllFormats}><strong>All compatible formats</strong><small>Choose every format this property supports</small></button>{compatibleFormats.map(f=><button type="button" key={f.format} className={"formatChoice "+(selectedFormats.includes(f.format)?"selected":"")} onClick={()=>toggle(setSelectedFormats,f.format)}><strong>{formats.find(x=>x[0]===f.format)?.[1]||f.format}</strong><small>{f.requirements||"AdBridge delivery format"}</small></button>)}</div>
    <label>4. Add your website or app property</label><div className="choices compact">{[["website","Website"],["web_app","Web App"],["android_app","Android App"],["ios_app","iOS App"]].map(([id,title])=><button type="button" key={id} className={propertyType===id?"selected":""} onClick={()=>setPropertyType(id)}>{title}</button>)}</div><input className="textInput" value={propertyName} onChange={e=>setPropertyName(e.target.value)} placeholder="Property name, e.g. My News Website"/><input className="textInput" value={propertyUrl} onChange={e=>setPropertyUrl(e.target.value)} placeholder="https://yourwebsite.com or app store URL"/>
    {properties.length>0&&<div className="infoBox"><b>Your saved publisher properties</b>{properties.map(p=><p key={p.id}>✓ {p.name} · {p.property_type} {p.verified?"· Verified":""}</p>)}</div>}
    {error&&<div className="successBox">{error}</div>}{message&&<div className="successBox">✓ {message}</div>}
    <div className="choiceRow"><button className="secondary" disabled={saving} onClick={saveProperty}>Save property</button><button className="primary" disabled={saving||!campaignId} onClick={apply}>{saving?"Saving…":"Apply for selected platforms →"}</button></div>
   </>}
   <div className="conversionInfo"><span className="eyebrow">HOW ADBRIDGE WORKS</span><div className="conversionGrid"><div><b>Advertiser</b><p>Chooses the platforms and ad formats.</p></div><div><b>Publisher</b><p>Chooses every compatible platform and format they support.</p></div><div><b>AdBridge</b><p>Matches the application to the correct delivery package and tracks the result.</p></div></div></div>
  </div>
 </main>
}