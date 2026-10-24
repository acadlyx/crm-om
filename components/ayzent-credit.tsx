import { ArrowUpRight } from "lucide-react";

const AYZENT_VERCEL_URL =
  process.env.NEXT_PUBLIC_AYZENT_VERCEL_URL || "https://ayzent-solutions.vercel.app";

export function AyzentCredit() {
  return (
    <footer
      className="ayzent-credit"
      aria-label="Platform development and maintenance credit"
    >
      <span>Designed, developed and maintained by</span>
      <a href={AYZENT_VERCEL_URL} target="_blank" rel="noopener noreferrer">
        Ayzent Solutions <ArrowUpRight size={13} aria-hidden="true" />
      </a>
      <span className="ayzent-credit-separator" aria-hidden="true">·</span>
      <a href={AYZENT_VERCEL_URL} target="_blank" rel="noopener noreferrer">
        View Ayzent on Vercel <ArrowUpRight size={13} aria-hidden="true" />
      </a>
    </footer>
  );
}
