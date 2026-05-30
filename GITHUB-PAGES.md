# GitHub Pages ? match local `dotnet run`

The public site must serve the **built** app from `meat calculator/wwwroot` (same as `dotnet run` on the dev URL in `launchSettings.json`, currently **5247**).

## Settings (do this once)

**Settings ? Actions ? General**

- Allow all actions
- Workflow permissions: **Read and write**

**Settings ? Pages ? Build and deployment**

Pick **one** source (CI keeps `main` → `/docs` in sync for option A):

| Option | Source | Branch | Folder |
|--------|--------|--------|--------|
| **A** | Deploy from a branch | `main` | **`/docs`** |
| **B** | Deploy from a branch | `gh-pages` | `/ (root)` (manual script only — workflow does **not** push here) |
| **C** | **GitHub Actions** (recommended) | workflow `Deploy GitHub Pages` | artifact from `_site` |

Use **C** or **A**, not both C and B. If you see a red **pages build and deployment** on `gh-pages` while **Deploy GitHub Pages** is green, switch Pages source to **GitHub Actions** (or `main` / `/docs`) and Save.

Click **Save** after any change.

## Verify live site

View source on https://trolle6.github.io/SmokeLab/

- `smoke-lab-build` should match `wwwroot/index.html` (e.g. **57**)
- `brand-home`, `pullTempBadge` present
- Not stuck on `app.css?v=50`

## Manual publish from your PC

```powershell
powershell -ExecutionPolicy Bypass -File scripts/publish-gh-pages.ps1
```

Then **Settings ? Pages ? Save** again.

## Local preview

```powershell
cd "meat calculator"
dotnet run
```

Open http://localhost:5247/ (or http://localhost:5180/) - simple planner (same as github.io).  
Full app: http://localhost:5247/?full=1 (or http://localhost:5180/?full=1)  
Research lab (gated): https://trolle6.github.io/SmokeLab/research/ — see [RESEARCH-LAB.md](RESEARCH-LAB.md)

