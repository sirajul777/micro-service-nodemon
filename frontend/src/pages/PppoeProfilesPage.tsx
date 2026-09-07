import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, RefreshCw, Search, Server, Trash2, X } from 'lucide-react';
import { router } from '../api';
import '../pppoe-profiles-page.css';

type Profile = Record<string, any>;
type Props = { session: string };

const empty = {
  name: '',
  localAddress: '',
  remoteAddress: '',
  rateLimit: '',
  dns: '',
  bridge: '',
  onlyOne: '',
  changeTcpMss: '',
};

export default function PppoeProfilesPage({ session }: Props) {
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
      const result = await router.pppProfiles(session);
      setRows(Array.isArray(result) ? result : result?.profiles || result?.data || []);
    } catch (e: any) {
      setNotice(e?.message || 'Unable to load PPPoE profiles.');
    } finally { setBusy(false); }
  };

  useEffect(() => { setRows([]); setQuery(''); setNotice(''); setEditing(null); setForm({ ...empty }); void load(); }, [session]);
  const visible = useMemo(() => { const q = query.trim().toLowerCase(); return !q ? rows : rows.filter((row) => Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(q))); }, [rows, query]);
  const open = (row?: Profile) => {
    setEditing(row || null);
    setForm({
      ...empty,
      name: row?.name ?? '',
      localAddress: row?.localAddress ?? row?.local_address ?? '',
      remoteAddress: row?.remoteAddress ?? row?.remote_address ?? '',
      rateLimit: row?.rateLimit ?? row?.rate_limit ?? '',
      dns: row?.dns ?? '',
      bridge: row?.bridge ?? '',
      onlyOne: row?.onlyOne ?? row?.only_one ?? '',
      changeTcpMss: row?.changeTcpMss ?? row?.change_tcp_mss ?? '',
    });
  };
  const close = () => { setEditing(null); setForm({ ...empty }); };
  const save = async () => {
    if (!session || !form.name.trim()) { setNotice('Profile name is required.'); return; }
    setBusy(true); setNotice('');
    try {
      const body = {
        name: form.name.trim(),
        localAddress: form.localAddress.trim(),
        remoteAddress: form.remoteAddress.trim(),
        rateLimit: form.rateLimit.trim(),
        dns: form.dns.trim(),
        bridge: form.bridge.trim(),
        onlyOne: form.onlyOne.trim(),
        changeTcpMss: form.changeTcpMss.trim(),
      };
      const result = editing
        ? await router.updatePppProfile(session, String(editing.name), body)
        : await router.addPppProfile(session, body);
      if (result?.success === false) throw new Error(result.error || 'Operation failed.');
      const wasEditing = !!editing; close(); await load(); setNotice(wasEditing ? 'PPPoE profile updated.' : 'PPPoE profile created.');
    } catch (e: any) { setNotice(e?.message || 'Unable to save PPPoE profile.'); setBusy(false); }
  };
  const remove = async (name: string) => {
    if (!window.confirm(`Delete PPPoE profile \"${name}\"?`)) return;
    setBusy(true); setNotice('');
    try { const result = await router.deletePppProfile(session, name); if (result?.success === false) throw new Error(result.error || 'Delete failed.'); await load(); setNotice(`PPPoE profile ${name} deleted.`); }
    catch (e: any) { setNotice(e?.message || 'Unable to delete PPPoE profile.'); setBusy(false); }
  };
  const value = (primary: any, fallback?: any) => primary ?? fallback ?? '';
  const pill = (text: any, kind = '') => text ? <span className={`profile-pill ${kind}`}>{String(text)}</span> : <span className="profile-pill muted">—</span>;

  return <div className="stack pppoe-profiles-page">
    <div className="hero pppoe-hero"><div className="hero-copy"><span className="eyebrow">PPPOE MANAGEMENT</span><h3>PPPoE Profiles</h3><p>Manage RouterOS PPP profiles and connection policies.</p><div className="profile-summary"><span className="summary-chip"><Server size={12}/> {rows.length} profiles</span><span className="summary-chip">{busy ? 'Syncing data' : 'Ready'}</span></div></div><div className="top-actions"><button className="button" disabled={busy} onClick={() => void load()}><RefreshCw size={15} className={busy ? 'spin' : ''}/> Refresh</button><button className="button primary" disabled={busy} onClick={() => open()}><Plus size={15}/> Add Profile</button></div></div>
    {notice && <div className="error banner">{notice}</div>}
    <section className="panel"><div className="panel-head"><div><h3><Server size={15}/> Profiles</h3><span>{visible.length} of {rows.length} profiles</span></div><span className="badge">{busy ? 'WORKING' : 'LIVE'}</span></div>
      <div className="table-controls"><div className="table-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search PPPoE profiles..."/></div></div>
      <div className="table-wrap"><table className="profile-table"><thead><tr><th>Name</th><th>Local Address</th><th>Remote Address</th><th>Rate Limit</th><th>DNS</th><th>Bridge</th><th>Only One</th><th>Change TCP MSS</th><th>Actions</th></tr></thead><tbody>{visible.map((row, i) => { const name = String(row.name || i); return <tr key={name}><td><div className="profile-name"><span className="profile-dot"/><b>{name}</b></div></td><td className="profile-value">{value(row.localAddress, row.local_address) || '—'}</td><td className="profile-value">{value(row.remoteAddress, row.remote_address) || '—'}</td><td>{pill(value(row.rateLimit, row.rate_limit))}</td><td>{pill(row.dns)}</td><td>{pill(row.bridge)}</td><td>{pill(value(row.onlyOne, row.only_one), 'boolean')}</td><td>{pill(value(row.changeTcpMss, row.change_tcp_mss), 'boolean')}</td><td><div className="row-actions profile-actions"><button className="icon tiny" title="Edit" disabled={busy} onClick={() => open(row)}><Pencil size={14}/></button><button className="icon tiny danger" title="Delete" disabled={busy} onClick={() => void remove(name)}><Trash2 size={14}/></button></div></td></tr>; })}</tbody></table>{!visible.length && <div className="empty">No PPPoE profiles found.</div>}</div>
    </section>
    {editing !== null || form.name !== '' ? <Modal form={form} setForm={setForm} editing={editing} busy={busy} close={close} save={() => void save()} /> : null}
  </div>;
}

