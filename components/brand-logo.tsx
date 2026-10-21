import type { Branding } from "@/lib/branding/defaults";
export function BrandLogo({ branding }: { branding: Branding }) {
  return <div style={{display:"flex",alignItems:"center",gap:12,minWidth:0}}>
    {branding.logoUrl ? <img src={branding.logoUrl} alt="" style={{width:42,height:42,objectFit:"contain"}} onError={e=>{e.currentTarget.style.display="none";}}/> : <div aria-hidden="true" style={{width:42,height:42,borderRadius:12,background:branding.primaryColor,color:"#fff",display:"grid",placeItems:"center",fontWeight:800}}>{branding.productName.slice(0,1).toUpperCase()}</div>}
    <div style={{minWidth:0}}><div style={{fontWeight:800,overflowWrap:"anywhere"}}>{branding.productName}</div><div className="muted" style={{fontSize:12}}>{branding.productTagline}</div></div>
  </div>;
}
