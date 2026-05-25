# Carry-over model (Smoke Lab)

Verified against the repo (`RestProjectionEngine`, `BrisketEngine`, `app.js`) — not hand-wavy briefing text.

## What “carry-over” means here

While a wrapped brisket cools from **pull temp** toward **hold temp** in a warm cambro (~65.5 °C / 150 °F), collagen keeps rendering. The app adds that extra **% rendered** before it calculates **hold hours** at the hold-box rate (~2 %/hr at 65.5 °C).

This is a **planning model**, not a food-safety or probe substitute. **Probe + feel win** on the day — a lean flat can feel tight even when the model says render is high.

## Hybrid model (server + GitHub Pages)

```text
carryAdded = max(restIntegration, legacyBandSum)
holdHours  = (target - renderedAtPull - carryAdded) / holdStageRate   // steady phase after cool-in
totalHours = CarryCooldownHoursTypical + holdHours   // typically ~4 + ~14 ≈ 18 hr for 195→150

Carry is capped **only for the Juicy pair** (~90.5 °C pull → ~65.5 °C hold) so **remaining work from pull** (~60%) fits the **~18 hr hot-box** teaching band:
`maxCarry = remainingFromPull − (HoldLongHoursTypical − cooldown) × holdRate` (e.g. 60 − 14×2 = 32% at 90.5→65.5).
Hotter pulls use full carry math → shorter total box time.
```

### Layer 1 — Cool-down (Rest tab)

When `holdTempC < pullTempC - CarryEndMarginC` (0.5 °C):

- **Ambient** = `holdTempC` (cambro set to hold).
- **Duration** = `CarryCooldownHoursTypical` = **4 hr** (science copy: ~4 hr from 90.5 → 65.5 °C).
- **τ** = solve so temp reaches `holdTempC + 0.5` at 4 hr, with floor `HoldCarryTauDefault` = **2 hr**:

```text
end     = ambient + (pull - ambient) * exp(-duration / tau)
tau     = -duration / ln((endTarget - ambient) / (pull - ambient))
tau     = max(tau, HoldCarryTauDefault)
```

### Layer 2 — Render rates (full stage ladder)

Each 0.5 hr step uses `GetStageForTemp(averageTemp).PercentPerHour` on [`RenderingStages`](meat calculator/Models/BrisketData.cs) (60 → 99 °C). This is **not** the old 4-row bucket table alone.

### Layer 3 — Legacy floor (teaching bands)

`CarryOverLegacyBands` — 1 hr × rate for each band the pull/hold span crosses:

| Anchor °C | %/hr |
|-----------|------|
| 88 | 18 |
| 82 | 9 |
| 76.5 | 5 |
| 71 | 3 |

Keeps **90.5 → 65.5 °C** at ~**35%** carry (matches the old bucket model). Integrated-only was ~13% for the same pair — too low for hold-hour planning.

### Layer 4 — UI

- **`carrySteps`**: aggregated by rendering stage from integration (Hold tab viz).
- **Science journey bar**: `carryOverAdded` from API / `computeHoldCarryOver`, not hardcoded +36%.

## Old vs new (summary table)

| | Old buckets | Old Pages fallback | Hybrid now |
|---|-------------|-------------------|------------|
| Math | 4 anchors, skip if pull &lt; 88 | Flat **+36%** | Rest integration + legacy `max()` |
| 90.5 → 65.5 carry | 35% | 36% | ~35% |
| 95 → 65.5 carry | 35% (same — bug) | 36% | ~35% carry floor; **~61% already at pull** → much shorter hold |
| `totalHours` | sum(bucket hrs) + hold | 4 + hold (fixed) | `cooldownHours` (4) + hold |

## External review notes (DeepSeek / Gemini)

| Reviewer | Got right | Missed |
|----------|-----------|--------|
| **DeepSeek** | Bucket loop = 35% at 90.5/65.5; no 90.5→88 partial step | Client fallback was +36% in `fetchHoldPlan` (now fixed) |
| **Gemini** | Buckets ignore cooling above 88°C; Pages need offline math | Full-stage 1 hr × rate walk is **not** the shipped hold path; we use Rest integration + legacy floor |

## Legacy bucket snippet (floor only — removed as sole model)

```csharp
// CarryOverLegacyBands — still used inside max(integrated, legacy)
foreach (var (tempC, hours, rate) in bands) {
    if (tempC > pullTempC) continue;
    if (tempC < holdTempC) break;
    sum += hours * rate;
}
// pull 90.5, hold 65.5 → 18+9+5+3 = 35%
```

## Constants (`BrisketData`)

| Constant | Value |
|----------|-------|
| `CarryCooldownHoursTypical` | 4 |
| `CarryEndMarginC` | 0.5 |
| `HoldCarryTauDefault` | 2 |

Exported on `GET /api/data` as `carryCooldownHours`, `carryEndMarginC`, `holdCarryTauDefault`.

### Hold hours planning band

Hold plan responses (and client fallbacks in `formatHoldHoursRange`) include **`holdHoursLow`** and **`holdHoursHigh`**: **0.85×** and **1.20×** the midpoint hold hours, rounded to one decimal. Use them as a cambro-variance band (hotter box vs cooler / larger flat), not separate physics models.

## Code entry points

| Layer | Location |
|-------|----------|
| Server carry | [`RestProjectionEngine.ComputeHoldCooldown`](meat calculator/Services/RestProjectionEngine.cs) |
| Hold plan | [`BrisketEngine.CalculateHoldPlan`](meat calculator/Services/BrisketEngine.cs) |
| Client (Pages) | `computeHoldPlanClient`, `computeHoldCarryOver` in [`app.js`](meat calculator/wwwroot/app.js) |
| Rest tab (manual duration) | Same `predictRestClient` / `RestProjectionEngine.Predict` |

## Calibration

Tune **`CarryCooldownHoursTypical`** first if juicy hold hours leave the ~10–18 hr band. Counter-rest at ~21 °C before cambro: use the **Rest** tab manually (out of scope for hold plan).
