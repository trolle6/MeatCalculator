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
  tempUnit: "f",
  clockInputUnit: "12",
  sliceAmPm: "PM",
};

const $ = (id) => document.getElementById(id);

/** Footer badge: keep in sync with `<meta name="smoke-lab-build" content="…">` in index.html. */
function syncFooterVersionFromBuildMeta() {
  const meta = document.querySelector('meta[name="smoke-lab-build"]');
  const el = $("footerAppVersion");
  if (!el) return;
  const b = meta?.getAttribute("content")?.trim();
  if (b) el.textContent = `v${b}`;
}

syncFooterVersionFromBuildMeta();

/*
 * ---------------------------------------------------------------------------
 * Smoke Lab client — file map (single bundle). Boot: `startSmokeLabApp()`.
 * ---------------------------------------------------------------------------
 *  ENV & HTTP          getPagesBase, USE_STATIC_API, IS_PUBLIC_SIMPLE, apiGet/Post
 *  Hold planner rows   buildHoldOptionRows, renderHoldOptionsTable, selectHoldOption
 *  Slice wall-clock    resolveSliceDateTime, parseSliceTimeText, syncSliceTimeFromInputs,
 *                      initSliceTimeInput, computePitStartSchedule, updateSliceTimeUntilHint
 *  Cook prefs & URL    loadUnitPrefs, collectCookState, restoreCookStateAfterLoad
 *  Units & temps       initUnits, applyUnitPrefs, refreshAllForUnits, tempHtml, simple pull
 *  Probe / hold / plan updateHold, updatePlanSummary, renderPlan…, gauge
 *  Learn / reference   loadScience, loadGuide, loadSources, initRest
 * ---------------------------------------------------------------------------
 */

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

function isLocalDevHost() {
  const h = location.hostname;
  return h === "localhost" || h === "127.0.0.1";
}

/** Public one-screen planner (github.io or localhost). Add <code>?full=1</code> for tabs, gauge, Learn, etc. */
const IS_PUBLIC_SIMPLE =
  (location.hostname.endsWith("github.io") || isLocalDevHost()) &&
  !new URLSearchParams(location.search).has("full");

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
  const estimatedRenderedAtPull = estimateRenderedAtPull(tempC);
  const band = renderBand(estimatedRenderedAtPull);
  return {
    estimatedRenderedAtPull,
    renderLow: band.low,
    renderHigh: band.high,
    stage: getStageForTemp(tempC),
  };
}

function renderBand(mid) {
  const n = Number(mid);
  const m = Number.isFinite(n) ? Math.min(120, Math.max(0, n)) : 0;
  return {
    low: Math.round(m * 0.9 * 10) / 10,
    high: Math.min(100, Math.round(m * 1.1 * 10) / 10),
  };
}

function formatPctRange(mid, low, high) {
  const lo = Math.round(low ?? mid * 0.9);
  const hi = Math.min(100, Math.round(high ?? mid * 1.1));
  if (Math.abs(lo - hi) <= 1) return `${Math.round(mid)}%`;
  return `~${lo}–${hi}%`;
}

function formatHoldHours(h) {
  if (h == null || h === "∞" || !Number.isFinite(h)) return "—";
  const n = Number(h);
  if (n >= 11 && n <= 19) return `~${Math.round(n)} hr (often 12–18 hr band)`;
  return `~${n.toFixed(1)} hr`;
}

function formatHoldHoursRange(data) {
  const h = typeof data === "number" ? data : data?.holdHours;
  if (h == null || h === "∞" || !Number.isFinite(h)) return formatHoldHours(h);
  const lo = data?.holdHoursLow ?? h * 0.85;
  const hi = data?.holdHoursHigh ?? h * 1.2;
  const loR = Math.round(lo * 10) / 10;
  const hiR = Math.round(hi * 10) / 10;
  if (Math.abs(loR - hiR) < 0.8) return formatHoldHours(h);
  return `~${loR}–${hiR} hr`;
}

/** Cool-in + steady hold — matches “~18 hr in the hot box” teaching (not steady phase alone). */
function formatTotalBoxHoursRange(data) {
  const hold = data?.holdHours;
  if (hold == null || hold === "∞" || !Number.isFinite(hold)) return formatHoldHours(null);
  const cool = data?.cooldownHours ?? 0;
  const total = cool + hold;
  const lo = cool + (data?.holdHoursLow ?? hold * 0.85);
  const hi = cool + (data?.holdHoursHigh ?? hold * 1.2);
  const loR = Math.round(lo * 10) / 10;
  const hiR = Math.round(hi * 10) / 10;
  if (Math.abs(loR - hiR) < 0.8) return formatHoldHours(total);
  return `~${loR}–${hiR} hr`;
}

function isJuicyLongHoldPair(pull, hold) {
  const c = state.constants || {};
  const pullRef = c.pullLongHoldC ?? 90.5;
  const holdRef = c.holdLongC ?? 65.5;
  return Math.abs(pull - pullRef) < 1.5 && Math.abs(hold - holdRef) < 1.5;
}

function capCarryForTeachingPlan(pull, hold, renderedAtPull, carryAdded, target, holdRate, cooldownHours) {
  if (!isJuicyLongHoldPair(pull, hold)) return carryAdded;
  const c = state.constants || {};
  const typicalBox = c.holdLongHoursTypical ?? 18;
  if (holdRate <= 0 || cooldownHours <= 0) return carryAdded;
  const remainingFromPull = Math.max(0, target - renderedAtPull);
  const steadyBudget = Math.max(0, typicalBox - cooldownHours);
  const maxCarry = Math.max(0, remainingFromPull - steadyBudget * holdRate);
  return Math.min(carryAdded, maxCarry);
}

/** Common cambro / holding-oven temps for the Plan hold-options table. */
const HOLD_OPTION_PRESETS = [
  { holdC: 65.5, tag: "Classic cambro" },
  { holdC: 71, tag: "Warmer hold" },
  { holdC: 76.5, tag: "Hot hold" },
  { holdC: 60, tag: "Low & slow" },
];

const SMOKE_HOURS_ESTIMATE = 11;

function computeServeIfPulledNow(holdData) {
  const boxH =
    (holdData.cooldownHours ?? 0) +
    (typeof holdData.holdHours === "number" && Number.isFinite(holdData.holdHours)
      ? holdData.holdHours
      : 0);
  if (boxH <= 0) return null;
  return new Date(Date.now() + boxH * 3600000);
}

function isHoldOptionSelected(holdC) {
  const { hold } = getPullHoldC();
  return Math.abs(hold - holdC) < 0.6;
}

function selectHoldOption(holdC) {
  setTempInputFromC($("holdTemp"), holdC);
  syncActiveProfileUI();
  if (!IS_PUBLIC_SIMPLE) {
    updateHold();
    updatePlanSummaryDebounced();
  } else {
    renderHoldOptionsTable();
  }
  saveCookPrefsDebounced();
}

async function buildHoldOptionRows(pullC, target) {
  const margin = carryConstants().endMarginC ?? 0.5;
  const presets = HOLD_OPTION_PRESETS.filter((p) => p.holdC < pullC - margin);
  const plans = await Promise.all(
    presets.map(async (preset) => {
      const data = await fetchHoldPlan(pullC, preset.holdC, target);
      return { preset, data };
    })
  );
  return plans.map(({ preset, data }) => {
    const schedule = computePitStartSchedule(data);
    const readyIfNow = computeServeIfPulledNow(data);
    const boxLabel = formatTotalBoxHoursRange(data);
    const steadyLabel = formatHoldHoursRange(data);
    return {
      preset,
      data,
      schedule,
      readyIfNow,
      boxLabel,
      steadyLabel,
      selected: isHoldOptionSelected(preset.holdC),
    };
  });
}

