const DATA_URL = "./data/mesh_1km_enriched_estimated_web.csv.gz";
const META_URL = "./data/metadata.json";
const FACILITY_URL = "./data/facilities_web.json?v=20260712-aggregated";

const metrics = [
  { key: "population_total_2020", label: "2020 总人口", unit: "人", palette: "population", sourceType: "官方" },
  { key: "estimated_population_total_2024", label: "2024 总人口", unit: "人", palette: "population", sourceType: "估算" },
  { key: "establishments_total_2021", label: "2021 全产业事业所数", unit: "个", palette: "industry", sourceType: "官方" },
  { key: "establishments_secondary_2021", label: "2021 第二产业事业所数", unit: "个", palette: "industry", sourceType: "官方" },
  { key: "establishments_manufacturing_2021", label: "2021 制造业事业所数", unit: "个", palette: "industry", sourceType: "官方" },
  { key: "employees_total_2021", label: "2021 全产业从业者数", unit: "人", palette: "industry", sourceType: "官方" },
  { key: "employees_manufacturing_2021", label: "2021 制造业从业者数", unit: "人", palette: "industry", sourceType: "官方" },
  { key: "employees_information_communications_2021", label: "2021 信息通信业从业者数", unit: "人", palette: "industry", sourceType: "官方" },
  { key: "employees_transport_postal_2021", label: "2021 运输邮政业从业者数", unit: "人", palette: "industry", sourceType: "官方" },
  { key: "employees_medical_welfare_2021", label: "2021 医疗福祉从业者数", unit: "人", palette: "industry", sourceType: "官方" },
  { key: "employees_professional_technical_services_2021", label: "2021 专业技术服务业从业者数", unit: "人", palette: "industry", sourceType: "官方" },
  { key: "establishments_accommodation_food_services_2021", label: "2021 住宿餐饮事业所数", unit: "个", palette: "industry", sourceType: "官方" },
  { key: "estimated_power_total_1000kwh_2024", label: "2024 电力需求", unit: "MWh", palette: "energy", sourceType: "估算" },
  { key: "estimated_high_voltage_demand_ratio_2024", label: "2024 高压需求占比", unit: "%", palette: "energy", sourceType: "估算" },
  { key: "estimated_load_importance_score", label: "负荷重要性评分", unit: "分", palette: "energy", sourceType: "估算" },
  { key: "estimated_industrial_land_ha_2023", label: "2023 工业用地", unit: "ha", palette: "land", sourceType: "估算" },
];

