import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { assessAdEvent, type EventInput } from "@/lib/fraud-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function validSignature(raw:string,signature:string,secret:string) {
  const expected=createHmac("sha256",secret).update(raw).digest("hex");
  const a=Buffer.from(expected,"hex"), b=Buffer.from(signature.replace(/^sha256=/,""),"hex");
  return a.length===b.length && timingSafeEqual(a,b);
}
export async function POST(req:NextRequest) {
  const raw=await req.text();
  const secret=process.env.ADBRIDGE_TRACKING_SECRET;
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if(!secret || !url || !serviceKey) return NextResponse.json({error:"Tracking service is not configured"},{status:503});
  const signature=req.headers.get("x-adbridge-signature")||"";
  if(!validSignature(raw,signature,secret)) return NextResponse.json({error:"Invalid event signature"},{status:401});
  let event:EventInput;
  try { event=JSON.parse(raw) as EventInput; } catch { return NextResponse.json({error:"Invalid JSON"},{status:400}); }
  if(!["click","video_view","impression","install","conversion"].includes(event.type)) return NextResponse.json({error:"Unsupported event type"},{status:400});
  const supabase=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:prior}=await supabase.from("adbridge_ad_events").select("id").eq("event_id",event.eventId).maybeSingle();
  const decision=assessAdEvent({...event,signedSource:true},{duplicate:!!prior});
  const {error}=await supabase.from("adbridge_ad_events").insert({
    event_id:event.eventId,campaign_id:event.campaignId,publisher_id:event.publisherId,
    placement_id:event.placementId??null,event_type:event.type,occurred_at:event.occurredAt,
    risk_score:decision.riskScore,risk_band:decision.riskBand,accepted:decision.accepted,
    verified:decision.verified,payable:decision.payable,reasons:decision.reasons,
    metric:decision.metric,device_hash:event.deviceHash??null,ip_hash:event.ipHash??null,
    session_id:event.sessionId??null,evidence:event
  });
  if(error) {
    if(error.code==="23505") return NextResponse.json({error:"Duplicate event",accepted:false,verified:false,payable:false},{status:409});
    return NextResponse.json({error:"Could not record event"},{status:500});
  }
  return NextResponse.json({eventId:event.eventId,...decision},{status:decision.riskBand==="high"?"202":200});
}