async function renderHoldOptionsTable() {
  const body = $("holdOptionsBody");
  const pullLabel = $("holdOptionsPull");
  if (!body) return;

  const gen = ++holdOptionsRenderGen;
  const { pull } = getPullHoldC();
  const target = parseFloat($("targetPercent")?.value) || 100;
  if (pullLabel) pullLabel.innerHTML = tempHtml(pull);

  body.innerHTML = `<p class="placeholder">Calculating hold options…</p>`;

  const rows = await buildHoldOptionRows(pull, target);
  if (gen !== holdOptionsRenderGen) return;
  if (!rows.length) {
    body.innerHTML = `<p class="hint">Hold options need pull hotter than hold — raise probe temp or lower hold.</p>`;
    return;
  }

  const sliceSet = !!resolveSliceDateTime(getTargetSliceTimeStr());
  const pitHint = $("pitStartHint");
  if (pitHint) {
    pitHint.textContent = sliceSet
      ? "Slice time set — pit & serve columns on."
      : "Optional. Ready-after-pull only.";
  }

  const thead = sliceSet
    ? `<tr><th scope="col">Hold</th><th scope="col">Hot box</th><th scope="col">Put on pit</th><th scope="col">Serve</th><th scope="col"></th></tr>`
    : `<tr><th scope="col">Hold</th><th scope="col">Hot box</th><th scope="col">Ready about</th><th scope="col"></th></tr>`;

  const tbody = rows
    .map((row) => {
      const holdCell = `<span class="hold-option-temp">${tempHtml(row.preset.holdC)}</span><span class="hold-option-tag">${row.preset.tag}</span>`;
      const boxCell = `<strong>${row.boxLabel}</strong><span class="hold-option-sub">${row.steadyLabel} steady after cool-in</span>`;
      let timeCells = "";
      if (sliceSet && row.schedule) {
        timeCells = `<td><strong>${clockTimeHtml(row.schedule.start)}</strong><span class="hold-option-sub">≈${row.schedule.totalH.toFixed(0)} hr total</span></td>
          <td><strong>${clockTimeHtml(row.schedule.slice)}</strong></td>`;
      } else if (row.readyIfNow) {
        timeCells = `<td><strong>${clockTimeHtml(row.readyIfNow)}</strong><span class="hold-option-sub">after pull into box</span></td>`;
      } else {
        timeCells = sliceSet ? `<td>—</td><td>—</td>` : `<td>—</td>`;
      }
      const btnClass = row.selected ? "btn-ghost hold-option-btn hold-option-btn-active" : "btn-ghost hold-option-btn";
      const btnLabel = row.selected ? "Selected" : "Apply";
      return `<tr class="hold-option-row${row.selected ? " hold-option-row-active" : ""}" data-hold-c="${row.preset.holdC}">
        <td>${holdCell}</td>
        <td>${boxCell}</td>
        ${timeCells}
        <td class="hold-option-action"><button type="button" class="${btnClass}" data-hold-pick="${row.preset.holdC}">${btnLabel}</button></td>
      </tr>`;
    })
    .join("");

  body.innerHTML = `
    <div class="hold-options-table-wrap">
      <table class="hold-options-table">
        <thead>${thead}</thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
    <p class="hint hold-options-foot">${
      IS_PUBLIC_SIMPLE
        ? "Pick a row, then <strong>Apply</strong>."
        : "Pick a row, then <strong>Apply</strong> — probe + feel still win."
    }</p>
  `;

  body.querySelectorAll("[data-hold-pick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const c = parseFloat(btn.dataset.holdPick);
      if (Number.isFinite(c)) selectHoldOption(c);
    });
  });
}

let holdOptionsRenderGen = 0;
const renderHoldOptionsDebounced = debounce(() => renderHoldOptionsTable(), 200);

/**
 * Next device-local moment at HH:MM: today if that clock is still ahead, otherwise tomorrow
 * (so a “passed” time rolls forward instead of planning for earlier today).
 */
function resolveSliceDateTime(timeStr) {
  if (!timeStr) return null;
  const [hh, mm] = timeStr.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  const now = new Date();
  if (d.getTime() <= now.getTime()) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function isSameLocalCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Compact "2h 30m" from a positive minute count. */
function formatDurationHrsMins(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function updateSliceTimeUntilHint() {
  const el = $("planSliceUntil");
  if (!el) return;
  const slice = resolveSliceDateTime(getTargetSliceTimeStr());
  if (!slice) {
    el.textContent = "";
    el.removeAttribute("title");
    el.classList.remove("plan-slice-until--past");
    return;
  }
  const now = new Date();
  const diffMin = Math.round((slice.getTime() - now.getTime()) / 60000);
  el.classList.toggle("plan-slice-until--past", diffMin < 0);
  if (diffMin < 0) {
    el.textContent = "Slice time in a moment";
    el.title = "";
    return;
  }
  if (diffMin === 0) {
    el.textContent = "Slice time is now";
    el.title = "";
    return;
  }
  el.textContent = `Slice in ~${formatDurationHrsMins(diffMin)}`;
  const dayWord = isSameLocalCalendarDay(slice, now) ? "later today" : "tomorrow";
  el.title = `Slice target ${clockTimeText(slice)} (${dayWord}, device clock).`;
}

function timeStrTo24hFrom12(hour12, minute, ampm) {
  let hh = parseInt(hour12, 10);
  const mm = parseInt(minute, 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return "";
  if (ampm === "PM" && hh !== 12) hh += 12;
  if (ampm === "AM" && hh === 12) hh = 0;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function parse24hTo12Parts(timeStr) {
  const [hh, mm] = timeStr.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  const ampm = hh >= 12 ? "PM" : "AM";
  let hour12 = hh % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12: String(hour12), minute: String(mm).padStart(2, "0"), ampm };
}

/** Parse typed slice time (e.g. 5:30, 17.30, 1730) for 12- or 24-hr mode. */
function parseSliceTimeText(raw, mode) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let hour;
  let minute;
  const colon = s.match(/^(\d{1,2})\s*[:.]\s*(\d{1,2})$/);
  if (colon) {
    hour = parseInt(colon[1], 10);
    minute = parseInt(colon[2], 10);
  } else {
    const digits = s.replace(/\D/g, "");
    if (digits.length === 4) {
      hour = parseInt(digits.slice(0, 2), 10);
      minute = parseInt(digits.slice(2), 10);
    } else if (digits.length === 3) {
      hour = parseInt(digits.slice(0, 1), 10);
      minute = parseInt(digits.slice(1), 10);
    } else {
      return null;
    }
  }
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute > 59) return null;
  if (mode === "12") {
    if (hour < 1 || hour > 12) return null;
    return { hour12: hour, minute };
  }
  if (hour < 0 || hour > 23) return null;
  return { hour24: hour, minute };
}

function formatSliceTime12Display(hour12, minute) {
  return `${hour12}:${String(minute).padStart(2, "0")}`;
}

/**
 * While typing in the 12-hr slice box, insert ":" like a clock field (digits-only
 * entry). Matches parseSliceTimeText: 3 digits → H:MM, 4 → HH:MM; 10–12 stay
 * two-digit hour until a third digit (use "12:30" or "1230" for twelve-thirty).
 */
function formatSliceTime12TypingDisplay(raw) {
  const s = String(raw ?? "");
  const sepAt = s.search(/[:.]/);
  if (sepAt !== -1) {
    const h = s.slice(0, sepAt).replace(/\D/g, "").slice(0, 2);
    const m = s.slice(sepAt + 1).replace(/\D/g, "").slice(0, 2);
    if (!h) return "";
    return m.length ? `${h}:${m}` : `${h}:`;
  }
  const digits = s.replace(/\D/g, "").slice(0, 4);
  const n = digits.length;
  if (n === 0) return "";
  if (n === 1) return digits;
  if (n === 2) {
    const nn = parseInt(digits, 10);
    const a = parseInt(digits[0], 10);
    const b = parseInt(digits[1], 10);
    if (nn >= 10 && nn <= 12) return digits;
    if (a >= 1 && a <= 9 && b <= 5) return `${a}:${b}`;
    return digits;
  }
  if (n === 3) return `${digits[0]}:${digits.slice(1)}`;
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
}

function applySliceTime12AutoFormat(el) {
  if (!el || state.clockInputUnit !== "12") return;
  const oldVal = el.value;
  const newVal = formatSliceTime12TypingDisplay(oldVal);
  if (newVal === oldVal) return;
  const start = el.selectionStart ?? oldVal.length;
  const before = oldVal.slice(0, start);
  const digitCursor = before.replace(/\D/g, "").length;
  el.value = newVal;
  let newPos = 0;
  if (digitCursor > 0) {
    let d = 0;
    for (let i = 0; i < newVal.length; i++) {
      if (/\d/.test(newVal[i])) d++;
      if (d >= digitCursor) {
        newPos = i + 1;
        break;
      }
    }
    if (d < digitCursor) newPos = newVal.length;
  }
  el.setSelectionRange(newPos, newPos);
}

function formatSliceTime24Display(hour24, minute) {
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function syncSliceTimeFromInputs() {
  const hidden = $("targetSliceTime");
  if (!hidden) return;
  if (state.clockInputUnit === "12") {
    const parsed = parseSliceTimeText($("sliceTime12Text")?.value, "12");
    if (!parsed) {
      hidden.value = "";
      return;
    }
    hidden.value = timeStrTo24hFrom12(parsed.hour12, parsed.minute, state.sliceAmPm);
    return;
  }
  const parsed = parseSliceTimeText($("sliceTime24Text")?.value, "24");
  if (!parsed) {
    hidden.value = "";
    return;
  }
  hidden.value = formatSliceTime24Display(parsed.hour24, parsed.minute);
}

function getTargetSliceTimeStr() {
  syncSliceTimeFromInputs();
  return $("targetSliceTime")?.value ?? "";
}

function updateSliceAmPmUI() {
  document.querySelectorAll("[data-slice-ampm]").forEach((btn) => {
    const on = btn.dataset.sliceAmpm === state.sliceAmPm;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on);
  });
}

function clearSliceTimeInputs() {
  const t12 = $("sliceTime12Text");
  const t24 = $("sliceTime24Text");
  if (t12) t12.value = "";
  if (t24) t24.value = "";
}

function syncVisibleSliceInputsFromHidden() {
  const v = $("targetSliceTime")?.value;
  const t12 = $("sliceTime12Text");
  const t24 = $("sliceTime24Text");
  if (!v) {
    clearSliceTimeInputs();
    return;
  }
  const [hh, mm] = v.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return;

  if (state.clockInputUnit === "12") {
    const parts = parse24hTo12Parts(v);
    if (!parts || !t12) return;
    t12.value = formatSliceTime12Display(parts.hour12, parts.minute);
    state.sliceAmPm = parts.ampm;
    updateSliceAmPmUI();
    return;
  }

  if (t24) t24.value = formatSliceTime24Display(hh, mm);
}

function applySliceClockInputUI() {
  const is12 = state.clockInputUnit === "12";
  $("sliceTime12Wrap")?.classList.toggle("hidden", !is12);
  $("sliceTime24Wrap")?.classList.toggle("hidden", is12);
  document.querySelectorAll("[data-clock-input]").forEach((btn) => {
    const on = btn.dataset.clockInput === state.clockInputUnit;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on);
  });
  const row = $("sliceTimeControlsRow");
  if (row) {
    row.classList.toggle("slice-time-controls--12", is12);
    row.classList.toggle("slice-time-controls--24", !is12);
  }
  const ampm = document.querySelector(".slice-time-ampm-slot .slice-ampm-toggle");
  if (ampm) {
    if (is12) ampm.removeAttribute("aria-hidden");
    else ampm.setAttribute("aria-hidden", "true");
  }
  const hint = $("planSliceOptionalLead");
  if (hint) {
    hint.innerHTML = is12
      ? "<strong>12-hr:</strong> time on the left · <strong>AM/PM</strong> in the middle."
      : "<strong>24-hr:</strong> type <strong>17:30</strong> (00–23) in the left box.";
  }
  syncVisibleSliceInputsFromHidden();
  updateSliceTimeUntilHint();
}

