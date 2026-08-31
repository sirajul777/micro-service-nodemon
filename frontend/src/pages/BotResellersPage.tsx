import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { request } from '../api';

type Reseller = Record<string, any>;
const emptyForm: Reseller = { id: '', name: '', username: '', sessionId: '', status: 'active', balance: 0 };

export default function BotResellersPage() {
  const [rows, setRows] = useState<Reseller[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Reseller | null>(null);
  const [form, setForm] = useState<Reseller>(emptyForm);
  const [logs, setLogs] = useState<Reseller[]>([]);
  const [topup, setTopup] = useState({ amount: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async () => {
    setBusy(true); setNotice('');
    try {
      const data = await request('/api/bot-resellers');
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) { setNotice(e?.message || 'Unable to load bot resellers.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(q)));
  }, [rows, query]);

  const openNew = () => { setSelected({}); setForm({ ...emptyForm }); };
  const openEdit = (row: Reseller) => { setSelected(row); setForm({ ...row }); };
  const save = async () => {
    setBusy(true); setNotice('');
    try {
      const body = { ...form, balance: Number(form.balance || 0) };
      if (form.id) await request(`/api/bot-resellers/${encodeURIComponent(String(form.id))}`, { method: 'PUT', body: JSON.stringify(body) });
      else await request('/api/bot-resellers', { method: 'POST', body: JSON.stringify(body) });
      setSelected(null); await load();
    } catch (e: any) { setNotice(e?.message || 'Unable to save bot reseller.'); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    if (!window.confirm('Delete this bot reseller?')) return;
    setBusy(true); setNotice('');
    try { await request(`/api/bot-resellers/${encodeURIComponent(id)}`, { method: 'DELETE' }); await load(); }
    catch (e: any) { setNotice(e?.message || 'Unable to delete bot reseller.'); }
    finally { setBusy(false); }
  };
  const toggle = async (id: string) => {
    setBusy(true); setNotice('');
    try { await request(`/api/bot-resellers/${encodeURIComponent(id)}/toggle`, { method: 'PATCH' }); await load(); }
    catch (e: any) { setNotice(e?.message || 'Unable to toggle reseller.'); }
    finally { setBusy(false); }
  };
  const doTopup = async (id: string) => {
    const amount = Number(topup.amount || 0);
    if (!(amount > 0)) { setNotice('Top-up amount must be greater than zero.'); return; }
    setBusy(true); setNotice('');
    try { await request(`/api/bot-resellers/${encodeURIComponent(id)}/topup`, { method: 'POST', body: JSON.stringify({ amount, note: topup.note, by: 'admin' }) }); setTopup({ amount: '', note: '' }); await load(); }
    catch (e: any) { setNotice(e?.message || 'Unable to top up reseller.'); }
    finally { setBusy(false); }
  };
  const loadLogs = async (id: string) => {
    setBusy(true); setNotice('');
    try { const data = await request(`/api/bot-resellers/${encodeURIComponent(id)}/logs?limit=100`); setLogs(Array.isArray(data) ? data : []); setSelected((current) => ({ ...(current || {}), id })); }
    catch (e: any) { setNotice(e?.message || 'Unable to load reseller logs.'); }
    finally { setBusy(false); }
  };

  return <div className="stack">
    <div className="hero"><div><span className="eyebrow">BOT OPERATIONS</span><h3>Bot Resellers</h3><p>Manage bot reseller accounts, balances, status, and activity logs.</p></div><div><button className="button" disabled={busy} onClick={() => void load()}><RefreshCw size={15} className={busy ? 'spin' : ''}/> Refresh</button> <button className="primary" onClick={openNew}>Add Reseller</button></div></div>
    {notice && <div className="error banner">{notice}</div>}
    <section className="panel">
      <div className="panel-head"><div><h3>Bot Resellers</h3><span>{filtered.length} of {rows.length} records</span></div><span className="badge">{busy ? 'WORKING' : 'LIVE'}</span></div>
      <div className="table-controls"><div className="table-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search reseller, username, router..."/></div></div>
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Username</th><th>Router</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.map((row, i) => { const id = String(row.id ?? i); return <tr key={id}><td>{row.name || '—'}</td><td>{row.username || '—'}</td><td>{row.sessionId || '—'}</td><td>{row.balance ?? 0}</td><td><span className="badge">{row.status || (row.active === false ? 'inactive' : 'active')}</span></td><td><button className="button tiny" onClick={() => openEdit(row)}>Edit</button> <button className="button tiny" onClick={() => void toggle(id)} disabled={busy}>Toggle</button> <button className="button tiny" onClick={() => void loadLogs(id)} disabled={busy}>Logs</button> <button className="button tiny" onClick={() => void doTopup(id)} disabled={busy}>Top Up</button> <button className="button tiny" onClick={() => void remove(id)} disabled={busy}>Delete</button></td></tr>; })}</tbody></table>{!filtered.length && <div className="empty">No bot resellers found.</div>}</div>
    </section>
    <section className="panel"><div className="panel-head"><div><h3>Top Up</h3><span>Select a reseller action from the table</span></div></div><div className="grid"><label className="metric"><span>Amount</span><input type="number" min="1" value={topup.amount} onChange={e => setTopup({ ...topup, amount: e.target.value })}/></label><label className="metric"><span>Note</span><input value={topup.note} onChange={e => setTopup({ ...topup, note: e.target.value })}/></label></div></section>
    {selected && <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><span className="eyebrow">BOT RESELLER</span><h3>{selected.id ? 'Edit reseller' : 'New reseller'}</h3></div><button className="icon" onClick={() => setSelected(null)}>×</button></div><div className="detail-grid"><label className="metric"><span>ID</span><input value={form.id || ''} onChange={e => setForm({ ...form, id: e.target.value })} disabled={!!selected.id}/></label><label className="metric"><span>Name</span><input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })}/></label><label className="metric"><span>Username</span><input value={form.username || ''} onChange={e => setForm({ ...form, username: e.target.value })}/></label><label className="metric"><span>Router Session</span><input value={form.sessionId || ''} onChange={e => setForm({ ...form, sessionId: e.target.value })}/></label><label className="metric"><span>Status</span><select value={form.status || 'active'} onChange={e => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label><label className="metric"><span>Balance</span><input type="number" value={form.balance ?? 0} onChange={e => setForm({ ...form, balance: e.target.value })}/></label></div><div className="modal-actions"><button className="button secondary" onClick={() => setSelected(null)}>Cancel</button><button className="primary" disabled={busy} onClick={() => void save()}>Save</button></div></div></div>}
    {logs.length > 0 && <section className="panel"><div className="panel-head"><div><h3>Reseller Logs</h3><span>{logs.length} entries</span></div></div><div className="table-wrap"><table><thead><tr><th>Time</th><th>Event</th><th>Detail</th></tr></thead><tbody>{logs.map((log, i) => <tr key={String(log.id ?? i)}><td>{log.time || log.createdAt || '—'}</td><td>{log.event || log.type || log.action || '—'}</td><td>{typeof log === 'object' ? JSON.stringify(log) : String(log)}</td></tr>)}</tbody></table></div></section>}
  </div>;
}