async function fetchTextMaybeGzip(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  if (!url.endsWith(".gz")) {
    return response.text();
  }
  if (!("DecompressionStream" in window)) {
    throw new Error("当前浏览器不支持 gzip 本地解压，请使用新版 Chrome、Edge 或 Safari 打开。");
  }
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

const canvas = document.getElementById("meshCanvas");
const ctx = canvas.getContext("2d", { alpha: false });
const metricSelect = document.getElementById("metricSelect");
const meshSearch = document.getElementById("meshSearch");
const facilitySearchInput = document.getElementById("facilitySearchInput");
const facilitySearchResults = document.getElementById("facilitySearchResults");
const substationToggle = document.getElementById("substationToggle");
const generationToggle = document.getElementById("generationToggle");
const facilityLevelInputs = Array.from(document.querySelectorAll("[data-facility-kind][data-level]"));
const searchButton = document.getElementById("searchButton");
const resetButton = document.getElementById("resetButton");
const loadStatus = document.getElementById("loadStatus");
const viewportStatus = document.getElementById("viewportStatus");
const detailTitle = document.getElementById("detailTitle");
const detailSub = document.getElementById("detailSub");
const detailList = document.getElementById("detailList");

let rows = [];
let rowByCode = new Map();
let facilities = [];
let facilityById = new Map();
let facilitySummary = null;
let selected = null;
let hovered = null;
let selectedKind = "mesh";
let hoveredKind = "mesh";
let bounds = null;
let view = { scale: 1, offsetX: 0, offsetY: 0 };
let base = { scale: 1, offsetX: 0, offsetY: 0 };
let isDragging = false;
let dragStart = null;
let needsRender = false;
let activeMetric = metrics[0];

const levelColors = {
  S: "#c93f2d",
  A: "#e28d32",
  B: "#d2b23f",
  C: "#2f8f78",
  D: "#4b7fb3",
  U: "#7d748f",
};

function parseCSV(text) {
  const lines = text.trimEnd().split(/\r?\n/);
  const headers = lines.shift().split(",");
  return lines.map((line) => {
    const parts = line.split(",");
    const item = {};
    headers.forEach((header, index) => {
      item[header] = parts[index] ?? "";
    });
    return item;
  });
}

function numberValue(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatNumber(value, unit = "") {
  const n = numberValue(value);
  if (n == null) return "-";
  if (unit === "%") return `${Math.round(n * 100).toLocaleString("zh-CN")}%`;
  return `${Math.round(n).toLocaleString("zh-CN")}${unit}`;
}

function prepareRows(rawRows) {
  rows = rawRows
    .map((row) => {
      const item = {
        mesh_code: row.mesh_code,
        center_lon: Number(row.center_lon),
        center_lat: Number(row.center_lat),
        bbox_min_lon: Number(row.bbox_min_lon),
        bbox_min_lat: Number(row.bbox_min_lat),
        bbox_max_lon: Number(row.bbox_max_lon),
        bbox_max_lat: Number(row.bbox_max_lat),
      };
      for (const metric of metrics) {
        item[metric.key] = numberValue(row[metric.key]);
      }
      item.population_male_2020 = numberValue(row.population_male_2020);
      item.population_female_2020 = numberValue(row.population_female_2020);
      item.population_15_64_2020 = numberValue(row.population_15_64_2020);
      item.establishments_manufacturing_2021 = numberValue(row.establishments_manufacturing_2021);
      item.establishments_accommodation_food_services_2021 = numberValue(row.establishments_accommodation_food_services_2021);
      item.employees_information_communications_2021 = numberValue(row.employees_information_communications_2021);
      item.employees_transport_postal_2021 = numberValue(row.employees_transport_postal_2021);
      item.employees_professional_technical_services_2021 = numberValue(row.employees_professional_technical_services_2021);
      item.employees_medical_welfare_2021 = numberValue(row.employees_medical_welfare_2021);
      item.employees_male_total_2021 = numberValue(row.employees_male_total_2021);
      item.employees_female_total_2021 = numberValue(row.employees_female_total_2021);
      item.estimated_high_voltage_demand_ratio_2024 = numberValue(row.estimated_high_voltage_demand_ratio_2024);
      item.municipality_code_for_allocation = row.municipality_code_for_allocation || "";
      item.allocation_prefecture_name = row.allocation_prefecture_name || "";
      item.allocation_municipality_name = row.allocation_municipality_name || "";
      item.allocation_confidence = row.allocation_confidence || "";
      item.power_low_2024_target_match = row.power_low_2024_target_match || "";
      item.industrial_land_2023_target_match = row.industrial_land_2023_target_match || "";
      return item;
    })
    .filter((row) => Number.isFinite(row.center_lon) && Number.isFinite(row.center_lat));

  computeEstimatedLoadImportanceScores();
  rowByCode = new Map(rows.map((row) => [row.mesh_code, row]));
  bounds = rows.reduce(
    (acc, row) => ({
      minLon: Math.min(acc.minLon, row.bbox_min_lon),
      minLat: Math.min(acc.minLat, row.bbox_min_lat),
      maxLon: Math.max(acc.maxLon, row.bbox_max_lon),
      maxLat: Math.max(acc.maxLat, row.bbox_max_lat),
    }),
    { minLon: Infinity, minLat: Infinity, maxLon: -Infinity, maxLat: -Infinity }
  );
}

function prepareFacilities(payload) {
  facilitySummary = payload.summary || {};
  facilities = [...(payload.substations || []), ...(payload.generation || [])]
    .map((item) => ({
      ...item,
      lon: Number(item.lon),
      lat: Number(item.lat),
      metadata_count: Number(item.metadata_count || 0),
    }))
    .filter((item) => Number.isFinite(item.lon) && Number.isFinite(item.lat));
  facilityById = new Map(facilities.map((item) => [item.node_id, item]));
}

function facilitySearchFields(facility) {
  return [facility.name_zh, facility.name_ja, facility.short_name, facility.operator, facility.node_id].filter(Boolean).map((value) => String(value).toLocaleLowerCase());
}
function searchFacilities(query) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [];
  return facilities.map((facility) => {
    const fields = facilitySearchFields(facility);
    const exact = fields.some((field) => field === normalized);
    const prefix = fields.some((field) => field.startsWith(normalized));
    const index = fields.reduce((best, field) => Math.min(best, field.indexOf(normalized)), Infinity);
    return { facility, score: exact ? 0 : prefix ? 1 : 2, index };
  }).filter((item) => item.index !== Infinity).sort((a, b) => a.score - b.score || a.index - b.index || String(a.facility.name_ja || '').localeCompare(String(b.facility.name_ja || ''))).slice(0, 10).map((item) => item.facility);
}
function renderFacilitySearchResults() {
  const matches = searchFacilities(facilitySearchInput.value);
  facilitySearchResults.innerHTML = matches.map((facility, index) => {
    const name = escapeHTML(facility.name_zh || facility.name_ja || facility.node_id);
    const japaneseName = facility.name_ja && facility.name_ja !== facility.name_zh ? '<span>' + escapeHTML(facility.name_ja) + '</span>' : '';
    const kind = facility.facility_type === 'substation' ? '变电站' : '发电站';
    const aggregate = facility.display_node_count ? ' · 聚合 ' + facility.display_node_count + ' 个原始节点' : '';
    return '<button type="button" class="facility-search-option" data-index="' + index + '" role="option"><strong>' + name + '</strong>' + japaneseName + '<small>' + kind + ' · ' + escapeHTML(facility.operator || '运营方未记录') + aggregate + '</small></button>';
  }).join('');
  facilitySearchResults.hidden = matches.length === 0;
  facilitySearchResults.querySelectorAll('.facility-search-option').forEach((option) => option.addEventListener('click', () => selectFacilityFromSearch(matches[Number(option.dataset.index)])));
}
function selectFacilityFromSearch(facility) {
  if (!facility) return;
  if (facility.facility_type === 'substation') substationToggle.checked = true;
  if (facility.facility_type === 'generation') generationToggle.checked = true;
  const level = facilityLevel(facility);
  const levelInput = facilityLevelInputs.find((input) => input.dataset.facilityKind === facility.facility_type && input.dataset.level === level);
  if (levelInput) levelInput.checked = true;
  facilitySearchInput.value = facility.name_zh || facility.name_ja || facility.node_id;
  facilitySearchResults.hidden = true;
  focusFacility(facility);
}
function computeEstimatedLoadImportanceScores() {
  const powerRows = rows
    .filter((row) => row.estimated_power_total_1000kwh_2024 != null && row.estimated_power_total_1000kwh_2024 > 0)
    .sort((a, b) => a.estimated_power_total_1000kwh_2024 - b.estimated_power_total_1000kwh_2024);
  const ratioRows = rows
    .filter((row) => row.estimated_high_voltage_demand_ratio_2024 != null)
    .sort((a, b) => a.estimated_high_voltage_demand_ratio_2024 - b.estimated_high_voltage_demand_ratio_2024);

  powerRows.forEach((row, index) => {
    row._powerRank = (index + 1) / powerRows.length;
  });
  ratioRows.forEach((row, index) => {
    row._highRatioRank = (index + 1) / ratioRows.length;
  });
  rows.forEach((row) => {
    if (row._powerRank == null && row._highRatioRank == null) {
      row.estimated_load_importance_score = null;
    } else if (row._highRatioRank == null) {
      row.estimated_load_importance_score = row._powerRank * 100;
    } else {
      row.estimated_load_importance_score = (0.75 * row._powerRank + 0.25 * row._highRatioRank) * 100;
    }
  });
}

function setupControls() {
  metricSelect.innerHTML = metrics
    .map((metric) => `<option value="${metric.key}">${metric.sourceType}｜${metric.label}</option>`)
    .join("");
  metricSelect.value = activeMetric.key;
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fitJapan();
}

function fitJapan() {
  if (!bounds) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const pad = Math.max(18, Math.min(w, h) * 0.05);
  const lonSpan = bounds.maxLon - bounds.minLon;
  const latSpan = bounds.maxLat - bounds.minLat;
  const scaleX = (w - pad * 2) / lonSpan;
  const scaleY = (h - pad * 2) / latSpan;
  const scale = Math.min(scaleX, scaleY);
  base = {
    scale,
    offsetX: pad - bounds.minLon * scale + ((w - pad * 2) - lonSpan * scale) / 2,
    offsetY: pad + bounds.maxLat * scale + ((h - pad * 2) - latSpan * scale) / 2,
  };
  view = { ...base };
  requestRender();
}

function worldToScreen(lon, lat) {
  return {
    x: lon * view.scale + view.offsetX,
    y: -lat * view.scale + view.offsetY,
  };
}

function screenToWorld(x, y) {
  return {
    lon: (x - view.offsetX) / view.scale,
    lat: -(y - view.offsetY) / view.scale,
  };
}

function colorFor(value) {
  if (value == null || value <= 0) return "rgba(204, 212, 206, 0.55)";
  const max = activeMetric.max || 1;
  const t = Math.max(0, Math.min(1, Math.log1p(value) / Math.log1p(max)));
  if (activeMetric.palette === "energy") {
    const r = Math.round(245 - t * 114);
    const g = Math.round(190 - t * 118);
    const b = Math.round(125 - t * 101);
    return `rgb(${r},${g},${b})`;
  }
  if (activeMetric.palette === "land") {
    const r = Math.round(196 - t * 91);
    const g = Math.round(207 - t * 101);
    const b = Math.round(143 - t * 86);
    return `rgb(${r},${g},${b})`;
  }
  if (activeMetric.palette === "industry") {
    const r = Math.round(246 - t * 95);
    const g = Math.round(206 - t * 111);
    const b = Math.round(96 - t * 72);
    return `rgb(${r},${g},${b})`;
  }
  const r = Math.round(203 - t * 159);
  const g = Math.round(224 - t * 83);
  const b = Math.round(214 - t * 100);
  return `rgb(${r},${g},${b})`;
}

function computeMetricMax() {
  const values = rows
    .map((row) => row[activeMetric.key])
    .filter((value) => value != null && value > 0)
    .sort((a, b) => a - b);
  activeMetric.max = values.length ? values[Math.floor(values.length * 0.985)] : 1;
}

function requestRender() {
  if (needsRender) return;
  needsRender = true;
  requestAnimationFrame(render);
}

function render() {
  needsRender = false;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#d9e8ed";
  ctx.fillRect(0, 0, w, h);

  const cellPx = Math.max(1, view.scale / 80);
  const drawAsRect = cellPx >= 2.4;
  let visible = 0;

  for (const row of rows) {
    const value = row[activeMetric.key];
    if (value == null) continue;
    const p = worldToScreen(row.center_lon, row.center_lat);
    if (p.x < -6 || p.x > w + 6 || p.y < -6 || p.y > h + 6) continue;
    visible += 1;
    ctx.fillStyle = colorFor(value);
    if (drawAsRect) {
      const a = worldToScreen(row.bbox_min_lon, row.bbox_max_lat);
      const b = worldToScreen(row.bbox_max_lon, row.bbox_min_lat);
      const rw = Math.max(1, b.x - a.x);
      const rh = Math.max(1, b.y - a.y);
      ctx.fillRect(a.x, a.y, rw, rh);
    } else {
      ctx.fillRect(p.x, p.y, 1.25, 1.25);
    }
  }

  drawFacilities();

  if (selected && selectedKind === "mesh") drawHighlight(selected, "#c45536", 2.5);
  if (hovered && hoveredKind === "mesh" && (hovered !== selected || selectedKind !== "mesh")) {
    drawHighlight(hovered, "#1e2728", 1.4);
  }
  if (selected && selectedKind === "facility") drawFacilityMarker(selected, true);
  if (hovered && hoveredKind === "facility" && (hovered !== selected || selectedKind !== "facility")) {
    drawFacilityMarker(hovered, true, "#1e2728");
  }

  const visibleFacilities = countVisibleFacilities();
  viewportStatus.textContent = `${visible.toLocaleString("zh-CN")} 个可见网格 · ${visibleFacilities.toLocaleString("zh-CN")} 个设施`;
}

function drawHighlight(row, stroke, width) {
  const a = worldToScreen(row.bbox_min_lon, row.bbox_max_lat);
  const b = worldToScreen(row.bbox_max_lon, row.bbox_min_lat);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.strokeRect(a.x, a.y, Math.max(4, b.x - a.x), Math.max(4, b.y - a.y));
}

function facilityVisible(facility) {
  if (facility.facility_type === "substation" && !substationToggle.checked) return false;
  if (facility.facility_type === "generation" && !generationToggle.checked) return false;
  const level = facilityLevel(facility);
  return facilityLevelInputs.some(
    (input) => input.dataset.facilityKind === facility.facility_type && input.dataset.level === level && input.checked,
  );
}

function facilityLevel(facility) {
  const level = String(facility.importance_level || "U").toUpperCase();
  return levelColors[level] ? level : "U";
}

function markerRadius(facility) {
  const baseSize = facility.facility_type === "substation" ? 4.2 : 3.2;
  const levelBoost = facility.importance_level === "S" ? 2.2 : facility.importance_level === "A" ? 1.5 : facility.importance_level === "B" ? 0.8 : 0;
  const metadataBoost = facility.metadata_count > 0 ? 0.8 : 0;
  return Math.max(2.4, Math.min(8, baseSize + levelBoost + metadataBoost));
}

function facilityColor(facility) {
  return levelColors[facilityLevel(facility)] || levelColors.U;
}

function drawFacilityMarker(facility, emphasized = false, overrideStroke = "") {
  const p = worldToScreen(facility.lon, facility.lat);
  const radius = markerRadius(facility) * (emphasized ? 1.45 : 1);
  ctx.beginPath();
  if (facility.facility_type === "substation") {
    ctx.rect(p.x - radius, p.y - radius, radius * 2, radius * 2);
  } else {
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  }
  ctx.fillStyle = facilityColor(facility);
  ctx.strokeStyle = overrideStroke || (emphasized ? "#1e2728" : "rgba(255,255,255,0.9)");
  ctx.lineWidth = emphasized ? 2.2 : 1.2;
  ctx.fill();
  ctx.stroke();
}

function drawFacilities() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  for (const facility of facilities) {
    if (!facilityVisible(facility)) continue;
    const p = worldToScreen(facility.lon, facility.lat);
    if (p.x < -12 || p.x > w + 12 || p.y < -12 || p.y > h + 12) continue;
    drawFacilityMarker(facility);
  }
}

