import Link from "next/link";

export default function NotFound() {
  return (
    <main className="formPage">
      <div className="formCard">
        <span className="eyebrow">ADBRIDGE · 404</span>
        <h1>Page not <em>found.</em></h1>
        <p>This address may have changed or the page may no longer be available.</p>
        <Link className="primary" href="/">Return to AdBridge →</Link>
      </div>
    </main>
  );
}
