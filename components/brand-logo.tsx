"use client";
import { useState } from "react";
import type { Branding } from "@/lib/branding/defaults";

export function BrandLogo({ branding }: { branding: Branding }) {
  const [failed, setFailed] = useState(false);
  let src = branding.logoUrl;
  if (src && branding.updatedAt) {
    try { const url = new URL(src); url.searchParams.set("brand_v", branding.updatedAt); src = url.toString(); }
    catch { src = null; }
  }
  return <div style={{display:"flex",alignItems:"center",gap:12,minWidth:0}}>
    {src && !failed
      ? <img src={src} alt="" onError={() => setFailed(true)} style={{width:42,height:42,objectFit:"contain",flexShrink:0}} />
      : <div aria-hidden="true" style={{width:42,height:42,borderRadius:12,background:branding.primaryColor,color:"#fff",display:"grid",placeItems:"center",fontWeight:800,flexShrink:0}}>{branding.productName.trim().slice(0,1).toUpperCase() || "•"}</div>}
    <div style={{minWidth:0}}><div style={{fontWeight:800,overflowWrap:"anywhere"}}>{branding.productName}</div><div className="muted" style={{fontSize:12}}>{branding.productTagline}</div></div>
  </div>;
}
