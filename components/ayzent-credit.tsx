import { ArrowUpRight } from "lucide-react";

const AYZENT_WEBSITE_URL = "https://www.ayzentsolutions.com";
const AYZENT_VERCEL_URL = process.env.NEXT_PUBLIC_AYZENT_VERCEL_URL?.trim();

export function AyzentCredit() {
  return (
    <footer
      className="ayzent-credit"
      aria-label="Platform development and maintenance credit"
    >
      <span>Designed, developed and maintained by</span>
      <a href={AYZENT_WEBSITE_URL} target="_blank" rel="noopener noreferrer">
        Ayzent Solutions <ArrowUpRight size={13} aria-hidden="true" />
      </a>
      <span className="ayzent-credit-separator" aria-hidden="true">·</span>
      {AYZENT_VERCEL_URL ? (
        <a href={AYZENT_VERCEL_URL} target="_blank" rel="noopener noreferrer">
          View Ayzent on Vercel <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      ) : (
        <a href={AYZENT_WEBSITE_URL} target="_blank" rel="noopener noreferrer" title="Set NEXT_PUBLIC_AYZENT_VERCEL_URL to the direct Vercel deployment URL.">
          Visit Ayzent website <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      )}
    </footer>
  );
}
