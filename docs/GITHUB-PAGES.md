# GitHub Pages deploy

The site at **https://trolle6.github.io/SmokeLab/** is built from `main` and published to the **`gh-pages`** branch by the **Deploy GitHub Pages** workflow.

## Pages source (what you should have)

In **Settings → Pages → Build and deployment → Source**, use:

- **Deploy from a branch**
- Branch: **`gh-pages`** / **`/ (root)`**

That matches how this repo publishes today. You do **not** need “GitHub Actions” as the Pages source unless we switch deploy methods again.

## Why the live site can look “stuck”

| What you see | Meaning |
|--------------|---------|
| View source has `app.css?v=50` | Live site is old; `gh-pages` was not updated after the last successful deploy. |
| `main` on GitHub has `smoke-lab-build` **54** | Code is fine; deploy did not run or did not finish. |
| No new run under **Actions → Deploy GitHub Pages** after your push | Workflow did not start — see below. |

Last known good deploy to the public URL was tied to commit `dc0cd9e` (build **50**). Several pushes on **2026-05-26** never started a workflow run, so `gh-pages` never received badge, wider time boxes, etc.

## If Actions are not running

1. **Actions** tab → **Deploy GitHub Pages** — any run **waiting for approval**? Approve it.
2. **Settings → Actions → General** — “Allow all actions and reusable workflows”.
3. **Settings → Actions → General → Workflow permissions** — **Read and write permissions**.
4. **Settings → Actions → General** — if “Require approval for all outside collaborators” is on, approve runs for recent pushes.
5. Manually: **Actions → Deploy GitHub Pages → Run workflow** → branch `main` → **Run workflow**.

## Check that a deploy worked

1. Latest **Deploy GitHub Pages** run is green (takes a few minutes).
2. **View page source** on the live site → `smoke-lab-build` should match `main` (currently **54**).
3. Optional: https://raw.githubusercontent.com/trolle6/SmokeLab/gh-pages/index.html should show the same build number.

## Manual redeploy

**Actions → Deploy GitHub Pages → Run workflow** (workflow_dispatch).
