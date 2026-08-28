import { useEffect, useMemo, useState } from 'react';
import { Network, Plus, RefreshCw, Search, Trash2, X, Pencil } from 'lucide-react';
import { router } from '../api';

type Profile = Record<string, any>;
type Props = { session: string };
const empty = { name: '', rateLimit: '', sharedUsers: '', addressPool: '', sessionTimeout: '', idleTimeout: '', price: '', validity: '', expiryMode: '', lockUser: false, caption: '', color: '#2563eb' };

export default function HotspotProfilesPage({ session }: Props) {
  const [rows, setRows] = useState<Profile[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<Profile | null>(null);
  const [form, setForm] = useState({ ...empty });

  const load = async () => {
    if (!session) return;
    setBusy(true); setNotice('');
    try {
      const r = await router.hotspotProfiles(session);
      setRows(Array.isArray(r) ? r : r?.profiles || r?.data || []);
    } catch (e: any) {
      setNotice(e?.message || 'Unable to load profiles.');
    } finally { setBusy(false); }
  };

  useEffect(() => { void load(); }, [session]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return !q ? rows : rows.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [rows, query]);

  const open = (row?: Profile) => {
    setEditing(row || null);
    setForm({ ...empty, ...(row || {}) });
  };

  const close = () => { setEditing(null); setForm({ ...empty }); };

  const save = async () => {
    if (!session || !form.name.trim()) { setNotice('Profile name is required.'); return; }
    setBusy(true); setNotice('');
    try {
      const body = { ...form, sharedUsers: form.sharedUsers ? Number(form.sharedUsers) : undefined };
      const result = editing
        ? await router.updateHotspotProfile(session, String(editing.name), body)
        : await router.addHotspotProfile(session, body);
      if (result?.success === false) throw new Error(result.error || 'Operation failed.');
      const wasEditing = !!editing;
      close();
      await load();
      setNotice(wasEditing ? 'Profile updated.' : 'Profile created.');
    } catch (e: any) {
      setNotice(e?.message || 'Unable to save profile.');
      setBusy(false);
    }
  };

  const remove = async (name: string) => {
    if (!window.confirm(`Delete hotspot profile "${name}"?`)) return;
    setBusy(true); setNotice('');
    try {
      const result = await router.deleteHotspotProfile(session, name);
      if (result?.success === false) throw new Error(result.error || 'Delete failed.');
      await load(); setNotice(`Profile ${name} deleted.`);
    } catch (e: any) {
      setNotice(e?.message || 'Unable to delete profile.'); setBusy(false);
    }
  };

  return <div className="stack">
    <div className="hero">
      <div><span className="eyebrow">HOTSPOT MANAGEMENT</span><h3>Hotspot Profiles</h3><p>Manage RouterOS profiles and commercial metadata.</p></div>
      <div className="top-actions">
        <button className="button" disabled={busy} onClick={() => void load()}><RefreshCw size={15} className={busy ? 'spin' : ''}/> Refresh</button>
        <button className="button primary" disabled={busy} onClick={() => open()}><Plus size={15}/> Add Profile</button>
      </div>
    </div>
    {notice && <div className="error banner">{notice}</div>}
    <section className="panel">
      <div className="panel-head">
        <div><h3><Network size={15}/> Profiles</h3><span>{visible.length} of {rows.length} profiles</span></div>
        <span className="badge">{busy ? 'WORKING' : 'LIVE'}</span>
      </div>
      <div className="table-controls">
        <div className="table-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search profiles..."/></div>
      </div>
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Rate Limit</th><th>Shared Users</th><th>Address Pool</th><th>Session Timeout</th><th>Price</th><th>Validity</th><th>Actions</th></tr></thead>
        <tbody>{visible.map((r, i) => { const name = String(r.name || i); return <tr key={name}><td><b>{name}</b></td><td>{r.rateLimit || '—'}</td><td>{r.sharedUsers ?? '—'}</td><td>{r.addressPool || '—'}</td><td>{r.sessionTimeout || '—'}</td><td>{r.price ?? '—'}</td><td>{r.validity || '—'}</td><td><div className="row-actions"><button className="icon tiny" title="Edit" disabled={busy} onClick={() => open(r)}><Pencil size={14}/></button><button className="icon tiny danger" title="Delete" disabled={busy} onClick={() => void remove(name)}><Trash2 size={14}/></button></div></td></tr>; })}</tbody>
      </table>{!visible.length && <div className="empty">No hotspot profiles found.</div>}</div>
    </section>
    {editing !== null || form.name !== '' ? <Modal form={form} setForm={setForm} editing={editing} busy={busy} close={close} save={() => void save()} /> : null}
  </div>;
}

function Modal({ form, setForm, editing, busy, close, save }: { form: any; setForm: any; editing: Profile | null; busy: boolean; close: () => void; save: () => void }) {
  const field = (key: string, label: string, placeholder = '') => <label><span>{label}</span><input value={form[key] ?? ''} placeholder={placeholder} disabled={key === 'name' && !!editing} onChange={e => setForm((f: any) => ({ ...f, [key]: e.target.value }))}/></label>;
  return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><span className="eyebrow">HOTSPOT PROFILE</span><h3>{editing ? 'Edit Profile' : 'Add Profile'}</h3></div><button className="icon" onClick={close}><X size={18}/></button></div>
    <form onSubmit={e => { e.preventDefault(); save(); }}><div className="form-grid">
      {field('name', 'Name')}{field('rateLimit', 'Rate Limit', '10M/10M')}{field('sharedUsers', 'Shared Users', '1')}{field('addressPool', 'Address Pool')}{field('sessionTimeout', 'Session Timeout', '1h')}{field('idleTimeout', 'Idle Timeout', '5m')}{field('price', 'Price', '0')}{field('validity', 'Validity', '1d')}{field('expiryMode', 'Expiry Mode')}{field('caption', 'Caption')}{field('color', 'Color', '#2563eb')}
      <label><span>Lock User</span><input type="checkbox" checked={!!form.lockUser} onChange={e => setForm((f: any) => ({ ...f, lockUser: e.target.checked }))}/></label>
    </div><div className="modal-actions"><button type="button" className="button secondary" onClick={close}>Cancel</button><button className="button primary" disabled={busy}><Plus size={15}/>{editing ? 'Save Changes' : 'Create Profile'}</button></div></form>
  </div></div>;
}
