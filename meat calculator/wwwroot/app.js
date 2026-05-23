const LB_PER_KG = 2.2046226218;

const state = {
  stages: [],
  grades: [],
  marblingScale: [],
  chart: null,
  constants: {},
  gaugeMode: "pull",
  afterHoldPercent: 100,
  lastHold: null,
  lastYield: null,
  planPlainText: "",
  profiles: [],
  betweenNote: "",
  activeProfileId: null,
  weightUnit: "kg",
};

const $ = (id) => document.getElementById(id);

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** GitHub Pages = static files only; GET /api/* → prebuilt JSON, POST uses client math. */
function getPagesBase() {
  if (!location.hostname.endsWith("github.io")) return "";
  const seg = location.pathname.split("/").filter(Boolean)[0];
  return seg ? `/${seg}/` : "/";
}

const PAGES_BASE = getPagesBase();
const USE_STATIC_API = location.hostname.endsWith("github.io");

function apiUrl(path) {
  const p = path.startsWith("/") ? path.slice(1) : path;
  if (USE_STATIC_API && p.startsWith("api/") && !p.endsWith(".json")) {
    return `${PAGES_BASE}${p}.json`;
  }
  return USE_STATIC_API ? `${PAGES_BASE}${p}` : `/${p}`;
}

async function apiGet(path) {
  const res = await fetch(apiUrl(path));
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  if (USE_STATIC_API) throw new Error("static host");
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path}: ${res.status}`);
  return res.json();
}

function clientRenderingAt(tempC) {
  return {
    estimatedRenderedAtPull: estimateRenderedAtPull(tempC),
    stage: getStageForTemp(tempC),
  };
}

const cToF = (c) => (c * 9) / 5 + 32;
const fToC = (f) => ((f - 32) * 5) / 9;

const COOK_STORAGE_KEY = "smokeLabCook";
const DEFAULT_GRADE_ID = "us_choice";
const GRADE_REGION_ORDER = ["us", "uk", "jp", "au"];
const PROFILE_IDS = new Set(["juicy", "balanced", "traditional"]);
let cookStateRestoring = false;

function migrateCookStorage() {
  try {
    const legacy = JSON.parse(localStorage.getItem("smokeLabUnits") || "{}");
    const cur = JSON.parse(localStorage.getItem(COOK_STORAGE_KEY) || "{}");
    if ((legacy.weight === "kg" || legacy.weight === "lb") && !cur.weight) {
      cur.weight = legacy.weight;
      localStorage.setItem(COOK_STORAGE_KEY, JSON.stringify(cur));
    }
  } catch {
    /* ignore */
  }
}

function loadUnitPrefs() {
  migrateCookStorage();
  try {
    const u = JSON.parse(localStorage.getItem(COOK_STORAGE_KEY) || "{}");
    if (u.weight === "kg" || u.weight === "lb") state.weightUnit = u.weight;
  } catch {
    /* ignore */
  }
}

function collectCookState() {
  const loss = parseFloat($("lossPercent")?.value);
  const target = parseFloat($("targetPercent")?.value);
  return {
    weight: state.weightUnit,
    pull: tempInputValueC($("pullTemp")),
    hold: tempInputValueC($("holdTemp")),
    probe: getSliderTempC(),
    kg: readWeightKg(),
    loss: Number.isFinite(loss) ? loss : 35,
    target: Number.isFinite(target) ? target : 100,
    profile: state.activeProfileId || detectActiveProfileId() || null,
    grade: $("grade")?.value || DEFAULT_GRADE_ID,
  };
}

function saveCookPrefs() {
  if (cookStateRestoring) return;
  try {
    localStorage.setItem(COOK_STORAGE_KEY, JSON.stringify(collectCookState()));
  } catch {
    /* ignore quota */
  }
}

const saveCookPrefsDebounced = debounce(saveCookPrefs, 400);

function saveUnitPrefs() {
  saveCookPrefs();
}

function cookStateToSearchParams() {
  const s = collectCookState();
  const p = new URLSearchParams();
  p.set("pull", s.pull.toFixed(1));
  p.set("hold", s.hold.toFixed(1));
  if (Math.abs(s.probe - s.pull) > 0.05) p.set("probe", s.probe.toFixed(1));
  p.set("kg", s.kg.toFixed(1));
  p.set("loss", String(Math.round(s.loss)));
  if (s.target !== 100) p.set("target", String(Math.round(s.target)));
  if (s.profile && PROFILE_IDS.has(s.profile)) p.set("profile", s.profile);
  if (s.weight === "lb") p.set("weight", "lb");
  if (s.grade && s.grade !== DEFAULT_GRADE_ID) p.set("grade", s.grade);
  return p;
}

function parseUrlCookState() {
  const p = new URLSearchParams(location.search);
  if (!p.toString()) return null;

  const tab = p.get("tab");
  const validTab = ["dashboard", "hold", "plan", "yield"].includes(tab) ? tab : null;

  const hasCook = ["pull", "hold", "kg", "loss", "profile", "probe", "weight", "target", "grade"].some(
    (k) => p.has(k)
  );
  if (!hasCook) return validTab ? { tab: validTab } : null;

  const data = { tab: validTab };
  const pull = parseFloat(p.get("pull"));
  const hold = parseFloat(p.get("hold"));
  const probe = parseFloat(p.get("probe"));
  const kg = parseFloat(p.get("kg"));
  const loss = parseFloat(p.get("loss"));
  const target = parseFloat(p.get("target"));
  const w = p.get("weight");
  const profile = p.get("profile");
  const grade = p.get("grade");

  if (w === "kg" || w === "lb") data.weight = w;
  if (Number.isFinite(pull) && pull >= 55 && pull <= 99) data.pull = pull;
  if (Number.isFinite(hold) && hold >= 57 && hold <= 90) data.hold = hold;
  if (Number.isFinite(probe) && probe >= 55 && probe <= 99) data.probe = probe;
  if (Number.isFinite(kg) && kg > 0 && kg < 50) data.kg = kg;
  if (Number.isFinite(loss) && loss >= 30 && loss <= 43) data.loss = loss;
  if (Number.isFinite(target) && target >= 80 && target <= 120) data.target = target;
  if (profile && PROFILE_IDS.has(profile)) data.profile = profile;
  if (grade) data.grade = normalizeGradeId(grade);

  return data;
}

function parseStoredCookState() {
  migrateCookStorage();
  try {
    const u = JSON.parse(localStorage.getItem(COOK_STORAGE_KEY) || "{}");
    if (!u || typeof u !== "object") return null;
    if (
      u.pull == null &&
      u.hold == null &&
      u.kg == null &&
      u.loss == null &&
      !u.profile &&
      !u.grade
    ) {
      return null;
    }
    if (u.grade) u.grade = normalizeGradeId(u.grade);
    return u;
  } catch {
    return null;
  }
}

function applyCookState(data) {
  if (!data) return;
  cookStateRestoring = true;
  try {
    if (data.weight === "kg" || data.weight === "lb") state.weightUnit = data.weight;

    if (data.profile && PROFILE_IDS.has(data.profile)) {
      applyCookProfile(data.profile);
      if (data.kg != null) configureWeightInput({ kg: data.kg });
      if (data.grade) populateGradeSelect(normalizeGradeId(data.grade));
    } else {
      if (data.kg != null) configureWeightInput({ kg: data.kg });
      else configureWeightInput();
      if (data.pull != null) setTempInputFromC($("pullTemp"), data.pull);
      if (data.hold != null) setTempInputFromC($("holdTemp"), data.hold);
      const probe = data.probe ?? data.pull;
      if (probe != null && $("tempSlider")) {
        $("tempSlider").dataset.c = String(probe);
        $("tempSlider").value = Number(probe).toFixed(1);
      }
      if (data.loss != null && $("lossPercent")) {
        $("lossPercent").value = data.loss;
        $("lossDisplay").textContent = `${data.loss}%`;
      }
      if (data.target != null && $("targetPercent")) $("targetPercent").value = data.target;
      if (data.grade) populateGradeSelect(normalizeGradeId(data.grade));
      syncProbeSliderUnits();
      onTempSliderInput();
      syncActiveProfileUI();
      updateHold();
      void updateYield();
    }

    if (data.tab) goToTab(data.tab);
  } finally {
    cookStateRestoring = false;
    saveCookPrefs();
  }
}

function restoreCookStateAfterLoad() {
  const fromUrl = parseUrlCookState();
  if (fromUrl) {
    applyCookState(fromUrl);
    return;
  }
  const stored = parseStoredCookState();
  if (stored) applyCookState(stored);
}

function wireCookStatePersistence() {
  const save = () => saveCookPrefsDebounced();
  ["pullTemp", "holdTemp", "targetPercent", "lossPercent", "grade", "startWeight"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("input", save);
    el.addEventListener("change", save);
  });
  $("tempSlider")?.addEventListener("change", save);
}

function formatWeight(kg, { showBoth = false } = {}) {
  const lb = kg * LB_PER_KG;
  if (state.weightUnit === "lb") {
    const main = `${lb.toFixed(1)} lb`;
    return showBoth ? `${main} (${kg.toFixed(1)} kg)` : main;
  }
  const main = `${kg.toFixed(1)} kg`;
  return showBoth ? `${main} (${lb.toFixed(1)} lb)` : main;
}

function readWeightKg() {
  const raw = parseFloat($("startWeight")?.value);
  const fallback = state.weightUnit === "lb" ? 13.2 : 6;
  const v = Number.isFinite(raw) ? raw : fallback;
  return state.weightUnit === "lb" ? v / LB_PER_KG : v;
}

function configureWeightInput({ kg: kgOverride } = {}) {
  const el = $("startWeight");
  if (!el) return;
  const kg = kgOverride ?? readWeightKg();
  const label = $("startWeightLabel");
  if (state.weightUnit === "lb") {
    el.min = "2";
    el.max = "50";
    el.step = "0.5";
    el.value = (kg * LB_PER_KG).toFixed(1);
    if (label) label.textContent = "Raw weight (lb)";
  } else {
    el.min = "1";
    el.max = "20";
    el.step = "0.1";
    el.value = kg.toFixed(1);
    if (label) label.textContent = "Raw weight (kg)";
  }
  const hint = $("weightAltHint");
  if (hint) {
    hint.textContent =
      state.weightUnit === "lb" ? `≈ ${kg.toFixed(1)} kg` : `≈ ${(kg * LB_PER_KG).toFixed(1)} lb`;
  }
}

function tempInputValueC(inputEl) {
  if (!inputEl) return 90.5;
  const n = parseFloat(inputEl.value);
  if (!Number.isFinite(n)) return parseFloat(inputEl.dataset.c) || 90.5;
  return n;
}

function setTempInputFromC(inputEl, c) {
  if (!inputEl) return;
  inputEl.dataset.c = String(c);
  inputEl.value = Number(c).toFixed(1);
}

function syncFieldUnits() {
  document.querySelectorAll(".field-temp-unit").forEach((el) => {
    el.innerHTML = `°C <span class="temp-f-inline">(°F shown with results)</span>`;
  });
}

/** Always °C then °F in sync; hero uses vertical divider */
function tempHtml(c, { big = false } = {}) {
  const cStr = `${Number(c).toFixed(1)} °C`;
  const fStr = `${cToF(c).toFixed(0)} °F`;

  if (big) {
    return `<span class="temp-hero-val">${cStr}</span><span class="temp-hero-divider" aria-hidden="true"></span><span class="temp-hero-val">${fStr}</span>`;
  }

  return `<span class="temp-pair"><span class="temp-pair-val">${cStr}</span><span class="temp-pair-divider" aria-hidden="true"></span><span class="temp-pair-val">${fStr}</span></span>`;
}

function tempText(c) {
  return `${Number(c).toFixed(1)} °C (${cToF(c).toFixed(0)} °F)`;
}

function stallRangeText() {
  return "65.5–74 °C internal (150–165 °F)";
}

function syncProbeSliderUnits() {
  const slider = $("tempSlider");
  if (!slider) return;
  let c = parseFloat(slider.dataset.c);
  if (!Number.isFinite(c)) {
    c = parseFloat(slider.value);
  }
  if (!Number.isFinite(c)) c = 90.5;
  slider.dataset.c = String(c);
  slider.min = "55";
  slider.max = "99";
  slider.step = "0.1";
  slider.value = Number(c).toFixed(1);
}

function refreshStaticUnitCopy() {
  const gaugeCtx = $("gaugeContext");
  if (gaugeCtx) {
    gaugeCtx.textContent =
      "Drag to probe temp in the flat. ~40% at 90.5 °C / 195 °F before a long hot hold is normal.";
  }
  const stallBtn = $("stallPresetBtn");
  if (stallBtn) {
    stallBtn.textContent = "Stall rescue (~76.5 °C / 170 °F)";
  }
}

async function refreshAllForUnits({ weight = false } = {}) {
  if (!weight) return;
  await updateYield();
  updatePlanSummaryDebounced();
}

function updateUnitBar() {
  document.querySelectorAll("[data-unit-weight]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.unitWeight === state.weightUnit);
    btn.setAttribute("aria-pressed", btn.dataset.unitWeight === state.weightUnit);
  });
}

function applyUnitPrefs() {
  updateUnitBar();
  configureWeightInput();
  syncFieldUnits();
  syncProbeSliderUnits();
  syncLabels();
}

function initUnits() {
  loadUnitPrefs();
  document.querySelectorAll("[data-unit-weight]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.unitWeight;
      if (next === state.weightUnit) return;
      const kg = readWeightKg();
      state.weightUnit = next;
      saveUnitPrefs();
      configureWeightInput({ kg });
      updateUnitBar();
      void refreshAllForUnits({ weight: true });
    });
  });
  applyUnitPrefs();
}

function setTempHtml(el, c, opts) {
  if (!el) return;
  el.innerHTML = tempHtml(c, opts);
}

function normalizeGradeId(id) {
  if (!id) return DEFAULT_GRADE_ID;
  const key = String(id).toLowerCase();
  if (key === "fk2") return "us_select";
  if (key === "fk34") return "us_choice";
  if (key === "fk45") return "us_prime";
  if (key === "jp_bms23" || key === "jp_bms2") return "jp_bms34";
  if (key === "jp_bms46" || key === "jp_bms4") return "jp_bms57";
  if (key === "jp_bms8") return "jp_bms812";
  return id;
}

function marblingBandClass(bandId) {
  return bandId ? `marbling-band-${bandId}` : "";
}

function gradeOptionLabel(g) {
  return `${g.name} → ${g.marblingBandLabel || g.marblingBand}`;
}

function gradeLabel(g) {
  return g.name;
}

function populateGradeSelect(selectedId = DEFAULT_GRADE_ID) {
  const gradeSelect = $("grade");
  if (!gradeSelect || !state.grades.length) return;

  const byRegion = new Map();
  for (const g of state.grades) {
    const region = g.region || "us";
    if (!byRegion.has(region)) byRegion.set(region, []);
    byRegion.get(region).push(g);
  }

  const html = GRADE_REGION_ORDER.filter((r) => byRegion.has(r))
    .map((region) => {
      const items = byRegion.get(region);
      const label = items[0].regionLabel || region;
      const options = items
        .map((g) => `<option value="${g.id}">${gradeOptionLabel(g)}</option>`)
        .join("");
      return `<optgroup label="${label}">${options}</optgroup>`;
    })
    .join("");

  gradeSelect.innerHTML = html;
  const normalized = normalizeGradeId(selectedId);
  const exists = state.grades.some((g) => g.id === normalized);
  gradeSelect.value = exists ? normalized : DEFAULT_GRADE_ID;
}

function buildGradeBars() {
  const container = $("gradeBars");
  if (!container || !state.grades.length) return;

  const scale = (state.marblingScale?.length ? [...state.marblingScale] : []).sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );

  const byRegion = new Map();
  for (const g of state.grades) {
    const region = g.region || "us";
    if (!byRegion.has(region)) byRegion.set(region, []);
    byRegion.get(region).push(g);
  }

  const legend =
    scale.length > 0
      ? `<div class="marbling-scale">
      <h3 class="marbling-scale-heading">Marbling bands (planning)</h3>
      <ul class="marbling-scale-list">
        ${scale.map((b) => `<li class="${marblingBandClass(b.id)}">${b.label}</li>`).join("")}
      </ul>
      <p class="hint marbling-scale-hint">Stickers from each country map to these broad bands — rough equivalents, not 1:1 with USDA marbling %.</p>
    </div>`
      : "";

  const regions = GRADE_REGION_ORDER.filter((r) => byRegion.has(r))
    .map((region) => {
      const items = byRegion.get(region);
      const heading = items[0].regionLabel || region;
      const rows = items
        .map(
          (g) => `
    <div class="grade-map-row ${marblingBandClass(g.marblingBand)}">
      <span class="grade-map-sticker">${gradeLabel(g)}</span>
      <span class="grade-map-arrow" aria-hidden="true">→</span>
      <span class="grade-map-band">${g.marblingBandLabel}</span>
    </div>`
        )
        .join("");
      return `<section class="grade-region-block"><h3 class="grade-region-heading">${heading}</h3>${rows}</section>`;
    })
    .join("");

  container.innerHTML = legend + regions;
}

// Tabs
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    const panel = document.getElementById(`panel-${tab.dataset.panel}`);
    if (panel) panel.classList.add("active");
    if (tab.dataset.panel === "plan") updatePlanSummary();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

function syncLabels() {
  setTempHtml($("refPull"), 90.5);
  setTempHtml($("refHold"), 65.5);
  if ($("stallRange")) $("stallRange").textContent = stallRangeText();

  const pull = $("pullTemp");
  const hold = $("holdTemp");
  if (pull && !pull.dataset.c) pull.dataset.c = "90.5";
  if (hold && !hold.dataset.c) hold.dataset.c = "65.5";
  if (pull) setTempInputFromC(pull, parseFloat(pull.dataset.c));
  if (hold) setTempInputFromC(hold, parseFloat(hold.dataset.c));

  const restStart = $("restStartTemp");
  if (restStart) {
    if (!restStart.dataset.c) {
      restStart.dataset.c = String(tempInputValueC(restStart) || 90.5);
    }
    setTempInputFromC(restStart, parseFloat(restStart.dataset.c));
  }
  const restAmbient = $("restAmbient");
  if (restAmbient) {
    if (!restAmbient.dataset.c) {
      restAmbient.dataset.c = String(tempInputValueC(restAmbient) || 65.5);
    }
    setTempInputFromC(restAmbient, parseFloat(restAmbient.dataset.c));
  }
  refreshStaticUnitCopy();
}

// Gauge: semicircle 0–120% collagen rendered (pit → hold → tender)
const GAUGE = { cx: 110, cy: 102, r: 76 };
const PULL_ANCHORS = [
  [60, 5],
  [76.5, 20],
  [90.5, 40],
  [93.3, 55],
  [99, 75],
];

let gaugeDragging = false;

function clampPercent(percent) {
  const n = Number(percent);
  if (!Number.isFinite(n)) return 0;
  return Math.min(120, Math.max(0, n));
}

function gaugePoint(percent) {
  const p = clampPercent(percent) / 120;
  const angle = Math.PI * (1 - p);
  return {
    x: GAUGE.cx + GAUGE.r * Math.cos(angle),
    y: GAUGE.cy - GAUGE.r * Math.sin(angle),
  };
}

/** Smooth % along anchors — same logic as server, no stair-steps while dragging. */
function estimateRenderedAtPull(tempC) {
  if (tempC < 60) return Math.max(0, (tempC - 55) * 1);
  const anchors = PULL_ANCHORS;
  if (tempC <= anchors[0][0]) return anchors[0][1];
  if (tempC >= anchors[anchors.length - 1][0]) return anchors[anchors.length - 1][1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [t0, p0] = anchors[i];
    const [t1, p1] = anchors[i + 1];
    if (tempC >= t0 && tempC <= t1) {
      const t = (tempC - t0) / (t1 - t0);
      return p0 + t * (p1 - p0);
    }
  }
  return anchors[anchors.length - 1][1];
}

function gaugeZone(percent) {
  if (percent < 40) {
    return {
      id: "pit",
      label: "On smoke",
      hint: "Low render % — flat still needs time on the cooker.",
    };
  }
  if (percent < 80) {
    return {
      id: "hold",
      label: "Wrap & hold",
      hint: "Typical after a ~90.5 °C (195 °F) pull — finish in the hot box (~65 °C / 150 °F).",
    };
  }
  return {
    id: "tender",
    label: "Slice window",
    hint: "Modeled slice-ready band — rest and probe still decide when you cut.",
  };
}

function readiness(tempC, renderedPct) {
  const pct = clampPercent(renderedPct);
  const eat =
    tempC < 55
      ? { text: "Too cool — keep cooking", cls: "warn" }
      : pct < 40
        ? { text: "Still tough inside", cls: "warn" }
        : pct < 80
          ? { text: "Needs the long hold", cls: "hold" }
          : { text: "OK to eat", cls: "ok" };

  let slice;
  if (pct < 40) slice = { text: "No — stay on pit", cls: "warn" };
  else if (pct < 80) slice = { text: "Wait for hold", cls: "hold" };
  else if (pct <= 120) slice = { text: "OK to slice", cls: "ok" };
  else slice = { text: "Risk of drying out", cls: "warn" };

  return { eat, slice };
}

function updateGaugeZone(percent) {
  const zone = gaugeZone(percent);
  document.querySelectorAll(".gauge-zone").forEach((el) => el.classList.remove("gauge-zone-active"));
  document.querySelector(`.gauge-zone-${zone.id}`)?.classList.add("gauge-zone-active");
  const legend = $("gaugeLegend");
  if (legend) {
    legend.innerHTML = `<strong>${zone.label}</strong> — ${zone.hint}`;
  }
}

/** Place marker on the arc from % rendered (always follows the curve, never a straight chord). */
function setGaugeMarkerPosition(percent, { showDecimal = false } = {}) {
  const clamped = clampPercent(percent);
  const { x, y } = gaugePoint(clamped);
  const marker = $("gaugeMarker");
  marker.setAttribute("cx", x);
  marker.setAttribute("cy", y);
  $("gaugePercent").textContent = showDecimal ? `${clamped.toFixed(1)}%` : `${Math.round(clamped)}%`;
  updateGaugeZone(clamped);
}

function getGaugePercentForTemp(tempC) {
  if (state.gaugeMode === "afterHold") return clampPercent(state.afterHoldPercent);
  return estimateRenderedAtPull(tempC);
}

async function refreshAfterHoldProjection(tempC) {
  try {
    const data = await fetchHoldPlan(tempC, 65.5, 100);
    state.afterHoldPercent = clampPercent(data.projectedFinal ?? 100);
  } catch {
    state.afterHoldPercent = 100;
  }
}

async function syncGaugeFromTemp(tempC, { showDecimal = false } = {}) {
  if (state.gaugeMode === "afterHold") await refreshAfterHoldProjection(tempC);
  const pct = getGaugePercentForTemp(tempC);
  setGaugeMarkerPosition(pct, { showDecimal });
  const sub = $("gaugeSublabel");
  if (sub) {
    sub.textContent =
      state.gaugeMode === "afterHold" ? "after long hold" : "tenderness at pull";
  }
}

function setGaugeMode(mode) {
  state.gaugeMode = mode;
  syncGaugeFromTemp(getSliderTempC());
  updateRendering();
}

function showPagesSetupBanner() {
  const el = $("pagesSetupBanner");
  if (el) el.hidden = false;
}

async function loadData() {
  let data;
  try {
    data = await apiGet("/api/data");
  } catch (err) {
    if (USE_STATIC_API) showPagesSetupBanner();
    throw err;
  }
  state.stages = data.stages;
  state.grades = data.grades;
  state.marblingScale = data.marblingScale ?? [];
  state.constants = data.constants;

  populateGradeSelect(DEFAULT_GRADE_ID);

  buildStageTable();
  buildGradeBars();
  initChart();
  buildTimeline();
  syncLabels();
  setTempHtml($("tempDisplay"), 90.5, { big: true });
  syncGaugeFromTemp(90.5);
  updateRendering();
  updateHold();
  updateYield();
}

function buildStageTable() {
  const currentC = getSliderTempC();
  const rowHtml = (s) => {
    const hi = Math.abs(s.tempC - currentC) < 0.6;
    return `<tr class="${hi ? "highlight" : ""}">
        <td>${s.tempC} <span class="temp-f-cell">(${s.tempF} °F)</span></td>
        <td>${s.tempF}</td>
        <td>${s.multiplier}×</td>
        <td>${s.hoursTo100}</td>
        <td>${s.percentPerHour}%</td>
      </tr>`;
  };
  const preview = $("stageTablePreview")?.querySelector("tbody");
  const full = $("stageTable")?.querySelector("tbody");
  if (preview) preview.innerHTML = state.stages.slice(0, 5).map(rowHtml).join("");
  if (full) full.innerHTML = state.stages.map(rowHtml).join("");
}

async function buildTimeline() {
  const tl = await apiGet("/api/timeline");
  const colors = ["phase-smoke", "phase-stall", "phase-power"];
  $("cookTimeline").innerHTML = tl.phases
    .map((p, i) => {
      return `<div class="timeline-phase ${colors[i] || ""}" style="flex: ${p.endHour - p.startHour}">
        <span class="name">${p.name}</span>
        <span class="hours">hr ${p.startHour}–${p.endHour}</span>
      </div>`;
    })
    .join("");
}

function chartTempLabel(s) {
  return `${s.tempC}°C\n(${s.tempF}°F)`;
}

function initChart() {
  const ctx = $("rateChart").getContext("2d");
  const labels = state.stages.map(chartTempLabel);
  const values = state.stages.map((s) => s.percentPerHour);

  state.chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "% collagen render / hr",
          data: values,
          borderColor: "#e85d04",
          backgroundColor: "rgba(232, 93, 4, 0.15)",
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: "#ffba08",
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          grid: { color: "rgba(61, 52, 41, 0.5)" },
          ticks: { color: "#9a8f7f", maxRotation: 0, font: { size: 10 } },
        },
        y: {
          grid: { color: "rgba(61, 52, 41, 0.5)" },
          ticks: { color: "#9a8f7f" },
          title: { display: true, text: "% / hour", color: "#9a8f7f" },
        },
      },
    },
  });
}

function getSliderTempC() {
  const slider = $("tempSlider");
  if (!slider) return 90.5;
  const raw = parseFloat(slider.value);
  if (!Number.isFinite(raw)) return parseFloat(slider.dataset.c) || 90.5;
  slider.dataset.c = String(raw);
  return raw;
}

function onTempSliderInput() {
  const tempC = getSliderTempC();
  setTempHtml($("tempDisplay"), tempC, { big: true });
  syncGaugeFromTemp(tempC, { showDecimal: gaugeDragging });
  updateRenderingDebounced();
}

const updateRenderingDebounced = debounce(() => updateRendering(), 120);

const tempSlider = $("tempSlider");
if (tempSlider) {
  tempSlider.addEventListener("pointerdown", () => {
    gaugeDragging = true;
  });
  tempSlider.addEventListener("pointerup", () => {
    gaugeDragging = false;
    syncGaugeFromTemp(getSliderTempC());
  });
  tempSlider.addEventListener("input", onTempSliderInput);
  tempSlider.addEventListener("change", () => {
    gaugeDragging = false;
    syncGaugeFromTemp(getSliderTempC());
    updateRendering();
  });
}

document.querySelectorAll('input[name="gaugeMode"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    if (radio.checked) setGaugeMode(radio.value);
  });
});

async function updateRendering() {
  const tempC = getSliderTempC();
  setTempHtml($("tempDisplay"), tempC, { big: true });

  let data;
  if (USE_STATIC_API) {
    data = clientRenderingAt(tempC);
  } else {
    try {
      const res = await fetch(apiUrl(`/api/rendering/${tempC}`));
      data = res.ok ? await res.json() : clientRenderingAt(tempC);
    } catch {
      data = clientRenderingAt(tempC);
    }
  }

  if (state.gaugeMode === "afterHold") {
    await refreshAfterHoldProjection(tempC);
    if (!gaugeDragging) setGaugeMarkerPosition(state.afterHoldPercent);
  } else if (!gaugeDragging) {
    setGaugeMarkerPosition(data.estimatedRenderedAtPull);
  }

  const displayPct =
    state.gaugeMode === "afterHold" ? state.afterHoldPercent : data.estimatedRenderedAtPull;
  const ready = readiness(tempC, displayPct);
  const stage = data.stage;

  const compactEl = $("renderStatsCompact");
  if (compactEl) {
    compactEl.innerHTML = `
    <div class="stat"><span class="stat-label">Done inside</span><span class="stat-value">${Math.round(displayPct)}%</span></div>
    <div class="stat"><span class="stat-label">Ready to slice?</span><span class="stat-value ${ready.slice.cls}">${ready.slice.text}</span></div>
  `;
  }

  $("renderStats").innerHTML = `
    <div class="stat"><span class="stat-label">Speed at this temp</span><span class="stat-value">+${stage.percentPerHour}% / hour</span></div>
    <div class="stat"><span class="stat-label">OK to eat?</span><span class="stat-value ${ready.eat.cls}">${ready.eat.text}</span></div>
    <div class="stat stat-span-2"><span class="stat-label">Tip</span><span class="stat-value hold">~40% at 195&nbsp;°F before the hot hold is normal — the box finishes the flat.</span></div>
  `;

  const chartNote =
    state.gaugeMode === "afterHold"
      ? `After hold from ${tempHtml(tempC)} → ~${displayPct.toFixed(0)}% tenderness`
      : `If you pulled at ${tempHtml(tempC)} → ~${data.estimatedRenderedAtPull}% tenderness`;
  $("chartMarker").innerHTML = chartNote;
  buildStageTable();

  if (state.chart) {
    const idx = state.stages.findIndex((s, i) => {
      const next = state.stages[i + 1];
      return tempC >= s.tempC && (!next || tempC < next.tempC);
    });
    state.chart.data.datasets[0].pointRadius = state.stages.map((_, i) => (i === idx ? 8 : 4));
    state.chart.data.datasets[0].pointBackgroundColor = state.stages.map((_, i) =>
      i === idx ? "#ffba08" : "#e85d04"
    );
    state.chart.update("none");
  }
  updatePlanSummaryDebounced();
}

function getPullHoldC() {
  const pullEl = $("pullTemp");
  const holdEl = $("holdTemp");
  const pull = tempInputValueC(pullEl);
  const hold = tempInputValueC(holdEl);
  pullEl.dataset.c = String(pull);
  holdEl.dataset.c = String(hold);
  return { pull, hold };
}

async function updateHold() {
  const { pull, hold } = getPullHoldC();
  const target = parseFloat($("targetPercent").value) || 100;

  const data = await fetchHoldPlan(pull, hold, target);

  const holdHrs = data.holdHours ?? "∞";
  const total = data.totalHours != null ? data.totalHours.toFixed(1) : "—";

  state.lastHold = data;
  const holdNum = typeof holdHrs === "number" ? holdHrs.toFixed(1) : holdHrs;
  $("holdResults").innerHTML = `
            <div class="big-number">${holdNum} hr</div>
    <p class="hold-answer-lead">in hot hold at ${tempHtml(hold)} until ~${target}% modeled render</p>
    <button type="button" class="btn-ghost btn-wide plan-goto-btn">Open cook sheet →</button>
  `;
  $("holdResults").querySelector(".plan-goto-btn")?.addEventListener("click", () => goToTab("plan"));

  const breakdown = $("holdBreakdown");
  if (breakdown) {
    breakdown.innerHTML = `
    <ul class="result-steps result-steps-simple">
      <li><span>When you pull off</span><strong>${data.renderedAtPull.toFixed(0)}% done inside</strong></li>
      <li><span>While it cools to hold temp</span><strong>+${data.carryOverAdded.toFixed(0)}%</strong></li>
      <li><span>Then the hold adds</span><strong>${data.remainingAtHold.toFixed(0)}% more</strong></li>
      <li><span>Rough total cook story</span><strong>~${total} hr</strong></li>
    </ul>
    <p class="hint">Use this to understand the plan — on the day, trust your probe and feel.</p>
  `;
  }

  const carry = $("carryViz");
  if (data.carrySteps?.length) {
    carry.hidden = false;
    $("carrySteps").innerHTML = data.carrySteps
      .map((s) => {
        const label = s.label ?? (s.tempC > 0 ? tempHtml(s.tempC) : "~4 hr cool-down");
        const detail =
          s.hours > 0 && s.ratePerHour > 0
            ? `${s.hours} hr @ ${s.ratePerHour}%/hr`
            : s.ratePerHour > 0
              ? `~${s.ratePerHour}%/hr band`
              : "";
        return `<div class="carry-step"><span>${label}</span>${detail ? `<span>${detail}</span>` : ""}<span>+${Number(s.addedPercent).toFixed(0)}%</span></div>`;
      })
      .join("");
  } else {
    carry.hidden = true;
  }
  updatePlanSummaryDebounced();
}

["pullTemp", "holdTemp", "targetPercent"].forEach((id) => {
  $(id).addEventListener("input", () => {
    syncActiveProfileUI();
    updateHold();
  });
});

["lossPercent", "grade"].forEach((id) => {
  const el = $(id);
  if (el) el.addEventListener("input", () => syncActiveProfileUI());
  if (el) el.addEventListener("change", () => syncActiveProfileUI());
});

document.querySelectorAll(".btn-preset").forEach((btn) => {
  btn.addEventListener("click", () => {
    const pull = parseFloat(btn.dataset.pull);
    const hold = parseFloat(btn.dataset.hold);
    setTempInputFromC($("pullTemp"), pull);
    setTempInputFromC($("holdTemp"), hold);
    updateHold();
  });
});

$("applyLongHold")?.addEventListener("click", () => {
  goToTab("hold");
  applyCookProfile("juicy");
});

$("openCookPlan")?.addEventListener("click", () => {
  goToTab("hold");
  applyCookProfile("juicy");
  setTimeout(() => goToTab("plan"), 50);
});

async function updateYield() {
  const kg = readWeightKg();
  const grade = $("grade").value;
  const loss = parseFloat($("lossPercent").value);
  $("lossDisplay").textContent = `${loss}%`;
  const hint = $("weightAltHint");
  if (hint) {
    hint.textContent =
      state.weightUnit === "lb" ? `≈ ${kg.toFixed(1)} kg` : `≈ ${(kg * LB_PER_KG).toFixed(1)} lb`;
  }

  const y = await fetchYieldPlan(kg, grade, loss);
  state.lastYield = y;

  const cookedPct = (y.cookedKg / y.startKg) * 100;
  $("yieldCooked").style.width = `${cookedPct}%`;
  $("yieldStart").textContent = formatWeight(y.startKg);
  $("yieldEnd").textContent = formatWeight(y.cookedKg);

  $("yieldStats").innerHTML = `
    <div><dt>Marbling</dt><dd>${y.marblingBandLabel || "—"}</dd></div>
    <div><dt>Sticker</dt><dd>${y.grade}</dd></div>
    <div><dt>Grading system</dt><dd>${y.gradeRegionLabel || y.gradeRegion || "—"}</dd></div>
    <div><dt>Weight lost</dt><dd>${formatWeight(y.lostKg)}</dd></div>
    <div><dt>Raw water content</dt><dd>~${y.waterContentPercent}%</dd></div>
    <div><dt>Typical loss band</dt><dd>30–43%</dd></div>
  `;
  updatePlanSummaryDebounced();
}

["startWeight", "grade", "lossPercent"].forEach((id) => {
  $(id).addEventListener("input", updateYield);
  $(id).addEventListener("change", updateYield);
});

async function loadScience() {
  try {
    state.science = await apiGet("/api/science");
    renderScience(state.science);
  } catch {
    /* optional on static if export missing */
  }
}

function renderScience(data) {
  if (!data) return;

  $("scienceTitle").textContent = data.title;
  const alt = $("scienceTitleAlt");
  if (data.titleAlt) {
    alt.textContent = data.titleAlt;
    alt.hidden = false;
  } else {
    alt.hidden = true;
  }

  $("trapTempLabel").innerHTML = tempHtml(data.moistureTrap.tempC);
  $("moistureTrapText").textContent = data.moistureTrap.summary;
  $("fatNote").textContent = data.fatNote;

  if ($("scienceProgramming") && data.programmingGuideline) {
    $("scienceProgramming").textContent = data.programmingGuideline;
  }

  const tableBody = $("scienceRenderTable")?.querySelector("tbody");
  if (tableBody && data.renderingTable?.length) {
    tableBody.innerHTML = data.renderingTable
      .map(
        (s) => `<tr>
          <td>${s.tempC}</td>
          <td>${s.tempF}</td>
          <td>${s.multiplier}×</td>
          <td>${s.percentPerHour}%</td>
          <td>${s.hoursTo100}</td>
        </tr>`
      )
      .join("");
  }

  const notes = [];
  if (data.smokeMyth) notes.push(data.smokeMyth);
  if (data.carryOverHotFinish) notes.push(data.carryOverHotFinish);
  if (data.foodSafety) notes.push(data.foodSafety);
  if ($("scienceNotes")) {
    $("scienceNotes").innerHTML = notes.map((n) => `<li>${n}</li>`).join("");
  }

  const rows = data.renderingHighlights
    .map(
      (s) => `<div class="highlight-row">
        <span class="temp">${tempHtml(s.tempC)}</span>
        <span class="mult">${s.multiplier}× · ${s.percentPerHour}%/hr</span>
        <span>~${s.hoursTo100} hr to 100%</span>
      </div>`
    )
    .join("");
  $("renderHighlightTable").innerHTML = `
    <div class="highlight-row header"><span>Temp</span><span>Speed</span><span>Time</span></div>
    ${rows}`;

  function compareCard(pull, kind) {
    const cls = kind === "good" ? "recommended" : "risky";
    const badge =
      kind === "good"
        ? '<span class="badge badge-good">Recommended</span>'
        : '<span class="badge badge-warn">Moisture risk</span>';
    return `<div class="compare-card ${cls}">
      <div class="pull-label">${tempHtml(pull.pullTempC)}</div>
      ${badge}
      <p><strong>${pull.renderedPercent.toFixed(0)}%</strong> rendered at pull · <strong>${pull.remainingPercent.toFixed(0)}%</strong> left for hold</p>
      <p>${pull.moistureRisk}</p>
    </div>`;
  }

  $("comparePulls").innerHTML = compareCard(data.pull195, "good") + compareCard(data.pull203, "risky");

  const m = data.method;

  $("methodSteps").innerHTML = `
    <li>
      <strong>Pull at ${tempText(m.pullC)}</strong>
      <span>Remove from pit when probe feels slightly <em>tight</em> — not butter-tender. ~${m.renderedAtPull}% collagen done.</span>
    </li>
    <li>
      <strong>Hold at ${tempText(m.holdC)}</strong>
      <span>Wrap and hold ${m.holdHoursMin}–${m.holdHoursMax} hours. Finish the remaining ~${m.finishedInHold}% gently.</span>
    </li>
    <li>
      <strong>Moisture reabsorption</strong>
      <span>${m.holdNote}</span>
    </li>`;

  const hp = data.holdPlan;
  const juicyPull = state.constants?.pullLongHoldC ?? 90.5;
  const juicyHold = state.constants?.holdLongC ?? 65.5;
  const declinePct =
    hp.carryOverAdded ??
    computeHoldCarryOver(juicyPull, juicyHold, m.renderedAtPull ?? 40).carryAdded;
  const pitW = m.renderedAtPull;
  const declineW = Math.min(45, declinePct);
  const holdW = 100 - pitW - declineW;

  $("journeyPit").style.width = `${pitW}%`;
  $("journeyPitPct").textContent = `${pitW}%`;
  $("journeyDecline").style.width = `${declineW}%`;
  $("journeyDeclinePct").textContent = `+${declinePct.toFixed(0)}%`;
  $("journeyHold").style.width = `${Math.max(15, holdW)}%`;
  $("journeyHoldPct").textContent = "→100%";

  $("journeyCaption").textContent = hp.totalHours
    ? `Calculator estimate: ~${hp.totalHours} hr total (decline + hold) to reach full tenderness.`
    : "Adjust hold time in Pull & Hold for your exact setup.";

  $("methodStats").innerHTML = `
    <div class="method-stat"><span>After carry-over</span><strong>${hp.afterCarryover?.toFixed(0) ?? "—"}%</strong></div>
    <div class="method-stat"><span>Hold phase</span><strong>${hp.holdHours ?? "—"} hr</strong></div>
    <div class="method-stat"><span>At pull</span><strong>${hp.renderedAtPull}%</strong></div>
    <div class="method-stat"><span>Target window</span><strong>80–120%</strong></div>`;
}

$("scienceToHold")?.addEventListener("click", () => {
  document.querySelector('.tab[data-panel="hold"]').click();
  document.querySelector('.btn-preset[data-pull="90.5"]').click();
});

$("openGuide")?.addEventListener("click", () => {
  document.querySelector('.tab[data-panel="guide"]').click();
  document.getElementById("guide-troubleshooting")?.scrollIntoView({ behavior: "smooth" });
});

$("openRecipes")?.addEventListener("click", () => {
  document.querySelector('.tab[data-panel="recipes"]').click();
  document.getElementById("recipe-foil-boat")?.scrollIntoView({ behavior: "smooth" });
});

function recipeLevelClass(level) {
  const l = (level || "").toLowerCase();
  if (l.includes("begin")) return "beginner";
  if (l.includes("adv")) return "advanced";
  return "";
}

function wireRecipeActions(cardId) {
  const card = document.getElementById(`recipe-${cardId}`);
  if (!card) return;
  card.querySelectorAll("[data-goto-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.gotoTab;
      document.querySelector(`.tab[data-panel="${tab}"]`)?.click();
      if (tab === "hold" && cardId === "long-hold") {
        document.querySelector('.btn-preset[data-pull="90.5"]')?.click();
      }
      if (tab === "dashboard" && cardId === "foil-boat") {
        $("tempSlider").value = 95;
        setGaugeMode("pull");
        onTempSliderInput();
      }
    });
  });
}

async function loadRecipes() {
  let recipes;
  try {
    ({ recipes } = await apiGet("/api/recipes"));
  } catch {
    return;
  }
  if (!recipes?.length) return;
  $("recipeGrid").innerHTML = recipes
    .map((r) => {
      const featured = r.id === "foil-boat" ? " featured" : "";
      const steps = r.steps
        .map((s) => `<li>${s.text}</li>`)
        .join("");
      let actions = "";
      if (r.id === "foil-boat") {
        actions = `<button type="button" class="btn-ghost" data-goto-tab="dashboard">Dashboard @ 95 °C</button>`;
      } else if (r.id === "long-hold") {
        actions = `<button type="button" class="btn-ghost" data-goto-tab="hold">Plan a hold</button><button type="button" class="btn-ghost" data-goto-tab="science">The big idea</button>`;
      } else if (r.id === "confit" || r.id === "reverse-smoked") {
        actions = `<button type="button" class="btn-ghost" data-goto-tab="rest">Cooling off</button>`;
      }
      const meat = r.meat ?? r.Meat ?? "Brisket";
      const meatTag =
        meat !== "Brisket" ? `<span class="recipe-meat">${meat}</span>` : "";
      return `<article class="recipe-card${featured}" id="recipe-${r.id}">
        <div class="recipe-card-head">
          <h3>${r.title} ${meatTag}</h3>
          <span class="recipe-level ${recipeLevelClass(r.level)}">${r.level}</span>
        </div>
        <p class="recipe-sub">${r.subtitle}</p>
        <ol class="recipe-steps">${steps}</ol>
        ${r.finishNote ? `<p class="recipe-finish">${r.finishNote}</p>` : ""}
        ${r.calculatorHint ? `<p class="recipe-calc">↳ ${r.calculatorHint}</p>` : ""}
        <div class="recipe-actions">${actions}</div>
      </article>`;
    })
    .join("");
  recipes.forEach((r) => wireRecipeActions(r.id));
}

async function loadGuide() {
  let sections;
  try {
    ({ sections } = await apiGet("/api/guide"));
  } catch {
    return;
  }
  if (!sections?.length) return;

  $("guideNav").innerHTML = sections
    .map((s) => `<button type="button" class="guide-jump" data-target="guide-${s.id}">${s.title}</button>`)
    .join("");

  $("guideSections").innerHTML = sections
    .map(
      (s) => `<article class="guide-section" id="guide-${s.id}">
      <h3>${s.title}</h3>
      ${s.subtitle ? `<p class="guide-section-sub">${s.subtitle}</p>` : ""}
      <ul class="guide-list">
        ${s.items.map((item) => `<li>${item.text}${item.note ? `<span class="guide-item-note">${item.note}</span>` : ""}</li>`).join("")}
      </ul>
      ${s.callout ? `<p class="guide-callout">${s.callout}</p>` : ""}
    </article>`
    )
    .join("");

  document.querySelectorAll(".guide-jump").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById(btn.dataset.target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

const REST_ENV_DEFAULTS = [
  {
    id: "hold150",
    name: "Warm holder / cambro",
    ambientC: 65.5,
    ambientF: 150,
    tauHours: 2,
    description: "Wrapped brisket cools into ~65.5 °C hold",
  },
  {
    id: "counter",
    name: "Kitchen counter",
    ambientC: 21,
    ambientF: 70,
    tauHours: 2.5,
    description: "Room temp — good for short rest if pulled hot",
  },
  {
    id: "fridge",
    name: "Fridge",
    ambientC: 4,
    ambientF: 39,
    tauHours: 1.2,
    description: "Chills fast — rendering nearly stops",
  },
  {
    id: "custom",
    name: "Custom ambient",
    ambientC: 65.5,
    ambientF: 150,
    tauHours: 2,
    description: "Your oven low / cool box / cambro setting",
  },
];

function normalizeEnv(e) {
  const ambientC = e.ambientC ?? e.AmbientC ?? 21;
  return {
    id: e.id ?? e.Id,
    name: e.name ?? e.Name,
    ambientC,
    ambientF: e.ambientF ?? e.AmbientF ?? Math.round(cToF(ambientC)),
    tauHours: e.tauHours ?? e.TauHours ?? 2,
    description: e.description ?? e.Description ?? "",
  };
}

function getRestEnvList() {
  return state.restEnvs?.length ? state.restEnvs : REST_ENV_DEFAULTS.map(normalizeEnv);
}

function getRestEnvById(envId) {
  return getRestEnvList().find((e) => e.id === envId) ?? getRestEnvList()[0];
}

function getStageForTemp(tempC) {
  if (!state.stages?.length || tempC < 60) return { percentPerHour: 0 };
  let best = state.stages[0];
  for (const s of state.stages) {
    if (tempC >= s.tempC) best = s;
    else break;
  }
  return best;
}

function tempAtTime(startTempC, ambientTempC, tauHours, hours) {
  if (tauHours <= 0) return ambientTempC;
  return ambientTempC + (startTempC - ambientTempC) * Math.exp(-hours / tauHours);
}

const CARRY_LEGACY_BANDS = [
  [88, 1, 18],
  [82, 1, 9],
  [76.5, 1, 5],
  [71, 1, 3],
];

function carryConstants() {
  const c = state.constants || {};
  return {
    cooldownHours: c.carryCooldownHours ?? 4,
    endMarginC: c.carryEndMarginC ?? 0.5,
    tauDefault: c.holdCarryTauDefault ?? 2,
  };
}

function solveTauForCooldown(pull, ambient, durationHours, endTargetC) {
  const { tauDefault } = carryConstants();
  if (durationHours <= 0 || pull <= ambient + 0.01) return tauDefault;
  const ratio = (endTargetC - ambient) / (pull - ambient);
  if (ratio <= 0 || ratio >= 1) return tauDefault;
  return -durationHours / Math.log(ratio);
}

function estimateLegacyBandCarry(pull, hold) {
  const { endMarginC } = carryConstants();
  if (hold >= pull - endMarginC) return 0;
  let sum = 0;
  for (const [tempC, hours, rate] of CARRY_LEGACY_BANDS) {
    if (tempC > pull) continue;
    if (tempC < hold) break;
    sum += hours * rate;
  }
  return sum;
}

function aggregateCarrySteps(restSteps, durationHours, totalAdded) {
  if (!restSteps?.length) {
    return [{ tempC: 0, hours: durationHours, ratePerHour: 0, addedPercent: totalAdded, label: "~4 hr cool-down into hold" }];
  }
  const byStage = new Map();
  for (const step of restSteps) {
    const stage = getStageForTemp(step.tempC);
    const key = stage.tempC;
    byStage.set(key, (byStage.get(key) ?? 0) + step.renderingAdded);
  }
  const rows = [...byStage.entries()]
    .filter(([, v]) => v > 0.05)
    .sort((a, b) => b[0] - a[0])
    .map(([tempC, added]) => ({
      tempC,
      hours: 0,
      ratePerHour: getStageForTemp(tempC).percentPerHour,
      addedPercent: Math.round(added * 10) / 10,
      label: null,
    }));
  return rows.length
    ? rows
    : [{ tempC: 0, hours: durationHours, ratePerHour: 0, addedPercent: totalAdded, label: "~4 hr cool-down into hold" }];
}

function computeHoldCarryOver(pull, hold, renderedAtPull) {
  const { cooldownHours, endMarginC, tauDefault } = carryConstants();
  const endTarget = hold + endMarginC;
  const solvedTau = solveTauForCooldown(pull, hold, cooldownHours, endTarget);
  const tau = Math.max(solvedTau, tauDefault);
  const projection = predictRestClient(pull, hold, cooldownHours, tau, renderedAtPull);
  const integrated = Math.max(0, projection.endRenderedPercent - renderedAtPull);
  const carryAdded = Math.max(integrated, estimateLegacyBandCarry(pull, hold));
  return {
    carryAdded,
    cooldownHours,
    afterCarryover: renderedAtPull + carryAdded,
    carrySteps: aggregateCarrySteps(projection.steps, cooldownHours, carryAdded),
  };
}

function computeHoldPlanClient(pull, hold, target = 100) {
  const renderedAtPull = estimateRenderedAtPull(pull);
  const { endMarginC } = carryConstants();
  let carryOver = 0;
  let carrySteps = [];
  let cooldownHours = 0;
  let afterCarry = renderedAtPull;
  if (hold < pull - endMarginC) {
    const cool = computeHoldCarryOver(pull, hold, renderedAtPull);
    carryOver = cool.carryAdded;
    carrySteps = cool.carrySteps;
    cooldownHours = cool.cooldownHours;
    afterCarry = cool.afterCarryover;
  }
  const remaining = Math.max(0, target - afterCarry);
  const rate = getStageForTemp(hold).percentPerHour;
  const holdHours = rate > 0 ? remaining / rate : null;
  return {
    renderedAtPull,
    carryOverAdded: carryOver,
    carrySteps,
    afterCarryover: afterCarry,
    remainingAtHold: remaining,
    holdRatePerHour: rate,
    holdHours,
    projectedFinal: target,
    cooldownHours,
    totalHours: (holdHours ?? 0) + cooldownHours,
  };
}

function predictRestClient(startTempC, ambientTempC, durationHours, tauHours, startRenderedPercent) {
  let rendered = startRenderedPercent ?? estimateRenderedAtPull(startTempC);
  const startRendered = rendered;
  const steps = [];
  let temp = startTempC;
  let elapsed = 0;
  const stepH = 0.5;

  while (elapsed < durationHours - 0.0001) {
    const dt = Math.min(stepH, durationHours - elapsed);
    const tempStart = temp;
    const tempEnd = tempAtTime(tempStart, ambientTempC, tauHours, dt);
    const tempAvg = (tempStart + tempEnd) / 2;
    const rate = getStageForTemp(tempAvg).percentPerHour;
    const added = rate * dt;
    rendered = Math.min(130, rendered + added);
    elapsed += dt;
    temp = tempEnd;
    steps.push({
      hour: Math.round(elapsed * 100) / 100,
      tempC: Math.round(tempEnd * 10) / 10,
      renderingAdded: Math.round(added * 100) / 100,
      renderingTotal: Math.round(rendered * 10) / 10,
    });
  }

  return {
    startTempC: Math.round(startTempC * 10) / 10,
    ambientTempC: Math.round(ambientTempC * 10) / 10,
    durationHours: Math.round(durationHours * 100) / 100,
    endTempC: Math.round(temp * 10) / 10,
    endRenderedPercent: Math.round(rendered * 10) / 10,
    startRenderedPercent: Math.round(startRendered * 10) / 10,
    steps,
  };
}

function buildRestSummary(p, hours) {
  const delta = p.endTempC - p.startTempC;
  const dir = delta > 0.5 ? "warms to" : delta < -0.5 ? "cools to" : "stays about";
  const rend = p.endRenderedPercent - p.startRenderedPercent;
  return `After ${hours} hr it ${dir} ${p.endTempC.toFixed(1)} °C inside; tenderness +${rend.toFixed(0)}% (now ~${Math.round(p.endRenderedPercent)}%).`;
}

function setRestEnvironment(envId) {
  const list = getRestEnvList();
  const activeId = list.some((e) => e.id === envId) ? envId : list[0]?.id;
  $("restEnv").value = activeId;
  document.querySelectorAll(".env-pick").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.env === activeId);
  });
  $("restCustomAmbientField").hidden = activeId !== "custom";
  updateRest();
}

let restEnvBarWired = false;

function wireRestEnvBar() {
  if (restEnvBarWired) return;
  const bar = $("restEnvBar");
  if (!bar) return;
  restEnvBarWired = true;
  bar.addEventListener("click", (e) => {
    const btn = e.target.closest(".env-pick");
    if (!btn?.dataset.env) return;
    setRestEnvironment(btn.dataset.env);
  });
}

function renderRestEnvPicker(envs, keepId) {
  const list = envs.map(normalizeEnv);
  state.restEnvs = list;
  const sel = $("restEnv");
  const prev = keepId ?? sel.value;
  const activeId = list.some((e) => e.id === prev) ? prev : list[0]?.id;

  sel.innerHTML = list
    .map(
      (e) =>
        `<option value="${e.id}">${e.name} — ~${e.ambientC} °C (${e.ambientF} °F)</option>`
    )
    .join("");
  sel.value = activeId;

  $("restEnvBar").innerHTML = list
    .map((e) => {
      const on = e.id === activeId ? " active" : "";
      return `<button type="button" class="env-pick${on}" data-env="${e.id}">
        ${e.name}
        <small>~${e.ambientC} °C (${e.ambientF} °F) · ${e.description}</small>
      </button>`;
    })
    .join("");
}

async function loadRestEnvironments() {
  try {
    const data = await apiGet("/api/rest/environments");
    const envs = Array.isArray(data) ? data : data.environments ?? [];
    if (envs.length) renderRestEnvPicker(envs, $("restEnv").value);
  } catch {
    /* defaults already rendered */
  }
}

function normalizeRestStep(s) {
  return {
    hour: s.hour ?? s.Hour,
    tempC: s.tempC ?? s.TempC,
    renderingAdded: s.renderingAdded ?? s.RenderingAdded,
    renderingTotal: s.renderingTotal ?? s.RenderingTotal,
  };
}

function normalizeRestProjection(raw) {
  if (!raw) return null;
  const steps = (raw.steps ?? raw.Steps ?? []).map(normalizeRestStep);
  return {
    startTempC: raw.startTempC ?? raw.StartTempC,
    ambientTempC: raw.ambientTempC ?? raw.AmbientTempC,
    endTempC: raw.endTempC ?? raw.EndTempC,
    endRenderedPercent: raw.endRenderedPercent ?? raw.EndRenderedPercent,
    startRenderedPercent: raw.startRenderedPercent ?? raw.StartRenderedPercent,
    steps,
  };
}

async function updateRest() {
  const startTempC = tempInputValueC($("restStartTemp"));
  const hours = parseFloat($("restHours").value) || 1;
  const envId = $("restEnv").value || "hold150";
  const env = getRestEnvById(envId);
  const ambient =
    envId === "custom" ? tempInputValueC($("restAmbient")) : env.ambientC;
  const tau = env.tauHours ?? 2;

  $("restCustomAmbientField").hidden = envId !== "custom";
  $("restHoursDisplay").textContent = `${hours} hr`;

  let p = null;
  let summary = "";
  let offline = false;

  try {
    const data = await apiPost("/api/rest", {
      startTempC,
      durationHours: hours,
      environmentId: envId,
      ambientTempC: envId === "custom" ? ambient : undefined,
    });
    p = normalizeRestProjection(data.projection ?? data.Projection);
    summary = data.summary ?? data.Summary ?? "";
  } catch {
    /* use client model */
  }

  if (!p) {
    offline = true;
    p = predictRestClient(startTempC, ambient, hours, tau);
    summary = buildRestSummary(p, hours);
  }

  const ready = readiness(p.endTempC, p.endRenderedPercent);
  const envLabel = env.name;

  $("restResults").innerHTML = `
    <div class="rest-result-hero">${tempHtml(p.endTempC)}</div>
    <p class="rest-result-lead">inside the meat after <strong>${hours} hr</strong> on <strong>${envLabel}</strong></p>
    <ul class="result-steps result-steps-simple">
      <li><span>Tenderness after</span><strong>${p.endRenderedPercent}%</strong></li>
      <li><span>OK to slice?</span><strong class="stat-value ${ready.slice.cls}">${ready.slice.text}</strong></li>
    </ul>
  `;

  const restDetails = $("restDetailsExpand");
  const steps = p.steps ?? [];
  const summaryHtml = `<p class="hint">${summary}${offline ? " · rough browser math" : ""}</p>`;
  if (steps.length) {
    if (restDetails) restDetails.hidden = false;
    $("restSteps").innerHTML =
      summaryHtml +
      steps
      .map(
        (s) =>
          `<div class="rest-step-row"><span>${s.hour}h</span><span>${s.tempC} °C</span><span>+${s.renderingAdded}% → ${s.renderingTotal}%</span></div>`
      )
      .join("");
  } else {
    if (restDetails) restDetails.hidden = true;
  }
}

const updateRestDebounced = debounce(() => updateRest(), 120);
const updatePlanSummaryDebounced = debounce(() => updatePlanSummary(), 200);

function goToTab(panelId) {
  document.querySelector(`.tab[data-panel="${panelId}"]`)?.click();
}

async function loadProfiles() {
  try {
    const data = await apiGet("/api/profiles");
    state.profiles = data.profiles ?? [];
    state.betweenNote = data.betweenNote ?? "";
    renderProfilePicker();
  } catch {
    /* offline — presets still work via applyCookProfile fallbacks */
  }
}

function getProfileById(id) {
  return state.profiles.find((p) => p.id === id);
}

function renderProfilePicker() {
  const container = $("profilePicker");
  if (!container) return;

  if (!state.profiles.length) {
    container.innerHTML = `<p class="hint">Presets: Juicy (90.5 °C / 195 °F), In between (~92.8 °C), Hotter pull (95 °C / 203 °F)</p>`;
    return;
  }

  container.innerHTML = `
    <p class="profile-picker-lead">Juicy, in-between, or hotter pull — sets temps, shrink %, and syncs the probe slider.</p>
    <div class="profile-row" role="group" aria-label="Cook presets">
      ${state.profiles
        .map((p) => {
          const holdLabel =
            p.holdHours != null
              ? `~${p.holdHours} hr hold`
              : `hold ${tempHtml(p.holdTempC)}`;
          return `<button type="button" class="btn-profile${p.isBetween ? " btn-profile-balanced" : ""}" data-profile="${p.id}">
        <span class="btn-profile-name">${p.name}</span>
        <span class="btn-profile-sub">${tempHtml(p.pullTempC)} pull · ${holdLabel}</span>
      </button>`;
        })
        .join("")}
    </div>
    <p class="hint profile-rationale" id="profileRationale">${state.betweenNote}</p>
  `;

  container.querySelectorAll("[data-profile]").forEach((btn) => {
    btn.addEventListener("click", () => applyCookProfile(btn.dataset.profile));
  });
  syncActiveProfileUI();
}

function applyCookProfile(id) {
  let profile = getProfileById(id);
  if (!profile) {
    const fallbacks = {
      juicy: {
        pullTempC: 90.5,
        holdTempC: 65.5,
        lossPercent: 35,
        gradeId: "us_choice",
        targetPercent: 100,
        rationale: "",
      },
      balanced: {
        pullTempC: 92.8,
        holdTempC: 65.5,
        lossPercent: 37.5,
        gradeId: "us_choice",
        targetPercent: 100,
        rationale:
          "Midpoint between 90.5 °C and 95 °C pull, same 65.5 °C hold, ~37.5% shrink.",
      },
      traditional: {
        pullTempC: 95,
        holdTempC: 65.5,
        lossPercent: 40,
        gradeId: "us_choice",
        targetPercent: 100,
        rationale: "",
      },
    };
    profile = fallbacks[id];
    if (!profile) return;
  }

  state.activeProfileId = id;

  setTempInputFromC($("pullTemp"), profile.pullTempC);
  setTempInputFromC($("holdTemp"), profile.holdTempC);
  $("targetPercent").value = profile.targetPercent ?? 100;
  $("lossPercent").value = profile.lossPercent;
  $("lossDisplay").textContent = `${profile.lossPercent}%`;
  if ($("grade")) populateGradeSelect(normalizeGradeId(profile.gradeId ?? DEFAULT_GRADE_ID));
  $("tempSlider").value = profile.pullTempC;

  const rationale = $("profileRationale");
  if (rationale) {
    rationale.textContent = profile.rationale || state.betweenNote;
  }

  syncActiveProfileUI();
  onTempSliderInput();
  updateHold();
  updateYield();
  updatePlanSummaryDebounced();
  saveCookPrefsDebounced();
}

function detectActiveProfileId() {
  if (!state.profiles.length) return null;
  const pull = tempInputValueC($("pullTemp"));
  const hold = tempInputValueC($("holdTemp"));
  const loss = parseFloat($("lossPercent")?.value);
  if (!Number.isFinite(pull) || !Number.isFinite(hold)) return null;

  for (const p of state.profiles) {
    if (
      Math.abs(pull - p.pullTempC) < 0.6 &&
      Math.abs(hold - p.holdTempC) < 0.6 &&
      Math.abs(loss - p.lossPercent) < 1.5
    ) {
      return p.id;
    }
  }
  return null;
}

function syncActiveProfileUI() {
  const detected = detectActiveProfileId();
  state.activeProfileId = detected;
  document.querySelectorAll(".btn-profile").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.profile === detected);
  });
  const p = getProfileById(detected);
  const rationale = $("profileRationale");
  if (rationale && p?.rationale) rationale.textContent = p.rationale;
}

function wireGlobalNav() {
  document.querySelectorAll("[data-goto-tab]").forEach((el) => {
    if (el.dataset.navWired) return;
    el.dataset.navWired = "1";
    el.addEventListener("click", (e) => {
      if (el.tagName === "A") e.preventDefault();
      goToTab(el.dataset.gotoTab);
    });
  });
}

function initExpandSections() {
  document.querySelectorAll(".expand-section").forEach((details) => {
    if (details.dataset.expandWired) return;
    details.dataset.expandWired = "1";
    details.addEventListener("toggle", () => {
      if (details.open && state.chart && details.querySelector("#rateChart")) {
        state.chart.resize();
      }
    });
  });
}

function formatHoldHours(h) {
  if (h == null || h === "∞" || !Number.isFinite(h)) return "—";
  const n = Number(h);
  if (n >= 11 && n <= 19) return `~${Math.round(n)} hr (often 12–18 hr band)`;
  return `~${n.toFixed(1)} hr`;
}

async function fetchHoldPlan(pull, hold, target) {
  try {
    return await apiPost("/api/hold", { pullTempC: pull, holdTempC: hold, targetPercent: target });
  } catch {
    /* fallback — same rest + legacy band model as server */
  }
  return computeHoldPlanClient(pull, hold, target);
}

async function fetchYieldPlan(kg, grade, loss) {
  try {
    return await apiPost("/api/yield", { weightKg: kg, grade, lossPercent: loss });
  } catch {
    /* fallback */
  }
  const cooked = kg * (1 - loss / 100);
  const g = state.grades.find((x) => x.id === grade) ?? state.grades[0];
  return {
    startKg: kg,
    cookedKg: cooked,
    lostKg: kg - cooked,
    grade: g?.name ?? grade,
    gradeRegion: g?.region ?? "",
    gradeRegionLabel: g?.regionLabel ?? "",
    marblingBand: g?.marblingBand ?? "",
    marblingBandLabel: g?.marblingBandLabel ?? "",
    marblingMin: g?.marblingMin,
    marblingMax: g?.marblingMax,
    waterContentPercent: 70,
  };
}

function buildPlanPlainText(parts, profileName) {
  const lines = [
    "SMOKE LAB - BBQ — BRISKET COOK SHEET",
    "(Pull-and-hold planner)",
  ];
  if (profileName) lines.push(`Preset: ${profileName}`);
  lines.push(
    "",
    "MEAT",
    `• Raw: ${parts.meatRaw}`,
    `• Expect after cook: ${parts.meatCooked} (${parts.loss}% shrink)`,
    `• Grade: ${parts.grade}`,
    "",
    "ON THE PIT (rough)",
    `• Pit ~${parts.pitStart} to start, ~${parts.pitBoost} after stall`,
    `• Plan ~${parts.pitHours} on the smoker`,
    `• Stall often ${parts.stallRange}`,
    "",
    "PULL OFF",
    `• Internal ${parts.pullTemp} — ~${parts.tendernessPull}% tenderness built`,
    `• Probe: glide-in butter on the flat — not mush`,
    "",
    "HOLD",
    `• ${parts.holdWhere} at ${parts.holdTemp}`,
    `• ${parts.holdHours}`,
    `• Target tenderness ~${parts.holdTarget}%`,
    "",
    "BEFORE YOU SLICE",
    parts.sliceNote,
    "",
    "DAY-OF CHECKLIST",
    ...parts.checklist.map((c) => `☐ ${c}`),
    "",
    "DISCLAIMER",
    "Built with AI assistance. Science from Steve Gow / Smoke Trails BBQ (YouTube: https://www.youtube.com/@SmokeTrailsBBQ). Not affiliated or endorsed. Planning only — verify with probe and feel.",
  );
  return lines.join("\n");
}

async function updatePlanSummary() {
  const sheet = $("planSheet");
  if (!sheet) return;

  const { pull, hold } = getPullHoldC();
  const target = parseFloat($("targetPercent")?.value) || 100;
  const kg = readWeightKg();
  const loss = parseFloat($("lossPercent")?.value) || 35;
  const gradeId = $("grade")?.value || DEFAULT_GRADE_ID;

  const [holdData, yieldData] = await Promise.all([
    fetchHoldPlan(pull, hold, target),
    fetchYieldPlan(kg, gradeId, loss),
  ]);
  state.lastHold = holdData;
  state.lastYield = yieldData;

  const c = state.constants || {};
  const pitStart = c.pitStartC ?? 121;
  const pitBoost = c.pitBoostC ?? 149;
  const holdMin = c.holdLongHoursMin ?? 12;
  const holdMax = c.holdLongHoursMax ?? 18;
  const tendernessPull = Math.round(holdData.renderedAtPull ?? estimateRenderedAtPull(pull));
  const holdHrs = holdData.holdHours;
  const holdHoursText = formatHoldHours(holdHrs);
  const ready = readiness(pull, tendernessPull);
  const afterHoldPct = holdData.projectedFinal ?? target;

  const meatRaw = formatWeight(yieldData.startKg, { showBoth: true });
  const meatCooked = formatWeight(yieldData.cookedKg, { showBoth: true });
  const band = yieldData.marblingBandLabel ? ` — ${yieldData.marblingBandLabel}` : "";
  const region = yieldData.gradeRegionLabel ? ` (${yieldData.gradeRegionLabel})` : "";
  const gradeLine = `${yieldData.grade}${band}${region}`;

  const checklist = [
    `Trim & season the night before (dry brine if you use it)`,
    `Start pit ~${pitStart} °C (${cToF(pitStart).toFixed(0)} °F)`,
    `Smoke until probe feels right — pull ~${pull.toFixed(1)} °C (${cToF(pull).toFixed(0)} °F)`,
    `Wrap, cambro / hold oven ~${hold.toFixed(1)} °C (${cToF(hold).toFixed(0)} °F)`,
    `${typeof holdHrs === "number" ? `Hold about ${Math.round(holdHrs)} hours` : `Hold ${holdMin}–${holdMax} hours`} (check tenderness)`,
    `Rest if needed, slice when it slices cleanly`,
  ];

  const parts = {
    meatRaw,
    meatCooked,
    loss,
    grade: gradeLine,
    pitStart: `${pitStart} °C (${cToF(pitStart).toFixed(0)} °F)`,
    pitBoost: `${pitBoost} °C (${cToF(pitBoost).toFixed(0)} °F)`,
    pitHours: "10–12 hours",
    stallRange: stallRangeText(),
    pullTemp: tempText(pull),
    tendernessPull,
    holdWhere: "Wrapped in warm cambro / holding oven",
    holdTemp: tempText(hold),
    holdHours: holdHoursText,
    holdTarget: target,
    sliceNote: `Aim for ~${c.doneMin ?? 80}–${c.doneMax ?? 120}% tenderness built before slicing (model). After hold: ~${Math.round(afterHoldPct)}%.`,
    checklist,
  };

  const activeProfile = getProfileById(state.activeProfileId);
  state.planPlainText = buildPlanPlainText(parts, activeProfile?.name);

  const profileBadge = activeProfile
    ? `<span class="plan-profile-badge">${activeProfile.name}</span>`
    : "";

  sheet.innerHTML = `
    <article class="plan-block plan-block-highlight">
      <h3>Brisket cook sheet ${profileBadge}</h3>
      <p class="plan-lead">${meatRaw} raw → about <strong>${formatWeight(yieldData.cookedKg)}</strong> cooked · pull ${tempHtml(pull)} · hold ${tempHtml(hold)} · <strong>${holdHoursText}</strong></p>
      ${activeProfile?.isBetween ? `<p class="hint">In-between: midpoint between 195&nbsp;°F juicy pull and 203&nbsp;°F grate-done pull.</p>` : ""}
    </article>

    <article class="plan-block plan-checklist-block">
      <h3>Day-of checklist</h3>
      <ol class="plan-checklist">
        ${checklist.map((item) => `<li>${item}</li>`).join("")}
      </ol>
    </article>

    <details class="expand-section">
      <summary>All the details (meat, pit, pull, hold, slicing)</summary>
            <div class="expand-body plan-sheet-details">
        <div class="plan-grid">
      <article class="plan-block">
        <div class="plan-block-head">
          <h3>Meat &amp; shopping</h3>
          <button type="button" class="btn-ghost btn-tiny" data-goto-tab="yield">Edit</button>
        </div>
        <ul class="plan-facts">
          <li><span>Buy</span><strong>${meatRaw}</strong></li>
          <li><span>Expect on the plate</span><strong>~${meatCooked}</strong></li>
          <li><span>Shrink you planned</span><strong>${loss}%</strong></li>
          <li><span>Grade</span><strong>${gradeLine}</strong></li>
        </ul>
      </article>

      <article class="plan-block">
        <div class="plan-block-head">
          <h3>On the pit</h3>
          <button type="button" class="btn-ghost btn-tiny" data-goto-tab="dashboard">Probe</button>
        </div>
        <ul class="plan-facts">
          <li><span>Start pit</span><strong>~${parts.pitStart}</strong></li>
          <li><span>After stall</span><strong>~${parts.pitBoost}</strong></li>
          <li><span>Time on smoke</span><strong>${parts.pitHours} (rough)</strong></li>
          <li><span>Stall zone</span><strong>${parts.stallRange}</strong></li>
        </ul>
      </article>

      <article class="plan-block">
        <div class="plan-block-head">
          <h3>Pull off the pit</h3>
          <button type="button" class="btn-ghost btn-tiny" data-goto-tab="hold">Edit</button>
        </div>
        <ul class="plan-facts">
          <li><span>Internal temp</span><strong>${tempHtml(pull)}</strong></li>
          <li><span>Tenderness built</span><strong>~${tendernessPull}%</strong> (model)</li>
          <li><span>OK to eat at pull?</span><strong class="stat-value ${ready.eat.cls}">${ready.eat.text}</strong></li>
          <li><span>Probe feel</span><strong>Firm, not mush — like room-temp butter later</strong></li>
        </ul>
      </article>

      <article class="plan-block">
        <div class="plan-block-head">
          <h3>Hold</h3>
          <button type="button" class="btn-ghost btn-tiny" data-goto-tab="hold">Edit</button>
        </div>
        <ul class="plan-facts">
          <li><span>Where</span><strong>${parts.holdWhere}</strong></li>
          <li><span>Box temp</span><strong>${tempHtml(hold)}</strong></li>
          <li><span>How long</span><strong>${holdHoursText}</strong></li>
          <li><span>While cooling to hold</span><strong>+${(holdData.carryOverAdded ?? 0).toFixed(0)}% tenderness</strong></li>
          <li><span>Target inside</span><strong>~${target}%</strong></li>
        </ul>
      </article>
        </div>

        <article class="plan-block">
          <h3>Before you slice</h3>
          <p>${parts.sliceNote}</p>
          <p class="hint">Eating tender and slicing cleanly are different — many pulls are meant to finish in the hold.</p>
          <p class="hint">Numbers come from <strong>Weight</strong> and <strong>Hold</strong> — change those, then refresh.</p>
        </article>
      </div>
    </details>
  `;

  sheet.querySelectorAll("[data-goto-tab]").forEach((btn) => {
    btn.addEventListener("click", () => goToTab(btn.dataset.gotoTab));
  });
  wireGlobalNav();
}

function getShareUrl() {
  const path = location.pathname.replace(/index\.html$/i, "");
  const normalized = path.endsWith("/") ? path : `${path}/`;
  const base = `${location.origin}${normalized}`;
  const q = cookStateToSearchParams().toString();
  return q ? `${base}?${q}` : base;
}

async function copyShareLink(triggerBtn) {
  const url = getShareUrl();
  try {
    await navigator.clipboard.writeText(url);
    if (triggerBtn) {
      const prev = triggerBtn.textContent;
      triggerBtn.textContent = "Copied!";
      setTimeout(() => {
        triggerBtn.textContent = prev;
      }, 2000);
    }
  } catch {
    window.prompt("Copy this link to share:", url);
  }
}

function pagesShareLabel() {
  if (!location.hostname.endsWith("github.io")) return location.host;
  const seg = location.pathname.split("/").filter(Boolean)[0];
  return seg ? `${location.hostname}/${seg}` : location.hostname;
}

function wireShareLinks() {
  const display = $("shareUrlDisplay");
  if (display) {
    display.textContent = pagesShareLabel();
  }
  ["copyShareLink", "copyShareLinkPlan", "copyShareLinkFooter"].forEach((id) => {
    $(id)?.addEventListener("click", (e) => copyShareLink(e.currentTarget));
  });
}

function initPlan() {
  $("copyPlan")?.addEventListener("click", async () => {
    const text = state.planPlainText || "";
    if (!text) {
      await updatePlanSummary();
    }
    try {
      await navigator.clipboard.writeText(state.planPlainText || "");
      const btn = $("copyPlan");
      const prev = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => {
        btn.textContent = prev;
      }, 2000);
    } catch {
      window.prompt("Copy this plan:", state.planPlainText);
    }
  });
  $("refreshPlan")?.addEventListener("click", () => updatePlanSummary());
}

function sourceWatchUrl(s) {
  if (s.url) return s.url;
  const q = encodeURIComponent(`Steve Gow Smoke Trails ${s.title}`);
  return `https://www.youtube.com/results?search_query=${q}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderSources(data) {
  const intro = $("sourcesIntro");
  const list = $("sourcesList");
  if (!intro || !list) return;

  intro.textContent = data.intro || "";

  const items = data.sources || [];
  list.innerHTML = items
    .map((s) => {
      const url = escapeHtml(sourceWatchUrl(s));
      const label = s.url ? "Watch ↗" : "Find video ↗";
      const primary = s.isPrimary
        ? '<span class="source-primary-badge">Primary model source</span>'
        : "";
      return `<li class="source-item${s.isPrimary ? " source-item-primary" : ""}">
        <div class="source-item-body">
          <strong class="source-title">${escapeHtml(s.title)}</strong>
          ${primary}
          <p class="source-summary">${escapeHtml(s.summary)}</p>
        </div>
        <a href="${url}" class="source-link-btn" rel="noopener noreferrer" target="_blank">${label}</a>
      </li>`;
    })
    .join("");
}

