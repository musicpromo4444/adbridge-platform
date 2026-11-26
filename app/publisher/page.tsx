"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Campaign={id:string;name:string;goal:string;platform:string|null;status:string};
type Format={campaign_id:string;format:string;status:string;requirements:string|null};
type Target={campaign_id:string;platform:string};
type Property={id:string;property_type:string;name:string;url:string|null;platforms:string[];ad_formats:string[];verified:boolean};
type Application={status:string};
const platforms:Array<[string,string]>=[["website","Website"],["web_app","Web App"],["android_app","Android App"],["ios_app","iOS App"]];
const formats:Array<[string,string]>=[["web","Web"],["web_app","Web App"],["android_app","Android App"],["ios_app","iOS App"],["web_banner","Web Banner"],["web_native","Web Native"],["web_interstitial","Web Interstitial"],["web_video","Web Video"],["app_banner","App Banner"],["app_native","App Native"],["app_interstitial","App Interstitial"],["app_video","App Video"],["app_rewarded_video","Rewarded Video"]];
const propertyFormats:Record<string,string[]>={website:["web","web_banner","web_native","web_interstitial","web_video"],web_app:["web_app","web_banner","web_native","web_interstitial","web_video"],android_app:["android_app","app_banner","app_native","app_interstitial","app_video","app_rewarded_video"],ios_app:["ios_app","app_banner","app_native","app_interstitial","app_video","app_rewarded_video"]};
const label=(items:string[],map:Array<[string,string]>)=>items.map(x=>map.find(m=>m[0]===x)?.[1]||x).join(" · ");
const pretty=(v:string)=>v.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());

