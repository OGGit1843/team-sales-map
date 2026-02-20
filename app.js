// Hance Group Team Sales Map (Leaflet)
const DATA_URL = "./data_combined.csv";

/* ===============================
   MAP INIT
=================================*/
const map = L.map("map", { fullscreenControl: true }).setView([39.96, -82.99], 10);
/* ===============================
   EMBED DETECTION
=================================*/
(function () {
  const btn = document.getElementById("open-fullscreen");
  const hint = document.getElementById("footerHint");

  let embedded = false;
  try { embedded = window.self !== window.top; } catch { embedded = true; }

  if (btn) btn.style.display = embedded ? "inline-flex" : "none";
  if (hint) hint.style.display = embedded ? "block" : "none";
})();
/* Keep map below topbar */
function setMapTopOffset() {
  const topbar = document.getElementById("topbar");
  if (!topbar) return;

  const top = topbar.offsetHeight + 10;
  document.documentElement.style.setProperty("--map-top", `${top}px`);

  if (map && map.invalidateSize) map.invalidateSize();
}
window.addEventListener("load", setMapTopOffset);
window.addEventListener("resize", setMapTopOffset);
setTimeout(setMapTopOffset, 0);

/* ===============================
   BASEMAPS
=================================*/
// 1) ESRI World Street Map
const esriStreet = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19, attribution: "Tiles © Esri" }
);

// 2) Muted (OSM HOT style you liked as “muted-ish”)
const muted = L.tileLayer(
  "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
  { maxZoom: 19, attribution: "© OpenStreetMap contributors" }
);

// 3) ESRI Dark Gray Canvas + labels
const esriDark = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 16, attribution: "Tiles © Esri" }
);
const esriDarkLabels = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 16 }
);
const darkBase = L.layerGroup([esriDark, esriDarkLabels]);

// 4) Satellite + labels
const esriSatellite = L.tileLayer(
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19, attribution: "Tiles © Esri" }
);
const esriLabels = L.tileLayer(
  "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19 }
);
const satBase = L.layerGroup([esriSatellite, esriLabels]);

// Default basemap
esriStreet.addTo(map);

// Layer toggle
L.control.layers(
  {
    "Street (Google-like)": esriStreet,
    "Muted": muted,
    "Dark Gray (Subtle)": darkBase,
    "Satellite + Labels": satBase
  },
  {},
  { position: "topright" }
).addTo(map);

/* ===============================
   CLUSTER
=================================*/
const cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45 });
map.addLayer(cluster);

/* ===============================
   DOM REFS
=================================*/
const els = {
  yearSelect: document.getElementById("yearSelect"),
  stats: document.getElementById("stats"),
  ptypeChecks: Array.from(document.querySelectorAll(".ptype"))
};

let allRows = [];
let plottedMarkers = [];
let availableYears = new Set();
let hasAutoZoomed = false;

