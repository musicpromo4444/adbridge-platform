import type { Metadata } from "next";import "./globals.css";import AdPlacement from "@/components/AdPlacement";
import ConsentManager from "@/components/ConsentManager";
export const metadata: Metadata={
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://adbridge-platform.vercel.app"),
  title: { default: "AdBridge — Where brands meet creators", template: "%s | AdBridge" },
  description: "A performance advertising marketplace connecting advertisers with creators and website or app publishers.",
  applicationName: "AdBridge",
  openGraph: {
    type: "website",
    siteName: "AdBridge",
    title: "AdBridge — Where brands meet creators",
    description: "Launch campaigns, reach real audiences and measure verified advertising delivery.",
  },
  twitter: {
    card: "summary_large_image",
    title: "AdBridge — Where brands meet creators",
    description: "A performance advertising marketplace for advertisers, creators and publishers.",
  },
  robots: { index: true, follow: true },
};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}<ConsentManager/><div style={{position:"fixed",left:12,bottom:12,zIndex:50,maxWidth:360,width:"calc(100% - 24px)"}}><AdPlacement/></div></body></html>}