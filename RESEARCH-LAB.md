# Private research lab (GitHub Pages)

## URLs

| What | URL |
|------|-----|
| Public brisket planner | https://trolle6.github.io/SmokeLab/ |
| Full app (no gate, anyone with link) | https://trolle6.github.io/SmokeLab/?full=1 |
| **Research lab (passphrase)** | https://trolle6.github.io/SmokeLab/research/ |

Default passphrase: **`smokelab`** (change before you rely on it).

## What you get in the lab

- Same **public-style** planner UI (Pull / Serve / Hold tabs) — not the old full dashboard
- **Two thermometer rows**: category (Smoke & hold · Poultry · Fish) then food type with estimated target temps
- Tapping a food sets pull/hold starting points; **brisket** uses the real hold model, others are reference until built

## Privacy (read this)

GitHub Pages on a **public** repo is never truly private:

- `noindex` + no links from the public site only hide it from casual visitors
- The passphrase is checked in the browser; the full app files are still downloadable
- For real privacy: **private repository** + GitHub Pages visibility, or run locally:

```powershell
cd "meat calculator"
dotnet run
```

Open http://localhost:5247/?lab=1 (skip gate on localhost if you set session once, or use `?full=1`).

## Change your passphrase

1. Pick a new secret phrase.
2. Hash it:

```powershell
node -e "const c=require('crypto'); console.log(c.createHash('sha256').update('YOUR PHRASE HERE').digest('hex'));"
```

3. Paste the hex into `meat calculator/wwwroot/research/gate.js` as `GATE_HASH`.
4. Commit and push (wwwroot change triggers deploy).

## Adding more meats later

The app model (`BrisketEngine`, hold presets, collagen tables) is brisket-only. New proteins need backend data + UI wiring under `IS_RESEARCH_LAB`, not just labels on the chip bar.
