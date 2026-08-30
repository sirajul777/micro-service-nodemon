import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, WifiOff } from 'lucide-react';
import { router } from '../api';

type Row = Record<string, any>;

export default function PppoeActivePage({ session }: { session: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const load = async () => {
    if (!session) return;
    setBusy(true); setError('');
    try {
      const result: any = await router.pppActive(session);
      setRows(result?.active ?? result?.connections ?? result?.data ?? result ?? []);
    } catch (e: any) { setError(e?.message || 'Unable to load active PPPoE sessions.'); }
    finally { setBusy(false); }
  };

  useEffect(() => { void load(); }, [session]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [rows, query]);

  const disconnect = async (name: string) => {
    if (!name || !window.confirm(`Disconnect PPPoE session \"${name}\"?`)) return;
    setBusy(true); setError('');
    try {
      await router.disconnectPppActive(session, name);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Unable to disconnect PPPoE session.');
      setBusy(false);
    }
  };

  return <div className="stack">
    <div className="hero">
      <div><span className="eyebrow">PPPOE MONITORING</span><h3>PPPoE Active</h3><p>Inspect active PPPoE sessions on the selected router.</p></div>
      <div className="top-actions"><button className="button" onClick={() => void load()} disabled={busy || !session}><RefreshCw size={15} className={busy ? 'spin' : ''}/> Refresh</button></div>
    </div>
    {error && <div className="error banner">{error}</div>}
    <section className="panel">
      <div className="panel-head"><div><h3>Active Sessions</h3><span>{filtered.length} active session{filtered.length === 1 ? '' : 's'}</span></div><span className="badge">{busy ? 'WORKING' : 'LIVE'}</span></div>
      <div className="table-controls"><div className="table-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search username, address, caller ID..."/></div></div>
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Address</th><th>Uptime</th><th>Service</th><th>Caller ID</th><th>Action</th></tr></thead><tbody>
      {filtered.map((r, i) => { const name = String(r.name || r.user || r.username || `row-${i}`); return <tr key={`${name}-${i}`}><td><b>{name}</b></td><td>{r.address || r.remoteAddress || '—'}</td><td>{r.uptime || '—'}</td><td>{r.service || 'pppoe'}</td><td>{r.callerId || r['caller-id'] || '—'}</td><td><button className="button" disabled={busy} onClick={() => void disconnect(name)}><WifiOff size={14}/> Disconnect</button></td></tr>; })}
      </tbody></table>{!filtered.length && <div className="empty">No active PPPoE sessions found.</div>}</div>
    </section>
  </div>;
}
