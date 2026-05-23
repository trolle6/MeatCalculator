# Smoke Lab (Meat Calculator)

Brisket learning app: collagen rendering, pull-and-hold planning, yield, and a printable cook plan. Built with **ASP.NET Core 8** and a static UI in `meat calculator/wwwroot/`.

## Run locally (full API)

```bash
cd "meat calculator"
dotnet run
```

Open **http://localhost:5180** (or the URL shown in the terminal).

## Live on the web (GitHub Pages)

**https://trolle6.github.io/MeatCalculator/**

GitHub Pages cannot run ASP.NET. On each push to `main`, Actions builds the app, exports `/api/*` to JSON, and pushes a static site to the **`gh-pages`** branch.

### One-time setup (fixes the default GitHub 404)

1. Open **[Settings → Pages](https://github.com/trolle6/MeatCalculator/settings/pages)** for this repo.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. **Branch:** `gh-pages` · **Folder:** `/ (root)` · **Save**.
4. Open **[Actions](https://github.com/trolle6/MeatCalculator/actions)** and confirm **Deploy GitHub Pages** is green (re-run the latest workflow if it failed before this step).
5. Wait 1–2 minutes, then open the site URL above.

Sliders, hold/yield math, and rest projection use **browser fallbacks** on Pages; locally you still get the full server.

## Repo layout

- `meat calculator.sln` — solution
- `meat calculator/` — web project (`Program.cs`, `Models/`, `Services/`, `wwwroot/`)
