# GitHub Pages — match localhost:5180

The public site must serve the **built** app from `meat calculator/wwwroot` (same as `dotnet run` on port 5180).

## Settings (do this once)

**Settings → Actions → General**

- Allow all actions
- Workflow permissions: **Read and write**

**Settings → Pages → Build and deployment**

Pick **one** source (both are kept in sync by CI):

| Option | Source | Branch | Folder |
|--------|--------|--------|--------|
| **A** | Deploy from a branch | `main` | **`/docs`** |
| **B** | Deploy from a branch | `gh-pages` | `/ (root)` |
| **C** | **GitHub Actions** | (workflow deploys artifact) | — |

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

Then **Settings → Pages → Save** again.

## Local preview

```powershell
cd "meat calculator"
dotnet run
```

Open http://localhost:5180/ — simple planner (same as github.io).  
Full app: http://localhost:5180/?full=1
