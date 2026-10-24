"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, Plus, RefreshCw, Search, ShieldCheck, UserCheck, UserMinus, Users, X } from "lucide-react";
import { PasswordInput } from "@/components/password-input";

type TeamRole = "STAFF" | "SALES" | "DELIVERY" | "COLLECTIONS" | "INVENTORY_MANAGER" | "ACCOUNTANT";
type TeamMember = { id: string; name: string; email: string; role: TeamRole; isActive: boolean; createdAt: string };
const roles: Array<{ value: TeamRole; label: string; description: string }> = [
  { value: "SALES", label: "Sales", description: "Customers, leads, sales orders and follow-ups." },
  { value: "DELIVERY", label: "Delivery", description: "Assigned deliveries, dispatch and fulfilment updates." },
  { value: "COLLECTIONS", label: "Collections", description: "Customer follow-ups and authorized receipts." },
  { value: "INVENTORY_MANAGER", label: "Inventory manager", description: "Products, stock movements, purchase orders and receipts." },
  { value: "ACCOUNTANT", label: "Accountant", description: "Invoices, payments, bills, ledgers and reports." },
  { value: "STAFF", label: "Staff", description: "Read access to selected customer records and basic tasks." },
];
function niceDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
}
function roleLabel(role: string) { return roles.find((item) => item.value === role)?.label || role.replaceAll("_", " "); }

