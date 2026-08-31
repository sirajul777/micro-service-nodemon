import { useEffect, useMemo, useState } from 'react';
import { CreditCard, Edit3, Plus, RefreshCw, Search, Trash2, ToggleLeft, X } from 'lucide-react';
import { request } from '../api';

type Reseller = Record<string, any>;
type FormState = { id: string; name: string; username: string; sessionId: string; status: string; balance: string };
const emptyForm: FormState = { id: '', name: '', username: '', sessionId: '', status: 'active', balance: '0' };

export default function ResellersPage() {
  const [rows, setRows] = useState<Reseller[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Reseller | null>(null);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupNote, setTopupNote] = useState('');
  const [logs, setLogs] = useState<any[]>([]);

  const load = async () => {
    setBusy(true); setNotice('');
    try {
      const data = await request('/api/resellers');
      setRows(Array.isArray(data) ? data : data?.resellers || []);
    } catch (e: any) { setNotice(e?.message || 'Unable to load resellers.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q)));
  }, [rows, query]);

  const save = async () => {
    setBusy(true); setNotice('');
    try {
      const body = { ...form, balance: Number(form.balance || 0) };
      if (editing && form.id) await request(`/api/resellers/${encodeURIComponent(form.id)}`, { method: 'PUT', body: JSON.stringify(body) });
      else await request('/api/resellers', { method: 'POST', body: JSON.stringify(body) });
      setForm(emptyForm); setEditing(false); await load();
    } catch (e: any) { setNotice(e?.message || 'Unable to save reseller.'); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this reseller?')) return;
    setBusy(true); setNotice('');
    try { await request(`/api/resellers/${encodeURIComponent(id)}`, { method: 'DELETE' }); await load(); }
    catch (e: any) { setNotice(e?.message || 'Unable to delete reseller.'); }
    finally { setBusy(false); }
  };

  const toggle = async (id: string) => {
    setBusy(true); setNotice('');
    try { await request(`/api/bot-resellers/${encodeURIComponent(id)}/toggle`, { method: 'PATCH' }); await load(); }
    catch (e: any) { setNotice(e?.message || 'Unable to toggle reseller.'); }
    finally { setBusy(false); }
  };

  const openLogs = async (row: Reseller) => {
    setSelected(row); setBusy(true); setNotice('');
    try {
      const data = await request(`/api/bot-resellers/logs?resellerId=${encodeURIComponent(String(row.id ?? ''))}&limit=100`);
      setLogs(Array.isArray(data) ? data : data?.logs || []);
    } catch { setLogs([]); }
    finally { setBusy(false); }
  };

  const topup = async () => {
    if (!selected) return;
    const amount = Number(topupAmount || 0);
    if (!amount) { setNotice('Top-up amount is required.'); return; }
    setBusy(true); setNotice('');
    try {
      await request(`/api/bot-resellers/${encodeURIComponent(String(selected.id))}/topup`, { method: 'POST', body: JSON.stringify({ amount, note: topupNote, by: 'admin' }) });
      setTopupAmount(''); setTopupNote(''); await openLogs(selected); await load();
    } catch (e: any) { setNotice(e?.message || 'Unable to top up reseller.'); }
    finally { setBusy(false); }
  };

  return <div className="stack">
    <div className="hero">
      <div><span className="eyebrow">SELLING MANAGEMENT</span><h3>Resellers</h3><p>Manage reseller accounts, status, balance top-ups, and activity logs.</p></div>
      <div className="panel-actions"><button className="button" onClick={() => { setEditing(false); setForm(emptyForm); }}><Plus size={15}/> New reseller</button><button className="button secondary" onClick={() => void load()} disabled={busy}><RefreshCw size={15} className={busy ? 'spin' : ''}/> Refresh</button></div>
    </div>
    {notice && <div className="error banner">{notice}</div>}
    <section className="panel">
      <div className="panel-head"><div><h3>Reseller Accounts</h3><span>{filtered.length} of {rows.length} resellers</span></div><span className="badge">{busy ? 'WORKING' : 'LIVE'}</span></div>
      <div className="table-controls"><div className="table-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search reseller, username, session..."/></div></div>
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Username</th><th>Session</th><th>Status</th><th>Balance</th><th>Actions</th></tr></thead><tbody>
        {filtered.map((row, i) => <tr key={String(row.id ?? i)}><td><b>{row.name || '—'}</b></td><td>{row.username || '—'}</td><td>{row.sessionId || '—'}</td><td>{row.status || (row.active ? 'active' : 'inactive')}</td><td>{row.balance ?? row.saldo ?? '0'}</td><td><div className="row-actions"><button className="icon tiny" title="Edit" onClick={() => { setForm({ ...emptyForm, ...row, id: String(row.id ?? ''), balance: String(row.balance ?? row.saldo ?? 0) }); setEditing(true); }}><Edit3 size={14}/></button><button className="icon tiny" title="Toggle" onClick={() => void toggle(String(row.id))}><ToggleLeft size={14}/></button><button className="icon tiny" title="Top-up / logs" onClick={() => void openLogs(row)}><CreditCard size={14}/></button><button className="icon tiny danger" title="Delete" onClick={() => void remove(String(row.id))}><Trash2 size={14}/></button></div></td></tr>)}
      </tbody></table>{!filtered.length && <div className="empty">No resellers found.</div>}</div>
    </section>

    <section className="panel">
      <div className="panel-head"><div><h3>{editing ? 'Edit Reseller' : 'Create Reseller'}</h3><span>Uses the existing reseller API contract.</span></div></div>
      <div className="grid"><label className="metric"><span>Name</span><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label><label className="metric"><span>Username</span><input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })}/></label><label className="metric"><span>Session ID</span><input value={form.sessionId} onChange={e => setForm({ ...form, sessionId: e.target.value })}/></label><label className="metric"><span>Status</span><input value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}/></label><label className="metric"><span>Balance</span><input type="number" value={form.balance} onChange={e => setForm({ ...form, balance: e.target.value })}/></label></div>
      <div className="panel-actions"><button className="primary" onClick={() => void save()} disabled={busy}>{editing ? 'Save changes' : 'Create reseller'}</button><button className="button secondary" onClick={() => { setEditing(false); setForm(emptyForm); }}>Clear</button></div>
    </section>

    {selected && <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><span className="eyebrow">RESELLER</span><h3>{selected.name || selected.id}</h3></div><button className="icon" onClick={() => setSelected(null)}><X size={18}/></button></div><div className="detail-grid"><div className="metric"><span>Balance</span><b>{selected.balance ?? selected.saldo ?? '0'}</b></div><label className="metric"><span>Top-up amount</span><input type="number" value={topupAmount} onChange={e => setTopupAmount(e.target.value)} /></label><label className="metric"><span>Note</span><input value={topupNote} onChange={e => setTopupNote(e.target.value)} placeholder="Optional note" /></label></div><div className="panel-actions"><button className="primary" onClick={() => void topup()} disabled={busy}>Top up</button><button className="button secondary" onClick={() => void openLogs(selected)} disabled={busy}>Refresh logs</button></div><div className="table-wrap"><table><thead><tr><th>Time</th><th>Action</th><th>Amount</th><th>Note</th></tr></thead><tbody>{logs.map((l, i) => <tr key={i}><td>{l.createdAt || l.time || '—'}</td><td>{l.action || l.type || '—'}</td><td>{l.amount ?? '—'}</td><td>{l.note || l.description || '—'}</td></tr>)}</tbody></table>{!logs.length && <div className="empty">No reseller logs.</div>}</div></div></div>}
  </div>;
}
