import { getPlatformBranding } from "@/lib/branding/service";
import { BrandLogo } from "@/components/brand-logo";

export default async function Loading() {
  const brand = await getPlatformBranding();
  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#f7f8fa"}}>
    <section style={{display:"grid",justifyItems:"center",gap:16,textAlign:"center"}}>
      <BrandLogo branding={brand}/>
      <span role="status" aria-live="polite" style={{color:"#667085",fontSize:14}}>Loading your workspace…</span>
    </section>
  </main>;
}
