import { useEffect, useMemo, useState } from 'react';
import { Edit3, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { router } from '../api';

type Row = Record<string, any>;

type Props = { session: string };

type Form = {
  name: string;
  price: string;
  sprice: string;
  validity: string;
  expmode: string;
  lockUser: string;
  'session-timeout': string;
  'idle-timeout': string;
  'rate-limit': string;
  'shared-users': string;
  'address-pool': string;
  profileColor: string;
  caption: string;
};

const emptyForm: Form = { name: '', price: '0', sprice: '0', validity: '1h', expmode: 'remc', lockUser: '', 'session-timeout': '', 'idle-timeout': '', 'rate-limit': '', 'shared-users': '1', 'address-pool': '', profileColor: '', caption: '' };

export default function HotspotProfilesPage({ session }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({ ...emptyForm });

  const load = async () => {
    if (!session) return;
    setBusy(true); setNotice('');
    try {
      const data = await router.hotspotProfiles(session);
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) { setNotice(e?.message || 'Unable to load hotspot profiles.'); }
    finally { setBusy(false); }
  };

  useEffect(() => { void load(); }, [session]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [rows, query]);

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm }); setShowForm(true); setNotice(''); };
  const openEdit = (row: Row) => {
    setEditing(String(row.name));
    setForm({
      name: String(row.name || ''), price: String(row.price ?? 0), sprice: String(row.sprice ?? 0), validity: String(row.validity ?? '1h'), expmode: String(row.expmode ?? 'remc'), lockUser: String(row.lockUser ?? ''),
      'session-timeout': String(row['session-timeout'] ?? row.sessionTimeout ?? ''), 'idle-timeout': String(row['idle-timeout'] ?? row.idleTimeout ?? ''), 'rate-limit': String(row['rate-limit'] ?? row.rateLimit ?? ''), 'shared-users': String(row['shared-users'] ?? row.sharedUsers ?? '1'), 'address-pool': String(row['address-pool'] ?? row.addressPool ?? ''), profileColor: String(row.profileColor ?? ''), caption: String(row.caption ?? ''),
    }); setShowForm(true); setNotice('');
  };

  const save = async () => {
    if (!session || !form.name.trim()) { setNotice('Profile name is required.'); return; }
    setBusy(true); setNotice('');
    const { name, ...body } = form;
    try {
      const result = editing ? await router.updateHotspotProfile(session, editing, body) : await router.addHotspotProfile(session, { name, ...body });
      if (result?.success === false) throw new Error(result.error || 'Profile save failed.');
      setShowForm(false); setEditing(null); setForm({ ...emptyForm }); await load(); setNotice(editing ? 'Hotspot profile updated.' : 'Hotspot profile created.');
    } catch (e: any) { setNotice(e?.message || 'Unable to save hotspot profile.'); setBusy(false); }
  };

  const remove = async (name: string) => {
    if (!window.confirm(`Delete hotspot profile "${name}"?`)) return;
    setBusy(true); setNotice('');
    try { const result = await router.deleteHotspotProfile(session, name); if (result?.success === false) throw new Error(result.error || 'Delete failed.'); await load(); setNotice(`Profile ${name} deleted.`); }
    catch (e: any) { setNotice(e?.message || 'Unable to delete hotspot profile.'); setBusy(false); }
  };

  return <div className="stack">
    <div className="hero"><div><span className="eyebrow">HOTSPOT MANAGEMENT</span><h3>Hotspot Profiles</h3><p>Manage pricing, validity, limits and RouterOS profile settings.</p></div><div className="top-actions"><button className="button" onClick={() => void load()} disabled={busy}><RefreshCw size={15} className={busy ? 'spin' : ''}/> Refresh</button><button className="button primary" onClick={openCreate} disabled={busy}><Plus size={15}/> Add Profile</button></div></div>
    {notice && <div className="error banner">{notice}</div>}
    <section className="panel"><div className="panel-head"><div><h3>Profiles</h3><span>{filtered.length} of {rows.length} profiles</span></div><span className="badge">{busy ? 'WORKING' : 'LIVE'}</span></div><div className="table-controls"><div className="table-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search profile, price, validity..."/></div></div><div className="table-wrap"><table><thead><tr><th>Name</th><th>Price</th><th>S.Price</th><th>Validity</th><th>Rate Limit</th><th>Shared</th><th>Pool</th><th>Caption</th><th>Actions</th></tr></thead><tbody>{filtered.map((r, i) => <tr key={String(r.name || i)}><td><b>{r.name || '—'}</b></td><td>Rp {Number(r.price || 0).toLocaleString('id-ID')}</td><td>Rp {Number(r.sprice || 0).toLocaleString('id-ID')}</td><td>{r.validity || '—'}</td><td>{r['rate-limit'] || r.rateLimit || '—'}</td><td>{r['shared-users'] || r.sharedUsers || '—'}</td><td>{r['address-pool'] || r.addressPool || '—'}</td><td>{r.caption || '—'}</td><td><div className="row-actions"><button className="icon tiny" title="Edit" disabled={busy} onClick={() => openEdit(r)}><Edit3 size={14}/></button><button className="icon tiny danger" title="Delete" disabled={busy} onClick={() => void remove(String(r.name))}><Trash2 size={14}/></button></div></td></tr>)}</tbody></table>{!filtered.length && <div className="empty">No hotspot profiles found.</div>}</div></section>
    {showForm && <ProfileModal form={form} setForm={setForm} editing={editing} busy={busy} onClose={() => setShowForm(false)} onSave={() => void save()} />}
  </div>;
}

function ProfileModal({ form, setForm, editing, busy, onClose, onSave }: { form: Form; setForm: (value: Form) => void; editing: string | null; busy: boolean; onClose: () => void; onSave: () => void }) {
  const field = (key: keyof Form, label: string, type = 'text', placeholder?: string) => <label><span>{label}</span><input type={type} value={form[key]} placeholder={placeholder} onChange={e => setForm({ ...form, [key]: e.target.value })} disabled={editing !== null && key === 'name'} /></label>;
  return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><span className="eyebrow">HOTSPOT PROFILE</span><h3>{editing ? 'Edit Profile' : 'Add Profile'}</h3></div><button className="icon" onClick={onClose}><X size={18}/></button></div><form onSubmit={e => { e.preventDefault(); onSave(); }}><div className="form-grid">{field('name','Name')}{field('price','Price','number')}{field('sprice','Selling Price','number')}{field('validity','Validity','text','1h / 1d')}{field('expmode','Expiry Mode')}{field('lockUser','Lock User')}{field('session-timeout','Session Timeout','text','00:00:00')}{field('idle-timeout','Idle Timeout','text','00:00:00')}{field('rate-limit','Rate Limit','text','2M/4M')}{field('shared-users','Shared Users','number')}{field('address-pool','Address Pool')}{field('profileColor','Profile Color','text','#1f6feb')}{field('caption','Caption')}</div><div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{editing ? 'Update Profile' : 'Create Profile'}</button></div></form></div></div>;
}
