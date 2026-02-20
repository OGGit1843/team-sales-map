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
  const openStandalone = frag.querySelector("#hgOpenStandalone");

  if (openStandalone) openStandalone.href = window.location.href;

  window.map.getContainer().appendChild(openBtn);

  L.DomEvent.disableClickPropagation(openBtn);
  L.DomEvent.disableScrollPropagation(openBtn);

  const HgControl = L.Control.extend({
    options: { position: "bottomleft" },
    onAdd: function () {
      const container = L.DomUtil.create("div", "hg-wrap");
      container.classList.add("hg-control");
      container.appendChild(panel);
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

  window.map.on("click", closePanel);
}
mountLeafletUI();

/* ===============================
   BASEMAPS
=================================*/

const voyager = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  {
    maxZoom: 19,
    attribution: "© CARTO © OpenStreetMap contributors"
  }
);

const voyagerLabels = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png",
  { maxZoom: 19 }
);

const voyagerBase = L.layerGroup([voyager]);

const dark = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  {
    maxZoom: 19,
    attribution: "© CARTO © OpenStreetMap contributors"
  }
);

voyagerBase.addTo(window.map);

L.control.layers(
  {
    "Voyager (Google-like)": voyagerBase,
    "Dark": dark
  },
  {},
  { position: "topright" }
).addTo(window.map);

/* ===============================
   CLUSTER
=================================*/
const cluster = L.markerClusterGroup({
  showCoverageOnHover: false,
  maxClusterRadius: 28,
  disableClusteringAtZoom: 14,
  spiderfyOnMaxZoom: true
});
window.map.addLayer(cluster);

/* ===============================
   DATA / FILTERING
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

  let total = 0, plotted = 0, missing = 0;

  for (const row of allRows) {
    total++;

    if (!activeTypes.has(row["Property Type"])) continue;

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
    marker.bindPopup(buildPopup(row));
    cluster.addLayer(marker);

    plottedMarkers.push(marker);
    plotted++;
  }

  els.stats.textContent =
    `${plotted} pinned • ${missing} missing coords • ${total} total`;

  if (plotted > 0 && !hasAutoZoomed) {
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
