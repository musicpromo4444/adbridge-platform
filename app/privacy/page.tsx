import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How AdBridge handles account, campaign, measurement and payout information.",
};

const updated = "27 November 2026";

export default function PrivacyPolicy() {
  return (
    <main className="formPage">
      <div className="formCard wide">
        <span className="eyebrow">ADBRIDGE · LEGAL</span>
        <h1>Privacy <em>Policy.</em></h1>
        <p>Last updated: {updated}</p>
        <p>This policy explains how AdBridge processes information when you use the marketplace as an advertiser, creator or website/app publisher. It is a product privacy notice and should be reviewed with qualified counsel before commercial launch in each operating country.</p>
        <h2>1. Information we process</h2>
        <p>We process account details such as your name, email address, account role and profile information; campaign briefs, budgets, creative assets and destination URLs; creator submissions and public post links; publisher property and placement details; support and notification records; and payout destination details needed to administer withdrawals.</p>
        <p>For measurement and platform security, we may process event identifiers, timestamps, placement and campaign identifiers, coarse device/browser signals, referrer information, IP-derived security signals, event signatures, conversion evidence and fraud-risk assessments. A tracking-link click is not treated as a verified video view.</p>
        <h2>2. Connected accounts and third parties</h2>
        <p>If you connect a social platform, AdBridge processes the authorization and permitted metrics needed for the feature you requested. You can disconnect a supported account from your settings. We use infrastructure and service providers for hosting, authentication, storage, analytics, payment processing and platform integrations. Those providers process information under their own terms and applicable agreements.</p>
        <h2>3. How information is used</h2>
        <ul>
          <li>Create and secure accounts and enforce account roles.</li>
          <li>Publish and manage campaigns, submissions, publisher placements and notifications.</li>
          <li>Measure delivery, attribute eligible outcomes and calculate campaign and payout ledgers.</li>
          <li>Detect duplicate, automated, manipulated or otherwise suspicious activity and investigate disputes.</li>
          <li>Process funding and withdrawals, provide support and meet legal obligations.</li>
        </ul>
        <h2>4. Sharing</h2>
        <p>Advertisers receive campaign performance and work-submission information needed to assess delivery. Creators and publishers receive the campaign instructions and operational information needed to participate. We do not provide an in-platform advertiser-to-creator private chat or expose private payout credentials to other marketplace participants. We do not sell personal information.</p>
        <h2>5. Cookies and local storage</h2>
        <p>AdBridge may use browser local storage and session storage to maintain basic visitor and session identifiers for advertising measurement, frequency controls, fraud prevention and duplicate-event detection. These identifiers are not intended to identify you by name. The Privacy choices control lets you allow measurement or select essential-only storage, and you can reopen it later to change your choice. Choosing essential-only removes AdBridge's advertising visitor and session identifiers from that browser. You can also clear browser storage or use browser privacy controls, although some tracking and service features may then work differently.</p>
        <h2>6. Retention and security</h2>
        <p>We retain information for as long as needed to operate accounts, preserve campaign and financial records, resolve disputes, investigate fraud and comply with law. We apply access controls and security measures, but no internet service can guarantee absolute security. Do not place private signing keys or passwords in public repositories or client-side code.</p>
        <h2>7. Your choices and rights</h2>
        <p>Depending on your location, you may have rights to access, correct, delete, export or object to certain processing of your personal information. You can update profile details, disconnect supported social accounts and contact AdBridge through the support channel published in the service. Some financial, fraud-prevention or legal records may need to be retained.</p>
        <h2>8. Children and changes</h2>
        <p>AdBridge is intended for people legally able to enter the applicable marketplace agreements and is not designed for children. We may update this notice as the service changes. The latest version will be published on this page.</p>
        <p><b>Contact:</b> Use the support contact published in your AdBridge account or on the official AdBridge website.</p>
        <Link className="secondary" href="/">← Back to AdBridge</Link>
      </div>
    </main>
  );
}