export default function PublisherCenter(){
 const[campaigns,setCampaigns]=useState<Campaign[]>([]),[targets,setTargets]=useState<Target[]>([]),[allFormats,setAllFormats]=useState<Format[]>([]),[properties,setProperties]=useState<Property[]>([]),[applications,setApplications]=useState<Application[]>([]);
 const[campaignId,setCampaignId]=useState(""),[selectedPropertyId,setSelectedPropertyId]=useState(""),[selectedPlatforms,setSelectedPlatforms]=useState<string[]>([]),[selectedFormats,setSelectedFormats]=useState<string[]>([]);
 const[propertyType,setPropertyType]=useState("website"),[propertyName,setPropertyName]=useState(""),[propertyUrl,setPropertyUrl]=useState(""),[propertyFormatsSelected,setPropertyFormatsSelected]=useState<string[]>([]),[editingId,setEditingId]=useState("");
 const[saving,setSaving]=useState(false),[loading,setLoading]=useState(true),[message,setMessage]=useState(""),[error,setError]=useState("");

 async function load(){
  if(!supabase){setError("AdBridge database is not connected.");setLoading(false);return}
  const{data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user){window.location.href="/login";return}
  const [c,t,f,p,a]=await Promise.all([
   supabase.from("campaigns").select("id,name,goal,platform,status").in("status",["active","funded"]).order("created_at",{ascending:false}),
   supabase.from("campaign_platforms").select("campaign_id,platform").eq("enabled",true),
   supabase.from("campaign_formats").select("campaign_id,format,status,requirements"),
   supabase.from("publisher_properties").select("id,property_type,name,url,platforms,ad_formats,verified").eq("publisher_id",user.id).order("created_at",{ascending:false}),
   supabase.from("publisher_campaigns").select("status").eq("publisher_id",user.id)
  ]);
  if(c.error||t.error||f.error||p.error||a.error)setError("Some dashboard data could not load. Refresh to retry.");
  setCampaigns(c.data??[]);setTargets(t.data??[]);setAllFormats(f.data??[]);setProperties((p.data??[]) as Property[]);setApplications((a.data??[]) as Application[]);
  if(c.data?.[0]&&!campaignId)setCampaignId(c.data[0].id);setLoading(false);
 }
 useEffect(()=>{void load()},[]);
 const campaign=campaigns.find(c=>c.id===campaignId);
 const verifiedProperties=properties.filter(p=>p.verified);
 const selectedProperty=verifiedProperties.find(p=>p.id===selectedPropertyId)||null;
 const campaignTargets=useMemo(()=>targets.filter(t=>t.campaign_id===campaignId),[targets,campaignId]);
 const campaignFormats=useMemo(()=>allFormats.filter(f=>f.campaign_id===campaignId),[allFormats,campaignId]);
 const compatiblePlatforms=useMemo(()=>selectedProperty?platforms.filter(p=>(selectedProperty.platforms||[]).includes(p[0])&&campaignTargets.some(t=>t.platform==="all"||t.platform===p[0])):[],[campaignTargets,selectedProperty]);
 const compatibleFormats=selectedProperty?campaignFormats.filter(f=>f.status==="ready"&&(selectedProperty.ad_formats||[]).includes(f.format)):[];
 const allPlatformSelected=compatiblePlatforms.length>0&&selectedPlatforms.length===compatiblePlatforms.length;
 const allFormatSelected=compatibleFormats.length>0&&selectedFormats.length===compatibleFormats.length;
 const stats={verified:properties.filter(p=>p.verified).length,waiting:properties.filter(p=>!p.verified).length,approved:applications.filter(a=>a.status==="approved").length,pending:applications.filter(a=>a.status==="applied").length};
 useEffect(()=>{setSelectedPlatforms([]);setSelectedFormats([])},[campaignId]);
 function toggle(setter:(value:string[]|((prev:string[])=>string[]))=>void,id:string){setter(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id])}
 function toggleAllPlatforms(){setSelectedPlatforms(allPlatformSelected?[]:compatiblePlatforms.map(x=>x[0]))}
 function toggleAllFormats(){setSelectedFormats(allFormatSelected?[]:compatibleFormats.map(x=>x.format))}
 function clearPropertyForm(){setEditingId("");setPropertyType("website");setPropertyName("");setPropertyUrl("");setPropertyFormatsSelected([])}
 function editProperty(p:Property){setEditingId(p.id);setPropertyType(p.property_type);setPropertyName(p.name);setPropertyUrl(p.url||"");setPropertyFormatsSelected(p.ad_formats||[]);setError("");setMessage("");window.scrollTo({top:0,behavior:"smooth"})}
 async function saveProperty(){
  if(!supabase)return;const{data:{user}}=await supabase.auth.getUser();if(!user)return;
  if(!propertyName.trim()||!propertyUrl.trim()){setError("Add a property name and URL.");return}
  if(!propertyFormatsSelected.length){setError("Select the ad formats this property supports.");return}
  try{const url=new URL(propertyUrl.trim());if(!["http:","https:"].includes(url.protocol))throw new Error()}catch{setError("Use a valid http or https URL.");return}
  setSaving(true);setError("");setMessage("");
  const payload={property_type:propertyType,name:propertyName.trim(),url:propertyUrl.trim(),platforms:[propertyType],ad_formats:propertyFormatsSelected};
  const result=editingId?await supabase.from("publisher_properties").update(payload).eq("id",editingId).eq("publisher_id",user.id):await supabase.from("publisher_properties").insert({...payload,publisher_id:user.id});
  if(result.error)setError("Property could not be saved. Please review the details and try again.");
  else{setMessage(editingId?"Property details updated. Verification remains controlled by AdBridge.":"Property saved. It is now waiting for AdBridge ownership review.");clearPropertyForm();await load()}
  setSaving(false);
 }
 async function apply(){
  if(!supabase||!campaignId)return;
  if(!selectedProperty||!selectedPlatforms.length||!selectedFormats.length){setError("Choose a verified property, then select compatible platforms and ad formats.");return}
  setSaving(true);setError("");setMessage("");
  const{data:{user}}=await supabase.auth.getUser();if(!user){window.location.href="/login";return}
  const existingRes=await supabase.from("publisher_campaigns").select("selected_platform,selected_format,selected_property_id").eq("publisher_id",user.id).eq("campaign_id",campaignId).eq("selected_property_id",selectedProperty.id);
  if(existingRes.error){setError("Could not check application history for this property.");setSaving(false);return}
  const seen=new Set((existingRes.data||[]).map(x=>x.selected_platform+"|"+x.selected_format));
  const combos:string[]=[];
  for(const p of selectedPlatforms)for(const f of selectedFormats){
   if((selectedProperty.platforms||[]).includes(p)&&(selectedProperty.ad_formats||[]).includes(f)&&!seen.has(p+"|"+f))combos.push(p+"|"+f);
  }
  if(!combos.length){setError("No new applications for this property and selection. Check previous applications or choose another supported format.");setSaving(false);return}
  const{error:insertError}=await supabase.from("publisher_campaigns").insert(combos.map(pair=>{const[p,f]=pair.split("|");return{campaign_id:campaignId,publisher_id:user.id,selected_property_id:selectedProperty.id,selected_platform:p,selected_format:f,status:"applied"}}));
  if(insertError)setError("Application submission failed. Please retry.");
  else{setMessage("Application submitted for this verified property and selected compatible placements.");await load()}
  setSaving(false);
 }
 return <main className="formPage publisherPage">
  <div className="dashTop"><Link href="/" className="back">← AdBridge</Link><span className="testBadge">PUBLISHER DELIVERY CENTER</span><Link href="/creator" className="switch">Creator dashboard →</Link></div>
  <div className="formCard wide">
   <span className="eyebrow">PUBLISHER DASHBOARD · WEBSITES · APPS</span><h1>Monetize the inventory <em>you actually own.</em></h1>
   <p>Register and manage your websites, web apps and mobile apps, apply for compatible ad campaigns, and track your approval status. Property verification and event quality are managed independently by AdBridge.</p>
   <section className="statsGrid"><div><b>YOUR PROPERTIES</b><strong>{loading?"—":properties.length}</strong><small>Websites and apps registered</small></div><div><b>VERIFIED INVENTORY</b><strong>{loading?"—":stats.verified}</strong><small>{loading?"Loading":stats.waiting+" awaiting review"}</small></div><div><b>APPLICATIONS</b><strong>{loading?"—":applications.length}</strong><small>Submitted placements</small></div><div><b>APPROVED PLACEMENTS</b><strong>{loading?"—":stats.approved}</strong><small>{loading?"Loading":stats.pending+" awaiting review"}</small></div></section>
   <div className="choiceRow"><Link className="secondary" href="/publisher/applications">Applications & decisions →</Link><Link className="secondary" href="/publisher/integration">Server tracking integration →</Link><Link className="secondary" href="/creator/earnings">Earnings & payouts →</Link></div>
   {error&&<div className="successBox" role="alert">{error}</div>}{message&&<div className="successBox">✓ {message}</div>}
   {loading?<div className="successBox">Loading publisher opportunities and inventory…</div>:<>
    <section className="quick"><h2>1. Your publisher properties</h2><p>Add or edit your property details and select only the ad formats it can support. You cannot self-verify ownership.</p>
     <div className="choices compact">{platforms.map(([id,title])=><button type="button" key={id} className={propertyType===id?"selected":""} onClick={()=>{setPropertyType(id);setPropertyFormatsSelected([])}}>{title}</button>)}</div>
     <input className="textInput" value={propertyName} onChange={e=>setPropertyName(e.target.value)} placeholder="Property name, e.g. My News Website"/>
     <input className="textInput" value={propertyUrl} onChange={e=>setPropertyUrl(e.target.value)} placeholder="https://yourwebsite.com or app-store listing"/>
     <label>Formats your property supports</label><div className="formatChoiceGrid">{(propertyFormats[propertyType]||[]).map(id=><button type="button" key={id} className={"formatChoice "+(propertyFormatsSelected.includes(id)?"selected":"")} onClick={()=>toggle(setPropertyFormatsSelected,id)}><strong>{formats.find(x=>x[0]===id)?.[1]||pretty(id)}</strong><small>{pretty(propertyType)} inventory</small></button>)}</div>
     <div className="choiceRow"><button type="button" className="primary" disabled={saving} onClick={()=>void saveProperty()}>{saving?"Saving…":editingId?"Update property":"Save property"}</button>{editingId&&<button type="button" className="secondary" onClick={clearPropertyForm}>Cancel edit</button>}</div>
     {properties.length>0&&<div className="opps">{properties.map(p=><article key={p.id}><b>{p.verified?"VERIFIED PROPERTY":"PENDING VERIFICATION"}</b><h3>{p.name}</h3><p>{pretty(p.property_type)} · {label(p.ad_formats||[],formats)}</p>{p.url&&<a href={p.url} target="_blank" rel="noreferrer">Visit property ↗</a>}<button type="button" className="secondary" onClick={()=>editProperty(p)}>Edit details</button></article>)}</div>}
    </section>
    <section className="quick"><h2>2. Apply to compatible ad campaigns</h2><label>Campaign</label><select className="textInput" value={campaignId} onChange={e=>setCampaignId(e.target.value)}><option value="">Select campaign</option>{campaigns.map(c=><option key={c.id} value={c.id}>{c.name} · {c.goal}</option>)}</select>
     {campaign&&<div className="infoBox"><b>{campaign.name}</b><p>Advertiser targeting: {campaignTargets.some(t=>t.platform==="all")?"All supported platforms":label(campaignTargets.map(t=>t.platform),platforms)}</p><p>Ready formats: {campaignFormats.filter(f=>f.status==="ready").length}</p></div>}
     <label>Verified property to receive this campaign</label><select className="textInput" value={selectedPropertyId} onChange={e=>{setSelectedPropertyId(e.target.value);setSelectedPlatforms([]);setSelectedFormats([])}}><option value="">Select verified property</option>{verifiedProperties.map(p=><option key={p.id} value={p.id}>{p.name} · {pretty(p.property_type)}</option>)}</select>{selectedProperty&&<div className="infoBox"><b>{selectedProperty.name}</b><p>{pretty(selectedProperty.property_type)} · Eligible formats: {label(selectedProperty.ad_formats||[],formats)}</p></div>}{!verifiedProperties.length&&<div className="successBox">You need at least one verified property before applying to publisher campaigns.</div>}<label>Platforms supported by this property and campaign</label><div className="formatChoiceGrid"><button type="button" className={"formatChoice all "+(allPlatformSelected?"selected":"")} onClick={toggleAllPlatforms}><strong>All compatible</strong><small>Choose all platforms this campaign accepts</small></button>{compatiblePlatforms.map(([id,title])=><button type="button" key={id} className={"formatChoice "+(selectedPlatforms.includes(id)?"selected":"")} onClick={()=>toggle(setSelectedPlatforms,id)}><strong>{title}</strong><small>Publisher placement</small></button>)}</div>
     <label>Available formats supported by this property</label><div className="formatChoiceGrid"><button type="button" className={"formatChoice all "+(allFormatSelected?"selected":"")} onClick={toggleAllFormats}><strong>All ready formats</strong><small>Select every ready campaign format</small></button>{compatibleFormats.map(f=><button type="button" key={f.format} className={"formatChoice "+(selectedFormats.includes(f.format)?"selected":"")} onClick={()=>toggle(setSelectedFormats,f.format)}><strong>{formats.find(x=>x[0]===f.format)?.[1]||pretty(f.format)}</strong><small>{f.requirements||"AdBridge format requirements"}</small></button>)}</div>
     <button type="button" className="primary fullButton" disabled={saving||!campaignId||!selectedPropertyId} onClick={()=>void apply()}>{saving?"Submitting…":"Apply for selected placements →"}</button>
     <p>Applications are submitted only when a verified property you own matches the selected platform and format. Existing combinations are not duplicated.</p>
    </section>
   </>}
   <div className="infoBox"><b>Publisher delivery and payment rules</b><p>AdBridge tracks server-verified impressions, clicks, video views, installs and conversions. Tracking-link clicks alone are not verified views. Events must pass fraud checks before qualifying for payment.</p><Link href="/publisher/integration">Set up server-side event tracking →</Link><p><Link href="/creator/earnings">Manage earnings and payout methods →</Link></p></div>
  </div>
 </main>
}