/* ===============================
   HELPERS
=================================*/
function parseSoldPrice(raw) {
  if (!raw) return null;
  const s = String(raw).replace(/[^0-9.]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();

  let m = s.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  m = s.match(/^([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{4})/);
  if (m) return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function fmtMoney(n) {
  if (n == null) return "";
  try {
    return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  } catch {
    return `$${Math.round(n).toLocaleString()}`;
  }
}

function getActivePropertyTypes() {
  return new Set(els.ptypeChecks.filter(c => c.checked).map(c => c.value));
}

function getActiveYear() {
  return els.yearSelect.value || "all";
}

function txClass(tx) {
  const t = (tx || "").toString().toLowerCase();
  if (t.includes("seller") || t.includes("listing")) return "seller";
  if (t.includes("buyer")) return "buyer";
  return "unknown";
}

function typeEmoji(ptype) {
  const p = (ptype || "").toString().toLowerCase();
  if (p.includes("res")) return "🏠";
  if (p.includes("comm")) return "🏢";
  if (p.includes("multi")) return "🏘️";
  if (p.includes("land")) return "🌾";
  return "📍";
}

function makeIcon(row) {
  const cls = txClass(row["Transaction Type"]);
  const emoji = typeEmoji(row["Property Type"]);

  return L.divIcon({
    className: "",
    html: `<div class="marker ${cls}" title="${row["Property Type"] || ""}">${emoji}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -30]
  });
}

function buildPopup(row) {
  const price = parseSoldPrice(row["Sold Price"]);
  const dt = parseDate(row["Sold Date"]);

  const photo = (row["PhotoURL"] || row["Photo Url"] || row["Photo"] || "").toString().trim();
  const imgHtml = photo ? `<div class="photo"><img src="${photo}" alt="Property photo" loading="lazy"/></div>` : "";

  const safe = (v) => (v == null ? "" : String(v));

  return `
    <div class="popup">
      <div class="addr"><strong>${safe(row["Full Address"])}</strong></div>
      ${imgHtml}
      <div class="meta">
        <div><span>Type:</span> ${safe(row["Transaction Type"])}</div>
        <div><span>Property:</span> ${safe(row["Property Type"])}</div>
        <div><span>Sold:</span> ${price != null ? fmtMoney(price) : safe(row["Sold Price"])}</div>
        <div><span>Date:</span> ${dt ? dt.toLocaleDateString() : safe(row["Sold Date"])}</div>
      </div>
    </div>
  `;
}

/* ===============================
   REFRESH
=================================*/
function refresh() {
  cluster.clearLayers();
  plottedMarkers = [];

  const activeTypes = getActivePropertyTypes();
  const activeYear = getActiveYear();

  let total = 0;
  let plotted = 0;
  let missing = 0;

  for (const row of allRows) {
    total++;

    const ptype = (row["Property Type"] || "").toString();
    if (!activeTypes.has(ptype)) continue;

    const lat = Number(row["Latitude"]);
    const lng = Number(row["Longitude"]);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      missing++;
      continue;
    }

    const dt = parseDate(row["Sold Date"]);
    const year = dt ? String(dt.getFullYear()) : null;
    if (activeYear !== "all" && year !== activeYear) continue;

    const marker = L.marker([lat, lng], { icon: makeIcon(row) });
    marker.bindPopup(buildPopup(row), { maxWidth: 320 });
    cluster.addLayer(marker);

    plottedMarkers.push(marker);
    plotted++;
  }

  if (els.stats) {
    els.stats.textContent =
      `${plotted.toLocaleString()} pinned • ${missing.toLocaleString()} missing coords • ${total.toLocaleString()} total`;
  }

  if (plotted > 0 && !hasAutoZoomed) {
    const group = L.featureGroup(plottedMarkers);
    map.fitBounds(group.getBounds().pad(0.12));
    hasAutoZoomed = true;
  }
}

/* ===============================
   YEAR DROPDOWN
=================================*/
function populateYearDropdown() {
  const years = Array.from(availableYears).sort((a, b) => b - a);
  const current = els.yearSelect.value || "all";

  els.yearSelect.innerHTML = '<option value="all">All</option>';

  for (const y of years) {
    const opt = document.createElement("option");
    opt.value = String(y);
    opt.textContent = String(y);
    els.yearSelect.appendChild(opt);
  }

  const exists = (current === "all") || years.includes(Number(current));
  els.yearSelect.value = exists ? current : "all";
}

/* ===============================
   LOAD DATA
=================================*/
function loadData() {
  if (els.stats) els.stats.textContent = "Loading…";

  Papa.parse(DATA_URL, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      allRows = results.data || [];

      availableYears = new Set();
      for (const row of allRows) {
        const dt = parseDate(row["Sold Date"]);
        if (dt) availableYears.add(dt.getFullYear());
      }

      populateYearDropdown();
      refresh();
      setTimeout(setMapTopOffset, 0);
    },
    error: (err) => {
      console.error(err);
      if (els.stats) els.stats.textContent = "Failed to load data_combined.csv";
    }
  });
}

els.yearSelect.addEventListener("change", refresh);
els.ptypeChecks.forEach((c) => c.addEventListener("change", refresh));

loadData();
