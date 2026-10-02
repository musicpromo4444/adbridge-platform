import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Tracking is not configured." }, { status: 503 });

  const db = createClient(url, key);
  const visitor = request.cookies.get("adbridge_visitor")?.value || crypto.randomUUID();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const ua = request.headers.get("user-agent") || "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(visitor + "|" + ip + "|" + ua));
  const visitorHash = Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, "0")).join("");

  const { data, error } = await db.rpc("record_tracking_click", {
    p_slug: slug,
    p_visitor_key: visitorHash,
    p_user_agent: ua,
    p_referrer: request.headers.get("referer") || ""
  }).maybeSingle();

  if (error || !data?.target_url) return NextResponse.json({ error: "Tracking link not found." }, { status: 404 });

  try {
    const destination = new URL(data.target_url);
    if (!["http:", "https:"].includes(destination.protocol)) throw new Error("invalid");
  } catch {
    return NextResponse.json({ error: "Invalid destination." }, { status: 400 });
  }

  const response = NextResponse.redirect(data.target_url, 302);
  response.cookies.set("adbridge_visitor", visitor, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 31536000, path: "/" });
  return response;
}
