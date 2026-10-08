"use client";
import Link from "next/link";import{useEffect,useMemo,useState}from"react";import{supabase}from"@/lib/supabase";

type Campaign={id:string;name:string;goal:string;platform:string|null;status:string};
type Format={campaign_id:string;format:string;status:string;requirements:string};
type Channel={id:string;channel_type:string;platform:string;name:string|null;handle:string|null;url:string|null;app_store_url:string|null;active:boolean};

const platformNames:Record<string,string>={instagram:"Instagram",tiktok:"TikTok",youtube:"YouTube",facebook:"Facebook",x:"X",snapchat:"Snapchat",linkedin:"LinkedIn",website:"Website",web_app:"Web App",android_app:"Android App",ios_app:"iOS App",mobile_app:"Mobile App"};
const formatNames:Record<string,string>={web_banner:"Web Banner",web_native:"Web Native",web_interstitial:"Web Interstitial",web_video:"Web Video",web:"Web",web_app:"Web App",app_banner:"App Banner",app_native:"App Native",app_interstitial:"App Interstitial",app_video:"App Video",app_rewarded_video:"Rewarded Video",android_app:"Android App",ios_app:"iOS App",social_post:"Social Post",social_story:"Social Story",social_reel:"Social Reel",social_video:"Social Video"};
const formatMeta:Record<string,{icon:string;desc:string;badge:string}>={web_banner:{icon:"▤",desc:"Website banner",badge:"WEB"},web_native:{icon:"◎",desc:"Native website placement",badge:"WEB"},web_interstitial:{icon:"□",desc:"Full-screen website ad",badge:"WEB"},web_video:{icon:"▶",desc:"Website video",badge:"WEB VIDEO"},web:{icon:"◎",desc:"Website / browser",badge:"HTML / JS"},web_app:{icon:"▣",desc:"Web application",badge:"WEB APP"},app_banner:{icon:"▤",desc:"In-app banner",badge:"APP"},app_native:{icon:"◎",desc:"Native app placement",badge:"APP"},app_interstitial:{icon:"□",desc:"Full-screen app ad",badge:"APP"},app_video:{icon:"▶",desc:"In-app video",badge:"APP VIDEO"},app_rewarded_video:{icon:"★",desc:"Rewarded app video",badge:"REWARDED"},android_app:{icon:"▱",desc:"Android app",badge:"ANDROID"},ios_app:{icon:"⌁",desc:"iPhone / iPad app",badge:"IOS"},social_post:{icon:"✦",desc:"Social post",badge:"SOCIAL"},social_story:{icon:"◌",desc:"Social story",badge:"STORY"},social_reel:{icon:"▶",desc:"Short-form reel",badge:"REEL"},social_video:{icon:"▶",desc:"Social video",badge:"VIDEO"}};
const socialPlatforms=["instagram","tiktok","youtube","facebook","x","snapchat","linkedin"];
function compatible(channel:Channel,format:string){if(socialPlatforms.includes(channel.platform))return format.startsWith("social_");if(channel.platform==="website")return ["web","web_banner","web_native","web_interstitial","web_video"].includes(format);if(channel.platform==="web_app")return ["web_app","web","web_banner","web_native","web_interstitial","web_video"].includes(format);if(channel.platform==="android_app")return ["android_app","app_banner","app_native","app_interstitial","app_video","app_rewarded_video"].includes(format);if(channel.platform==="ios_app")return ["ios_app","app_banner","app_native","app_interstitial","app_video","app_rewarded_video"].includes(format);if(channel.platform==="mobile_app")return ["app_banner","app_native","app_interstitial","app_video","app_rewarded_video"].includes(format);return true}
function baseUrl(){return typeof window==="undefined"?"https://adbridge-platform.vercel.app":window.location.origin}

