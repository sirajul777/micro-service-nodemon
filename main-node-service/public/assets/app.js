    ip = v("ms-ip"),
    pw = v("ms-pw");
  if (!id || !nm || !ip) {
    se("ms-err", "ID, Name, IP wajib diisi");
    return;
  }
  if (!editSessData && !pw) {
    se("ms-err", "Password wajib diisi");
    return;
  }
  const body = {
    id,
    name: nm,
    ip,
    port: parseInt(v("ms-pt")) || 8728,
    user: v("ms-us"),
    password: editSessData && pw === "" ? "***" : pw,
    currency: v("ms-cr") || "Rp",
    livereport: v("ms-lv")
  };
  const d = await post("/sessions", body);
  if (d?.success) {
    closeM("m-sess");
    loadSessions();
    toast(editSessData ? "Router diupdate!" : "Router ditambahkan!");
  } else se("ms-err", "Gagal menyimpan");
}
async function delSession(id) {
  if (!confirm(`Hapus "${id}"?`)) return;
  await del(`/sessions/${id}`);
  loadSessions();
  toast("Router dihapus");
}
async function testConn(id) {
  showL();
  const d = await req(`/mikrotik/${id}/connect/test`);
  hideL();
  d?.success
    ? toast(`✓ Connected — ${d.identity} | ROS ${d.rosVersion}`)
    : toast(`✗ ${d?.error || "Gagal"}`, true);
}

// Auto sync voucher used dari MikroTik — dipanggil silent di background
async function autoSyncBatchUsed() {
  if (!CS) return;
  try {
    const d = await fetch(`${API}/batches/${CS}/auto-sync-used`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    }).then((r) => r.json());

    // Hanya tampil notif jika ada yang berubah
    if (d?.success && d.updated > 0) {
      toast(`🔄 ${d.updated} voucher batch ditandai terpakai`);
      checkAndAutoRemoveAll().catch(() => {});
    }
  } catch {
    // Silent — jangan ganggu dashboard
  }
}
// ════════════════════════════════════════════════
// DASHBOARD (realtime)
// ════════════════════════════════════════════════
let dashLogs = []; // cache all logs

