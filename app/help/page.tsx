import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Help Center",
  description: "How advertisers, creators and website/app publishers use AdBridge.",
};

export default function Help() {
  return (
    <main className="dashboard">
      <div className="topbar"><Link href="/">← AdBridge</Link></div>
      <section className="hero">
        <p className="eyebrow">HELP CENTER</p>
        <h1>How AdBridge works</h1>
        <p>AdBridge connects advertisers with social creators and website or app publishers. Campaign delivery, measurement and payment eligibility are managed through the platform.</p>
      </section>
      <div className="grid">
        <div className="card"><h2>Advertisers</h2><p>Create a campaign, choose a delivery format and payment model, set the budget, fund it through the available checkout, and monitor verified results.</p><Link href="/advertiser">Open advertiser workspace →</Link></div>
        <div className="card"><h2>Creators</h2><p>Connect supported social accounts, discover suitable campaigns, review the requirements, complete any campaign understanding check, publish your work and submit the public post link.</p><Link href="/creator">Open creator workspace →</Link></div>
        <div className="card"><h2>Website and app publishers</h2><p>Register a website, web app, Android app or iOS app that you own. After property verification, apply for compatible campaigns and integrate the server-side ad delivery and event-signing flow.</p><Link href="/publisher">Open publisher delivery center →</Link></div>
        <div className="card"><h2>Verified measurement</h2><p>AdBridge distinguishes raw activity from verified results. A tracking-link click is not a video view. Social metrics require supported platform evidence; publisher events require approved inventory and valid server signatures.</p></div>
        <div className="card"><h2>Funding and payouts</h2><p>Campaign funding must be confirmed before delivery can become payable. Creator and publisher earnings are subject to event verification, fraud review, campaign budget and payout-method checks. A displayed balance is not a promise of instant bank settlement.</p></div>
        <div className="card"><h2>Fraud and fair use</h2><p>Do not buy views or clicks, use bots, manipulate installs, create duplicate events or misrepresent property ownership. Suspicious activity can be held for review and excluded from payable results.</p></div>
      </div>
      <section className="quick">
        <h2>Important account information</h2>
        <p>AdBridge does not provide private advertiser-to-creator chat. Campaign instructions, submissions, decisions and notifications stay in the relevant platform workflows. Never share passwords, signing keys or payout credentials with another user.</p>
        <div className="choiceRow"><Link href="/privacy">Privacy Policy →</Link><Link href="/terms">Terms of Use →</Link><Link href="/signup">Create an account →</Link></div>
      </section>
    </main>
  );
}
