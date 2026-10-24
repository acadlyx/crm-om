import { ArrowUpRight } from "lucide-react";

const AYZENT_SOURCE_URL = "https://github.com/ayzentsolutions/ayzent-solutions";
const AYZENT_VERCEL_URL = process.env.NEXT_PUBLIC_AYZENT_VERCEL_URL?.trim();

export function AyzentCredit() {
  const ayzentUrl = AYZENT_VERCEL_URL || AYZENT_SOURCE_URL;
  return (
    <footer
      className="ayzent-credit"
      aria-label="Platform development and maintenance credit"
    >
      <span>Designed, developed and maintained by</span>
      <a href={ayzentUrl} target="_blank" rel="noopener noreferrer">
        Ayzent Solutions <ArrowUpRight size={13} aria-hidden="true" />
      </a>
      <span className="ayzent-credit-separator" aria-hidden="true">·</span>
      {AYZENT_VERCEL_URL ? (
        <a href={AYZENT_VERCEL_URL} target="_blank" rel="noopener noreferrer">
          View Ayzent on Vercel <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      ) : (
        <span className="ayzent-credit-config-note" title="Set NEXT_PUBLIC_AYZENT_VERCEL_URL to the verified Ayzent deployment URL.">
          Vercel deployment link needs configuration
        </span>
      )}
    </footer>
  );
}
