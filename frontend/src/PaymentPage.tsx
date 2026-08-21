import { useEffect, useState } from 'react';
import { CheckCircle2, Eye, RefreshCw } from 'lucide-react';
import { payment } from './api';

type Item = Record<string, any>;

export default function PaymentPage({ kind }: { kind: 'payments' | 'qris' }) {
  const [data, setData] = useState<any>(null); const [selected, setSelected] = useState<Item | null>(null);
  const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');

  const load = async () => { setBusy(true); setMessage(''); try {
    if (kind === 'payments') setData(await payment.list(status));
    else { const [stats, orders, callbacks] = await Promise.all([payment.getQrisStats(), payment.listQrisOrders(status), payment.callbacks(100)]); setData({ stats, orders, callbacks }); }
  } catch (e: any) { setMessage(e?.message || 'Unable to load data'); } finally { setBusy(false); } };
  useEffect(() => { void load(); }, [kind]);

  const run = async (fn: () => Promise<any>) => { setBusy(true); setMessage(''); try { const r = await fn(); if (r?.success === false) throw new Error(r.error || r.message || 'Operation failed'); setMessage('Operation completed'); await load(); } catch (e: any) { setMessage(e?.message || 'Operation failed'); } finally { setBusy(false); } };

  if (kind === 'payments') {
    const rows: Item[] = Array.isArray(data?.transactions) ? data.transactions : Array.isArray(data) ? data : [];
    return <div className="panel"><div className="panel-head"><div><h3>Payment Transactions</h3><span>{rows.length} transactions</span></div><div className="panel-actions"><select value={status} onChange={async e => { setStatus(e.target.value); setBusy(true); try { setData(await payment.list(e.target.value)); } catch (err: any) { setMessage(err?.message || 'Unable to load'); } finally { setBusy(false); } }}><option value="">All status</option><option value="pending">Pending</option><option value="success">Success</option><option value="failed">Failed</option></select><button className="icon" onClick={() => void load()}><RefreshCw size={16} className={busy ? 'spin' : ''} /></button></div></div>{message && <div className="error banner">{message}</div>}<div className="table-wrap"><table><thead><tr>{['orderId','amount','status','profile','createdAt'].map(c => <th key={c}>{c}</th>)}<th>Actions</th></tr></thead><tbody>{rows.map((r,i) => <tr key={r.orderId || r.id || i}>{['orderId','amount','status','profile','createdAt'].map(c => <td key={c}>{formatCell(r?.[c])}</td>)}<td><button className="icon tiny" title="Check" onClick={() => void run(() => payment.check(String(r.orderId || r.id)))}><CheckCircle2 size={14}/></button><button className="icon tiny" title="Detail" onClick={async () => { try { setSelected(await payment.get(String(r.orderId || r.id))); } catch(e:any) { setMessage(e?.message || 'Unable to load detail'); } }}><Eye size={14}/></button></td></tr>)}</tbody></table>{!rows.length && <div className="empty">No payment transactions.</div>}</div>{selected && <DetailModal item={selected} onClose={() => setSelected(null)} />}</div>;
  }

  const stats = data?.stats || null; const rows: Item[] = Array.isArray(data?.orders) ? data.orders : []; const callbacks = Array.isArray(data?.callbacks) ? data.callbacks : [];
  return <div><div className="stats"><Metric title="Orders" value={stats?.totalOrders ?? rows.length} /><Metric title="Success" value={stats?.success ?? stats?.paid ?? '—'} /><Metric title="Pending" value={stats?.pending ?? '—'} /><Metric title="Callbacks" value={callbacks.length} /></div><div className="panel"><div className="panel-head"><div><h3>QRIS Orders</h3><span>{rows.length} orders</span></div><div className="panel-actions"><select value={status} onChange={async e => { setStatus(e.target.value); setBusy(true); try { const orders = await payment.listQrisOrders(e.target.value); setData((old:any) => ({ ...old, orders: orders?.orders || orders || [] })); } catch(err:any) { setMessage(err?.message || 'Unable to load'); } finally { setBusy(false); } }}><option value="">All status</option><option value="pending">Pending</option><option value="paid">Paid</option><option value="failed">Failed</option></select><button className="icon" onClick={() => void load()}><RefreshCw size={16} className={busy ? 'spin' : ''}/></button></div></div>{message && <div className="error banner">{message}</div>}<div className="table-wrap"><table><thead><tr>{['id','orderId','amount','status','createdAt'].map(c=><th key={c}>{c}</th>)}<th>Actions</th></tr></thead><tbody>{rows.map((r,i)=><tr key={r.id||r.orderId||i}>{['id','orderId','amount','status','createdAt'].map(c=><td key={c}>{formatCell(r?.[c])}</td>)}<td><button className="icon tiny" title="Status" onClick={()=>void run(()=>payment.getQrisStatus(String(r.id || r.orderId)))}><CheckCircle2 size={14}/></button></td></tr>)}</tbody></table>{!rows.length&&<div className="empty">No QRIS orders.</div>}</div></div></div>;
}

function DetailModal({ item, onClose }: { item: any; onClose: () => void }) { return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="modal"><div className="modal-head"><div><span className="eyebrow">PAYMENT DETAIL</span><h3>{item?.orderId || item?.id || 'Transaction'}</h3></div><button className="icon" onClick={onClose}>×</button></div><pre style={{whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{JSON.stringify(item,null,2)}</pre><div className="modal-actions"><button className="button secondary" onClick={onClose}>Close</button></div></div></div>; }
const Metric = ({ title, value }: { title: string; value: any }) => <div className="stat"><div><span>{title}</span><strong>{String(value)}</strong></div></div>;
const formatCell = (v:any) => v===undefined||v===null||v===''?'—':typeof v==='object'?JSON.stringify(v):String(v);