function initSliceTimeInput() {
  const planRefresh = () => {
    syncSliceTimeFromInputs();
    updateSliceTimeUntilHint();
    renderHoldOptionsDebounced();
    if (!IS_PUBLIC_SIMPLE) updatePlanSummaryDebounced();
    saveCookPrefsDebounced();
  };

  document.querySelectorAll("[data-clock-input]").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncSliceTimeFromInputs();
      state.clockInputUnit = state.clockInputUnit === "12" ? "24" : "12";
      saveUnitPrefs();
      applySliceClockInputUI();
      planRefresh();
    });
  });

  document.querySelectorAll("[data-slice-ampm]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.sliceAmPm = state.sliceAmPm === "AM" ? "PM" : "AM";
      updateSliceAmPmUI();
      planRefresh();
    });
  });

  ["sliceTime12Text", "sliceTime24Text"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("input", () => {
      if (id === "sliceTime12Text") applySliceTime12AutoFormat(el);
      planRefresh();
    });
    el.addEventListener("change", planRefresh);
    el.addEventListener("blur", () => {
      syncSliceTimeFromInputs();
      syncVisibleSliceInputsFromHidden();
      planRefresh();
    });
  });

  applySliceClockInputUI();
  if (!IS_PUBLIC_SIMPLE) window.setInterval(updateSliceTimeUntilHint, 60_000);
}

