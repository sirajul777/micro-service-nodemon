// ════════════════════════════════════════════════
// GLOBALS
// ════════════════════════════════════════════════
const API = window.location.origin + "/api";
let CS = ""; // current session
let rChart = null;
let selData = [],
  rslGrps = [],
  genVcr = [];
let editSess = null,
  editHsProf = null,
  editPppUser = null,
  editPppProf = null,
  editRs = null,
  editVtId = null;
let liveInterval = null; // dashboard auto-refresh
let logFilter = "all";

// Minimal safe override is intentionally isolated here. Keep the pre-PR15 dashboard script intact.
// The full script is restored from 62c2b17; dashboard background work must not block core rendering.
function _mhSafeDashboardReq(path) {
  return req(path).catch(() => null);
}
