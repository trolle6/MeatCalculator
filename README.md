# Smoke Lab (Meat Calculator)

**Live app:** [https://trolle6.github.io/MeatCalculator/](https://trolle6.github.io/MeatCalculator/)

Free brisket **pull-and-hold planner**: probe render %, hot-box hours, weight/shrink, and a printable cook sheet. Built with **ASP.NET Core 8** and a static UI in `meat calculator/wwwroot/`.

![Smoke Lab — probe temp and cook plan](meat%20calculator/wwwroot/og-image.png)

## How to use (3 steps)

1. **Probe** — drag to your flat probe temp; see modeled tenderness at pull.
2. **Hold** — pick Juicy / In between / Hotter (or type pull + hold); get hot-box hours.
3. **Plan** — copy or print the one-page cook sheet for the fridge door.

Set **Weight** (Setup tab) before you print the plan. **Reference** tabs (Why 195?, Notes, Tables, etc.) are for reading before or after the cook — not mid-smoke checklists.

**Copy link** in the header shares your current temps and weight in the URL. The model is for **planning only** — probe and feel on your cooker always win.

### Example shared plan

6 kg USDA Choice, Juicy pull (~90.5 °C), 65.5 °C hold, 35% shrink:

[Open this preset on Smoke Lab](https://trolle6.github.io/MeatCalculator/?pull=90.5&hold=65.5&kg=6&loss=35&profile=juicy&tab=plan)

## Feedback

After sharing in the community, track themes in [FEEDBACK.md](FEEDBACK.md). Report bugs or ideas on [GitHub Issues](https://github.com/trolle6/MeatCalculator/issues).

## Run locally (full API)

```bash
cd "meat calculator"
dotnet run
```

Open **http://localhost:5180** (or the URL shown in the terminal).

## Live on the web (GitHub Pages)

GitHub Pages cannot run ASP.NET. On each push to `main`, Actions builds the app, exports `/api/*` to JSON, and pushes a static site to the **`gh-pages`** branch.

### One-time setup (fixes the default GitHub 404)

1. Open **[Settings → Actions → General](https://github.com/trolle6/MeatCalculator/settings/actions)** → **Workflow permissions** → **Read and write** → Save.
2. Open **[Settings → Pages](https://github.com/trolle6/MeatCalculator/settings/pages)**.
3. **Source:** **Deploy from a branch**.
4. **Branch:** `gh-pages` · **Folder:** `/ (root)` · **Save**.
5. **[Actions](https://github.com/trolle6/MeatCalculator/actions)** → **Deploy GitHub Pages** → **Re-run** if the last run failed.
6. Wait 1–2 minutes → **https://trolle6.github.io/MeatCalculator/**

Sliders, hold/yield math, and rest projection use **browser fallbacks** on Pages; locally you still get the full server.

## Repo layout

- `meat calculator.sln` — solution
- `meat calculator/` — web project (`Program.cs`, `Models/`, `Services/`, `wwwroot/`)
