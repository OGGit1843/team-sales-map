// Hance Group Team Sales Map (Leaflet)
const DATA_URL = "./data_combined.csv";

/* ===============================
   MAP INIT
=================================*/
// Make map globally accessible so we can invalidate size from anywhere
window.map = L.map("map", { fullscreenControl: true }).setView([39.96, -82.99], 10);

// Add a reliable class we control when fullscreen toggles (your CSS uses hg-fs)
window.map.on("enterFullscreen", () => {
  document.body.classList.add("hg-fs");
  // Let the DOM update, then force Leaflet to re-measure
  setTimeout(() => window.map.invalidateSize(), 50);
});
window.map.on("exitFullscreen", () => {
  document.body.classList.remove("hg-fs");
  setTimeout(() => {
    setMapOffsets();
    window.map.invalidateSize();
  }, 50);
});

/* ===============================
   LAYOUT FIX: TOPBAR + FOOTER OFFSETS
   (critical for Google Sites iframe + mobile wrapping)
=================================*/
function setMapOffsets() {
  const topbar = document.getElementById("topbar");
  const footer = document.getElementById("footerHint");

  const top = topbar ? topbar.getBoundingClientRect().height : 0;
  const bottom = footer ? footer.getBoundingClientRect().height : 0;

  // Add a small cushion so Leaflet controls don't tuck under the bar
  const topWithPad = Math.ceil(top + 10);
  const bottomWithPad = Math.ceil(bottom);

  document.documentElement.style.setProperty("--map-top", `${topWithPad}px`);
  document.documentElement.style.setProperty("--map-bottom", `${bottomWithPad}px`);

  if (window.map && window.map.invalidateSize) window.map.invalidateSize();
}

window.addEventListener("load", () => {
  setMapOffsets();
  if (window.map) window.map.invalidateSize();
});

window.addEventListener("resize", () => {
  setMapOffsets();
  if (window.map) window.map.invalidateSize();
});

// Run once ASAP
setTimeout(setMapOffsets, 0);

/* ===============================
   BASEMAPS
=================================*/
// 1) ESRI World Street Map
const esriStreet = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19, attribution: "Tiles © Esri" }
);

// 2) Muted
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
esriStreet.addTo(window.map);

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
).addTo(window.map);

/* ===============================
   CLUSTER
=================================*/
const cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45 });
window.map.addLayer(cluster);

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
    window.map.fitBounds(group.getBounds().pad(0.12));
    hasAutoZoomed = true;
  }

  // After refresh, re-measure layout + fix Leaflet sizing in iframe
  setTimeout(() => {
    setMapOffsets();
    if (window.map) window.map.invalidateSize();
  }, 0);
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

      // Ensure offsets are correct after controls wrap on mobile
      setTimeout(() => {
        setMapOffsets();
        if (window.map) window.map.invalidateSize();
      }, 50);
    },
    error: (err) => {
      console.error(err);
      if (els.stats) els.stats.textContent = "Failed to load data_combined.csv";
    }
  });
}

els.yearSelect.addEventListener("change", () => {
  refresh();
  setTimeout(setMapOffsets, 0);
});

els.ptypeChecks.forEach((c) =>
  c.addEventListener("change", () => {
    refresh();
    setTimeout(setMapOffsets, 0);
  })
);

loadData();
