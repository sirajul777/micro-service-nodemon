import { useEffect, useMemo, useState } from "react";
import { Copy, KeyRound, RefreshCw, Smartphone } from "lucide-react";
import { mobile } from "../api";

const date = (value: unknown) => {
  if (!value) return "—";
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString("id-ID");
};
const mask = (value: string) => value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-6)}` : value;

export default function MobileApiPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<any>(null);
  const [tokens, setTokens] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const baseUrl = useMemo(() => `${window.location.origin}/api/mobile-auth`, []);

  const loadTokens = async () => {
    try {
      const response = await mobile.tokens();
      setTokens(Array.isArray(response?.tokens) ? response.tokens : []);
    } catch (e: any) {
      setError(e?.message || "Tidak dapat memuat token aktif.");
    }
  };
  useEffect(() => { void loadTokens(); }, []);

  const testLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await mobile.login(username, password);
      setResult(response);
      if (response?.success) await loadTokens();
    } catch (e: any) {
      setError(e?.message || "Test login gagal.");
    } finally { setBusy(false); }
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard may be unavailable */ }
  };

  return (
    <div className="stack">
      <div className="page-hero">
        <div><span className="eyebrow">MOBILE ACCESS</span><h3>Mobile API</h3><p>Dokumentasi autentikasi dan token untuk aplikasi mobile reseller.</p></div>
        <button className="button secondary" onClick={() => void loadTokens()} disabled={busy}><RefreshCw size={15} /> Refresh Token</button>
      </div>
      <div className="grid two-col">
        <section className="panel">
          <div className="panel-head"><div><h3><Smartphone size={15} /> API Access</h3><span>Base URL dan metode autentikasi.</span></div></div>
          <div className="detail-grid">
            <div><span>Base URL</span><b className="code-value">{baseUrl}</b></div>
            <div><span>Authorization</span><b className="code-value">Bearer &lt;token&gt;</b></div>
            <div><span>Token Lifetime</span><b>30 hari</b></div>
            <div><span>Login Endpoint</span><b className="code-value">POST /login</b></div>
          </div>
          <div className="panel" style={{ marginTop: 14 }}>
            <div className="panel-head"><div><h3>Contoh Request</h3><span>Login reseller untuk mendapatkan Bearer Token.</span></div><button className="icon tiny" title="Copy" onClick={() => void copy(JSON.stringify({ username: "reseller01", password: "password" }, null, 2))}><Copy size={14} /></button></div>
            <pre className="detail-pre">{`POST ${baseUrl}/login\nContent-Type: application/json\n\n{"username":"reseller01","password":"password"}`}</pre>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><div><h3><KeyRound size={15} /> Test Login API</h3><span>Uji kredensial tanpa menyimpan password di halaman.</span></div></div>
          <form className="form-grid compact" onSubmit={testLogin}>
            <label><span>Username</span><input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="reseller01" autoComplete="off" /></label>
            <label><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="off" /></label>
            <div className="modal-actions"><button className="button primary" disabled={busy || !username || !password} type="submit"><KeyRound size={15} /> {busy ? "Testing..." : "Test Login"}</button></div>
          </form>
          {error && <div className="error banner">{error}</div>}
          {result && <div className="panel" style={{ marginTop: 14 }}><div className="panel-head"><div><h3>Response</h3></div></div><pre className="detail-pre">{JSON.stringify(result, null, 2)}</pre></div>}
        </section>
      </div>
      <section className="panel">
        <div className="panel-head"><div><h3><KeyRound size={15} /> Token Aktif Reseller</h3><span>{tokens.length} token tersimpan</span></div></div>
        <div className="table-wrap"><table><thead><tr><th>Username</th><th>Role</th><th>Session</th><th>Dibuat</th><th>Expired</th><th>Terakhir Dipakai</th><th>Token</th></tr></thead><tbody>
          {tokens.map((token, index) => <tr key={String(token.userId || token.username || index)}><td><b>{token.username || "—"}</b></td><td>{token.role || "—"}</td><td>{token.sessionId || "—"}</td><td className="code-value">{date(token.createdAt)}</td><td className="code-value">{date(token.expiresAt)}</td><td className="code-value">{date(token.lastUsed)}</td><td className="code-value">{token.token ? mask(String(token.token)) : "—"}</td></tr>)}
        </tbody></table>{!tokens.length && <div className="empty">Belum ada token mobile aktif.</div>}</div>
      </section>
    </div>
  );
}