function formatClock24(d) {
  const hh = d.getHours();
  const mm = d.getMinutes();
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function formatClock12(d) {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

/** 12-hr AM/PM first, 24-hr beside it (plain text). */
function clockTimeText(d) {
  return `${formatClock12(d)} (${formatClock24(d)})`;
}

function clockTimeHtml(d) {
  return `<span class="clock-pair"><span class="clock-pair-val">${formatClock12(d)}</span><span class="clock-pair-alt">${formatClock24(d)}</span></span>`;
}

function formatClockTime(d) {
  return clockTimeText(d);
}

function computePitStartSchedule(holdData) {
  const slice = resolveSliceDateTime(getTargetSliceTimeStr());
  if (!slice) return null;
  const smokeH = SMOKE_HOURS_ESTIMATE;
  const cooldown = holdData.cooldownHours ?? 4;
  const holdH =
    typeof holdData.holdHours === "number" && Number.isFinite(holdData.holdHours)
      ? holdData.holdHours
      : 15;
  const totalH = smokeH + cooldown + holdH;
  const start = new Date(slice.getTime() - totalH * 3600000);
  return { slice, start, smokeH, cooldown, holdH, totalH };
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
    if (u.temp === "c" || u.temp === "f") state.tempUnit = u.temp;
    if (u.clock === "12" || u.clock === "24") state.clockInputUnit = u.clock;
    if (u.sliceAmPm === "AM" || u.sliceAmPm === "PM") state.sliceAmPm = u.sliceAmPm;
  } catch {
    /* ignore */
  }
}

function collectCookState() {
  const loss = parseFloat($("lossPercent")?.value);
  const target = parseFloat($("targetPercent")?.value);
  return {
    weight: state.weightUnit,
    temp: state.tempUnit,
    clock: state.clockInputUnit,
    sliceAmPm: state.sliceAmPm,
    pull:
      hasSimplePullDual() || (IS_PUBLIC_SIMPLE && $("simplePull"))
        ? readCommittedPullC(90.5)
        : tempInputValueC($("pullTemp")),
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
  if (s.temp === "c") p.set("temp", "c");
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
  const t = p.get("temp");
  if (t === "c" || t === "f") data.temp = t;
  if (Number.isFinite(pull) && pull >= 55 && pull <= 99) data.pull = pull;
  if (Number.isFinite(hold) && hold >= 57 && hold <= 90) data.hold = hold;
  if (Number.isFinite(probe) && probe >= 55 && probe <= 99) data.probe = probe;
  if (Number.isFinite(kg) && kg > 0 && kg < 50) data.kg = kg;
  if (Number.isFinite(loss) && loss >= 0 && loss <= 50) data.loss = loss;
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
    if (data.temp === "c" || data.temp === "f") state.tempUnit = data.temp;
    if (data.clock === "12" || data.clock === "24") state.clockInputUnit = data.clock;
    if (data.sliceAmPm === "AM" || data.sliceAmPm === "PM") state.sliceAmPm = data.sliceAmPm;

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

    if (data.tab) goToTab(IS_PUBLIC_SIMPLE ? "plan" : data.tab);
    applyUnitPrefs();
    applySliceClockInputUI();
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
  const planRefresh = () => {
    renderHoldOptionsDebounced();
    if (!IS_PUBLIC_SIMPLE) updatePlanSummaryDebounced();
  };
  ["pullTemp", "holdTemp", "targetPercent", "lossPercent", "grade", "startWeight"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    const onPull = () => {
      if (id === "pullTemp") updateUnitTempAlt();
    };
    el.addEventListener("input", () => {
      save();
      planRefresh();
      onPull();
    });
    el.addEventListener("change", () => {
      save();
      planRefresh();
      onPull();
    });
  });
  $("tempSlider")?.addEventListener("input", save);
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

function hasSimplePullDual() {
  return IS_PUBLIC_SIMPLE && !!($("simplePullF") && $("simplePullC"));
}

function simplePullFields() {
  return { f: $("simplePullF"), c: $("simplePullC") };
}

let simplePullEditUnit = "f";
let simplePullSyncLock = false;

/** Last committed pull °C (simple planner uses dataset — not the visible box while out of range). */
function readCommittedPullC(defaultC = 90.5) {
  const pullHidden = $("pullTemp");
  const { f, c } = simplePullFields();
  const fromHidden = parseFloat(pullHidden?.dataset.c);
  if (Number.isFinite(fromHidden)) return fromHidden;
  const fromDual = parseFloat(f?.dataset.c);
  if (Number.isFinite(fromDual)) return fromDual;
  const fromDualC = parseFloat(c?.dataset.c);
  if (Number.isFinite(fromDualC)) return fromDualC;
  const simple = $("simplePull");
  const fromSimple = parseFloat(simple?.dataset.c);
  if (Number.isFinite(fromSimple)) return fromSimple;
  return defaultC;
}

/** Live pull box(es) → °C for badge and outline (includes out-of-range typing). */
function readSimplePullDisplayC(defaultC = 90.5) {
  const { f, c } = simplePullFields();
  if (f && c) {
    const focused = document.activeElement;
    let unit = simplePullEditUnit;
    if (focused === f) unit = "f";
    else if (focused === c) unit = "c";
    const input = unit === "c" ? c : f;
    const trimmed = String(input.value).trim();
    if (!trimmed || trimmed === ".") return readCommittedPullC(defaultC);
    const n = parseFloat(input.value);
    if (!Number.isFinite(n)) return readCommittedPullC(defaultC);
    return unit === "f" ? fToC(n) : n;
  }
  const input = $("simplePull");
  if (!input || !IS_PUBLIC_SIMPLE) return readCommittedPullC(defaultC);
  const trimmed = String(input.value).trim();
  if (!trimmed || trimmed === ".") return readCommittedPullC(defaultC);
  const n = parseFloat(input.value);
  if (!Number.isFinite(n)) return readCommittedPullC(defaultC);
  return state.tempUnit === "f" ? fToC(n) : n;
}

function syncSimplePullDualFrom(unit) {
  const { f, c } = simplePullFields();
  if (!f || !c || simplePullSyncLock) return;
  simplePullSyncLock = true;
  try {
    if (unit === "f") {
      const trimmed = String(f.value).trim();
      if (!trimmed || trimmed === ".") {
        c.value = "";
        return;
      }
      const n = parseFloat(f.value);
      if (Number.isFinite(n)) c.value = Number(fToC(n)).toFixed(1);
    } else {
      const trimmed = String(c.value).trim();
      if (!trimmed || trimmed === ".") {
        f.value = "";
        return;
      }
      const n = parseFloat(c.value);
      if (Number.isFinite(n)) f.value = String(Math.round(cToF(n)));
    }
  } finally {
    simplePullSyncLock = false;
  }
}

/** Read °C from a temp field. Uses stored dataset.c unless the user is actively typing. */
function tempInputValueC(inputEl, defaultC = 90.5) {
  if (!inputEl) return defaultC;
  if (
    IS_PUBLIC_SIMPLE &&
    (inputEl.id === "simplePull" || inputEl.id === "simplePullF" || inputEl.id === "simplePullC")
  ) {
    return readCommittedPullC(defaultC);
  }
  const stored = parseFloat(inputEl.dataset.c);
  const n = parseFloat(inputEl.value);
  const editing = document.activeElement === inputEl;
  if (editing && Number.isFinite(n)) {
    const c = state.tempUnit === "f" ? fToC(n) : n;
    inputEl.dataset.c = String(c);
    return c;
  }
  if (Number.isFinite(stored)) return stored;
  if (Number.isFinite(n)) {
    const c = state.tempUnit === "f" ? fToC(n) : n;
    inputEl.dataset.c = String(c);
    return c;
  }
  return defaultC;
}

function setTempInputFromC(inputEl, c) {
  if (!inputEl) return;
  inputEl.dataset.c = String(c);
  /* Hidden pullTemp is type=number max=99 — assigning 430 would clamp the control to 99. */
  if (inputEl.id === "pullTemp" && IS_PUBLIC_SIMPLE) {
    return;
  }
  if (state.tempUnit === "f") {
    inputEl.value = String(Math.round(cToF(c)));
    inputEl.step = "1";
    inputEl.min = String(Math.round(cToF(55)));
    inputEl.max = String(Math.round(cToF(99)));
  } else {
    inputEl.value = Number(c).toFixed(1);
    inputEl.step = "0.5";
    inputEl.min = "55";
    inputEl.max = "99";
  }
}

function syncFieldUnits() {
  const alt = state.tempUnit === "f" ? "°C in results" : "°F in results";
  document.querySelectorAll(".field-temp-unit").forEach((el) => {
    if (state.tempUnit === "f") {
      el.innerHTML = `°F <span class="temp-f-inline">(${alt})</span>`;
    } else {
      el.innerHTML = `°C <span class="temp-f-inline">(${alt})</span>`;
    }
  });
}

function formatTempPrimary(c) {
  return state.tempUnit === "f" ? `${cToF(c).toFixed(0)} °F` : `${Number(c).toFixed(1)} °C`;
}

function formatTempSecondary(c) {
  return state.tempUnit === "f" ? `${Number(c).toFixed(1)} °C` : `${cToF(c).toFixed(0)} °F`;
}

/** Primary unit from toggle; secondary shown smaller */
function tempHtml(c, { big = false } = {}) {
  const primary = formatTempPrimary(c);
  const secondary = formatTempSecondary(c);

  if (big) {
    return `<span class="temp-hero-val">${primary}</span><span class="temp-hero-divider" aria-hidden="true"></span><span class="temp-hero-val temp-hero-secondary">${secondary}</span>`;
  }

  return `<span class="temp-pair"><span class="temp-pair-val">${primary}</span><span class="temp-pair-alt">${secondary}</span></span>`;
}

function tempText(c) {
  return `${formatTempPrimary(c)} (${formatTempSecondary(c)})`;
}

function stallRangeText() {
  if (state.tempUnit === "f") return "150–165 °F internal (65.5–74 °C)";
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
      state.tempUnit === "f"
        ? "Drag the dot on the arc to your flat probe temp. ~40% at 195 °F / 90.5 °C before a long hot hold is normal."
        : "Drag the dot on the arc to your flat probe temp. ~40% at 90.5 °C / 195 °F before a long hot hold is normal.";
  }
  const stallBtn = $("stallPresetBtn");
  if (stallBtn) {
    stallBtn.textContent =
      state.tempUnit === "f" ? "Stall rescue (~170 °F / 76.5 °C)" : "Stall rescue (~76.5 °C / 170 °F)";
  }
}

async function refreshAllForUnits({ weight = false, temp = false } = {}) {
  if (temp && !IS_PUBLIC_SIMPLE) {
    updatePlanSummaryDebounced();
    updateHold();
    updateRenderingDebounced();
  }
  if (weight) {
    await updateYield();
    if (!IS_PUBLIC_SIMPLE) updatePlanSummaryDebounced();
  }
}

function getReferencePullTempC() {
  if (hasSimplePullDual() || (IS_PUBLIC_SIMPLE && $("simplePull"))) return readSimplePullDisplayC(90.5);
  const pullEl = $("pullTemp");
  if (pullEl) return tempInputValueC(pullEl, getSliderTempC());
  return getSliderTempC();
}

function updateUnitTempAlt() {
  const c = getReferencePullTempC();
  if (!Number.isFinite(c)) return;
  if (hasSimplePullDual()) return;
  const input = $("simplePull");
  document.querySelectorAll(".unit-temp-alt").forEach((el) => {
    if (el.classList.contains("unit-temp-alt--inline") && IS_PUBLIC_SIMPLE && input) {
      const raw = String(input.value).trim();
      const n = parseFloat(raw);
      if (state.tempUnit === "f" && Number.isFinite(n)) {
        el.textContent = `${Math.round(n)} °F ≈ ${Number(c).toFixed(1)} °C`;
      } else if (Number.isFinite(n)) {
        el.textContent = `${raw} °C ≈ ${Math.round(cToF(c))} °F`;
      } else {
        el.textContent =
          state.tempUnit === "f" ? `≈ ${Number(c).toFixed(1)} °C` : `≈ ${Math.round(cToF(c))} °F`;
      }
      return;
    }
    el.textContent =
      state.tempUnit === "f" ? `≈ ${Number(c).toFixed(1)} °C` : `≈ ${Math.round(cToF(c))} °F`;
  });
}

function updateUnitBar() {
  document.querySelectorAll("[data-unit-weight]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.unitWeight === state.weightUnit);
    btn.setAttribute("aria-pressed", btn.dataset.unitWeight === state.weightUnit);
  });
  document.querySelectorAll("[data-unit-temp]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.unitTemp === state.tempUnit);
    btn.setAttribute("aria-pressed", btn.dataset.unitTemp === state.tempUnit);
  });
  const hint = $("unitHint");
  if (hint) {
    if (IS_PUBLIC_SIMPLE) {
      hint.textContent = "";
      hint.hidden = true;
    } else {
      hint.hidden = false;
      const t = state.tempUnit === "f" ? "°F" : "°C";
      const w = state.weightUnit;
      hint.textContent = `Temps in ${t} first · weight in ${w}`;
    }
  }
}

