"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { buildUpiUri, findStatementColumn, invoiceOutstandingBalance, parseStatementCsv, safeUpiFilename } from "@/lib/operations/upi-utils";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  AlertCircle, ArrowDownToLine, ArrowRight, CheckCircle2, Clipboard, LoaderCircle,
  QrCode, RefreshCw, Search, Upload, X,
} from "lucide-react";

type RecordRow = Record<string, unknown> & { id: string };
type Collection = {
  id: string;
  transactionRef: string;
  upiId: string;
  payerName: string | null;
  amount: number;
  currency: string;
  status: "PENDING" | "PAID" | "EXPIRED" | "FAILED" | string;
  utr: string | null;
  paidAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  notes: string | null;
  invoiceId: string | null;
  paymentId: string | null;
  receiptId: string | null;
  customerId: string | null;
  customer: { id: string; name: string; company: string | null } | null;
  invoice: { id: string; invoiceNumber: string; status: string; customer: { name: string } } | null;
};
type ActiveQr = { id: string; uri: string; image: string; amount: number; reference: string };
type IdempotencyAttempt = { signature: string; key: string };

const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateTime = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date) : "—";
};
export function UpiCollectionsModule({ canDelete = false }: { canDelete?: boolean }) {
  const [rows, setRows] = useState<Collection[]>([]);
  const [customers, setCustomers] = useState<RecordRow[]>([]);
  const [invoices, setInvoices] = useState<RecordRow[]>([]);
  const [businessName, setBusinessName] = useState("Business");
  const [upiId, setUpiId] = useState("");
  const [amount, setAmount] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [payerName, setPayerName] = useState("");
  const [notes, setNotes] = useState("");
  const [query, setQuery] = useState("");
  const [activeQr, setActiveQr] = useState<ActiveQr | null>(null);
  const [utrDrafts, setUtrDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [schemaUnavailable, setSchemaUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyRow, setBusyRow] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const idempotencyAttempt = useRef<IdempotencyAttempt | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setSchemaUnavailable(false);
    try {
      const [historyResponse, customerResponse, invoiceResponse] = await Promise.all([
        fetch("/api/v1/operations/upi-collections", { cache: "no-store" }),
        fetch("/api/v1/crm/customers", { cache: "no-store" }),
        fetch("/api/v1/crm/invoices", { cache: "no-store" }),
      ]);
      const [historyPayload, customerPayload, invoicePayload] = await Promise.all([
        historyResponse.json(), customerResponse.json(), invoiceResponse.json(),
      ]);
      if (!customerResponse.ok) throw new Error(customerPayload?.error?.message || "Customer choices could not be loaded.");
      if (!invoiceResponse.ok) throw new Error(invoicePayload?.error?.message || "Invoice choices could not be loaded.");
      setCustomers((customerPayload.data || []) as RecordRow[]);
      setInvoices((invoicePayload.data || []) as RecordRow[]);
      if (!historyResponse.ok) {
        const message = historyPayload?.error?.message || "UPI history could not be loaded.";
        setSchemaUnavailable(historyResponse.status === 503 && /UPI collection storage is not initialized/i.test(message));
        throw new Error(message);
      }
      setRows((historyPayload.data || []) as Collection[]);
      setBusinessName(String(historyPayload.business?.name || "Business"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "UPI history could not be loaded. Refresh and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  // The loader updates state only after asynchronous network I/O; this effect wires initial loading.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const invoiceOptions = useMemo(() => invoices
    .map((item) => ({ item, balance: invoiceOutstandingBalance(item) }))
    .filter(({ item, balance }) => !["DRAFT", "CANCELLED"].includes(String(item.status || "")) && balance > 0.005), [invoices]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => [
      row.transactionRef, row.upiId, row.utr, row.status, row.customer?.name,
      row.invoice?.invoiceNumber, row.payerName, row.notes, row.amount,
    ].some((value) => String(value ?? "").toLowerCase().includes(needle)));
  }, [query, rows]);

  async function makeQrFromRow(row: Collection) {
    setError("");
    setNotice("");
    try {
      const uri = buildUpiUri({
        upiId: row.upiId, businessName, amount: row.amount, transactionRef: row.transactionRef,
        payerName: row.payerName, invoiceNumber: row.invoice?.invoiceNumber,
      });
      const image = await QRCode.toDataURL(uri, { errorCorrectionLevel: "M", margin: 2, width: 360 });
      setActiveQr({ id: row.id, uri, image, amount: row.amount, reference: row.transactionRef });
    } catch {
      setError("The QR image could not be generated. Try opening the collection again.");
    }
  }

  async function createCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const parsedAmount = Number(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || Math.round(parsedAmount * 100) !== parsedAmount * 100) {
        throw new Error("Enter a positive amount with no more than two decimal places.");
      }
      if (!invoiceId && !customerId) throw new Error("Choose an invoice or a customer so the payment can be reconciled.");
      const signature = JSON.stringify({ upiId: upiId.trim().toLowerCase(), amount: parsedAmount, invoiceId, customerId: invoiceId ? "" : customerId, payerName, notes });
      if (!idempotencyAttempt.current || idempotencyAttempt.current.signature !== signature) {
        const key = window.crypto?.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2));
        idempotencyAttempt.current = { signature, key };
      }
      const key = idempotencyAttempt.current.key;
      const response = await fetch("/api/v1/operations/upi-collections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          upiId: upiId.trim().toLowerCase(),
          amount: parsedAmount,
          invoiceId: invoiceId || null,
          customerId: invoiceId ? null : customerId || null,
          payerName: payerName.trim() || null,
          notes: notes.trim() || null,
          idempotencyKey: key,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "Could not create this UPI QR.");
      const row = payload.data as Collection;
      const uri = buildUpiUri({ upiId: row.upiId, businessName, amount: Number(row.amount), transactionRef: row.transactionRef, payerName: row.payerName, invoiceNumber: invoiceId ? String(invoices.find((item) => item.id === invoiceId)?.invoiceNumber || "") : null });
      const image = await QRCode.toDataURL(uri, { errorCorrectionLevel: "M", margin: 2, width: 360 });
      setRows((current) => [row, ...current.filter((item) => item.id !== row.id)]);
      setActiveQr({ id: row.id, uri, image, amount: Number(row.amount), reference: row.transactionRef });
      setNotice("UPI QR created. The transaction is pending until the bank statement / UTR is reconciled.");
      idempotencyAttempt.current = null;
      setAmount("");
      setNotes("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create this UPI QR.");
    } finally {
      setBusy(false);
    }
  }

  async function reconcile(row: Collection) {
    const utr = (utrDrafts[row.id] || "").trim();
    if (!utr) { setError("Enter the bank UTR / transaction reference to reconcile payment."); return; }
    if (!window.confirm("Confirm that INR " + Number(row.amount).toFixed(2) + " is visible in your bank or UPI statement for this reference? This posts a payment/receipt to financial history.")) return;
    setBusyRow(row.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/v1/operations/upi-collections/" + encodeURIComponent(row.id), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ utr, amount: Number(row.amount), paidAt: new Date().toISOString() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "Payment reconciliation failed.");
      setNotice(payload.message || "Payment reconciled.");
      setUtrDrafts((current) => ({ ...current, [row.id]: "" }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment reconciliation failed.");
    } finally {
      setBusyRow("");
    }
  }

  async function deletePending(row: Collection) {
    if (!canDelete) { setError("Only workspace owners can delete pending UPI collection requests."); return; }
    if (row.status !== "PENDING") { setError("Only pending QR requests can be deleted. Financial history is retained for audit."); return; }
    if (!window.confirm("Delete the pending QR request " + row.transactionRef + "? No payment will be posted.")) return;
    setBusyRow(row.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/v1/operations/upi-collections/" + encodeURIComponent(row.id), { method: "DELETE", cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "Could not delete the pending QR request.");
      setRows((current) => current.filter((item) => item.id !== row.id));
      if (activeQr?.id === row.id) setActiveQr(null);
      setNotice("Pending collection removed. The deletion was recorded in the audit log.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete the pending QR request.");
    } finally {
      setBusyRow("");
    }
  }

  async function copyPaymentLink() {
    if (!activeQr) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable in this browser.");
      await navigator.clipboard.writeText(activeQr.uri);
      setNotice("UPI payment link copied.");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Clipboard access is unavailable in this browser.");
    }
  }

  async function importStatement(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setNotice("");
    try {
      if (file.size > 2_000_000) throw new Error("Statement file must be under 2 MB.");
      const matrix = parseStatementCsv(await file.text());
      if (matrix.length < 2) throw new Error("The CSV must have a header row and at least one transaction row.");
      const headers = matrix[0];
      const refIndex = findStatementColumn(headers, ["transactionref", "transactionreference", "transactionremarks", "merchantreference", "reference", "referenceid", "referenceno", "remarks", "description", "details", "purpose", "comments", "orderid", "tr", "txnid"]);
      const utrIndex = findStatementColumn(headers, ["utr", "utrno", "utrnumber", "bankreference", "bankref", "bankutr", "rrn", "transactionid", "upirefno", "upireference", "txnref", "refno"]);
      const amountIndex = findStatementColumn(headers, ["amount", "credit", "creditedamount", "transactionamount"]);
      const dateIndex = findStatementColumn(headers, ["paidat", "date", "datetime", "transactiondate", "valuedate"]);
      if (refIndex < 0 || utrIndex < 0 || amountIndex < 0) {
        throw new Error("CSV needs transactionRef/reference, UTR/bankRef, and amount columns. Optional date columns are supported.");
      }
      const historyByRef = new Map(rows.map((row) => [row.transactionRef.toLowerCase(), row]));
      let matched = 0, imported = 0, skipped = 0;
      const issues: string[] = [];
      for (let index = 1; index < matrix.length; index++) {
        const fields = matrix[index];
        const reference = (fields[refIndex] || "").trim();
        const utr = (fields[utrIndex] || "").trim();
        const amountText = (fields[amountIndex] || "").trim().replace(/[₹,\s]/g, "");
        const numeric = Number(amountText);
        const row = historyByRef.get(reference.toLowerCase());
        if (!row || row.status !== "PENDING") { skipped++; continue; }
        matched++;
        if (!utr || !Number.isFinite(numeric) || numeric <= 0) { issues.push(reference + ": missing UTR or invalid amount"); continue; }
        const parsedDate = dateIndex >= 0 && fields[dateIndex] ? new Date(fields[dateIndex]) : new Date();
        if (!Number.isFinite(parsedDate.getTime())) { issues.push(reference + ": invalid date"); continue; }
        try {
          const response = await fetch("/api/v1/operations/upi-collections/" + encodeURIComponent(row.id), {
            method: "PATCH", headers: { "content-type": "application/json" }, cache: "no-store",
            body: JSON.stringify({ utr, amount: numeric, paidAt: parsedDate.toISOString() }),
          });
          const payload = await response.json();
          if (!response.ok) issues.push(reference + ": " + (payload?.error?.message || "reconciliation failed"));
          else imported++;
        } catch {
          issues.push(reference + ": request failed; retry this row after refreshing history");
        }
      }
      await load();
      if (matched > imported + issues.length) skipped += matched - imported - issues.length;
      const summary = "Statement processed: " + imported + " reconciled, " + skipped + " unmatched/skipped, " + issues.length + " needing attention.";
      setNotice(issues.length ? summary + " First issue: " + issues[0] : summary);
      if (issues.length) setError("Some statement rows were not reconciled. Review the report and retry only after checking the bank history.");
      else if (!imported) setNotice("No payments matched pending QR references. Confirm the CSV columns and transaction references.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Statement import failed.");
    }
  }

  return (
    <div className="workspace-admin-page">
      <header className="crm-module-heading">
        <div>
          <p className="dashboard-eyebrow">MONEY & ACCOUNTS</p>
          <h1>UPI QR & reconciliation</h1>
          <p className="dashboard-subtitle">Create UPI payment QR codes for your own UPI ID, then reconcile verified payments into invoices or customer receipts.</p>
        </div>
        <button type="button" className="crm-secondary-button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} />Refresh history
        </button>
      </header>

      <section className="card" style={{ padding: 16, marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <AlertCircle size={19} style={{ flexShrink: 0, color: "#8a5b14", marginTop: 2 }} />
          <div>
            <strong>Payment verification safeguard</strong>
            <p className="owner-footnote" style={{ marginTop: 5 }}>A QR code does not notify this CRM when money reaches your bank. Enter the UTR after verifying your bank/UPI history or import a statement CSV. Only a reconciled transaction is posted as a payment or receipt.</p>
          </div>
        </div>
      </section>

      {notice && <p className="crm-notice" role="status"><CheckCircle2 size={16} />{notice}</p>}
      {error && <p className="workspace-form-message is-error" role="alert"><AlertCircle size={16} />{error}</p>}

      <div className="dashboard-content-grid" style={{ alignItems: "start" }}>
        <section className="card" style={{ padding: 18 }}>
          <div className="dashboard-panel-heading"><div><p className="dashboard-eyebrow">COLLECTION REQUEST</p><h2>Generate a payment QR</h2></div><QrCode size={22} /></div>
          <form className="crm-create-form" onSubmit={createCollection}>
            <div className="crm-form-grid">
              <label className="field"><span>Your custom UPI ID *</span><input required maxLength={256} autoComplete="off" value={upiId} onChange={(event) => setUpiId(event.target.value)} placeholder="businessname@bank" pattern="[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}" title="UPI ID format: name@bank" /></label>
              <label className="field"><span>Amount (INR) *</span><input required type="number" min="0.01" step="0.01" max="9999999999" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="1250.00" /></label>
              <label className="field crm-field-wide"><span>Link invoice (optional)</span><select value={invoiceId} onChange={(event) => { setInvoiceId(event.target.value); if (event.target.value) setCustomerId(""); }}><option value="">No invoice — record to customer receipt</option>{invoiceOptions.map(({ item, balance }) => <option key={item.id} value={String(item.id)}>{String(item.invoiceNumber || "Invoice")} · {String((item.customer && typeof item.customer === "object" ? (item.customer as Record<string, unknown>).name : undefined) || item.customerName || "Customer")} · due {INR.format(balance)}</option>)}</select></label>
              {!invoiceId && <label className="field crm-field-wide"><span>Customer *</span><select required value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Choose customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{String(customer.name || "Customer")}{customer.company ? " · " + String(customer.company) : ""}</option>)}</select></label>}
              <label className="field"><span>Payer display name (optional)</span><input maxLength={160} value={payerName} onChange={(event) => setPayerName(event.target.value)} placeholder="Customer name" /></label>
              <label className="field"><span>Notes (optional)</span><input maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Payment purpose" /></label>
            </div>
            <div className="crm-form-actions">
              <button className="brand-button" type="submit" disabled={busy || loading || schemaUnavailable}>{busy ? <LoaderCircle size={16} className="workspace-spinner" /> : <QrCode size={16} />}{busy ? "Creating QR…" : "Generate UPI QR"}</button>
              <span className="muted" style={{ fontSize: 12 }}>QR requests expire after 24 hours.</span>
            </div>
          </form>
        </section>

        <section className="card" style={{ padding: 18 }}>
          <div className="dashboard-panel-heading"><div><p className="dashboard-eyebrow">QR PREVIEW</p><h2>{activeQr ? "Ready to scan" : "No QR selected"}</h2></div></div>
          {activeQr ? <div style={{ display: "grid", gap: 12, justifyItems: "center", textAlign: "center" }}>
            <img src={activeQr.image} alt={"UPI payment QR for " + activeQr.reference} width={270} height={270} style={{ width: "min(270px, 100%)", height: "auto", imageRendering: "pixelated", border: "1px solid #e5e7eb", borderRadius: 12, padding: 8, background: "#fff" }} />
            <strong style={{ fontSize: 22 }}>{INR.format(activeQr.amount)}</strong>
            <span className="muted" style={{ fontSize: 12, overflowWrap: "anywhere" }}>Reference: {activeQr.reference}</span>
            <div className="crm-form-actions" style={{ justifyContent: "center" }}>
              <a className="brand-button" href={activeQr.image} download={"upi-qr-" + safeUpiFilename(activeQr.reference) + ".png"}><ArrowDownToLine size={15} />Download QR</a>
              <a className="crm-secondary-button" href={activeQr.uri}><ArrowRight size={15} />Open UPI app</a>
              <button type="button" className="crm-secondary-button" onClick={() => void copyPaymentLink()}><Clipboard size={14} />Copy link</button>
            </div>
            <p className="owner-footnote">Share this QR with the payer. The request stays pending until you reconcile its UTR.</p>
          </div> : <div className="dashboard-empty"><span className="dashboard-empty-icon"><QrCode size={20} /></span><strong>Your QR will appear here</strong><p>Create a collection with a valid UPI ID and amount, then download or share the QR.</p></div>}
        </section>
      </div>

      <section className="card workspace-list-card operations-list-card" style={{ marginTop: 18 }}>
        <div className="crm-table-toolbar">
          <div><p className="dashboard-eyebrow">TRANSACTION HISTORY</p><h2>{rows.length} collection request{rows.length === 1 ? "" : "s"}</h2><p className="owner-table-caption">Only reconciled rows write to payments or receipts.</p></div>
          <div className="operations-table-actions">
            <label className="crm-search"><Search size={15} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reference, UTR, customer…" aria-label="Search UPI history" /></label>
            <label className="crm-secondary-button" style={{ cursor: "pointer" }}><Upload size={14} />Import statement CSV<input type="file" accept=".csv,text/csv" disabled={schemaUnavailable || loading} onChange={(event) => void importStatement(event)} style={{ display: "none" }} /></label>
          </div>
        </div>
        {loading ? <div className="operations-loading"><LoaderCircle size={19} className="workspace-spinner" />Loading UPI collection history…</div>
          : filtered.length === 0 ? <div className="dashboard-empty"><span className="dashboard-empty-icon"><Search size={18} /></span><strong>{query ? "No matching collections" : "No UPI collections yet"}</strong><p>{query ? "Try a different search term." : "Create a QR above to start a reconcilable payment request."}</p></div>
          : <div className="workspace-table-wrap"><table className="workspace-table operations-table">
            <thead><tr><th>Transaction reference</th><th>UPI ID</th><th>Amount</th><th>Customer</th><th>Invoice</th><th>Created</th><th>Expires</th><th>UTR</th><th>Paid at</th><th>Status</th><th>Linked record</th><th>Actions</th></tr></thead>
            <tbody>{filtered.map((row) => <tr key={row.id}>
              <td><strong>{row.transactionRef}</strong><div className="muted" style={{ fontSize: 11 }}>{row.payerName || row.notes || "—"}</div></td>
              <td>{row.upiId}</td>
              <td>{INR.format(Number(row.amount))}</td>
              <td>{row.customer?.name || row.invoice?.customer?.name || "—"}{row.customer?.company ? <div className="muted" style={{ fontSize: 11 }}>{row.customer.company}</div> : null}</td>
              <td>{row.invoice ? <span>{row.invoice.invoiceNumber}<div className="muted" style={{ fontSize: 11 }}>{row.invoice.status}</div></span> : "—"}</td>
              <td>{dateTime(row.createdAt)}</td>
              <td>{dateTime(row.expiresAt)}</td>
              <td>{row.utr || "—"}</td>
              <td>{dateTime(row.paidAt)}</td>
              <td><span className={"crm-pill " + (row.status === "PAID" ? "crm-pill-active" : ["FAILED", "EXPIRED"].includes(row.status) ? "crm-pill-overdue" : "")}>{row.status}</span></td>
              <td>{row.paymentId ? <Link className="dashboard-text-link" href="/crm/payments">Payment history</Link> : row.receiptId ? <Link className="dashboard-text-link" href="/operations/customer-receipts">Customer receipts</Link> : "—"}</td>
              <td><div className="operations-row-actions">
                {row.status === "PENDING" && <>
                  <button type="button" className="crm-secondary-button" onClick={() => void makeQrFromRow(row)}><QrCode size={13} />View QR</button>
                  <label className="field" style={{ minWidth: 150 }}><span>Bank UTR</span><input value={utrDrafts[row.id] || ""} maxLength={160} placeholder="Enter verified UTR" onChange={(event) => setUtrDrafts((current) => ({ ...current, [row.id]: event.target.value }))} /></label>
                  <button type="button" className="crm-secondary-button" disabled={busyRow === row.id} onClick={() => void reconcile(row)}>{busyRow === row.id ? <LoaderCircle size={13} className="workspace-spinner" /> : <CheckCircle2 size={13} />}Reconcile</button>
                </>}
                {canDelete && row.status === "PENDING" && <button type="button" className="crm-secondary-button is-danger" disabled={busyRow === row.id} onClick={() => void deletePending(row)}><X size={13} />Delete</button>}
                {row.status !== "PENDING" && <span className="muted" style={{ fontSize: 11 }}>Audit retained</span>}
              </div></td>
            </tr>)}</tbody>
          </table></div>}
      </section>
    </div>
  );
}
