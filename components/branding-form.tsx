"use client";
import { useState } from "react";
import type { Branding } from "@/lib/branding/defaults";
export function BrandingForm({initial}:{initial:Branding}) {
 const [v,setV]=useState({productName:initial.productName,productTagline:initial.productTagline,logoUrl:initial.logoUrl||"",faviconUrl:initial.faviconUrl||"",primaryColor:initial.primaryColor,supportEmail:initial.supportEmail||"",supportWebsite:initial.supportWebsite||"",footerText:initial.footerText});
 const [message,setMessage]=useState(""),[error,setError]=useState(""),[pending,setPending]=useState(false);
 const update=(key:keyof typeof v,value:string)=>setV(old=>({...old,[key]:value}));
 async function upload(file:File|undefined,purpose:"logo"|"favicon") {
   if(!file)return;const data=new FormData();data.set("file",file);data.set("purpose",purpose);
   const response=await fetch("/api/v1/platform-settings/branding/assets",{method:"POST",body:data}),json=await response.json();
   if(!response.ok)throw new Error(json.error||"Upload failed");update(purpose==="logo"?"logoUrl":"faviconUrl",json.data.url);
 }
 async function save(e:React.FormEvent<HTMLFormElement>) {
  e.preventDefault();setMessage("");setError("");setPending(true);
  try {const r=await fetch("/api/v1/platform-settings/branding",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(v)}),j=await r.json();if(!r.ok)throw new Error(j.error||"Save failed");setMessage("Branding saved. New requests will use these settings.");}
  catch(error){setError(error instanceof Error?error.message:"Save failed");}finally{setPending(false);}
 }
 return <form onSubmit={save}>
  <label className="field">Product name<input value={v.productName} maxLength={120} required onChange={e=>update("productName",e.target.value)}/></label>
  <label className="field">Tagline<input value={v.productTagline} maxLength={240} required onChange={e=>update("productTagline",e.target.value)}/></label>
  <label className="field">Primary color<input type="color" value={v.primaryColor} onChange={e=>update("primaryColor",e.target.value)}/></label>
  <label className="field">Logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>upload(e.target.files?.[0],"logo").catch(err=>setError(err.message))}/><input aria-label="Logo URL" value={v.logoUrl} onChange={e=>update("logoUrl",e.target.value)} placeholder="Optional image URL"/></label>
  <label className="field">Favicon<input type="file" accept="image/png,image/jpeg,image/webp,image/x-icon" onChange={e=>upload(e.target.files?.[0],"favicon").catch(err=>setError(err.message))}/><input aria-label="Favicon URL" value={v.faviconUrl} onChange={e=>update("faviconUrl",e.target.value)} placeholder="Optional image URL"/></label>
  <label className="field">Support email<input type="email" value={v.supportEmail} onChange={e=>update("supportEmail",e.target.value)}/></label>
  <label className="field">Support website<input type="url" value={v.supportWebsite} onChange={e=>update("supportWebsite",e.target.value)}/></label>
  <label className="field">Footer text<input value={v.footerText} maxLength={500} required onChange={e=>update("footerText",e.target.value)}/></label>
  {error&&<p role="alert" style={{color:"#B42318"}}>{error}</p>}{message&&<p role="status" style={{color:"#067647"}}>{message}</p>}
  <button className="brand-button" disabled={pending}>{pending?"Saving…":"Save branding"}</button>
 </form>;
}
