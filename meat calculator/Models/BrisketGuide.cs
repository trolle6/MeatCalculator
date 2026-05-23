namespace meat_calculator.Models;

public sealed record GuideItem(string Text, string? Note = null);

public sealed record GuideSection(
    string Id,
    string Title,
    string? Subtitle,
    IReadOnlyList<GuideItem> Items,
    string? Callout = null);

public static class BrisketGuide
{
    public static IReadOnlyList<GuideSection> Sections =>
    [
        new(
            "selection",
            "Core meat science & grading",
            "Water · grades · ribeye myth",
            [
                new("Raw brisket ≈ 70% water — mostly inside muscle fibres."),
                new("Intramuscular fat: Select 2–4% · Choice 4–10% · Prime 8–13% (USDA reference)."),
                new("Grade is scored on the ribeye (12th/13th rib), not the brisket — inspect the flat for white striations through the wrap.", "Grading myth"),
                new("Fettklass 2 / 3–4 / 4–5 maps roughly to those bands."),
                new("Cook loss: plan 30–40%; even juicy brisket can hit ~43%.")
            ],
            "Yield tab — shrink from start weight."),

        new(
            "rendering-logic",
            "Rendering model (for the calculator)",
            "Exponential · additive hours · done window",
            [
                new("Collagen → gelatin via hydrolysis — exponential, not linear (full table in Reference)."),
                new("Each hour at a steady internal temp adds that row’s “% per hour” to your running total.", "Additive"),
                new("Ideal texture window: 80–120% total rendering. Target ~100%."),
                new("Pull & Hold + Rest tabs sum carry-over and hold time using the same rates.")
            ],
            "Dashboard slider = “if pulled now” · not slice-ready until the green zone."),

        new(
            "prep",
            "Prep & seasoning",
            "Trim · binder · dry brine",
            [
                new("Aerodynamic trim: ~1.3 cm (½ in) off sides to read fat cap; mohawk off at an angle for a flat sit."),
                new("Fat cap: 0.6 cm (¼ in). Half-moon the thin flat end so corners don’t jerky."),
                new("Binder spritz: 50/50 soy + water — liquid salt, immediate brine."),
                new("Table salt first, then coarse pepper / kosher for bark; sumac optional for dark tangy bark."),
                new("Plastic wrap overnight — fridge fan won’t dry the surface; salt pulls in under a moist film.")
            ]),

        new(
            "smoke-fire",
            "Smoke & fire management",
            "Ring · moisture · heat types",
            [
                new("140 °F myth busted: smoke flavour keeps building; smoke ring can form to 76.5 °C (170 °F)."),
                new("Wetter surface grabs more smoke — spritzing helps flavour and ring."),
                new("Temperature = molecular motion; heat = energy transfer into the meat."),
                new("Pellet grills: more radiant heat from below. Offsets: more convective (airflow).", "Pit types")
            ]),

        new(
            "troubleshooting",
            "Probing · calibration · carry-over",
            "Before you trust the dial",
            [
                new("Landmark probe feel from 82 °C (180 °F) upward — learn “room-temp butter” slide-in."),
                new("Covered water-pan test on oven’s lowest setting — residential dials lie."),
                new("Pulled hot at 95 °C (203 °F)? Counter-rest ~2 hr until ~65 °C before cambro/cooler hold — avoids overcook.", "Carry-over")
            ],
            "Rest & carry-over tab — “where it rests” hour-by-hour."),

        new(
            "holding-methods",
            "Brisket cook methods (summary)",
            "Foil boat · long hold · confit · reverse",
            [
                new("Foil boat: 121–135 °C → boat @ 4–5 hr → 149 °C → finish ~95–96 °C.", "Beginner"),
                new("Long hold: pull 90.5 °C (~40% rendered) → 65.5 °C × ~18 hr; 4 hr cool-down finishes ~60%.", "Juicy"),
                new("Confit: smoke 74 °C → tallow 68.3 °C × 18 hr — prime-rib-like."),
                new("Reverse smoke: paper on first → 88 °C → chill → reheat 121 °C until ~65.5 °C internal.")
            ],
            "Recipes tab — full step lists."),

        new(
            "pork-loin",
            "Pork loin (from your smoke log)",
            "Hot smoke · wrap finish · not brisket math",
            [
                new("Prep: defrost in water bath; glaze with soy, mustard, vegetable fond."),
                new("Fuel note: birch + Josper charcoal (log — charcoal ran out fast)."),
                new("Cook: very hot smoke ~215 °C ambient; target internal 63 °C (log hit ~62 °C)."),
                new("Final 10–15 min wrapped in butcher paper."),
                new("Takeaway: longer cooks on larger cuts build more bark and deeper smoke — pork loin is fast.", "Reflection")
            ],
            "Brisket collagen calculator does not apply to pork — use probe + food-safe temps only.")
    ];
}
