"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_RECEIPT_TEMPLATE, normalizeReceiptTemplate, type ReceiptTemplate } from "@/lib/receipts/template";

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
  const receiptTemplate = normalizeReceiptTemplate(form.preferences.receiptTemplate);
  function update<K extends keyof TenantSettings>(key:K,value:TenantSettings[K]) {setForm(previous=>({...previous,[key]:value}));setError("");setMessage("");}
  function updateReceiptTemplate<K extends keyof ReceiptTemplate>(key:K,value:ReceiptTemplate[K]) {
    update("preferences", {
      ...form.preferences,
      receiptTemplate: { ...receiptTemplate, [key]: value },
    });
  }
  async function save(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setError("");setMessage("");
    try {
      const response=await fetch("/api/v1/tenant-settings",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(form),cache:"no-store"});
      const payload=await response.json();
      if(!response.ok)throw new Error(payload?.error?.message||"Business settings could not be saved.");
      setForm(payload.data as TenantSettings);setMessage("Business identity and receipt template saved.");router.refresh();
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

    <h2 className="settings-section-heading">Receipt PDF template</h2>
    <p className="muted" style={{marginTop:-8}}>Customize the PDF downloaded from Customer receipts. Your business name, uploaded logo and contact details are included automatically.</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14}}>
      <label className="field">Receipt heading<input maxLength={70} value={receiptTemplate.title} onChange={e=>updateReceiptTemplate("title",e.target.value)} placeholder="Payment Receipt" /></label>
      <label className="field">Layout style<select value={receiptTemplate.style} onChange={e=>updateReceiptTemplate("style",e.target.value as ReceiptTemplate["style"])}>
        <option value="classic">Classic business</option><option value="modern">Modern branded</option><option value="minimal">Minimal</option>
      </select></label>
      <label className="field">Accent colour<input type="color" value={receiptTemplate.accentColor} onChange={e=>updateReceiptTemplate("accentColor",e.target.value)} style={{height:42,padding:4,maxWidth:120}} /></label>
      <label className="field">Signature label<input maxLength={80} value={receiptTemplate.signatureLabel} onChange={e=>updateReceiptTemplate("signatureLabel",e.target.value)} placeholder="Authorized signature" /></label>
    </div>
    <label className="field">Footer note<textarea rows={2} maxLength={400} value={receiptTemplate.footerText} onChange={e=>updateReceiptTemplate("footerText",e.target.value)} placeholder="Thank you for your business." /><small className="muted">Prints at the bottom of the receipt. Leave blank to omit it.</small></label>
    <div style={{display:"grid",gap:10}}>
      <label style={{display:"flex",alignItems:"center",gap:10,fontSize:14}}><input type="checkbox" checked={receiptTemplate.showAllocations} onChange={e=>updateReceiptTemplate("showAllocations",e.target.checked)} /> Show invoice allocation breakdown</label>
      <label style={{display:"flex",alignItems:"center",gap:10,fontSize:14}}><input type="checkbox" checked={receiptTemplate.showReference} onChange={e=>updateReceiptTemplate("showReference",e.target.checked)} /> Show transaction reference</label>
      <label style={{display:"flex",alignItems:"center",gap:10,fontSize:14}}><input type="checkbox" checked={receiptTemplate.showCustomerContact} onChange={e=>updateReceiptTemplate("showCustomerContact",e.target.checked)} /> Show customer contact details</label>
      <label style={{display:"flex",alignItems:"center",gap:10,fontSize:14}}><input type="checkbox" checked={receiptTemplate.showNotes} onChange={e=>updateReceiptTemplate("showNotes",e.target.checked)} /> Show receipt notes</label>
    </div>
    <div aria-label="Receipt template preview" style={{border:"1px solid "+receiptTemplate.accentColor,borderRadius:12,padding:18,background:"#fff",color:"#1d2924",maxWidth:620}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,borderBottom:"2px solid "+receiptTemplate.accentColor,paddingBottom:12}}>
        <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
          {form.logoUrl&&<img src={form.logoUrl} alt="" style={{width:42,height:42,objectFit:"contain"}} />}
          <div><strong>{form.businessName||"Your business name"}</strong><div style={{fontSize:11,color:"#69746e"}}>{form.contactEmail||form.contactPhone||"Business contact details"}</div></div>
        </div>
        <span style={{fontSize:11,color:receiptTemplate.accentColor,fontWeight:700}}>PDF PREVIEW</span>
      </div>
      <h3 style={{fontSize:20,color:receiptTemplate.style==="minimal"?"#1d2924":receiptTemplate.accentColor,margin:"18px 0 6px"}}>{receiptTemplate.title||DEFAULT_RECEIPT_TEMPLATE.title}</h3>
      <div style={{display:"flex",flexWrap:"wrap",justifyContent:"space-between",gap:10,background:receiptTemplate.style==="modern"?receiptTemplate.accentColor+"18":"#f6f8f6",padding:12,borderRadius:6}}>
        <div><small style={{display:"block",color:"#69746e"}}>AMOUNT RECEIVED</small><strong style={{fontSize:18,color:receiptTemplate.accentColor}}>INR 12,500.00</strong></div>
        <div><small style={{display:"block",color:"#69746e"}}>RECEIPT NUMBER</small><strong>RCPT-0001</strong></div>
      </div>
      {receiptTemplate.showAllocations&&<p style={{fontSize:12,marginTop:16}}>Invoice allocation: <strong>INV-0001</strong> — INR 12,500.00</p>}
      {receiptTemplate.footerText&&<p style={{fontSize:11,color:"#69746e",borderTop:"1px solid #e1e6e2",paddingTop:12,marginTop:16}}>{receiptTemplate.footerText}</p>}
    </div>

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
    <button className="brand-button" disabled={busy||uploading}>{busy?"Saving…":"Save business & receipt template"}</button>
  </form>;
}
