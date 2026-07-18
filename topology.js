const TOPOLOGY_URL = "./data/topology_balanced_v2.json.gz";

const mapViewButton = document.getElementById("mapViewButton");
const topologyViewButton = document.getElementById("topologyViewButton");
const mapToolbar = document.getElementById("mapToolbar");
const topologyToolbar = document.getElementById("topologyToolbar");
const mapPane = document.getElementById("mapPane");
const mapLegend = document.getElementById("mapLegend");
const topologyLegend = document.getElementById("topologyLegend");
const mapStatusbar = document.getElementById("mapStatusbar");
const topologyStatusbar = document.getElementById("topologyStatusbar");
const topologyCanvas = document.getElementById("topologyCanvas");
const topologyContext = topologyCanvas.getContext("2d");
const topologyLoadStatus = document.getElementById("topologyLoadStatus");
const topologyViewportStatus = document.getElementById("topologyViewportStatus");
const topologyZoomLabel = document.getElementById("topologyZoomLabel");

let topologyData = null;
let topologyLoadPromise = null;
let topologyNodeIndex = new Map();
let topologyDegree = null;
let topologySelectedIndex = -1;
let topologyDragging = null;
let topologySuppressClick = false;
let topologyRenderPending = false;
let topologyActive = false;

async function fetchTopologyData() {
  const response = await fetch(TOPOLOGY_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load ${TOPOLOGY_URL}: ${response.status}`);
  if (!("DecompressionStream" in window)) {
    throw new Error("当前浏览器不支持 gzip 解压，请使用新版 Chrome、Edge 或 Safari。");
  }
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).json();
}

function prepareTopology(payload) {
  topologyData = payload;
  topologyNodeIndex = new Map(payload.nodes.map((node, index) => [node[0], index]));
  topologyDegree = new Uint16Array(payload.nodes.length);
  for (const edge of payload.edges) {
    const source = topologyNodeIndex.get(edge[0]);
    const target = topologyNodeIndex.get(edge[1]);
    if (source !== undefined) topologyDegree[source] += 1;
    if (target !== undefined) topologyDegree[target] += 1;
  }
  const quality = payload.quality;
  topologyLoadStatus.textContent =
    `${payload.nodes.length.toLocaleString("zh-CN")} 个设施节点 · ` +
    `${payload.edges.length.toLocaleString("zh-CN")} 条设施级边 · ` +
    `挂接率 ${(quality.facility_attachment.attachment_rate * 100).toFixed(1)}%`;
}

async function ensureTopologyLoaded() {
  if (topologyData) return topologyData;
  if (!topologyLoadPromise) {
    topologyLoadStatus.textContent = "正在加载 Balanced v2 拓扑...";
    topologyLoadPromise = fetchTopologyData()
      .then((payload) => {
        prepareTopology(payload);
        resizeTopologyCanvas();
        return payload;
      })
      .catch((error) => {
        topologyLoadPromise = null;
        topologyLoadStatus.textContent = "拓扑数据加载失败";
        console.error(error);
        throw error;
      });
  }
  return topologyLoadPromise;
}

function topologyScreenPoint(index) {
  const node = topologyData.nodes[index];
  return window.meshViewer.projectPoint(node[1], node[2]);
}

function requestTopologyRender() {
  if (topologyRenderPending || !topologyData || !topologyActive) return;
  topologyRenderPending = true;
  requestAnimationFrame(renderTopology);
}

function renderTopology() {
  topologyRenderPending = false;
  const width = topologyCanvas.clientWidth;
  const height = topologyCanvas.clientHeight;
  topologyContext.clearRect(0, 0, width, height);

  let visibleEdges = 0;
  topologyContext.lineWidth = 0.7;
  for (const edge of topologyData.edges) {
    const sourceIndex = topologyNodeIndex.get(edge[0]);
    const targetIndex = topologyNodeIndex.get(edge[1]);
    if (sourceIndex === undefined || targetIndex === undefined) continue;
    const source = topologyScreenPoint(sourceIndex);
    const target = topologyScreenPoint(targetIndex);
    if ((source.x < 0 && target.x < 0) || (source.x > width && target.x > width) ||
        (source.y < 0 && target.y < 0) || (source.y > height && target.y > height)) continue;
    const official = edge[2] === "official_logical_relation";
    topologyContext.strokeStyle = official ? "rgba(25,111,65,0.82)" : "rgba(31,48,52,0.28)";
    topologyContext.beginPath();
    topologyContext.moveTo(source.x, source.y);
    topologyContext.lineTo(target.x, target.y);
    topologyContext.stroke();
    visibleEdges += 1;
  }

  let visibleNodes = 0;
  for (let index = 0; index < topologyData.nodes.length; index += 1) {
    const node = topologyData.nodes[index];
    if (!node[5] && topologyDegree[index] === 0) continue;
    const point = topologyScreenPoint(index);
    if (point.x < -8 || point.x > width + 8 || point.y < -8 || point.y > height + 8) continue;
    const generation = node[3] !== "substation";
    const radius = Math.min(3.8, 1 + Math.sqrt(topologyDegree[index]) * 0.35);
    topologyContext.beginPath();
    if (generation) topologyContext.arc(point.x, point.y, radius, 0, Math.PI * 2);
    else topologyContext.rect(point.x - radius, point.y - radius, radius * 2, radius * 2);
    topologyContext.fillStyle = generation ? "rgba(225,111,45,0.88)" : "rgba(20,118,184,0.78)";
    topologyContext.fill();
    topologyContext.strokeStyle = index === topologySelectedIndex ? "#172123" : "rgba(255,255,255,0.88)";
    topologyContext.lineWidth = index === topologySelectedIndex ? 2.4 : 0.55;
    topologyContext.stroke();
    visibleNodes += 1;
  }
  topologyViewportStatus.textContent =
    `${visibleNodes.toLocaleString("zh-CN")} 个可见节点 · ${visibleEdges.toLocaleString("zh-CN")} 条可见边`;
  updateTopologyZoomLabel();
}

function resizeTopologyCanvas() {
  const rect = mapPane.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = window.devicePixelRatio || 1;
  topologyCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
  topologyCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
  topologyContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  requestTopologyRender();
}

function updateTopologyZoomLabel() {
  topologyZoomLabel.textContent = `${Math.round((window.meshViewer?.getZoomRatio() || 1) * 100)}%`;
}

function zoomTopology(factor, x = topologyCanvas.clientWidth / 2, y = topologyCanvas.clientHeight / 2) {
  if (!topologyData) return;
  window.meshViewer.zoomAt(factor, x, y);
}

function findTopologyNode(x, y) {
  let bestIndex = -1;
  let bestDistance = 121;
  for (let index = 0; index < topologyData.nodes.length; index += 1) {
    const point = topologyScreenPoint(index);
    const dx = point.x - x;
    const dy = point.y - y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function escapeTopologyHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function showTopologyNode(index) {
  topologySelectedIndex = index;
  const node = topologyData.nodes[index];
  const detailTitle = document.getElementById("detailTitle");
  const detailSub = document.getElementById("detailSub");
  const detailList = document.getElementById("detailList");
  document.getElementById("facilityMeta")?.remove();
  const kind = node[3] === "substation" ? "变电站" : node[3] === "plant" ? "发电站" : "发电候选设施";
  detailTitle.textContent = node[4] || node[0];
  detailSub.textContent = `${kind} · ${node[0]}`;
  const items = [
    ["节点类型", kind],
    ["节点度数", topologyDegree[index].toLocaleString("zh-CN")],
    ["线路挂接", node[5] ? "已挂接" : "未挂接"],
    ["官方确认", node[6] ? "是" : "否"],
    ["经度", Number(node[1]).toFixed(5)],
    ["纬度", Number(node[2]).toFixed(5)],
    ["构图版本", topologyData.quality.profile],
  ];
  detailList.innerHTML = items
    .map(([label, value]) => `<dt>${escapeTopologyHTML(label)}</dt><dd>${escapeTopologyHTML(value)}</dd>`)
    .join("");
  requestTopologyRender();
}

function showTopologyOverview() {
  const quality = topologyData?.quality;
  const detailTitle = document.getElementById("detailTitle");
  const detailSub = document.getElementById("detailSub");
  const detailList = document.getElementById("detailList");
  document.getElementById("facilityMeta")?.remove();
  detailTitle.textContent = "Balanced v2 电网拓扑";
  detailSub.textContent = "拓扑关系叠加在原 1km 网格地图上";
  if (!quality) {
    detailList.innerHTML = "";
    return;
  }
  const items = [
    ["设施节点", quality.input.facility_nodes.toLocaleString("zh-CN")],
    ["设施级边", quality.logical_facility_graph.edges.toLocaleString("zh-CN")],
    ["已挂接设施", quality.facility_attachment.attached_facilities.toLocaleString("zh-CN")],
    ["设施挂接率", `${(quality.facility_attachment.attachment_rate * 100).toFixed(1)}%`],
    ["连通分量", quality.logical_facility_graph.components.toLocaleString("zh-CN")],
    ["最大分量节点", quality.logical_facility_graph.largest_component_nodes.toLocaleString("zh-CN")],
    ["孤立设施", quality.logical_facility_graph.isolated_facilities.toLocaleString("zh-CN")],
    ["构图状态", "Balanced 试构图，尚非最终基线"],
  ];
  detailList.innerHTML = items
    .map(([label, value]) => `<dt>${escapeTopologyHTML(label)}</dt><dd>${escapeTopologyHTML(value)}</dd>`)
    .join("");
}

async function activateTopologyView() {
  topologyActive = true;
  mapViewButton.classList.remove("active");
  mapViewButton.setAttribute("aria-pressed", "false");
  topologyViewButton.classList.add("active");
  topologyViewButton.setAttribute("aria-pressed", "true");
  mapToolbar.hidden = true;
  topologyToolbar.hidden = false;
  mapLegend.hidden = true;
  topologyLegend.hidden = false;
  mapStatusbar.hidden = true;
  topologyStatusbar.hidden = false;
  topologyCanvas.hidden = false;
  window.meshViewer?.setTopologyMode(true);
  window.meshViewer?.resize();
  showTopologyOverview();
  await ensureTopologyLoaded();
  showTopologyOverview();
  resizeTopologyCanvas();
}

function activateMapView() {
  topologyActive = false;
  topologyViewButton.classList.remove("active");
  topologyViewButton.setAttribute("aria-pressed", "false");
  mapViewButton.classList.add("active");
  mapViewButton.setAttribute("aria-pressed", "true");
  topologyToolbar.hidden = true;
  mapToolbar.hidden = false;
  topologyLegend.hidden = true;
  mapLegend.hidden = false;
  topologyStatusbar.hidden = true;
  mapStatusbar.hidden = false;
  topologyCanvas.hidden = true;
  window.meshViewer?.setTopologyMode(false);
  window.meshViewer?.resize();
  window.meshViewer?.restoreDetail();
}

topologyViewButton.addEventListener("click", () => activateTopologyView().catch(() => {}));
mapViewButton.addEventListener("click", activateMapView);
document.getElementById("topologyZoomIn").addEventListener("click", () => zoomTopology(1.35));
document.getElementById("topologyZoomOut").addEventListener("click", () => zoomTopology(1 / 1.35));
document.getElementById("topologyReset").addEventListener("click", () => {
  topologySelectedIndex = -1;
  window.meshViewer?.resetView();
  showTopologyOverview();
});

topologyCanvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const rect = topologyCanvas.getBoundingClientRect();
  zoomTopology(event.deltaY < 0 ? 1.2 : 1 / 1.2, event.clientX - rect.left, event.clientY - rect.top);
}, { passive: false });

topologyCanvas.addEventListener("pointerdown", (event) => {
  topologyDragging = { x: event.clientX, y: event.clientY, moved: false };
  topologyCanvas.classList.add("dragging");
  topologyCanvas.setPointerCapture(event.pointerId);
});

topologyCanvas.addEventListener("pointermove", (event) => {
  if (!topologyDragging) return;
  const dx = event.clientX - topologyDragging.x;
  const dy = event.clientY - topologyDragging.y;
  if (Math.hypot(dx, dy) > 3) topologyDragging.moved = true;
  topologyDragging.x = event.clientX;
  topologyDragging.y = event.clientY;
  window.meshViewer?.panBy(dx, dy);
});

topologyCanvas.addEventListener("pointerup", (event) => {
  topologySuppressClick = Boolean(topologyDragging?.moved);
  topologyDragging = null;
  topologyCanvas.classList.remove("dragging");
  topologyCanvas.releasePointerCapture(event.pointerId);
});

topologyCanvas.addEventListener("click", (event) => {
  if (topologySuppressClick) {
    topologySuppressClick = false;
    return;
  }
  const rect = topologyCanvas.getBoundingClientRect();
  const index = findTopologyNode(event.clientX - rect.left, event.clientY - rect.top);
  if (index >= 0) showTopologyNode(index);
});

topologyCanvas.addEventListener("dblclick", () => {
  topologySelectedIndex = -1;
  window.meshViewer?.resetView();
  showTopologyOverview();
});

window.addEventListener("meshviewer:render", requestTopologyRender);
window.addEventListener("resize", () => {
  if (topologyActive) resizeTopologyCanvas();
});

window.topologyViewer = {
  getState() {
    return {
      active: topologyActive,
      loaded: Boolean(topologyData),
      nodeCount: topologyData?.nodes.length || 0,
      edgeCount: topologyData?.edges.length || 0,
      selectedNodeId: topologySelectedIndex >= 0 ? topologyData.nodes[topologySelectedIndex][0] : null,
      zoom: window.meshViewer?.getZoomRatio() || 1,
    };
  },
};
