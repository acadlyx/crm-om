import { getPlatformBranding, renderFooterText } from "@/lib/branding/service";
import { BrandLogo } from "@/components/brand-logo";
import { Activity, ArrowUpRight, HandCoins, Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Home() {
  const brand = await getPlatformBranding();

  return (
    <main className="public-landing">
      <header className="public-landing-header">
        <BrandLogo branding={brand} />
        <span className="public-landing-status"><span /> Business management, simplified</span>
      </header>

      <section className="public-landing-hero">
        <p className="public-landing-eyebrow">A CLEARER WAY TO WORK</p>
        <h1>Everything important to your business.<br /><span>All in one place.</span></h1>
        <p className="public-landing-description">
          Keep customer relationships, sales, payments, and everyday operations connected
          with a workspace built to make business easier to understand.
        </p>
        <div className="public-landing-divider" />

        <div className="public-landing-features" aria-label="Platform features">
          <article className="public-landing-feature">
            <span className="public-landing-feature-icon"><Users size={21} aria-hidden="true" /></span>
            <div><h2>Customer relationships</h2><p>Keep leads, customers, and follow-ups organized.</p></div>
          </article>
          <article className="public-landing-feature">
            <span className="public-landing-feature-icon"><Activity size={21} aria-hidden="true" /></span>
            <div><h2>Sales & operations</h2><p>See progress from the pipeline through daily tasks.</p></div>
          </article>
          <article className="public-landing-feature">
            <span className="public-landing-feature-icon"><HandCoins size={21} aria-hidden="true" /></span>
            <div><h2>Financial clarity</h2><p>Keep invoices, received payments, and expenses together.</p></div>
          </article>
        </div>
      </section>

      <footer className="public-landing-footer">
        <span>{renderFooterText(brand.footerText, brand.productName)}</span>
        <span className="public-landing-footer-mark"><ArrowUpRight size={14} aria-hidden="true" /> Built for clearer decisions</span>
      </footer>
    </main>
  );
}