export default function PublisherCenter(){
 const[campaigns,setCampaigns]=useState<Campaign[]>([]),[campaignId,setCampaignId]=useState(""),[campaignPlatforms,setCampaignPlatforms]=useState<string[]>([]),[formats,setFormats]=useState<Format[]>([]),[channels,setChannels]=useState<Channel[]>([]),[selectedChannels,setSelectedChannels]=useState<string[]>([]),[selectedFormats,setSelectedFormats]=useState<string[]>([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState(""),[channelName,setChannelName]=useState(""),[channelPlatform,setChannelPlatform]=useState("website"),[channelUrl,setChannelUrl]=useState(""),[channelAppUrl,setChannelAppUrl]=useState("");
 const campaign=campaigns.find(c=>c.id===campaignId);
 const campaignFormats=useMemo(()=>formats.filter(f=>f.campaign_id===campaignId),[formats,campaignId]);
 const availableChannels=useMemo(()=>channels.filter(ch=>ch.active&&(campaignPlatforms.length===0||campaignPlatforms.includes(ch.platform))),[channels,campaignPlatforms]);
 const compatibleFormats=useMemo(()=>campaignFormats.filter(f=>selectedChannels.some(id=>{const ch=availableChannels.find(c=>c.id===id);return ch&&compatible(ch,f.format)})),[campaignFormats,selectedChannels,availableChannels]);
 const allChannelsSelected=availableChannels.length>0&&selectedChannels.length===availableChannels.length;
 const allFormatsSelected=campaignFormats.length>0&&selectedFormats.length===campaignFormats.length;

 async function load(){
  if(!supabase){setLoading(false);return}
  const{data:{user}}=await supabase.auth.getUser();if(!user){location.href="/login";return}
  const[{data:cs},{data:fps},{data:fs},{data:chs}]=await Promise.all([
   supabase.from("campaigns").select("id,name,goal,platform,status").eq("status","active").order("created_at",{ascending:false}),
   supabase.from("campaign_platforms").select("campaign_id,platform,enabled").eq("enabled",true),
   supabase.from("campaign_formats").select("campaign_id,format,status,requirements"),
   supabase.from("publisher_channels").select("id,channel_type,platform,name,handle,url,app_store_url,active").eq("publisher_id",user.id).order("created_at",{ascending:false})
  ]);
  const campaignList=(cs??[]).filter(c=>(fps??[]).some(p=>p.campaign_id===c.id)||(fs??[]).some(f=>f.campaign_id===c.id));
  setCampaigns(campaignList);setFormats(fs??[]);setChannels(chs??[]);
  if(campaignList[0])setCampaignId(campaignList[0].id);setLoading(false);
 }
 useEffect(()=>{load()},[]);
 useEffect(()=>{if(!supabase||!campaignId)return;(async()=>{const{data}=await supabase.from("campaign_platforms").select("platform").eq("campaign_id",campaignId).eq("enabled",true);setCampaignPlatforms((data??[]).map(x=>x.platform));setSelectedChannels([]);setSelectedFormats([])})()},[campaignId]);

 function toggleChannel(id:string){setSelectedChannels(a=>a.includes(id)?a.filter(x=>x!==id):[...a,id])}
 function toggleFormat(id:string){setSelectedFormats(a=>a.includes(id)?a.filter(x=>x!==id):[...a,id])}
 function toggleAllChannels(){setSelectedChannels(allChannelsSelected?[]:availableChannels.map(c=>c.id))}
 function toggleAllFormats(){setSelectedFormats(allFormatsSelected?[]:campaignFormats.map(f=>f.format))}
 async function addChannel(){
  if(!supabase){setError("Database connection is not ready.");return}
  const{data:{user}}=await supabase.auth.getUser();if(!user){location.href="/login";return}
  if(!channelName.trim()){setError("Give this website, app or social account a name.");return}
  if(!channelUrl.trim()&&!["android_app","ios_app","mobile_app"].includes(channelPlatform)){setError("Add the public URL for this publisher property.");return}
  setError("");
  const channelType=socialPlatforms.includes(channelPlatform)?"social":channelPlatform;
  const{data,error:e}=await supabase.from("publisher_channels").insert({publisher_id:user.id,channel_type:channelType,platform:channelPlatform,name:channelName.trim(),url:channelUrl.trim()||null,app_store_url:channelAppUrl.trim()||null,active:true}).select("id,channel_type,platform,name,handle,url,app_store_url,active").single();
  if(e){setError(e.message||"Could not add the publisher property.");return}
  setChannels(a=>[data,...a]);setSelectedChannels(a=>[...a,data.id]);setChannelName("");setChannelUrl("");setChannelAppUrl("");setMessage("Publisher property added.");setTimeout(()=>setMessage(""),2500)
 }
 async function apply(){
  if(!supabase||!campaignId)return;
  const{data:{user}}=await supabase.auth.getUser();if(!user){location.href="/login";return}
  if(!selectedChannels.length){setError("Select at least one website, app or social property.");return}
  if(!selectedFormats.length){setError("Select at least one ad format.");return}
  setSaving(true);setError("");setMessage("");
  const{data:existing}=await supabase.from("publisher_campaigns").select("channel_id,selected_platform,selected_format").eq("publisher_id",user.id).eq("campaign_id",campaignId);
  const rows:any[]=[];
  for(const channelId of selectedChannels){const ch=availableChannels.find(x=>x.id===channelId);if(!ch)continue;for(const format of selectedFormats){if(!compatible(ch,format))continue;const platform=ch.platform;if(!(existing??[]).some(x=>x.channel_id===channelId&&x.selected_platform===platform&&x.selected_format===format))rows.push({campaign_id:campaignId,publisher_id:user.id,channel_id:channelId,selected_platform:platform,selected_format:format,status:"applied"});}}
  if(!rows.length){setMessage("You already applied with these publisher properties.");setSaving(false);return}
  const{error:e}=await supabase.from("publisher_campaigns").insert(rows);
  if(e){setError(e.message||"Your publisher application could not be saved.");setSaving(false);return}
  setMessage("Application sent. AdBridge saved every compatible platform + format combination.");setSaving(false)
 }
 const selectedFormat=selectedFormats[0]||compatibleFormats[0]?.format||"";
 const deliveryUrl=campaignId&&selectedFormat?baseUrl()+"/ad/"+campaignId+"?destination="+selectedFormat:"";
 return <main className="formPage publisherPage"><div className="dashTop"><Link href="/" className="back">← AdBridge</Link><span className="testBadge">PUBLISHER NETWORK</span><Link href="/creator" className="switch">Creator Dashboard →</Link></div><div className="formCard wide">
 <span className="eyebrow">CREATORS + PUBLISHERS</span><h1>Bring ads to <em>any audience you own.</em></h1><p>AdBridge is not limited to social creators. Websites, web apps, Android apps, iOS apps and social publishers can all apply for campaigns.</p>
 <label>1. Choose an active campaign</label><select className="textInput" value={campaignId} onChange={e=>setCampaignId(e.target.value)}><option value="">{loading?"Loading campaigns…":"Select a campaign"}</option>{campaigns.map(c=><option key={c.id} value={c.id}>{c.name} · {c.goal}</option>)}</select>
 {campaign&&<div className="infoBox"><b>Advertiser targeting</b><p>{campaignPlatforms.length?campaignPlatforms.map(x=>platformNames[x]||x).join(" · "):"All eligible publisher destinations"} </p></div>}
 <label>2. Your publisher properties</label><p className="fieldHint">Select one, several, or <b>All my properties</b>. A property can be a social account, website, web app or mobile app.</p>
 {availableChannels.length?<><div className="formatChoiceGrid"><button type="button" className={"formatChoice all "+(allChannelsSelected?"selected":"")} onClick={toggleAllChannels}><strong>All my properties</strong><small>{availableChannels.length} eligible publisher properties</small></button>{availableChannels.map(ch=><button type="button" key={ch.id} className={"formatChoice "+(selectedChannels.includes(ch.id)?"selected":"")} onClick={()=>toggleChannel(ch.id)}><strong>{ch.name||platformNames[ch.platform]||ch.platform}</strong><small>{platformNames[ch.platform]||ch.platform}{ch.url?" · "+ch.url:""}</small></button>)}</div></>:<div className="successBox">No publisher properties match this campaign yet. Add your website, app or social property below.</div>}
 <div className="conversionInfo"><span className="eyebrow">ADD A PROPERTY</span><div className="formGrid"><div><label>Property name</label><input className="textInput" value={channelName} onChange={e=>setChannelName(e.target.value)} placeholder="My website / app / page"/></div><div><label>Platform</label><select className="textInput" value={channelPlatform} onChange={e=>setChannelPlatform(e.target.value)}>{Object.entries(platformNames).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></div></div><label>Public URL</label><input className="textInput" value={channelUrl} onChange={e=>setChannelUrl(e.target.value)} placeholder="https://example.com"/><label>App store URL <small>(optional)</small></label><input className="textInput" value={channelAppUrl} onChange={e=>setChannelAppUrl(e.target.value)} placeholder="https://play.google.com/... or App Store link"/><button type="button" className="secondary fullButton" onClick={addChannel}>＋ Add publisher property</button></div>
 <label>3. Ad formats you can accept</label><p className="fieldHint">Choose one, several, or <b>All formats</b>. AdBridge only submits combinations that fit the property you selected.</p>
 {campaignFormats.length?<div className="formatChoiceGrid"><button type="button" className={"formatChoice all "+(allFormatsSelected?"selected":"")} onClick={toggleAllFormats}><strong>All formats</strong><small>{campaignFormats.length} advertiser-approved formats</small></button>{campaignFormats.map(f=>{constm=formatMeta[f.format]||{icon:"◎",desc:"Selected format",badge:f.format};return <button type="button" key={f.format} className={"formatChoice "+(selectedFormats.includes(f.format)?"selected":"")} onClick={()=>toggleFormat(f.format)}><strong>{formatNames[f.format]||f.format}</strong><small>{m.desc}</small><b>{m.badge}</b></button>})}</div>:<div className="successBox">This campaign has no delivery formats configured.</div>}
 {selectedChannels.length&&selectedFormats.length&&!compatibleFormats.length?<div className="successBox">Your selected properties do not support the selected formats. Choose a compatible format or property.</div>:null}
 <button type="button" className="primary fullButton" disabled={saving} onClick={apply}>{saving?"Sending application…":"Apply to campaign →"}</button>
 {message&&<div className="successBox">{message}</div>}{error&&<div className="successBox">{error}</div>}
 {selectedFormat&&campaign&&<div className="generatedPanel"><div className="generatedHead"><div><span className="eyebrow">PREVIEW</span><h2>{formatNames[selectedFormat]||selectedFormat}</h2></div><span className="formatBadge">{formatMeta[selectedFormat]?.badge||selectedFormat}</span></div><p>After approval, AdBridge generates the delivery package and tracking destination for the approved publisher property.</p><div className="copyRow"><input className="textInput" readOnly value={deliveryUrl}/><button className="secondary" onClick={async()=>{await navigator.clipboard?.writeText(deliveryUrl);setMessage("Preview link copied.")}}>Copy</button></div></div>}
 <div className="conversionInfo"><span className="eyebrow">HOW IT WORKS</span><div className="conversionGrid"><div><b>Advertiser</b><p>Chooses target platforms and every ad format they are willing to fund.</p></div><div><b>Publisher</b><p>Chooses all or selected websites, apps and social properties, plus compatible formats.</p></div><div><b>AdBridge</b><p>Stores each compatible application and later generates the correct delivery package, tracking and verification path.</p></div></div></div>
 </div></main>
}