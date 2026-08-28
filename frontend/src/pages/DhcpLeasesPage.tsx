import { useEffect, useMemo, useState } from 'react';
import { Network, RefreshCw, Search } from 'lucide-react';
import { router } from '../api';

type Row = Record<string, any>;
type Props = { session: string };

export default function DhcpLeasesPage({ session }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async () => {
    if (!session) return;
    setBusy(true); setNotice('');
    try {
      const result = await router.dhcpLeases(session);
      setRows(Array.isArray(result) ? result : result?.leases || result?.data || []);
    } catch (e: any) {
      setNotice(e?.message || 'Unable to load DHCP leases.');
    } finally { setBusy(false); }
  };

  useEffect(() => { void load(); }, [session]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return !q ? rows : rows.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [rows, query]);

  const status = (row: Row) => {
    if (String(row.disabled).toLowerCase() === 'true') return 'Disabled';
    return row.status || '—';
  };

  return <div className="stack">
    <div className="hero">
      <div><span className="eyebrow">NETWORK SERVICES</span><h3>DHCP Leases</h3><p>Inspect DHCP client leases from the active RouterOS instance.</p></div>
      <div className="top-actions"><button className="button" disabled={busy || !session} onClick={() => void load()}><RefreshCw size={15} className={busy ? 'spin' : ''}/> Refresh</button></div>
    </div>
    {notice && <div className="error banner">{notice}</div>}
    <section className="panel">
      <div className="panel-head"><div><h3><Network size={15}/> Lease Table</h3><span>{visible.length} of {rows.length} leases</span></div><span className="badge">{busy ? 'WORKING' : 'LIVE'}</span></div>
      <div className="table-controls"><div className="table-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search address, MAC, hostname, status..."/></div></div>
      <div className="table-wrap"><table><thead><tr><th>Address</th><th>MAC Address</th><th>Hostname</th><th>Server</th><th>Status</th><th>Expires After</th><th>Last Seen</th><th>Comment</th></tr></thead>
        <tbody>{visible.map((r, i) => <tr key={String(r.id || r.address || i)}><td><b>{r.address || '—'}</b></td><td>{r.macAddress || r.mac_address || '—'}</td><td>{r.hostName || r.host_name || '—'}</td><td>{r.server || '—'}</td><td>{status(r)}</td><td>{r.expiresAfter || r.expires_after || '—'}</td><td>{r.lastSeen || r.last_seen || '—'}</td><td>{r.comment || '—'}</td></tr>)}</tbody>
      </table>{!visible.length && <div className="empty">No DHCP leases found.</div>}</div>
    </section>
  </div>;
}
