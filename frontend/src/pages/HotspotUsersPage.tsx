import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Search, Trash2, Users, X } from 'lucide-react';
import { router } from '../api';

type Row = Record<string, any>;

type Props = { session: string };

const emptyForm = { name: '', password: '', profile: '', comment: '', limitUptime: '' };

export default function HotspotUsersPage({ session }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async () => {
    if (!session) return;
    setBusy(true); setNotice('');
    try {
      const data = await router.hotspotUsers(session, 'all');
      setRows(Array.isArray(data) ? data : []);
      setSelected([]);
    } catch (e: any) { setNotice(e?.message || 'Unable to load hotspot users.'); }
    finally { setBusy(false); }
  };

  useEffect(() => { void load(); }, [session]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [rows, query]);

  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selected.includes(String(r.name)));
  const toggle = (name: string) => setSelected((current) => current.includes(name) ? current.filter((v) => v !== name) : [...current, name]);

  const save = async () => {
    if (!session || !form.name.trim()) { setNotice('Username is required.'); return; }
    setBusy(true); setNotice('');
    try {
      const result = await router.addHotspotUser(session, form);
      if (result?.success === false) throw new Error(result.error || 'Failed to create user.');
      setForm({ ...emptyForm }); setShowForm(false); await load(); setNotice('Hotspot user created.');
    } catch (e: any) { setNotice(e?.message || 'Unable to create hotspot user.'); setBusy(false); }
  };

  const removeOne = async (name: string) => {
    if (!window.confirm(`Delete hotspot user "${name}"?`)) return;
    setBusy(true); setNotice('');
    try {
      const result = await router.removeHotspotUser(session, name);
      if (result?.success === false) throw new Error(result.error || 'Delete failed.');
      await load(); setNotice(`User ${name} deleted.`);
    } catch (e: any) { setNotice(e?.message || 'Unable to delete hotspot user.'); setBusy(false); }
  };

  const removeSelected = async () => {
    if (!selected.length) return;
    if (!window.confirm(`Delete ${selected.length} selected hotspot user(s)?`)) return;
    setBusy(true); setNotice('');
    try {
      const result = await router.bulkRemoveHotspotUsers(session, selected);
      if (result?.success === false) throw new Error(result.error || 'Bulk delete failed.');
      await load(); setNotice(`Removed ${result?.removed ?? selected.length} user(s).`);
    } catch (e: any) { setNotice(e?.message || 'Unable to delete selected users.'); setBusy(false); }
  };

  return <div className="stack">
    <div className="hero">
      <div><span className="eyebrow">HOTSPOT MANAGEMENT</span><h3>Hotspot Users</h3><p>Manage RouterOS hotspot accounts for the active router.</p></div>
      <div className="top-actions"><button className="button" onClick={() => void load()} disabled={busy}><RefreshCw size={15} className={busy ? 'spin' : ''}/> Refresh</button><button className="button primary" onClick={() => setShowForm(true)} disabled={busy}><Plus size={15}/> Add User</button></div>
    </div>
    {notice && <div className="error banner">{notice}</div>}
    <section className="panel">
      <div className="panel-head"><div><h3><Users size={15}/> User Accounts</h3><span>{filtered.length} of {rows.length} users</span></div><span className="badge">{busy ? 'WORKING' : 'LIVE'}</span></div>
      <div className="table-controls">
        <div className="table-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, profile, comment..."/></div>
        <div className="panel-actions"><button className="button secondary" disabled={!selected.length || busy} onClick={() => void removeSelected()}><Trash2 size={14}/> Delete Selected ({selected.length})</button></div>
      </div>
      <div className="table-wrap"><table><thead><tr><th style={{width:42}}><input type="checkbox" checked={allVisibleSelected} onChange={() => setSelected(allVisibleSelected ? [] : filtered.map(r => String(r.name)).filter(Boolean))}/></th><th>Name</th><th>Profile</th><th>Comment</th><th>Limit Uptime</th><th>Disabled</th><th>Actions</th></tr></thead>
      <tbody>{filtered.map((r, i) => { const name = String(r.name || `row-${i}`); return <tr key={name}><td><input type="checkbox" checked={selected.includes(name)} onChange={() => toggle(name)}/></td><td><b>{name}</b></td><td>{r.profile || '—'}</td><td>{r.comment || '—'}</td><td>{r.limitUptime || '—'}</td><td>{String(r.disabled) === 'true' || r.disabled === true ? 'Yes' : 'No'}</td><td><button className="icon tiny danger" title="Delete" disabled={busy} onClick={() => void removeOne(name)}><Trash2 size={14}/></button></td></tr>; })}</tbody></table>{!filtered.length && <div className="empty">No hotspot users found.</div>}</div>
    </section>
    {showForm && <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><span className="eyebrow">HOTSPOT USER</span><h3>Add User</h3></div><button className="icon" onClick={() => setShowForm(false)}><X size={18}/></button></div><form onSubmit={e => { e.preventDefault(); void save(); }}><div className="form-grid"><Field label="Username" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))}/><Field label="Password" value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} type="password"/><Field label="Profile" value={form.profile} onChange={v => setForm(f => ({ ...f, profile: v }))}/><Field label="Limit Uptime" value={form.limitUptime} onChange={v => setForm(f => ({ ...f, limitUptime: v }))} placeholder="1h / 1d"/><Field label="Comment" value={form.comment} onChange={v => setForm(f => ({ ...f, comment: v }))}/></div><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setShowForm(false)}>Cancel</button><button className="button primary" disabled={busy}><Plus size={15}/> Create User</button></div></form></div></div>}
  </div>;
}

function Field({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) { return <label><span>{label}</span><input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}/></label>; }
