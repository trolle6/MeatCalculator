# Post-launch feedback log

Use this while waiting on Discord / GitHub comments. **Do not chase one-off nits** — look for themes.

## Wait period (3–7 days after share)

- [ ] Shared link pinned with: Probe → Hold → Plan; Copy link; Reference = read-only
- [ ] Checked Steve’s Discord for reactions
- [ ] Checked [GitHub Issues](https://github.com/trolle6/SmokeLab/issues)

## Theme tracker

| Theme | Count | Example quote | Action |
|-------|-------|---------------|--------|
| Hold hours feel wrong | 1 | Steve: 195→150 should be ~18 hr; showed 12.5 | Fixed: total box time + juicy carry cap (shipped) |
| **Too much UI / wrong job** | 1 | Steve: heavy on features; core Q is pull X → hold hours at Y, serve time | **Steve flow** — see below |
| Share link / cache | | | |
| Navigation / UX | | | |
| Want another cut (pork, etc.) | | | |
| Praise / no change needed | | | |

## Steve (Smoke Trails) — direction (2026)

**The one question:** “If I pull at **X**, how many hours at **what hold temp**?”

**Example output he wants (in cook plan):**

- 18 hr at **150°F** → serve **4 PM**
- 15 hr at **160°F** → serve **1 PM**
- (more rows for common cambro temps)

**Agrees:** app feels **too much information** — gauge, science, rest sim, recipes, breakdowns, multiple tabs.

**Live on GitHub Pages:** `site-simple` mode (default). One screen: pull °F → slice time → hold table. Add `?full=1` for full planner. No external time API — browser local clock. FireBoard-style probe APIs = future only.

**Proposed product shape (now default on Pages):**

1. **Pull temp in** (e.g. 195) — one field, from Probe or Plan.
2. **Hold options table** — model runs `/api/hold` for each standard hold (150 / 160 / 170 / 140 °F); optional slice time → pit start + serve line per row.
3. **Pick one row** → short cook plan (checklist only).
4. **Everything else** → “Learn / geek mode” (collapsed or separate path).

**Quick win (Phase A):** add hold-options table to Plan without removing tabs — validates math + copy with Steve.

**Bigger win (Phase B):** default landing = Steve flow only; current app behind “Full planner”.

## When to build next

Only ship a new feature when you can finish:

> **Three people asked for the same thing** — OR — **I used it on my own brisket and ______ was annoying.**

Until then, Smoke Lab is **done enough** for v1.

## Discord reply snippets

- **Official Smoke Trails?** — Community planner inspired by public teaching; not affiliated with Steve Gow or the channel.
- **Hold hours long/short?** — Compare Juicy vs Hotter; calibrate to your cambro; probe + feel win.
- **Share link broken?** — Hard-refresh; full URL must include `?pull=…&hold=…`.
- **°F in input boxes?** — Inputs stay °C; hero and results show both units.
