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
      const index = parts.findIndex((part) => part === "shorts" || part === "embed");
      return index >= 0 ? parts[index + 1] : null;
    }
  } catch {}
  return null;
}

function tiktokId(url: string) {
  const match = url.match(/\/video\/(\d+)/);
  return match?.[1] ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Authentication required" }, 401);
  const { submission_id: submissionId } = await req.json().catch(() => ({}));
  if (!submissionId) return json({ error: "submission_id is required" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: authError } = await db.auth.getUser(token);
  if (authError || !user) return json({ error: "Authentication failed" }, 401);

  const { data: submission, error: submissionError } = await db
    .from("submissions")
    .select("id,campaign_id,creator_id,creator_campaign_id,posted_url,tracking_platform,external_video_id,target_metric,status")
    .eq("id", submissionId)
    .single();

  if (submissionError || !submission) return json({ error: "Submission not found" }, 404);
  if (!submission.posted_url && !submission.external_video_id) {
    return json({ error: "No published video URL has been submitted" }, 400);
  }

  const [{ data: campaign, error: campaignError }, { data: actor }] = await Promise.all([
    db.from("campaigns")
      .select("advertiser_id,payment_method,payment_rate,desired_results,max_budget,status")
      .eq("id", submission.campaign_id)
      .single(),
    db.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);

  if (campaignError || !campaign) return json({ error: "Campaign not found" }, 404);
  const authorized = user.id === submission.creator_id
    || user.id === campaign.advertiser_id
    || actor?.role === "admin";
  if (!authorized) return json({ error: "You cannot check metrics for this submission" }, 403);
  if (!["active", "funded"].includes(String(campaign.status))) {
    return json({ error: "Campaign is not active for metric tracking" }, 409);
  }
  if (!["waiting", "approved"].includes(String(submission.status))) {
    return json({ error: "This submission is not eligible for metric tracking" }, 409);
  }
  if (!["views", "cpm"].includes(String(campaign.payment_method).toLowerCase())) {
    return json({ error: "This campaign does not use view-based tracking" }, 409);
  }

  let platform = String(submission.tracking_platform || "").toLowerCase();
  let videoId = submission.external_video_id as string | null;
  let views = 0;
  const source = "platform_api";
  let raw: Record<string, unknown> = {};

  if (platform === "youtube" || (!platform && /youtu/i.test(submission.posted_url || ""))) {
    platform = "youtube";
    videoId ||= youtubeId(submission.posted_url || "");
    const key = Deno.env.get("YOUTUBE_API_KEY");
    if (!key) return json({ error: "YouTube tracking is ready but YOUTUBE_API_KEY is not configured." }, 503);
    if (!videoId) return json({ error: "Could not identify the YouTube video." }, 400);

    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "statistics,snippet");
    url.searchParams.set("id", videoId);
    url.searchParams.set("key", key);
    const response = await fetch(url);
    const data = await response.json();
    const item = data?.items?.[0];
    if (!response.ok || !item) return json({ error: "YouTube could not return this video." }, 502);
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
    if (!connection?.access_token) {
      return json({ error: "TikTok creator connection is required before automatic view tracking can start." }, 409);
    }
    const response = await fetch(
      "https://open.tiktokapis.com/v2/video/query/?fields=id,title,view_count,like_count,comment_count,share_count",
      {
        method: "POST",
        headers: { Authorization: "Bearer " + connection.access_token, "Content-Type": "application/json" },
        body: JSON.stringify({ filters: { video_ids: [videoId] } }),
      },
    );
    const data = await response.json();
    const item = data?.data?.videos?.[0];
    if (!response.ok || !item) return json({ error: "TikTok could not return this video." }, 502);
    views = Number(item.view_count || 0);
    raw = item;
  } else if (platform === "x" || platform === "twitter") {
    platform = "x";
    videoId ||= (submission.posted_url || "").match(/status\/(\d+)/)?.[1] || null;
    if (!videoId) return json({ error: "Could not identify the X post." }, 400);
    const { data: connection } = await db.from("creator_platform_connections")
      .select("access_token,connected")
      .eq("creator_id", submission.creator_id)
      .eq("platform", "x")
      .eq("connected", true)
      .maybeSingle();
    const tokenForPlatform = connection?.access_token || Deno.env.get("X_BEARER_TOKEN");
    if (!tokenForPlatform) {
      return json({ error: "X tracking requires an authorized creator connection or X API token." }, 409);
    }
    const url = new URL("https://api.x.com/2/tweets/" + videoId);
    url.searchParams.set("tweet.fields", "public_metrics");
    const response = await fetch(url, { headers: { Authorization: "Bearer " + tokenForPlatform } });
    const data = await response.json();
    if (!response.ok || !data?.data) return json({ error: "X could not return this post." }, 502);
    views = Number(data.data.public_metrics?.view_count || 0);
    raw = data.data;
  } else if (platform === "instagram") {
    videoId ||= (submission.posted_url || "").match(/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/)?.[1] || null;
    if (!videoId) return json({ error: "Could not identify the Instagram post/reel." }, 400);
    const { data: connection } = await db.from("creator_platform_connections")
      .select("access_token,connected")
      .eq("creator_id", submission.creator_id)
      .eq("platform", "instagram")
      .eq("connected", true)
      .maybeSingle();
    if (!connection?.access_token) {
      return json({ error: "Instagram tracking requires a connected professional creator/business account." }, 409);
    }
    const url = new URL("https://graph.facebook.com/v23.0/" + videoId + "/insights");
    url.searchParams.set("metric", "views");
    url.searchParams.set("access_token", connection.access_token);
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) return json({ error: "Instagram could not return this media's insights." }, 502);
    views = Number(data?.data?.find((item: any) => item.name === "views")?.values?.at(-1)?.value || 0);
    raw = data;
  } else if (platform === "facebook") {
    videoId ||= (submission.posted_url || "").match(/(?:videos|reel|watch)\/(\d+)/)?.[1] || null;
    if (!videoId) return json({ error: "Could not identify the Facebook video." }, 400);
    const { data: connection } = await db.from("creator_platform_connections")
      .select("access_token,connected")
      .eq("creator_id", submission.creator_id)
      .eq("platform", "facebook")
      .eq("connected", true)
      .maybeSingle();
    if (!connection?.access_token) {
      return json({ error: "Facebook tracking requires a connected Page/creator account." }, 409);
    }
    const url = new URL("https://graph.facebook.com/v23.0/" + videoId + "/insights");
    url.searchParams.set("metric", "post_media_view");
    url.searchParams.set("access_token", connection.access_token);
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) return json({ error: "Facebook could not return this video's insights." }, 502);
    views = Number(data?.data?.find((item: any) => item.name === "post_media_view")?.values?.at(-1)?.value || 0);
    raw = data;
  } else if (platform === "snapchat") {
    return json({
      error: "Snapchat tracking requires the creator to authorize/share eligible Public Profile or Spotlight insights. Automatic API retrieval is not enabled for this account yet.",
      code: "SNAPCHAT_AUTH_REQUIRED",
      platform,
    }, 409);
  } else {
    return json({ error: "Automatic tracking for this platform is not connected yet.", platform }, 409);
  }

  const target = Number(submission.target_metric || 0);
  const reached = target > 0 && views >= target;
  const now = new Date().toISOString();

  const { error: metricError } = await db.from("submission_metrics").insert({
    submission_id: submission.id,
    platform,
    external_video_id: videoId,
    metric_name: "views",
    metric_value: views,
    checked_at: now,
    source,
    raw_data: raw,
  });
  if (metricError) return json({ error: "The verified metric could not be saved." }, 503);

  const update: Record<string, unknown> = {
    tracking_platform: platform,
    external_video_id: videoId,
    current_metric: views,
    last_metric_check_at: now,
    tracking_error: null,
    metric_status: reached ? "target_reached" : "tracking",
  };
  if (reached) update.metric_verified_at = now;

  const { error: updateError } = await db.from("submissions").update(update).eq("id", submission.id);
  if (updateError) return json({ error: "The submission metric summary could not be updated." }, 503);

  let paymentReleased = false;
  let paymentReason: string | null = null;
  if (reached) {
    const rate = Number(campaign.payment_rate || 0);
    const requestedAmount = Number((rate * (target / 1000)).toFixed(2));
    if (requestedAmount > 0) {
      const { data: payment, error: paymentError } = await db.rpc("release_creator_campaign_payment", {
        p_campaign_id: submission.campaign_id,
        p_creator_id: submission.creator_id,
        p_amount: requestedAmount,
        p_submission_id: submission.id,
        p_allow_partial: true,
        p_complete_submission: true,
      });
      if (paymentError) return json({ error: "The creator payment could not be safely released." }, 503);
      paymentReleased = Boolean(payment?.paid);
      paymentReason = payment?.reason || null;
    }
  }

  return json({
    success: true,
    platform,
    video_id: videoId,
    views,
    target,
    reached,
    payment_released: paymentReleased,
    payment_reason: paymentReason,
  });
});