function Modal({ form, setForm, editing, busy, close, save }: { form: any; setForm: any; editing: Profile | null; busy: boolean; close: () => void; save: () => void }) {
  const field = (key: string, label: string, placeholder = '') => <label><span>{label}</span><input value={form[key] ?? ''} placeholder={placeholder} disabled={key === 'name' && !!editing} onChange={e => setForm((current: any) => ({ ...current, [key]: e.target.value }))}/></label>;
  return <div className="modal-backdrop"><div className="modal profile-modal"><div className="modal-head"><div><span className="eyebrow">PPPOE PROFILE</span><h3>{editing ? 'Edit Profile' : 'Add Profile'}</h3></div><button className="icon" onClick={close} aria-label="Close"><X size={18}/></button></div><div className="profile-modal-intro">Keep RouterOS values aligned with the profile policy used by your PPPoE subscribers.</div><form onSubmit={e => { e.preventDefault(); save(); }}><div className="form-grid profile-fields">{field('name', 'Name')}{field('rateLimit', 'Rate Limit', '10M/10M')}{field('localAddress', 'Local Address')}{field('remoteAddress', 'Remote Address')}{field('dns', 'DNS', '8.8.8.8,1.1.1.1')}{field('bridge', 'Bridge')}{field('onlyOne', 'Only One', 'yes/no')}{field('changeTcpMss', 'Change TCP MSS', 'yes/no')}</div><div className="modal-actions"><button type="button" className="button secondary" onClick={close}>Cancel</button><button className="button primary" disabled={busy}><Plus size={15}/>{editing ? 'Save Changes' : 'Create Profile'}</button></div></form></div></div>;
}
