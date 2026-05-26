# GitHub Pages deploy

Live URL: **https://trolle6.github.io/SmokeLab/**

## 1. Enable Actions (required)

**Settings → Actions → General**

- Allow all actions
- Workflow permissions: **Read and write**

Without Actions, the CDN can stay on an old build for days.

## 2. Pages source

**Settings → Pages → Deploy from a branch** (not “GitHub Actions”).

Pick **one**:

| Setting | Branch | Folder |
|---------|--------|--------|
| **A** (default) | `gh-pages` | `/ (root)` |
| **B** (if you use `main`) | `main` | **`/docs`** |

Do **not** use `main` + `/ (root)` — that folder is source code, not the website.

Click **Save** after any change.

## 3. Republish

```powershell
powershell -ExecutionPolicy Bypass -File scripts/publish-gh-pages.ps1
```

Updates `gh-pages`, `docs/` on `main`, then **Settings → Pages → Save** again.

## 4. Verify

View source on the live site:

- `smoke-lab-build` **56** (not 50)
- `brand-home`, `pullTempBadge`
