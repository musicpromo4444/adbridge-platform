import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const configured = Boolean(supabaseUrl && supabaseKey);

  return NextResponse.json(
    {
      service: "adbridge-platform",
      status: "ok",
      timestamp: new Date().toISOString(),
      integrations: {
        supabase: configured ? "configured" : "not_configured",
      },
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
