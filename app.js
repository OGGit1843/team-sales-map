// Hance Group Team Sales Map (Leaflet)

const DATA_URL = "./data_combined.csv";

/* ===============================
   MAP INIT
=================================*/

const map = L.map("map", { fullscreenControl: true }).setView([39.96, -82.99], 10);

/* ===============================
   AUTO OFFSET (TOPBAR SAFE)
=================================*/

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

const esriStreet = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19, attribution: "Tiles © Esri" }
);

const muted = L.tileLayer(
  "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
  { maxZoom: 19, attribution: "© OpenStreetMap contributors" }
);

const esriDark = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 16, attribution: "Tiles © Esri" }
);

const esriDarkLabels = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 16 }
);

const esriSatellite = L.tileLayer(
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19, attribution: "Tiles © Esri" }
);

const esriLabels = L.tileLayer(
  "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19 }
);

// Layer group for dark basemap (so we can detect it reliably)
const darkBase = L.layerGroup([esriDark, esriDarkLabels]);

// Default basemap
esriStreet.addTo(map);

/* ===============================
   CLUSTERS + HEAT
=================================*/

const cluster = L.markerClusterGroup({
  showCoverageOnHover: false,
  maxClusterRadius: 45
});
map.addLayer(cluster);

let heatLayer = L.heatLayer([], {
  radius: 28,
  blur: 22,
  maxZoom: 17
});

/* ===============================
   LAYER CONTROL
=================================*/

L.control.layers(
  {
    "Street (Google-like)": esriStreet,
    "Muted": muted,
    "Dark Gray (Subtle)": darkBase,
    "Satellite + Labels": L.layerGroup([esriSatellite, esriLabels])
  },
  {
    "Heatmap (Density)": heatLayer,
    "Extra Labels (More names)": esriLabels
  },
  { position: "topright" }
).addTo(map);

/* ===============================
   DARK UI TOGGLE BASED ON BASEMAP
=================================*/

function setBasemapUI(isDark) {
  document.body.classList.toggle("basemap-dark", !!isDark);
}

// Fires when the BASE layer changes
map.on("baselayerchange", (e) => {
  setBasemapUI(e.layer === darkBase);
});

// On first load we default to Street (light)
setBasemapUI(false);

/* ===============================
   DOM REFERENCES
=================================*/

const els = {
  yearSelect: document.getElementById("yearSelect"),
  stats: document.getElementById("stats"),
  kpiVolume: document.getElementById("kpiVolume"),
  panelBody: document.getElementById("panelBody"),
  ptypeChecks: Array.from(document.querySelectorAll(".ptype"))
};

/* ===============================
   DATA STATE
=================================*/

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

  // Handles: YYYY-MM-DD, MM/DD/YYYY, etc.
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
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
}

function getActivePropertyTypes() {
  return new Set(
    els.ptypeChecks.filter((c) => c.checked).map((c) => c.value)
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
  if (p.includes("res")) return "🏠";
  if (p.includes("comm")) return "🏢";
  if (p.includes("multi")) return "🏘️";
  if (p.includes("land")) return "🌾";
  return "📍";
}

function makeIcon(row) {
  return L.divIcon({
    className: "",
    html: `<div class="marker ${txClass(row["Transaction Type"])}" title="${row["Property Type"] || ""}">
            ${typeEmoji(row["Property Type"])}
          </div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -30]
  });
}

function buildPopup(row) {
  const price = parseSoldPrice(row["Sold Price"]);
  const dt = parseDate(row["Sold Date"]);

  const photo = (row["PhotoURL"] || row["Photo Url"] || row["Photo"] || "").toString().trim();
  const imgHtml = photo
    ? `<div class="photo"><img src="${photo}" alt="Property photo" loading="lazy"/></div>`
    : "";

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
   REFRESH (CORE LOGIC)
=================================*/

function refresh() {
  cluster.clearLayers();
  plottedMarkers = [];

  const heatPoints = [];
  let volume = 0;

  let buyerCount = 0,
    sellerCount = 0,
    unknownCount = 0;

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

    heatPoints.push([lat, lng, 1]);

    const price = parseSoldPrice(row["Sold Price"]);
    if (price != null) volume += price;

    const cls = txClass(row["Transaction Type"]);
    if (cls === "buyer") buyerCount++;
    else if (cls === "seller") sellerCount++;
    else unknownCount++;

    const marker = L.marker([lat, lng], { icon: makeIcon(row) });
    marker.bindPopup(buildPopup(row), { maxWidth: 320 });

    cluster.addLayer(marker);
    plottedMarkers.push(marker);
    plotted++;
  }

  els.stats.textContent = `${plotted.toLocaleString()} pinned • ${missing.toLocaleString()} missing coords • ${total.toLocaleString()} total`;

  if (els.kpiVolume) {
    const label = activeYear === "all" ? "Volume" : `Volume (${activeYear})`;
    els.kpiVolume.textContent = `${label}: ${fmtMoney(volume)}`;
  }

  if (els.panelBody) {
    els.panelBody.innerHTML = `
      <div class="row"><span>Buyer</span><b>${buyerCount.toLocaleString()}</b></div>
      <div class="row"><span>Seller</span><b>${sellerCount.toLocaleString()}</b></div>
      <div class="row"><span>Unknown</span><b>${unknownCount.toLocaleString()}</b></div>
    `;
  }

  heatLayer.setLatLngs(heatPoints);

  if (plotted > 0 && !hasAutoZoomed) {
    const group = L.featureGroup(plottedMarkers);
    map.fitBounds(group.getBounds().pad(0.12));
    hasAutoZoomed = true;
  }
}

/* ===============================
   LOAD DATA
=================================*/

function populateYearDropdown() {
  const years = Array.from(availableYears).sort((a, b) => b - a);
  els.yearSelect.innerHTML = '<option value="all">All</option>';

  years.forEach((y) => {
    const opt = document.createElement("option");
    opt.value = String(y);
    opt.textContent = String(y);
    els.yearSelect.appendChild(opt);
  });
}

function loadData() {
  if (els.stats) els.stats.textContent = "Loading…";

  Papa.parse(DATA_URL, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      allRows = results.data || [];

      availableYears = new Set();
      allRows.forEach((row) => {
        const dt = parseDate(row["Sold Date"]);
        if (dt) availableYears.add(dt.getFullYear());
      });

      populateYearDropdown();
      refresh();
    },
    error: (err) => {
      console.error(err);
      if (els.stats) els.stats.textContent = "Failed to load data_combined.csv";
    }
  });
}

if (els.yearSelect) els.yearSelect.addEventListener("change", refresh);
els.ptypeChecks.forEach((c) => c.addEventListener("change", refresh));

loadData();
