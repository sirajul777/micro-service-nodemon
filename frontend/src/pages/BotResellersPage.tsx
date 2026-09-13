import { useEffect, useMemo, useState } from "react";
import {
  CircleDollarSign,
  Edit3,
  History,
  Plus,
  RefreshCw,
  Search,
  Ticket,
  Trash2,
  Users,
  WalletCards,
  RotateCcw,
} from "lucide-react";
import { request } from "../api";
import "../bot-resellers-page.css";

type Reseller = Record<string, any>;
const emptyForm: Reseller = { id: "", name: "", username: "", sessionId: "", status: "active", balance: 0 };

const money = (value: any) => `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
const activeOf = (row: Reseller) => String(row.status || (row.active === false ? "inactive" : "active")).toLowerCase() === "active";
const numeric = (row: Reseller, keys: string[]) => {
  for (const key of keys) if (row[key] != null && row[key] !== "") return Number(row[key]) || 0;
  return 0;
};

export default function BotResellersPage() {
  const [rows, setRows] = useState<Reseller[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Reseller | null>(null);
  const [form, setForm] = useState<Reseller>(emptyForm);
  const [logs, setLogs] = useState<Reseller[]>([]);
  const [topup, setTopup] = useState({ amount: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = async () => {
    setBusy(true);
    setNotice("");
    try {
      const data = await request("/api/bot-resellers");
      setRows(Array.isArray(data) ? data : data?.resellers || []);
    } catch (e: any) {
      setNotice(e?.message || "Gagal memuat reseller bot.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(q)));
  }, [rows, query]);

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter(activeOf).length,
    balance: rows.reduce((sum, row) => sum + numeric(row, ["balance", "saldo"]), 0),
    voucher: rows.reduce((sum, row) => sum + numeric(row, ["voucher", "voucherCount", "totalVoucher"]), 0),
  }), [rows]);

  const openNew = () => { setSelected({}); setForm({ ...emptyForm }); setNotice(""); };
  const openEdit = (row: Reseller) => { setSelected(row); setForm({ ...row }); setNotice(""); };
  const save = async () => {
    setBusy(true); setNotice("");
    try {
      const body = { ...form, balance: Number(form.balance || 0) };
      if (form.id) await request(`/api/bot-resellers/${encodeURIComponent(String(form.id))}`, { method: "PUT", body: JSON.stringify(body) });
      else await request("/api/bot-resellers", { method: "POST", body: JSON.stringify(body) });
      setSelected(null); await load();
    } catch (e: any) { setNotice(e?.message || "Gagal menyimpan reseller."); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    if (!window.confirm("Hapus reseller bot ini?")) return;
    setBusy(true); setNotice("");
    try { await request(`/api/bot-resellers/${encodeURIComponent(id)}`, { method: "DELETE" }); await load(); }
    catch (e: any) { setNotice(e?.message || "Gagal menghapus reseller."); }
    finally { setBusy(false); }
  };
  const toggle = async (id: string) => {
    setBusy(true); setNotice("");
    try { await request(`/api/bot-resellers/${encodeURIComponent(id)}/toggle`, { method: "PATCH" }); await load(); }
    catch (e: any) { setNotice(e?.message || "Gagal mengubah status reseller."); }
    finally { setBusy(false); }
  };
  const doTopup = async (id: string) => {
    const amount = Number(topup.amount || 0);
    if (!(amount > 0)) { setNotice("Nominal top up harus lebih dari 0."); return; }
    setBusy(true); setNotice("");
    try {
      await request(`/api/bot-resellers/${encodeURIComponent(id)}/topup`, { method: "POST", body: JSON.stringify({ amount, note: topup.note, by: "admin" }) });
      setTopup({ amount: "", note: "" }); await load();
    } catch (e: any) { setNotice(e?.message || "Gagal top up reseller."); }
    finally { setBusy(false); }
  };
  const loadLogs = async (id: string) => {
    setBusy(true); setNotice("");
    try {
      const data = await request(`/api/bot-resellers/${encodeURIComponent(id)}/logs?limit=100`);
      setLogs(Array.isArray(data) ? data : data?.logs || []);
      setSelected((current) => ({ ...(current || {}), id }));
    } catch (e: any) { setNotice(e?.message || "Gagal memuat log reseller."); }
    finally { setBusy(false); }
  };

  return (
    <div className="stack bot-resellers-page">
      <section className="bot-reference-card panel">
        <div className="bot-reference-head">
          <div>
            <h2>Daftar Reseller Bot</h2>
          </div>
          <div className="bot-reference-actions">
            <label className="bot-reference-search">
              <Search size={15} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama/username/ID..." />
            </label>
            <button className="button primary bot-add-button" onClick={openNew}><Plus size={15} /> Tambah Reseller</button>
          </div>
        </div>

        {notice && <div className="error banner bot-notice">{notice}</div>}

        <div className="bot-reference-stats">
          <div className="bot-stat"><span className="bot-stat-icon blue"><Users size={16} /></span><div><strong>{stats.total}</strong><small>TOTAL RESELLER</small></div></div>
          <div className="bot-stat"><span className="bot-stat-icon green"><CircleDollarSign size={16} /></span><div><strong>{stats.active}</strong><small>AKTIF</small></div></div>
          <div className="bot-stat"><span className="bot-stat-icon gold"><WalletCards size={16} /></span><div><strong>{money(stats.balance)}</strong><small>TOTAL SALDO</small></div></div>
          <div className="bot-stat"><span className="bot-stat-icon purple"><Ticket size={16} /></span><div><strong>{stats.voucher.toLocaleString("id-ID")}</strong><small>TOTAL VOUCHER</small></div></div>
        </div>

        <div className="bot-reference-table-wrap">
          <table className="bot-reference-table">
            <thead><tr><th>AGEN</th><th>TELEGRAM ID</th><th>SALDO</th><th>VOUCHER</th><th>PENDAPATAN</th><th>STATUS</th><th>DAFTAR</th><th>AKSI</th></tr></thead>
            <tbody>
              {filtered.map((row, i) => {
                const id = String(row.id ?? i); const active = activeOf(row);
                const voucher = numeric(row, ["voucher", "voucherCount", "totalVoucher"]); const income = numeric(row, ["revenue", "income", "pendapatan", "totalRevenue"]);
                return <tr key={id}>
                  <td><div className="bot-agent"><b>{row.name || "—"}</b><span>{row.username ? `@${String(row.username).replace(/^@/, "")}` : "—"}</span></div></td>
                  <td className="mono">{row.telegramId || row.telegram_id || row.chatId || row.chat_id || "—"}</td>
                  <td className="bot-money saldo">{money(row.balance ?? row.saldo)}</td>
                  <td>{voucher.toLocaleString("id-ID")}</td>
                  <td className="bot-money income">{money(income)}</td>
                  <td><span className={`bot-status ${active ? "active" : "inactive"}`}>{active ? "ACTIVE" : "INACTIVE"}</span></td>
                  <td className="bot-date">{row.createdAt || row.created_at || row.registeredAt || "—"}</td>
                  <td><div className="bot-row-actions">
                    <button className="bot-icon-action green" title="Top up" onClick={() => { setSelected(row); setTopup({ amount: "", note: "" }); }}><CircleDollarSign size={13} /></button>
                    <button className="bot-icon-action" title="Logs" onClick={() => void loadLogs(id)} disabled={busy}><History size={13} /></button>
                    <button className="bot-icon-action gold" title="Edit" onClick={() => openEdit(row)}><Edit3 size={13} /></button>
                    <button className="bot-icon-action red" title="Hapus" onClick={() => void remove(id)} disabled={busy}><Trash2 size={13} /></button>
                  </div></td>
                </tr>;
              })}
            </tbody>
          </table>
          {!filtered.length && <div className="empty bot-empty">{busy ? "Memuat reseller..." : "Belum ada reseller bot."}</div>}
        </div>
      </section>

      {selected && logs.length === 0 && (selected.name || selected.username || selected.id) && (
        <div className="modal-backdrop"><div className="modal">
          <div className="modal-head"><div><span className="eyebrow">RESELLER BOT</span><h3>{selected.name || selected.id || "Top Up"}</h3></div><button className="icon" onClick={() => setSelected(null)}>×</button></div>
          <div className="detail-grid">
            <div className="metric"><span>Saldo</span><b>{money(selected.balance ?? selected.saldo)}</b></div>
            <label className="metric"><span>Nominal Top Up</span><input type="number" min="1" value={topup.amount} onChange={(e) => setTopup({ ...topup, amount: e.target.value })} /></label>
            <label className="metric"><span>Catatan</span><input value={topup.note} onChange={(e) => setTopup({ ...topup, note: e.target.value })} /></label>
          </div>
          <div className="modal-actions"><button className="button secondary" onClick={() => setSelected(null)}>Batal</button><button className="primary" disabled={busy} onClick={() => void doTopup(String(selected.id))}>Top Up</button></div>
        </div></div>
      )}

      {selected && logs.length > 0 && (
        <div className="modal-backdrop"><div className="modal modal-wide">
          <div className="modal-head"><div><span className="eyebrow">RESELLER LOG</span><h3>{selected.name || selected.id}</h3></div><button className="icon" onClick={() => { setSelected(null); setLogs([]); }}><RotateCcw size={15} /></button></div>
          <div className="table-wrap"><table><thead><tr><th>Time</th><th>Event</th><th>Detail</th></tr></thead><tbody>{logs.map((log, i) => <tr key={String(log.id ?? i)}><td>{log.time || log.createdAt || "—"}</td><td>{log.event || log.type || log.action || "—"}</td><td className="mono">{JSON.stringify(log)}</td></tr>)}</tbody></table></div>
        </div></div>
      )}

      {selected && !selected.id && logs.length === 0 && (
        <div className="modal-backdrop"><div className="modal modal-wide">
          <div className="modal-head"><div><span className="eyebrow">BOT RESELLER</span><h3>Tambah Reseller</h3></div><button className="icon" onClick={() => setSelected(null)}>×</button></div>
          <div className="detail-grid">
            <label className="metric"><span>Nama</span><input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="metric"><span>Username</span><input value={form.username || ""} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
            <label className="metric"><span>Telegram ID</span><input value={form.telegramId || ""} onChange={(e) => setForm({ ...form, telegramId: e.target.value })} /></label>
            <label className="metric"><span>Router Session</span><input value={form.sessionId || ""} onChange={(e) => setForm({ ...form, sessionId: e.target.value })} /></label>
            <label className="metric"><span>Status</span><select value={form.status || "active"} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
            <label className="metric"><span>Saldo Awal</span><input type="number" value={form.balance ?? 0} onChange={(e) => setForm({ ...form, balance: e.target.value })} /></label>
          </div>
          <div className="modal-actions"><button className="button secondary" onClick={() => setSelected(null)}>Batal</button><button className="primary" disabled={busy} onClick={() => void save()}>Simpan</button></div>
        </div></div>
      )}
    </div>
  );
}
