# Smoke Lab (Meat Calculator)

[![Live demo](https://img.shields.io/badge/demo-GitHub%20Pages-ee6c4d)](https://trolle6.github.io/MeatCalculator/)
[![License: MIT](https://img.shields.io/badge/License-MIT-gold.svg)](LICENSE)

**Live app:** [https://trolle6.github.io/MeatCalculator/](https://trolle6.github.io/MeatCalculator/)

Free, **open-source** brisket **pull-and-hold planner**: probe render %, hot-box hours, regional beef grades (US default), weight/shrink, shareable cook links, and a printable cook sheet.

Built with **ASP.NET Core 8** (API + static export) and a vanilla UI in `meat calculator/wwwroot/`.

![Smoke Lab — probe temp and cook plan](meat%20calculator/wwwroot/og-image.png)

## Features

- **Cook flow:** Probe → Hold → Plan (printable cook sheet)
- **Dual °C / °F** temps in sync; **kg / lb** weight
- **Shareable URLs** — copy link with your pull, hold, weight, and preset
- **Regional grades:** USDA (default), UK, Japan (BMS), Australia (MSA)
- **Reference:** science, pit notes, methods, render tables, [video sources](SOURCES.md)

## How to use (3 steps)

1. **Probe** — drag to your flat probe temp; see modeled tenderness at pull.
2. **Hold** — pick Juicy / In between / Hotter (or type pull + hold); get hot-box hours.
3. **Plan** — copy or print the one-page cook sheet for the fridge door.

Set **Weight** (Setup tab) before you print. **Reference** tabs are for reading before or after the cook — not mid-cook checklists.

**Copy link** in the header saves your cook in the URL. The model is for **planning only** — probe and feel on your cooker always win.

### Example shared plan

6 kg USDA Choice, Juicy pull (~90.5 °C), 65.5 °C hold, 35% shrink:

[Open this preset on Smoke Lab](https://trolle6.github.io/MeatCalculator/?pull=90.5&hold=65.5&kg=6&loss=35&profile=juicy&grade=us_choice&tab=plan)

## Open source

- **Repository:** [github.com/trolle6/MeatCalculator](https://github.com/trolle6/MeatCalculator)
- **License:** [MIT](LICENSE) — use, fork, and modify with attribution
- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md)
- **Issues:** [GitHub Issues](https://github.com/trolle6/MeatCalculator/issues)
- **Sources:** [SOURCES.md](SOURCES.md) (Steve Gow / Smoke Trails BBQ teaching — community tool, not affiliated)
- **Carry-over model:** [MODEL_CARRYOVER.md](MODEL_CARRYOVER.md) (hold-plan cool-down math)

## Run locally (full API)

```bash
cd "meat calculator"
dotnet run
```

Open **http://localhost:5180** (or the URL shown in the terminal).

## Live on the web (GitHub Pages)

On each push to `main`, Actions builds the app, exports `/api/*` to JSON, and publishes to the **`gh-pages`** branch.

### One-time Pages setup

1. [Actions settings](https://github.com/trolle6/MeatCalculator/settings/actions) → **Workflow permissions** → **Read and write**
2. [Pages settings](https://github.com/trolle6/MeatCalculator/settings/pages) → branch **`gh-pages`**, folder **`/ (root)`**
3. Re-run **Deploy GitHub Pages** if needed → [https://trolle6.github.io/MeatCalculator/](https://trolle6.github.io/MeatCalculator/)

Sliders, hold/yield math, and rest projection use **browser fallbacks** on Pages; locally you get the full server.

## Repo layout

- `meat calculator.sln` — solution
- `meat calculator/` — web project (`Program.cs`, `Models/`, `Services/`, `wwwroot/`)
- `LICENSE` — MIT
- `SOURCES.md` — research bibliography
- `CONTRIBUTING.md` — how to report bugs and contribute

## Disclaimer

Smoke Lab was built with AI assistance. Pull-and-hold temps and the collagen model are based on public brisket teaching by [Steve Gow (Smoke Trails BBQ)](https://www.youtube.com/@SteveGowSmokeTrailsBBQ) — **not affiliated with or endorsed** by him or the channel.
