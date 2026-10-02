import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Tracking is not configured." }, { status: 503 });

  const db = createClient(url, key);
  const { data: link, error } = await db
    .from("tracking_links")
    .select("id,target_url,campaign_id,creator_id,click_count,unique_click_count")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !link) return NextResponse.json({ error: "Tracking link not found." }, { status: 404 });
  if (!/^https?:\\/\\//i.test(link.target_url)) return NextResponse.json({ error: "Invalid destination." }, { status: 400 });

  const visitor = request.cookies.get("adbridge_visitor")?.value || crypto.randomUUID();
  const already = Boolean(request.cookies.get(`adbridge_click_${slug}`)?.value);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const ua = request.headers.get("user-agent") || "";
  const visitorKey = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(visitor + "|" + ip + "|" + ua));
  const visitorHash = Array.from(new Uint8Array(visitorKey)).map(x => x.toString(16).padStart(2, "0")).join("");

  await db.from("tracking_clicks").insert({
    tracking_link_id: link.id,
    visitor_key: visitorHash,
    ip_hash: visitorHash,
    user_agent: ua.slice(0, 500),
    referrer: request.headers.get("referer") || null,
  });

  await db.from("tracking_links").update({
    click_count: Number(link.click_count || 0) + 1,
    unique_click_count: Number(link.unique_click_count || 0) + (already ? 0 : 1),
  }).eq("id", link.id);

  const response = NextResponse.redirect(link.target_url, 302);
  response.cookies.set("adbridge_visitor", visitor, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 31536000, path: "/" });
  response.cookies.set(`adbridge_click_${slug}`, "1", { httpOnly: true, sameSite: "lax", secure: true, maxAge: 86400, path: "/" });
  return response;
}
