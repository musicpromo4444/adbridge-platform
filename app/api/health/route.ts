import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return NextResponse.json(
      {
        service: "adbridge-platform",
        status: "degraded",
        timestamp: new Date().toISOString(),
        dependencies: { supabase: "not_configured" },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  let databaseStatus: "reachable" | "unreachable" = "unreachable";
  try {
    const response = await fetch(new URL("/rest/v1/", url), {
      method: "GET",
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    // PostgREST root responds with its OpenAPI document when the API is reachable.
    databaseStatus = response.status < 500 ? "reachable" : "unreachable";
  } catch {
    databaseStatus = "unreachable";
  }

  const healthy = databaseStatus === "reachable";
  return NextResponse.json(
    {
      service: "adbridge-platform",
      status: healthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      dependencies: { supabase: databaseStatus },
    },
    {
      status: healthy ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
