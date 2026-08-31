import { useEffect, useMemo, useState } from 'react';
import { Eye, RefreshCw, Router, Search, X } from 'lucide-react';
import { router } from '../api';

type Session = Record<string, any>;

export default function RouterSessionsPage() {
  const [rows, setRows] = useState<Session[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async () => {
    setBusy(true); setNotice('');
    try {
      const data = await router.sessions();
      const list = Array.isArray(data) ? data : data?.sessions;
      setRows(Array.isArray(list) ? list : []);
    } catch (e: any) { setNotice(e?.message || 'Unable to load router sessions.'); }
    finally { setBusy(false); }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(q)));
  }, [rows, query]);

  const inspect = async (row: Session) => {
    const id = String(row.id ?? row.sessionId ?? '');
    if (!id) { setSelected(row); return; }
    setBusy(true); setNotice('');
    try {
      const detail = await fetch(`/api/sessions/${encodeURIComponent(id)}`, { credentials: 'include' }).then(async (r) => {
        if (!r.ok) throw new Error(await r.text() || `HTTP ${r.status}`);
        return r.json();
      });
      setSelected(detail || row);
    } catch { setSelected(row); }
    finally { setBusy(false); }
  };

  return <div className="stack">
    <div className="hero">
      <div><span className="eyebrow">ROUTER MANAGEMENT</span><h3>Router Sessions</h3><p>Inspect router sessions connected to the control plane.</p></div>
      <button className="button" onClick={() => void load()} disabled={busy}><RefreshCw size={15} className={busy ? 'spin' : ''}/> Refresh</button>
    </div>
    {notice && <div className="error banner">{notice}</div>}
    <section className="panel">
      <div className="panel-head"><div><h3><Router size={15}/> Available Routers</h3><span>{filtered.length} of {rows.length} sessions</span></div><span className="badge">{busy ? 'WORKING' : 'LIVE'}</span></div>
      <div className="table-controls"><div className="table-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search router, IP, port, ID..."/></div></div>
      <div className="table-wrap"><table><thead><tr><th>Session</th><th>Name</th><th>IP</th><th>Port</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.map((row, i) => { const id = String(row.id ?? row.sessionId ?? `row-${i}`); return <tr key={id}><td><b>{id}</b></td><td>{row.name || row.routerName || '—'}</td><td>{row.ip || row.host || row.address || '—'}</td><td>{row.port ?? '—'}</td><td>{row.status || (row.connected === true ? 'Connected' : 'Available')}</td><td><button className="icon tiny" title="Inspect" disabled={busy} onClick={() => void inspect(row)}><Eye size={14}/></button></td></tr>; })}</tbody></table>{!filtered.length && <div className="empty">No router sessions found.</div>}</div>
    </section>
    {selected && <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><span className="eyebrow">ROUTER SESSION</span><h3>{selected.name || selected.id || 'Session'}</h3></div><button className="icon" onClick={() => setSelected(null)}><X size={18}/></button></div><div className="detail-grid">{Object.entries(selected).map(([key, value]) => <div className="metric" key={key}><span>{key}</span><b>{typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}</b></div>)}</div><div className="modal-actions"><button className="button secondary" onClick={() => setSelected(null)}>Close</button></div></div></div>}
  </div>;
}
