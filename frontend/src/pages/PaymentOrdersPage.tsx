import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Eye, RefreshCw, Search, X } from 'lucide-react';
import { payment } from '../api';

type Row = Record<string, any>;
const statuses = ['', 'pending', 'paid', 'success', 'failed', 'expired'];

export default function PaymentOrdersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<Row>({});
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [detail, setDetail] = useState<Row | null>(null);

  const load = async (nextStatus = status) => {
    setBusy(true); setNotice('');
    try {
      const [list, summary] = await Promise.all([payment.list(nextStatus), payment.stats()]);
      setRows(Array.isArray(list) ? list : list?.orders || list?.payments || list?.data || []);
      setStats(summary || {});
    } catch (e: any) { setNotice(e?.message || 'Unable to load payment orders.'); }
    finally { setBusy(false); }
  };

  useEffect(() => { void load(''); }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return !q ? rows : rows.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [rows, query]);

  const check = async (id: string) => {
    setBusy(true); setNotice('');
    try { const result = await payment.check(id); await load(); setNotice(result?.message || `Payment ${id} checked.`); }
    catch (e: any) { setNotice(e?.message || 'Unable to check payment status.'); setBusy(false); }
  };

  const value = (r: Row, keys: string[]) => { for (const key of keys) if (r[key] !== undefined && r[key] !== null && r[key] !== '') return r[key]; return '—'; };

  return <div className="stack">
    <div className="hero"><div><span className="eyebrow">PAYMENT OPERATIONS</span><h3>Payment Orders</h3><p>Monitor payment orders, inspect details and re-check gateway status.</p></div><div className="top-actions"><button className="button" disabled={busy} onClick={() => void load()}><RefreshCw size={15} className={busy ? 'spin' : ''}/> Refresh</button></div></div>
    {notice && <div className="error banner">{notice}</div>}
    <div className="stats"><div className="stat"><div><span>Total</span><strong>{stats.total ?? rows.length}</strong></div></div><div className="stat"><div><span>Paid</span><strong>{stats.paid ?? stats.success ?? 0}</strong></div></div><div className="stat"><div><span>Pending</span><strong>{stats.pending ?? 0}</strong></div></div><div className="stat"><div><span>Failed</span><strong>{stats.failed ?? 0}</strong></div></div></div>
    <section className="panel"><div className="panel-head"><div><h3>Orders</h3><span>{visible.length} of {rows.length} records</span></div><span className="badge">{busy ? 'WORKING' : 'LIVE'}</span></div>
      <div className="table-controls"><div className="table-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search order, username, profile..."/></div><div className="panel-actions"><select value={status} onChange={e => { const next=e.target.value; setStatus(next); void load(next); }} aria-label="Payment status"><option value="">All statuses</option>{statuses.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}</select></div></div>
      <div className="table-wrap"><table><thead><tr><th>Order ID</th><th>Username</th><th>Profile</th><th>Amount</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>{visible.map((r,i)=>{const id=String(value(r,['orderId','id','order_id',`row-${i}`]));return <tr key={`${id}-${i}`}><td><b>{id}</b></td><td>{value(r,['username','user'])}</td><td>{value(r,['profile'])}</td><td>{value(r,['amount','price','total'])}</td><td>{value(r,['status','paymentStatus'])}</td><td>{value(r,['createdAt','created_at','date'])}</td><td><div className="row-actions"><button className="icon tiny" title="View" onClick={()=>setDetail(r)}><Eye size={14}/></button><button className="icon tiny" title="Check status" disabled={busy} onClick={()=>void check(id)}><CheckCircle2 size={14}/></button></div></td></tr>})}</tbody></table>{!visible.length&&<div className="empty">No payment orders found.</div>}</div>
    </section>
    {detail && <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><span className="eyebrow">PAYMENT DETAIL</span><h3>{String(value(detail,['orderId','id']))}</h3></div><button className="icon" onClick={()=>setDetail(null)}><X size={18}/></button></div><div className="table-wrap"><table><tbody>{Object.entries(detail).map(([k,v])=><tr key={k}><th>{k}</th><td>{typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')}</td></tr>)}</tbody></table></div></div></div>}
  </div>;
}