async function loadSources() {
  try {
    const data = await apiGet("/api/sources");
    renderSources(data);
  } catch {
    const intro = $("sourcesIntro");
    if (intro) {
      intro.textContent =
        "Sources list loads from the server on localhost, or from api/sources.json on GitHub Pages.";
    }
  }
}

function openSourcesPanel() {
  goToTab("reference");
  const section = $("sourcesSection");
  if (section) {
    section.open = true;
    setTimeout(() => section.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }
}

function initRest() {
  wireRestEnvBar();
  renderRestEnvPicker(REST_ENV_DEFAULTS, $("restEnv").value || "hold150");

  $("restHoursDisplay").textContent = `${$("restHours").value} hr`;
  $("restHours").addEventListener("input", () => {
    $("restHoursDisplay").textContent = `${$("restHours").value} hr`;
    updateRestDebounced();
  });
  $("restHours").addEventListener("change", () => updateRest());

  ["restStartTemp", "restAmbient"].forEach((id) => {
    const el = $(id);
    if (el) {
      el.addEventListener("input", updateRestDebounced);
      el.addEventListener("change", updateRest);
    }
  });

  $("restEnv").addEventListener("change", () => {
    setRestEnvironment($("restEnv").value);
  });

  $("restUseDashboard")?.addEventListener("click", () => {
    setTempInputFromC($("restStartTemp"), getSliderTempC());
    updateRest();
  });
}

initUnits();

loadData()
  .then(() => {
    initRest();
    initPlan();
    initExpandSections();
    wireGlobalNav();
    wireShareLinks();
    $("openSources")?.addEventListener("click", openSourcesPanel);
    $("openCookPlanFromDash")?.addEventListener("click", () => {
      goToTab("hold");
      applyCookProfile("balanced");
      setTimeout(() => goToTab("plan"), 50);
    });
    return Promise.all([updateRest(), updatePlanSummary()]);
  })
  .then(() =>
    Promise.allSettled([
      loadScience(),
      loadGuide(),
      loadRecipes(),
      loadRestEnvironments(),
      loadProfiles(),
      loadSources(),
    ])
  )
  .then(() => {
    applyUnitPrefs();
    restoreCookStateAfterLoad();
    return refreshAllForUnits({ weight: true });
  })
  .catch(console.error);

wireCookStatePersistence();
