"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, CircleAlert, LoaderCircle } from "lucide-react";

export function WorkspaceForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  function slugify(value: string) {
    return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());

    try {
      const response = await fetch("/api/v1/platform/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Workspace could not be created.");
      setSuccess("Workspace created for " + result.data.owner.email + ". The owner can now sign in using the password you set.");
      form.reset();
      setSlugManuallyEdited(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Workspace could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="workspace-create-form" onSubmit={submit}>
      <div className="workspace-form-title">
        <span className="workspace-form-icon"><Building2 size={20} aria-hidden="true" /></span>
        <div><h2>Create a business workspace</h2><p>Set up a separate workspace and first Business Owner login.</p></div>
      </div>
      <div className="workspace-form-grid">
        <label className="field"><span>Business name *</span><input name="businessName" required minLength={2} maxLength={160} placeholder="e.g. Northstar Studio" onChange={(event) => { if (!slugManuallyEdited) { const field = event.currentTarget.form?.elements.namedItem("slug") as HTMLInputElement | null; if (field) field.value = slugify(event.currentTarget.value); } }} /></label>
        <label className="field"><span>Workspace slug *</span><input name="slug" required minLength={2} maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="northstar-studio" onChange={() => setSlugManuallyEdited(true)} /><small>Unique internal workspace identifier; lowercase letters, numbers and hyphens.</small></label>
        <label className="field"><span>Owner full name *</span><input name="ownerName" required minLength={2} maxLength={160} placeholder="Business owner" /></label>
        <label className="field"><span>Owner email *</span><input name="ownerEmail" type="email" required maxLength={320} placeholder="owner@business.com" /></label>
        <label className="field"><span>Initial owner password *</span><input name="ownerPassword" type="password" required minLength={12} maxLength={200} autoComplete="new-password" placeholder="At least 12 characters" /><small>Share this securely with the owner. It is stored as a password hash.</small></label>
        <label className="field"><span>Business phone</span><input name="contactPhone" type="tel" maxLength={40} placeholder="+91 ..." /></label>
        <label className="field workspace-form-wide"><span>Business address</span><textarea name="address" rows={2} maxLength={1000} placeholder="Optional registered or billing address" /></label>
      </div>
      {error && <p className="workspace-form-message is-error" role="alert"><CircleAlert size={16} />{error}</p>}
      {success && <p className="workspace-form-message is-success" role="status"><CheckCircle2 size={16} />{success}</p>}
      <button className="brand-button workspace-submit" type="submit" disabled={busy}>
        {busy ? <LoaderCircle size={16} className="workspace-spinner" /> : <Building2 size={16} />}
        {busy ? "Creating workspace…" : "Create workspace"}
      </button>
    </form>
  );
}
