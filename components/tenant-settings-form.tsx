"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type TenantSettings = {
  businessName: string; logoUrl: string | null; contactEmail: string | null; contactPhone: string | null;
  address: string | null; invoicePrefix: string; invoiceIdentity: Record<string, unknown>; preferences: Record<string, unknown>;
};
const blank: TenantSettings = {businessName:"",logoUrl:null,contactEmail:null,contactPhone:null,address:null,invoicePrefix:"INV",invoiceIdentity:{},preferences:{}};

export function TenantSettingsForm({ initial }: { initial: TenantSettings | null }) {
  const router=useRouter();
  const [form,setForm]=useState<TenantSettings>(initial??blank);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [uploading,setUploading]=useState(false);
  function update<K extends keyof TenantSettings>(key:K,value:TenantSettings[K]) {setForm(previous=>({...previous,[key]:value}));setError("");setMessage("");}
  async function save(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setError("");setMessage("");
    try {
      const response=await fetch("/api/v1/tenant-settings",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(form),cache:"no-store"});
      const payload=await response.json();
      if(!response.ok)throw new Error(payload?.error?.message||"Business settings could not be saved.");
      setForm(payload.data as TenantSettings);setMessage("Business identity saved.");router.refresh();
    } catch(cause) {setError(cause instanceof Error?cause.message:"Business settings could not be saved.");}
    finally {setBusy(false);}
  }
  async function uploadLogo(file?:File) {
    if(!file)return;
    setUploading(true);setError("");setMessage("");
    try {
      if(!form.businessName.trim())throw new Error("Enter a business name before uploading a logo.");
      const saved=await fetch("/api/v1/tenant-settings",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(form),cache:"no-store"});
      const savedPayload=await saved.json();
      if(!saved.ok)throw new Error(savedPayload?.error?.message||"Save business details before uploading a logo.");
      const data=new FormData();data.set("file",file);
      const response=await fetch("/api/v1/tenant-settings/logo",{method:"POST",body:data,cache:"no-store"});
      const payload=await response.json();
      if(!response.ok)throw new Error(payload?.error?.message||"Logo upload failed.");
      update("logoUrl",payload.data.logoUrl);setMessage("Business logo uploaded and saved.");router.refresh();
    } catch(cause) {setError(cause instanceof Error?cause.message:"Logo upload failed.");}
    finally {setUploading(false);}
  }
  return <form onSubmit={save} style={{display:"grid",gap:14}}>
    <label className="field">Business name<input required maxLength={160} value={form.businessName} onChange={e=>update("businessName",e.target.value)} /></label>
    <label className="field">Business logo<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={e=>void uploadLogo(e.target.files?.[0])} /><small className="muted">{form.logoUrl ? "A business logo is configured." : "No custom business logo uploaded."}</small></label>
    <label className="field">Business contact email<input type="email" maxLength={320} value={form.contactEmail||""} onChange={e=>update("contactEmail",e.target.value||null)} /></label>
    <label className="field">Business phone<input type="tel" maxLength={40} value={form.contactPhone||""} onChange={e=>update("contactPhone",e.target.value||null)} /></label>
    <label className="field">Business address<textarea rows={3} maxLength={1000} value={form.address||""} onChange={e=>update("address",e.target.value||null)} /></label>
    <label className="field">Invoice prefix<input required pattern="[A-Za-z0-9_-]+" maxLength={20} value={form.invoicePrefix} onChange={e=>update("invoicePrefix",e.target.value)} /></label>
    {error&&<p role="alert" style={{color:"#b42318"}}>{error}</p>}{message&&<p role="status" style={{color:"#067647"}}>{message}</p>}
    <button className="brand-button" disabled={busy||uploading}>{busy?"Saving…":"Save business identity"}</button>
  </form>;
}
