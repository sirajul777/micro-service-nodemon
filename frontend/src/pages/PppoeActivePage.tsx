import { useEffect, useState } from 'react';
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

  const filtered = rows.filter((r) => {
    const q = query.trim().toLowerCase();
    return !q || Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q));
  });

  const disconnect = async (name: string) => {
    if (!name || !window.confirm(`Disconnect PPPoE session "${name}"?`)) return;
    setBusy(true); setError('');
    try { await router.disconnectPppActive(session, name); await load(); }
    catch (e: any) { setError(e?.message || 'Unable to disconnect PPPoE session.'); setBusy(false); }
  };

  return <div className="panel">
    <div className="panel-head"><div><h3>PPPoE Active</h3><span>{filtered.length} active session{filtered.length === 1 ? '' : 's'}</span></div>
      <div className="panel-actions"><div className="search"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search active sessions..." /></div><button className="button secondary" onClick={() => void load()} disabled={busy}>Refresh</button></div></div>
    {error && <div className="error banner">{error}</div>}
    <div className="table-wrap"><table><thead><tr><th>Name</th><th>Address</th><th>Uptime</th><th>Service</th><th>Caller ID</th><th>Actions</th></tr></thead><tbody>
      {filtered.map((r, i) => { const name = String(r.name || r.user || r.username || `row-${i}`); return <tr key={name}><td>{name}</td><td>{r.address || r.remoteAddress || '—'}</td><td>{r.uptime || '—'}</td><td>{r.service || 'pppoe'}</td><td>{r.callerId || r['caller-id'] || '—'}</td><td><button className="button secondary" disabled={busy} onClick={() => void disconnect(name)}>Disconnect</button></td></tr>; })}
    </tbody></table>{!filtered.length && <div className="empty">No active PPPoE sessions found.</div>}</div>
  </div>;
}