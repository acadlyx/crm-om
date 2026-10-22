"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Branding } from "@/lib/branding/defaults";

export function BrandingForm({ initial }: { initial: Branding }) {
  const router = useRouter();
  const [values, setValues] = useState({
    productName: initial.productName, productTagline: initial.productTagline,
    logoUrl: initial.logoUrl || "", faviconUrl: initial.faviconUrl || "",
    primaryColor: initial.primaryColor, supportEmail: initial.supportEmail || "",
    supportWebsite: initial.supportWebsite || "", footerText: initial.footerText,
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "favicon" | null>(null);
  function update(key: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    setMessage(""); setError("");
  }
  async function upload(kind: "logo" | "favicon", file?: File) {
    if (!file) return;
    setUploading(kind); setMessage(""); setError("");
    try {
      const form = new FormData(); form.set("kind", kind); form.set("file", file);
      const response = await fetch("/api/v1/platform-settings/branding/assets", { method: "POST", body: form, cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "Upload failed.");
      update(kind === "logo" ? "logoUrl" : "faviconUrl", payload.data.url);
      setMessage((kind === "logo" ? "Logo" : "Favicon") + " uploaded and saved.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally { setUploading(null); }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/v1/platform-settings/branding", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values), cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "Could not save branding.");
      setMessage("Branding saved. Other application surfaces will use it on the next request.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save branding.");
    } finally { setPending(false); }
  }
  return <form onSubmit={save} style={{display:"grid",gap:14}}>
    <label className="field">Product name<input required maxLength={120} value={values.productName} onChange={e=>update("productName",e.target.value)} /></label>
    <label className="field">Product tagline<input required maxLength={240} value={values.productTagline} onChange={e=>update("productTagline",e.target.value)} /></label>
    <label className="field">Primary color<input type="color" value={values.primaryColor} onChange={e=>update("primaryColor",e.target.value)} /></label>
    <label className="field">Logo image<input type="file" accept="image/png,image/jpeg,image/webp" disabled={!!uploading} onChange={e=>void upload("logo",e.target.files?.[0])} /><input aria-label="Logo URL" type="url" value={values.logoUrl} placeholder="Optional HTTP(S) image URL" onChange={e=>update("logoUrl",e.target.value)} /></label>
    <label className="field">Favicon image<input type="file" accept="image/png,image/webp,image/x-icon,image/vnd.microsoft.icon" disabled={!!uploading} onChange={e=>void upload("favicon",e.target.files?.[0])} /><input aria-label="Favicon URL" type="url" value={values.faviconUrl} placeholder="Optional HTTP(S) icon URL" onChange={e=>update("faviconUrl",e.target.value)} /></label>
    <label className="field">Support email<input type="email" maxLength={320} value={values.supportEmail} onChange={e=>update("supportEmail",e.target.value)} /></label>
    <label className="field">Support website<input type="url" value={values.supportWebsite} onChange={e=>update("supportWebsite",e.target.value)} /></label>
    <label className="field">Footer / product attribution<input required maxLength={500} value={values.footerText} onChange={e=>update("footerText",e.target.value)} /><small className="muted">Use {"{product_name}"} and {"{year}"} for dynamic values.</small></label>
    {error && <p role="alert" style={{color:"#b42318"}}>{error}</p>}
    {message && <p role="status" style={{color:"#067647"}}>{message}</p>}
    <button className="brand-button" disabled={pending || !!uploading}>{pending ? "Saving…" : "Save branding"}</button>
  </form>;
}
