import { supabase } from "@/lib/supabase";

export default async function AdDelivery({ params, searchParams }: { params: Promise<{id:string}>, searchParams: Promise<{destination?:string}> }) {
  const { id } = await params;
  const query = await searchParams;
  const destination = query.destination || "web";
  let campaign: any = null;
  let assets: any[] = [];
  if (supabase) {
    const result = await supabase.from("campaigns").select("id,name,goal,instructions,status").eq("id", id).maybeSingle();
    campaign = result.data;
    const assetResult = await supabase.from("campaign_assets").select("asset_type,asset_url").eq("campaign_id", id);
    assets = assetResult.data ?? [];
  }
  const asset = assets.find(a => a.asset_url);
  const url = asset?.asset_url || "";
  const isVideo = asset?.asset_type?.toLowerCase().includes("video") || /\\.(mp4|webm|mov)(\\?|$)/i.test(url);
  const isImage = !isVideo && !!url;
  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#04110e",color:"#f7fffc",fontFamily:"Arial,Helvetica,sans-serif"}}>
    <section style={{width:"min(100%,720px)",border:"1px solid #ffffff18",borderRadius:24,padding:24,background:"#ffffff08",boxShadow:"0 20px 70px #0008"}}>
      <div style={{fontSize:10,letterSpacing:3,color:"#69ffd7",fontWeight:800}}>ADBRIDGE · {destination.toUpperCase()} DELIVERY</div>
      <h1 style={{fontSize:"clamp(28px,6vw,52px)",margin:"14px 0 8px"}}>{campaign?.name || "AdBridge campaign"}</h1>
      <p style={{color:"#9bb2ac",lineHeight:1.6}}>{campaign?.instructions || campaign?.goal || "Sponsored campaign"}</p>
      <div style={{marginTop:20,borderRadius:18,overflow:"hidden",background:"#020908",border:"1px solid #ffffff12"}}>
        {isVideo ? <video src={url} controls playsInline style={{width:"100%",display:"block"}} /> : isImage ? <img src={url} alt={campaign?.name || "Ad"} style={{width:"100%",display:"block"}} /> : <div style={{padding:50,textAlign:"center",color:"#8da59f"}}>Creative is being prepared by AdBridge.</div>}
      </div>
      <div style={{display:"flex",gap:10,marginTop:18,flexWrap:"wrap"}}>
        {url && <a href={url} target="_blank" rel="noreferrer" style={{padding:"13px 18px",borderRadius:12,background:"linear-gradient(110deg,#69ffd6,#8b7dff)",color:"#04110e",fontWeight:800,textDecoration:"none"}}>View campaign ↗</a>}
        <span style={{padding:"13px 18px",borderRadius:12,border:"1px solid #ffffff18",color:"#8fa7a1",fontSize:12}}>Delivered by AdBridge</span>
      </div>
    </section>
  </main>;
}
