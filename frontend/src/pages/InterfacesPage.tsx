import { useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, Network, RefreshCw, Search, WifiOff } from "lucide-react";
import { router } from "../api";
import "../interfaces-page.css";

type Row = Record<string, any>;
type Props = { session: string; onTraffic?: (name: string) => void };

const textOf = (row: Row, keys: string[], fallback = "—") => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") return String(row[key]);
  }
  return fallback;
};

export default function InterfacesPage({ session, onTraffic }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = async () => {
    if (!session) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await router.interfaces(session);
      setRows(Array.isArray(result) ? result : result?.interfaces || result?.data || []);
    } catch (e: any) {
      setNotice(e?.message || "Unable to load interfaces.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    setRows([]);
    setQuery("");
    setNotice("");
    void load();
  }, [session]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return !q ? rows : rows.filter((r) => Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q)));
  }, [rows, query]);

  const isRunning = (value: any) => {
    const normalized = String(value ?? "").toLowerCase();
    if (["true", "yes", "running", "up"].includes(normalized)) return true;
    if (["false", "no", "down"].includes(normalized)) return false;
    return null;
  };

  const runningCount = rows.filter((r) => isRunning(r.running) === true).length;
  const downCount = rows.filter((r) => isRunning(r.running) === false).length;
  const typeCount = new Set(rows.map((r) => String(r.type || "").trim()).filter(Boolean)).size;

  return (
    <div className="stack interfaces-page">
      <div className="hero">
        <div>
          <span className="eyebrow">ROUTEROS INTERFACES</span>
          <h3>Interfaces</h3>
          <p>Inspect physical and virtual interfaces on the active RouterOS instance.</p>
        </div>
        <div className="top-actions">
          <button className="button" disabled={busy || !session} onClick={() => void load()}>
            <RefreshCw size={15} className={busy ? "spin" : ""} /> Refresh
          </button>
        </div>
      </div>
      {notice && <div className="error banner">{notice}</div>}

      <section className="stats interface-summary">
        <div className="stat"><div className="stat-icon"><Network size={18} /></div><div><span>Total Interfaces</span><strong>{rows.length}</strong></div><small>Current router snapshot</small></div>
        <div className="stat"><div className="stat-icon"><CheckCircle2 size={18} /></div><div><span>Running</span><strong>{runningCount}</strong></div><small>Operational interfaces</small></div>
        <div className="stat"><div className="stat-icon"><WifiOff size={18} /></div><div><span>Down</span><strong>{downCount}</strong></div><small>Known non-running interfaces</small></div>
        <div className="stat"><div className="stat-icon"><Activity size={18} /></div><div><span>Interface Types</span><strong>{typeCount}</strong></div><small>Distinct RouterOS types</small></div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3><Network size={15} /> Interface Inventory</h3>
            <span>{visible.length} of {rows.length} interfaces</span>
          </div>
          <span className="badge">{busy ? "WORKING" : "LIVE"}</span>
        </div>
        <div className="table-controls">
          <div className="table-search">
            <Search size={15} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search interface, type, MAC..." />
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Type</th><th>MAC Address</th><th>Status</th><th>TX</th><th>RX</th><th>Traffic</th></tr></thead>
            <tbody>
              {visible.map((r, i) => {
                const name = textOf(r, ["name", "id"], `interface-${i}`);
                const running = isRunning(r.running);
                return <tr key={`${name}-${i}`}>
                  <td><b>{name}</b></td>
                  <td>{textOf(r, ["type"])}</td>
                  <td className="interface-address">{textOf(r, ["macAddress", "mac_address"])}</td>
                  <td><span className={`interface-state ${running === true ? "is-up" : running === false ? "is-down" : ""}`}><i />{running === true ? "Running" : running === false ? "Down" : textOf(r, ["running"])}</span></td>
                  <td>{textOf(r, ["tx", "txRate", "tx_rate"])}</td>
                  <td>{textOf(r, ["rx", "rxRate", "rx_rate"])}</td>
                  <td><button className="button secondary" disabled={!onTraffic || !session} onClick={() => onTraffic?.(name)}><Activity size={14} /> Monitor</button></td>
                </tr>;
              })}
            </tbody>
          </table>
          {!visible.length && <div className="empty">No interfaces found.</div>}
        </div>
      </section>
    </div>
  );
}
