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
   UI PANEL
=================================*/
function stop(e) {
  L.DomEvent.stopPropagation(e);
  L.DomEvent.preventDefault(e);
}

function mountLeafletUI() {
  const tpl = document.getElementById("uiTemplate");
  const frag = tpl.content.cloneNode(true);

  const panel = frag.querySelector("#hgPanel");
  const openBtn = frag.querySelector("#hgOpenBtn");
  const closeBtn = frag.querySelector("#hgCloseBtn");
  const topbar = frag.querySelector("#hgTopbar");

  // Add the topbar (mobile) and the open button into the map container
  if (topbar) window.map.getContainer().appendChild(topbar);

  L.DomEvent.disableClickPropagation(openBtn);
  L.DomEvent.disableScrollPropagation(openBtn);

  // Leaflet control for the panel content
  const HgControl = L.Control.extend({
    options: { position: "topleft" }, // actual mobile positioning is handled by CSS (fixed)
    onAdd: function () {
      const container = L.DomUtil.create("div", "hg-wrap");
      container.classList.add("hg-control");
      container.appendChild(panel);

      // Prevent map interactions while touching panel
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);
      return container;
    }
  });

  window.map.addControl(new HgControl());

  function openPanel() { panel.classList.add("is-open"); }
  function closePanel() { panel.classList.remove("is-open"); }

  openBtn.addEventListener("click", (e) => { stop(e); openPanel(); });
  closeBtn.addEventListener("click", (e) => { stop(e); closePanel(); });

  // ✅ Recommended change: only close when clicking the map background, not UI
  window.map.on("click", (e) => {
    const t = e?.originalEvent?.target;
    if (!t) return closePanel();

    // If click was inside our UI, don't close
    if (t.closest && (t.closest(".hg-panel") || t.closest(".hg-topbar") || t.closest(".leaflet-control"))) {
      return;
    }
    closePanel();
  });
}
mountLeafletUI();

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
    {
      maxZoom: 20,
      attribution: MAPTILER_ATTR
    }
  );
}

// MapTiler styles
const mtStreet = maptilerLayer("streets-v2");
const mtWinter = maptilerLayer("winter-v2");
const mtHybrid = maptilerLayer("hybrid");

// Existing basemaps
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

// Default layer
esriStreet.addTo(window.map);

// Layer switcher (ordered)
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
   DATA / FILTERING
=================================*/
const els = {
  yearSelect: document.getElementById("yearSelect"),
  ptypeChecks: Array.from(document.querySelectorAll(".ptype"))
};

let allRows = [];
let plottedMarkers = [];
let availableYears = new Set();
let hasAutoZoomed = false;

function parseDate(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
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
    cluster.addLayer(marker);

    plottedMarkers.push(marker);
  }

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

els.yearSelect.addEventListener("change", refresh);
els.ptypeChecks.forEach(c => c.addEventListener("change", refresh));

loadData();
