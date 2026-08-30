import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Pencil, Plus, RefreshCw, Search, ShieldCheck, ShieldOff, Trash2, X } from 'lucide-react';
import { voucher } from '../api';

type Row = Record<string, any>;
const empty = { name: '', price: '', duration: '', profile: '', enabled: true, caption: '' };

export default function VoucherTypesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState({ ...empty });

  const load = async () => {
    setBusy(true); setNotice('');
    try {
      const result = await voucher.voucherTypes();
      setRows(Array.isArray(result) ? result : result?.types || result?.data || []);
    } catch (e: any) { setNotice(e?.message || 'Unable to load voucher types.'); }
    finally { setBusy(false); }
  };

  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => { const q = query.trim().toLowerCase(); return !q ? rows : rows.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q))); }, [rows, query]);
  const open = (row?: Row) => { setEditing(row || null); setForm({ ...empty, ...(row || {}) }); };
  const close = () => { setEditing(null); setForm({ ...empty }); };
  const save = async () => {
    if (!form.name.trim()) { setNotice('Voucher type name is required.'); return; }
    setBusy(true); setNotice('');
    try {
      const body = { ...form, price: form.price === '' ? undefined : Number(form.price) };
      const result = editing ? await voucher.updateVoucherType(String(editing.id), body) : await voucher.createVoucherType(body);
      if (result?.success === false) throw new Error(result.error || 'Operation failed.');
      const wasEditing = !!editing; close(); await load(); setNotice(wasEditing ? 'Voucher type updated.' : 'Voucher type created.');
    } catch (e: any) { setNotice(e?.message || 'Unable to save voucher type.'); setBusy(false); }
  };
  const remove = async (id: string) => {
    if (!window.confirm(`Delete voucher type "${id}"?`)) return;
    setBusy(true); setNotice('');
    try { const result = await voucher.deleteVoucherType(id); if (result?.success === false) throw new Error(result.error || 'Delete failed.'); await load(); setNotice('Voucher type deleted.'); }
    catch (e: any) { setNotice(e?.message || 'Unable to delete voucher type.'); setBusy(false); }
  };
  const toggle = async (row: Row) => {
    setBusy(true); setNotice('');
    try { const result = await voucher.toggleVoucherType(String(row.id)); if (result?.success === false) throw new Error(result.error || 'Toggle failed.'); await load(); setNotice('Voucher type state updated.'); }
    catch (e: any) { setNotice(e?.message || 'Unable to toggle voucher type.'); setBusy(false); }
  };
  return <div className="stack"><div className="hero"><div><span className="eyebrow">VOUCHER CATALOG</span><h3>Voucher Types</h3><p>Manage commercial voucher definitions and availability.</p></div><div className="top-actions"><button className="button" disabled={busy} onClick={() => void load()}><RefreshCw size={15} className={busy ? 'spin' : ''}/> Refresh</button><button className="button primary" disabled={busy} onClick={() => open()}><Plus size={15}/> Add Type</button></div></div>{notice && <div className="error banner">{notice}</div>}<section className="panel"><div className="panel-head"><div><h3><BarChart3 size={15}/> Types</h3><span>{visible.length} of {rows.length} voucher types</span></div><span className="badge">{busy ? 'WORKING' : 'LIVE'}</span></div><div className="table-controls"><div className="table-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, profile, duration..."/></div></div><div className="table-wrap"><table><thead><tr><th>Name</th><th>Price</th><th>Duration</th><th>Profile</th><th>Enabled</th><th>Caption</th><th>Actions</th></tr></thead><tbody>{visible.map((r,i) => { const id = String(r.id ?? r.name ?? i); const enabled = !(r.enabled === false || String(r.enabled).toLowerCase() === 'false'); return <tr key={id}><td><b>{r.name || id}</b></td><td>{r.price ?? '—'}</td><td>{r.duration || '—'}</td><td>{r.profile || '—'}</td><td>{enabled ? 'Yes' : 'No'}</td><td>{r.caption || '—'}</td><td><div className="row-actions"><button className="icon tiny" title="Edit" disabled={busy} onClick={() => open(r)}><Pencil size={14}/></button><button className="icon tiny" title={enabled ? 'Disable' : 'Enable'} disabled={busy} onClick={() => void toggle(r)}>{enabled ? <ShieldOff size={14}/> : <ShieldCheck size={14}/>}</button><button className="icon tiny danger" title="Delete" disabled={busy} onClick={() => void remove(id)}><Trash2 size={14}/></button></div></td></tr>; })}</tbody></table>{!visible.length && <div className="empty">No voucher types found.</div>}</div></section>{editing !== null || form.name !== '' ? <Modal form={form} setForm={setForm} editing={editing} busy={busy} close={close} save={() => void save()} /> : null}</div>;
}
function Modal({ form, setForm, editing, busy, close, save }: any) { const field = (key: string, label: string, placeholder = '') => <label><span>{label}</span><input value={form[key] ?? ''} placeholder={placeholder} onChange={e => setForm((f: any) => ({ ...f, [key]: e.target.value }))}/></label>; return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><span className="eyebrow">VOUCHER TYPE</span><h3>{editing ? 'Edit Type' : 'Add Type'}</h3></div><button className="icon" onClick={close}><X size={18}/></button></div><form onSubmit={e => { e.preventDefault(); save(); }}><div className="form-grid">{field('name','Name')}{field('price','Price','10000')}{field('duration','Duration','1h')}{field('profile','Profile')}{field('caption','Caption')}<label><span>Enabled</span><input type="checkbox" checked={!!form.enabled} onChange={e => setForm((f: any) => ({ ...f, enabled: e.target.checked }))}/></label></div><div className="modal-actions"><button type="button" className="button secondary" onClick={close}>Cancel</button><button className="button primary" disabled={busy}>{editing ? 'Save Changes' : 'Create Type'}</button></div></form></div></div>; }
