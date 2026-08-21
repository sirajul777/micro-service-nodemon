import { useState } from 'react';
import { CheckCircle2, Eye, RefreshCw, Settings2 } from 'lucide-react';
import { payment } from './api';

type Item = Record<string, any>;

export default function PaymentPage({ kind, data, loading, onReload }: { kind: 'payments' | 'qris'; data: any; loading: boolean; onReload: () => void }) {
  const [selected, setSelected] = useState<Item | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const run = async (fn: () => Promise<any>) => {
    setBusy(true); setMessage('');
    try { const r = await fn(); if (r?.success === false) throw new Error(r.error || r.message || 'Operation failed'); setMessage('Operation completed'); await onReload(); }
    catch (e: any) { setMessage(e?.message || 'Operation failed'); }
    finally { setBusy(false); }
  };

  if (kind === 'payments') {
    const rows: Item[] = Array.isArray(data?.transactions) ? data.transactions : Array.isArray(data) ? data : [];
    return <div className="panel">
      <div className="panel-head"><div><h3>Payment Transactions</h3><span>{rows.length} transactions</span></div><div className="panel-actions"><select value={status} onChange={async e => { setStatus(e.target.value); setBusy(true); try { const r = await payment.list(e.target.value); (data as any).transactions = r?.transactions || r || []; onReload(); } finally { setBusy(false); } }}><option value="">All status</option><option value="pending">Pending</option><option value="success">Success</option><option value="failed">Failed</option></select><button className="icon" onClick={() => void run(async () => payment.list(status))}><RefreshCw size={16} className={loading || busy ? 'spin' : ''} /></button></div></div>
      {message && <div className="error banner">{message}</div>}
      <div className="table-wrap"><table><thead><tr>{['orderId','amount','status','profile','createdAt'].map(c => <th key={c}>{c}</th>)}<th>Actions</th></tr></thead><tbody>{rows.map((r,i) => <tr key={r.orderId || r.id || i}>{['orderId','amount','status','profile','createdAt'].map(c => <td key={c}>{formatCell(r?.[c])}</td>)}<td><button className="icon tiny" title="Check" onClick={() => void run(() => payment.check(String(r.orderId || r.id)))}><CheckCircle2 size={14}/></button><button className="icon tiny" title="Detail" onClick={async () => { try { setSelected(await payment.get(String(r.orderId || r.id))); } catch(e:any){ setMessage(e?.message || 'Unable to load detail'); } }}><Eye size={14}/></button></td></tr>)}</tbody></table>{!rows.length && <div className="empty">No payment transactions.</div>}</div>
      {selected && <DetailModal item={selected} onClose={() => setSelected(null)} />}
    </div>;
  }

  const [stats, orders, callbacks] = Array.isArray(data) ? data : [data?.stats || null, data?.orders || [], data?.callbacks || []];
  const rows: Item[] = Array.isArray(orders) ? orders : [];
  return <div className="stack">
    <div className="stats"><Metric title="Orders" value={stats?.totalOrders ?? rows.length} /><Metric title="Success" value={stats?.success ?? stats?.paid ?? '—'} /><Metric title="Pending" value={stats?.pending ?? '—'} /><Metric title="Callbacks" value={Array.isArray(callbacks) ? callbacks.length : '—'} /></div>
    <div className="panel"><div className="panel-head"><div><h3>QRIS Orders</h3><span>{rows.length} orders</span></div><div className="panel-actions"><select value={status} onChange={async e => { setStatus(e.target.value); setBusy(true); try { const r = await payment.listQrisOrders(e.target.value); (data as any).orders = r?.orders || r || []; onReload(); } finally { setBusy(false); } }}><option value="">All status</option><option value="pending">Pending</option><option value="paid">Paid</option><option value="failed">Failed</option></select><button className="icon" onClick={() => void run(() => payment.getQrisStats())}><RefreshCw size={16}/></button></div></div>
      {message && <div className="error banner">{message}</div>}
      <div className="table-wrap"><table><thead><tr>{['id','orderId','amount','status','createdAt'].map(c=><th key={c}>{c}</th>)}<th>Actions</th></tr></thead><tbody>{rows.map((r,i)=><tr key={r.id||r.orderId||i}>{['id','orderId','amount','status','createdAt'].map(c=><td key={c}>{formatCell(r?.[c])}</td>)}<td><button className="icon tiny" title="Status" onClick={()=>void run(()=>payment.getQrisStatus(String(r.id || r.orderId)))}><CheckCircle2 size={14}/></button><button className="icon tiny" title="Verify" onClick={()=>void run(()=>payment.verifyQrisOrder(String(r.id || r.orderId)))}><Settings2 size={14}/></button></td></tr>)}</tbody></table>{!rows.length&&<div className="empty">No QRIS orders.</div>}</div></div>
    </div>;
}

function DetailModal({ item, onClose }: { item: any; onClose: () => void }) { return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="modal"><div className="modal-head"><div><span className="eyebrow">PAYMENT DETAIL</span><h3>{item?.orderId || item?.id || 'Transaction'}</h3></div><button className="icon" onClick={onClose}>×</button></div><pre style={{whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{JSON.stringify(item,null,2)}</pre><div className="modal-actions"><button className="button secondary" onClick={onClose}>Close</button></div></div></div>; }
const Metric = ({ title, value }: { title: string; value: any }) => <div className="stat"><div><span>{title}</span><strong>{String(value)}</strong></div></div>;
const formatCell = (v:any) => v===undefined||v===null||v===''?'—':typeof v==='object'?JSON.stringify(v):String(v);
