# GitHub Pages deploy

The site at **https://trolle6.github.io/SmokeLab/** is built from `main` and published to the **`gh-pages`** branch by the **Deploy GitHub Pages** workflow (or `scripts/publish-gh-pages.ps1`).

## Pages source

In **Settings → Pages → Build and deployment → Source**:

- **Deploy from a branch**
- Branch: **`gh-pages`** / **`/ (root)`**

Click **Save** even if it already looks correct — that forces GitHub to rebuild the CDN from the latest `gh-pages` commit.

You do **not** need “GitHub Actions” as the Pages source for this repo.

## Emergency publish (Actions not running)

```powershell
powershell -ExecutionPolicy Bypass -File scripts/publish-gh-pages.ps1
```

Then **Settings → Pages → Save** again.

## Why the live site can look “stuck”

| What you see | Meaning |
|--------------|---------|
| View source has `app.css?v=50` | CDN still serving the last Pages build (May 25). |
| [gh-pages `index.html`](https://raw.githubusercontent.com/trolle6/SmokeLab/gh-pages/index.html) has build **55** | Files are uploaded; GitHub has not rebuilt Pages yet. |
| No new run under **Actions** after a push | Workflows are disabled, blocked, or need approval. |

## If Actions are not running

1. **Actions** → **Deploy GitHub Pages** — approve any run **waiting for approval**.
2. **Settings → Actions → General** — allow all actions; workflow permissions **Read and write**.
3. **Actions → Deploy GitHub Pages → Run workflow** on `main`.
4. **Settings → Pages → Save** (rebuild from `gh-pages`).

## Check that it worked

1. **View page source** on the live site → `smoke-lab-build` should be **55** (or whatever is on `main`).
2. Search for `brand-home` and `pullTempBadge` in the source.
