import { getPlatformBranding } from "@/lib/branding/service";
import { BrandLogo } from "@/components/brand-logo";
import { QuoteLanding } from "@/components/quote-landing";

export default async function Home() {
  // The brand remains configured globally, but this route intentionally renders no logo or copy.
  await getPlatformBranding();
  void BrandLogo;
  return <QuoteLanding />;
}
