import { useEffect, useMemo, useState } from 'react';
import { Activity, Network, RefreshCw, Search } from 'lucide-react';
import { router } from '../api';

type Row = Record<string, any>;
type Props = { session: string; onTraffic?: (name: string) => void };

export default function InterfacesPage({ session, onTraffic }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async () => {
    if (!session) return;
    setBusy(true); setNotice('');
    try {
      const result = await router.interfaces(session);
      setRows(Array.isArray(result) ? result : result?.interfaces || result?.data || []);
    } catch (e: any) {
      setNotice(e?.message || 'Unable to load interfaces.');
    } finally { setBusy(false); }
  };

  useEffect(() => { void load(); }, [session]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return !q ? rows : rows.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [rows, query]);

  const running = (value: any) => {
    const normalized = String(value ?? '').toLowerCase();
    if (normalized === 'true' || normalized === 'yes') return 'Running';
    if (normalized === 'false' || normalized === 'no') return 'Down';
    return value || '—';
  };

  return <div className="stack">
    <div className="hero">
      <div><span className="eyebrow">ROUTEROS INTERFACES</span><h3>Interfaces</h3><p>Inspect physical and virtual interfaces on the active RouterOS instance.</p></div>
      <div className="top-actions"><button className="button" disabled={busy || !session} onClick={() => void load()}><RefreshCw size={15} className={busy ? 'spin' : ''}/> Refresh</button></div>
    </div>
    {notice && <div className="error banner">{notice}</div>}
    <section className="panel">
      <div className="panel-head"><div><h3><Network size={15}/> Interface Inventory</h3><span>{visible.length} of {rows.length} interfaces</span></div><span className="badge">{busy ? 'WORKING' : 'LIVE'}</span></div>
      <div className="table-controls"><div className="table-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search interface, type, MAC..."/></div></div>
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Type</th><th>MAC Address</th><th>Status</th><th>TX</th><th>RX</th><th>Traffic</th></tr></thead>
        <tbody>{visible.map((r, i) => { const name = String(r.name || r.id || i); return <tr key={name}><td><b>{name}</b></td><td>{r.type || '—'}</td><td>{r.macAddress || r.mac_address || '—'}</td><td>{running(r.running)}</td><td>{r.tx || '—'}</td><td>{r.rx || '—'}</td><td><button className="button secondary" disabled={!onTraffic || !session} onClick={() => onTraffic?.(name)}><Activity size={14}/> Monitor</button></td></tr>; })}</tbody>
      </table>{!visible.length && <div className="empty">No interfaces found.</div>}</div>
    </section>
  </div>;
}