function applyUnitPrefs() {
  updateUnitBar();
  configureWeightInput();
  syncFieldUnits();
  syncProbeSliderUnits();
  syncLabels();
  syncSimplePullFromModel();
  syncSimplePullChrome();
  updatePullTempReminder();
  updatePullTempBadge();
  updateUnitTempAlt();
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
  document.querySelectorAll("[data-unit-temp]").forEach((btn) => {
    btn.addEventListener("click", () => {
      let next = btn.dataset.unitTemp;
      if (next !== "f" && next !== "c") return;
      /* Re-click active segment flips (same idea as AM/PM and 12-hr / 24-hr). */
      if (next === state.tempUnit) {
        next = next === "f" ? "c" : "f";
      }
      if (hasSimplePullDual()) {
        state.tempUnit = next;
      } else {
        const input = $("simplePull");
        if (input && IS_PUBLIC_SIMPLE) {
          const c = readSimplePullDisplayC(90.5);
          state.tempUnit = next;
          if (Number.isFinite(c)) {
            input.value = next === "f" ? String(Math.round(cToF(c))) : Number(c).toFixed(1);
          }
        } else {
          state.tempUnit = next;
        }
      }
      saveUnitPrefs();
      applyUnitPrefs();
      void renderHoldOptionsTable();
      void refreshAllForUnits({ temp: true });
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

const COOK_PANEL_IDS = new Set(["dashboard", "hold", "plan"]);

function mainTabForPanel(panelId) {
  if (panelId === "sources") return "sources";
  if (COOK_PANEL_IDS.has(panelId)) return panelId;
  if (panelId === "learn") return "learn";
  return "learn";
}

function syncHoldTempSummary() {
  const el = $("holdTempSummary");
  if (!el) return;
  const { pull, hold } = getPullHoldC();
  const target = parseFloat($("targetPercent")?.value) || 100;
  el.innerHTML = `Using <strong>${tempHtml(pull)}</strong> pull · <strong>${tempHtml(hold)}</strong> hold · <strong>${target}%</strong> goal — <button type="button" class="ref-link ref-link-inline" id="openHoldCustomBtn">edit temps</button>`;
}

function initHoldTempSummary() {
  $("holdTempSummary")?.addEventListener("click", (e) => {
    if (!e.target.closest("#openHoldCustomBtn")) return;
    e.preventDefault();
    const custom = $("holdCustomExpand");
    if (custom) {
      custom.open = true;
      custom.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });
}

function getPullTempGuide(pullC) {
  const pct = Math.round(estimateRenderedAtPull(pullC));
  if (pullC < 60) {
    return {
      label: "Unsafe",
      hint: "Below ~140 °F / 60 °C — not safe to eat; keep cooking.",
      cls: "danger",
    };
  }
  if (pullC < 71) {
    return {
      label: "Underdone",
      hint: `Below the usual pull band (~90–95 °C / 195–203 °F). ~${pct}% modeled render — still tough; needs more pit time.`,
      cls: "warn",
    };
  }
  if (pullC < 82) {
    return {
      label: "Early pull",
      hint: `~${pct}% render — edible after a long hot hold; probe should glide, not fight.`,
      cls: "hold",
    };
  }
  if (pullC < 90) {
    return {
      label: "Almost there",
      hint: `~${pct}% render — plan a long hold (~150 °F / 65 °C box).`,
      cls: "hold",
    };
  }
  if (pullC < 93.3) {
    return {
      label: "Juicy zone",
      hint: `~${pct}% render — classic ~195 °F pull; hot hold finishes the flat.`,
      cls: "ok",
    };
  }
  if (pullC < 96) {
    return {
      label: "Balanced",
      hint: `~${pct}% render — tender sooner; slightly less hold time than 195 °F.`,
      cls: "ok",
    };
  }
  if (pullC < 99) {
    return {
      label: "Hot pull",
      hint: `~${pct}% render — like a “well-done” pull; watch dryness on the flat.`,
      cls: "hold",
    };
  }
  return {
    label: "Overdone risk",
    hint: `~${pct}% render — very tender but flat can dry; probe feel still wins.`,
    cls: "warn",
  };
}

/** One short line under the badge in simple planner (less copy than full guide). */
function getPullTempGuideSimple(pullC) {
  const guide = getPullTempGuide(pullC);
  const pct = Math.round(estimateRenderedAtPull(pullC));
  if (pullC < 60) return { ...guide, hint: "Below safe temp — keep cooking." };
  if (pullC < 71) return { ...guide, hint: `~${pct}% render · still tough` };
  if (pullC < 90) return { ...guide, hint: `~${pct}% render · long hold likely` };
  if (pullC < 99) return { ...guide, hint: `~${pct}% render at pull` };
  return { ...guide, hint: `~${pct}% render · flat may dry` };
}

function updatePullTempBadge() {
  const badge = $("pullTempBadge");
  const labelEl = $("pullTempBadgeLabel");
  const hintEl = $("pullTempBadgeHint");
  if (!badge || !labelEl) return;
  const pull =
    hasSimplePullDual() || (IS_PUBLIC_SIMPLE && $("simplePull"))
      ? readSimplePullDisplayC(90.5)
      : getPullHoldC().pull;
  const guide = IS_PUBLIC_SIMPLE ? getPullTempGuideSimple(pull) : getPullTempGuide(pull);
  labelEl.textContent = guide.label;
  badge.className = `pull-temp-badge pull-temp-badge--${guide.cls}`;
  if (hintEl) hintEl.textContent = guide.hint || "";
  updateSimplePullInputOutline();
}

function updatePullTempReminder() {
  const el = $("pullTempReminder");
  if (!el) return;
  if (IS_PUBLIC_SIMPLE) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  const whyF =
    "Center internal, not a corner reading. Many cooks aim ~195–203 °F before a long hot hold — probe feel still wins.";
  const whyC =
    "Center internal, not a corner reading. Many cooks aim ~90.5–95 °C before a long hot hold — probe feel still wins.";
  if (state.tempUnit === "f") {
    el.innerHTML = `Typical brisket pull: <strong>195–203 °F</strong> <details class="pull-temp-why"><summary class="pull-temp-why-sum">Why?</summary><p class="pull-temp-why-body">${whyF}</p></details>`;
  } else {
    el.innerHTML = `Typical brisket pull: <strong>90.5–95 °C</strong> <details class="pull-temp-why"><summary class="pull-temp-why-sum">Why?</summary><p class="pull-temp-why-body">${whyC}</p></details>`;
  }
}

function updateLocalTimeHint() {
  const now = new Date();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
  const el = $("localTimeHint");
  if (el && !IS_PUBLIC_SIMPLE) {
    el.textContent = `Your local time now: ${clockTimeText(now)} (${tz}) — from your device, not a server.`;
  } else if (el && IS_PUBLIC_SIMPLE) {
    el.textContent = "";
  }
  const sliceEl = $("planSliceLocalTime");
  if (sliceEl && !IS_PUBLIC_SIMPLE) {
    sliceEl.textContent = `Now · ${clockTimeText(now)}`;
    sliceEl.title = `Device clock (${tz}) — same time used when you set slice time.`;
  } else if (sliceEl && IS_PUBLIC_SIMPLE) {
    sliceEl.textContent = "";
  }
  const deviceClock = $("planDeviceClock");
  if (deviceClock) {
    if (IS_PUBLIC_SIMPLE) {
      deviceClock.textContent = `${clockTimeText(now)} · ${tz}`;
      deviceClock.hidden = false;
    } else {
      deviceClock.textContent = "";
      deviceClock.hidden = true;
    }
  }
  updateSliceTimeUntilHint();
}

function syncSimplePullChrome() {
  const { f, c } = simplePullFields();
  if (f && c) return;
  const unitEl = $("simplePullUnit");
  const input = $("simplePull");
  if (!unitEl || !input) return;
  input.maxLength = 4;
  unitEl.textContent = state.tempUnit === "f" ? "°F" : "°C";
}

/** Keep simple pull field to allowed length (195 / 90.5). */
function clampSimplePullInputField(input, unit = state.tempUnit) {
  if (!input) return;
  const maxLen = unit === "f" ? 3 : 4;
  let v = String(input.value).replace(/[^\d.]/g, "");
  const dot = v.indexOf(".");
  if (unit === "f") v = v.replace(/\./g, "");
  else if (dot !== -1) {
    v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, "");
  }
  if (v.length > maxLen) v = v.slice(0, maxLen);
  if (v !== input.value) input.value = v;
}

const SIMPLE_PULL_RANGE = { f: { min: 165, max: 210 }, c: { min: 74, max: 99 } };

function simplePullRangeLabel(unit) {
  const r = SIMPLE_PULL_RANGE[unit];
  return unit === "f" ? `${r.min}–${r.max} °F` : `${r.min}–${r.max} °C`;
}

/** Valid in-range pull for the active display unit; no silent clamp to minimum. */
function parseSimplePullDisplay(n, unit) {
  if (!Number.isFinite(n)) return null;
  const r = SIMPLE_PULL_RANGE[unit];
  if (n < r.min || n > r.max) return { ok: false, typed: n };
  if (unit === "f") {
    const display = Math.round(n);
    return { ok: true, display, c: fToC(display) };
  }
  const display = Math.round(n * 2) / 2;
  return { ok: true, display, c: display };
}

function setSimplePullRangeError(typed, unit) {
  const el = $("pullTempReminder");
  const u = unit || simplePullEditUnit;
  if (el) {
    el.innerHTML = IS_PUBLIC_SIMPLE
      ? `Outside <strong>165–210 °F</strong> / <strong>74–99 °C</strong> — you entered <strong>${typed}</strong>.`
      : `Outside planner range (<strong>${simplePullRangeLabel("f")}</strong> or <strong>${simplePullRangeLabel("c")}</strong>). You entered <strong>${typed}</strong> — try the <strong>195 / 90.5</strong> band.`;
  }
  updateSimplePullInputOutline();
}

function clearSimplePullRangeError() {
  updatePullTempReminder();
  updateSimplePullInputOutline();
}

function applySimplePullOutlineClass(input, unit) {
  if (!input) return;
  input.classList.remove("simple-pull-input--invalid", "simple-pull-input--ok");
  const trimmed = String(input.value).trim();
  if (!trimmed || trimmed === ".") return;
  const parsed = parseSimplePullDisplay(parseFloat(input.value), unit);
  if (!parsed?.ok) {
    input.classList.add("simple-pull-input--invalid");
    return;
  }
  const guide = getPullTempGuide(parsed.c);
  if (guide.cls === "ok") input.classList.add("simple-pull-input--ok");
  else if (guide.cls === "danger" || guide.cls === "warn") input.classList.add("simple-pull-input--invalid");
}

/** Green / red border on pull fields — matches pull guide (Juicy zone, unsafe, etc.). */
function updateSimplePullInputOutline() {
  if (!IS_PUBLIC_SIMPLE) return;
  const { f, c } = simplePullFields();
  if (f && c) {
    applySimplePullOutlineClass(f, "f");
    applySimplePullOutlineClass(c, "c");
    return;
  }
  const input = $("simplePull");
  if (!input) return;
  applySimplePullOutlineClass(input, state.tempUnit);
}

function writeSimplePullCommittedC(c) {
  const pullHidden = $("pullTemp");
  const cStr = String(c);
  if (pullHidden) pullHidden.dataset.c = cStr;
  const { f, c: cEl } = simplePullFields();
  if (f) f.dataset.c = cStr;
  if (cEl) cEl.dataset.c = cStr;
  const legacy = $("simplePull");
  if (legacy) legacy.dataset.c = cStr;
  const slider = $("tempSlider");
  if (slider) {
    slider.value = c.toFixed(1);
    slider.dataset.c = cStr;
  }
}

function syncSimplePullFromModel() {
  const pullHidden = $("pullTemp");
  const { f, c } = simplePullFields();
  const pull = readCommittedPullC(90.5);
  const cStr = String(pull);
  if (f && c) {
    writeSimplePullCommittedC(pull);
    f.value = String(Math.round(cToF(pull)));
    c.value = Number(pull).toFixed(1);
    updateSimplePullInputOutline();
    return;
  }
  const input = $("simplePull");
  if (!input) return;
  input.dataset.c = cStr;
  if (pullHidden) pullHidden.dataset.c = cStr;
  if (state.tempUnit === "f") input.value = String(Math.round(cToF(pull)));
  else input.value = Number(pull).toFixed(1);
  updateUnitTempAlt();
  updateSimplePullInputOutline();
}

function commitSimplePullInput(sourceEl) {
  const { f, c } = simplePullFields();
  if (f && c) {
    const focused = sourceEl || document.activeElement;
    const unit = focused === c ? "c" : focused === f ? "f" : simplePullEditUnit;
    const input = unit === "c" ? c : f;
    clampSimplePullInputField(input, unit);
    clearSimplePullRangeError();
    const trimmed = String(input.value).trim();
    if (trimmed === "" || trimmed === ".") {
      syncSimplePullFromModel();
      return;
    }
    const parsed = parseSimplePullDisplay(parseFloat(input.value), unit);
    if (!parsed) {
      syncSimplePullFromModel();
      return;
    }
    if (!parsed.ok) {
      setSimplePullRangeError(trimmed, unit);
      return;
    }
    writeSimplePullCommittedC(parsed.c);
    f.value = String(Math.round(cToF(parsed.c)));
    c.value = Number(parsed.c).toFixed(1);
    syncActiveProfileUI();
    renderHoldOptionsDebounced();
    updatePullTempBadge();
    if (!IS_PUBLIC_SIMPLE) updatePlanSummaryDebounced();
    else renderHoldOptionsTable();
    saveCookPrefsDebounced();
    updateSimplePullInputOutline();
    return;
  }

  const input = $("simplePull");
  if (!input) return;
  clampSimplePullInputField(input, state.tempUnit);
  clearSimplePullRangeError();
  const trimmed = String(input.value).trim();
  if (trimmed === "" || trimmed === ".") {
    syncSimplePullFromModel();
    return;
  }
  const parsed = parseSimplePullDisplay(parseFloat(input.value), state.tempUnit);
  if (!parsed) {
    syncSimplePullFromModel();
    return;
  }
  if (!parsed.ok) {
    setSimplePullRangeError(trimmed, state.tempUnit);
    return;
  }
  if (state.tempUnit === "f") input.value = String(parsed.display);
  else input.value = Number(parsed.display).toFixed(1);
  writeSimplePullCommittedC(parsed.c);
  syncActiveProfileUI();
  renderHoldOptionsDebounced();
  updatePullTempBadge();
  if (!IS_PUBLIC_SIMPLE) updatePlanSummaryDebounced();
  else renderHoldOptionsTable();
  saveCookPrefsDebounced();
  updateUnitTempAlt();
  updateSimplePullInputOutline();
}

function wireSimplePullDualInput() {
  const { f, c } = simplePullFields();
  if (!f || !c) return false;

  const onInput = (unit) => () => {
    simplePullEditUnit = unit;
    const input = unit === "c" ? c : f;
    clampSimplePullInputField(input, unit);
    clearSimplePullRangeError();
    syncSimplePullDualFrom(unit);
    updatePullTempBadge();
    updateSimplePullInputOutline();
  };

  const onFocus = (unit) => () => {
    simplePullEditUnit = unit;
  };

  const onBlur = (unit) => () => {
    simplePullEditUnit = unit;
    commitSimplePullInput(unit === "c" ? c : f);
  };

  const onEnter = (el) => (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      el.blur();
    }
  };

  f.addEventListener("input", onInput("f"));
  c.addEventListener("input", onInput("c"));
  f.addEventListener("focus", onFocus("f"));
  c.addEventListener("focus", onFocus("c"));
  f.addEventListener("blur", onBlur("f"));
  c.addEventListener("blur", onBlur("c"));
  f.addEventListener("keydown", onEnter(f));
  c.addEventListener("keydown", onEnter(c));
  syncSimplePullFromModel();
  return true;
}

function wireSimplePullInput() {
  if (wireSimplePullDualInput()) return;
  const input = $("simplePull");
  if (!input) return;
  input.addEventListener("input", () => {
    clampSimplePullInputField(input, state.tempUnit);
    clearSimplePullRangeError();
    updatePullTempBadge();
    updateUnitTempAlt();
  });
  input.addEventListener("blur", () => commitSimplePullInput(input));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      input.blur();
    }
  });
  syncSimplePullFromModel();
  syncSimplePullChrome();
}

function initPublicSimpleMode() {
  if (!IS_PUBLIC_SIMPLE) return;
  const tag = document.querySelector(".tagline");
  if (tag) tag.textContent = "Pull temp · hold hours · when to slice";
  wireSimplePullInput();
  updatePullTempReminder();
  updatePullTempBadge();
  updateLocalTimeHint();
  window.setInterval(updateLocalTimeHint, 60_000);
  activatePanel("plan");
}

function shouldLoadHeavyPanels() {
  return !IS_PUBLIC_SIMPLE;
}

function activatePanel(panelId) {
  if (IS_PUBLIC_SIMPLE && panelId !== "plan") return;
  document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
  const panel = document.getElementById(`panel-${panelId}`);
  if (panel) panel.classList.add("active");
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.panel === mainTabForPanel(panelId));
  });
  if (panelId === "plan") {
    updatePlanSummary();
    renderHoldOptionsTable();
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function goToTab(panelId) {
  activatePanel(panelId);
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => activatePanel(tab.dataset.panel));
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
function setGaugeMarkerPosition(percent, { showDecimal = false, renderLow, renderHigh } = {}) {
  const clamped = clampPercent(percent);
  const { x, y } = gaugePoint(clamped);
  const marker = $("gaugeMarker");
  const hit = $("gaugeMarkerHit");
  marker?.setAttribute("cx", x);
  marker?.setAttribute("cy", y);
  hit?.setAttribute("cx", x);
  hit?.setAttribute("cy", y);
  const pctEl = $("gaugePercent");
  if (pctEl) {
    pctEl.textContent = showDecimal
      ? `${clamped.toFixed(1)}%`
      : formatPctRange(clamped, renderLow, renderHigh);
  }
  updateGaugeZone(clamped);
}

function tempFromRenderedPercent(percent) {
  const pct = clampPercent(percent);
  const anchors = PULL_ANCHORS;
  if (pct <= anchors[0][1]) return anchors[0][0];
  if (pct >= anchors[anchors.length - 1][1]) return anchors[anchors.length - 1][0];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [t0, p0] = anchors[i];
    const [t1, p1] = anchors[i + 1];
    if (pct >= p0 && pct <= p1) {
      const span = p1 - p0;
      const t = span > 0 ? (pct - p0) / span : 0;
      return t0 + t * (t1 - t0);
    }
  }
  return anchors[anchors.length - 1][0];
}

