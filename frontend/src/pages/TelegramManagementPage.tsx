import { useEffect, useState } from 'react';

const request = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(path, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
  return res.status === 204 ? null : res.json();
};

type Config = Record<string, any>;

export default function TelegramManagementPage() {
  const [configs, setConfigs] = useState<Config[]>([]);
  const [logs, setLogs] = useState<Config[]>([]);
  const [selected, setSelected] = useState<Config | null>(null);
  const [form, setForm] = useState<Config>({ name: '', botToken: '', chatId: '', enabled: true });
  const [message, setMessage] = useState('Test dari NodeMon');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const load = async () => { setBusy(true); setNotice(''); try { const [c, l] = await Promise.all([request('/api/telegram/config'), request('/api/telegram/logs')]); setConfigs(Array.isArray(c) ? c : []); setLogs(Array.isArray(l) ? l : []); } catch (e: any) { setNotice(e?.message || 'Unable to load Telegram data.'); } finally { setBusy(false); } };
  useEffect(() => { void load(); }, []);
  const edit = (cfg: Config) => { setSelected(cfg); setForm({ ...cfg }); };
  const save = async () => { setBusy(true); setNotice(''); try { if (selected?.id) await request(`/api/telegram/config/${encodeURIComponent(String(selected.id))}`, { method: 'PUT', body: JSON.stringify(form) }); else await request('/api/telegram/config', { method: 'POST', body: JSON.stringify(form) }); setSelected(null); await load(); } catch (e: any) { setNotice(e?.message || 'Unable to save Telegram configuration.'); } finally { setBusy(false); } };
  const remove = async (id: string) => { if (!window.confirm('Delete this Telegram configuration?')) return; setBusy(true); try { await request(`/api/telegram/config/${encodeURIComponent(id)}`, { method: 'DELETE' }); await load(); } catch (e: any) { setNotice(e?.message || 'Unable to delete configuration.'); } finally { setBusy(false); } };
  const test = async (cfg: Config) => { setBusy(true); setNotice(''); try { await request('/api/telegram/test', { method: 'POST', body: JSON.stringify({ id: cfg.id, chatId: cfg.chatId || form.chatId, message }) }); setNotice('Telegram test sent.'); } catch (e: any) { setNotice(e?.message || 'Telegram test failed.'); } finally { setBusy(false); } };
  return <div className="stack">
    <div className="hero"><div><span className="eyebrow">BOT INTEGRATION</span><h3>Telegram Management</h3><p>Manage Telegram bot destinations and inspect delivery logs.</p></div><button className="button" disabled={busy} onClick={() => void load()}>Refresh</button></div>
    {notice && <div className="error banner">{notice}</div>}
    <section className="panel"><div className="panel-head"><div><h3>Configurations</h3><span>{configs.length} configured destinations</span></div><button className="primary" onClick={() => { setSelected(null); setForm({ name: '', botToken: '', chatId: '', enabled: true }); }}>Add Telegram</button></div>
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Chat ID</th><th>Status</th><th>Actions</th></tr></thead><tbody>{configs.map((cfg, i) => <tr key={String(cfg.id ?? i)}><td>{cfg.name || cfg.id || 'Unnamed'}</td><td>{cfg.chatId || '—'}</td><td><span className="badge">{cfg.enabled === false ? 'DISABLED' : 'ENABLED'}</span></td><td><button className="button tiny" onClick={() => edit(cfg)}>Edit</button> <button className="button tiny" onClick={() => void test(cfg)} disabled={busy}>Test</button> {cfg.id && <button className="button tiny" onClick={() => void remove(String(cfg.id))} disabled={busy}>Delete</button>}</td></tr>)}</tbody></table>{!configs.length && <div className="empty">No Telegram configurations.</div>}</div>
    </section>
    <section className="panel"><div className="panel-head"><div><h3>Delivery Test</h3><span>Send a test message using a selected configuration</span></div></div><div className="grid"><label className="metric"><span>Message</span><input value={message} onChange={e => setMessage(e.target.value)} /></label></div></section>
    <section className="panel"><div className="panel-head"><div><h3>Logs</h3><span>{logs.length} recent entries</span></div></div><div className="table-wrap"><table><thead><tr><th>Time</th><th>Event</th><th>Payload</th></tr></thead><tbody>{logs.map((log, i) => <tr key={String(log.id ?? i)}><td>{log.time || log.createdAt || '—'}</td><td>{log.event || log.type || log.status || '—'}</td><td>{typeof log === 'object' ? JSON.stringify(log) : String(log)}</td></tr>)}</tbody></table>{!logs.length && <div className="empty">No Telegram logs.</div>}</div></section>
    {selected !== null && <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><span className="eyebrow">TELEGRAM CONFIG</span><h3>{selected.id ? 'Edit configuration' : 'New configuration'}</h3></div><button className="icon" onClick={() => setSelected(null)}>×</button></div><div className="detail-grid"><label className="metric"><span>Name</span><input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></label><label className="metric"><span>Bot Token</span><input value={form.botToken || ''} onChange={e => setForm({ ...form, botToken: e.target.value })} /></label><label className="metric"><span>Chat ID</span><input value={form.chatId || ''} onChange={e => setForm({ ...form, chatId: e.target.value })} /></label><label className="metric"><span>Enabled</span><select value={form.enabled === false ? 'false' : 'true'} onChange={e => setForm({ ...form, enabled: e.target.value === 'true' })}><option value="true">Enabled</option><option value="false">Disabled</option></select></label></div><div className="modal-actions"><button className="button secondary" onClick={() => setSelected(null)}>Cancel</button><button className="primary" disabled={busy} onClick={() => void save()}>Save</button></div></div></div>}
  </div>;
}
