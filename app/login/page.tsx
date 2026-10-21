import { getPlatformBranding } from "@/lib/branding/service";
import { BrandLogo } from "@/components/brand-logo";
import { LoginForm } from "@/components/login-form";
export const dynamic = "force-dynamic";
export default async function LoginPage() {
  const brand=await getPlatformBranding();
  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24}}><section className="card" style={{width:"min(100%,430px)"}}><BrandLogo branding={brand}/><h1 style={{fontSize:28,margin:"28px 0 8px"}}>Sign in</h1><p className="muted">{brand.productTagline}</p><LoginForm/><p className="muted" style={{fontSize:12,marginTop:28}}>{brand.footerText}</p></section></main>;
}
