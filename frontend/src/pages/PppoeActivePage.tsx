import { useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw, Search, Users, WifiOff } from "lucide-react";
import { router } from "../api";
import "../pppoe-active-page.css";

type Row = Record<string, any>;

const textOf = (row: Row, keys: string[], fallback = "") => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "")
      return String(row[key]);
  }
  return fallback;
};

export default function PppoeActivePage({ session }: { session: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const load = async () => {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const result: any = await router.pppActive(session);
      setRows(
        result?.active ?? result?.connections ?? result?.data ?? result ?? [],
      );
    } catch (e: any) {
      setError(e?.message || "Unable to load active PPPoE sessions.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    setRows([]);
    setQuery("");
    setError("");
    void load();
  }, [session]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      Object.values(r).some((v) =>
        String(v ?? "")
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [rows, query]);

  const profiles = useMemo(() => {
    const values = filtered
      .map((r) => textOf(r, ["profile"]))
      .filter(Boolean);
    return new Set(values).size;
  }, [filtered]);

  const services = useMemo(() => {
    const values = filtered
      .map((r) => textOf(r, ["service"]))
      .filter(Boolean);
    return new Set(values).size;
  }, [filtered]);

  const disconnect = async (name: string) => {
    if (!name || !window.confirm(`Disconnect PPPoE session \"${name}\"?`))
      return;
    setBusy(true);
    setError("");
    try {
      await router.disconnectPppActive(session, name);
      await load();
    } catch (e: any) {
      setError(e?.message || "Unable to disconnect PPPoE session.");
      setBusy(false);
    }
  };

  return (
    <div className="stack pppoe-active-page">
      <div className="hero">
        <div>
          <span className="eyebrow">PPPOE MONITORING</span>
          <h3>PPPoE Active</h3>
          <p>Inspect active PPPoE sessions on the selected router.</p>
        </div>
        <div className="top-actions">
          <button
            className="button"
            onClick={() => void load()}
            disabled={busy || !session}
          >
            <RefreshCw size={15} className={busy ? "spin" : ""} /> Refresh
          </button>
        </div>
      </div>
      {error && <div className="error banner">{error}</div>}

      <section className="stats active-summary">
        <div className="stat">
          <div className="stat-icon"><Users size={18} /></div>
          <div><span>Active Sessions</span><strong>{filtered.length}</strong></div>
          <small>{query ? "Matching current search" : "Current router snapshot"}</small>
        </div>
        <div className="stat">
          <div className="stat-icon"><Activity size={18} /></div>
          <div><span>Profiles in Use</span><strong>{profiles}</strong></div>
          <small>{profiles === 0 ? "No profile data" : "Distinct active profiles"}</small>
        </div>
        <div className="stat">
          <div className="stat-icon"><Activity size={18} /></div>
          <div><span>Services</span><strong>{services}</strong></div>
          <small>{services === 0 ? "No service data" : "Distinct session services"}</small>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Active Sessions</h3>
            <span className="session-count">
              <strong>{filtered.length}</strong> active session
              {filtered.length === 1 ? "" : "s"}
            </span>
          </div>
          <span className="badge">{busy ? "WORKING" : "LIVE"}</span>
        </div>
        <div className="table-controls">
          <div className="table-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search username, address, caller ID..."
            />
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Address</th>
                <th>Uptime</th>
                <th>Service</th>
                <th>Caller ID</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const name = textOf(r, ["name", "user", "username"], `row-${i}`);
                return (
                  <tr key={`${name}-${i}`}>
                    <td className="user-cell"><b>{name}</b></td>
                    <td className="address-cell">{textOf(r, ["address", "remoteAddress"], "—")}</td>
                    <td className="uptime-cell">{textOf(r, ["uptime"], "—")}</td>
                    <td><span className="service-chip">{textOf(r, ["service"], "pppoe")}</span></td>
                    <td className="caller-cell">{textOf(r, ["callerId", "caller-id"], "—")}</td>
                    <td>
                      <button
                        className="button disconnect-button"
                        disabled={busy}
                        onClick={() => void disconnect(name)}
                      >
                        <WifiOff size={14} /> Disconnect
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filtered.length && (
            <div className="empty">No active PPPoE sessions found.</div>
          )}
        </div>
      </section>
    </div>
  );
}
