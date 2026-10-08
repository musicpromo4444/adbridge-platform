import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const body = await req.json().catch(() => ({}));
  const platform = String(body.platform || "TikTok");
  const campaign = String(body.campaign || "");
  const instructions = String(body.instructions || "");
  const tone = String(body.tone || "natural");
  const topic = String(body.topic || "");

  if (!campaign && !topic) {
    return json({ error: "campaign or topic is required" }, 400);
  }

  const key = Deno.env.get("AI_API_KEY") || "";
  if (!key) {
    return json({
      error: "AI provider is not configured. Add AI_API_KEY in Supabase Edge Function Secrets.",
    }, 503);
  }

  const base = (Deno.env.get("AI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = Deno.env.get("AI_MODEL") || "gpt-4o-mini";

  const system = [
    "You are AdBridge Creator AI.",
    "Create honest social-post copy and creator guidance.",
    "Never invent product claims, results, discounts, links, partnerships, testimonials,",
    "or platform policies.",
    "Do not encourage spam, fake engagement, misleading claims, or policy evasion.",
    "Return JSON with title, hook, caption, call_to_action, hashtags (array), and placement_tip.",
  ].join(" ");

  const response = await fetch(base + "/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: JSON.stringify({ platform, campaign, instructions, tone, topic }),
        },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return json({ error: "AI provider request failed." }, 502);
  }

  const raw = data?.choices?.[0]?.message?.content;

  try {
    return json({ result: JSON.parse(raw) });
  } catch {
    return json({
      result: {
        title: "Draft",
        hook: "",
        caption: raw || "",
        call_to_action: "",
        hashtags: [],
        placement_tip: "Review the post before publishing.",
      },
    });
  }
});
