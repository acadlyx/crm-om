"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight, ArrowUpRight, CheckCircle2, CircleAlert, LoaderCircle,
  Plus, Search, X,
} from "lucide-react";

export type CrmField = {
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "number" | "date" | "textarea" | "select";
  required?: boolean;
  placeholder?: string;
  step?: string;
  options?: { label: string; value: string }[];
};

export type CrmColumn = { key: string; label: string };

type CrmRow = Record<string, unknown> & { id: string };

type Workflow = { field: "status" | "stage"; label: string; options: { label: string; value: string }[] };

function humanize(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMoney(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(number);
}

function display(value: unknown, key: string) {
  if (value === null || value === undefined || value === "") return "—";
  if (["amount", "total", "subtotal", "taxAmount", "paidAmount", "balance", "estimatedValue", "value"].includes(key)) return formatMoney(value);
  if (key.toLowerCase().includes("date") || key === "createdAt" || key === "paidAt" || key === "spentAt") {
    const date = new Date(String(value));
    if (Number.isFinite(date.getTime())) {
      if (key === "expectedCloseDate" || key === "dueDate" || key === "issueDate" || key === "spentAt") {
        return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
      }
      return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
    }
  }
  const text = String(value);
  if (/^[A-Z_ ]+$/.test(text) && text.length < 35) return humanize(text);
  return text;
}

export function CrmModule({
  resource, title, description, fields, columns, initialRows, workflow, recordLabel,
}: {
  resource: string;
  title: string;
  description: string;
  fields: CrmField[];
  columns: CrmColumn[];
  initialRows: CrmRow[];
  workflow?: Workflow;
  recordLabel?: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyRow, setBusyRow] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => columns.some((column) => String(row[column.key] ?? "").toLowerCase().includes(needle)));
  }, [columns, query, rows]);

  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch("/api/v1/crm/" + resource, {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Could not save this record.");
      setNotice("Saved successfully.");
      form.reset();
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this record.");
    } finally {
      setBusy(false);
    }
  }

  async function updateWorkflow(row: CrmRow, value: string) {
    if (!workflow || !value) return;
    setBusyRow(row.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/v1/crm/" + resource + "/" + encodeURIComponent(row.id), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ [workflow.field]: value }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Could not update this record.");
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, [workflow.field]: value } : item));
      setNotice("Record updated.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update this record.");
    } finally {
      setBusyRow("");
    }
  }

  return (
    <div className="crm-module-page">
      <header className="crm-module-heading">
        <div><p className="dashboard-eyebrow">BUSINESS WORKSPACE</p><h1>{title}</h1><p className="dashboard-subtitle">{description}</p></div>
        <button type="button" className="brand-button crm-add-button" onClick={() => { setOpen((value) => !value); setError(""); setNotice(""); }}>
          {open ? <X size={17} /> : <Plus size={17} />}{open ? "Close form" : "Add " + (recordLabel || title.replace(/s$/, ""))}
        </button>
      </header>

      {open && (
        <section className="card crm-form-card">
          <div className="dashboard-panel-heading"><div><p className="dashboard-eyebrow">NEW RECORD</p><h2>Create {title.replace(/s$/, "").toLowerCase()}</h2></div></div>
          <form className="crm-create-form" onSubmit={createRecord}>
            <div className="crm-form-grid">
              {fields.map((field) => (
                <label className={"field" + (field.type === "textarea" ? " crm-field-wide" : "")} key={field.name}>
                  <span>{field.label}{field.required ? " *" : ""}</span>
                  {field.type === "textarea" ? (
                    <textarea name={field.name} required={field.required} rows={3} placeholder={field.placeholder || ""} />
                  ) : field.type === "select" ? (
                    <select name={field.name} required={field.required} defaultValue="">
                      <option value="">{field.required ? "Choose an option" : "Not linked / not set"}</option>
                      {(field.options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  ) : (
                    <input
                      name={field.name}
                      type={field.type}
                      required={field.required}
                      placeholder={field.placeholder || ""}
                      step={field.step}
                      min={field.type === "number" ? "0" : undefined}
                    />
                  )}
                </label>
              ))}
            </div>
            {error && <p className="workspace-form-message is-error" role="alert"><CircleAlert size={16} />{error}</p>}
            <div className="crm-form-actions">
              <button className="brand-button" type="submit" disabled={busy}>{busy ? <LoaderCircle size={16} className="workspace-spinner" /> : <CheckCircle2 size={16} />}{busy ? "Saving…" : "Save record"}</button>
              <button className="crm-secondary-button" type="button" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      {notice && <p className="crm-notice" role="status"><CheckCircle2 size={16} />{notice}</p>}
      {!open && error && <p className="workspace-form-message is-error" role="alert"><CircleAlert size={16} />{error}</p>}

      <section className="card crm-table-card">
        <div className="crm-table-toolbar">
          <div><p className="dashboard-eyebrow">YOUR RECORDS</p><h2>{rows.length} {rows.length === 1 ? "record" : "records"}</h2></div>
          <label className="crm-search"><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={"Search " + title.toLowerCase()} aria-label={"Search " + title} /></label>
        </div>
        {filteredRows.length ? (
          <div className="crm-table-wrap"><table className="crm-table">
            <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}{workflow && <th>{workflow.label}</th>}</tr></thead>
            <tbody>{filteredRows.map((row) => (
              <tr key={row.id}>
                {columns.map((column, index) => {
                  const value = row[column.key];
                  const statusish = ["status", "stage", "priority"].includes(column.key);
                  return <td key={column.key}>{index === 0 ? <strong className="crm-primary-cell">{display(value, column.key)}</strong> : statusish ? <span className={"crm-pill crm-pill-" + String(value || "").toLowerCase()}>{display(value, column.key)}</span> : display(value, column.key)}</td>;
                })}
                {workflow && <td><select className="crm-workflow-select" value={String(row[workflow.field] || "")} disabled={busyRow === row.id} onChange={(event) => updateWorkflow(row, event.target.value)} aria-label={workflow.label + " for " + String(row[columns[0]?.key] || "record")}>
                  {workflow.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>{busyRow === row.id && <LoaderCircle size={13} className="workspace-spinner crm-inline-spinner" />}</td>}
              </tr>
            ))}</tbody>
          </table></div>
        ) : (
          <div className="dashboard-empty crm-empty">
            <span className="dashboard-empty-icon"><Search size={20} aria-hidden="true" /></span>
            <strong>{query ? "No matching records" : "Nothing here yet"}</strong>
            <p>{query ? "Try a different search term." : "Create your first record with the Add button. Your saved data will appear here."}</p>
            {!query && <button type="button" className="dashboard-text-link crm-empty-add" onClick={() => setOpen(true)}>Add your first record <ArrowRight size={15} /></button>}
          </div>
        )}
        <p className="crm-table-footnote"><ArrowUpRight size={13} />Records are isolated to your business workspace. No other company&apos;s data is shown.</p>
      </section>
    </div>
  );
}
