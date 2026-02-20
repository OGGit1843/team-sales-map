// Hance Group Team Sales Map (Leaflet)
const DATA_URL = "./data_combined.csv";

/* ===============================
   MAP INIT
=================================*/
window.map = L.map("map", {
  fullscreenControl: true,
  fullscreenControlOptions: { position: "topleft" }
}).setView([39.96, -82.99], 10);

window.map.on("enterFullscreen", () => {
  document.body.classList.add("hg-fs");
  setTimeout(() => window.map.invalidateSize(), 50);
});
window.map.on("exitFullscreen", () => {
  document.body.classList.remove("hg-fs");
  setTimeout(() => window.map.invalidateSize(), 50);
});

/* ===============================
   BASEMAPS
=================================*/

// --- MapTiler
const MAPTILER_KEY = "PlAce3rug9We1IN6yy2W";

const MAPTILER_ATTR =
  '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> ' +
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';

function maptilerLayer(mapId) {
  return L.tileLayer(
    `https://api.maptiler.com/maps/${mapId}/256/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`,
    { maxZoom: 20, attribution: MAPTILER_ATTR }
  );
}

const mtStreet = maptilerLayer("streets-v2");
const mtWinter = maptilerLayer("winter-v2");
const mtHybrid = maptilerLayer("hybrid");

const esriStreet = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19, attribution: "Tiles © Esri" }
);

const muted = L.tileLayer(
  "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
  { maxZoom: 19, attribution: "© OpenStreetMap contributors" }
);

const esriSatellite = L.tileLayer(
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19, attribution: "Tiles © Esri" }
);

const esriLabels = L.tileLayer(
  "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19 }
);

const satBase = L.layerGroup([esriSatellite, esriLabels]);

// Default
mtHybrid.addTo(window.map);

// Layer order
L.control.layers(
  {
    "MapTiler Street": mtStreet,
    "Street (Google-like)": esriStreet,
    "Muted": muted,
    "MapTiler Winter": mtWinter,
    "MapTiler Hybrid": mtHybrid,
    "Satellite + Labels": satBase
  },
  {},
  { position: "topleft" }
).addTo(window.map);

/* ===============================
   CLUSTER
=================================*/
const cluster = L.markerClusterGroup({
  showCoverageOnHover: false,
  maxClusterRadius: 45
});
window.map.addLayer(cluster);

/* ===============================
   DATA / FILTERING + SEARCH
=================================*/
const els = {
  yearSelect: document.getElementById("yearSelect"),
  ptypeChecks: Array.from(document.querySelectorAll(".ptype")),
  searchInput: document.getElementById("searchInput"),
  searchNext: document.getElementById("searchNext"),
  searchCount: document.getElementById("searchCount")
};

let allRows = [];
let plottedMarkers = [];
let availableYears = new Set();
let hasAutoZoomed = false;

let searchMatches = [];
let searchIndex = -1;

function parseDate(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function normalize(s) {
  return String(s || "").trim().toLowerCase();
}

function getActivePropertyTypes() {
  return new Set(els.ptypeChecks.filter(c => c.checked).map(c => c.value));
}

function makeIcon(row) {
  const emoji =
    row["Property Type"]?.includes("Residential") ? "🏠" :
    row["Property Type"]?.includes("Commercial") ? "🏢" :
    row["Property Type"]?.includes("Multi") ? "🏘️" :
    row["Property Type"]?.includes("Land") ? "🌾" : "📍";

  const cls =
    row["Transaction Type"]?.toLowerCase().includes("seller") ? "seller" :
    row["Transaction Type"]?.toLowerCase().includes("buyer") ? "buyer" :
    "unknown";

  return L.divIcon({
    html: `<div class="marker ${cls}">${emoji}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -30]
  });
}

function buildPopup(row) {
  return `
    <div class="popup">
      <div class="addr"><strong>${row["Full Address"] || ""}</strong></div>
      <div class="meta">
        <div><span>Type:</span> ${row["Transaction Type"] || ""}</div>
        <div><span>Property:</span> ${row["Property Type"] || ""}</div>
        <div><span>Sold:</span> ${row["Sold Price"] || ""}</div>
        <div><span>Date:</span> ${row["Sold Date"] || ""}</div>
      </div>
    </div>
  `;
}

function focusMarker(marker) {
  const ll = marker.getLatLng();
  window.map.setView(ll, Math.max(window.map.getZoom(), 15), { animate: true });
  marker.openPopup();
}

function updateSearchCount() {
  if (!els.searchCount) return;

  if (!normalize(els.searchInput?.value)) {
    els.searchCount.textContent = "";
    return;
  }

  if (searchMatches.length === 0) {
    els.searchCount.textContent = "0/0";
    return;
  }

  els.searchCount.textContent = `${searchIndex + 1}/${searchMatches.length}`;
}

function rebuildSearchMatches() {
  const q = normalize(els.searchInput?.value);
  searchMatches = [];
  searchIndex = -1;

  if (!q) {
    updateSearchCount();
    return;
  }

  searchMatches = plottedMarkers.filter(m =>
    (m.__searchText || "").includes(q)
  );

  updateSearchCount();
}

function goToNextMatch() {
  if (searchMatches.length === 0) {
    rebuildSearchMatches();
    if (searchMatches.length === 0) return;
  }

  searchIndex = (searchIndex + 1) % searchMatches.length;
  updateSearchCount();

  const marker = searchMatches[searchIndex];
  cluster.zoomToShowLayer(marker, () => focusMarker(marker));
}

function refresh() {
  cluster.clearLayers();
  plottedMarkers = [];

  const activeTypes = getActivePropertyTypes();
  const activeYear = els.yearSelect.value;

  for (const row of allRows) {
    if (!activeTypes.has(row["Property Type"])) continue;

    const lat = Number(row["Latitude"]);
    const lng = Number(row["Longitude"]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const dt = parseDate(row["Sold Date"]);
    const year = dt ? String(dt.getFullYear()) : null;
    if (activeYear !== "all" && year !== activeYear) continue;

    const marker = L.marker([lat, lng], { icon: makeIcon(row) });
    marker.bindPopup(buildPopup(row));

    marker.__searchText = normalize(row["Full Address"]);

    cluster.addLayer(marker);
    plottedMarkers.push(marker);
  }

  rebuildSearchMatches();

  if (plottedMarkers.length > 0 && !hasAutoZoomed) {
    const group = L.featureGroup(plottedMarkers);
    window.map.fitBounds(group.getBounds().pad(0.12));
    hasAutoZoomed = true;
  }
}

function populateYearDropdown() {
  const years = Array.from(availableYears).sort((a, b) => b - a);
  els.yearSelect.innerHTML = '<option value="all">All</option>';
  for (const y of years) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    els.yearSelect.appendChild(opt);
  }
}

function loadData() {
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
    }
  });
}

// Filters
els.yearSelect.addEventListener("change", refresh);
els.ptypeChecks.forEach(c => c.addEventListener("change", refresh));

// Search events
if (els.searchInput) {
  let t = null;

  els.searchInput.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(rebuildSearchMatches, 200);
  });

  els.searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      goToNextMatch();
    }
  });
}

if (els.searchNext) {
  els.searchNext.addEventListener("click", goToNextMatch);
}

loadData();
