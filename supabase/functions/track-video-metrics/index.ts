import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

function youtubeId(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("/")[0];
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const parts = u.pathname.split("/").filter(Boolean);
      const i = parts.findIndex((x) => x === "shorts" || x === "embed");
      return i >= 0 ? parts[i + 1] : null;
    }
  } catch {}
  return null;
}

function tiktokId(url: string) {
  const m = url.match(/\/video\/(\d+)/);
  return m?.[1] ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const { submission_id } = await req.json().catch(() => ({}));
  if (!submission_id) return json({ error: "submission_id is required" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceKey);

  const { data: submission, error: se } = await db
    .from("submissions")
    .select("id,campaign_id,creator_id,creator_campaign_id,posted_url,tracking_platform,external_video_id,target_metric,status")
    .eq("id", submission_id)
    .single();

  if (se || !submission) return json({ error: "Submission not found" }, 404);
  if (!submission.posted_url && !submission.external_video_id) return json({ error: "No published video URL has been submitted" }, 400);

  let platform = String(submission.tracking_platform || "").toLowerCase();
  let videoId = submission.external_video_id as string | null;
  let views = 0;
  let source = "platform_api";
  let raw: Record<string, unknown> = {};

  if (platform === "youtube" || (!platform && /youtu/i.test(submission.posted_url || ""))) {
    platform = "youtube";
    videoId ||= youtubeId(submission.posted_url || "");
    const key = Deno.env.get("YOUTUBE_API_KEY");
    if (!key) return json({ error: "YouTube tracking is ready but YOUTUBE_API_KEY is not configured." }, 503);
    if (!videoId) return json({ error: "Could not identify the YouTube video." }, 400);

    const u = new URL("https://www.googleapis.com/youtube/v3/videos");
    u.searchParams.set("part", "statistics,snippet");
    u.searchParams.set("id", videoId);
    u.searchParams.set("key", key);
    const r = await fetch(u);
    const data = await r.json();
    const item = data?.items?.[0];
    if (!r.ok || !item) return json({ error: "YouTube could not return this video.", details: data }, 502);
    views = Number(item.statistics?.viewCount || 0);
    raw = { id: videoId, title: item.snippet?.title, statistics: item.statistics };
  } else if (platform === "tiktok") {
    videoId ||= tiktokId(submission.posted_url || "");
    if (!videoId) return json({ error: "Could not identify the TikTok video." }, 400);
    const { data: connection } = await db
      .from("creator_platform_connections")
      .select("access_token,connected,expires_at")
      .eq("creator_id", submission.creator_id)
      .eq("platform", "tiktok")
      .eq("connected", true)
      .maybeSingle();
    if (!connection?.access_token) return json({ error: "TikTok creator connection is required before automatic view tracking can start." }, 409);
    const r = await fetch("https://open.tiktokapis.com/v2/video/query/?fields=id,title,view_count,like_count,comment_count,share_count", {
      method: "POST",
      headers: { Authorization: `Bearer ${connection.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ filters: { video_ids: [videoId] } }),
    });
    const data = await r.json();
    const item = data?.data?.videos?.[0];
    if (!r.ok || !item) return json({ error: "TikTok could not return this video.", details: data }, 502);
    views = Number(item.view_count || 0);
    raw = item;
  } else if (platform === "x" || platform === "twitter") {
    platform = "x";
    videoId ||= (submission.posted_url || "").match(/status\/(\d+)/)?.[1] || null;
    if (!videoId) return json({ error: "Could not identify the X post." }, 400);
    const { data: connection } = await db.from("creator_platform_connections")
      .select("access_token,connected").eq("creator_id", submission.creator_id).eq("platform", "x").eq("connected", true).maybeSingle();
    const token = connection?.access_token || Deno.env.get("X_BEARER_TOKEN");
    if (!token) return json({ error: "X tracking requires an authorized creator connection or X API token." }, 409);
    const u = new URL(`https://api.x.com/2/tweets/${videoId}`);
    u.searchParams.set("tweet.fields", "public_metrics");
    const r = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
    const data = await r.json();
    if (!r.ok || !data?.data) return json({ error: "X could not return this post.", details: data }, 502);
    views = Number(data.data.public_metrics?.view_count || 0);
    raw = data.data;
  } else if (platform === "instagram") {
    videoId ||= (submission.posted_url || "").match(/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/)?.[1] || null;
    if (!videoId) return json({ error: "Could not identify the Instagram post/reel." }, 400);
    const { data: connection } = await db.from("creator_platform_connections")
      .select("access_token,connected").eq("creator_id", submission.creator_id).eq("platform", "instagram").eq("connected", true).maybeSingle();
    if (!connection?.access_token) return json({ error: "Instagram tracking requires a connected professional creator/business account." }, 409);
    const u = new URL(`https://graph.facebook.com/v23.0/${videoId}/insights`);
    u.searchParams.set("metric", "views");
    u.searchParams.set("access_token", connection.access_token);
    const r = await fetch(u);
    const data = await r.json();
    if (!r.ok) return json({ error: "Instagram could not return this media's insights.", details: data }, 502);
    views = Number(data?.data?.find((x: any) => x.name === "views")?.values?.at(-1)?.value || 0);
    raw = data;
  } else if (platform === "facebook") {
    videoId ||= (submission.posted_url || "").match(/(?:videos|reel|watch)\/(\d+)/)?.[1] || null;
    if (!videoId) return json({ error: "Could not identify the Facebook video." }, 400);
    const { data: connection } = await db.from("creator_platform_connections")
      .select("access_token,connected").eq("creator_id", submission.creator_id).eq("platform", "facebook").eq("connected", true).maybeSingle();
    if (!connection?.access_token) return json({ error: "Facebook tracking requires a connected Page/creator account." }, 409);
    const u = new URL(`https://graph.facebook.com/v23.0/${videoId}/insights`);
    u.searchParams.set("metric", "post_media_view");
    u.searchParams.set("access_token", connection.access_token);
    const r = await fetch(u);
    const data = await r.json();
    if (!r.ok) return json({ error: "Facebook could not return this video's insights.", details: data }, 502);
    views = Number(data?.data?.find((x: any) => x.name === "post_media_view")?.values?.at(-1)?.value || 0);
    raw = data;
  } else if (platform === "snapchat") {
    return json({ error: "Snapchat tracking requires the creator to authorize/share eligible Public Profile or Spotlight insights. Automatic API retrieval is not enabled for this account yet.", code: "SNAPCHAT_AUTH_REQUIRED", platform }, 409);
  } else {
    return json({ error: "Automatic tracking for this platform is not connected yet.", platform }, 409);
  }

  const target = Number(submission.target_metric || 0);
  const reached = target > 0 && views >= target;
  const now = new Date().toISOString();

  await db.from("submission_metrics").insert({
    submission_id: submission.id,
    platform,
    external_video_id: videoId,
    metric_name: "views",
    metric_value: views,
    checked_at: now,
    source,
    raw_data: raw,
  });

  const update: Record<string, unknown> = {
    tracking_platform: platform,
    external_video_id: videoId,
    current_metric: views,
    last_metric_check_at: now,
    tracking_error: null,
  };
  if (reached) {
    update.metric_status = "target_reached";
    update.metric_verified_at = now;
  } else {
    update.metric_status = "tracking";
  }
  await db.from("submissions").update(update).eq("id", submission.id);

  if (reached) {
    const { data: existing } = await db.from("campaign_payments")
      .select("id,status")
      .eq("submission_id", submission.id)
      .eq("type", "creator_payment")
      .limit(1);

    if (!existing?.length) {
      const { data: campaign } = await db.from("campaigns")
        .select("payment_method,payment_rate,desired_results,max_budget,status")
        .eq("id", submission.campaign_id)
        .single();
      if (campaign && ["views", "cpm"].includes(String(campaign.payment_method).toLowerCase())) {
        const rate = Number(campaign.payment_rate || 0);
        const requestedAmount = Number((rate * (target / 1000)).toFixed(2));
        const { data: paidRows } = await db.from("campaign_payments").select("amount").eq("campaign_id", submission.campaign_id).eq("type", "creator_payment").in("status", ["released","approved","pending"]);
        const alreadyPaid = (paidRows || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
        const remainingBudget = Math.max(0, Number(campaign.max_budget || 0) - alreadyPaid);
        const amount = Number(Math.min(requestedAmount, remainingBudget).toFixed(2));
        if (amount > 0) {
          await db.from("campaign_payments").insert({
            campaign_id: submission.campaign_id,
            creator_id: submission.creator_id,
            submission_id: submission.id,
            amount,
            type: "creator_payment",
            status: "released",
          });
          await db.from("submissions").update({ status: "approved", reviewed_at: now }).eq("id", submission.id);
          await db.from("creator_campaigns").update({ status: "completed" }).eq("id", submission.creator_campaign_id);
        }
      }
    }
  }

  return json({ success: true, platform, video_id: videoId, views, target, reached });
});