async function loadDashboard() {
  if (!CS) return;
  countdownVal = REFRESH_INTERVAL;
  updateCountdown();
  try {
    // Keep the dashboard usable even when a secondary upstream is slow.
    const dashPromise = req(`/mikrotik/${CS}/dashboard`).catch(() => null);
    const livePromise = req(`/report/${CS}/live`).catch(() => null);
    const pppActivePromise = req(`/pppoe/${CS}/active`).catch(() => null);
    const pppSecretsPromise = req(`/pppoe/${CS}/secrets`).catch(() => null);
    const hsLogsPromise = req(`/mikrotik/${CS}/hotspot/log`).catch(() => null);

    const [dash, live, pppActive, pppSecrets, hsLogs] = await Promise.all([
      dashPromise,
      livePromise,
      pppActivePromise,
      pppSecretsPromise,
      hsLogsPromise
    ]);

    // Dashboard data is the primary payload. Secondary panes may be unavailable
    // without preventing the dashboard itself from rendering.
    if (!dash) return;

    const safeLive = live || {};
    const safePppActive = pppActive || [];
    const safePppSecrets = pppSecrets || [];
    const safeLogs = hsLogs || { logs: [] };

    const isIndo = safeLive?.isIndo ?? true;
    const currency = safeLive?.currency || "Rp";
    const fmt = (n) =>
      isIndo
        ? currency + " " + Math.round(n).toLocaleString("id-ID")
        : currency + " " + Number(n).toFixed(2);
    const liveToday = safeLive?.today || { income: safeLive?.income, vouchers: safeLive?.vouchersSold };
    const liveMonth = safeLive?.month || liveToday;
    document.getElementById("db-today-inc").textContent = fmt(liveToday.income || 0);
    document.getElementById("db-month-inc").textContent = fmt(liveMonth.income || 0);
    document.getElementById("db-today-vcr").textContent = liveToday.vouchers ?? "—";
    document.getElementById("db-month-vcr").textContent = liveMonth.vouchers ?? "—";

    document.getElementById("db-hs-total").textContent = dash.hotspot?.total ?? "—";
    document.getElementById("db-hs-active2").textContent = dash.hotspot?.active ?? "—";
    document.getElementById("db-ppp-total").textContent = listFrom(safePppSecrets, "secrets").length;
    document.getElementById("db-ppp-active2").textContent = listFrom(safePppActive, "connections").length;

    const r = dash.resource || {};
    const cpu = parseInt(r["cpu-load"]) || 0;
    const memFree = parseInt(r["free-memory"]) || 0;
    const memTotal = parseInt(r["total-memory"]) || 1;
    const memPct = Math.round((1 - memFree / memTotal) * 100);
    const hddFree = parseInt(r["free-hdd-space"]) || 0;
    const hddTotal = parseInt(r["total-hdd-space"]) || 1;
    const hddPct = Math.round((1 - hddFree / hddTotal) * 100);

    document.getElementById("nas-list").innerHTML = `
      <div class="nas-card">
        <div class="nas-header">
          <div><div class="nas-name">${dash.identity || "—"}</div><div class="nas-ip">${r["board-name"] || ""} · ${r["architecture-name"] || ""}</div></div>
          <div class="nas-status"><div class="dot dot-on"></div> Online</div>
        </div>
        <div class="nas-info">
          ROS: <b>${r.version || "—"}</b> &nbsp;|&nbsp; Uptime: <b>${r.uptime || "—"}</b> &nbsp;|&nbsp;
          🕐 ${dash.clock?.date || ""} ${dash.clock?.time || ""}
        </div>
        <div class="nas-bar-row">
          <div class="nas-bar-label"><span>CPU Load</span><span>${cpu}%</span></div>
          <div class="nas-bar"><div class="nas-bar-fill ${cpu > 80 ? "fill-red" : cpu > 60 ? "fill-yellow" : "fill-green"}" style="width:${cpu}%"></div></div>
        </div>
        <div class="nas-bar-row">
          <div class="nas-bar-label"><span>Memory</span><span>${fmtB(r["free-memory"])} free / ${fmtB(r["total-memory"])}</span></div>
          <div class="nas-bar"><div class="nas-bar-fill ${memPct > 80 ? "fill-red" : memPct > 60 ? "fill-yellow" : "fill-green"}" style="width:${memPct}%"></div></div>
        </div>
        <div class="nas-bar-row">
          <div class="nas-bar-label"><span>HDD</span><span>${fmtB(r["free-hdd-space"])} free</span></div>
          <div class="nas-bar"><div class="nas-bar-fill ${hddPct > 80 ? "fill-red" : "fill-green"}" style="width:${Math.max(hddPct, 2)}%"></div></div>
        </div>
      </div>`;

    dashLogs = listFrom(safeLogs, "logs").slice(0, 100).map((l) => {
      const m = l.message || "";
      let type = "hs";
      if (m.includes("ppp") || m.includes("pppoe")) type = "ppp";
      return { time: l.time, msg: m, type };
    });

    // Never block the dashboard on the background batch synchronizer.
    autoSyncBatchUsed();
    renderLog();
  } catch (e) {
    console.error("Dashboard error:", e);
  } finally {
    hideL();
  }
}

function renderLog() {
  const filtered =
    logFilter === "all"
      ? dashLogs
      : dashLogs.filter((l) => l.type === logFilter);
  const el = document.getElementById("log-list");
  const hsCt = dashLogs.filter((l) => l.type === "hs").length;
  const pppCt = dashLogs.filter((l) => l.type === "ppp").length;

  document.getElementById("lc-all").textContent = dashLogs.length;
  document.getElementById("lc-hs").textContent = hsCt;
  document.getElementById("lc-ppp").textContent = pppCt;

  el.innerHTML = filtered.length
    ? filtered
        .map((l) => {
          const msg = l.msg.toLowerCase();
          const isAuth = msg.includes("login") || msg.includes("authorized");
          const isLogout = msg.includes("logout");
          const isErr =
            msg.includes("error") ||
            msg.includes("failed") ||
            msg.includes("critical");
          const isWarn = msg.includes("warning") || msg.includes("timeout");

          const color = isErr
            ? "red"
            : isWarn
              ? "yellow"
              : isLogout
                ? "orange"
                : isAuth
                  ? "green"
                  : "blue";
          const icon = l.type === "hs" ? "fa-wifi" : "fa-plug";

          return `<div class="log-item">
          <div class="log-dot" style="background:var(--${color});box-shadow:0 0 8px var(--${color})"></div>
          <div class="log-body">
            <div class="log-title">
              <span class="log-tag ${l.type === "hs" ? "lt-hs" : "lt-ppp"}"><i class="fa ${icon}"></i> ${l.type.toUpperCase()}</span>
              ${l.msg}
            </div>
          </div>
          <div class="log-time">${l.time}</div>
        </div>`;
        })
        .join("")
    : '<div style="text-align:center;color:var(--muted);padding:40px"><i class="fa fa-inbox" style="font-size:2rem;opacity:.2"></i><br>Tidak ada log</div>';
}

function filterLog(type, btn) {
  logFilter = type;
  document
    .querySelectorAll(".lf-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");