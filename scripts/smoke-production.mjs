#!/usr/bin/env node
/**
 * Production smoke test for the public AdBridge surface.
 * Usage: ADBRIDGE_BASE_URL=https://adbridge-platform.vercel.app npm run smoke:production
 */
const base = (process.env.ADBRIDGE_BASE_URL || "").replace(/\/+$/, "");
if (!base) {
  console.error("Set ADBRIDGE_BASE_URL to the deployed AdBridge origin.");
  process.exit(2);
}
const checks = [
  { path: "/", type: "text/html" },
  { path: "/login", type: "text/html" },
  { path: "/signup", type: "text/html" },
  { path: "/privacy", type: "text/html" },
  { path: "/terms", type: "text/html" },
  { path: "/help", type: "text/html" },
  { path: "/rankings", type: "text/html" },
  { path: "/api/health", type: "application/json", health: true },
  { path: "/api/adbridge/embed", type: "application/javascript" },
];
let failed = 0;
for (const check of checks) {
  const url = base + check.path;
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
      headers: { "user-agent": "AdBridge-production-smoke/1.0" },
    });
    const contentType = response.headers.get("content-type") || "";
    let reason = "";
    if (!response.ok) reason = "HTTP " + response.status;
    else if (!contentType.includes(check.type)) reason = "unexpected content-type: " + contentType;
    if (!reason && check.health) {
      const body = await response.json();
      if (body.service !== "adbridge-platform" || body.status !== "ok" || body.dependencies?.supabase !== "reachable") {
        reason = "health dependency check did not report healthy Supabase";
      }
    }
    if (!reason && check.path === "/api/adbridge/embed") {
      const body = await response.text();
      if (!body.includes("AdBridge sponsored advertisement") || !body.includes("iframe")) {
        reason = "embed loader response is incomplete";
      }
    }
    if (reason) {
      failed++;
      console.error("FAIL " + check.path + " — " + reason);
    } else {
      console.log("PASS " + check.path + " — " + response.status);
    }
  } catch (error) {
    failed++;
    console.error("FAIL " + check.path + " — " + (error instanceof Error ? error.message : String(error)));
  }
}
console.log("\n" + (checks.length - failed) + "/" + checks.length + " production smoke checks passed.");
if (failed) process.exit(1);
