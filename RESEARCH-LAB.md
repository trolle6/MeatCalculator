# Private research lab (GitHub Pages)

## URLs

| What | URL |
|------|-----|
| Public brisket planner | https://trolle6.github.io/SmokeLab/ |
| **Research lab** | https://trolle6.github.io/SmokeLab/research/ or `?lab=1` |
| Legacy full dashboard | https://trolle6.github.io/SmokeLab/?full=1 |

On the public site, a small **Research lab** link sits at the very bottom of the footer (no passphrase).

## What you get in the lab

- Same **public-style** planner UI (Pull / Serve / Hold tabs) — not the old full dashboard
- **Two thermometer rows**: category (Smoke & hold · Poultry · Fish) then food type with estimated target temps
- Tapping a food sets pull/hold starting points; **brisket** uses the real hold model, others are reference until built

## Privacy (read this)

This is **unlisted**, not locked down: anyone who scrolls to the footer or guesses `/research/` can open it. For real privacy use a private repo or run locally:

```powershell
cd "meat calculator"
dotnet run
```

Open http://localhost:5247/?lab=1

## Adding more meats later

The app model (`BrisketEngine`, hold presets, collagen tables) is brisket-only. New proteins need backend data + UI wiring under `IS_RESEARCH_LAB`, not just labels on the chip bar.