function percentFromGaugePoint(clientX, clientY) {
  const svg = document.querySelector(".gauge-wrap .gauge");
  if (!svg) return 0;
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return 0;
  const p = pt.matrixTransform(ctm.inverse());
  const dx = p.x - GAUGE.cx;
  const dy = GAUGE.cy - p.y;
  let angle = Math.atan2(dy, dx);
  angle = Math.max(0, Math.min(Math.PI, angle));
  const along = (Math.PI - angle) / Math.PI;
  return clampPercent(along * 120);
}

function setProbeTempFromPercent(percent) {
  if (state.gaugeMode === "afterHold") return;
  const tempC = tempFromRenderedPercent(percent);
  const slider = $("tempSlider");
  if (slider) {
    slider.dataset.c = String(tempC);
    slider.value = Number(tempC).toFixed(1);
  }
  onTempSliderInput();
}

let gaugeArcDragging = false;

function wireGaugeArcDrag() {
  const wrap = $("gaugeWrap");
  const svg = wrap?.querySelector(".gauge");
  const hitTrack = $("gaugeTrackHit");
  const hitMarker = $("gaugeMarkerHit");
  if (!wrap || !svg) return;

  const startDrag = (e) => {
    if (state.gaugeMode === "afterHold") return;
    gaugeArcDragging = true;
    gaugeDragging = true;
    wrap.setPointerCapture?.(e.pointerId);
    const pct = percentFromGaugePoint(e.clientX, e.clientY);
    setProbeTempFromPercent(pct);
    e.preventDefault();
  };

  const moveDrag = (e) => {
    if (!gaugeArcDragging) return;
    const pct = percentFromGaugePoint(e.clientX, e.clientY);
    setProbeTempFromPercent(pct);
  };

  const endDrag = (e) => {
    if (!gaugeArcDragging) return;
    gaugeArcDragging = false;
    gaugeDragging = false;
    wrap.releasePointerCapture?.(e.pointerId);
    syncGaugeFromTemp(getSliderTempC());
    updateRendering();
  };

  [hitTrack, hitMarker, svg].forEach((el) => {
    el?.addEventListener("pointerdown", startDrag);
  });
  wrap.addEventListener("pointermove", moveDrag);
  wrap.addEventListener("pointerup", endDrag);
  wrap.addEventListener("pointercancel", endDrag);
}

