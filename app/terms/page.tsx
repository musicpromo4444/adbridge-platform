import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Marketplace terms for AdBridge advertisers, creators and publishers.",
};

export default function TermsOfUse() {
  return (
    <main className="formPage">
      <div className="formCard wide">
        <span className="eyebrow">ADBRIDGE · LEGAL</span>
        <h1>Terms of <em>Use.</em></h1>
        <p>Last updated: 27 November 2026</p>
        <p>These draft marketplace terms describe the basic rules for using AdBridge. They are not a substitute for jurisdiction-specific legal review. By creating an account or using the service, you agree to the terms that apply to your role and any campaign-specific agreement presented in the product.</p>
        <h2>1. Marketplace roles</h2>
        <p>Advertisers create and fund campaigns. Creators apply for campaign work and submit public content links. Website and app publishers register inventory and apply to serve eligible campaigns. AdBridge provides campaign administration, tracking, measurement and payout workflows; it is not a party to agreements between users except where a separate service or payment agreement says otherwise.</p>
        <h2>2. Accurate information and eligibility</h2>
        <p>You must provide accurate account, identity, channel, property, campaign and payout information; control the social accounts or websites/apps you submit; and keep your login credentials secure. You may not impersonate another person, misrepresent ownership, manipulate metrics, generate invalid traffic or use the service for unlawful content or activity.</p>
        <h2>3. Campaigns, content and approvals</h2>
        <p>Advertisers are responsible for their products, claims, destination pages, creative assets, targeting instructions and campaign budgets. Creators must follow campaign instructions, disclose advertising relationships where required, obtain necessary rights and publish content that complies with applicable law and platform rules. Publishers may serve campaigns only on approved properties and placements. AdBridge may reject, pause or remove content, campaigns, properties or accounts that violate these terms or create safety, legal, fraud or payment risks.</p>
        <h2>4. Measurement and fraud prevention</h2>
        <p>AdBridge distinguishes raw events from verified events. A redirect or tracking-link click does not by itself establish a video view, install, conversion or payable result. Events may be deduplicated, sampled, checked against campaign rules, assessed for fraud and excluded, held or reviewed. Advertisers and participants agree that only results verified under the applicable campaign rules are eligible for performance reporting or payment.</p>
        <h2>5. Funding, fees and payouts</h2>
        <p>Campaign budgets, rates, funding requirements, platform fees, eligible results and payout conditions are shown in the campaign or account workflow. A campaign may require confirmed funding before activation. Creator and publisher earnings are subject to verification, available funded budget, fraud review, minimum withdrawal rules, payout-method validation and applicable provider processing. A displayed balance is not a guarantee of immediate bank settlement. AdBridge may hold disputed or suspicious amounts while a review is pending.</p>
        <h2>6. Prohibited conduct</h2>
        <ul>
          <li>Fake views, clicks, installs, leads, purchases, impressions or other artificial engagement.</li>
          <li>Bot traffic, click farms, device farms, incentive abuse or misleading attribution.</li>
          <li>Unauthorized access, scraping, reverse engineering or interference with platform security.</li>
          <li>Uploading malware, unlawful material, deceptive claims or content that infringes another person's rights.</li>
          <li>Sharing signing secrets, attempting to bypass campaign verification or misusing another user's data.</li>
        </ul>
        <h2>7. Intellectual property and licences</h2>
        <p>You retain ownership of content and materials you provide. You grant AdBridge the limited licence needed to host, display, distribute and process those materials to operate the campaign and service. You are responsible for having the rights and permissions needed for the content and assets you submit.</p>
        <h2>8. Suspension, termination and changes</h2>
        <p>We may restrict or suspend access when reasonably necessary to protect users, campaigns, payment integrity, legal compliance or platform security. You may stop using the service and request account closure through the published support channel, subject to records we must retain. We may update these terms and will publish the current version here.</p>
        <h2>9. Disclaimers and liability</h2>
        <p>The service is provided subject to applicable law and without a promise of campaign performance, audience size, conversion rate or uninterrupted availability. Nothing in these terms excludes rights or liability that cannot lawfully be excluded. Any additional limitation, governing law and dispute-resolution terms must be supplied in the final jurisdiction-specific agreement before launch.</p>
        <p><b>Contact:</b> Use the support contact published in your AdBridge account or on the official AdBridge website.</p>
        <Link className="secondary" href="/">← Back to AdBridge</Link>
      </div>
    </main>
  );
}
