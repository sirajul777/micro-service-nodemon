import { useEffect, useMemo, useState } from 'react';
import { Activity, RefreshCw, Search } from 'lucide-react';
import { router } from '../api';

type Row = Record<string, any>;
type Props = { session: string };

export default function HotspotActivePage({ session }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async () => {
    if (!session) return;
    setBusy(true);
    setNotice('');
    try {
      const data = await router.hotspotActive(session);
      setRows(Array.isArray(data) ? data : data?.connections || []);
    } catch (e: any) {
      setNotice(e?.message || 'Unable to load active hotspot users.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void load(); }, [session]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [rows, query]);

  return <div className="stack">
    <div className="hero">
      <div><span className="eyebrow">HOTSPOT MONITORING</span><h3>Hotspot Active</h3><p>Monitor active RouterOS hotspot sessions on the selected router.</p></div>
      <button className="button" onClick={() => void load()} disabled={busy}><RefreshCw size={15} className={busy ? 'spin' : ''}/> Refresh</button>
    </div>
    {notice && <div className="error banner">{notice}</div>}
    <section className="panel">
      <div className="panel-head"><div><h3><Activity size={15}/> Active Connections</h3><span>{filtered.length} of {rows.length} sessions</span></div><span className="badge">{busy ? 'WORKING' : 'LIVE'}</span></div>
      <div className="table-controls"><div className="table-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, address, MAC, uptime..."/></div></div>
      <div className="table-wrap"><table><thead><tr><th>User</th><th>Address</th><th>MAC</th><th>Uptime</th><th>Profile</th><th>Session</th></tr></thead>
      <tbody>{filtered.map((row, i) => {
        const name = String(row.name || row.user || row.username || row.id || `row-${i}`);
        return <tr key={`${name}-${row.address || i}`}><td><b>{name}</b></td><td>{row.address || row.ip || '—'}</td><td>{row.macAddress || row.mac || '—'}</td><td>{row.uptime || '—'}</td><td>{row.profile || '—'}</td><td>{row.session || row.sessionId || '—'}</td></tr>;
      })}</tbody></table>{!filtered.length && <div className="empty">No active hotspot sessions found.</div>}</div>
    </section>
  </div>;
}