function initQuickStart() {
  const el = document.querySelector(".intro-hero.intro-banner");
  if (!el) return;
  if (!localStorage.getItem("smk_seen_qs")) el.open = true;
  el.addEventListener("toggle", () => {
    if (!el.open) localStorage.setItem("smk_seen_qs", "1");
  });
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
  const opts = { showDecimal };
  if (state.gaugeMode !== "afterHold") {
    const band = renderBand(estimateRenderedAtPull(tempC));
    opts.renderLow = band.low;
    opts.renderHigh = band.high;
  }
  setGaugeMarkerPosition(pct, opts);
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

  buildStageTableOnce();
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

function buildStageTableOnce() {
  const rowHtml = (s) => `<tr data-temp-c="${s.tempC}">
        <td>${s.tempC} <span class="temp-f-cell">(${s.tempF} °F)</span></td>
        <td>${s.tempF}</td>
        <td>${s.multiplier}×</td>
        <td>${s.hoursTo100}</td>
        <td>${s.percentPerHour}%</td>
      </tr>`;
  const preview = $("stageTablePreview")?.querySelector("tbody");
  const full = $("stageTable")?.querySelector("tbody");
  if (preview) preview.innerHTML = state.stages.slice(0, 5).map(rowHtml).join("");
  if (full) full.innerHTML = state.stages.map(rowHtml).join("");
  highlightStageRow(getSliderTempC());
}

function highlightStageRow(tempC) {
  document.querySelectorAll("#stageTablePreview tbody tr, #stageTable tbody tr").forEach((tr) => {
    const rowC = parseFloat(tr.dataset.tempC);
    tr.classList.toggle("highlight", Number.isFinite(rowC) && Math.abs(rowC - tempC) < 0.6);
  });
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

function syncProbeToPullInput() {
  const pull = $("pullTemp");
  if (!pull || !$("tempSlider")) return;
  setTempInputFromC(pull, getSliderTempC());
  syncActiveProfileUI();
  renderHoldOptionsDebounced();
}

function onTempSliderInput() {
  const tempC = getSliderTempC();
  setTempHtml($("tempDisplay"), tempC, { big: true });
  const slider = $("tempSlider");
  if (slider) {
    slider.setAttribute("aria-valuetext", tempText(tempC));
  }
  syncProbeToPullInput();
  syncGaugeFromTemp(tempC, { showDecimal: gaugeDragging || gaugeArcDragging });
  updateRenderingDebounced();
  updateUnitTempAlt();
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
    updateUnitTempAlt();
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
    if (!gaugeDragging && !gaugeArcDragging) setGaugeMarkerPosition(state.afterHoldPercent);
  } else if (!gaugeDragging && !gaugeArcDragging) {
    setGaugeMarkerPosition(data.estimatedRenderedAtPull, {
      renderLow: data.renderLow,
      renderHigh: data.renderHigh,
    });
  }

  const displayPct =
    state.gaugeMode === "afterHold" ? state.afterHoldPercent : data.estimatedRenderedAtPull;
  const ready = readiness(tempC, displayPct);
  const stage = data.stage;
  const pctLabel =
    state.gaugeMode === "afterHold"
      ? formatPctRange(displayPct)
      : formatPctRange(displayPct, data.renderLow, data.renderHigh);

  const compactEl = $("renderStatsCompact");
  if (compactEl) {
    compactEl.innerHTML = `
    <div class="stat"><span class="stat-label">Ready to slice?</span><span class="stat-value ${ready.slice.cls}">${ready.slice.text}</span></div>
    <div class="stat"><span class="stat-label">OK to eat?</span><span class="stat-value ${ready.eat.cls}">${ready.eat.text}</span></div>
  `;
  }

  $("renderStats").innerHTML = `
    <div class="stat"><span class="stat-label">Done inside (model)</span><span class="stat-value">${pctLabel}</span></div>
    <div class="stat"><span class="stat-label">Speed at this temp</span><span class="stat-value">+${stage.percentPerHour}% / hour</span></div>
    <div class="stat stat-span-2"><span class="stat-label">Tip</span><span class="stat-value hold">Low % at a 195&nbsp;°F pull is normal — the hot box finishes the flat.</span></div>
  `;

  const chartNote =
    state.gaugeMode === "afterHold"
      ? `After hold from ${tempHtml(tempC)} → ${formatPctRange(displayPct)} tenderness`
      : `If you pulled at ${tempHtml(tempC)} → ${formatPctRange(data.estimatedRenderedAtPull, data.renderLow, data.renderHigh)} tenderness`;
  $("chartMarker").innerHTML = chartNote;
  highlightStageRow(tempC);

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
  const pull =
    hasSimplePullDual() || (IS_PUBLIC_SIMPLE && $("simplePull"))
      ? readCommittedPullC(90.5)
      : tempInputValueC(pullEl, 90.5);
  const hold = tempInputValueC(holdEl, 65.5);
  return { pull, hold };
}

async function updateHold() {
  const { pull, hold } = getPullHoldC();
  const target = parseFloat($("targetPercent").value) || 100;
  syncHoldTempSummary();

  const data = await fetchHoldPlan(pull, hold, target);

  const holdHrs = data.holdHours ?? "∞";
  const total = data.totalHours != null ? data.totalHours.toFixed(1) : "—";
  const boxHoursLabel = formatTotalBoxHoursRange(data);
  const steadyHoldLabel = formatHoldHoursRange(data);
  const coolH = data.cooldownHours ?? 4;

  state.lastHold = data;
  $("holdResults").innerHTML = `
            <div class="big-number">${boxHoursLabel}</div>
    <p class="hold-answer-lead">in the hot box at ${tempHtml(hold)} until ~${target}% modeled render</p>
    <p class="hint hold-phase-hint">~${coolH} hr cool-in, then ~${steadyHoldLabel} steady at hold temp (planning model).</p>
    <button type="button" class="btn-ghost btn-wide plan-goto-btn">Open cook sheet →</button>
  `;
  $("holdResults").querySelector(".plan-goto-btn")?.addEventListener("click", () => goToTab("plan"));

  const breakdown = $("holdBreakdown");
  if (breakdown) {
    breakdown.innerHTML = `
    <ul class="result-steps result-steps-simple">
      <li><span>When you pull off</span><strong>${formatPctRange(data.renderedAtPull)} done inside</strong></li>
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
    if (id === "pullTemp") updateUnitTempAlt();
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
    updateUnitTempAlt();
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
  const c = state.constants || {};

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
    <div><dt>Typical loss band</dt><dd>${c.weightLossTypicalMin ?? 30}–${c.weightLossTypicalMax ?? 43}% (slider 0–${c.weightLossSliderMax ?? 50}%)</dd></div>
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
  goToTab("hold");
  document.querySelector('.btn-preset[data-pull="90.5"]')?.click();
});

$("openGuide")?.addEventListener("click", () => {
  goToTab("guide");
  document.getElementById("guide-troubleshooting")?.scrollIntoView({ behavior: "smooth" });
});

$("openRecipes")?.addEventListener("click", () => {
  goToTab("recipes");
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
      goToTab(tab);
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

function computeHoldCarryOver(pull, hold, renderedAtPull, target = 100) {
  const { cooldownHours, endMarginC, tauDefault } = carryConstants();
  const endTarget = hold + endMarginC;
  const solvedTau = solveTauForCooldown(pull, hold, cooldownHours, endTarget);
  const tau = Math.max(solvedTau, tauDefault);
  const projection = predictRestClient(pull, hold, cooldownHours, tau, renderedAtPull);
  const integrated = Math.max(0, projection.endRenderedPercent - renderedAtPull);
  let carryAdded = Math.max(integrated, estimateLegacyBandCarry(pull, hold));
  const holdRate = getStageForTemp(hold).percentPerHour;
  carryAdded = capCarryForTeachingPlan(
    pull,
    hold,
    renderedAtPull,
    carryAdded,
    target,
    holdRate,
    cooldownHours
  );
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
    const cool = computeHoldCarryOver(pull, hold, renderedAtPull, target);
    carryOver = cool.carryAdded;
    carrySteps = cool.carrySteps;
    cooldownHours = cool.cooldownHours;
    afterCarry = cool.afterCarryover;
  }
  const remaining = Math.max(0, target - afterCarry);
  const rate = getStageForTemp(hold).percentPerHour;
  const holdHours = rate > 0 ? remaining / rate : null;
  let holdHoursLow = null;
  let holdHoursHigh = null;
  if (holdHours != null && Number.isFinite(holdHours) && holdHours > 0) {
    holdHoursLow = Math.round(holdHours * 0.85 * 10) / 10;
    holdHoursHigh = Math.round(holdHours * 1.2 * 10) / 10;
  }
  return {
    renderedAtPull,
    carryOverAdded: carryOver,
    carrySteps,
    afterCarryover: afterCarry,
    remainingAtHold: remaining,
    holdRatePerHour: rate,
    holdHours,
    holdHoursLow,
    holdHoursHigh,
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
    parts.pitScheduleLine ? `• ${parts.pitScheduleLine}` : "",
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
  if (IS_PUBLIC_SIMPLE) return;

  const sheet = $("planSheet");
  if (!sheet) return;

  void renderHoldOptionsTable();

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
  const pullBand = renderBand(holdData.renderedAtPull ?? estimateRenderedAtPull(pull));
  const holdHrs = holdData.holdHours;
  const holdHoursText = formatTotalBoxHoursRange(holdData);
  const steadyHoldText = formatHoldHoursRange(holdData);
  const ready = readiness(pull, tendernessPull);
  const afterHoldPct = holdData.projectedFinal ?? target;
  const schedule = computePitStartSchedule(holdData);
  const pitStartHint = $("pitStartHint");
  if (pitStartHint) {
    pitStartHint.textContent = schedule
      ? `Rough: put on the pit about ${formatClockTime(schedule.start)} for slice at ${formatClockTime(schedule.slice)} (~${schedule.totalH.toFixed(0)} hr smoke + cool + hold).`
      : "Set a slice time to see when to put the brisket on the pit (rough model).";
  }

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
    `${typeof holdHrs === "number" ? `Hot box ~${formatTotalBoxHoursRange(holdData)} (${steadyHoldText} at temp after cool-in)` : `Hold ${holdMin}–${holdMax} hours`} (check tenderness)`,
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
    pitScheduleLine: schedule
      ? `Put on pit ~${formatClockTime(schedule.start)} for slice ~${formatClockTime(schedule.slice)} (≈${schedule.smokeH} hr smoke + ${schedule.cooldown.toFixed(0)} hr cool + ${schedule.holdH.toFixed(0)} hr hold)`
      : "",
    pullTemp: tempText(pull),
    tendernessPull: formatPctRange(tendernessPull, pullBand.low, pullBand.high),
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
      ${
        schedule
          ? `<p class="plan-schedule"><strong>Put on pit ~${clockTimeHtml(schedule.start)}</strong> for slice ~${clockTimeHtml(schedule.slice)} <span class="hint">(≈${schedule.smokeH} hr smoke + ${schedule.cooldown.toFixed(0)} hr cool + ${schedule.holdH.toFixed(0)} hr hold — planning estimate)</span></p>`
          : ""
      }
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
          ${schedule ? `<li><span>Put on pit (if slicing ${clockTimeText(schedule.slice)})</span><strong>~${clockTimeHtml(schedule.start)}</strong></li>` : ""}
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
          <li><span>Tenderness built</span><strong>${parts.tendernessPull}</strong> (model)</li>
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
          <p class="hint">Numbers come from <strong>Weight</strong> and <strong>Hold</strong> — they update as you change inputs. Render % and hold hours are model estimates; <strong>probe and feel still win</strong>.</p>
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
}

function extractYoutubeId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.slice(1).split("/")[0];
      return id && id.length === 11 ? id : null;
    }
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtube-nocookie.com")) {
      if (u.pathname === "/watch" || u.pathname.startsWith("/watch/")) {
        const id = u.searchParams.get("v");
        return id && id.length === 11 ? id : null;
      }
      if (u.pathname.startsWith("/embed/") || u.pathname.startsWith("/v/")) {
        const id = u.pathname.split("/")[2];
        return id && id.length === 11 ? id : null;
      }
    }
  } catch {
    /* fall through to regex */
  }
  const m = String(url).match(/(?:youtu\.be\/|v=|\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
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
  const grid = $("sourcesGrid");
  const list = $("sourcesList");
  if (!intro || !list) return;

  intro.textContent = data.intro || "";

  const items = data.sources || [];
  const videoCards = [];
  const listItems = [];

  for (const s of items) {
    const url = sourceWatchUrl(s);
    const ytId = extractYoutubeId(s.url);
    if (ytId) {
      videoCards.push({ s, url, ytId });
    } else {
      listItems.push({ s, url });
    }
  }

  if (grid) {
    if (videoCards.length) {
      grid.hidden = false;
      grid.innerHTML = videoCards
        .map(({ s, url, ytId }) => {
          const primary = s.isPrimary
            ? '<span class="source-primary-badge">Primary model source</span>'
            : "";
          return `<a class="source-card${s.isPrimary ? " source-card-primary" : ""}" href="${escapeHtml(url)}" rel="noopener noreferrer" target="_blank">
        <img class="source-thumb" src="https://img.youtube.com/vi/${escapeHtml(ytId)}/mqdefault.jpg" alt="" loading="lazy" width="320" height="180" />
        <span class="source-card-body">
          <strong class="source-title">${escapeHtml(s.title)}</strong>
          ${primary}
          <p class="source-summary">${escapeHtml(s.summary)}</p>
        </span>
      </a>`;
        })
        .join("");
    } else {
      grid.hidden = true;
      grid.innerHTML = "";
    }
  }

  list.hidden = listItems.length === 0;
  list.innerHTML = listItems
    .map(({ s, url }) => {
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
        <a href="${escapeHtml(url)}" class="source-link-btn" rel="noopener noreferrer" target="_blank">${label}</a>
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
  goToTab("sources");
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

function startSmokeLabApp() {
  wireCookStatePersistence();
  initUnits();
  initSliceTimeInput();

  return loadData()
    .then(() => {
      if (shouldLoadHeavyPanels()) {
        initQuickStart();
        wireGaugeArcDrag();
        initRest();
      }
      initPlan();
      initHoldTempSummary();
      if (shouldLoadHeavyPanels()) initExpandSections();
      wireGlobalNav();
      syncHoldTempSummary();
      wireShareLinks();
      $("openSources")?.addEventListener("click", openSourcesPanel);
      $("openCookPlanFromDash")?.addEventListener("click", () => {
        syncProbeToPullInput();
        updateHold();
        goToTab("plan");
      });
      const boot = shouldLoadHeavyPanels()
        ? Promise.all([updateRest(), updatePlanSummary()])
        : Promise.all([renderHoldOptionsTable()]);
      return boot;
    })
    .then(() => {
      if (!shouldLoadHeavyPanels()) return;
      return Promise.allSettled([
        loadScience(),
        loadGuide(),
        loadRecipes(),
        loadRestEnvironments(),
        loadProfiles(),
        loadSources(),
      ]);
    })
    .then(() => {
      applyUnitPrefs();
      applySliceClockInputUI();
      restoreCookStateAfterLoad();
      updateSliceTimeUntilHint();
      if (IS_PUBLIC_SIMPLE) {
        initPublicSimpleMode();
        syncSimplePullFromModel();
      }
      updatePullTempBadge();
      return refreshAllForUnits({ weight: shouldLoadHeavyPanels() });
    });
}

startSmokeLabApp().catch(console.error);
