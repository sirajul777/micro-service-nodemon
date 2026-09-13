import { useState } from "react";
import { CheckCircle2, KeyRound, Save } from "lucide-react";
import { auth } from "../api";

export default function ChangePasswordPage() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");
    if (newPassword.length < 4) return setError("Password baru minimal 4 karakter.");
    if (newPassword !== confirm) return setError("Konfirmasi password baru tidak sama.");
    setBusy(true);
    try {
      const result = await auth.changePassword(oldPassword, newPassword);
      setMessage(result?.message || "Password berhasil diubah.");
      setOldPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (e: any) {
      setError(e?.message || "Gagal mengubah password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="page-hero">
        <div>
          <span className="eyebrow">ACCOUNT SECURITY</span>
          <h3>Ganti Password Login</h3>
          <p>Perbarui password akun administrator yang sedang login.</p>
        </div>
        <div className="status"><i /> Secure</div>
      </div>
      <section className="panel" style={{ maxWidth: 560 }}>
        <div className="panel-head">
          <div><h3><KeyRound size={15} /> Password</h3><span>Gunakan minimal 4 karakter.</span></div>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label><span>Password Lama</span><input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} placeholder="Password saat ini" autoComplete="current-password" /></label>
          <label><span>Password Baru</span><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Password baru" autoComplete="new-password" /></label>
          <label><span>Konfirmasi Password Baru</span><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Ulangi password baru" autoComplete="new-password" /></label>
          {error && <div className="error banner">{error}</div>}
          {message && <div className="success banner"><CheckCircle2 size={15} /> {message}</div>}
          <div className="modal-actions"><button className="button primary" type="submit" disabled={busy || !oldPassword || !newPassword || !confirm}><Save size={15} /> {busy ? "Menyimpan..." : "Simpan Password Baru"}</button></div>
        </form>
      </section>
    </div>
  );
}
