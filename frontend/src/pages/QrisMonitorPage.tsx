import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, Clock3, RefreshCw, Search, XCircle } from 'lucide-react';
import { qris } from '../api';

type Row = Record<string, any>;
type Props = { data?: any; loading?: boolean };

export default function QrisMonitorPage({ data, loading: externalLoading }: Props) {
  const [stats, setStats] = useState<Row>(data?.[0] || {});
  const [orders, setOrders] = useState<Row[]>(Array.isArray(data?.[1]) ? data[1] : []);
  const [callbacks, setCallbacks] = useState<Row[]>(Array.isArray(data?.[2]) ? data[2] : []);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setBusy(true); setNotice('');
    try {
      const [nextStats, nextOrders, nextCallbacks] = await Promise.all([qris.stats(), qris.orders(), qris.callbacks(100)]);
      setStats(nextStats || {});
      setOrders(Array.isArray(nextOrders) ? nextOrders : nextOrders?.orders || nextOrders?.data || []);
      setCallbacks(Array.isArray(nextCallbacks) ? nextCallbacks : nextCallbacks?.callbacks || nextCallbacks?.data || []);
    } catch (e: any) {
      setNotice(e?.message || 'Unable to load QRIS monitor data.');
    } finally { setBusy(false); }
  };

  useEffect(() => { if (!data) void load(); }, [data]);

  const visibleOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((row) => {
      const matchesQuery = !q || Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(q));
      const rowStatus = String(row.status || row.paymentStatus || '').toLowerCase();
      const matchesStatus = !status || rowStatus === status;
      return matchesQuery && matchesStatus;
    });
  }, [orders, query, status]);

  const visibleCallbacks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return !q ? callbacks : callbacks.filter((row) => Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [callbacks, query]);

  const value = (row: Row, keys: string[]) => {
    for (const key of keys) if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
    return '—';
  };

  const success = stats?.success ?? stats?.paid ?? stats?.successful ?? 0;
  const pending = stats?.pending ?? stats?.processing ?? 0;
  const failed = stats?.failed ?? stats?.failure ?? 0;

  return <div className="stack">
    <div className="hero"><div><span className="eyebrow">PAYMENT OPERATIONS</span><h3>QRIS Monitor</h3><p>Monitor payment statistics, recent orders and callback events.</p></div><div className="top-actions"><button className="button" disabled={busy || !!externalLoading} onClick={() => void load()}><RefreshCw size={15} className={(busy || externalLoading) ? 'spin' : ''}/> Refresh</button></div></div>
    {notice && <div className="error banner">{notice}</div>}
    <div className="stats">
      <div className="stat"><div className="stat-icon"><BarChart3 size={18}/></div><div><span>Orders</span><strong>{orders.length}</strong></div></div>
      <div className="stat"><div className="stat-icon"><CheckCircle2 size={18}/></div><div><span>Success</span><strong>{success}</strong></div></div>
      <div className="stat"><div className="stat-icon"><Clock3 size={18}/></div><div><span>Pending</span><strong>{pending}</strong></div></div>
      <div className="stat"><div className="stat-icon"><XCircle size={18}/></div><div><span>Failed</span><strong>{failed}</strong></div></div>
    </div>
    <section className="panel"><div className="panel-head"><div><h3>QRIS Orders</h3><span>{visibleOrders.length} of {orders.length} orders</span></div><span className="badge">{(busy || externalLoading) ? 'WORKING' : 'LIVE'}</span></div>
      <div className="table-controls"><div className="table-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search order, reference, status..."/></div><select value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter order status"><option value="">All statuses</option><option value="paid">Paid</option><option value="success">Success</option><option value="pending">Pending</option><option value="processing">Processing</option><option value="failed">Failed</option></select></div>
      <div className="table-wrap"><table><thead><tr><th>Order</th><th>Reference</th><th>Amount</th><th>Status</th><th>Created</th></tr></thead><tbody>{visibleOrders.map((row, i) => <tr key={String(row.id || row.orderId || row.reference || i)}><td>{value(row, ['orderId','id','merchantOrderId'])}</td><td>{value(row, ['reference','qrReference','transactionId'])}</td><td>{value(row, ['amount','nominal','total'])}</td><td>{value(row, ['status','paymentStatus'])}</td><td>{value(row, ['createdAt','created_at','time'])}</td></tr>)}</tbody></table>{!visibleOrders.length && <div className="empty">No QRIS orders found.</div>}</div>
    </section>
    <section className="panel"><div className="panel-head"><div><h3>Callbacks</h3><span>{visibleCallbacks.length} of {callbacks.length} callback events</span></div><span className="badge">LIVE</span></div>
      <div className="table-wrap"><table><thead><tr><th>Time</th><th>Order</th><th>Status</th><th>Event</th></tr></thead><tbody>{visibleCallbacks.map((row, i) => <tr key={String(row.id || row.orderId || i)}><td>{value(row, ['createdAt','created_at','time','timestamp'])}</td><td>{value(row, ['orderId','merchantOrderId','reference'])}</td><td>{value(row, ['status','paymentStatus'])}</td><td className="code-cell">{value(row, ['event','message','payload','raw'])}</td></tr>)}</tbody></table>{!visibleCallbacks.length && <div className="empty">No QRIS callbacks found.</div>}</div>
    </section>
  </div>;
}
