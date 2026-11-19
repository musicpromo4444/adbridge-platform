export type AdEventType = "click" | "video_view" | "impression" | "install" | "conversion";
export type RiskBand = "low" | "review" | "high" | "blocked";
export type EventInput = {
  eventId: string; campaignId: string; publisherId: string; placementId?: string;
  type: AdEventType; occurredAt: string; userAgent?: string; ipHash?: string;
  deviceHash?: string; sessionId?: string; referrerHost?: string;
  rendered?: boolean; viewableRatio?: number; playbackStarted?: boolean;
  playbackSeconds?: number; videoDurationSeconds?: number; heartbeatCount?: number;
  pageVisible?: boolean; destinationLoaded?: boolean; installReceiptId?: string;
  conversionReceiptId?: string; signedSource?: boolean;
};
export type FraudDecision = {
  accepted: boolean; verified: boolean; payable: boolean; riskScore: number;
  riskBand: RiskBand; reasons: string[]; metric: "clicks" | "views" | "impressions" | "installs" | "conversions" | "none";
};
const clamp = (n:number,min=0,max=100) => Math.max(min,Math.min(max,n));
const validDate = (s:string) => Number.isFinite(Date.parse(s));
export function assessAdEvent(e:EventInput, recent:{sameDeviceEvents5m?:number;sameIpEvents5m?:number;duplicate?:boolean}={}):FraudDecision {
  const reasons:string[]=[]; let risk=0;
  if (!e.eventId || !e.campaignId || !e.publisherId || !validDate(e.occurredAt)) {
    return {accepted:false,verified:false,payable:false,riskScore:100,riskBand:"blocked",reasons:["invalid_event_envelope"],metric:"none"};
  }
  if (recent.duplicate) { risk+=100; reasons.push("duplicate_event_id"); }
  if ((recent.sameDeviceEvents5m??0)>30) {risk+=45;reasons.push("device_velocity");}
  else if ((recent.sameDeviceEvents5m??0)>12) {risk+=20;reasons.push("elevated_device_velocity");}
  if ((recent.sameIpEvents5m??0)>100) {risk+=30;reasons.push("ip_velocity");}
  if (/bot|crawler|spider|headless|phantom|selenium|playwright|puppeteer/i.test(e.userAgent??"")) {risk+=65;reasons.push("automation_user_agent");}
  if (!e.signedSource) {risk+=15;reasons.push("untrusted_event_source");}
  if (e.type==="click" && e.destinationLoaded===false) {risk+=20;reasons.push("destination_not_loaded");}
  if (e.type==="impression") {
    if (!e.rendered) {risk+=60;reasons.push("ad_not_rendered");}
    if ((e.viewableRatio??0)<0.5) {risk+=25;reasons.push("not_viewable");}
  }
  if (e.type==="video_view") {
    if (!e.playbackStarted) {risk+=100;reasons.push("playback_not_started");}
    if ((e.playbackSeconds??0)<2) {risk+=65;reasons.push("insufficient_watch_time");}
    if ((e.heartbeatCount??0)<2) {risk+=35;reasons.push("missing_playback_heartbeats");}
    if (!e.pageVisible) {risk+=25;reasons.push("player_not_visible");}
    if ((e.videoDurationSeconds??0)<=0 || (e.playbackSeconds??0)>(e.videoDurationSeconds??0)+5) {risk+=40;reasons.push("invalid_playback_duration");}
  }
  if (e.type==="install" && !e.installReceiptId) {risk+=60;reasons.push("missing_install_receipt");}
  if (e.type==="conversion" && !e.conversionReceiptId) {risk+=60;reasons.push("missing_conversion_receipt");}
  risk=clamp(risk);
  const riskBand:RiskBand=risk>=70?"blocked":risk>=40?"high":risk>=20?"review":"low";
  const accepted=riskBand!=="blocked";
  // A click is never a video view. Views require playback evidence and low risk.
  const verified=accepted && riskBand==="low" && (
    e.type==="click" ? e.destinationLoaded===true :
    e.type==="impression" ? e.rendered===true && (e.viewableRatio??0)>=0.5 :
    e.type==="video_view" ? !!e.playbackStarted && (e.playbackSeconds??0)>=2 && (e.heartbeatCount??0)>=2 && !!e.pageVisible :
    e.type==="install" ? !!e.installReceiptId :
    !!e.conversionReceiptId
  );
  const metric=e.type==="click"?"clicks":e.type==="video_view"?"views":e.type==="impression"?"impressions":e.type==="install"?"installs":e.type==="conversion"?"conversions":"none";
  if (!verified && !reasons.length) reasons.push("verification_incomplete");
  return {accepted,verified,payable:verified,riskScore:risk,riskBand,reasons,metric};
}
