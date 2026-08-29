import { useEffect, useMemo, useState } from 'react';
import { Activity, Pause, Play, RefreshCw, Search } from 'lucide-react';
import { router } from '../api';

type Row = Record<string, any>;
type Props = { session: string };

export default function InterfaceTrafficPage({ session }: Props) {
  const [interfaces, setInterfaces] = useState<Row[]>([]);
  const [selected, setSelected] = useState('');
  const [traffic, setTraffic] = useState<Row | null>(null);
  const [query, setQuery] = useState('');
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const loadInterfaces = async () => {
    if (!session) return;
    try {
      const result = await router.interfaces(session);
      const rows = Array.isArray(result) ? result : result?.interfaces || result?.data || [];
      setInterfaces(rows);
      if (!selected && rows[0]?.name) setSelected(String(rows[0].name));
    } catch (e: any) {
      setNotice(e?.message || 'Unable to load interfaces.');
    }
  };

  const loadTraffic = async () => {
    if (!session || !selected || paused) return;
    setBusy(true);
    try {
      const result = await router.interfaceTraffic(session, selected);
      setTraffic(result?.traffic || result?.data || result || null);
      setNotice('');
    } catch (e: any) {
      setNotice(e?.message || 'Unable to load interface traffic.');
    } finally { setBusy(false); }
  };

  useEffect(() => { void loadInterfaces(); }, [session]);
  useEffect(() => {
    if (!session || !selected) return;
    void loadTraffic();
    if (paused) return;
    const timer = window.setInterval(() => { void loadTraffic(); }, 5000);
    return () => window.clearInterval(timer);
  }, [session, selected, paused]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return !q ? interfaces : interfaces.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [interfaces, query]);

  const field = (keys: string[]) => {
    for (const key of keys) if (traffic?.[key] !== undefined && traffic?.[key] !== null && traffic?.[key] !== '') return traffic[key];
    return '—';
  };

  return <div className="stack">
    <div className="hero">
      <div><span className="eyebrow">LIVE TELEMETRY</span><h3>Interface Traffic</h3><p>Realtime RouterOS interface traffic with a 5-second refresh cycle.</p></div>
      <div className="top-actions">
        <button className="button" disabled={busy || !selected} onClick={() => void loadTraffic()}><RefreshCw size={15} className={busy ? 'spin' : ''}/> Refresh</button>
        <button className="button" disabled={!selected} onClick={() => setPaused(v => !v)}>{paused ? <Play size={15}/> : <Pause size={15}/>} {paused ? 'Resume' : 'Pause'}</button>
      </div>
    </div>
    {notice && <div className="error banner">{notice}</div>}
    <section className="panel">
      <div className="panel-head"><div><h3><Activity size={15}/> Interface Monitor</h3><span>{paused ? 'Paused' : 'Live · 5s'}</span></div><span className="badge">{busy ? 'WORKING' : paused ? 'PAUSED' : 'LIVE'}</span></div>
      <div className="table-controls">
        <div className="table-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search interface, type, MAC..."/></div>
        <div className="panel-actions"><select value={selected} onChange={e => { setSelected(e.target.value); setTraffic(null); }}><option value="">— Select Interface —</option>{visible.map((r, i) => <option key={String(r.name || i)} value={String(r.name || '')}>{r.name || r.id || `Interface ${i + 1}`}</option>)}</select></div>
      </div>
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Type</th><th>MAC Address</th><th>Running</th><th>TX</th><th>RX</th></tr></thead><tbody>{visible.map((r, i) => { const name = String(r.name || r.id || i); const active = name === selected; return <tr key={name} className={active ? 'active-row' : ''}><td><b>{name}</b></td><td>{r.type || '—'}</td><td>{r.macAddress || r.mac_address || '—'}</td><td>{String(r.running).toLowerCase() === 'true' ? 'Yes' : String(r.running).toLowerCase() === 'false' ? 'No' : r.running || '—'}</td><td>{r.tx || '—'}</td><td>{r.rx || '—'}</td></tr>; })}</tbody></table>{!visible.length && <div className="empty">No interfaces found.</div>}</div>
    </section>
    <section className="panel">
      <div className="panel-head"><div><h3>Realtime Counters</h3><span>{selected || 'Select an interface'}</span></div><span className="badge">{paused ? 'PAUSED' : '5s'}</span></div>
      {!selected ? <div className="empty">Select an interface to view realtime traffic.</div> : <div className="stats"><div className="stat"><div><span>TX</span><strong>{field(['tx', 'txRate', 'tx_rate', 'txBps'])}</strong></div></div><div className="stat"><div><span>RX</span><strong>{field(['rx', 'rxRate', 'rx_rate', 'rxBps'])}</strong></div></div><div className="stat"><div><span>Total TX</span><strong>{field(['txBytes', 'tx_bytes', 'bytesOut'])}</strong></div></div><div className="stat"><div><span>Total RX</span><strong>{field(['rxBytes', 'rx_bytes', 'bytesIn'])}</strong></div></div></div>}
    </section>
  </div>;
}
