import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, FileText, RefreshCw, Send, ShieldAlert, ShieldCheck, Upload, Users, Ban } from "lucide-react";
import "../billing-page.css";

type Row = Record<string, any>;
const esc = (v: string) => encodeURIComponent(v);
const api = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(path, { credentials: "include", ...init, headers: { "Content-Type": "application/json", ...(init.headers || {}) } });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
  return res.status === 204 ? null : res.json();
};
const post = (path: string, body: unknown = {}) => api(path, { method: "POST", body: JSON.stringify(body) });
const money = (v: unknown) => `Rp ${Number(v || 0).toLocaleString("id-ID")}`;
const cell = (v: unknown) => (v == null || v === "" ? "—" : String(v));
const statusClass = (v: unknown) => `status-chip status-${String(v ?? "").toLowerCase().replace(/\s+/g, "-")}`;
const readSessionFromDom = () => document.querySelector<HTMLSelectElement>(".router-box select")?.value || "";
const emptyCustomer = (): Row => ({ name: "", mikrotikUser: "", type: "pppoe", profile: "", phone: "", telegramId: "", address: "", price: 0, billDate: 1, graceDays: 3, autoDisable: true, note: "" });

export default function BillingPage() {
  const [sessions, setSessions] = useState<Row[]>([]);
  const [session, setSession] = useState(readSessionFromDom());
  const [tab, setTab] = useState<"customers" | "invoices" | "settlements">("customers");
  const [data, setData] = useState<{ stats: Row; customers: Row[]; invoices: Row[]; settlements: Row[] }>({ stats: {}, customers: [], invoices: [], settlements: [] });
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [customer, setCustomer] = useState<Row>(emptyCustomer());
  const base = session ? `/api/billing/${esc(session)}` : "";
  const load = async () => {
    if (!session) return;
    setBusy(true); setNotice("");
    try {
      const [stats, customers, invoices, settlements] = await Promise.all([api(`${base}/stats`), api(`${base}/customers`), api(`${base}/invoices`), api(`${base}/settlements`)]);
      setData({ stats: stats || {}, customers: Array.isArray(customers) ? customers : [], invoices: Array.isArray(invoices) ? invoices : [], settlements: Array.isArray(settlements) ? settlements : [] });
    } catch (e: any) { setNotice(e?.message || "Unable to load billing data."); } finally { setBusy(false); }
  };
  useEffect(() => {
    (async () => {
      try { const r = await api("/api/sessions"); const rows = (r?.sessions ?? r ?? []) as Row[]; setSessions(rows); if (!readSessionFromDom()) setSession(rows[0]?.id || ""); }
      catch (e: any) { setNotice(e?.message || "Unable to load router sessions."); }
    })();
  }, []);
  useEffect(() => { if (session) void load(); }, [session]);
  useEffect(() => {
    const sync = () => { const value = readSessionFromDom(); if (value && value !== session) setSession(value); };
    sync(); const select = document.querySelector<HTMLSelectElement>(".router-box select"); select?.addEventListener("change", sync); const timer = window.setInterval(sync, 500);
    return () => { select?.removeEventListener("change", sync); window.clearInterval(timer); };
  }, [session]);
  const filtered = useMemo(() => {
    const rows = tab === "customers" ? data.customers : tab === "invoices" ? data.invoices : data.settlements; const q = query.trim().toLowerCase();
    return rows.filter(r => { const matchesQuery = !q || Object.values(r).some(v => String(v ?? "").toLowerCase().includes(q)); const matchesType = tab !== "customers" || !type || String(r.type || "").toLowerCase() === type; const matchesStatus = !status || String(r.status || "").toLowerCase() === status; return matchesQuery && matchesType && matchesStatus; });
  }, [data, tab, query, type, status]);
  const resetCustomer = () => setCustomer(emptyCustomer());
  const saveCustomer = async () => {
    if (!customer.name.trim()) { setNotice("Nama pelanggan wajib diisi."); return; }
    setBusy(true); setNotice("");
    try { await post(`${base}/customers`, { ...customer, price: Number(customer.price || 0), billDate: Number(customer.billDate || 1), graceDays: Number(customer.graceDays || 0) }); setShowForm(false); resetCustomer(); await load(); setNotice("Pelanggan berhasil ditambahkan."); }
    catch (e: any) { setNotice(e?.message || "Gagal menambah pelanggan."); } finally { setBusy(false); }
  };
  const action = async (label: string, fn: () => Promise<any>) => { setBusy(true); setNotice(""); try { const r = await fn(); setNotice(r?.message || `${label} selesai.`); await load(); } catch (e: any) { setNotice(e?.message || `${label} gagal.`); } finally { setBusy(false); } };
  const runOverdue = () => action("Proses overdue", () => post(`${base}/run-overdue`));
  const importJson = async (file?: File) => {
    if (!file) return; setBusy(true); setNotice("");
    try { const parsed = JSON.parse(await file.text()); const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.customers) ? parsed.customers : []; let imported = 0; for (const row of rows) { if (!row?.name) continue; await post(`${base}/customers`, { ...row, type: row.type || row.service_type || "pppoe", mikrotikUser: row.mikrotikUser || row.pppoe_username || "", profile: row.profile || row.package || "", price: Number(row.price || row.monthlyPrice || 0), billDate: Number(row.billDate || row.bill_date || 1), graceDays: Number(row.graceDays || 3), autoDisable: row.autoDisable !== false }); imported++; } await load(); setNotice(`${imported} pelanggan berhasil diimport.`); }
    catch (e: any) { setNotice(e?.message || "File JSON tidak valid atau import gagal."); } finally { setBusy(false); }
  };
  const unpaidCount = data.invoices.filter(r => ["unpaid", "overdue"].includes(String(r.status || "").toLowerCase())).length;
  const suspendedCount = data.stats.suspended ?? data.customers.filter(r => String(r.status || "").toLowerCase() === "suspended").length;

  return <div className="billing-page stack">
    <div className="billing-reference-head"><div><span className="eyebrow">BILLING</span><h3>Pelanggan Billing</h3></div><button className="button" onClick={() => void load()} disabled={busy}><RefreshCw size={14} className={busy ? "spin" : ""} /> Refresh</button></div>
    {notice && <div className="error banner">{notice}</div>}
    <div className="billing-hidden-session" aria-hidden="true">{sessions.length ? sessions[0]?.name || sessions[0]?.id : ""}</div>
    <div className="stats billing-stats">
      <Metric icon={<Users size={17} />} title="Total Pelanggan" value={data.stats.totalCustomers ?? data.customers.length} kind="blue" />
      <Metric icon={<ShieldCheck size={17} />} title="Aktif" value={data.stats.activeCustomers ?? data.customers.filter(r => r.status === "active").length} kind="green" />
      <Metric icon={<ShieldAlert size={17} />} title="Belum Bayar" value={unpaidCount} kind="red" />
      <Metric icon={<Ban size={17} />} title="Diblokir" value={suspendedCount} kind="yellow" />
    </div>
    {tab === "customers" ? <section className="panel billing-customer-panel">
      <div className="panel-head billing-customer-head"><h3><Users size={16} /> Daftar Pelanggan</h3><div className="billing-toolbar"><select value={type} onChange={e => setType(e.target.value)}><option value="">Semua Tipe</option><option value="pppoe">PPPoE</option><option value="hotspot">Hotspot</option></select><select value={status} onChange={e => setStatus(e.target.value)}><option value="">Semua Status</option><option value="active">Aktif</option><option value="suspended">Diblokir</option></select><button className="button secondary" onClick={() => void runOverdue()} disabled={busy}><Ban size={13} /> Proses Overdue</button><label className="button secondary billing-import-button"><Upload size={13} /> Import JSON<input type="file" accept="application/json,.json" onChange={e => void importJson(e.target.files?.[0])} /></label></div></div>
      <div className="billing-add-row"><button className="button primary" onClick={() => setShowForm(true)}><span>+</span> Tambah Pelanggan</button></div>
      <div className="table-wrap billing-reference-table"><table><thead><tr><th>Nama</th><th>Username MikroTik</th><th>Tipe</th><th>Paket</th><th>Tagihan/Bulan</th><th>Tgl Tagih</th><th>Status</th><th>Telegram</th><th>Aksi</th></tr></thead><tbody>{filtered.map((r, i) => <tr key={r.id || i}><td><b className="entity-cell">{cell(r.name)}</b>{r.phone && <small>{r.phone}</small>}</td><td className="mono-cell">{cell(r.mikrotikUser)}</td><td><span className="type-chip">{cell(r.type)}</span></td><td>{cell(r.profile)}</td><td className="money-cell billing-green-money">{money(r.price)}</td><td>{r.billDate ? `Tgl ${cell(r.billDate)}` : "—"}</td><td><span className={statusClass(r.status)}>{String(r.status || "—") === "active" ? "AKTIF" : cell(r.status)}</span></td><td><span className="access-chip">{cell(r.telegramId)}</span></td><td><div className="action-stack">{r.status === "suspended" ? <button className="icon tiny" title="Aktifkan" disabled={busy} onClick={() => void action("Aktifkan", () => post(`${base}/customers/${esc(r.id)}/re-enable`))}><ShieldCheck size={13}/></button> : <button className="icon tiny danger" title="Blokir" disabled={busy} onClick={() => void action("Blokir", () => post(`${base}/customers/${esc(r.id)}/suspend`))}><Ban size={13}/></button>}</div></td></tr>)}</tbody></table>{!filtered.length && <div className="empty">Belum ada pelanggan billing.</div>}</div>
    </section> : <section className="panel"><div className="panel-head"><div><h3>Billing Workspace</h3><span>Invoices dan settlements</span></div><div className="panel-actions billing-tabs"><button className="button secondary" onClick={() => setTab("customers")}>Customers</button><button className={tab === "invoices" ? "button primary" : "button secondary"} onClick={() => setTab("invoices")}>Invoices</button><button className={tab === "settlements" ? "button primary" : "button secondary"} onClick={() => setTab("settlements")}>Settlements</button></div></div><div className="table-controls"><div className="table-search"><input value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${tab}...`} /></div><select value={status} onChange={e => setStatus(e.target.value)}><option value="">All status</option><option value="unpaid">Unpaid</option><option value="overdue">Overdue</option><option value="paid">Paid</option><option value="pending">Pending</option><option value="verified">Verified</option></select></div><div className="table-wrap"><table><thead><tr>{tab === "invoices" ? <><th>Customer</th><th>Period</th><th>Amount</th><th>Due Date</th><th>Status</th><th>Paid By</th><th>Actions</th></> : <><th>Collector</th><th>Amount</th><th>Status</th><th>Created</th><th>Verified</th></>}</tr></thead><tbody>{filtered.map((r, i) => tab === "invoices" ? <tr key={r.id || i}><td><b className="entity-cell">{cell(r.customerName)}</b></td><td>{cell(r.period)}</td><td className="money-cell">{money(r.amount)}</td><td>{cell(r.dueDate)}</td><td><span className={statusClass(r.status)}>{cell(r.status)}</span></td><td>{cell(r.paidBy)}</td><td><div className="action-stack">{r.status !== "paid" && <button className="icon tiny" title="Mark paid" disabled={busy} onClick={() => void action("Pay invoice", () => post(`${base}/invoices/${esc(r.id)}/pay`, { paidBy: "Admin" }))}><CheckCircle2 size={13}/></button>}<button className="icon tiny" title="Send reminder" disabled={busy} onClick={() => void action("Send reminder", () => post(`${base}/invoices/${esc(r.id)}/send-reminder`))}><Send size={13}/></button></div></td></tr> : <tr key={r.id || i}><td><b className="entity-cell">{cell(r.collectorName)}</b></td><td className="money-cell">{money(r.amount)}</td><td><span className={statusClass(r.status)}>{cell(r.status)}</span></td><td className="mono-cell">{cell(r.createdAt)}</td><td className="mono-cell">{cell(r.verifiedAt)}</td></tr>)}</tbody></table>{!filtered.length && <div className="empty">No records found.</div>}</div>{tab === "invoices" && <div className="section-actions"><button className="button primary" disabled={busy} onClick={() => void action("Generate monthly invoices", () => post(`${base}/invoices/generate`))}><FileText size={14}/> Generate Monthly Invoices</button><button className="button secondary" disabled={busy} onClick={() => void runOverdue()}>Run Overdue</button></div>}{tab === "settlements" && <SettlementForm base={base} onDone={load} busy={busy} setBusy={setBusy} setNotice={setNotice}/>}</section>}
    {showForm && <CustomerModal value={customer} setValue={setCustomer} busy={busy} onClose={() => { setShowForm(false); resetCustomer(); }} onSave={saveCustomer} />}
  </div>;
}
function Metric({ icon, title, value, kind }: { icon: ReactNode; title: string; value: unknown; kind: string }) { return <div className={`stat billing-stat ${kind}`}><div className="stat-icon">{icon}</div><div><strong>{String(value)}</strong><span>{title}</span></div></div>; }
function CustomerModal({ value, setValue, busy, onClose, onSave }: { value: Row; setValue: (v: Row) => void; busy: boolean; onClose: () => void; onSave: () => void }) { const field = (key: string, label: string, inputType = "text") => <label><span>{label}</span><input type={inputType} value={value[key] ?? ""} onChange={e => setValue({ ...value, [key]: e.target.value })}/></label>; return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><span className="eyebrow">BILLING CUSTOMER</span><h3>Tambah Pelanggan</h3></div><button className="icon" onClick={onClose}>×</button></div><form onSubmit={e => { e.preventDefault(); onSave(); }}><div className="form-grid">{field("name", "Nama Pelanggan")}{field("mikrotikUser", "Username MikroTik")}{field("type", "Tipe")}{field("profile", "Paket / Profile")}{field("phone", "No. HP / WA")}{field("telegramId", "Telegram ID")}{field("address", "Alamat")}{field("price", "Harga Tagihan/Bulan", "number")}{field("billDate", "Tanggal Tagih", "number")}{field("graceDays", "Grace Period", "number")}{field("note", "Catatan")}</div><div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Batal</button><button className="button primary" disabled={busy}>Simpan</button></div></form></div></div>; }
function SettlementForm({ base, onDone, busy, setBusy, setNotice }: { base: string; onDone: () => Promise<void> | void; busy: boolean; setBusy: (v: boolean) => void; setNotice: (v: string) => void }) { const [name, setName] = useState(""); const [amount, setAmount] = useState("0"); return <div className="settlement-form"><input value={name} onChange={e => setName(e.target.value)} placeholder="Collector name"/><input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount"/><button className="button primary" disabled={busy || !name} onClick={async () => { setBusy(true); try { await post(`${base}/settlements/submit`, { collectorName: name, amount: Number(amount) }); setNotice("Settlement submitted."); setName(""); setAmount("0"); await onDone(); } catch (e: any) { setNotice(e?.message || "Settlement failed."); } finally { setBusy(false); } }}>Submit Settlement</button></div>; }
