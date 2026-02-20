// Hance Group Team Sales Map (Leaflet)
// Data source: data_combined.csv (same folder as this file)

const DATA_URL = "./data_combined.csv";

const map = L.map("map", { fullscreenControl: true }).setView([39.96, -82.99], 10);
// --- Basemaps ---
// --- Final Basemaps ---

// 1️⃣ Original OpenStreetMap
const esriStreet = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 19,
    attribution: "Tiles &copy; Esri"
  }
);

// 2️⃣ Muted (softer color balance)
const muted = L.tileLayer(
  "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
  {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }
);

// 3️⃣ Satellite base
const esriSatellite = L.tileLayer(
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 19,
    attribution: "Tiles &copy; Esri"
  }
);

// Satellite labels overlay
const esriLabels = L.tileLayer(
  "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 19
  }
);

// Default map (change to muted.addTo(map) if you prefer that default)
original.addTo(map);

// Toggle control
L.control.layers(
  {
    "Original": original,
    "ESRI Street (Darker)": esriStreet,
    "Satellite + Labels": L.layerGroup([esriSatellite, esriLabels])
  },
  {
    "Extra Labels (More names)": esriLabels
  },
  { position: "topright" }
).addTo(map);




const cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45 });
map.addLayer(cluster);

const els = {
  yearSelect: document.getElementById("yearSelect"),
  stats: document.getElementById("stats"),
  ptypeChecks: Array.from(document.querySelectorAll(".ptype")),
};

let allRows = [];
let plottedMarkers = [];
let availableYears = new Set();

function parseSoldPrice(raw) {
  if (raw == null) return null;
  const s = String(raw).replace(/[^0-9.]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  // YYYY-MM-DD
  let m = s.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // MM/DD/YYYY
  m = s.match(/^([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{4})/);
  if (m) return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  // fallback
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
  return new Set(
    els.ptypeChecks.filter(c => c.checked).map(c => c.value)
  );
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

  // your sheet uses values like: Residential, Commercial, Multi-Family, Land
  if (p.includes("res")) return "🏠";
  if (p.includes("comm")) return "🏢";
  if (p.includes("multi")) return "🏘️";
  if (p.includes("land")) return "🌾";
  return "📍";
}

function makeIcon(row) {
  const tx = row["Transaction Type"];
  const ptype = row["Property Type"];

  const cls = txClass(tx);
  const emoji = typeEmoji(ptype);

  return L.divIcon({
    className: "", // keep Leaflet from adding default icon styles
    html: `<div class="marker ${cls}" title="${ptype || ""}">${emoji}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -30]
  });
}
function buildPopup(row) {
  const price = parseSoldPrice(row["Sold Price"]);
  const dt = parseDate(row["Sold Date"]);
  const year = dt ? dt.getFullYear() : null;

  const photo = (row["PhotoURL"] || row["Photo Url"] || row["Photo"] || "").toString().trim();
  const imgHtml = photo ? `<div class="photo"><img src="${photo}" alt="Property photo" loading="lazy" /></div>` : "";

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
        ${year ? `<div><span>Year:</span> ${year}</div>` : ""}
      </div>
    </div>
  `;
}

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

  els.stats.textContent = `${plotted.toLocaleString()} pinned • ${missing.toLocaleString()} missing coords • ${total.toLocaleString()} total`;

  if (plotted > 0) {
    const group = L.featureGroup(plottedMarkers);
    map.fitBounds(group.getBounds().pad(0.12));
  }
}

function populateYearDropdown() {
  // preserve current selection if possible
  const current = els.yearSelect.value || "all";
  const years = Array.from(availableYears).sort((a,b) => b - a);

  els.yearSelect.innerHTML = '<option value="all">All</option>';
  for (const y of years) {
    const opt = document.createElement("option");
    opt.value = String(y);
    opt.textContent = String(y);
    els.yearSelect.appendChild(opt);
  }
  // restore selection
  const exists = (current === "all") || years.includes(Number(current));
  els.yearSelect.value = exists ? current : "all";
}

function loadData() {
  els.stats.textContent = "Loading…";

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
    },
    error: (err) => {
      console.error(err);
      els.stats.textContent = "Failed to load data_combined.csv";
    }
  });
}

els.yearSelect.addEventListener("change", refresh);
els.ptypeChecks.forEach(c => c.addEventListener("change", refresh));

// Add minimal popup styling
const style = document.createElement("style");
style.textContent = `
.popup .addr { margin-bottom: 6px; }
.popup .meta div { margin: 2px 0; }
.popup .meta span { color: #555; display: inline-block; width: 78px; }
.popup .photo img { width: 100%; border-radius: 10px; margin: 6px 0; }
`;
document.head.appendChild(style);

loadData();
