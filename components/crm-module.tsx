"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import { RecordDetailDrawer } from "@/components/record-detail-drawer";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, CheckCircle2, CircleAlert, Eye, LoaderCircle,
  Plus, Search, Trash2, X,
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

const CRM_SUMMARY_COLUMN_KEYS: Record<string, string[]> = {
  customers: ["name", "company", "email", "phone", "status"],
  leads: ["fullName", "company", "source", "estimatedValue", "status"],
  deals: ["title", "contact", "company", "value", "expectedCloseDate", "stage"],
  invoices: ["invoiceNumber", "customerName", "issueDate", "dueDate", "total", "paidAmount", "balance", "status"],
  payments: ["invoiceNumber", "customerName", "amount", "method", "reference", "paidAt", "status"],
  expenses: ["title", "category", "vendor", "amount", "spentAt", "status"],
  tasks: ["title", "customerName", "dueDate", "priority", "status"],
};



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
  if (["amount", "total", "subtotal", "taxAmount", "paidAmount", "balance", "estimatedValue", "value", "creditLimit"].includes(key)) return formatMoney(value);
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
  resource, title, description, fields, columns, initialRows, workflow, recordLabel, owner = false, canUpdate = false, canDelete = false,
}: {
  resource: string;
  title: string;
  description: string;
  fields: CrmField[];
  columns: CrmColumn[];
  initialRows: CrmRow[];
  workflow?: Workflow;
  recordLabel?: string;
  owner?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(3);
  const [busy, setBusy] = useState(false);
  const [busyRow, setBusyRow] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [financialIdempotencyKey, setFinancialIdempotencyKey] = useState<{ signature: string; key: string } | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<CrmRow | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const closeDetails = useCallback(() => setDetailId(null), []);
  const tableColumns = useMemo(() => {
    const keys = CRM_SUMMARY_COLUMN_KEYS[resource];
    return keys ? columns.filter((column) => keys.includes(column.key)) : columns;
  }, [columns, resource]);

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
    const payload: Record<string, unknown> = Object.fromEntries(new FormData(form).entries());
    if (resource === "payments" || resource === "invoices") {
      const signature = JSON.stringify(payload);
      const key = financialIdempotencyKey?.signature === signature ? financialIdempotencyKey.key : crypto.randomUUID();
      payload.idempotencyKey = key;
      setFinancialIdempotencyKey({ signature, key });
    }
    try {
      const response = await fetch("/api/v1/crm/" + resource, {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Could not save this record.");
      setNotice(result?.idempotentReplay
        ? (resource === "payments" ? "This payment request was already processed; no duplicate payment was created." : "This invoice request was already processed; no duplicate invoice was created.")
        : "Saved successfully.");
      if (resource === "payments" || resource === "invoices") setFinancialIdempotencyKey(null);
      if (result?.data?.id) setRows((current) => [result.data as CrmRow, ...current.filter((row) => row.id !== result.data.id)]);
      setVisibleCount(3);
      form.reset();
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this record.");
    } finally {
      setBusy(false);
    }
  }

  async function saveCustomerEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingCustomer) return;
    setBusy(true);
    setError("");
    setNotice("");
    const raw = Object.fromEntries(new FormData(event.currentTarget).entries());
    const payload: Record<string, unknown> = {
      ...raw,
      creditLimit: Number(raw.creditLimit || 0),
      paymentTermsDays: Number(raw.paymentTermsDays || 0),
    };
    try {
      const response = await fetch("/api/v1/crm/customers/" + encodeURIComponent(editingCustomer.id), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Could not update customer details.");
      setRows((current) => current.map((row) => row.id === editingCustomer.id ? {
        ...row,
        ...payload,
        email: payload.email || null,
        company: payload.company || null,
        phone: payload.phone || null,
        address: payload.address || "",
        creditLimit: Number(payload.creditLimit || 0),
        paymentTermsDays: Number(payload.paymentTermsDays || 0),
      } : row));
      setNotice("Customer profile updated.");
      setEditingCustomer(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update customer details.");
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
      setNotice(resource === "leads" && value === "CONVERTED" && result?.data?.customerId ? "Lead converted to a customer record." : "Record updated.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update this record.");
    } finally {
      setBusyRow("");
    }
  }

  async function deleteRecord(row: CrmRow) {
    if (!canDelete) { setError("Your workspace role cannot delete records."); return; }
    const label = String(row[columns[0]?.key] || row.id);
    if (!window.confirm("Delete " + label + "? Financial records, linked records and audit history are protected by the server.")) return;
    setBusyRow(row.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/v1/crm/" + resource + "/" + encodeURIComponent(row.id), {
        method: "DELETE",
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Could not delete this record.");
      setRows((current) => current.filter((item) => item.id !== row.id));
      if (editingCustomer?.id === row.id) setEditingCustomer(null);
      setNotice("Record deleted. The action was recorded in the audit log.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete this record.");
    } finally {
      setBusyRow("");
    }
  }

  async function reversePayment(row: CrmRow) {
    if (row.status !== "POSTED") return;
    const reason = window.prompt("Enter the reason for reversing payment " + String(row.reference || row.id) + " (required):");
    if (!reason || reason.trim().length < 3) {
      setError("A reversal reason of at least 3 characters is required.");
      return;
    }
    if (!window.confirm("Reverse this posted payment? The invoice balance will be recalculated and the action will be audited.")) return;
    setBusyRow(row.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/v1/crm/payments/" + encodeURIComponent(row.id), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ status: "REVERSED", reason: reason.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Could not reverse this payment.");
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, status: "REVERSED" } : item));
      setNotice("Payment reversed. The invoice balance and customer ledger were updated.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reverse this payment.");
    } finally {
      setBusyRow("");
    }
  }

  function exportCSV() {
    const csvRows = [
      columns.map((column) => column.label),
      ...filteredRows.map((row) => columns.map((column) => String(row[column.key] ?? ""))),
    ];
    const csv = csvRows.map((line) => line.map((value) => '"' + value.replaceAll('"', '""') + '"').join(",")).join("\r\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = resource + "-" + new Date().toISOString().slice(0, 10) + ".csv";
    anchor.click();
    URL.revokeObjectURL(url);
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

      {editingCustomer && resource === "customers" && canUpdate && (
        <section className="card crm-form-card">
          <div className="dashboard-panel-heading"><div><p className="dashboard-eyebrow">EDIT CUSTOMER</p><h2>{String(editingCustomer.name || "Customer profile")}</h2></div><button type="button" className="crm-secondary-button" onClick={() => setEditingCustomer(null)} disabled={busy}>Close</button></div>
          <form className="crm-create-form" onSubmit={saveCustomerEdit}>
            <div className="crm-form-grid">
              {fields.map((field) => {
                const fieldValue = editingCustomer[field.name];
                const defaultValue = field.name === "address" ? String(fieldValue ?? "")
                  : field.name === "creditLimit" || field.name === "paymentTermsDays" ? String(fieldValue ?? 0)
                  : String(fieldValue ?? "");
                return <label className={"field" + (field.type === "textarea" ? " crm-field-wide" : "")} key={field.name}>
                  <span>{field.label}{field.required ? " *" : ""}</span>
                  {field.type === "textarea"
                    ? <textarea name={field.name} required={field.required} rows={3} defaultValue={defaultValue} placeholder={field.placeholder || ""} />
                    : field.type === "select"
                    ? <select name={field.name} required={field.required} defaultValue={defaultValue}>
                        <option value="">{field.required ? "Choose an option" : "Not linked / not set"}</option>
                        {(field.options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    : <input name={field.name} type={field.type} required={field.required} defaultValue={defaultValue}
                        placeholder={field.placeholder || ""} step={field.step} min={field.type === "number" ? "0" : undefined} />}
                </label>;
              })}
            </div>
            {error && <p className="workspace-form-message is-error" role="alert"><CircleAlert size={16} />{error}</p>}
            <div className="crm-form-actions">
              <button className="brand-button" type="submit" disabled={busy}>{busy ? <LoaderCircle size={16} className="workspace-spinner" /> : <CheckCircle2 size={16} />}{busy ? "Saving…" : "Save customer changes"}</button>
              <button className="crm-secondary-button" type="button" onClick={() => setEditingCustomer(null)} disabled={busy}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      {notice && <p className="crm-notice" role="status"><CheckCircle2 size={16} />{notice}</p>}
      {!open && error && <p className="workspace-form-message is-error" role="alert"><CircleAlert size={16} />{error}</p>}

      <section className="card crm-table-card">
        <div className="crm-table-toolbar">
          <div><p className="dashboard-eyebrow">YOUR RECORDS</p><h2>{rows.length} {rows.length === 1 ? "record" : "records"}</h2></div>
          <div className="crm-table-toolbar-actions">
            <label className="crm-search"><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(3); }} placeholder={"Search " + title.toLowerCase()} aria-label={"Search " + title} /></label>
            <button type="button" className="crm-secondary-button" onClick={exportCSV} disabled={!filteredRows.length}><ArrowDownToLine size={15} />Export CSV</button>
          </div>
        </div>
        {filteredRows.length ? (
          <div className="crm-table-wrap"><table className="crm-table">
            <thead><tr>{tableColumns.map((column) => <th key={column.key}>{column.label}</th>)}{workflow && canUpdate && <th>{workflow.label}</th>}<th>Actions</th></tr></thead>
            <tbody>{filteredRows.slice(0, visibleCount).map((row) => (
              <tr key={row.id}>
                {tableColumns.map((column, index) => {
                  const value = row[column.key];
                  const statusish = ["status", "stage", "priority"].includes(column.key);
                  return <td key={column.key} data-column={column.key}>{index === 0 ? <strong className="crm-primary-cell">{display(value, column.key)}</strong> : statusish ? <span className={"crm-pill crm-pill-" + String(value || "").toLowerCase()}>{display(value, column.key)}</span> : display(value, column.key)}</td>;
                })}
                {workflow && canUpdate && <td><select className="crm-workflow-select" value={String(row[workflow.field] || "")} disabled={busyRow === row.id} onChange={(event) => updateWorkflow(row, event.target.value)} aria-label={workflow.label + " for " + String(row[columns[0]?.key] || "record")}>
                  {workflow.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>{busyRow === row.id && <LoaderCircle size={13} className="workspace-spinner crm-inline-spinner" />}</td>}
                <td><div className="operations-row-actions">
                  {resource !== "invoices" && <button type="button" className="crm-secondary-button" aria-label={"View details for " + String(row[tableColumns[0]?.key] || recordLabel || "record")} onClick={() => setDetailId(row.id)}><Eye size={14} aria-hidden="true" />View</button>}
                  
                  {resource === "invoices" && <><a className="crm-secondary-button" href={"/operations/invoices/" + encodeURIComponent(row.id)}><Eye size={14} />View invoice</a><a className="crm-secondary-button" href={"/api/v1/operations/invoices/" + encodeURIComponent(row.id) + "/pdf"} download><ArrowDownToLine size={14} />Download PDF</a></>}
                  {resource === "customers" && canUpdate && <button type="button" className="crm-secondary-button" onClick={() => { setError(""); setNotice(""); setEditingCustomer(row); }}>Edit profile</button>}
                  {resource === "payments" && owner && (row.status === "POSTED"
                    ? <button type="button" className="crm-secondary-button is-danger" disabled={busyRow === row.id} onClick={() => void reversePayment(row)}>{busyRow === row.id ? <LoaderCircle size={13} className="workspace-spinner" /> : "Reverse payment"}</button>
                    : <span className="crm-pill crm-pill-overdue">Reversed</span>)}
                  {canDelete && <button type="button" className="crm-secondary-button is-danger" disabled={busyRow === row.id} onClick={() => void deleteRecord(row)}>{busyRow === row.id ? <LoaderCircle size={13} className="workspace-spinner" /> : <Trash2 size={14} />}Delete</button>}
                </div></td>
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
        {filteredRows.length > 3 && <div className="operations-table-footer">
          <span>Showing {Math.min(visibleCount, filteredRows.length)} of {filteredRows.length} matching records</span>
          {visibleCount < filteredRows.length && <button type="button" className="crm-secondary-button" onClick={() => setVisibleCount((count) => Math.min(filteredRows.length, count + 20))}>Show more ({filteredRows.length - visibleCount} remaining) <ArrowRight size={14} /></button>}
          {visibleCount > 3 && <button type="button" className="crm-secondary-button" onClick={() => setVisibleCount(3)}>Show fewer</button>}
        </div>}
        <p className="crm-table-footnote"><ArrowUpRight size={13} />Records are isolated to your business workspace. No other company&apos;s data is shown.</p>
      </section>
      {detailId && <RecordDetailDrawer source="crm" resource={resource} id={detailId} onClose={closeDetails} />}
    </div>
  );
}