export function TeamModule() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<TeamRole>("SALES");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/operations/team?includeInactive=true", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Could not load team members.");
      setMembers(result.data || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load team members.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return members.filter((member) => !needle || [member.name, member.email, member.role].some((value) => value.toLowerCase().includes(needle)));
  }, [members, query]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/v1/operations/team", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Could not create this team member.");
      setName(""); setEmail(""); setPassword(""); setRole("SALES"); setOpen(false);
      setNotice("Team member created. Share the initial credentials securely.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create this team member.");
    } finally {
      setBusy(false);
    }
  }

  async function update(member: TeamMember, patch: { isActive?: boolean; role?: TeamRole }) {
    const action = patch.isActive === undefined ? "change this team member's role" : patch.isActive ? "reactivate this account" : "deactivate this account";
    if (!window.confirm("Confirm you want to " + action + " for " + member.name + "? Changes are recorded in the audit log.")) return;
    setError(""); setNotice("");
    try {
      const response = await fetch("/api/v1/operations/team/" + encodeURIComponent(member.id), {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Could not update team access.");
      setNotice("Team access updated.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update team access.");
    }
  }

  return (
    <div className="workspace-admin-page team-admin-page">
      <header className="crm-module-heading">
        <div><p className="dashboard-eyebrow">OWNER CONTROLS</p><h1>Team & permissions</h1><p className="dashboard-subtitle">Create staff accounts, assign least-privilege roles, and deactivate access when required.</p></div>
        <div className="operations-heading-actions">
          <button type="button" className="crm-secondary-button" onClick={() => { setLoading(true); setError(""); void load(); }} disabled={loading}><RefreshCw size={15} />Refresh</button>
          <button type="button" className="brand-button crm-add-button" onClick={() => { setOpen(!open); setError(""); setNotice(""); }}><Plus size={16} />{open ? "Close form" : "Add team member"}</button>
        </div>
      </header>

      {notice && <p className="crm-notice" role="status"><CheckCircle2 size={16} />{notice}</p>}
      {error && <p className="workspace-form-message is-error" role="alert"><CircleAlert size={16} />{error}</p>}

      <section className="owner-kpis team-summary">
        <article className="owner-kpi card"><span className="owner-kpi-icon tone-blue"><Users size={18}/></span><span className="owner-kpi-label">Total team members</span><strong className="owner-kpi-value">{members.length}</strong><span className="owner-kpi-note">Accounts in this workspace</span></article>
        <article className="owner-kpi card"><span className="owner-kpi-icon tone-green"><UserCheck size={18}/></span><span className="owner-kpi-label">Active accounts</span><strong className="owner-kpi-value">{members.filter((member) => member.isActive).length}</strong><span className="owner-kpi-note">Can authenticate and use assigned modules</span></article>
        <article className="owner-kpi card"><span className="owner-kpi-icon tone-amber"><UserMinus size={18}/></span><span className="owner-kpi-label">Deactivated accounts</span><strong className="owner-kpi-value">{members.filter((member) => !member.isActive).length}</strong><span className="owner-kpi-note">Sign-in is blocked for inactive accounts</span></article>
        <article className="owner-kpi card"><span className="owner-kpi-icon tone-violet"><ShieldCheck size={18}/></span><span className="owner-kpi-label">Staff roles</span><strong className="owner-kpi-value">{new Set(members.map((member) => member.role)).size}</strong><span className="owner-kpi-note">Role and module restrictions enforced server-side</span></article>
      </section>

      {open && <section className="card operations-form-card">
        <div className="owner-panel-heading"><div><p className="dashboard-eyebrow">NEW STAFF ACCOUNT</p><h2>Create a team member</h2></div><button type="button" className="crm-secondary-button" onClick={() => setOpen(false)}><X size={15}/>Close</button></div>
        <form onSubmit={create} className="operations-create-form">
          <div className="operations-form-grid">
            <label className="field"><span>Full name *</span><input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={160} autoComplete="name" placeholder="Team member name"/></label>
            <label className="field"><span>Email address *</span><input value={email} onChange={(event) => setEmail(event.target.value)} required type="email" maxLength={320} autoComplete="username" placeholder="name@company.com"/></label>
            <label className="field"><span>Initial password *</span><PasswordInput value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} maxLength={200} autoComplete="new-password" placeholder="At least 12 characters"/></label>
            <label className="field"><span>Role *</span><select value={role} onChange={(event) => setRole(event.target.value as TeamRole)} required>{roles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><small>{roles.find((item) => item.value === role)?.description}</small></label>
          </div>
          <p className="owner-footnote">Credentials are stored as a password hash. Initial passwords must be shared securely. This workflow does not claim to send an invitation email unless an email provider is configured.</p>
          <div className="crm-form-actions"><button type="submit" className="brand-button" disabled={busy}>{busy ? <LoaderCircle size={16} className="workspace-spinner"/> : <Plus size={16}/>} {busy ? "Creating account…" : "Create account"}</button><button type="button" className="crm-secondary-button" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      </section>}

      <section className="card workspace-list-card operations-list-card">
        <div className="crm-table-toolbar"><div><h2>Workspace team</h2><p className="owner-table-caption">Role and access changes are auditable. Owners cannot grant a staff account owner privileges.</p></div><label className="crm-search"><Search size={15}/><input value={query} onChange={(event) => { setQuery(event.target.value); setShowAll(false); }} placeholder="Search name, email or role" aria-label="Search team members"/></label></div>
        {loading ? <div className="operations-loading"><LoaderCircle size={20} className="workspace-spinner"/>Loading team accounts…</div>
          : filtered.length === 0 ? <div className="dashboard-empty"><span className="dashboard-empty-icon"><Users size={18}/></span><strong>{query ? "No team members match that search" : "No team accounts yet"}</strong><p>Create a staff account to start assigning least-privilege access.</p></div>
          : <>
            <div className="workspace-table-wrap"><table className="workspace-table operations-table team-table">
              <thead><tr><th>Team member</th><th>Role</th><th>Access</th><th>Created</th><th>Change role</th><th>Actions</th></tr></thead>
              <tbody>{filtered.slice(0, showAll ? undefined : 3).map((member) => <tr key={member.id}>
                <td><strong>{member.name}</strong><span className="workspace-slug">{member.email}</span></td>
                <td><span className="crm-pill">{roleLabel(member.role)}</span></td>
                <td><span className={"crm-pill " + (member.isActive ? "crm-pill-active" : "crm-pill-overdue")}>{member.isActive ? "Active" : "Inactive"}</span></td>
                <td>{niceDate(member.createdAt)}</td>
                <td><select aria-label={"Role for " + member.name} className="workflow-select operations-status-filter" value={member.role} disabled={!member.isActive} onChange={(event) => void update(member, { role: event.target.value as TeamRole })}>{roles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></td>
                <td><button type="button" className={"crm-secondary-button " + (member.isActive ? "is-danger" : "")} onClick={() => void update(member, { isActive: !member.isActive })}>{member.isActive ? "Deactivate" : "Reactivate"}</button></td>
              </tr>)}</tbody>
            </table></div>
            {filtered.length > 3 && <div className="operations-table-footer"><span>Showing {showAll ? filtered.length : 3} of {filtered.length} team members</span><button type="button" className="crm-secondary-button" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : "Show more"}</button></div>}
          </>}
      </section>

      <section className="owner-two-col">
        <article className="card owner-panel"><div className="owner-panel-heading"><div><p className="dashboard-eyebrow">ROLE CAPABILITIES</p><h2>Starter role defaults</h2></div></div><div className="owner-rank-list">{roles.map((item) => <div className="owner-rank-row" key={item.value}><span className="owner-rank-index"><ShieldCheck size={14}/></span><div><strong>{item.label}</strong><small>{item.description}</small></div></div>)}</div></article>
        <article className="card owner-panel"><div className="owner-panel-heading"><div><p className="dashboard-eyebrow">PERMISSION OVERRIDES</p><h2>Fine-grained control</h2></div></div><p className="dashboard-subtitle">Use the permissions screen to override a module/action grant for a role within this workspace. Overrides are enforced in server API handlers; hidden navigation alone is not used as a security boundary.</p><Link className="dashboard-text-link" href="/operations/permissions">Configure permissions <ShieldCheck size={15}/></Link><p className="owner-footnote">The owner account remains the authority for team access. Staff cannot add users, assign owner roles, or grant their own permissions.</p></article>
      </section>
    </div>
  );
}
