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
            "Meat physics & selection",
            "Water · grades · flat inspection",
            [
                new("Raw brisket is ~70% water — stored primarily inside muscle fibres, not in the fat cap."),
                new("Higher marbling (Prime, BMS 5–7+, MSA 400+) lubricates slices but does not replace moisture lost to overcook."),
                new("USDA grade is scored on the ribeye (12th/13th rib), not the brisket. Inspect the flat through the wrap for thin white fat striations; solid red beef is lean regardless of the sticker.", "Inspection rule"),
                new("Pick your regional sticker in Weight — the app maps it to broad bands: low, moderate, high, or extreme / Wagyu-grade. Not exact 1:1 across countries."),
                new("Plan 30–40% cook shrink; even a juicy cook can approach ~43% loss on the scale.")
            ],
            "Yield tab — model trim + moisture + render from start weight."),

        new(
            "stall",
            "Evaporative stall",
            "65.5 – 74 °C internal",
            [
                new("Between 65.5 °C and 74 °C (150–165 °F) the brisket “sweats” — evaporative cooling fights your pit temp."),
                new("Bump pit temperature or airflow to power through; sitting in the stall too long costs moisture."),
                new("“Stall rescue” preset (~76.5 °C pull/hold) is for planning around a stuck cook — not the juicy long-hold finish.")
            ],
            "Dashboard timeline marks the stall band — calculator uses the same temp range."),

        new(
            "rendering-logic",
            "Exponential rendering model",
            "Time × temperature · additive hours",
            [
                new("Collagen → gelatin is exponential: rendering = time multiplied by temperature, not a linear “hours per pound” clock."),
                new("At each steady internal temp, every hour adds that row’s “% rendered per hour” to your running total (see Reference table).", "Additive"),
                new("100% = ideal tenderness in this model. Acceptable slice window: 80–120% total rendering."),
                new("Pull at 90.5 °C (~195 °F) ≈ 40% rendered and probe-tight; finish the remaining ~60% in a 65.5 °C (150 °F) hot box — often ~18 hr."),
                new("Above 93.3 °C (200 °F), fibres denature fast and squeeze moisture like a sponge — why 95 °C (203 °F) on smoke alone is risky.")
            ],
            "Pull planner slider = render built if you pulled now · Hold box finishes the rest."),

        new(
            "prep",
            "Preparation & seasoning",
            "Trim · rub · dry brine",
            [
                new("Aerodynamic trim: remove the “mohawk” flap at an angle so the pack sits flat on the grate."),
                new("Fat cap exactly 0.6 cm (¼ in) — thicker cap stays opaque and unrendered; trim ~1.3 cm (½ in) from sides to read the cap."),
                new("Half-moon cut: one continuous curved slice to round the thin flat end — stops corner “jerky”."),
                new("Dry brine with table salt first for deeper penetration; coarse pepper/kosher on top for bark."),
                new("Sumac (ground Middle Eastern berry) in the rub gives dark, tangy bark without coffee-bitter notes.", "Optional"),
                new("Plastic wrap overnight in the fridge — blocks the fan from drying the surface while salt brines under a moist film.")
            ]),

        new(
            "equipment",
            "Equipment & fire management",
            "Offsets · pellets · airflow",
            [
                new("Fire basket: hotter, cleaner coal bed with less babysitting on long cooks."),
                new("Offset smokers: mostly convective heat (air moves top-down). Pellet grills: more radiant from below.", "Heat types"),
                new("On pellets, use the top rack with a water pan below to blunt radiant heat on the flat."),
                new("Stack dropped to grate level helps even chamber temperature left-to-right."),
                new("Stack extension pulls more oxygen through the fire for a cleaner burn and steadier draft.")
            ]),

        new(
            "smoke-fire",
            "Smoke, ring & surface chemistry",
            "Myths vs what still happens on the pit",
            [
                new("60 °C (140 °F) smoke myth busted: brisket keeps taking on smoke flavour well past 140 °F — the ring is not the flavour stop."),
                new("Smoke ring can continue forming up to ~76.5 °C (170 °F) on a wet, airflow-friendly surface."),
                new("Wetter bark (spritz, humidity) grabs more smoke and often a wider ring — not a substitute for good fire."),
                new("Temperature = molecular motion; heat = energy transfer into the meat — both matter for bark and render.")
            ]),

        new(
            "troubleshooting",
            "Probing, carry-over & food safety",
            "Before you trust the dial",
            [
                new("Learn landmark probe feel from ~82 °C (180 °F): glide-in “room-temp butter” on the flat — not mush, not cold push-back."),
                new("Covered water-pan test on the oven’s lowest setting — residential dials often read 15+ °F high.", "Calibration"),
                new("Pulled hot at 95 °C (203 °F)? Counter-rest ~2 hr until internal slides toward ~65 °C before cambro hold — otherwise carry-over turns it mush.", "Carry-over"),
                new("Food-safe pasteurisation from ~55 °C (131 °F); for long hot holds use 60–65.5 °C so tenderization stays slow and safe.", "Hold safety")
            ],
            "Rest & carry-over tab — hour-by-hour temp and extra render %."),

        new(
            "holding-methods",
            "Advanced cook methods",
            "Foil boat · long hold · confit · reverse",
            [
                new("Foil boat (beginner): 121–135 °C (250–275 °F) smoke 4–5 hr until bark is dry and firm → open foil boat → pit 149 °C (300 °F) — bottom braises, fat cap renders on top.", "Reliable"),
                new("Undercook & long hold: pull 90.5 °C (~40% rendered, tight probe) → straight into 65.5 °C × ~18 hr; ~4 hr cool-down from 90.5 → 65.5 °C finishes most of the remaining render without 93 °C+ squeeze-out.", "Pitmaster"),
                new("Brisket confit: smoke to ~74 °C → submerge in 68.3 °C (155 °F) tallow (sous-vide) × 18 hr — prime-rib-like texture."),
                new("Reverse smoke: butcher paper on first → 88 °C → refrigerate → reheat on smoker at 121 °C until ~65.5 °C internal — juicier, less total smoke.")
            ],
            "Techniques tab — numbered step lists for each method.")
    ];
}
