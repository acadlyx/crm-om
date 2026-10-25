"use client";

import { useEffect, useId, useState, type MouseEvent } from "react";
import { AlertCircle, Eye, LoaderCircle, X } from "lucide-react";
import type { DetailField, RecordDetail } from "@/lib/record-details/types";

function humanize(value: string): string {
  return value.replace(/[_-]+/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayValue(field: DetailField, currency: string): string {
  const value = field.value;
  if (value === null || value === undefined || value === "") return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (field.format === "money") {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "Not provided";
    try {
      return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
    } catch {
      return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount);
    }
  }
  if (field.format === "quantity" || field.format === "number") {
    const amount = Number(value);
    return Number.isFinite(amount) ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(amount) : "Not provided";
  }
  if (field.format === "date" || field.format === "datetime") {
    const date = new Date(String(value));
    if (Number.isNaN(date.valueOf())) return "Not provided";
    const options: Intl.DateTimeFormatOptions = field.format === "date"
      ? { day: "numeric", month: "short", year: "numeric" }
      : { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" };
    return new Intl.DateTimeFormat("en-IN", options).format(date);
  }
  if (field.format === "status") return humanize(String(value));
  return String(value);
}

export function RecordDetailsAction({ endpoint, recordLabel }: { endpoint: string; recordLabel: string }) {
  const generatedId = useId().replace(/:/g, "");
  const titleId = "record-detail-title-" + generatedId;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<RecordDetail | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    setLoading(true);
    setError("");
    setDetail(null);

    void fetch(endpoint, { cache: "no-store", headers: { accept: "application/json" } })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error?.message || "Could not load this record's details.");
        if (!payload?.data || !Array.isArray(payload.data.sections)) throw new Error("The server returned an unexpected detail response.");
        if (active) setDetail(payload.data as RecordDetail);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load this record's details.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [endpoint, open]);

  function closeFromBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className="crm-secondary-button record-details-trigger"
        aria-label={"View details for " + recordLabel}
        title="View full record details"
        onClick={() => setOpen(true)}
      >
        <Eye size={14} aria-hidden="true" /> View
      </button>
      {open && (
        <div className="record-details-backdrop" onMouseDown={closeFromBackdrop}>
          <section className="record-details-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
            <header className="record-details-header">
              <div className="record-details-heading">
                <p className="dashboard-eyebrow">{detail?.type || "RECORD DETAILS"}</p>
                <h2 id={titleId}>{detail?.title || recordLabel}</h2>
                {detail?.reference && <p className="record-details-reference">{detail.reference}</p>}
              </div>
              <div className="record-details-header-actions">
                {detail?.status && <span className="crm-pill">{humanize(detail.status)}</span>}
                <button type="button" className="crm-secondary-button record-details-close" aria-label="Close record details" onClick={() => setOpen(false)}>
                  <X size={17} aria-hidden="true" /> Close
                </button>
              </div>
            </header>
            {loading && <div className="record-details-state" role="status"><LoaderCircle size={18} className="workspace-spinner" /> Loading saved record details…</div>}
            {error && <div className="record-details-state is-error" role="alert"><AlertCircle size={18} />{error}</div>}
            {detail && !loading && (
              <div className="record-details-content">
                {detail.sections.map((section, index) => (
                  <section className="record-details-section" key={section.title + index} aria-labelledby={titleId + "-section-" + index}>
                    <h3 id={titleId + "-section-" + index}>{section.title}</h3>
                    <dl className="record-details-fields">
                      {section.fields.map((field, fieldIndex) => (
                        <div className="record-details-field" key={field.label + fieldIndex}>
                          <dt>{field.label}</dt>
                          <dd>
                            {field.href && field.value !== null
                              ? <a href={field.href}>{displayValue(field, detail.currency || "INR")}</a>
                              : displayValue(field, detail.currency || "INR")}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
                {!detail.sections.length && <p className="record-details-state">No additional saved details are available for this record.</p>}
              </div>
            )}
            <footer className="record-details-footer">
              <button type="button" className="crm-secondary-button" onClick={() => setOpen(false)}>Close details</button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
