import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://adbridge-platform.vercel.app";
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/admin", "/advertiser", "/creator", "/publisher", "/notifications", "/api", "/login", "/forgot-password", "/reset-password"] },
    ],
    sitemap: new URL("/sitemap.xml", base).toString(),
  };
}
