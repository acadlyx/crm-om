"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type TenantSettings = {
  businessName: string; logoUrl: string | null; contactEmail: string | null; contactPhone: string | null;
  address: string | null; invoicePrefix: string; invoiceIdentity: Record<string, unknown>; preferences: Record<string, unknown>;
  currency: string; timezone: string; financialYearStartMonth: number; inventoryCostingMethod: "WEIGHTED_AVERAGE"; defaultPaymentTermsDays: number;
};
const blank: TenantSettings = {businessName:"",logoUrl:null,contactEmail:null,contactPhone:null,address:null,invoicePrefix:"INV",invoiceIdentity:{},preferences:{},currency:"INR",timezone:"Asia/Kolkata",financialYearStartMonth:4,inventoryCostingMethod:"WEIGHTED_AVERAGE",defaultPaymentTermsDays:0};

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
      setForm(payload.data as TenantSettings);setMessage("Business settings saved.");router.refresh();
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

    <p className="muted document-template-settings-link">Configure invoice, receipt and supplier PDF layouts in <a href="/settings/document-templates">Document templates</a>.</p>

    <h2 className="settings-section-heading">Operating preferences</h2>
    <label className="field">Business currency
      <select value={form.currency} onChange={e=>update("currency",e.target.value)}>
        <option value="INR">INR · Indian Rupee</option><option value="USD">USD · US Dollar</option><option value="EUR">EUR · Euro</option><option value="GBP">GBP · Pound Sterling</option><option value="AED">AED · UAE Dirham</option><option value="CAD">CAD · Canadian Dollar</option><option value="AUD">AUD · Australian Dollar</option><option value="SGD">SGD · Singapore Dollar</option>
      </select>
    </label>
    <label className="field">Business timezone<input required maxLength={80} value={form.timezone} onChange={e=>update("timezone",e.target.value)} placeholder="Asia/Kolkata" /><small className="muted">Use an IANA timezone such as Asia/Kolkata or Europe/London.</small></label>
    <label className="field">Financial year starts in
      <select value={String(form.financialYearStartMonth)} onChange={e=>update("financialYearStartMonth",Number(e.target.value))}>
        {["January","February","March","April","May","June","July","August","September","October","November","December"].map((month,index)=><option key={month} value={index+1}>{month}</option>)}
      </select>
    </label>
    <label className="field">Inventory costing method
      <select value={form.inventoryCostingMethod} onChange={e=>update("inventoryCostingMethod",e.target.value as "WEIGHTED_AVERAGE")}>
        <option value="WEIGHTED_AVERAGE">Moving weighted average</option>
      </select>
      <small className="muted">This workspace currently supports moving weighted-average costing.</small>
    </label>
    <label className="field">Default payment terms (days)<input type="number" required min={0} max={365} step={1} value={form.defaultPaymentTermsDays} onChange={e=>update("defaultPaymentTermsDays",Number(e.target.value))} /></label>
    <label className="field">Invoice prefix<input required pattern="[A-Za-z0-9_-]+" maxLength={20} value={form.invoicePrefix} onChange={e=>update("invoicePrefix",e.target.value)} /></label>
    {error&&<p role="alert" style={{color:"#b42318"}}>{error}</p>}{message&&<p role="status" style={{color:"#067647"}}>{message}</p>}
    <button className="brand-button" disabled={busy||uploading}>{busy?"Saving…":"Save business settings"}</button>
  </form>;
}
