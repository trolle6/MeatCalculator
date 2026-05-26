# GitHub Pages deploy

The site at **https://trolle6.github.io/SmokeLab/** is published by the **Deploy GitHub Pages** workflow on every push to `main`.

## One-time repo setting (required)

1. Open **Settings → Pages**
2. Under **Build and deployment → Source**, choose **GitHub Actions** (not “Deploy from branch”).

If Source stays on the `gh-pages` branch, pushes to `main` may not update what you see on the live URL.

## Check that a deploy ran

1. **Actions** → **Deploy GitHub Pages** → latest run should be green.
2. **Deployments** (or Environments → **github-pages**) should show a new deployment after each push.
3. On the live site: **View page source** → search for `smoke-lab-build` — should match the number in `index.html` on `main` (e.g. `53`).

## Manual redeploy

**Actions → Deploy GitHub Pages → Run workflow** (workflow_dispatch).
