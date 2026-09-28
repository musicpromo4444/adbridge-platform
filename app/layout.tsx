import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "AdBridge — Where brands meet creators", description: "A creator advertising marketplace for brands and creators." };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }