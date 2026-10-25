"use client";

import { useState, type DragEvent } from "react";
import {
  Check, ChevronDown, ChevronUp, FileText, GripVertical, LoaderCircle,
  RotateCcw, Save, Upload, WandSparkles,
} from "lucide-react";
import {
  DOCUMENT_BLOCKS, DOCUMENT_KINDS, defaultDocumentTemplate,
  type DocumentBlockKey, type DocumentKind, type DocumentTemplate, type DocumentTemplates,
} from "@/lib/documents/templates";
import "./document-templates-builder.css";

const DOCUMENT_LABELS: Record<DocumentKind, string> = {
  invoice: "Customer invoice",
  customerReceipt: "Customer receipt",
  supplierBill: "Supplier bill",
  supplierPayment: "Supplier payment",
};
const DOCUMENT_HINTS: Record<DocumentKind, string> = {
  invoice: "Sales documents sent to your customers",
  customerReceipt: "Payment acknowledgements and allocation details",
  supplierBill: "Supplier invoices and payable summaries",
  supplierPayment: "Payment vouchers for your accounts",
};

function money(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(value);
}
function date(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export function DocumentTemplatesBuilder({
  initialTemplates,
  businessName,
  businessAddress,
  businessEmail,
  businessPhone,
  initialLogoUrl,
}: {
  initialTemplates: DocumentTemplates;
  businessName: string;
  businessAddress: string | null;
  businessEmail: string | null;
  businessPhone: string | null;
  initialLogoUrl: string | null;
}) {
  const [selected, setSelected] = useState<DocumentKind>("invoice");
  const [templates, setTemplates] = useState<DocumentTemplates>(initialTemplates);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [dragging, setDragging] = useState<DocumentBlockKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const template = templates[selected];

  function update(patch: Partial<DocumentTemplate>) {
    setTemplates((current) => ({ ...current, [selected]: { ...current[selected], ...patch } }));
    setMessage("");
    setError("");
  }
  function updateBlockOrder(from: DocumentBlockKey, to: DocumentBlockKey) {
    if (from === to) return;
    const order = [...template.blockOrder];
    const fromIndex = order.indexOf(from);
    const toIndex = order.indexOf(to);
    if (fromIndex < 0 || toIndex < 0) return;
    order.splice(fromIndex, 1);
    order.splice(toIndex, 0, from);
    update({ blockOrder: order });
  }
  function handleDrop(event: DragEvent<HTMLDivElement>, target: DocumentBlockKey) {
    event.preventDefault();
    if (dragging) updateBlockOrder(dragging, target);
    setDragging(null);
  }
  function toggleBlock(key: DocumentBlockKey, checked: boolean) {
    const hidden = new Set(template.hiddenBlocks);
    if (checked) hidden.delete(key);
    else hidden.add(key);
    update({ hiddenBlocks: [...hidden] });
  }
  async function save() {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/v1/tenant-settings/document-templates", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        cache: "no-store", body: JSON.stringify({ templates }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "Document templates could not be saved.");
      setTemplates(payload.data.templates as DocumentTemplates);
      setLogoUrl(payload.data.logoUrl ?? logoUrl);
      setMessage("All document templates saved. New PDF downloads will use these settings.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Document templates could not be saved.");
    } finally {
      setSaving(false);
    }
  }
  async function uploadLogo(file?: File) {
    if (!file) return;
    setUploading(true); setError(""); setMessage("");
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/v1/tenant-settings/logo", { method: "POST", body, cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "Logo upload failed.");
      setLogoUrl(payload.data.logoUrl ?? null);
      setMessage("Business logo uploaded. Save your template settings when ready.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Logo upload failed.");
    } finally {
      setUploading(false);
    }
  }
  function resetTemplate() {
    update(defaultDocumentTemplate(selected));
  }

  const visibleBlocks = template.blockOrder.filter((key) => !template.hiddenBlocks.includes(key));
  const paperStyle = { borderColor: template.accentColor } as const;
  const headingStyle = { color: template.accentColor } as const;

  return (
    <div className="document-template-workspace">
      <header className="document-template-page-header">
        <div>
          <p className="dashboard-eyebrow">DOCUMENT STUDIO</p>
          <h1>Document templates</h1>
          <p>Design the PDFs your customers and suppliers receive. Each document type has its own saved layout.</p>
        </div>
        <div className="document-template-header-actions">
          <button type="button" className="crm-secondary-button" onClick={resetTemplate}><RotateCcw size={15} />Reset this design</button>
          <button type="button" className="brand-button" onClick={() => void save()} disabled={saving || uploading}>
            {saving ? <LoaderCircle className="workspace-spinner" size={16} /> : <Save size={16} />}
            {saving ? "Saving…" : "Save all templates"}
          </button>
        </div>
      </header>

      <nav className="document-type-switcher" aria-label="Document type">
        {DOCUMENT_KINDS.map((kind) => (
          <button key={kind} type="button" className={selected === kind ? "is-selected" : ""} onClick={() => setSelected(kind)} aria-pressed={selected === kind}>
            <span className="document-type-icon"><FileText size={17} /></span>
            <span><strong>{DOCUMENT_LABELS[kind]}</strong><small>{DOCUMENT_HINTS[kind]}</small></span>
            {selected === kind && <Check className="document-type-check" size={17} />}
          </button>
        ))}
      </nav>

      <div className="document-template-layout">
        <aside className="document-template-controls">
          <section className="document-editor-card">
            <div className="document-editor-heading"><span className="document-editor-icon"><WandSparkles size={17} /></span><div><h2>Brand & style</h2><p>Make the document unmistakably yours.</p></div></div>
            <div className="document-editor-fields">
              <label className="document-field document-field-full">Document title<input maxLength={80} value={template.title} onChange={(e) => update({ title: e.target.value })} /></label>
              <label className="document-field">Brand colour<span className="document-color-input"><input aria-label="Brand colour" type="color" value={template.accentColor} onChange={(e) => update({ accentColor: e.target.value })} /><code>{template.accentColor}</code></span></label>
              <label className="document-field">Header composition<select value={template.headerStyle} onChange={(e) => update({ headerStyle: e.target.value as DocumentTemplate["headerStyle"] })}><option value="band">Tinted band</option><option value="rule">Signature rule</option><option value="plain">Clean / minimal</option></select></label>
              <label className="document-field">Paper size<select value={template.paperSize} onChange={(e) => update({ paperSize: e.target.value as DocumentTemplate["paperSize"] })}><option value="A4">A4</option><option value="LETTER">US Letter</option></select></label>
              <label className="document-field">Orientation<select value={template.orientation} onChange={(e) => update({ orientation: e.target.value as DocumentTemplate["orientation"] })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
              <label className="document-field">Body text size <strong>{template.fontSize} pt</strong><input type="range" min="7" max="13" value={template.fontSize} onChange={(e) => update({ fontSize: Number(e.target.value) })} /></label>
              <label className="document-field">Heading size <strong>{template.titleSize} pt</strong><input type="range" min="16" max="34" value={template.titleSize} onChange={(e) => update({ titleSize: Number(e.target.value) })} /></label>
            </div>
          </section>

          <section className="document-editor-card">
            <div className="document-editor-heading"><span className="document-editor-icon"><Upload size={17} /></span><div><h2>Business logo</h2><p>Use your own mark on every document type.</p></div></div>
            <div className="document-logo-manager">
              <div className="document-logo-preview">
                {logoUrl ? <img src={logoUrl} alt="Current business logo" /> : <span>{businessName.trim().slice(0, 1).toUpperCase() || "B"}</span>}
              </div>
              <div className="document-logo-copy"><strong>{logoUrl ? "Custom logo connected" : "No custom logo yet"}</strong><small>PNG, JPEG or WebP · up to 3 MB</small><label className="crm-secondary-button document-upload-button">{uploading ? "Uploading…" : "Upload / replace"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(e) => { void uploadLogo(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} /></label></div>
            </div>
            <div className="document-editor-fields">
              <label className="document-field">Logo alignment<select value={template.logoPosition} onChange={(e) => update({ logoPosition: e.target.value as DocumentTemplate["logoPosition"] })}><option value="left">Left aligned</option><option value="center">Centered</option><option value="right">Right aligned</option></select></label>
              <label className="document-field">Logo size <strong>{template.logoSize} pt</strong><input type="range" min="28" max="104" value={template.logoSize} onChange={(e) => update({ logoSize: Number(e.target.value) })} /></label>
              <label className="document-check-line"><input type="checkbox" checked={template.showLogo} onChange={(e) => update({ showLogo: e.target.checked })} />Show logo on PDF</label>
              <label className="document-check-line"><input type="checkbox" checked={template.showStatus} onChange={(e) => update({ showStatus: e.target.checked })} />Show document status</label>
            </div>
          </section>

          <section className="document-editor-card">
            <div className="document-editor-heading"><span className="document-editor-icon"><GripVertical size={17} /></span><div><h2>Layout & sections</h2><p>Drag sections to reorder the PDF. Toggle off anything you do not want printed.</p></div></div>
            <div className="document-block-list" aria-label="Document section order">
              {template.blockOrder.map((key) => {
                const block = DOCUMENT_BLOCKS.find((candidate) => candidate.key === key)!;
                const isVisible = !template.hiddenBlocks.includes(key);
                return (
                  <div key={key} className={"document-block-row" + (dragging === key ? " is-dragging" : "") + (!isVisible ? " is-hidden" : "")}
                    draggable onDragStart={() => setDragging(key)} onDragEnd={() => setDragging(null)}
                    onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, key)}>
                    <GripVertical size={17} className="document-drag-grip" aria-hidden="true" />
                    <div className="document-block-name"><strong>{block.label}</strong><small>{block.description}</small></div>
                    <div className="document-block-controls">
                      <button type="button" disabled={template.blockOrder.indexOf(key) === 0} aria-label={"Move " + block.label + " up"} onClick={() => updateBlockOrder(key, template.blockOrder[Math.max(0, template.blockOrder.indexOf(key) - 1)])}><ChevronUp size={14} /></button>
                      <button type="button" disabled={template.blockOrder.indexOf(key) === template.blockOrder.length - 1} aria-label={"Move " + block.label + " down"} onClick={() => updateBlockOrder(key, template.blockOrder[Math.min(template.blockOrder.length - 1, template.blockOrder.indexOf(key) + 1)])}><ChevronDown size={14} /></button>
                    </div>
                    <label className="document-block-toggle"><input type="checkbox" checked={isVisible} onChange={(e) => toggleBlock(key, e.target.checked)} aria-label={"Show " + block.label} /><span /></label>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="document-editor-card">
            <div className="document-editor-heading"><span className="document-editor-icon"><FileText size={17} /></span><div><h2>Words & sign-off</h2><p>Finish with your own language and terms.</p></div></div>
            <div className="document-editor-fields">
              <label className="document-field document-field-full">Footer text<textarea rows={3} maxLength={500} value={template.footerText} onChange={(e) => update({ footerText: e.target.value })} placeholder="Thank you for your business." /></label>
              <label className="document-field document-field-full">Signature label<input maxLength={100} value={template.signatureLabel} onChange={(e) => update({ signatureLabel: e.target.value })} /></label>
              <label className="document-field document-field-full">Custom section heading<input maxLength={80} value={template.customHeading} onChange={(e) => update({ customHeading: e.target.value })} /></label>
              <label className="document-field document-field-full">Custom section message<textarea rows={4} maxLength={1200} value={template.customText} onChange={(e) => update({ customText: e.target.value })} placeholder="Add payment terms, bank details, warranty wording or any custom message." /></label>
            </div>
          </section>
          {error && <p className="document-builder-message is-error" role="alert">{error}</p>}
          {message && <p className="document-builder-message" role="status"><Check size={16} />{message}</p>}
          <button type="button" className="brand-button document-save-bottom" onClick={() => void save()} disabled={saving || uploading}>{saving ? "Saving…" : "Save all templates"}</button>
        </aside>

        <section className="document-preview-panel">
          <div className="document-preview-toolbar"><div><p className="dashboard-eyebrow">LIVE PREVIEW</p><h2>{DOCUMENT_LABELS[selected]}</h2></div><span className="document-preview-status"><span />Sample data</span></div>
          <p className="document-preview-note">This preview updates as you edit. Actual PDFs use the saved template with the selected record's real data.</p>
          <div className="document-preview-stage">
            <article className={"document-preview-paper " + template.orientation} style={paperStyle}>
              {visibleBlocks.map((block) => (
                <PreviewBlock key={block} block={block} kind={selected} template={template} logoUrl={logoUrl}
                  businessName={businessName} businessAddress={businessAddress} businessEmail={businessEmail} businessPhone={businessPhone}
                  headingStyle={headingStyle} />
              ))}
            </article>
          </div>
          <div className="document-preview-legend"><span><i style={{ background: template.accentColor }} />Brand colour</span><span><i className="document-legend-border" />Page edge</span><span>{template.paperSize} · {template.orientation}</span></div>
        </section>
      </div>
    </div>
  );
}

function PreviewBlock({
  block, kind, template, logoUrl, businessName, businessAddress, businessEmail, businessPhone, headingStyle,
}: {
  block: DocumentBlockKey; kind: DocumentKind; template: DocumentTemplate; logoUrl: string | null;
  businessName: string; businessAddress: string | null; businessEmail: string | null; businessPhone: string | null;
  headingStyle: { color: string };
}) {
  if (block === "business") return <header className={"document-preview-brand header-" + template.headerStyle}>
    <div className={"document-preview-brandline logo-" + template.logoPosition}>
      {template.showLogo && <div className="document-preview-logo" style={{ width: Math.min(template.logoSize, 80), height: Math.min(template.logoSize, 80) }}>{logoUrl ? <img src={logoUrl} alt="Business logo" /> : <span>{businessName.trim().slice(0, 1).toUpperCase() || "B"}</span>}</div>}
      <div className="document-preview-business"><strong>{businessName || "Your business name"}</strong><small>{businessAddress || "Business address"}</small><small>{[businessEmail, businessPhone].filter(Boolean).join(" · ") || "email@example.com · +91 …"}</small></div>
    </div>
  </header>;
  if (block === "title") return <section className="document-preview-title"><div><h3 style={{ ...headingStyle, fontSize: Math.min(template.titleSize, 26) }}>{template.title}</h3><strong>{kind === "invoice" ? "INV-2026-0042" : kind === "customerReceipt" ? "RCP-2026-0018" : kind === "supplierBill" ? "BILL-2026-0082" : "PAY-2026-0112"}</strong></div>{template.showStatus && <span className="document-preview-pill" style={{ color: template.accentColor, background: template.accentColor + "18" }}>{kind === "invoice" ? "PARTIALLY PAID" : "POSTED"}</span>}</section>;
  if (block === "party") return <section className="document-preview-section"><label>{kind === "invoice" ? "BILL TO" : kind === "customerReceipt" ? "RECEIVED FROM" : "SUPPLIER"}</label><strong>{kind === "invoice" || kind === "customerReceipt" ? "Northstar Studio" : "Meridian Supplies Ltd."}</strong><small>{kind === "invoice" || kind === "customerReceipt" ? "accounts@northstar.example · +91 98765 43210" : "accounts@meridian.example · +91 91234 56780"}</small><small>14 Market Road, New Delhi, India</small></section>;
  if (block === "metadata") return <section className="document-preview-metadata"><div><label>ISSUE DATE</label><strong>{date("2026-10-24")}</strong></div><div><label>DUE DATE</label><strong>{date("2026-11-08")}</strong></div><div><label>REFERENCE</label><strong>{kind === "invoice" ? "SO-2026-009" : kind === "customerReceipt" ? "UPI / UTR 984512" : "PO-2026-0037"}</strong></div></section>;
  if (block === "items") return <section className="document-preview-section document-preview-table-section"><label>{kind === "customerReceipt" ? "INVOICE ALLOCATIONS" : kind === "supplierPayment" ? "BILL ALLOCATIONS" : "ITEM DETAILS"}</label><table><thead><tr><th>Description</th><th>Qty</th><th>Amount</th></tr></thead><tbody><tr><td>{kind === "customerReceipt" ? "INV-2026-0038" : kind === "supplierPayment" ? "BILL-2026-0061" : "Design and consulting services"}</td><td>{kind === "customerReceipt" || kind === "supplierPayment" ? "—" : "2"}</td><td>{money(kind === "customerReceipt" || kind === "supplierPayment" ? 12500 : 18000)}</td></tr><tr><td>{kind === "customerReceipt" ? "INV-2026-0040" : kind === "supplierPayment" ? "BILL-2026-0074" : "Production support"}</td><td>{kind === "customerReceipt" || kind === "supplierPayment" ? "—" : "1"}</td><td>{money(kind === "customerReceipt" || kind === "supplierPayment" ? 7500 : 7500)}</td></tr></tbody></table></section>;
  if (block === "totals") return <section className="document-preview-totals"><div><span>{kind === "customerReceipt" || kind === "supplierPayment" ? "Amount received" : "Subtotal"}</span><strong>{money(25500)}</strong></div>{kind === "invoice" && <><div><span>Tax</span><strong>{money(4590)}</strong></div><div><span>Payments received</span><strong>{money(12500)}</strong></div><div className="is-total" style={{ borderColor: template.accentColor, color: template.accentColor }}><span>Balance due</span><strong>{money(17590)}</strong></div></>}</section>;
  if (block === "history") return <section className="document-preview-section"><label>PAYMENT HISTORY</label><div className="document-preview-history"><span>Payment received · 24 Oct 2026</span><strong>{money(12500)}</strong></div><div className="document-preview-history"><span>UPI allocation · 24 Oct 2026</span><strong>{money(7500)}</strong></div></section>;
  if (block === "notes") return <section className="document-preview-section document-preview-note-block"><label>NOTES</label><p>Thank you for your continued partnership. Please contact our accounts team if you have any questions about this document.</p></section>;
  if (block === "custom" && template.customText) return <section className="document-preview-section document-preview-note-block"><label>{template.customHeading || "Additional information"}</label><p>{template.customText}</p></section>;
  if (block === "signature") return <section className="document-preview-signature"><div /><small>{template.signatureLabel || "Authorised signature"}</small></section>;
  if (block === "footer" && template.footerText) return <footer className="document-preview-footer">{template.footerText}</footer>;
  return null;
}
