# Smoke Lab (Meat Calculator)

Brisket learning app: collagen rendering, pull-and-hold planning, yield, and a printable cook plan. Built with **ASP.NET Core 8** and a static UI in `meat calculator/wwwroot/`.

## Run locally (full API)

```bash
cd "meat calculator"
dotnet run
```

Open **http://localhost:5180** (or the URL shown in the terminal).

## Live on the web (GitHub Pages)

Pushes to `main` deploy a **static** copy to GitHub Pages:

**https://trolle6.github.io/MeatCalculator/**

GitHub Pages cannot run ASP.NET. The workflow:

1. Builds the app and snapshots GET `/api/*` responses into JSON files.
2. Publishes `wwwroot` plus those JSON files.

Sliders, hold/yield math, and rest projection use **browser fallbacks** on Pages; locally you still get the full server.

To enable Pages the first time: repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Repo layout

- `meat calculator.sln` — solution
- `meat calculator/` — web project (`Program.cs`, `Models/`, `Services/`, `wwwroot/`)