function countVisibleFacilities() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  let count = 0;
  for (const facility of facilities) {
    if (!facilityVisible(facility)) continue;
    const p = worldToScreen(facility.lon, facility.lat);
    if (p.x >= -12 && p.x <= w + 12 && p.y >= -12 && p.y <= h + 12) count += 1;
  }
  return count;
}

function findNearest(screenX, screenY) {
  const target = screenToWorld(screenX, screenY);
  let best = null;
  let bestDistance = Infinity;
  const tolerance = Math.max(0.025, 10 / view.scale);
  for (const row of rows) {
    if (
      target.lon < row.bbox_min_lon - tolerance ||
      target.lon > row.bbox_max_lon + tolerance ||
      target.lat < row.bbox_min_lat - tolerance ||
      target.lat > row.bbox_max_lat + tolerance
    ) {
      continue;
    }
    const dLon = row.center_lon - target.lon;
    const dLat = row.center_lat - target.lat;
    const d = dLon * dLon + dLat * dLat;
    if (d < bestDistance) {
      bestDistance = d;
      best = row;
    }
  }
  return best;
}

function findNearestFacility(screenX, screenY) {
  let best = null;
  let bestDistance = Infinity;
  const tolerance = 11;
  for (const facility of facilities) {
    if (!facilityVisible(facility)) continue;
    const p = worldToScreen(facility.lon, facility.lat);
    const d = Math.hypot(p.x - screenX, p.y - screenY);
    if (d <= tolerance && d < bestDistance) {
      bestDistance = d;
      best = facility;
    }
  }
  return best;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function detailRows(items) {
  return items.map(([k, v]) => `<dt>${escapeHTML(k)}</dt><dd>${escapeHTML(v)}</dd>`).join("");
}

function updateDetail(row) {
  document.getElementById("facilityMeta")?.remove();
  if (!row) {
    detailTitle.textContent = "未选择网格";
    detailSub.textContent = "点击地图查看详情";
    detailList.innerHTML = "";
    return;
  }
  detailTitle.textContent = row.mesh_code;
  detailSub.textContent = `${row.center_lon.toFixed(5)}, ${row.center_lat.toFixed(5)}`;
  const items = [
    ["当前指标类型", activeMetric.sourceType],
    ["分配行政区代码", row.municipality_code_for_allocation || "-"],
    ["分配行政区", `${row.allocation_prefecture_name || ""} ${row.allocation_municipality_name || ""}`.trim() || "-"],
    ["当前指标", formatNumber(row[activeMetric.key], activeMetric.unit)],
    ["2020 总人口", formatNumber(row.population_total_2020, "人")],
    ["估算 2024 总人口", formatNumber(row.estimated_population_total_2024, "人")],
    ["2021 全产业事业所", formatNumber(row.establishments_total_2021, "个")],
    ["2021 第二产业事业所", formatNumber(row.establishments_secondary_2021, "个")],
    ["2021 制造业事业所", formatNumber(row.establishments_manufacturing_2021, "个")],
    ["2021 全产业从业者", formatNumber(row.employees_total_2021, "人")],
    ["2021 制造业从业者", formatNumber(row.employees_manufacturing_2021, "人")],
    ["2021 信息通信业从业者", formatNumber(row.employees_information_communications_2021, "人")],
    ["2021 运输邮政业从业者", formatNumber(row.employees_transport_postal_2021, "人")],
    ["2021 医疗福祉从业者", formatNumber(row.employees_medical_welfare_2021, "人")],
    ["2021 专业技术服务业从业者", formatNumber(row.employees_professional_technical_services_2021, "人")],
    ["2021 住宿餐饮事业所", formatNumber(row.establishments_accommodation_food_services_2021, "个")],
    ["估算 2024 电力需求", formatNumber(row.estimated_power_total_1000kwh_2024, "MWh")],
    ["估算高压需求占比", formatNumber(row.estimated_high_voltage_demand_ratio_2024, "%")],
    ["负荷重要性评分", formatNumber(row.estimated_load_importance_score, "分")],
    ["估算 2023 工业用地", formatNumber(row.estimated_industrial_land_ha_2023, "ha")],
    ["电力分配口径", row.power_low_2024_target_match || "-"],
    ["工业用地分配口径", row.industrial_land_2023_target_match || "-"],
    ["估算可信度", row.allocation_confidence || "-"],
  ];
  detailList.innerHTML = detailRows(items);
}

function formatFacilityValue(value, unit = "") {
  if (Array.isArray(value)) {
    const parts = value
      .filter((item) => item !== "" && item != null && Number(item) !== 0)
      .map((item) => {
        const n = Number(item);
        return Number.isFinite(n) ? `${Math.round(n).toLocaleString("zh-CN")}${unit}` : item;
      });
    return parts.join(" / ") || "-";
  }
  if (value === "" || value == null) return "-";
  const n = Number(value);
  if (Number.isFinite(n)) return `${Math.round(n).toLocaleString("zh-CN")}${unit}`;
  return value;
}

function updateFacilityDetail(facility) {
  document.getElementById("facilityMeta")?.remove();
  detailTitle.textContent = facility.name_zh || facility.name_ja || facility.node_id;
  detailSub.textContent = `${facility.facility_type === "substation" ? "变电站" : "发电站"} · ${facility.node_id} · ${facility.lon.toFixed(5)}, ${facility.lat.toFixed(5)}`;
  const baseRows = [
    ["日文名", facility.name_ja || "-"],
    ["运营方", facility.operator || "-"],
    ["重要等级", facility.importance_level || "-"],
    ["所在地", `${facility.prefecture || ""} ${facility.municipality || ""}`.trim() || "-"],
  ];
  if (facility.facility_type === "substation") {
    baseRows.push(
      ["最高电压", formatFacilityValue(facility.max_voltage_kv, "kV")],
      ["电压等级", formatFacilityValue(facility.voltage_levels_kv, "kV")],
      ["频率", formatFacilityValue(facility.frequency, "Hz")],
      ["AC/DC", facility.ac_dc || "-"],
      ["变压器容量", formatFacilityValue(facility.transformer_capacity_mva, "MVA")]
    );
  } else {
    baseRows.push(
      ["能源类型", facility.energy_type || "-"],
      ["装机容量", formatFacilityValue(facility.capacity_mw, "MW")],
      ["状态", facility.status || "-"]
    );
  }
  baseRows.push(
    ["元数据数量", facility.metadata_count ? `${facility.metadata_count} 条` : "0 条"],
    ["重要性说明", facility.importance_reason || "-"]
  );
  if (facility.display_node_count) {
    baseRows.splice(baseRows.length - 1, 0, ["聚合原始节点", `${facility.display_node_count} 个`]);
  }
  detailList.innerHTML = detailRows(baseRows);

  const docs = facility.documents || [];
  const facts = facility.facts || [];
  const metaHTML = [
    renderMetaSection("事件 / 事实", facts),
    renderMetaSection("来源 / 新闻 / 技术资料", docs),
  ].join("");
  detailList.insertAdjacentHTML("afterend", `<div id="facilityMeta" class="meta-section">${metaHTML}</div>`);
}

function renderMetaSection(title, items) {
  if (!items.length) {
    return `<h3>${escapeHTML(title)}</h3><div class="meta-card"><p>暂无已挂接元数据</p></div>`;
  }
  return `<h3>${escapeHTML(title)}</h3>${items.map(renderMetaCard).join("")}`;
}

function renderMetaCard(item) {
  const title = item.title || item.summary || item.source_name || "未命名来源";
  const url = item.url || "";
  const evidence = item.evidence || item.summary || "";
  const sourceName = item.source_name || (item.source_url ? item.source_url.replace(/^https?:\/\//, "").split("/")[0] : "") || "来源未记录";
  const sourceType = item.source_type || "类型未记录";
  const publishedAt = item.published_at || item.event_time || item.source_publish_time_normalized || "";
  const dateLabel = item.date_status === "inferred" ? "推断日期" : "时间";
  const runName = item.run_name || "";
  const tags = [item.confidence, item.event_type, item.event_hits, item.status]
    .filter(Boolean)
    .slice(0, 4);
  const titleHTML = url
    ? `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(title)}</a>`
    : escapeHTML(title);
  const localTextPath = item.local_text_path || "";
  const localTextHTML = localTextPath
    ? `<a class="meta-local-link" href="${escapeHTML(localTextPath)}" target="_blank" rel="noopener noreferrer">查看本地纯文本</a>`
    : "";
  return `
    <div class="meta-card">
      <strong>${titleHTML}</strong>
      <div class="meta-source">
        <span>来源：${escapeHTML(sourceName)}</span>
        <span>类型：${escapeHTML(sourceType)}</span>
        ${publishedAt ? `<span>${dateLabel}：${escapeHTML(publishedAt)}</span>` : ""}
        ${runName ? `<span>批次：${escapeHTML(runName)}</span>` : ""}
      </div>
      ${evidence ? `<p>${escapeHTML(evidence)}</p>` : ""}
      ${localTextHTML}
      <div class="meta-tags">${tags.map((tag) => `<span>${escapeHTML(tag)}</span>`).join("")}</div>
    </div>
  `;
}

function focusRow(row) {
  if (!row) return;
  selected = row;
  selectedKind = "mesh";
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  view.scale = Math.max(view.scale, base.scale * 12);
  view.offsetX = w * 0.48 - row.center_lon * view.scale;
  view.offsetY = h * 0.52 + row.center_lat * view.scale;
  updateDetail(row);
  requestRender();
}

function focusFacility(facility) {
  if (!facility) return;
  selected = facility;
  selectedKind = "facility";
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  view.scale = Math.max(view.scale, base.scale * 18);
  view.offsetX = w * 0.48 - facility.lon * view.scale;
  view.offsetY = h * 0.52 + facility.lat * view.scale;
  updateFacilityDetail(facility);
  requestRender();
}

function exposeReadOnlyDebugApi() {
  window.meshViewer = {
    getState() {
      return {
        rowCount: rows.length,
        facilityCount: facilities.length,
        selectedKind,
        selectedMeshCode: selectedKind === "mesh" ? selected?.mesh_code ?? null : null,
        selectedFacilityId: selectedKind === "facility" ? selected?.node_id ?? null : null,
        activeMetric: activeMetric.key,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
      };
    },
    getTopMesh(metricKey = "population_total_2020") {
      return rows.reduce((best, row) => {
        const value = row[metricKey] || 0;
        const bestValue = best?.[metricKey] || 0;
        return value > bestValue ? row : best;
      }, null);
    },
    screenPointForMesh(meshCode) {
      const row = rowByCode.get(meshCode);
      if (!row) return null;
      return worldToScreen(row.center_lon, row.center_lat);
    },
  };
}

function handleFacilityFilterChange() {
  if (selectedKind === "facility" && selected && !facilityVisible(selected)) {
    selected = null;
    selectedKind = "mesh";
    updateDetail(null);
  }
  hovered = null;
  hoveredKind = "mesh";
  requestRender();
}

function wireEvents() {
  metricSelect.addEventListener("change", () => {
    activeMetric = metrics.find((metric) => metric.key === metricSelect.value) || metrics[0];
    computeMetricMax();
    updateDetail(selected);
    requestRender();
  });

  for (const toggle of [substationToggle, generationToggle, ...facilityLevelInputs]) {
    toggle.addEventListener("change", handleFacilityFilterChange);
  }

  resetButton.addEventListener("click", () => {
    selected = null;
    selectedKind = "mesh";
    hovered = null;
    hoveredKind = "mesh";
    view = { ...base };
    updateDetail(null);
    requestRender();
  });

  searchButton.addEventListener("click", () => {
    const row = rowByCode.get(meshSearch.value.trim());
    if (row) focusRow(row);
  });

  meshSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const row = rowByCode.get(meshSearch.value.trim());
      if (row) focusRow(row);
    }
  });

  facilitySearchInput.addEventListener('input', renderFacilitySearchResults);
  facilitySearchInput.addEventListener('focus', renderFacilitySearchResults);
  facilitySearchInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const match = searchFacilities(facilitySearchInput.value)[0];
    if (match) { event.preventDefault(); selectFacilityFromSearch(match); }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.facility-search')) facilitySearchResults.hidden = true;
  });

  canvas.addEventListener("pointerdown", (event) => {
    isDragging = true;
    dragStart = { x: event.clientX, y: event.clientY, offsetX: view.offsetX, offsetY: view.offsetY };
    canvas.classList.add("dragging");
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    if (isDragging && dragStart) {
      view.offsetX = dragStart.offsetX + event.clientX - dragStart.x;
      view.offsetY = dragStart.offsetY + event.clientY - dragStart.y;
      requestRender();
      return;
    }
    hovered = findNearestFacility(event.clientX - rect.left, event.clientY - rect.top);
    hoveredKind = hovered ? "facility" : "mesh";
    if (!hovered) hovered = findNearest(event.clientX - rect.left, event.clientY - rect.top);
    requestRender();
  });

  canvas.addEventListener("pointerup", (event) => {
    const moved =
      dragStart && Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y) > 4;
    isDragging = false;
    dragStart = null;
    canvas.classList.remove("dragging");
    if (!moved) {
      const rect = canvas.getBoundingClientRect();
      const facility = findNearestFacility(event.clientX - rect.left, event.clientY - rect.top);
      if (facility) {
        selected = facility;
        selectedKind = "facility";
        updateFacilityDetail(facility);
      } else {
        selected = findNearest(event.clientX - rect.left, event.clientY - rect.top);
        selectedKind = "mesh";
        updateDetail(selected);
      }
      requestRender();
    }
  });

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const before = screenToWorld(x, y);
      const factor = event.deltaY < 0 ? 1.2 : 1 / 1.2;
      view.scale = Math.max(base.scale * 0.75, Math.min(base.scale * 90, view.scale * factor));
      view.offsetX = x - before.lon * view.scale;
      view.offsetY = y + before.lat * view.scale;
      requestRender();
    },
    { passive: false }
  );

  window.addEventListener("resize", resizeCanvas);
}

async function init() {
  setupControls();
  wireEvents();
  const [csvText, metadata, facilityPayload] = await Promise.all([
    fetchTextMaybeGzip(DATA_URL),
    fetch(META_URL, { cache: "no-store" }).then((res) => res.json()),
    fetch(FACILITY_URL, { cache: "no-store" }).then((res) => res.json()),
  ]);
  prepareRows(parseCSV(csvText));
  prepareFacilities(facilityPayload);
  exposeReadOnlyDebugApi();
  computeMetricMax();
  loadStatus.textContent =
    `${metadata.row_count.toLocaleString("zh-CN")} 个官方 mesh · ` +
    `${facilitySummary.substations.toLocaleString("zh-CN")} 个变电站 · ` +
    `${facilitySummary.generation.toLocaleString("zh-CN")} 个发电站`;
  resizeCanvas();
}

init().catch((error) => {
  console.error(error);
  loadStatus.textContent = "加载失败";
});
