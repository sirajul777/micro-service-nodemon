import { useEffect, useState } from 'react';
import { Plus, RefreshCw, Search, Trash2, X, Pencil } from 'lucide-react';
import { router } from '../api';

type Row = Record<string, any>;
type Session = { id: string; name?: string; ip?: string; port?: number };
const empty = { name: '', localAddress: '', remoteAddress: '', rateLimit: '', dns: '' };

export default function PppoeProfilesPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [session, setSession] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({ ...empty });
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const loadSessions = async () => {
    const r = await router.sessions();
    const list = (r?.sessions ?? r ?? []) as Session[];
    setSessions(list);
    if (!session && list[0]?.id) setSession(list[0].id);
  };
  const load = async () => {
    if (!session) return;
    setBusy(true); setNotice('');
    try { const r = await router.pppProfiles(session); setRows(Array.isArray(r) ? r : (r?.profiles ?? r?.data ?? [])); }
    catch (e: any) { setNotice(e?.message || 'Unable to load PPPoE profiles.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { void loadSessions(); }, []);
  useEffect(() => { void load(); }, [session]);

  const visible = rows.filter(r => !query.trim() || Object.values(r).some(v => String(v ?? '').toLowerCase().includes(query.trim().toLowerCase())));
  const submit = async () => {
    if (!session || !form.name.trim()) { setNotice('Profile name is required.'); return; }
    setBusy(true); setNotice('');
    try {
      const result = editing ? await router.updatePppProfile(session, editing, form) : await router.addPppProfile(session, form);
      if (result?.success === false) throw new Error(result.error || 'Operation failed.');
      setOpen(false); setEditing(null); setForm({ ...empty }); await load(); setNotice(editing ? 'Profile updated.' : 'Profile created.');
    } catch (e: any) { setNotice(e?.message || 'Unable to save profile.'); setBusy(false); }
  };
  const remove = async (name: string) => {
    if (!window.confirm(`Delete PPPoE profile "${name}"?`)) return;
    setBusy(true); setNotice('');
    try { const r = await router.deletePppProfile(session, name); if (r?.success === false) throw new Error(r.error || 'Delete failed.'); await load(); setNotice('Profile deleted.'); }
    catch (e: any) { setNotice(e?.message || 'Unable to delete profile.'); setBusy(false); }
  };
  const edit = (r: Row) => { setEditing(String(r.name)); setForm({ name: String(r.name || ''), localAddress: String(r.localAddress || ''), remoteAddress: String(r.remoteAddress || ''), rateLimit: String(r.rateLimit || ''), dns: String(r.dns || '') }); setOpen(true); };

  return <div className="panel"><div className="panel-head"><div><span className="eyebrow">PPPoE MANAGEMENT</span><h3>PPPoE Profiles</h3><span>{visible.length} of {rows.length} profiles</span></div><span className="badge">{busy ? 'WORKING' : 'LIVE'}</span></div>
    {notice && <div className="error banner">{notice}</div>}
    <div className="table-controls"><div className="table-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search profiles..."/></div><div className="panel-actions"><select value={session} onChange={e => setSession(e.target.value)}>{sessions.map(s => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}</select><button className="button" onClick={() => void load()} disabled={busy}><RefreshCw size={15}/> Refresh</button><button className="button primary" onClick={() => { setEditing(null); setForm({ ...empty }); setOpen(true); }} disabled={busy}><Plus size={15}/> Add Profile</button></div></div>
    <div className="table-wrap"><table><thead><tr><th>Name</th><th>Local Address</th><th>Remote Address</th><th>Rate Limit</th><th>DNS</th><th>Actions</th></tr></thead><tbody>{visible.map((r, i) => { const name = String(r.name || i); return <tr key={name}><td><b>{name}</b></td><td>{r.localAddress || '—'}</td><td>{r.remoteAddress || '—'}</td><td>{r.rateLimit || '—'}</td><td>{r.dns || '—'}</td><td><button className="icon tiny" title="Edit" onClick={() => edit(r)} disabled={busy}><Pencil size={14}/></button><button className="icon tiny danger" title="Delete" onClick={() => void remove(name)} disabled={busy}><Trash2 size={14}/></button></td></tr>; })}</tbody></table>{!visible.length && <div className="empty">No PPPoE profiles found.</div>}</div>
    {open && <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><span className="eyebrow">PPPoE PROFILE</span><h3>{editing ? 'Edit Profile' : 'Add Profile'}</h3></div><button className="icon" onClick={() => setOpen(false)}><X size={18}/></button></div><div className="form-grid">{Object.entries(form).map(([key, value]) => <label key={key}><span>{key.replace(/([A-Z])/g, ' $1')}</span><input value={value} disabled={key === 'name' && !!editing} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}/></label>)}</div><div className="modal-actions"><button className="button secondary" onClick={() => setOpen(false)}>Cancel</button><button className="button primary" onClick={() => void submit()} disabled={busy}>{editing ? 'Save Changes' : 'Create Profile'}</button></div></div></div>}
  </div>;
}
